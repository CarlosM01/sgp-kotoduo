import cors from 'cors';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { ServicioAuth } from './aplicacion/auth.js';
import type { ServicioEtapas } from './aplicacion/etapas.js';
import type { ServicioInsumos } from './aplicacion/insumos.js';
import type { ServicioOrdenes } from './aplicacion/ordenes.js';
import { ErrorDemasiadasSolicitudes } from './aplicacion/errores.js';
import type { Auditoria, ServicioTokens } from './aplicacion/puertos.js';
import { asignarRequestId, crearManejadorErrores, noEncontrado } from './infraestructura/http/manejo-errores.js';
import { crearRegistroRutas, type RutaDeclarada } from './infraestructura/http/registro-rutas.js';
import { registrarRutasInsumos } from './infraestructura/http/rutas-insumos.js';
import { registrarRutasOrdenes } from './infraestructura/http/rutas-ordenes.js';
import { registrarRutas } from './infraestructura/http/rutas.js';

export interface Servicios {
  auth: ServicioAuth;
  ordenes: ServicioOrdenes;
  etapas: ServicioEtapas;
  insumos: ServicioInsumos;
  tokens: ServicioTokens;
  auditoria: Auditoria;
}

export interface AppOptions {
  corsOrigin: string;
  servicios: Servicios;
  /** Requests per minute and IP (ES2 Table 7.3, pattern 6). */
  limites?: { authPorMinuto?: number; apiPorMinuto?: number };
  log?: Pick<Console, 'error' | 'warn'>;
}

export interface Api {
  app: Express;
  rutas: readonly RutaDeclarada[];
}

function limitador(porMinuto: number) {
  return rateLimit({
    windowMs: 60_000,
    limit: porMinuto,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new ErrorDemasiadasSolicitudes()),
  });
}

export function crearApi(options: AppOptions): Api {
  const app = express();

  app.disable('x-powered-by');
  app.use(asignarRequestId);
  app.use(
    helmet({
      // The API only serves JSON: nothing may be loaded, framed or referred.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
      },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(cors({ origin: options.corsOrigin, credentials: true }));
  app.use('/api/v1/auth', limitador(options.limites?.authPorMinuto ?? 10));
  app.use('/api/v1', limitador(options.limites?.apiPorMinuto ?? 300));
  app.use(express.json({ limit: '100kb' }));

  const router = express.Router();
  const registro = crearRegistroRutas(router, options.servicios);
  registrarRutas(registro, options.servicios);
  registrarRutasOrdenes(registro, options.servicios);
  registrarRutasInsumos(registro, options.servicios);
  app.use('/api/v1', router);

  app.use(noEncontrado);
  app.use(crearManejadorErrores(options.log));

  return { app, rutas: registro.rutas };
}

export function createApp(options: AppOptions): Express {
  return crearApi(options).app;
}
