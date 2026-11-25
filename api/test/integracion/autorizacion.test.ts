import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CodigoRol } from '../../src/dominio/permisos.js';
import { prepararEntorno, type Entorno } from './apoyo.js';

let entorno: Entorno;
beforeAll(async () => {
  entorno = await prepararEntorno();
});
afterAll(async () => {
  await entorno?.limpiar();
});

const DEMO_01 = '10000000-0000-0000-0000-000000000001';

async function tokenDe(rol: CodigoRol): Promise<{ id: string; token: string }> {
  const u = await entorno.crearUsuario(rol);
  const res = await request(entorno.app())
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: u.nombreUsuario, clave: u.clave });
  return { id: u.id, token: res.body.accessToken as string };
}

describe('authentication on protected routes', () => {
  it.each([
    ['no header', undefined],
    ['wrong scheme', 'Basic YWRtaW46YWRtaW4='],
    ['malformed token', 'Bearer not-a-jwt'],
    ['forged token', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl'],
  ])('%s → 401', async (_caso, header) => {
    const req = request(entorno.app()).get('/api/v1/bitacora');
    const res = await (header ? req.set('Authorization', header) : req);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' } });
  });
});

describe('CP-28 escalada vertical (AM-06)', () => {
  it.each<CodigoRol>(['OPERARIO', 'VENDEDOR', 'DISENADOR'])(
    '%s → GET /bitacora is 403 and the denial is logged',
    async (rol) => {
      const { id, token } = await tokenDe(rol);

      const res = await request(entorno.app()).get('/api/v1/bitacora').auth(token, { type: 'bearer' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      const denegado = (await entorno.eventosDe(id)).find((e) => e.tipo === 'ACCESO_DENEGADO');
      expect(denegado?.payload).toEqual({ metodo: 'GET', ruta: '/bitacora', permiso: 'bitacora.ver' });
    },
  );

  it('ADMINISTRADOR reads the whole log, newest first, from MongoDB', async () => {
    const { token } = await tokenDe('ADMINISTRADOR');

    const res = await request(entorno.app()).get('/api/v1/bitacora?limite=5').auth(token, { type: 'bearer' });

    expect(res.status).toBe(200);
    expect(res.body.datos.length).toBeGreaterThan(0);
    expect(res.body.datos.length).toBeLessThanOrEqual(5);
    const fechas = res.body.datos.map((e: { ts: string }) => Date.parse(e.ts));
    expect(fechas).toEqual([...fechas].sort((a, b) => b - a));
  });

  it('ENCARGADA sees the log only per work order (Table 7.1 ◐)', async () => {
    const { token } = await tokenDe('ENCARGADA_PRODUCCION');
    const app = entorno.app();

    const sinOrden = await request(app).get('/api/v1/bitacora').auth(token, { type: 'bearer' });
    const porOrden = await request(app).get(`/api/v1/bitacora?orden_id=${DEMO_01}`).auth(token, { type: 'bearer' });

    expect(sinOrden.status).toBe(400);
    expect(sinOrden.body.error.details).toEqual([{ campo: 'orden_id', problema: 'required' }]);
    expect(porOrden.status).toBe(200);
    expect(porOrden.body.datos.length).toBeGreaterThan(0);
    expect(porOrden.body.datos.every((e: { ordenId: string }) => e.ordenId === DEMO_01)).toBe(true);
  });
});

describe('CP-24 inyección SQL / NoSQL (AM-01, AM-02) — F2 routes', () => {
  it('a NoSQL operator instead of a string is rejected with 400', async () => {
    const res = await request(entorno.app())
      .post('/api/v1/auth/login')
      .send({ nombreUsuario: { $ne: null }, clave: { $gt: '' } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/\$ne|stack|at /);
  });

  it.each([["' OR 1=1--"], ['a\u0000b'], ['admin; DROP TABLE x']])(
    'a user name outside the allowed format (%j) is rejected with 400 before any query',
    async (nombreUsuario) => {
      const res = await request(entorno.app())
        .post('/api/v1/auth/login')
        .send({ nombreUsuario, clave: 'cualquier cosa 123' });

      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual([{ campo: 'nombreUsuario', problema: 'invalid_format' }]);
    },
  );

  it('undeclared fields are rejected (mass assignment)', async () => {
    const res = await request(entorno.app())
      .post('/api/v1/auth/login')
      .send({ nombreUsuario: 'admin', clave: 'x', roles: ['ADMINISTRADOR'] });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ campo: '(raíz)', problema: 'unrecognized_keys' }]);
  });

  it('malicious query parameters on /bitacora return 400 without SQL or stack traces', async () => {
    const { token } = await tokenDe('ADMINISTRADOR');
    const app = entorno.app();

    const casos = [
      '/api/v1/bitacora?orden_id=1;DROP TABLE x',
      "/api/v1/bitacora?orden_id=' OR 1=1--",
      '/api/v1/bitacora?orden_id[$ne]=x',
      `/api/v1/bitacora?orden_id=${DEMO_01}&orden_id=${DEMO_01}`,
      '/api/v1/bitacora?limite=1000',
      '/api/v1/bitacora?filtro=x',
    ];
    for (const url of casos) {
      const res = await request(app).get(url).auth(token, { type: 'bearer' });
      expect(res.status, url).toBe(400);
      expect(JSON.stringify(res.body), url).not.toMatch(/DROP|syntax|stack|Mongo/i);
    }
  });
});
