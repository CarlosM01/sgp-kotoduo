// Use cases of flow 2 (HU-05, HU-07 read only, HU-08 partial; CU-04, CU-12)
// and the supervision panel of flow 3 (HU-10; CU-10).
import { calcularFechaEstimada, fechaLocal } from '../dominio/calendario.js';
import type { NuevaOrden } from '../dominio/nueva-orden.js';
import { tienePermiso } from '../dominio/permisos.js';
import { generarEtapas } from '../dominio/plantilla.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion, ErrorVersion } from './errores.js';
import type {
  Actor,
  Auditoria,
  Contexto,
  EtapaRepositorio,
  FilaPanel,
  FiltroOrdenes,
  FiltroPanel,
  OrdenDetalle,
  OrdenRepositorio,
  OrdenResumen,
  Pagina,
  ResumenPanel,
  TipoTrabajoVista,
  UsuarioRepositorio,
} from './puertos.js';

export interface OrdenCreada {
  id: string;
  codigo: string;
  estado: 'REGISTRADA';
  fechaEstimadaTermino: string;
  etapas: number;
}

export interface Asignacion {
  etapaId: string;
  responsableId: string;
  version: number;
}

export interface ServicioOrdenes {
  plantillas(): Promise<TipoTrabajoVista[]>;
  crear(actor: Actor, datos: NuevaOrden, ctx: Contexto): Promise<OrdenCreada>;
  listar(filtro: FiltroOrdenes): Promise<Pagina<OrdenResumen>>;
  obtener(id: string): Promise<OrdenDetalle>;
  asignarResponsable(
    actor: Actor,
    etapaId: string,
    datos: { responsableId: string; version: number },
    ctx: Contexto,
  ): Promise<Asignacion>;
  panel(filtro: { filtro: FiltroPanel; q?: string | undefined; pagina: number; tamano: number }): Promise<Pagina<FilaPanel> & { resumen: ResumenPanel }>;
}

interface Dependencias {
  ordenes: OrdenRepositorio;
  etapas: EtapaRepositorio;
  usuarios: UsuarioRepositorio;
  auditoria: Auditoria;
  ahora?: () => Date;
}

const actorDeEvento = (a: Actor) => ({ usuarioId: a.id, roles: a.roles });

export function crearServicioOrdenes({ ordenes, etapas, usuarios, auditoria, ahora = () => new Date() }: Dependencias): ServicioOrdenes {
  return {
    plantillas: () => ordenes.listarPlantillas(),

    async crear(actor, datos, ctx) {
      const hoy = fechaLocal(ahora());
      if (datos.fechaCompromiso < hoy) {
        throw new ErrorValidacion('La fecha comprometida no puede ser anterior a hoy', [
          { campo: 'fechaCompromiso', problema: 'too_small' },
        ]);
      }
      const plantilla = await ordenes.plantillaDe(datos.tipoTrabajoId);
      if (!plantilla?.length) {
        throw new ErrorValidacion('El tipo de trabajo no existe o no tiene plantilla', [
          { campo: 'tipoTrabajoId', problema: 'invalid_value' },
        ]);
      }

      const etapasGeneradas = generarEtapas(plantilla, datos.cantidad);
      const horasTotales = etapasGeneradas.reduce((t, e) => t + e.duracionEstimadaHoras, 0);
      const fechaEstimadaTermino = calcularFechaEstimada({ fechaRegistro: hoy, horasTotales });
      const { id, codigo } = await ordenes.crear({
        datos,
        etapas: etapasGeneradas,
        fechaEstimadaTermino,
        creadoPor: actor.id,
        anio: Number(hoy.slice(0, 4)),
      });

      await auditoria.registrar({
        tipo: 'ORDEN_REGISTRADA',
        agregado: { tipo: 'orden_trabajo', id },
        ordenId: id,
        actor: actorDeEvento(actor),
        payload: {
          codigo,
          tipo_trabajo_id: datos.tipoTrabajoId,
          cantidad: datos.cantidad,
          etapas: etapasGeneradas.length,
          fecha_compromiso: datos.fechaCompromiso,
          fecha_estimada_termino: fechaEstimadaTermino,
        },
        contexto: ctx,
      });

      return { id, codigo, estado: 'REGISTRADA', fechaEstimadaTermino, etapas: etapasGeneradas.length };
    },

    async listar(filtro) {
      const { datos, total } = await ordenes.listar(filtro);
      return { datos, total, pagina: filtro.pagina, tamano: filtro.tamano };
    },

    async obtener(id) {
      const orden = await ordenes.obtener(id);
      if (!orden) throw new ErrorNoEncontrado();
      return orden;
    },

    async asignarResponsable(actor, etapaId, { responsableId, version }, ctx) {
      // The assignee must be an active user allowed to advance stages (Table 7.1).
      const responsable = await usuarios.buscarPorId(responsableId);
      if (!responsable?.activo || !tienePermiso(responsable.roles, 'etapas.avanzar')) {
        throw new ErrorValidacion('El responsable no existe, está inactivo o no puede avanzar etapas', [
          { campo: 'responsableId', problema: 'invalid_value' },
        ]);
      }

      const r = await etapas.enTransaccion(etapaId, async (tx) => {
        if (!tx) throw new ErrorNoEncontrado();
        const { etapa } = tx;
        if (etapa.estado === 'TERMINADA' || etapa.estado === 'OMITIDA') {
          throw new ErrorConflicto('La etapa ya está cerrada');
        }
        if (['TERMINADA', 'ENTREGADA', 'ANULADA'].includes(etapa.estadoOrden)) {
          throw new ErrorConflicto('La orden ya está cerrada');
        }
        if (etapa.version !== version) throw new ErrorVersion();
        const nueva = await tx.asignarResponsable(responsableId);
        return { etapa, version: nueva };
      });

      await auditoria.registrar({
        tipo: 'ETAPA_ASIGNADA',
        agregado: { tipo: 'etapa_orden', id: etapaId },
        ordenId: r.etapa.ordenId,
        actor: actorDeEvento(actor),
        payload: { etapa: r.etapa.nombre, responsable_anterior: r.etapa.responsableId, responsable_nuevo: responsableId },
        contexto: ctx,
      });
      return { etapaId, responsableId, version: r.version };
    },

    async panel(filtro) {
      const [{ datos, total }, resumen] = await Promise.all([ordenes.panel(filtro), ordenes.resumenPanel()]);
      return { datos, total, pagina: filtro.pagina, tamano: filtro.tamano, resumen };
    },
  };
}
