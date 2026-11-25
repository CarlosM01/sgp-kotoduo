// Route registry: every route declares its access rule, and the registry
// builds the middleware chain from it. Authorization is decided here, on the
// server, denying by default (ES2 section 7.3). The list of declared routes
// feeds the route inventory test (CP-28).
import type { Request, RequestHandler, Response, Router } from 'express';
import { ErrorCambioClaveRequerido, ErrorNoAutenticado, ErrorProhibido } from '../../aplicacion/errores.js';
import type { Actor, Auditoria, Contexto, ServicioTokens } from '../../aplicacion/puertos.js';
import { tienePermiso, type Permiso } from '../../dominio/permisos.js';

export type Acceso =
  | { tipo: 'publica' }
  /** Any valid session, including one that still must change its password (D12). */
  | { tipo: 'sesion' }
  | { tipo: 'permiso'; permiso: Permiso };

export type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete';

export interface RutaDeclarada {
  metodo: Metodo;
  ruta: string;
  acceso: Acceso;
}

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

export function actorDe(res: Response): Actor {
  const actor = res.locals.actor as Actor | undefined;
  if (!actor) throw new ErrorNoAutenticado();
  return actor;
}

export function contextoDe(req: Request, res: Response): Contexto {
  return { ip: req.ip, requestId: res.locals.requestId as string | undefined };
}

function autenticar(tokens: ServicioTokens, permiteCambioClave: boolean): RequestHandler {
  return async (req, res, next) => {
    const m = BEARER.exec(req.get('authorization') ?? '');
    if (!m?.[1]) throw new ErrorNoAutenticado();
    const actor = await tokens.verificar(m[1]);
    // While the password must be changed, the session only reaches cambiar-clave.
    if (actor.debeCambiarClave && !permiteCambioClave) throw new ErrorCambioClaveRequerido();
    res.locals.actor = actor;
    next();
  };
}

function requierePermiso(permiso: Permiso, metodo: Metodo, ruta: string, auditoria: Auditoria): RequestHandler {
  return async (req, res, next) => {
    const actor = actorDe(res);
    if (!tienePermiso(actor.roles, permiso)) {
      await auditoria.registrar({
        tipo: 'ACCESO_DENEGADO',
        agregado: { tipo: 'usuario', id: actor.id },
        actor: { usuarioId: actor.id, roles: actor.roles },
        payload: { metodo: metodo.toUpperCase(), ruta, permiso },
        contexto: contextoDe(req, res),
      });
      throw new ErrorProhibido();
    }
    next();
  };
}

export function crearRegistroRutas(router: Router, deps: { tokens: ServicioTokens; auditoria: Auditoria }) {
  const rutas: RutaDeclarada[] = [];

  function agregar(metodo: Metodo, ruta: string, acceso: Acceso, manejador: RequestHandler): void {
    rutas.push({ metodo, ruta, acceso });
    const cadena: RequestHandler[] = [];
    if (acceso.tipo !== 'publica') cadena.push(autenticar(deps.tokens, acceso.tipo === 'sesion'));
    if (acceso.tipo === 'permiso') cadena.push(requierePermiso(acceso.permiso, metodo, ruta, deps.auditoria));
    router[metodo](ruta, ...cadena, manejador);
  }

  return { agregar, rutas: rutas as readonly RutaDeclarada[] };
}
