// In-memory adapters for HTTP unit tests: no database needed.
import { crearApi, type Api } from '../../src/app.js';
import { crearServicioAuth } from '../../src/aplicacion/auth.js';
import type { ServicioEtapas } from '../../src/aplicacion/etapas.js';
import type { ServicioInsumos } from '../../src/aplicacion/insumos.js';
import type { ServicioOrdenes } from '../../src/aplicacion/ordenes.js';
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
    reservarIntento: async () => true,
    registrarFallo: async () => ({ bloqueada: false }),
    registrarAccesoExitoso: async () => true,
    actualizarClave: async (id, h) => {
      const u = porId.get(id);
      if (u) Object.assign(u, { passwordHash: h, debeCambiarClave: false });
    },
    listarActivosConRoles: async (roles) =>
      [...porId.values()]
        .filter((u) => u.activo && u.roles.some((r) => roles.includes(r)))
        .map((u) => ({ id: u.id, nombreCompleto: u.nombreCompleto, roles: u.roles })),
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
  // HTTP unit tests do not reach the order or supply use cases; any call fails loudly.
  const noUsado = new Proxy({}, { get: () => () => Promise.reject(new Error('not available in HTTP unit tests')) });
  const silencioso = { error: () => {}, warn: () => {} };
  return {
    ...crearApi({ corsOrigin: 'http://localhost:5173', servicios: { auth, ordenes: noUsado as ServicioOrdenes, etapas: noUsado as ServicioEtapas, insumos: noUsado as ServicioInsumos, tokens, auditoria }, log: silencioso }),
    auditoria,
  };
}
