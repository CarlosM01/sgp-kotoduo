import { describe, expect, it } from 'vitest';
import { crearServicioAuth } from '../../src/aplicacion/auth.js';
import type { Hasher } from '../../src/aplicacion/puertos.js';
import { auditoriaEnMemoria, hasherPlano, repositorioEnMemoria } from '../apoyo/fakes.js';
import { crearServicioTokensJwt } from '../../src/infraestructura/seguridad/tokens-jwt.js';
import { SECRETO_PRUEBA } from '../apoyo/fakes.js';

describe('dummy hash of the login (review R4)', () => {
  it('a transient hashing failure is not cached: the next login works', async () => {
    let fallar = true;
    const hasher: Hasher = {
      hash: async (c) => {
        if (fallar) {
          fallar = false;
          throw new Error('transient argon2 failure');
        }
        return hasherPlano.hash(c);
      },
      verificar: hasherPlano.verificar,
    };
    const auth = crearServicioAuth({
      usuarios: repositorioEnMemoria(),
      hasher,
      tokens: crearServicioTokensJwt(SECRETO_PRUEBA),
      auditoria: auditoriaEnMemoria(),
    });

    await expect(auth.login('t.nadie', 'x', {})).rejects.toThrow('transient argon2 failure');
    await expect(auth.login('t.nadie', 'x', {})).rejects.toMatchObject({ codigo: 'INVALID_CREDENTIALS' });
  });
});
