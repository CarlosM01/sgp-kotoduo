// =====================================================================
// SGP-Kotoduo — Manual integrity check for MongoDB (F1, criterion 3.1.2).
// Invalid audit events must be rejected by the bitacora_eventos validator.
//
//   docker compose exec -T mongo mongosh --quiet sgp_docs --file /bd/pruebas_integridad.js
// =====================================================================
const antes = db.bitacora_eventos.countDocuments();
print(`--- Baseline: ${antes} eventos`);

const intentos = [
  ['M-01 tipo de evento fuera del enum', {
    _id: 'evt-900001', ts: new Date(), tipo: 'BORRADO_MASIVO',
    agregado: { tipo: 'orden_trabajo', id: 'x' }, actor: { usuario_id: null, roles: [] }, payload: {},
  }],
  ['M-02 falta el campo obligatorio actor', {
    _id: 'evt-900002', ts: new Date(), tipo: 'LOGIN_FALLIDO',
    agregado: { tipo: 'usuario', id: 'x' }, payload: {},
  }],
  ['M-03 ts como texto en vez de fecha', {
    _id: 'evt-900003', ts: '2026-11-24', tipo: 'LOGIN_EXITOSO',
    agregado: { tipo: 'usuario', id: 'x' }, actor: { usuario_id: null, roles: [] }, payload: {},
  }],
  ['M-04 campo no declarado (additionalProperties: false)', {
    _id: 'evt-900004', ts: new Date(), tipo: 'LOGIN_EXITOSO',
    agregado: { tipo: 'usuario', id: 'x' }, actor: { usuario_id: null, roles: [] }, payload: {},
    password: 'no-deberia-guardarse',
  }],
];

for (const [nombre, doc] of intentos) {
  try {
    db.bitacora_eventos.insertOne(doc);
    print(`FALLA ${nombre}: documento aceptado`);
  } catch (e) {
    print(`OK ${nombre}: rechazado (code ${e.code}: ${e.message})`);
  }
}

const despues = db.bitacora_eventos.countDocuments();
const invalidos = db.bitacora_eventos.countDocuments({ _id: /^evt-9000/ });
print(`--- Verificación: ${despues} eventos (antes ${antes}), documentos inválidos guardados: ${invalidos}`);
