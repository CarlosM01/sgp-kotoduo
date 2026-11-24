// =====================================================================
// SGP-Kotoduo — MongoDB demo seed (F1). Runs after mongo_init.js.
// Adds the audit event for the creation of DEMO-01 (OT-2026-0001), so the
// order history combines PostgreSQL rows with MongoDB events (HU-12).
// Ids match db/postgres/02_seed.sql. Idempotent: upsert by _id.
// =====================================================================
const evento = {
  _id: 'evt-1841',
  ts: new Date(Date.now() - 3 * 24 * 3600 * 1000),
  tipo: 'ORDEN_REGISTRADA',
  agregado: { tipo: 'orden_trabajo', id: '10000000-0000-0000-0000-000000000001' },
  orden_id: '10000000-0000-0000-0000-000000000001',
  actor: { usuario_id: '00000000-0000-0000-0000-000000000003', roles: ['VENDEDOR'] },
  payload: { codigo: 'OT-2026-0001', titulo: 'DEMO-01 · Camisetas sublimadas Club Deportivo Demo', etapas: 6 },
};

const r = db.bitacora_eventos.updateOne({ _id: evento._id }, { $setOnInsert: evento }, { upsert: true });
print(`OK seed bitacora_eventos: ${r.upsertedCount} evento(s) insertado(s) para DEMO-01`);
print(`Eventos de DEMO-01: ${db.bitacora_eventos.countDocuments({ orden_id: evento.orden_id })}`);
