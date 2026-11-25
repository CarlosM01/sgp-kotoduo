// HTTP routes of flow 4: supplies and alerts. The Encargada reads them
// ("Gestionar insumos" in Table 7.1); the responsible person of a stage
// reports a shortage from it ("Reportar faltante", ◐: own stage, D24).
import { z } from 'zod';
import type { ServicioEtapas } from '../../aplicacion/etapas.js';
import type { ServicioInsumos } from '../../aplicacion/insumos.js';
import { FILTROS_ALERTA } from '../../aplicacion/puertos.js';
import { NuevaAlertaSchema } from '../../dominio/insumos.js';
import { actorDe, contextoDe, type crearRegistroRutas } from './registro-rutas.js';
import { parsear } from './validar.js';

const AlertasQuerySchema = z
  .object({
    estado: z.enum(FILTROS_ALERTA).default('abiertas'),
    insumoId: z.coerce.number().int().min(1).max(2_147_483_647).optional(),
    pagina: z.coerce.number().int().min(1).max(10_000).default(1),
    tamano: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

interface Servicios {
  insumos: ServicioInsumos;
  etapas: ServicioEtapas;
}

export function registrarRutasInsumos({ agregar }: ReturnType<typeof crearRegistroRutas>, { insumos, etapas }: Servicios): void {
  agregar('get', '/insumos', { tipo: 'permiso', permiso: 'insumos.gestionar' }, async (_req, res) => {
    res.json(await insumos.listar());
  });

  agregar('get', '/alertas', { tipo: 'permiso', permiso: 'insumos.gestionar' }, async (req, res) => {
    res.json(await insumos.alertas(parsear(AlertasQuerySchema, req.query)));
  });

  agregar('post', '/alertas', { tipo: 'permiso', permiso: 'insumos.reportar_faltante' }, async (req, res) => {
    const datos = parsear(NuevaAlertaSchema, req.body);
    res.status(201).json(await etapas.reportarFaltante(actorDe(res), datos, contextoDe(req, res)));
  });
}
