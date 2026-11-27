// =====================================================================
// SGP-Kotoduo — Manual integrity check for MongoDB (F1, criterion 3.1.2).
// Invalid audit events must be rejected by the bitacora_eventos validator.
//
//   docker compose exec -T mongo mongosh --quiet sgp_docs --file /bd/pruebas_integridad.js
//
// Only a validation error (code 121, DocumentValidationFailure) counts as a
// rejection. Any other outcome (accepted, duplicate key, other error) is a
// failure. Accepted invalid documents are removed at the end, so the script
// leaves no data behind, and the process exits with code 1 if any check failed.
// =====================================================================
const CODIGO_VALIDACION = 121;
const PREFIJO = /^evt-9000/;

const previos = db.bitacora_eventos.deleteMany({ _id: PREFIJO }).deletedCount;
if (previos > 0) print(`AVISO: se eliminaron ${previos} documento(s) inválido(s) de una ejecución anterior`);

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

let fallas = 0;
for (const [nombre, doc] of intentos) {
  try {
    db.bitacora_eventos.insertOne(doc);
    fallas++;
    print(`FALLA ${nombre}: documento aceptado`);
  } catch (e) {
    if (e.code === CODIGO_VALIDACION) {
      print(`OK ${nombre}: rechazado por el validador (code ${e.code}: ${e.message})`);
    } else {
      fallas++;
      print(`FALLA ${nombre}: error inesperado (code ${e.code}: ${e.message})`);
    }
  }
}

const guardados = db.bitacora_eventos.countDocuments({ _id: PREFIJO });
const despues = db.bitacora_eventos.countDocuments();
print(`--- Verificación: ${despues} eventos (antes ${antes}), documentos inválidos guardados: ${guardados}`);
if (guardados > 0) db.bitacora_eventos.deleteMany({ _id: PREFIJO });

print(fallas === 0 ? `RESULTADO: ${intentos.length}/${intentos.length} rechazados` : `RESULTADO: ${fallas} falla(s)`);
if (fallas > 0) quit(1);
