// Use cases of flow 3 (HU-01, HU-02; CU-05, CU-06): "Mi Trabajo" and the
// start/finish of a stage by its responsible person.
import { puedeTransicionarEtapa, puedeTransicionarOrden, type EstadoEtapa, type EstadoOrden } from '../dominio/estados.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorVersion } from './errores.js';
import type {
  Actor,
  Auditoria,
  Contexto,
  EtapaBloqueada,
  EtapaDeTrabajo,
  EtapaRepositorio,
  NuevoEvento,
  TransaccionEtapa,
} from './puertos.js';

export interface MiTrabajo {
  /** The activity to do now: the stage in progress, otherwise the most urgent available one. */
  siguiente: EtapaDeTrabajo | null;
  etapas: EtapaDeTrabajo[];
}

export interface EtapaIniciada {
  etapaId: string;
  estado: 'EN_CURSO';
  version: number;
  estadoOrden: EstadoOrden;
}

export interface EtapaTerminada {
  etapaId: string;
  estado: 'TERMINADA';
  version: number;
  siguienteEtapa: string | null;
  area: string | null;
  ordenTerminada: boolean;
}

export interface ServicioEtapas {
  miTrabajo(actor: Actor): Promise<MiTrabajo>;
  iniciar(actor: Actor, etapaId: string, version: number, ctx: Contexto): Promise<EtapaIniciada>;
  terminar(actor: Actor, etapaId: string, version: number, ctx: Contexto): Promise<EtapaTerminada>;
}

interface Dependencias {
  etapas: EtapaRepositorio;
  auditoria: Auditoria;
}

type Resultado<T> = { tipo: 'ok'; valor: T; eventos: Omit<NuevoEvento, 'actor' | 'contexto'>[] } | { tipo: 'ajena'; ordenId: string };

export function crearServicioEtapas({ etapas, auditoria }: Dependencias): ServicioEtapas {
  /**
   * Shared protocol of start and finish. Table 7.1 "Avanzar etapas" is ◐ for
   * every role: only the assigned person may advance a stage. A stage of
   * someone else answers 404 like a missing one, so its existence is not
   * revealed, and the attempt is logged (AM-05, CP-27).
   */
  async function avanzar<T>(
    actor: Actor,
    etapaId: string,
    version: number,
    ctx: Contexto,
    accion: 'iniciar' | 'terminar',
    hacia: EstadoEtapa,
    aplicar: (tx: TransaccionEtapa) => Promise<{ valor: T; eventos: Omit<NuevoEvento, 'actor' | 'contexto'>[] }>,
  ): Promise<T> {
    const r = await etapas.enTransaccion<Resultado<T>>(etapaId, async (tx) => {
      if (!tx) throw new ErrorNoEncontrado();
      const { etapa } = tx;
      if (etapa.responsableId !== actor.id) return { tipo: 'ajena', ordenId: etapa.ordenId };
      if (etapa.version !== version) throw new ErrorVersion();
      if (!puedeTransicionarEtapa(etapa.estado, hacia, etapa.estadoOrden)) {
        throw new ErrorConflicto(mensajeTransicion(etapa, hacia));
      }
      return { tipo: 'ok', ...(await aplicar(tx)) };
    });

    const actorEvento = { usuarioId: actor.id, roles: actor.roles };
    if (r.tipo === 'ajena') {
      await auditoria.registrar({
        tipo: 'ACCESO_DENEGADO',
        agregado: { tipo: 'etapa_orden', id: etapaId },
        ordenId: r.ordenId,
        actor: actorEvento,
        payload: { metodo: 'POST', ruta: `/etapas/{id}/${accion}`, motivo: 'NO_ES_RESPONSABLE' },
        contexto: ctx,
      });
      throw new ErrorNoEncontrado();
    }
    for (const e of r.eventos) await auditoria.registrar({ ...e, actor: actorEvento, contexto: ctx });
    return r.valor;
  }

  return {
    async miTrabajo(actor) {
      const lista = await etapas.deResponsable(actor.id);
      const siguiente =
        lista.find((e) => e.estado === 'EN_CURSO') ??
        lista.find((e) => e.estado === 'DISPONIBLE' && e.orden.estado !== 'DETENIDA') ??
        null;
      return { siguiente, etapas: lista };
    },

    iniciar(actor, etapaId, version, ctx) {
      return avanzar(actor, etapaId, version, ctx, 'iniciar', 'EN_CURSO', async (tx) => {
        const { etapa } = tx;
        const nueva = await tx.cambiarEstado('EN_CURSO');
        const eventos: Omit<NuevoEvento, 'actor' | 'contexto'>[] = [
          {
            tipo: 'ETAPA_INICIADA',
            agregado: { tipo: 'etapa_orden', id: etapa.id },
            ordenId: etapa.ordenId,
            payload: { etapa: etapa.nombre, secuencia: etapa.secuencia, estado_anterior: etapa.estado, estado_nuevo: 'EN_CURSO' },
          },
        ];
        // The first started stage puts a registered order into production
        // (design approval is outside the MVP, so EN_DISENO is not used).
        let estadoOrden = etapa.estadoOrden;
        if (estadoOrden === 'REGISTRADA') {
          await tx.cambiarEstadoOrden('EN_PRODUCCION');
          eventos.push(eventoOrden(etapa, estadoOrden, 'EN_PRODUCCION'));
          estadoOrden = 'EN_PRODUCCION';
        }
        return { valor: { etapaId: etapa.id, estado: 'EN_CURSO' as const, version: nueva, estadoOrden }, eventos };
      });
    },

    terminar(actor, etapaId, version, ctx) {
      return avanzar(actor, etapaId, version, ctx, 'terminar', 'TERMINADA', async (tx) => {
        const { etapa } = tx;
        const nueva = await tx.cambiarEstado('TERMINADA');
        const siguiente = await tx.habilitarSiguiente();
        const eventos: Omit<NuevoEvento, 'actor' | 'contexto'>[] = [
          {
            tipo: 'ETAPA_TERMINADA',
            agregado: { tipo: 'etapa_orden', id: etapa.id },
            ordenId: etapa.ordenId,
            payload: {
              etapa: etapa.nombre,
              secuencia: etapa.secuencia,
              estado_anterior: etapa.estado,
              estado_nuevo: 'TERMINADA',
              siguiente_etapa: siguiente?.nombre ?? null,
              siguiente_area: siguiente?.area ?? null,
            },
          },
        ];
        // Finishing the last open stage closes the order (CP-13).
        let ordenTerminada = false;
        if (!siguiente) {
          const resumen = await tx.resumenEtapas();
          if (puedeTransicionarOrden(etapa.estadoOrden, 'TERMINADA', resumen)) {
            await tx.cambiarEstadoOrden('TERMINADA');
            eventos.push(eventoOrden(etapa, etapa.estadoOrden, 'TERMINADA'));
            ordenTerminada = true;
          }
        }
        return {
          valor: {
            etapaId: etapa.id,
            estado: 'TERMINADA' as const,
            version: nueva,
            siguienteEtapa: siguiente?.nombre ?? null,
            area: siguiente?.area ?? null,
            ordenTerminada,
          },
          eventos,
        };
      });
    },
  };
}

function eventoOrden(etapa: EtapaBloqueada, desde: EstadoOrden, hacia: EstadoOrden): Omit<NuevoEvento, 'actor' | 'contexto'> {
  return {
    tipo: 'ORDEN_ESTADO_CAMBIADO',
    agregado: { tipo: 'orden_trabajo', id: etapa.ordenId },
    ordenId: etapa.ordenId,
    payload: { estado_anterior: desde, estado_nuevo: hacia, por_etapa: etapa.nombre },
  };
}

function mensajeTransicion(etapa: EtapaBloqueada, hacia: EstadoEtapa): string {
  if (etapa.estadoOrden === 'DETENIDA') return 'La orden está detenida: no se puede avanzar la etapa';
  if (hacia === 'EN_CURSO') return `La etapa no se puede iniciar: está ${etapa.estado}`;
  return `La etapa no se puede terminar: está ${etapa.estado}`;
}
