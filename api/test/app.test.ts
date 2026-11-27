import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearApiDePrueba } from './apoyo/fakes.js';

describe('HTTP app skeleton', () => {
  const { app } = crearApiDePrueba();

  it('GET /api/v1/health responds 200 with status ok', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('sets security headers and hides the framework (AM-10)', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('unknown routes return a uniform JSON 404 without internals', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
  });

  it('malformed JSON returns 400 without a stack trace', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"nombreUsuario": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'INVALID_JSON', message: 'El cuerpo de la solicitud no es JSON válido' } });
  });

  it('bodies above 100 kB return 413', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ nombreUsuario: 'x', clave: 'y'.repeat(110_000) });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('CORS only allows the configured web origin', async () => {
    const permitido = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    const ajeno = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');

    expect(permitido.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ajeno.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});
