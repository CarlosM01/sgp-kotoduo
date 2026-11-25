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
