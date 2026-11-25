// Flow 4 (HU-09, HU-03; CU-08, CU-09): consumptions when a stage is finished,
// the single automatic alert and the manual shortage report. Every test uses
// its own "T-" supplies, so the stock of the seed supplies never changes.
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
interface Consumo {
  insumoId: number;
  cantidad: number;
}

const api = () => entorno.app();
const pool = () => entorno.contenedor.pool;

async function etapaEnBd(id: string): Promise<{ estado: string; version: number }> {
  const { rows } = await pool().query(`SELECT estado, version FROM sgp.etapa_orden WHERE id = $1`, [id]);
  return rows[0];
}

async function insumoEnBd(id: number): Promise<{ stock: number; movimientos: number; alertasAutoAbiertas: number }> {
  const { rows: [r] } = await pool().query(
    `SELECT i.stock_actual::float8 AS stock,
            (SELECT COUNT(*)::int FROM sgp.movimiento_insumo m WHERE m.insumo_id = i.id) AS movimientos,
            (SELECT COUNT(*)::int FROM sgp.alerta_insumo a
              WHERE a.insumo_id = i.id AND a.origen = 'AUTOMATICA' AND a.estado <> 'CERRADA') AS "alertasAutoAbiertas"
       FROM sgp.insumo i WHERE i.id = $1`,
    [id],
  );
  return r;
}

async function consumidoEnBd(etapaId: string, insumoId: number): Promise<number> {
  const { rows: [r] } = await pool().query(
    `SELECT cantidad_consumida::float8 AS c FROM sgp.requerimiento_insumo WHERE etapa_orden_id = $1 AND insumo_id = $2`,
    [etapaId, insumoId],
  );
  return r.c;
}

/** Creates an order, assigns every stage to `responsable` and makes `insumoId` a requirement of every stage. */
async function ordenConInsumo(responsable: Sesion, insumoId: number): Promise<EtapaCreada[]> {
  const creada = await request(api())
    .post('/api/v1/ordenes')
    .auth(encargada.token, { type: 'bearer' })
    .send({
      tipoTrabajoId: 2,
      titulo: `${MARCA} · insumos ${randomUUID().slice(0, 4)}`,
      referenciaCliente: 'Cliente de prueba',
      cantidad: 1,
      fechaCompromiso: fechaLocal(new Date(Date.now() + 20 * 86_400_000)),
    });
  expect(creada.status).toBe(201);
  const detalle = await request(api()).get(`/api/v1/ordenes/${creada.body.id}`).auth(encargada.token, { type: 'bearer' });
  const etapas = detalle.body.etapas as Array<EtapaCreada & { version: number }>;
  for (const e of etapas) {
    const r = await request(api())
      .patch(`/api/v1/etapas/${e.id}/responsable`)
      .auth(encargada.token, { type: 'bearer' })
      .send({ responsableId: responsable.id, version: e.version });
    expect(r.status).toBe(200);
    await pool().query(
      `INSERT INTO sgp.requerimiento_insumo (etapa_orden_id, insumo_id, cantidad_requerida) VALUES ($1, $2, 3)`,
      [e.id, insumoId],
    );
  }
  return etapas;
}

async function iniciar(etapaId: string, quien: Sesion): Promise<number> {
  const res = await request(api())
    .post(`/api/v1/etapas/${etapaId}/iniciar`)
    .auth(quien.token, { type: 'bearer' })
    .send({ version: (await etapaEnBd(etapaId)).version });
  expect(res.status).toBe(200);
  return res.body.version as number;
}

const terminar = (etapaId: string, version: number, quien: Sesion, consumos?: Consumo[]) =>
  request(api())
    .post(`/api/v1/etapas/${etapaId}/terminar`)
    .auth(quien.token, { type: 'bearer' })
    .send(consumos ? { version, consumos } : { version });

/** Starts and finishes a stage with the given consumptions. */
async function completar(etapaId: string, quien: Sesion, consumos?: Consumo[]) {
  return terminar(etapaId, await iniciar(etapaId, quien), quien, consumos);
}

const reportar = (body: Record<string, unknown>, quien: Sesion) =>
  request(api()).post('/api/v1/alertas').auth(quien.token, { type: 'bearer' }).send(body);

describe('CP-14: a single automatic alert, and no negative stock (HU-09 / CU-08)', () => {
  it('consumptions of 2.5 and 0.5 open one AUTOMATICA alert; a third of 2 → 409 and the whole finish is rolled back', async () => {
    const papel = await entorno.crearInsumo(4, 2);
    const etapas = await ordenConInsumo(operarioA, papel.id);
    const [e1, e2, e3, e4] = etapas;

    // 4 − 2.5 = 1.5 ≤ 2: the trigger opens the alert.
    const r1 = await completar(e1!.id, operarioA, [{ insumoId: papel.id, cantidad: 2.5 }]);
    expect(r1.status).toBe(200);
    expect(r1.body.consumos).toEqual([{ insumoId: papel.id, codigo: papel.codigo, cantidad: 2.5, stockActual: 1.5, bajoMinimo: true }]);
    expect(r1.body.alertas).toEqual([{ id: expect.any(Number), insumoId: papel.id, codigo: papel.codigo }]);
    expect(await insumoEnBd(papel.id)).toEqual({ stock: 1.5, movimientos: 1, alertasAutoAbiertas: 1 });
    expect(await consumidoEnBd(e1!.id, papel.id)).toBe(2.5);
    const { rows: [mov] } = await pool().query(
      `SELECT tipo, cantidad::float8 AS cantidad, etapa_orden_id, usuario_id FROM sgp.movimiento_insumo WHERE insumo_id = $1`,
      [papel.id],
    );
    expect(mov).toEqual({ tipo: 'CONSUMO', cantidad: -2.5, etapa_orden_id: e1!.id, usuario_id: operarioA.id });

    // 1.5 − 0.5 = 1.0: still under the minimum, but no second alert.
    const r2 = await completar(e2!.id, operarioA, [{ insumoId: papel.id, cantidad: 0.5 }]);
    expect(r2.status).toBe(200);
    expect(r2.body.alertas).toEqual([]);
    expect(await insumoEnBd(papel.id)).toEqual({ stock: 1, movimientos: 2, alertasAutoAbiertas: 1 });

    // 1.0 − 2 < 0: refused, and nothing of the finish is kept.
    const version = await iniciar(e3!.id, operarioA);
    const r3 = await terminar(e3!.id, version, operarioA, [{ insumoId: papel.id, cantidad: 2 }]);
    expect(r3.status).toBe(409);
    expect(r3.body.error.message).toContain('Stock insuficiente');
    expect(await etapaEnBd(e3!.id)).toEqual({ estado: 'EN_CURSO', version });
    expect((await etapaEnBd(e4!.id)).estado).toBe('PENDIENTE');
    expect(await consumidoEnBd(e3!.id, papel.id)).toBe(0);
    expect(await insumoEnBd(papel.id)).toEqual({ stock: 1, movimientos: 2, alertasAutoAbiertas: 1 });
  });

  it('logs INSUMO_MOVIMIENTO and ALERTA_INSUMO_CREADA in the audit log', async () => {
    const insumo = await entorno.crearInsumo(10, 9);
    const [e1] = await ordenConInsumo(operarioB, insumo.id);

    const res = await completar(e1!.id, operarioB, [{ insumoId: insumo.id, cantidad: 1.25 }]);

    expect(res.status).toBe(200);
    const eventos = await entorno.eventosDe(operarioB.id);
    expect(eventos.find((e) => e.tipo === 'INSUMO_MOVIMIENTO' && e.payload.insumo === insumo.codigo)?.payload).toEqual({
      insumo: insumo.codigo,
      tipo: 'CONSUMO',
      cantidad: -1.25,
      stock_resultante: 8.75,
      etapa: e1!.nombre,
    });
    expect(eventos.find((e) => e.tipo === 'ALERTA_INSUMO_CREADA' && e.payload.insumo === insumo.codigo)?.payload).toEqual({
      insumo: insumo.codigo,
      origen: 'AUTOMATICA',
      stock_resultante: 8.75,
      stock_minimo: 9,
      etapa: e1!.nombre,
    });
  });
});

describe('D23: consumptions are limited to the supplies of the stage', () => {
  it('a supply the stage does not require → 400 and nothing changes', async () => {
    const requerido = await entorno.crearInsumo(10, 1);
    const ajeno = await entorno.crearInsumo(10, 1);
    const [e1] = await ordenConInsumo(operarioA, requerido.id);
    const version = await iniciar(e1!.id, operarioA);

    const res = await terminar(e1!.id, version, operarioA, [{ insumoId: ajeno.id, cantidad: 1 }]);

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ campo: 'consumos.0.insumoId', problema: 'not_required_by_stage' }]);
    expect(await etapaEnBd(e1!.id)).toEqual({ estado: 'EN_CURSO', version });
    expect(await insumoEnBd(ajeno.id)).toEqual({ stock: 10, movimientos: 0, alertasAutoAbiertas: 0 });
  });

  it('an invalid quantity → 400; finishing without consumptions leaves the stock as it was', async () => {
    const insumo = await entorno.crearInsumo(10, 1);
    const [e1] = await ordenConInsumo(operarioA, insumo.id);
    const version = await iniciar(e1!.id, operarioA);

    expect((await terminar(e1!.id, version, operarioA, [{ insumoId: insumo.id, cantidad: 0 }])).status).toBe(400);
    const res = await terminar(e1!.id, version, operarioA);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'TERMINADA', consumos: [], alertas: [] });
    expect(await insumoEnBd(insumo.id)).toEqual({ stock: 10, movimientos: 0, alertasAutoAbiertas: 0 });
  });
});

describe('D25: simultaneous consumptions of the same supply are serialized', () => {
  it('two finishes of 3 on a stock of 4 → one 200 and one 409, stock 1 and a single movement', async () => {
    const insumo = await entorno.crearInsumo(4, 0);
    const [a] = await ordenConInsumo(operarioA, insumo.id);
    const [b] = await ordenConInsumo(operarioB, insumo.id);
    const [va, vb] = [await iniciar(a!.id, operarioA), await iniciar(b!.id, operarioB)];

    const respuestas = await Promise.all([
      terminar(a!.id, va, operarioA, [{ insumoId: insumo.id, cantidad: 3 }]),
      terminar(b!.id, vb, operarioB, [{ insumoId: insumo.id, cantidad: 3 }]),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    // The loser waited for the supply lock and saw the new stock: readable 409, not the CHECK backstop.
    expect(respuestas.find((r) => r.status === 409)?.body.error.message).toBe(
      `Stock insuficiente de ${insumo.nombre}: quedan 1 PLIEGO`,
    );
    // Minimum 0: a final stock of 1 is above it, so no alert is opened.
    expect(await insumoEnBd(insumo.id)).toEqual({ stock: 1, movimientos: 1, alertasAutoAbiertas: 0 });
  });

  it('two finishes that both leave the stock under the minimum report the single alert once', async () => {
    const insumo = await entorno.crearInsumo(10, 9);
    const [a] = await ordenConInsumo(operarioA, insumo.id);
    const [b] = await ordenConInsumo(operarioB, insumo.id);
    const [va, vb] = [await iniciar(a!.id, operarioA), await iniciar(b!.id, operarioB)];

    const respuestas = await Promise.all([
      terminar(a!.id, va, operarioA, [{ insumoId: insumo.id, cantidad: 1 }]),
      terminar(b!.id, vb, operarioB, [{ insumoId: insumo.id, cantidad: 1 }]),
    ]);

    expect(respuestas.map((r) => r.status)).toEqual([200, 200]);
    expect(respuestas.map((r) => r.body.alertas.length).sort()).toEqual([0, 1]);
    expect(await insumoEnBd(insumo.id)).toEqual({ stock: 8, movimientos: 2, alertasAutoAbiertas: 1 });
  });
});

describe('CP-15: manual shortage report (HU-03 / CU-09)', () => {
  it('the operator of an EN_CURSO stage reports → 201, MANUAL alert with reportada_por, logged', async () => {
    const insumo = await entorno.crearInsumo(10, 1);
    const [e1] = await ordenConInsumo(operarioA, insumo.id);
    await iniciar(e1!.id, operarioA);

    const res = await reportar({ insumoId: insumo.id, etapaId: e1!.id, comentario: 'Queda medio rollo', cantidadFaltante: 2 }, operarioA);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      insumoId: insumo.id,
      etapaId: e1!.id,
      origen: 'MANUAL',
      estado: 'ABIERTA',
      creadaEn: expect.any(String),
    });
    const { rows: [a] } = await pool().query(
      `SELECT origen, estado, reportada_por, etapa_orden_id, comentario, cantidad_faltante::float8 AS faltante
         FROM sgp.alerta_insumo WHERE id = $1`,
      [res.body.id],
    );
    expect(a).toEqual({
      origen: 'MANUAL',
      estado: 'ABIERTA',
      reportada_por: operarioA.id,
      etapa_orden_id: e1!.id,
      comentario: 'Queda medio rollo',
      faltante: 2,
    });
    const evento = (await entorno.eventosDe(operarioA.id)).find((e) => e.tipo === 'ALERTA_INSUMO_CREADA' && e.payload.insumo === insumo.codigo);
    expect(evento?.payload).toEqual({ insumo: insumo.codigo, origen: 'MANUAL', cantidad_faltante: 2, etapa: e1!.nombre });
  });

  it('refuses a foreign stage (404, logged), a PENDIENTE stage (409), an unknown supply (400) and a VENDEDOR (403)', async () => {
    const insumo = await entorno.crearInsumo(10, 1);
    const [e1, e2] = await ordenConInsumo(operarioA, insumo.id);
    await iniciar(e1!.id, operarioA);
    const cuerpo = { insumoId: insumo.id, etapaId: e1!.id, comentario: 'Falta' };

    const ajena = await reportar(cuerpo, operarioB);
    expect(ajena.status).toBe(404);
    expect(ajena.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
    const denegado = (await entorno.eventosDe(operarioB.id)).findLast((e) => e.tipo === 'ACCESO_DENEGADO');
    expect(denegado?.payload).toEqual({ metodo: 'POST', ruta: '/alertas', motivo: 'NO_ES_RESPONSABLE' });

    expect((await reportar({ ...cuerpo, etapaId: randomUUID() }, operarioA)).status).toBe(404);
    expect((await reportar({ ...cuerpo, etapaId: e2!.id }, operarioA)).status).toBe(409);
    const desconocido = await reportar({ ...cuerpo, insumoId: 999_999 }, operarioA);
    expect(desconocido.status).toBe(400);
    expect(desconocido.body.error.details).toEqual([{ campo: 'insumoId', problema: 'not_found' }]);
    expect((await reportar({ ...cuerpo, origen: 'AUTOMATICA' }, operarioA)).status).toBe(400);
    expect((await reportar(cuerpo, vendedor)).status).toBe(403);

    const { rows: [r] } = await pool().query(`SELECT COUNT(*)::int AS n FROM sgp.alerta_insumo WHERE insumo_id = $1`, [insumo.id]);
    expect(r.n).toBe(0);
  });
});

describe('HU-09: the Encargada sees supplies and alerts', () => {
  it('GET /insumos marks the supply under its minimum with an open alert; GET /alertas lists both alerts', async () => {
    const insumo = await entorno.crearInsumo(5, 2);
    const [e1, e2] = await ordenConInsumo(operarioA, insumo.id);
    expect((await completar(e1!.id, operarioA, [{ insumoId: insumo.id, cantidad: 3.5 }])).status).toBe(200);
    await iniciar(e2!.id, operarioA);
    const xss = '<img src=x onerror=alert(1)>';
    expect((await reportar({ insumoId: insumo.id, etapaId: e2!.id, comentario: xss }, operarioA)).status).toBe(201);

    const insumos = await request(api()).get('/api/v1/insumos').auth(encargada.token, { type: 'bearer' });
    expect(insumos.status).toBe(200);
    expect(insumos.body.datos.find((i: { id: number }) => i.id === insumo.id)).toEqual({
      id: insumo.id,
      codigo: insumo.codigo,
      nombre: insumo.nombre,
      unidad: 'PLIEGO',
      stockActual: 1.5,
      stockMinimo: 2,
      bajoMinimo: true,
      alertasAbiertas: 2,
    });

    const alertas = await request(api())
      .get('/api/v1/alertas')
      .query({ insumoId: insumo.id })
      .auth(encargada.token, { type: 'bearer' });
    expect(alertas.status).toBe(200);
    expect(alertas.body).toMatchObject({ total: 2, pagina: 1, tamano: 20 });
    const [manual, auto] = alertas.body.datos;
    expect(manual).toMatchObject({
      origen: 'MANUAL',
      estado: 'ABIERTA',
      comentario: xss,
      insumo: { id: insumo.id, codigo: insumo.codigo },
      etapa: { id: e2!.id, nombre: e2!.nombre },
      reportadaPor: { id: operarioA.id },
    });
    expect(auto).toMatchObject({ origen: 'AUTOMATICA', cantidadFaltante: 0.5, comentario: null, reportadaPor: null, etapa: { id: e1!.id } });
    expect(manual.orden.codigo).toMatch(/^OT-\d{4}-\d{4,6}$/);

    const cerradas = await request(api())
      .get('/api/v1/alertas')
      .query({ insumoId: insumo.id, estado: 'cerradas' })
      .auth(encargada.token, { type: 'bearer' });
    expect(cerradas.body.total).toBe(0);

    const panel = await request(api()).get('/api/v1/panel').auth(encargada.token, { type: 'bearer' });
    expect(panel.body.resumen.alertasAbiertas).toBeGreaterThanOrEqual(2);
  });

  it('an operator cannot list supplies or alerts (403); a malformed filter → 400', async () => {
    expect((await request(api()).get('/api/v1/insumos').auth(operarioA.token, { type: 'bearer' })).status).toBe(403);
    expect((await request(api()).get('/api/v1/alertas').auth(operarioA.token, { type: 'bearer' })).status).toBe(403);
    const malo = await request(api()).get('/api/v1/alertas').query({ insumoId: "1' OR '1'='1" }).auth(encargada.token, { type: 'bearer' });
    expect(malo.status).toBe(400);
  });
});
