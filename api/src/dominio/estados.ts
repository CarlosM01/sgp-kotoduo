// State machines of stages and work orders (ES2 Figures A.5 and A.6).
// Same rules as the DDL triggers fn_validar_transicion_etapa and
// fn_validar_transicion_orden: the API checks them first to answer with a
// clear 409, and the database still rejects anything that slips through.

export const ESTADOS_ETAPA = ['PENDIENTE', 'DISPONIBLE', 'EN_CURSO', 'BLOQUEADA', 'TERMINADA', 'OMITIDA'] as const;
export type EstadoEtapa = (typeof ESTADOS_ETAPA)[number];

export const ESTADOS_ORDEN = [
  'REGISTRADA',
  'EN_DISENO',
  'EN_PRODUCCION',
  'DETENIDA',
  'TERMINADA',
  'ENTREGADA',
  'ANULADA',
] as const;
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];

/** Closed stages: they no longer block the order from finishing. */
export const ESTADOS_ETAPA_CERRADOS: readonly EstadoEtapa[] = ['TERMINADA', 'OMITIDA'];

/** Orders that still count for the panel (not finished, delivered or cancelled). */
export const ESTADOS_ORDEN_ACTIVOS: readonly EstadoOrden[] = ['REGISTRADA', 'EN_DISENO', 'EN_PRODUCCION', 'DETENIDA'];

const TRANSICIONES_ETAPA: Readonly<Record<EstadoEtapa, readonly EstadoEtapa[]>> = {
  PENDIENTE: ['DISPONIBLE', 'OMITIDA'],
  DISPONIBLE: ['EN_CURSO', 'OMITIDA'],
  EN_CURSO: ['TERMINADA', 'BLOQUEADA'],
  BLOQUEADA: ['EN_CURSO'],
  TERMINADA: [],
  OMITIDA: [],
};

const TRANSICIONES_ORDEN: Readonly<Record<EstadoOrden, readonly EstadoOrden[]>> = {
  REGISTRADA: ['EN_PRODUCCION', 'ANULADA'],
  EN_DISENO: ['EN_PRODUCCION', 'DETENIDA', 'ANULADA'],
  EN_PRODUCCION: ['DETENIDA', 'TERMINADA', 'ANULADA'],
  DETENIDA: ['EN_DISENO', 'EN_PRODUCCION', 'ANULADA'],
  TERMINADA: ['ENTREGADA'],
  ENTREGADA: [],
  ANULADA: [],
};

export function puedeTransicionarEtapa(desde: EstadoEtapa, hacia: EstadoEtapa, estadoOrden: EstadoOrden): boolean {
  if (desde === hacia) return false;
  // With the order on hold a stage can neither start nor finish.
  if (estadoOrden === 'DETENIDA' && ((desde === 'DISPONIBLE' && hacia === 'EN_CURSO') || (desde === 'EN_CURSO' && hacia === 'TERMINADA'))) {
    return false;
  }
  // Started or blocked stages are only skipped when the order was cancelled.
  if (hacia === 'OMITIDA' && (desde === 'EN_CURSO' || desde === 'BLOQUEADA')) return estadoOrden === 'ANULADA';
  return TRANSICIONES_ETAPA[desde].includes(hacia);
}

export interface ResumenEtapas {
  /** Stages not TERMINADA nor OMITIDA. */
  etapasAbiertas: number;
  etapasBloqueadas: number;
}

export function puedeTransicionarOrden(desde: EstadoOrden, hacia: EstadoOrden, etapas: ResumenEtapas): boolean {
  if (desde === hacia) return false;
  if (hacia === 'TERMINADA' && etapas.etapasAbiertas > 0) return false;
  if (desde === 'DETENIDA' && (hacia === 'EN_DISENO' || hacia === 'EN_PRODUCCION') && etapas.etapasBloqueadas > 0) return false;
  return TRANSICIONES_ORDEN[desde].includes(hacia);
}
