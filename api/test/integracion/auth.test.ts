import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearHasherArgon2 } from '../../src/infraestructura/seguridad/argon2.js';
import { CLAVE_DEMO_SEED, prepararEntorno, type Entorno } from './apoyo.js';

let entorno: Entorno;
beforeAll(async () => {
  entorno = await prepararEntorno();
});
afterAll(async () => {
  await entorno?.limpiar();
});

const login = (app: Parameters<typeof request>[0], nombreUsuario: string, clave: string) =>
  request(app).post('/api/v1/auth/login').send({ nombreUsuario, clave });

const CREDENCIALES_INVALIDAS = { error: { code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos' } };

describe('CP-09 login correcto (HU-11 / CU-01)', () => {
  it('returns a 10-minute access token with the user roles and logs LOGIN_EXITOSO in MongoDB', async () => {
    const op = await entorno.crearUsuario('OPERARIO');

    const res = await login(entorno.app(), op.nombreUsuario, op.clave);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      tokenType: 'Bearer',
      debeCambiarClave: false,
      usuario: { id: op.id, nombreUsuario: op.nombreUsuario, roles: ['OPERARIO'] },
    });
    const claims = decodeJwt(res.body.accessToken);
    expect(claims.sub).toBe(op.id);
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(600);
    expect(JSON.stringify(res.body)).not.toContain('argon2');

    const eventos = await entorno.eventosDe(op.id);
    expect(eventos.map((e) => e.tipo)).toEqual(['LOGIN_EXITOSO']);
    expect(eventos[0]?.actor.ip).toBeTruthy();
  });

  it('accepts the user name in any case and with surrounding spaces', async () => {
    const op = await entorno.crearUsuario('OPERARIO');

    const res = await login(entorno.app(), `  ${op.nombreUsuario.toUpperCase()} `, op.clave);

    expect(res.status).toBe(200);
  });
});

describe('generic login errors (ES2 section 7.2, "Mensajes")', () => {
  it('wrong password and unknown user return the same 401 body', async () => {
    const op = await entorno.crearUsuario('OPERARIO');
    const app = entorno.app();

    const claveMala = await login(app, op.nombreUsuario, 'no es la clave correcta');
    const desconocido = await login(app, 't.no-existe', 'no es la clave correcta');

    expect(claveMala.status).toBe(401);
    expect(desconocido.status).toBe(401);
    expect(claveMala.body).toEqual(CREDENCIALES_INVALIDAS);
    expect(desconocido.body).toEqual(CREDENCIALES_INVALIDAS);
    expect((await entorno.eventosDe(op.id)).map((e) => e.tipo)).toEqual(['LOGIN_FALLIDO']);
  });

  it('an inactive account cannot log in, with the same generic message', async () => {
    const op = await entorno.crearUsuario('OPERARIO');
    await entorno.contenedor.pool.query('UPDATE sgp.usuario SET activo = FALSE WHERE id = $1', [op.id]);

    const res = await login(entorno.app(), op.nombreUsuario, op.clave);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(CREDENCIALES_INVALIDAS);
  });
});

describe('CP-29 fuerza bruta (AM-07)', () => {
  it('locks the account for 15 minutes from the 5th failure; then even the right password fails', async () => {
    const op = await entorno.crearUsuario('OPERARIO');
    const app = entorno.app();

    for (let i = 1; i <= 5; i++) {
      const res = await login(app, op.nombreUsuario, `clave equivocada ${i}`);
      expect(res.status).toBe(401);
    }
    const correcta = await login(app, op.nombreUsuario, op.clave);

    expect(correcta.status).toBe(401);
    expect(correcta.body).toEqual(CREDENCIALES_INVALIDAS);

    const fila = await entorno.usuario(op.id);
    const minutos = ((fila.bloqueado_hasta?.getTime() ?? 0) - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(14);
    expect(minutos).toBeLessThanOrEqual(15);

    const tipos = (await entorno.eventosDe(op.id)).map((e) => e.tipo);
    expect(tipos.filter((t) => t === 'CUENTA_BLOQUEADA')).toHaveLength(1);
    expect(tipos.filter((t) => t === 'LOGIN_FALLIDO')).toHaveLength(6);
  });

  it('four failures do not lock, and a successful login resets the counter', async () => {
    const op = await entorno.crearUsuario('OPERARIO');
    const app = entorno.app();

    for (let i = 1; i <= 4; i++) await login(app, op.nombreUsuario, `clave equivocada ${i}`);
    expect((await entorno.usuario(op.id)).intentos_fallidos).toBe(4);

    expect((await login(app, op.nombreUsuario, op.clave)).status).toBe(200);
    expect(await entorno.usuario(op.id)).toMatchObject({ intentos_fallidos: 0, bloqueado_hasta: null });
  });

  it('the 11th auth request in 60 s from the same IP receives 429', async () => {
    const app = entorno.app({ authPorMinuto: 10 });
    const estados: number[] = [];

    for (let i = 1; i <= 11; i++) estados.push((await login(app, `t.rate-${i}`, 'clave cualquiera 123')).status);

    expect(estados.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(estados[10]).toBe(429);
  });
});

describe('D12 forced password change', () => {
  it('the seed admin starts with debeCambiarClave and cannot use the API until it changes it', async () => {
    const app = entorno.app();
    const res = await login(app, 'admin', CLAVE_DEMO_SEED);

    expect(res.status).toBe(200);
    expect(res.body.debeCambiarClave).toBe(true);

    const bitacora = await request(app).get('/api/v1/bitacora').auth(res.body.accessToken, { type: 'bearer' });
    expect(bitacora.status).toBe(403);
    expect(bitacora.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('validates the new password and, once changed, unlocks the account', async () => {
    const admin = await entorno.crearUsuario('ADMINISTRADOR', { debeCambiarClave: true });
    const app = entorno.app();
    const { accessToken } = (await login(app, admin.nombreUsuario, admin.clave)).body;
    const cambiar = (body: object) =>
      request(app).post('/api/v1/auth/cambiar-clave').auth(accessToken, { type: 'bearer' }).send(body);

    const corta = await cambiar({ claveActual: admin.clave, claveNueva: 'corta' });
    const publica = await cambiar({ claveActual: admin.clave, claveNueva: CLAVE_DEMO_SEED });
    const igual = await cambiar({ claveActual: admin.clave, claveNueva: admin.clave });
    const actualMala = await cambiar({ claveActual: 'otra clave cualquiera', claveNueva: 'nueva clave del admin 2026' });

    expect([corta.status, publica.status, igual.status, actualMala.status]).toEqual([400, 400, 400, 400]);
    expect(corta.body.error.details).toEqual([{ campo: 'claveNueva', problema: 'muy_corta' }]);
    expect(publica.body.error.details).toEqual([{ campo: 'claveNueva', problema: 'comprometida' }]);
    expect(igual.body.error.details).toEqual([{ campo: 'claveNueva', problema: 'igual_a_la_actual' }]);
    expect(actualMala.body.error.details).toEqual([{ campo: 'claveActual', problema: 'incorrecta' }]);
    expect((await entorno.usuario(admin.id)).debe_cambiar_clave).toBe(true);

    const ok = await cambiar({ claveActual: admin.clave, claveNueva: 'nueva clave del admin 2026' });

    expect(ok.status).toBe(200);
    expect(ok.body.debeCambiarClave).toBe(false);
    const fila = await entorno.usuario(admin.id);
    expect(fila.debe_cambiar_clave).toBe(false);
    expect(await crearHasherArgon2().verificar(fila.password_hash, 'nueva clave del admin 2026')).toBe(true);

    expect((await login(app, admin.nombreUsuario, admin.clave)).status).toBe(401);
    const nuevoLogin = await login(app, admin.nombreUsuario, 'nueva clave del admin 2026');
    expect(nuevoLogin.body.debeCambiarClave).toBe(false);
    const bitacora = await request(app).get('/api/v1/bitacora').auth(ok.body.accessToken, { type: 'bearer' });
    expect(bitacora.status).toBe(200);

    expect((await entorno.eventosDe(admin.id)).map((e) => e.tipo)).toContain('CLAVE_CAMBIADA');
  });

  it('cambiar-clave requires a session', async () => {
    const res = await request(entorno.app())
      .post('/api/v1/auth/cambiar-clave')
      .send({ claveActual: 'x', claveNueva: 'nueva clave del admin 2026' });

    expect(res.status).toBe(401);
  });
});
