// Short-lived access token (ES2 section 7.2: 10 minutes, kept in memory by the
// client). HS256 with a secret from the environment; the refresh token with
// rotation (D2) is built later in the roadmap.
import { SignJWT, jwtVerify } from 'jose';
import { ErrorNoAutenticado } from '../../aplicacion/errores.js';
import type { Actor, ServicioTokens } from '../../aplicacion/puertos.js';
import { esCodigoRol, type CodigoRol } from '../../dominio/permisos.js';

export const DURACION_ACCESS_SEGUNDOS = 10 * 60;
const EMISOR = 'sgp-kotoduo';
const AUDIENCIA = 'sgp-api';
const ALGORITMO = 'HS256';

export function crearServicioTokensJwt(secreto: string, ahora: () => Date = () => new Date()): ServicioTokens {
  const clave = new TextEncoder().encode(secreto);

  return {
    async emitir(actor: Actor) {
      const iat = Math.floor(ahora().getTime() / 1000);
      const exp = iat + DURACION_ACCESS_SEGUNDOS;
      const token = await new SignJWT({ roles: actor.roles, dcc: actor.debeCambiarClave })
        .setProtectedHeader({ alg: ALGORITMO, typ: 'JWT' })
        .setSubject(actor.id)
        .setIssuer(EMISOR)
        .setAudience(AUDIENCIA)
        .setIssuedAt(iat)
        .setExpirationTime(exp)
        .sign(clave);
      return { token, expiraEn: new Date(exp * 1000) };
    },

    async verificar(token: string) {
      try {
        const { payload } = await jwtVerify(token, clave, {
          algorithms: [ALGORITMO],
          issuer: EMISOR,
          audience: AUDIENCIA,
          requiredClaims: ['sub', 'exp', 'iat'],
          currentDate: ahora(),
        });
        const { sub, roles, dcc } = payload;
        if (
          typeof sub !== 'string' ||
          typeof dcc !== 'boolean' ||
          !Array.isArray(roles) ||
          !roles.every((r): r is CodigoRol => typeof r === 'string' && esCodigoRol(r))
        ) {
          throw new ErrorNoAutenticado();
        }
        return { id: sub, roles, debeCambiarClave: dcc };
      } catch {
        throw new ErrorNoAutenticado();
      }
    },
  };
}
