import { Algorithm, hash, verify } from '@node-rs/argon2';
import type { Hasher } from '../../aplicacion/puertos.js';

// Same parameters as the seed (D9): OWASP minimum for Argon2id.
const OPCIONES = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function crearHasherArgon2(): Hasher {
  return {
    hash: (clave) => hash(clave, OPCIONES),
    async verificar(hashGuardado, clave) {
      try {
        return await verify(hashGuardado, clave);
      } catch {
        // A malformed stored hash must never authenticate.
        return false;
      }
    },
  };
}
