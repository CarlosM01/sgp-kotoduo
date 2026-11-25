import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fechaLocal } from '../../src/dominio/calendario.js';
import { prepararEntorno, type Entorno, type UsuarioPrueba } from './apoyo.js';

type Sesion = UsuarioPrueba & { token: string };

let entorno: Entorno;
let encargada: Sesion;
let operarioA: Sesion;
let operarioB: Sesion;
let vendedor: Sesion;
const MARCA = `T-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  entorno = await prepararEntorno();
  [encargada, operarioA, operarioB, vendedor] = await Promise.all([
    entorno.sesion('ENCARGADA_PRODUCCION'),
    entorno.sesion('OPERARIO'),
    entorno.sesion('OPERARIO'),
    entorno.sesion('VENDEDOR'),
  ]);
});
afterAll(async () => {
  await entorno?.limpiar();
});

interface EtapaCreada {
  id: string;
  secuencia: number;
  nombre: string;
}

const api = () => entorno.app();
const pool = () => entorno.contenedor.pool;

async function etapaEnBd(id: string): Promise<{ estado: string; version: number; responsable_id: string | null; terminada_en: Date | null }> {
  const { rows } = await pool().query(`SELECT estado, version, responsable_id, terminada_en FROM sgp.etapa_orden WHERE id = $1`, [id]);
  return rows[0];
}

async function ordenEnBd(id: string): Promise<{ estado: string; terminada_en: Date | null }> {
  const { rows } = await pool().query(`SELECT estado, terminada_en FROM sgp.orden_trabajo WHERE id = $1`, [id]);
  return rows[0];
}

/** Creates an order of the given type and assigns every stage to `responsable`. */
async function ordenAsignada(responsable: Sesion, tipoTrabajoId = 2): Promise<{ ordenId: string; etapas: EtapaCreada[] }> {
  const creada = await request(api())
    .post('/api/v1/ordenes')
    .auth(encargada.token, { type: 'bearer' })
    .send({
      tipoTrabajoId,
      titulo: `${MARCA} · orden ${randomUUID().slice(0, 4)}`,
      referenciaCliente: 'Cliente de prueba',
      cantidad: 2,
      fechaCompromiso: fechaLocal(new Date(Date.now() + 20 * 86_400_000)),
    });
  expect(creada.status).toBe(201);
  const detalle = await request(api()).get(`/api/v1/ordenes/${creada.body.id}`).auth(encargada.token, { type: 'bearer' });
  for (const e of detalle.body.etapas as Array<EtapaCreada & { version: number }>) {
    const r = await asignar(e.id, responsable.id, e.version);
    expect(r.status).toBe(200);
  }
  return { ordenId: creada.body.id, etapas: detalle.body.etapas };
}

const asignar = (etapaId: string, responsableId: string, version: number, token = encargada.token) =>
  request(api()).patch(`/api/v1/etapas/${etapaId}/responsable`).auth(token, { type: 'bearer' }).send({ responsableId, version });

const accion = (verbo: 'iniciar' | 'terminar', etapaId: string, version: number, quien: Sesion) =>
  request(api()).post(`/api/v1/etapas/${etapaId}/${verbo}`).auth(quien.token, { type: 'bearer' }).send({ version });

/** Starts and finishes a stage with the current version; returns the finish response. */
async function completar(etapaId: string, quien: Sesion) {
  const ini = await accion('iniciar', etapaId, (await etapaEnBd(etapaId)).version, quien);
  expect(ini.status).toBe(200);
  return accion('terminar', etapaId, ini.body.version, quien);
}

describe('HU-08 (partial): assigning the responsible person', () => {
  it('the Encargada assigns a stage: version +1, stored in PostgreSQL and logged', async () => {
    const { etapas } = await ordenAsignada(operarioA);
    const etapa = etapas[1]!;
    const antes = await etapaEnBd(etapa.id);

    const res = await asignar(etapa.id, operarioB.id, antes.version);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ etapaId: etapa.id, responsableId: operarioB.id, version: antes.version + 1 });
    expect(await etapaEnBd(etapa.id)).toMatchObject({ responsable_id: operarioB.id, version: antes.version + 1, estado: 'PENDIENTE' });
    const evento = (await entorno.eventosDe(encargada.id)).findLast((e) => e.tipo === 'ETAPA_ASIGNADA');
    expect(evento?.payload).toMatchObject({ responsable_anterior: operarioA.id, responsable_nuevo: operarioB.id });
  });

  it('rejects a stale version (409), an assignee who cannot advance stages (400) and a VENDEDOR (403)', async () => {
    const { etapas } = await ordenAsignada(operarioA);
    const etapa = etapas[0]!;
    const { version } = await etapaEnBd(etapa.id);

    expect((await asignar(etapa.id, operarioB.id, version - 1)).status).toBe(409);
    expect((await asignar(etapa.id, vendedor.id, version)).status).toBe(400);
    expect((await asignar(etapa.id, randomUUID(), version)).status).toBe(400);
    expect((await asignar(etapa.id, operarioB.id, version, vendedor.token)).status).toBe(403);
    expect((await asignar(randomUUID(), operarioB.id, 1)).status).toBe(404);
    expect(await etapaEnBd(etapa.id)).toMatchObject({ responsable_id: operarioA.id, version });
  });
});

describe('HU-08: assignment is refused on closed stages and orders', () => {
  it('a TERMINADA stage → 409 and nothing changes', async () => {
    const { etapas } = await ordenAsignada(operarioA);
    await completar(etapas[0]!.id, operarioA);
    const antes = await etapaEnBd(etapas[0]!.id);

    const res = await asignar(etapas[0]!.id, operarioB.id, antes.version);

    expect(res.status).toBe(409);
    expect(await etapaEnBd(etapas[0]!.id)).toEqual(antes);
  });

  // A TERMINADA order has every stage closed, so the stage check answers first;
  // the order check is reached through a cancelled order with open stages.
  it('an open stage of an ANULADA order → 409 and nothing changes', async () => {
    const { ordenId, etapas } = await ordenAsignada(operarioA);
    await pool().query(`UPDATE sgp.orden_trabajo SET estado = 'ANULADA' WHERE id = $1`, [ordenId]);
    const antes = await etapaEnBd(etapas[1]!.id);

    const res = await asignar(etapas[1]!.id, operarioB.id, antes.version);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('La orden ya está cerrada');
    expect(await etapaEnBd(etapas[1]!.id)).toEqual(antes);
  });
});

describe('HU-01: Mi Trabajo', () => {
  it('lists only the stages of the operator and points to the next activity', async () => {
    const { etapas } = await ordenAsignada(operarioB, 1);

    const res = await request(api()).get('/api/v1/mi-trabajo').auth(operarioB.token, { type: 'bearer' });

    expect(res.status).toBe(200);
    const mias = res.body.etapas.filter((e: { orden: { titulo: string } }) => e.orden.titulo.startsWith(MARCA));
    expect(mias.length).toBeGreaterThanOrEqual(6);
    expect(res.body.siguiente).toMatchObject({ estado: 'DISPONIBLE' });
    expect(res.body.etapas.map((e: { id: string }) => e.id)).toContain(etapas[0]!.id);

    const ajeno = await request(api()).get('/api/v1/mi-trabajo').auth(operarioA.token, { type: 'bearer' });
    expect(ajeno.body.etapas.map((e: { id: string }) => e.id)).not.toContain(etapas[0]!.id);
  });

  it('each stage carries the supplies it requires, the same as the order detail (D26)', async () => {
    const { ordenId } = await ordenAsignada(operarioB, 1);

    const res = await request(api()).get('/api/v1/mi-trabajo').auth(operarioB.token, { type: 'bearer' });
    const det = await request(api()).get(`/api/v1/ordenes/${ordenId}`).auth(encargada.token, { type: 'bearer' });

    expect(res.status).toBe(200);
    const etapasDetalle = det.body.etapas as Array<{ id: string; requerimientos: unknown[] }>;
    expect(etapasDetalle.some((e) => e.requerimientos.length > 0)).toBe(true);
    for (const e of etapasDetalle) {
      const mia = res.body.etapas.find((x: { id: string }) => x.id === e.id);
      expect(mia.requerimientos).toEqual(e.requerimientos);
    }
  });

  it('a stage in progress is the next activity', async () => {
    const { etapas } = await ordenAsignada(operarioB);
    const ini = await accion('iniciar', etapas[0]!.id, (await etapaEnBd(etapas[0]!.id)).version, operarioB);
    expect(ini.status).toBe(200);

    const res = await request(api()).get('/api/v1/mi-trabajo').auth(operarioB.token, { type: 'bearer' });

    expect(res.body.siguiente).toMatchObject({ id: etapas[0]!.id, estado: 'EN_CURSO' });
  });

  it('a stage in progress of an order on hold is not the next activity', async () => {
    const operarioC = await entorno.sesion('OPERARIO');
    const { ordenId, etapas } = await ordenAsignada(operarioC);
    await accion('iniciar', etapas[0]!.id, (await etapaEnBd(etapas[0]!.id)).version, operarioC);
    await pool().query(`UPDATE sgp.orden_trabajo SET estado = 'DETENIDA' WHERE id = $1`, [ordenId]);

    const res = await request(api()).get('/api/v1/mi-trabajo').auth(operarioC.token, { type: 'bearer' });

    expect(res.body.etapas.map((e: { id: string }) => e.id)).toContain(etapas[0]!.id);
    expect(res.body.siguiente).toBeNull();
  });

  it('VENDEDOR → 403', async () => {
    const res = await request(api()).get('/api/v1/mi-trabajo').auth(vendedor.token, { type: 'bearer' });
    expect(res.status).toBe(403);
  });
});

describe('HU-02: start a stage', () => {
  it('the first start moves the stage to EN_CURSO and the order to EN_PRODUCCION, both logged', async () => {
    const { ordenId, etapas } = await ordenAsignada(operarioA);
    const { version } = await etapaEnBd(etapas[0]!.id);

    const res = await accion('iniciar', etapas[0]!.id, version, operarioA);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ etapaId: etapas[0]!.id, estado: 'EN_CURSO', version: version + 1, estadoOrden: 'EN_PRODUCCION' });
    expect(await etapaEnBd(etapas[0]!.id)).toMatchObject({ estado: 'EN_CURSO', version: version + 1 });
    expect((await ordenEnBd(ordenId)).estado).toBe('EN_PRODUCCION');
    const tipos = (await entorno.eventosDe(operarioA.id)).filter((e) => e.payload.por_etapa === etapas[0]!.nombre || e.tipo === 'ETAPA_INICIADA').map((e) => e.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['ETAPA_INICIADA', 'ORDEN_ESTADO_CAMBIADO']));
  });

  it('a PENDIENTE stage cannot start → 409 and nothing changes', async () => {
    const { etapas } = await ordenAsignada(operarioA);
    const antes = await etapaEnBd(etapas[1]!.id);

    const res = await accion('iniciar', etapas[1]!.id, antes.version, operarioA);

    expect(res.status).toBe(409);
    expect(await etapaEnBd(etapas[1]!.id)).toEqual(antes);
  });

  it('a stage of a cancelled order cannot start → 409 and nothing changes', async () => {
    const { ordenId, etapas } = await ordenAsignada(operarioA);
    await pool().query(`UPDATE sgp.orden_trabajo SET estado = 'ANULADA' WHERE id = $1`, [ordenId]);
    const antes = await etapaEnBd(etapas[0]!.id);

    const res = await accion('iniciar', etapas[0]!.id, antes.version, operarioA);

    expect(res.status).toBe(409);
    expect(await etapaEnBd(etapas[0]!.id)).toEqual(antes);
    expect((await ordenEnBd(ordenId)).estado).toBe('ANULADA');
  });

  it('with the order DETENIDA a stage cannot finish → 409', async () => {
    const { ordenId, etapas } = await ordenAsignada(operarioA);
    const ini = await accion('iniciar', etapas[0]!.id, (await etapaEnBd(etapas[0]!.id)).version, operarioA);
    await pool().query(`UPDATE sgp.orden_trabajo SET estado = 'DETENIDA' WHERE id = $1`, [ordenId]);

    const res = await accion('terminar', etapas[0]!.id, ini.body.version, operarioA);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/detenida/i);
    expect((await etapaEnBd(etapas[0]!.id)).estado).toBe('EN_CURSO');
  });
});

describe('CP-12: finishing a stage enables the next one (HU-02 / CU-06)', () => {
  it('200 with the next stage and its area; the next stage becomes DISPONIBLE', async () => {
    const { etapas } = await ordenAsignada(operarioA, 1);

    const res = await completar(etapas[0]!.id, operarioA);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'TERMINADA', siguienteEtapa: 'Impresión de transfer', area: 'Impresión gran formato', ordenTerminada: false });
    expect(await etapaEnBd(etapas[0]!.id)).toMatchObject({ estado: 'TERMINADA', terminada_en: expect.any(Date) });
    expect((await etapaEnBd(etapas[1]!.id)).estado).toBe('DISPONIBLE');
    expect((await etapaEnBd(etapas[2]!.id)).estado).toBe('PENDIENTE');
    const evento = (await entorno.eventosDe(operarioA.id)).findLast((e) => e.tipo === 'ETAPA_TERMINADA');
    expect(evento?.payload).toMatchObject({ estado_nuevo: 'TERMINADA', siguiente_etapa: 'Impresión de transfer', siguiente_area: 'Impresión gran formato' });
  });

  it('variant: with stage 3 OMITIDA, finishing stage 2 enables stage 4', async () => {
    const { etapas } = await ordenAsignada(operarioA, 1);
    await completar(etapas[0]!.id, operarioA);
    await pool().query(`UPDATE sgp.etapa_orden SET estado = 'OMITIDA' WHERE id = $1`, [etapas[2]!.id]);

    const res = await completar(etapas[1]!.id, operarioA);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ siguienteEtapa: 'Corte', area: 'Corte' });
    expect((await etapaEnBd(etapas[2]!.id)).estado).toBe('OMITIDA');
    expect((await etapaEnBd(etapas[3]!.id)).estado).toBe('DISPONIBLE');
  });
});

describe('CP-13: finishing the last stage closes the order (HU-02 / CU-06)', () => {
  it('the order becomes TERMINADA with terminada_en and ORDEN_ESTADO_CAMBIADO is logged', async () => {
    const { ordenId, etapas } = await ordenAsignada(operarioA);
    for (const e of etapas.slice(0, -1)) expect((await completar(e.id, operarioA)).body.ordenTerminada).toBe(false);
    expect((await ordenEnBd(ordenId)).estado).toBe('EN_PRODUCCION');

    const res = await completar(etapas.at(-1)!.id, operarioA);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ siguienteEtapa: null, area: null, ordenTerminada: true });
    expect(await ordenEnBd(ordenId)).toEqual({ estado: 'TERMINADA', terminada_en: expect.any(Date) });
    const cierre = (await entorno.eventosDe(operarioA.id)).find(
      (e) => e.tipo === 'ORDEN_ESTADO_CAMBIADO' && e.payload.estado_nuevo === 'TERMINADA' && e.payload.por_etapa === etapas.at(-1)!.nombre,
    );
    expect(cierre?.payload).toMatchObject({ estado_anterior: 'EN_PRODUCCION', estado_nuevo: 'TERMINADA' });

    // A finished order no longer appears in Mi Trabajo.
    const mt = await request(api()).get('/api/v1/mi-trabajo').auth(operarioA.token, { type: 'bearer' });
    expect(mt.body.etapas.map((e: { orden: { id: string } }) => e.orden.id)).not.toContain(ordenId);
  });
});

describe('CP-19: concurrency on the same stage (HU-02 / CU-06)', () => {
  it.each([1, 2, 3])('round %i: two simultaneous finishes with the same version → one 200 and one 409', async () => {
    const { etapas } = await ordenAsignada(operarioA);
    const ini = await accion('iniciar', etapas[0]!.id, (await etapaEnBd(etapas[0]!.id)).version, operarioA);

    const respuestas = await Promise.all([
      accion('terminar', etapas[0]!.id, ini.body.version, operarioA),
      accion('terminar', etapas[0]!.id, ini.body.version, operarioA),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(respuestas.find((r) => r.status === 409)?.body.error.code).toBe('CONFLICT');
    expect((await etapaEnBd(etapas[0]!.id)).estado).toBe('TERMINADA');
    expect((await etapaEnBd(etapas[1]!.id)).estado).toBe('DISPONIBLE');
    expect((await etapaEnBd(etapas[2]!.id)).estado).toBe('PENDIENTE');
    // The stage changed once: one version bump and exactly one finish in the audit log.
    expect((await etapaEnBd(etapas[0]!.id)).version).toBe(ini.body.version + 1);
    const terminadas = await entorno.contenedor.mongo
      .db()
      .collection('bitacora_eventos')
      .countDocuments({ tipo: 'ETAPA_TERMINADA', 'agregado.id': etapas[0]!.id });
    expect(terminadas).toBe(1);
  });
  it('a stale version (the client did not reload) → 409 and nothing changes', async () => {
    const { etapas } = await ordenAsignada(operarioA);
    const ini = await accion('iniciar', etapas[0]!.id, (await etapaEnBd(etapas[0]!.id)).version, operarioA);
    const antes = await etapaEnBd(etapas[0]!.id);

    const res = await accion('terminar', etapas[0]!.id, ini.body.version - 1, operarioA);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/modificada por otra persona/);
    expect(await etapaEnBd(etapas[0]!.id)).toEqual(antes);
    expect((await etapaEnBd(etapas[1]!.id)).estado).toBe('PENDIENTE');
  });
});

describe('CP-27: horizontal IDOR (AM-05)', () => {
  it.each(['iniciar', 'terminar'] as const)('operator B → POST /etapas/{stage of A}/%s is 404, unchanged and logged', async (verbo) => {
    const { etapas } = await ordenAsignada(operarioA);
    if (verbo === 'terminar') await accion('iniciar', etapas[0]!.id, (await etapaEnBd(etapas[0]!.id)).version, operarioA);
    const antes = await etapaEnBd(etapas[0]!.id);

    const res = await accion(verbo, etapas[0]!.id, antes.version, operarioB);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
    expect(await etapaEnBd(etapas[0]!.id)).toEqual(antes);
    const denegado = (await entorno.eventosDe(operarioB.id)).findLast((e) => e.tipo === 'ACCESO_DENEGADO');
    expect(denegado?.payload).toEqual({ metodo: 'POST', ruta: `/etapas/{id}/${verbo}`, motivo: 'NO_ES_RESPONSABLE' });
  });

  it('the Encargada cannot advance a stage she is not responsible for either (Table 7.1 ◐) → 404', async () => {
    const { etapas } = await ordenAsignada(operarioA);
    const antes = await etapaEnBd(etapas[0]!.id);

    const res = await accion('iniciar', etapas[0]!.id, antes.version, encargada);

    expect(res.status).toBe(404);
    expect(await etapaEnBd(etapas[0]!.id)).toEqual(antes);
  });

  it('a missing or malformed stage id answers the same 404', async () => {
    for (const id of [randomUUID(), 'not-a-uuid']) {
      const res = await accion('terminar', id, 1, operarioB);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
    }
  });

  it('VENDEDOR has no etapas.avanzar → 403 before any lookup', async () => {
    const res = await accion('iniciar', randomUUID(), 1, vendedor);
    expect(res.status).toBe(403);
  });
});
