// HTTP routes of flow 1: health, login, forced password change and audit log.
import { z } from 'zod';
import type { ServicioAuth } from '../../aplicacion/auth.js';
import { ErrorValidacion } from '../../aplicacion/errores.js';
import type { Auditoria } from '../../aplicacion/puertos.js';
import { alcanceBitacora } from '../../dominio/permisos.js';
import { actorDe, contextoDe, type crearRegistroRutas } from './registro-rutas.js';
import { parsear } from './validar.js';

const LoginSchema = z
  .object({
    // Same format as ck_usuario_nombre_usuario: anything else is rejected before any query (CP-24).
    nombreUsuario: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,40}$/),
    clave: z.string().min(1).max(256),
  })
  .strict();

const CambiarClaveSchema = z
  .object({
    claveActual: z.string().min(1).max(256),
    claveNueva: z.string().min(1).max(256),
  })
  .strict();

const BitacoraQuerySchema = z
  .object({
    // z.guid(): the seed uses fixed, non-RFC-4122 UUIDs such as 10000000-0000-0000-0000-000000000001.
    orden_id: z.guid().optional(),
    limite: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

interface Servicios {
  auth: ServicioAuth;
  auditoria: Auditoria;
}

export function registrarRutas(
  { agregar }: ReturnType<typeof crearRegistroRutas>,
  { auth, auditoria }: Servicios,
): void {
  agregar('get', '/health', { tipo: 'publica' }, (_req, res) => {
    res.json({ status: 'ok' });
  });

  agregar('post', '/auth/login', { tipo: 'publica' }, async (req, res) => {
    const { nombreUsuario, clave } = parsear(LoginSchema, req.body);
    const sesion = await auth.login(nombreUsuario, clave, contextoDe(req, res));
    res.set('Cache-Control', 'no-store').json(sesion);
  });

  agregar('post', '/auth/cambiar-clave', { tipo: 'sesion' }, async (req, res) => {
    const { claveActual, claveNueva } = parsear(CambiarClaveSchema, req.body);
    const sesion = await auth.cambiarClave(actorDe(res), claveActual, claveNueva, contextoDe(req, res));
    res.set('Cache-Control', 'no-store').json(sesion);
  });

  agregar('get', '/bitacora', { tipo: 'permiso', permiso: 'bitacora.ver' }, async (req, res) => {
    const { orden_id, limite } = parsear(BitacoraQuerySchema, req.query);
    // Table 7.1: the Encargada sees the log only per work order (◐).
    if (alcanceBitacora(actorDe(res).roles) === 'POR_ORDEN' && orden_id === undefined) {
      throw new ErrorValidacion('Debe indicar la orden de trabajo (orden_id)', [
        { campo: 'orden_id', problema: 'required' },
      ]);
    }
    res.json({ datos: await auditoria.listar({ ordenId: orden_id, limite }) });
  });
}
