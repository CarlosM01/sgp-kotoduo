// Ports used by the use cases. Infrastructure (PostgreSQL, MongoDB, Argon2,
// JWT) implements them; tests can replace them with in-memory fakes.
import type { CodigoRol } from '../dominio/permisos.js';

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
  /** True while bloqueado_hasta is in the future, evaluated by the database clock. */
  bloqueado: boolean;
  roles: CodigoRol[];
}

export interface UsuarioRepositorio {
  buscarPorNombre(nombreUsuario: string): Promise<UsuarioAuth | null>;
  buscarPorId(id: string): Promise<UsuarioAuth | null>;
  /**
   * Counts a failed attempt atomically. When the count reaches `maxIntentos`
   * the account is locked for `minutosBloqueo` and the counter restarts.
   * Returns whether this attempt locked the account.
   */
  registrarIntentoFallido(id: string, maxIntentos: number, minutosBloqueo: number): Promise<{ bloqueada: boolean }>;
  registrarAccesoExitoso(id: string): Promise<void>;
  /** Stores the new hash and clears debe_cambiar_clave. */
  actualizarClave(id: string, passwordHash: string): Promise<void>;
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
