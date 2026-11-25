// Ports used by the use cases. Infrastructure (PostgreSQL, MongoDB, Argon2,
// JWT) implements them; tests can replace them with in-memory fakes.
import type { EstadoEtapa, EstadoOrden, ResumenEtapas } from '../dominio/estados.js';
import type { NuevaOrden, Prioridad } from '../dominio/nueva-orden.js';
import type { CodigoRol } from '../dominio/permisos.js';
import type { EtapaGenerada, PlantillaEtapa } from '../dominio/plantilla.js';

/** Authenticated identity, always taken from the verified token, never from the request body. */
export interface Actor {
  id: string;
  roles: CodigoRol[];
  debeCambiarClave: boolean;
}

/** Request metadata recorded in the audit log. */
export interface Contexto {
  ip?: string | undefined;
  requestId?: string | undefined;
}

export interface UsuarioAuth {
  id: string;
  nombreUsuario: string;
  nombreCompleto: string;
  passwordHash: string;
  activo: boolean;
  debeCambiarClave: boolean;
  roles: CodigoRol[];
}

/**
 * Lockout protocol (CP-29), safe under concurrent requests:
 * 1. `reservarIntento` counts the attempt BEFORE the password is checked and
 *    refuses it while the account is locked or `maxIntentos` attempts are
 *    already counted (failed or still in progress).
 * 2. After the check, `registrarFallo` keeps the attempt counted and locks the
 *    account when the count reached `maxIntentos`; `registrarAccesoExitoso`
 *    releases the count, but only if the account was not locked meanwhile.
 */
export interface UsuarioRepositorio {
  buscarPorNombre(nombreUsuario: string): Promise<UsuarioAuth | null>;
  buscarPorId(id: string): Promise<UsuarioAuth | null>;
  reservarIntento(id: string, maxIntentos: number): Promise<boolean>;
  /** Returns whether this failure locked the account for `minutosBloqueo`. */
  registrarFallo(id: string, maxIntentos: number, minutosBloqueo: number): Promise<{ bloqueada: boolean }>;
  /** Returns false (and changes nothing) when the account is locked. */
  registrarAccesoExitoso(id: string): Promise<boolean>;
  /** Stores the new hash and clears debe_cambiar_clave. */
  actualizarClave(id: string, passwordHash: string): Promise<void>;
  /** Active users holding at least one of `roles`, by full name (D26). */
  listarActivosConRoles(roles: readonly CodigoRol[]): Promise<Responsable[]>;
}

/** Person who can be assigned to a stage (D26): no credentials, no contact data. */
export interface Responsable {
  id: string;
  nombreCompleto: string;
  roles: CodigoRol[];
}

export interface Hasher {
  hash(clave: string): Promise<string>;
  verificar(hash: string, clave: string): Promise<boolean>;
}

export interface TokenEmitido {
  token: string;
  expiraEn: Date;
}

export interface ServicioTokens {
  emitir(actor: Actor): Promise<TokenEmitido>;
  /** Throws ErrorNoAutenticado when the token is invalid, expired or malformed. */
  verificar(token: string): Promise<Actor>;
}

export const TIPOS_EVENTO = [
  'LOGIN_EXITOSO',
  'LOGIN_FALLIDO',
  'CUENTA_BLOQUEADA',
  'CLAVE_CAMBIADA',
  'ACCESO_DENEGADO',
  'ORDEN_REGISTRADA',
  'ORDEN_ESTADO_CAMBIADO',
  'ETAPA_ASIGNADA',
  'ETAPA_INICIADA',
  'ETAPA_TERMINADA',
  'INSUMO_MOVIMIENTO',
  'ALERTA_INSUMO_CREADA',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export type TipoAgregado = 'orden_trabajo' | 'etapa_orden' | 'insumo' | 'alerta_insumo' | 'usuario';

export interface NuevoEvento {
  tipo: TipoEvento;
  agregado: { tipo: TipoAgregado; id: string };
  ordenId?: string | null;
  actor: { usuarioId: string | null; roles: CodigoRol[] };
  payload: Record<string, unknown>;
  contexto: Contexto;
}

export interface EventoBitacora {
  id: string;
  ts: Date;
  tipo: string;
  agregado: { tipo: string; id: string };
  ordenId: string | null;
  actor: { usuarioId: string | null; roles: string[]; ip?: string };
  payload: Record<string, unknown>;
  requestId?: string;
}

export interface FiltroBitacora {
  ordenId?: string | undefined;
  limite: number;
}

export interface Auditoria {
  /** Best effort: an audit failure is logged but never breaks the user's action. */
  registrar(evento: NuevoEvento): Promise<void>;
  listar(filtro: FiltroBitacora): Promise<EventoBitacora[]>;
}

// ---------------------------------------------------------------------------
// Flows 2 and 3: work orders, stages and panel (F3).
// Dates are calendar dates 'YYYY-MM-DD'; instants are ISO strings.

export interface EtapaPlantillaVista extends PlantillaEtapa {
  area: string;
}

export interface TipoTrabajoVista {
  id: number;
  nombre: string;
  descripcion: string | null;
  horasTotales: number;
  etapas: EtapaPlantillaVista[];
}

export interface OrdenAPersistir {
  datos: NuevaOrden;
  etapas: EtapaGenerada[];
  fechaEstimadaTermino: string;
  creadoPor: string;
  /** Year of the code OT-AAAA-NNNN (registration date in the business time zone). */
  anio: number;
}

export interface OrdenResumen {
  id: string;
  codigo: string;
  titulo: string;
  tipoTrabajo: string;
  referenciaCliente: string;
  cantidad: number;
  prioridad: Prioridad;
  estado: EstadoOrden;
  fechaCompromiso: string;
  fechaEstimadaTermino: string | null;
  creadoEn: string;
}

export interface RequerimientoVista {
  insumoId: number;
  codigo: string;
  nombre: string;
  unidad: string;
  cantidadRequerida: number;
  cantidadConsumida: number;
}

export interface EtapaVista {
  id: string;
  secuencia: number;
  nombre: string;
  area: string;
  instrucciones: string;
  estado: EstadoEtapa;
  responsable: { id: string; nombreCompleto: string } | null;
  duracionEstimadaHoras: number;
  esEtapaDiseno: boolean;
  version: number;
  iniciadaEn: string | null;
  terminadaEn: string | null;
  requerimientos: RequerimientoVista[];
}

export interface OrdenDetalle extends OrdenResumen {
  tipoTrabajoId: number;
  descripcion: string | null;
  especificaciones: Record<string, unknown>;
  creadoPor: { id: string; nombreCompleto: string };
  terminadaEn: string | null;
  etapas: EtapaVista[];
}

export interface Pagina<T> {
  datos: T[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface FiltroOrdenes {
  estado?: EstadoOrden | undefined;
  /** Text searched in the code and the title. */
  q?: string | undefined;
  pagina: number;
  tamano: number;
}

export const FILTROS_PANEL = ['activas', 'atrasadas', 'en_riesgo', 'todas'] as const;
export type FiltroPanel = (typeof FILTROS_PANEL)[number];

export interface FilaPanel {
  id: string;
  codigo: string;
  titulo: string;
  tipoTrabajo: string;
  estado: EstadoOrden;
  prioridad: Prioridad;
  fechaCompromiso: string;
  fechaEstimadaTermino: string | null;
  etapaActual: string | null;
  areaActual: string | null;
  responsableActual: string | null;
  porcentajeAvance: number;
  enRiesgo: boolean;
  atrasada: boolean;
}

export interface ResumenPanel {
  activas: number;
  atrasadas: number;
  enRiesgo: number;
  /** Supply alerts not yet closed (automatic and manual), so the panel shows them (§1.2). */
  alertasAbiertas: number;
}

export interface OrdenRepositorio {
  listarPlantillas(): Promise<TipoTrabajoVista[]>;
  /** Stages of an active work type with their supplies; null when the type does not exist or is inactive. */
  plantillaDe(tipoTrabajoId: number): Promise<PlantillaEtapa[] | null>;
  /** Inserts the order, its stages and requirements in one transaction and assigns the next code of the year. */
  crear(orden: OrdenAPersistir): Promise<{ id: string; codigo: string }>;
  listar(filtro: FiltroOrdenes): Promise<{ datos: OrdenResumen[]; total: number }>;
  obtener(id: string): Promise<OrdenDetalle | null>;
  panel(filtro: { filtro: FiltroPanel; q?: string | undefined; pagina: number; tamano: number }): Promise<{ datos: FilaPanel[]; total: number }>;
  resumenPanel(): Promise<ResumenPanel>;
}

/** Stage locked for update, together with its order (order row locked first). */
export interface EtapaBloqueada {
  id: string;
  ordenId: string;
  secuencia: number;
  nombre: string;
  estado: EstadoEtapa;
  version: number;
  responsableId: string | null;
  estadoOrden: EstadoOrden;
}

export interface SiguienteEtapa {
  id: string;
  nombre: string;
  area: string;
  responsableId: string | null;
}

/** Unit of work over one stage: every call runs in the same transaction. */
export interface TransaccionEtapa {
  readonly etapa: EtapaBloqueada;
  /** Returns the new version (the DDL trigger increments it). */
  cambiarEstado(hacia: EstadoEtapa): Promise<number>;
  /** Returns the new version. */
  asignarResponsable(responsableId: string): Promise<number>;
  /** Moves the first PENDIENTE stage after this one to DISPONIBLE (OMITIDA stages are skipped). */
  habilitarSiguiente(): Promise<SiguienteEtapa | null>;
  resumenEtapas(): Promise<ResumenEtapas>;
  /** Also sets terminada_en when the order reaches TERMINADA. */
  cambiarEstadoOrden(hacia: EstadoOrden): Promise<void>;
  /**
   * Locks the supply row (FOR UPDATE) when this stage requires it and the
   * supply is active; null otherwise. Callers lock supplies in id order.
   */
  bloquearInsumoRequerido(insumoId: number): Promise<InsumoBloqueado | null>;
  /**
   * Inserts the CONSUMO movement of this stage and adds the quantity to its
   * requirement. The DDL trigger updates the stock and, at or below the
   * minimum, opens the automatic alert (at most one open per supply).
   */
  registrarConsumo(insumoId: number, cantidad: number, usuarioId: string): Promise<ConsumoAplicado>;
  /** Inserts a MANUAL alert for this stage; null when the supply does not exist or is inactive. */
  crearAlertaManual(alerta: AlertaManual): Promise<{ id: number; codigo: string; creadaEn: string } | null>;
}

// ---------------------------------------------------------------------------
// Flow 4: supplies, consumptions and alerts (F4).

export interface InsumoBloqueado {
  id: number;
  codigo: string;
  nombre: string;
  unidad: string;
  stockActual: number;
  stockMinimo: number;
  /** Open automatic alert of the supply before the consumption, if any. */
  alertaAutomaticaId: number | null;
}

export interface ConsumoAplicado {
  stockActual: number;
  /** Open automatic alert after the consumption, if any. */
  alertaAutomaticaId: number | null;
}

export interface AlertaManual {
  insumoId: number;
  cantidadFaltante?: number | undefined;
  comentario?: string | undefined;
  reportadaPor: string;
}

export interface InsumoVista {
  id: number;
  codigo: string;
  nombre: string;
  unidad: string;
  stockActual: number;
  stockMinimo: number;
  alertasAbiertas: number;
}

export const FILTROS_ALERTA = ['abiertas', 'cerradas', 'todas'] as const;
export type FiltroAlerta = (typeof FILTROS_ALERTA)[number];

export interface AlertaVista {
  id: number;
  origen: 'AUTOMATICA' | 'MANUAL';
  estado: 'ABIERTA' | 'EN_GESTION' | 'CERRADA';
  cantidadFaltante: number | null;
  /** Free text as typed by the reporter: the web client must render it escaped (CP-25). */
  comentario: string | null;
  insumo: { id: number; codigo: string; nombre: string; unidad: string };
  etapa: { id: string; nombre: string } | null;
  orden: { id: string; codigo: string } | null;
  reportadaPor: { id: string; nombreCompleto: string } | null;
  creadaEn: string;
  cerradaEn: string | null;
}

export interface InsumoRepositorio {
  /** Active supplies, those at or below their minimum first. */
  listar(): Promise<InsumoVista[]>;
  listarAlertas(filtro: {
    estado: FiltroAlerta;
    insumoId?: number | undefined;
    pagina: number;
    tamano: number;
  }): Promise<{ datos: AlertaVista[]; total: number }>;
}

export interface EtapaDeTrabajo {
  id: string;
  secuencia: number;
  nombre: string;
  area: string;
  instrucciones: string;
  estado: EstadoEtapa;
  version: number;
  duracionEstimadaHoras: number;
  iniciadaEn: string | null;
  orden: { id: string; codigo: string; titulo: string; prioridad: Prioridad; estado: EstadoOrden; fechaCompromiso: string };
  /** Supplies of the stage (D26): the operator declares consumptions and reports shortages from them. */
  requerimientos: RequerimientoVista[];
}

export interface EtapaRepositorio {
  /**
   * Runs `trabajo` in a transaction with the stage and its order locked
   * (FOR UPDATE). `trabajo` receives null when the stage does not exist.
   * A thrown error rolls everything back.
   */
  enTransaccion<T>(etapaId: string, trabajo: (tx: TransaccionEtapa | null) => Promise<T>): Promise<T>;
  /** Open stages assigned to the user, in active orders, most urgent first. */
  deResponsable(usuarioId: string): Promise<EtapaDeTrabajo[]>;
}
