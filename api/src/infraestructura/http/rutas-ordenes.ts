// HTTP routes of flows 2 and 3: templates, work orders, stages and panel.
// Permissions come from the single map (Table 7.1); ownership of a stage is
// checked by the use case (CP-27).
import type { Request } from 'express';
import { z } from 'zod';
import { ErrorNoEncontrado } from '../../aplicacion/errores.js';
import type { ServicioEtapas } from '../../aplicacion/etapas.js';
import type { ServicioOrdenes } from '../../aplicacion/ordenes.js';
import { FILTROS_PANEL } from '../../aplicacion/puertos.js';
import { ESTADOS_ORDEN } from '../../dominio/estados.js';
import { ConsumosSchema } from '../../dominio/insumos.js';
import { NuevaOrdenSchema } from '../../dominio/nueva-orden.js';
import { actorDe, contextoDe, type crearRegistroRutas } from './registro-rutas.js';
import { parsear } from './validar.js';

// z.guid(): the seed uses fixed, non-RFC-4122 UUIDs (10000000-0000-0000-0000-000000000001).
const IdSchema = z.guid();

/**
 * Stage ids: a malformed id answers the same 404 as a missing or foreign stage,
 * so the response never tells them apart (CP-27).
 */
function idEtapaDe(req: Request): string {
  const r = IdSchema.safeParse(req.params.id);
  if (!r.success) throw new ErrorNoEncontrado();
  return r.data;
}

/** Order ids: a malformed id is rejected by validation with 400 (CP-24). */
const idOrdenDe = (req: Request): string => parsear(z.object({ id: IdSchema }), { id: req.params.id }).id;

const paginacion = {
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  tamano: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(60).optional(),
};

const ListarOrdenesSchema = z.object({ ...paginacion, estado: z.enum(ESTADOS_ORDEN).optional() }).strict();
const PanelSchema = z.object({ ...paginacion, filtro: z.enum(FILTROS_PANEL).default('activas') }).strict();
const VersionSchema = z.object({ version: z.number().int().min(1) }).strict();
// CP-12, D23: actual consumptions of the stage's supplies; none when omitted.
const TerminarSchema = z.object({ version: z.number().int().min(1), consumos: ConsumosSchema }).strict();
const AsignarSchema = z.object({ responsableId: IdSchema, version: z.number().int().min(1) }).strict();

interface Servicios {
  ordenes: ServicioOrdenes;
  etapas: ServicioEtapas;
}

export function registrarRutasOrdenes({ agregar }: ReturnType<typeof crearRegistroRutas>, { ordenes, etapas }: Servicios): void {
  agregar('get', '/plantillas', { tipo: 'permiso', permiso: 'ordenes.crear' }, async (_req, res) => {
    res.json({ datos: await ordenes.plantillas() });
  });

  agregar('post', '/ordenes', { tipo: 'permiso', permiso: 'ordenes.crear' }, async (req, res) => {
    const datos = parsear(NuevaOrdenSchema, req.body);
    const creada = await ordenes.crear(actorDe(res), datos, contextoDe(req, res));
    res.status(201).location(`/api/v1/ordenes/${creada.id}`).json(creada);
  });

  agregar('get', '/ordenes', { tipo: 'permiso', permiso: 'ordenes.ver' }, async (req, res) => {
    res.json(await ordenes.listar(parsear(ListarOrdenesSchema, req.query)));
  });

  agregar('get', '/ordenes/:id', { tipo: 'permiso', permiso: 'ordenes.ver' }, async (req, res) => {
    res.json(await ordenes.obtener(idOrdenDe(req)));
  });

  agregar('patch', '/etapas/:id/responsable', { tipo: 'permiso', permiso: 'etapas.gestionar' }, async (req, res) => {
    const id = idEtapaDe(req);
    const datos = parsear(AsignarSchema, req.body);
    res.json(await ordenes.asignarResponsable(actorDe(res), id, datos, contextoDe(req, res)));
  });

  agregar('get', '/mi-trabajo', { tipo: 'permiso', permiso: 'etapas.avanzar' }, async (_req, res) => {
    res.json(await etapas.miTrabajo(actorDe(res)));
  });

  agregar('post', '/etapas/:id/iniciar', { tipo: 'permiso', permiso: 'etapas.avanzar' }, async (req, res) => {
    const id = idEtapaDe(req);
    const { version } = parsear(VersionSchema, req.body);
    res.json(await etapas.iniciar(actorDe(res), id, version, contextoDe(req, res)));
  });

  agregar('post', '/etapas/:id/terminar', { tipo: 'permiso', permiso: 'etapas.avanzar' }, async (req, res) => {
    const id = idEtapaDe(req);
    const { version, consumos } = parsear(TerminarSchema, req.body);
    res.json(await etapas.terminar(actorDe(res), id, version, consumos, contextoDe(req, res)));
  });

  agregar('get', '/panel', { tipo: 'permiso', permiso: 'panel.ver' }, async (req, res) => {
    res.json(await ordenes.panel(parsear(PanelSchema, req.query)));
  });
}
