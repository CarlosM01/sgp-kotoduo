import { SignJWT, UnsecuredJWT, decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { ErrorNoAutenticado } from '../../src/aplicacion/errores.js';
import type { Actor } from '../../src/aplicacion/puertos.js';
import { DURACION_ACCESS_SEGUNDOS, crearServicioTokensJwt } from '../../src/infraestructura/seguridad/tokens-jwt.js';
import { SECRETO_PRUEBA } from '../apoyo/fakes.js';

const actor: Actor = { id: '00000000-0000-0000-0000-000000000002', roles: ['OPERARIO'], debeCambiarClave: false };
const clave = new TextEncoder().encode(SECRETO_PRUEBA);

describe('access token (ES2 section 7.2)', () => {
  const tokens = crearServicioTokensJwt(SECRETO_PRUEBA);

  it('lasts 10 minutes and round-trips the actor', async () => {
    const { token, expiraEn } = await tokens.emitir(actor);
    const claims = decodeJwt(token);

    expect(DURACION_ACCESS_SEGUNDOS).toBe(600);
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(600);
    expect(expiraEn.getTime()).toBe((claims.exp ?? 0) * 1000);
    await expect(tokens.verificar(token)).resolves.toEqual(actor);
  });

  it('rejects an expired token', async () => {
    const pasado = crearServicioTokensJwt(SECRETO_PRUEBA, () => new Date(Date.now() - 11 * 60_000));
    const { token } = await pasado.emitir(actor);

    await expect(tokens.verificar(token)).rejects.toBeInstanceOf(ErrorNoAutenticado);
  });

  it('rejects a token signed with another secret', async () => {
    const otro = crearServicioTokensJwt('another-secret-with-at-least-32-characters');
    const { token } = await otro.emitir(actor);

    await expect(tokens.verificar(token)).rejects.toBeInstanceOf(ErrorNoAutenticado);
  });

  it('rejects an unsigned token (alg none)', async () => {
    const token = new UnsecuredJWT({ roles: ['ADMINISTRADOR'], dcc: false })
      .setSubject(actor.id)
      .setIssuer('sgp-kotoduo')
      .setAudience('sgp-api')
      .setIssuedAt()
      .setExpirationTime('10m')
      .encode();

    await expect(tokens.verificar(token)).rejects.toBeInstanceOf(ErrorNoAutenticado);
  });

  it('rejects a tampered payload (role escalation)', async () => {
    const { token } = await tokens.emitir(actor);
    const [cabecera, , firma] = token.split('.');
    const payload = Buffer.from(JSON.stringify({ ...decodeJwt(token), roles: ['ADMINISTRADOR'] })).toString('base64url');

    await expect(tokens.verificar(`${cabecera}.${payload}.${firma}`)).rejects.toBeInstanceOf(ErrorNoAutenticado);
  });

  it('rejects a validly signed token with an unknown role or missing claims', async () => {
    const conRolInventado = await new SignJWT({ roles: ['ROOT'], dcc: false })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(actor.id)
      .setIssuer('sgp-kotoduo')
      .setAudience('sgp-api')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(clave);
    const sinDcc = await new SignJWT({ roles: ['OPERARIO'] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(actor.id)
      .setIssuer('sgp-kotoduo')
      .setAudience('sgp-api')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(clave);

    await expect(tokens.verificar(conRolInventado)).rejects.toBeInstanceOf(ErrorNoAutenticado);
    await expect(tokens.verificar(sinDcc)).rejects.toBeInstanceOf(ErrorNoAutenticado);
  });
});
