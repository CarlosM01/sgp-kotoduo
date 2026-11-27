// Behind the nginx of the compose (F6) every request arrives from the proxy.
// TRUST_PROXY tells Express how many proxy hops to trust, so the per-IP login
// limit and the audit log use the client address from X-Forwarded-For.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearApiDePrueba } from '../apoyo/fakes.js';

const CLIENTE = '203.0.113.7';
const OTRO = '198.51.100.9';

async function loginFallido(app: Parameters<typeof request>[0], ip?: string) {
  const r = request(app).post('/api/v1/auth/login');
  if (ip) r.set('X-Forwarded-For', ip);
  return r.send({ nombreUsuario: 'nadie', clave: 'clave-incorrecta-123' });
}

describe('TRUST_PROXY (F6, nginx in front of the API)', () => {
  it('with one trusted hop, the audit log records the client IP from X-Forwarded-For', async () => {
    const { app, auditoria } = crearApiDePrueba([], { trustProxy: 1 });

    await loginFallido(app, CLIENTE);

    expect(auditoria.eventos.at(-1)?.contexto?.ip).toBe(CLIENTE);
  });

  it('with one trusted hop, the login limit counts each client IP separately', async () => {
    const { app } = crearApiDePrueba([], { trustProxy: 1, limites: { authPorMinuto: 2 } });

    const a = [await loginFallido(app, CLIENTE), await loginFallido(app, CLIENTE), await loginFallido(app, CLIENTE)];
    const b = await loginFallido(app, OTRO);

    expect(a.map((r) => r.status)).toEqual([401, 401, 429]);
    expect(b.status).toBe(401);
  });

  it('by default X-Forwarded-For is ignored, so a direct client cannot spoof its IP', async () => {
    const { app, auditoria } = crearApiDePrueba([], { limites: { authPorMinuto: 2 } });

    const estados = [];
    for (const ip of [CLIENTE, OTRO, '192.0.2.1']) estados.push((await loginFallido(app, ip)).status);

    expect(auditoria.eventos.at(-1)?.contexto?.ip).not.toBe('192.0.2.1');
    expect(estados).toEqual([401, 401, 429]);
  });
});
