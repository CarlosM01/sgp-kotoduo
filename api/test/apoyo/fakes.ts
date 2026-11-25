// In-memory adapters for HTTP unit tests: no database needed.
import { crearApi, type Api } from '../../src/app.js';
import { crearServicioAuth } from '../../src/aplicacion/auth.js';
import type { Auditoria, Hasher, NuevoEvento, UsuarioAuth, UsuarioRepositorio } from '../../src/aplicacion/puertos.js';
import { crearServicioTokensJwt } from '../../src/infraestructura/seguridad/tokens-jwt.js';

export const SECRETO_PRUEBA = 'test-secret-with-at-least-32-characters!!';

export const hasherPlano: Hasher = {
  hash: async (c) => `plain:${c}`,
  verificar: async (h, c) => h === `plain:${c}`,
};

export function repositorioEnMemoria(usuarios: UsuarioAuth[] = []): UsuarioRepositorio {
  const porId = new Map(usuarios.map((u) => [u.id, { ...u }]));
  return {
    buscarPorNombre: async (n) => [...porId.values()].find((u) => u.nombreUsuario === n) ?? null,
    buscarPorId: async (id) => porId.get(id) ?? null,
    registrarIntentoFallido: async () => ({ bloqueada: false }),
    registrarAccesoExitoso: async () => {},
    actualizarClave: async (id, h) => {
      const u = porId.get(id);
      if (u) Object.assign(u, { passwordHash: h, debeCambiarClave: false });
    },
  };
}

export function auditoriaEnMemoria(): Auditoria & { eventos: NuevoEvento[] } {
  const eventos: NuevoEvento[] = [];
  return {
    eventos,
    registrar: async (e) => {
      eventos.push(e);
    },
    listar: async () => [],
  };
}

export function crearApiDePrueba(usuarios: UsuarioAuth[] = []): Api & { auditoria: ReturnType<typeof auditoriaEnMemoria> } {
  const tokens = crearServicioTokensJwt(SECRETO_PRUEBA);
  const auditoria = auditoriaEnMemoria();
  const auth = crearServicioAuth({ usuarios: repositorioEnMemoria(usuarios), hasher: hasherPlano, tokens, auditoria });
  const silencioso = { error: () => {}, warn: () => {} };
  return {
    ...crearApi({ corsOrigin: 'http://localhost:5173', servicios: { auth, tokens, auditoria }, log: silencioso }),
    auditoria,
  };
}
