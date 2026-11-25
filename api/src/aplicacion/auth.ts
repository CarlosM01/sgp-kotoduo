// Use cases of flow 1 (HU-11, CU-01): login with lockout and the forced
// password change of D12.
import { randomUUID } from 'node:crypto';
import { validarPoliticaClave } from '../dominio/politica-clave.js';
import { ErrorCredenciales, ErrorNoAutenticado, ErrorValidacion } from './errores.js';
import type { Actor, Auditoria, Contexto, Hasher, ServicioTokens, UsuarioAuth, UsuarioRepositorio } from './puertos.js';

/** ES2 section 7.2: lock after 5 failed attempts (CP-29). */
export const MAX_INTENTOS_LOGIN = 5;
export const MINUTOS_BLOQUEO = 15;

export interface Sesion {
  accessToken: string;
  tokenType: 'Bearer';
  expiraEn: string;
  debeCambiarClave: boolean;
  usuario: { id: string; nombreUsuario: string; nombreCompleto: string; roles: string[] };
}

export interface ServicioAuth {
  login(nombreUsuario: string, clave: string, ctx: Contexto): Promise<Sesion>;
  cambiarClave(actor: Actor, claveActual: string, claveNueva: string, ctx: Contexto): Promise<Sesion>;
}

interface Dependencias {
  usuarios: UsuarioRepositorio;
  hasher: Hasher;
  tokens: ServicioTokens;
  auditoria: Auditoria;
}

type MotivoRechazo = 'USUARIO_DESCONOCIDO' | 'CUENTA_INACTIVA' | 'CUENTA_BLOQUEADA' | 'CLAVE_INCORRECTA';

const MENSAJES_POLITICA = {
  MUY_CORTA: 'La contraseña debe tener al menos 12 caracteres',
  MUY_LARGA: 'La contraseña no puede superar los 128 caracteres',
  COMPROMETIDA: 'La contraseña es conocida o pública; elija otra',
} as const;

export function crearServicioAuth({ usuarios, hasher, tokens, auditoria }: Dependencias): ServicioAuth {
  // A hash is always verified, real or dummy, so the response time does not
  // reveal whether the user exists (ES2 section 7.2, "Mensajes").
  let hashFicticio: Promise<string> | undefined;
  const obtenerHashFicticio = () =>
    (hashFicticio ??= hasher.hash(randomUUID()).catch((err: unknown) => {
      hashFicticio = undefined; // a transient failure must not be cached for the life of the process
      throw err;
    }));

  async function emitirSesion(u: UsuarioAuth, debeCambiarClave: boolean): Promise<Sesion> {
    const { token, expiraEn } = await tokens.emitir({ id: u.id, roles: u.roles, debeCambiarClave });
    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiraEn: expiraEn.toISOString(),
      debeCambiarClave,
      usuario: { id: u.id, nombreUsuario: u.nombreUsuario, nombreCompleto: u.nombreCompleto, roles: u.roles },
    };
  }

  /**
   * Checks a password under the lockout protocol (see UsuarioRepositorio).
   * Returns null when it is correct, or why it was rejected. A wrong password
   * stays counted and may lock the account.
   */
  async function comprobarClave(u: UsuarioAuth, clave: string, ctx: Contexto): Promise<MotivoRechazo | null> {
    const reservado = await usuarios.reservarIntento(u.id, MAX_INTENTOS_LOGIN);
    const valida = await hasher.verificar(reservado ? u.passwordHash : await obtenerHashFicticio(), clave);
    if (!reservado) return 'CUENTA_BLOQUEADA';

    if (valida) return (await usuarios.registrarAccesoExitoso(u.id)) ? null : 'CUENTA_BLOQUEADA';

    const { bloqueada } = await usuarios.registrarFallo(u.id, MAX_INTENTOS_LOGIN, MINUTOS_BLOQUEO);
    if (bloqueada) {
      await auditoria.registrar({
        tipo: 'CUENTA_BLOQUEADA',
        agregado: { tipo: 'usuario', id: u.id },
        actor: { usuarioId: u.id, roles: u.roles },
        payload: { intentos: MAX_INTENTOS_LOGIN, minutos: MINUTOS_BLOQUEO },
        contexto: ctx,
      });
    }
    return 'CLAVE_INCORRECTA';
  }

  return {
    async login(nombreUsuario, clave, ctx) {
      const u = await usuarios.buscarPorNombre(nombreUsuario);

      let motivo: MotivoRechazo | null;
      if (u?.activo) {
        motivo = await comprobarClave(u, clave, ctx);
      } else {
        await hasher.verificar(await obtenerHashFicticio(), clave);
        motivo = u ? 'CUENTA_INACTIVA' : 'USUARIO_DESCONOCIDO';
      }

      if (!u || motivo !== null) {
        await auditoria.registrar({
          tipo: 'LOGIN_FALLIDO',
          agregado: { tipo: 'usuario', id: u?.id ?? 'desconocido' },
          actor: { usuarioId: u?.id ?? null, roles: u?.roles ?? [] },
          payload: { nombre_usuario: nombreUsuario, motivo },
          contexto: ctx,
        });
        throw new ErrorCredenciales();
      }

      await auditoria.registrar({
        tipo: 'LOGIN_EXITOSO',
        agregado: { tipo: 'usuario', id: u.id },
        actor: { usuarioId: u.id, roles: u.roles },
        payload: { debe_cambiar_clave: u.debeCambiarClave },
        contexto: ctx,
      });
      return emitirSesion(u, u.debeCambiarClave);
    },

    async cambiarClave(actor, claveActual, claveNueva, ctx) {
      const u = await usuarios.buscarPorId(actor.id);
      if (!u || !u.activo) throw new ErrorNoAutenticado();

      // Guesses of the current password count toward the same lock as the login.
      if ((await comprobarClave(u, claveActual, ctx)) !== null) {
        throw new ErrorValidacion('La contraseña actual no es correcta', [
          { campo: 'claveActual', problema: 'incorrecta' },
        ]);
      }
      if (claveNueva === claveActual) {
        throw new ErrorValidacion('La nueva contraseña debe ser distinta de la actual', [
          { campo: 'claveNueva', problema: 'igual_a_la_actual' },
        ]);
      }
      const politica = validarPoliticaClave(claveNueva);
      if (!politica.ok) {
        throw new ErrorValidacion(MENSAJES_POLITICA[politica.motivo], [
          { campo: 'claveNueva', problema: politica.motivo.toLowerCase() },
        ]);
      }

      await usuarios.actualizarClave(u.id, await hasher.hash(claveNueva));
      await auditoria.registrar({
        tipo: 'CLAVE_CAMBIADA',
        agregado: { tipo: 'usuario', id: u.id },
        actor: { usuarioId: u.id, roles: u.roles },
        payload: { forzado: u.debeCambiarClave },
        contexto: ctx,
      });
      return emitirSesion(u, false);
    },
  };
}
