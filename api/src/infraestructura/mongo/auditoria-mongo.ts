// Audit log in MongoDB (D3, HU-12). The API writes directly to
// bitacora_eventos; the PostgreSQL outbox relay is out of the MVP scope.
import type { Db } from 'mongodb';
import type { Auditoria, EventoBitacora, NuevoEvento } from '../../aplicacion/puertos.js';

interface DocumentoEvento {
  _id: string;
  ts: Date;
  tipo: string;
  agregado: { tipo: string; id: string };
  orden_id?: string | null;
  actor: { usuario_id: string | null; roles: string[]; ip?: string };
  payload: Record<string, unknown>;
  request_id?: string;
}

// The validator requires _id = "evt-<digits>". Ids come from an atomic counter
// and start above the ids used by the ES2 seed and the integrity scripts.
const DESPLAZAMIENTO_ID = 1_000_000;
const MAX_IP = 45;

export function crearAuditoriaMongo(db: Db, log: Pick<Console, 'error'> = console): Auditoria {
  const eventos = db.collection<DocumentoEvento>('bitacora_eventos');
  const contadores = db.collection<{ _id: string; seq: number }>('contadores');

  async function siguienteId(): Promise<string> {
    const doc = await contadores.findOneAndUpdate(
      { _id: 'bitacora_eventos' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
    return `evt-${DESPLAZAMIENTO_ID + (doc?.seq ?? 0)}`;
  }

  return {
    async registrar(e: NuevoEvento) {
      try {
        const actor: DocumentoEvento['actor'] = { usuario_id: e.actor.usuarioId, roles: [...e.actor.roles] };
        if (e.contexto.ip) actor.ip = e.contexto.ip.slice(0, MAX_IP);
        const doc: DocumentoEvento = {
          _id: await siguienteId(),
          ts: new Date(),
          tipo: e.tipo,
          agregado: { tipo: e.agregado.tipo, id: e.agregado.id.slice(0, 40) },
          actor,
          payload: e.payload,
        };
        if (e.ordenId !== undefined) doc.orden_id = e.ordenId;
        if (e.contexto.requestId) doc.request_id = e.contexto.requestId;
        await eventos.insertOne(doc);
      } catch (err) {
        // Best effort: the user's action already happened; the failure is only logged.
        log.error({ msg: 'audit write failed', tipo: e.tipo, requestId: e.contexto.requestId, err });
      }
    },

    async listar({ ordenId, limite }) {
      // The filter is built from validated primitives only, never from req.body (AM-02).
      const filtro = ordenId === undefined ? {} : { orden_id: { $eq: ordenId } };
      const docs = await eventos.find(filtro).sort({ ts: -1, _id: -1 }).limit(limite).toArray();
      return docs.map((d): EventoBitacora => {
        const actor: EventoBitacora['actor'] = { usuarioId: d.actor.usuario_id, roles: d.actor.roles };
        if (d.actor.ip) actor.ip = d.actor.ip;
        const evento: EventoBitacora = {
          id: d._id,
          ts: d.ts,
          tipo: d.tipo,
          agregado: d.agregado,
          ordenId: d.orden_id ?? null,
          actor,
          payload: d.payload,
        };
        if (d.request_id) evento.requestId = d.request_id;
        return evento;
      });
    },
  };
}
