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

const MENSAJES_POLITICA = {
  MUY_CORTA: 'La contraseña debe tener al menos 12 caracteres',
  MUY_LARGA: 'La contraseña no puede superar los 128 caracteres',
  COMPROMETIDA: 'La contraseña es conocida o pública; elija otra',
} as const;

export function crearServicioAuth({ usuarios, hasher, tokens, auditoria }: Dependencias): ServicioAuth {
  // A hash is always verified, real or dummy, so the response time does not
  // reveal whether the user exists (ES2 section 7.2, "Mensajes").
  let hashFicticio: Promise<string> | undefined;
  const obtenerHashFicticio = () => (hashFicticio ??= hasher.hash(randomUUID()));

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

  return {
    async login(nombreUsuario, clave, ctx) {
      const u = await usuarios.buscarPorNombre(nombreUsuario);
      const valida = await hasher.verificar(u?.passwordHash ?? (await obtenerHashFicticio()), clave);

      if (!u || !u.activo || u.bloqueado || !valida) {
        let motivo = 'CLAVE_INCORRECTA';
        if (!u) motivo = 'USUARIO_DESCONOCIDO';
        else if (!u.activo) motivo = 'CUENTA_INACTIVA';
        else if (u.bloqueado) motivo = 'CUENTA_BLOQUEADA';

        await auditoria.registrar({
          tipo: 'LOGIN_FALLIDO',
          agregado: { tipo: 'usuario', id: u?.id ?? 'desconocido' },
          actor: { usuarioId: u?.id ?? null, roles: u?.roles ?? [] },
          payload: { nombre_usuario: nombreUsuario, motivo },
          contexto: ctx,
        });

        // Only a wrong password on an active, unlocked account counts toward the lock.
        if (u && motivo === 'CLAVE_INCORRECTA') {
          const { bloqueada } = await usuarios.registrarIntentoFallido(u.id, MAX_INTENTOS_LOGIN, MINUTOS_BLOQUEO);
          if (bloqueada) {
            await auditoria.registrar({
              tipo: 'CUENTA_BLOQUEADA',
              agregado: { tipo: 'usuario', id: u.id },
              actor: { usuarioId: u.id, roles: u.roles },
              payload: { intentos: MAX_INTENTOS_LOGIN, minutos: MINUTOS_BLOQUEO },
              contexto: ctx,
            });
          }
        }
        throw new ErrorCredenciales();
      }

      await usuarios.registrarAccesoExitoso(u.id);
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

      if (!(await hasher.verificar(u.passwordHash, claveActual))) {
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
