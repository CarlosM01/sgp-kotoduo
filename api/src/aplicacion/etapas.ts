// Use cases of flow 3 (HU-01, HU-02; CU-05, CU-06): "Mi Trabajo" and the
// start/finish of a stage by its responsible person; and the stage side of
// flow 4 (HU-09, HU-03; CU-08, CU-09): consumptions on finish and the manual
// shortage report.
import {
  ESTADOS_ORDEN_ACTIVOS,
  puedeTransicionarEtapa,
  puedeTransicionarOrden,
  type EstadoEtapa,
  type EstadoOrden,
} from '../dominio/estados.js';
import { estaBajoMinimo, type Consumo, type NuevaAlerta } from '../dominio/insumos.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion, ErrorVersion } from './errores.js';
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

export interface ConsumoRegistrado {
  insumoId: number;
  codigo: string;
  cantidad: number;
  stockActual: number;
  bajoMinimo: boolean;
}

export interface EtapaTerminada {
  etapaId: string;
  estado: 'TERMINADA';
  version: number;
  siguienteEtapa: string | null;
  area: string | null;
  ordenTerminada: boolean;
  /** In the order they were sent. */
  consumos: ConsumoRegistrado[];
  /** Automatic alerts opened by these consumptions (CP-14). */
  alertas: { id: number; insumoId: number; codigo: string }[];
}

export interface AlertaReportada {
  id: number;
  insumoId: number;
  etapaId: string;
  origen: 'MANUAL';
  estado: 'ABIERTA';
  creadaEn: string;
}

export interface ServicioEtapas {
  miTrabajo(actor: Actor): Promise<MiTrabajo>;
  iniciar(actor: Actor, etapaId: string, version: number, ctx: Contexto): Promise<EtapaIniciada>;
  terminar(actor: Actor, etapaId: string, version: number, consumos: Consumo[], ctx: Contexto): Promise<EtapaTerminada>;
  /** CP-15, D24: only the stage's responsible person reports, from an open stage of an active order. */
  reportarFaltante(actor: Actor, alerta: NuevaAlerta, ctx: Contexto): Promise<AlertaReportada>;
}

/** Stage states from which a shortage can be reported (D24): reached and not closed. */
const ESTADOS_REPORTE: readonly EstadoEtapa[] = ['DISPONIBLE', 'EN_CURSO', 'BLOQUEADA'];

type EventoSinActor = Omit<NuevoEvento, 'actor' | 'contexto'>;

interface Dependencias {
  etapas: EtapaRepositorio;
  auditoria: Auditoria;
}

type Resultado<T> = { tipo: 'ok'; valor: T; eventos: EventoSinActor[] } | { tipo: 'ajena'; ordenId: string };

export function crearServicioEtapas({ etapas, auditoria }: Dependencias): ServicioEtapas {
  /**
   * Ownership protocol of every action on a stage. Table 7.1 "Avanzar etapas"
   * is ◐ for every role: only the assigned person acts on a stage (D19, D24).
   * A stage of someone else answers 404 like a missing one, so its existence
   * is not revealed, and the attempt is logged (AM-05, CP-27). The audit
   * events are written after the transaction commits.
   */
  async function conEtapaPropia<T>(
    actor: Actor,
    etapaId: string,
    ctx: Contexto,
    ruta: string,
    trabajo: (tx: TransaccionEtapa) => Promise<{ valor: T; eventos: EventoSinActor[] }>,
  ): Promise<T> {
    const r = await etapas.enTransaccion<Resultado<T>>(etapaId, async (tx) => {
      if (!tx) throw new ErrorNoEncontrado();
      if (tx.etapa.responsableId !== actor.id) return { tipo: 'ajena', ordenId: tx.etapa.ordenId };
      return { tipo: 'ok', ...(await trabajo(tx)) };
    });

    const actorEvento = { usuarioId: actor.id, roles: actor.roles };
    if (r.tipo === 'ajena') {
      await auditoria.registrar({
        tipo: 'ACCESO_DENEGADO',
        agregado: { tipo: 'etapa_orden', id: etapaId },
        ordenId: r.ordenId,
        actor: actorEvento,
        payload: { metodo: 'POST', ruta, motivo: 'NO_ES_RESPONSABLE' },
        contexto: ctx,
      });
      throw new ErrorNoEncontrado();
    }
    for (const e of r.eventos) await auditoria.registrar({ ...e, actor: actorEvento, contexto: ctx });
    return r.valor;
  }

  /** Shared protocol of start and finish: ownership, optimistic lock (CP-19) and transition rules. */
  function avanzar<T>(
    actor: Actor,
    etapaId: string,
    version: number,
    ctx: Contexto,
    accion: 'iniciar' | 'terminar',
    hacia: EstadoEtapa,
    aplicar: (tx: TransaccionEtapa) => Promise<{ valor: T; eventos: EventoSinActor[] }>,
  ): Promise<T> {
    return conEtapaPropia(actor, etapaId, ctx, `/etapas/{id}/${accion}`, async (tx) => {
      const { etapa } = tx;
      if (etapa.version !== version) throw new ErrorVersion();
      // The DDL trigger lets a stage of a cancelled order start; the API does
      // not: only active orders (not finished, delivered or cancelled) advance.
      if (!ESTADOS_ORDEN_ACTIVOS.includes(etapa.estadoOrden)) {
        throw new ErrorConflicto(`La orden está ${etapa.estadoOrden}: no se puede avanzar la etapa`);
      }
      if (!puedeTransicionarEtapa(etapa.estado, hacia, etapa.estadoOrden)) {
        throw new ErrorConflicto(mensajeTransicion(etapa, hacia));
      }
      return aplicar(tx);
    });
  }

  return {
    async miTrabajo(actor) {
      const lista = await etapas.deResponsable(actor.id);
      const siguiente =
        // An order on hold cannot advance, so none of its stages is the next activity.
        lista.find((e) => e.estado === 'EN_CURSO' && e.orden.estado !== 'DETENIDA') ??
        lista.find((e) => e.estado === 'DISPONIBLE' && e.orden.estado !== 'DETENIDA') ??
        null;
      return { siguiente, etapas: lista };
    },

    iniciar(actor, etapaId, version, ctx) {
      return avanzar(actor, etapaId, version, ctx, 'iniciar', 'EN_CURSO', async (tx) => {
        const { etapa } = tx;
        const nueva = await tx.cambiarEstado('EN_CURSO');
        const eventos: EventoSinActor[] = [
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

    terminar(actor, etapaId, version, consumos, ctx) {
      return avanzar(actor, etapaId, version, ctx, 'terminar', 'TERMINADA', async (tx) => {
        const { etapa } = tx;
        // Consumptions first: a refused one (insufficient stock, supply not
        // required) rolls back the whole finish (CP-14).
        const aplicados = await aplicarConsumos(tx, actor, consumos);
        const nueva = await tx.cambiarEstado('TERMINADA');
        const siguiente = await tx.habilitarSiguiente();
        const eventos: EventoSinActor[] = [
          ...aplicados.eventos,
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
            consumos: aplicados.consumos,
            alertas: aplicados.alertas,
          },
          eventos,
        };
      });
    },

    reportarFaltante(actor, alerta, ctx) {
      return conEtapaPropia(actor, alerta.etapaId, ctx, '/alertas', async (tx) => {
        const { etapa } = tx;
        if (!ESTADOS_ORDEN_ACTIVOS.includes(etapa.estadoOrden)) {
          throw new ErrorConflicto(`La orden está ${etapa.estadoOrden}: no se puede reportar un faltante`);
        }
        if (!ESTADOS_REPORTE.includes(etapa.estado)) {
          throw new ErrorConflicto(`La etapa está ${etapa.estado}: no se puede reportar un faltante`);
        }
        const creada = await tx.crearAlertaManual({
          insumoId: alerta.insumoId,
          cantidadFaltante: alerta.cantidadFaltante,
          comentario: alerta.comentario,
          reportadaPor: actor.id,
        });
        if (!creada) {
          throw new ErrorValidacion('Los datos enviados no son válidos', [{ campo: 'insumoId', problema: 'not_found' }]);
        }
        return {
          valor: {
            id: creada.id,
            insumoId: alerta.insumoId,
            etapaId: etapa.id,
            origen: 'MANUAL' as const,
            estado: 'ABIERTA' as const,
            creadaEn: creada.creadaEn,
          },
          eventos: [
            {
              tipo: 'ALERTA_INSUMO_CREADA',
              agregado: { tipo: 'alerta_insumo', id: String(creada.id) },
              ordenId: etapa.ordenId,
              // The free-text comment stays in PostgreSQL; the audit log keeps the facts.
              payload: { insumo: creada.codigo, origen: 'MANUAL', cantidad_faltante: alerta.cantidadFaltante ?? null, etapa: etapa.nombre },
            },
          ],
        };
      });
    },
  };
}

/**
 * Applies the consumptions of a finished stage (D23, D25). Supplies are locked
 * in id order, so two finishes that share supplies never wait on each other in
 * a cycle. Stock is checked before inserting: the CHECK of insumo.stock_actual
 * stays as a backstop, but the user gets a readable 409.
 */
async function aplicarConsumos(
  tx: TransaccionEtapa,
  actor: Actor,
  consumos: Consumo[],
): Promise<{ consumos: ConsumoRegistrado[]; alertas: EtapaTerminada['alertas']; eventos: EventoSinActor[] }> {
  const { etapa } = tx;
  const porInsumo = new Map<number, ConsumoRegistrado>();
  const alertas: EtapaTerminada['alertas'] = [];
  const eventos: EventoSinActor[] = [];
  const ordenados = consumos.map((c, indice) => ({ ...c, indice })).sort((a, b) => a.insumoId - b.insumoId);

  for (const c of ordenados) {
    const insumo = await tx.bloquearInsumoRequerido(c.insumoId);
    if (!insumo) {
      throw new ErrorValidacion('Los datos enviados no son válidos', [
        { campo: `consumos.${c.indice}.insumoId`, problema: 'not_required_by_stage' },
      ]);
    }
    if (insumo.stockActual < c.cantidad) {
      throw new ErrorConflicto(`Stock insuficiente de ${insumo.nombre}: quedan ${insumo.stockActual} ${insumo.unidad}`);
    }
    const aplicado = await tx.registrarConsumo(c.insumoId, c.cantidad, actor.id);
    porInsumo.set(c.insumoId, {
      insumoId: insumo.id,
      codigo: insumo.codigo,
      cantidad: c.cantidad,
      stockActual: aplicado.stockActual,
      bajoMinimo: estaBajoMinimo(aplicado.stockActual, insumo.stockMinimo),
    });
    eventos.push({
      tipo: 'INSUMO_MOVIMIENTO',
      agregado: { tipo: 'insumo', id: String(insumo.id) },
      ordenId: etapa.ordenId,
      payload: { insumo: insumo.codigo, tipo: 'CONSUMO', cantidad: -c.cantidad, stock_resultante: aplicado.stockActual, etapa: etapa.nombre },
    });
    // The trigger opened an alert only if the open one changed (CP-14: at most one).
    if (aplicado.alertaAutomaticaId !== null && aplicado.alertaAutomaticaId !== insumo.alertaAutomaticaId) {
      alertas.push({ id: aplicado.alertaAutomaticaId, insumoId: insumo.id, codigo: insumo.codigo });
      eventos.push({
        tipo: 'ALERTA_INSUMO_CREADA',
        agregado: { tipo: 'alerta_insumo', id: String(aplicado.alertaAutomaticaId) },
        ordenId: etapa.ordenId,
        payload: {
          insumo: insumo.codigo,
          origen: 'AUTOMATICA',
          stock_resultante: aplicado.stockActual,
          stock_minimo: insumo.stockMinimo,
          etapa: etapa.nombre,
        },
      });
    }
  }

  return { consumos: consumos.map((c) => porInsumo.get(c.insumoId)!), alertas, eventos };
}

function eventoOrden(etapa: EtapaBloqueada, desde: EstadoOrden, hacia: EstadoOrden): EventoSinActor {
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
