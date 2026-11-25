import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepararEntorno, type Entorno, type UsuarioPrueba } from './apoyo.js';

let entorno: Entorno;
let encargada: UsuarioPrueba & { token: string };
const MARCA = `T-${randomUUID().slice(0, 8)}`;
const ids: Record<'atrasada' | 'manana' | 'terminada' | 'riesgo', string> = { atrasada: '', manana: '', terminada: '', riesgo: '' };

/**
 * Inserts an order straight into PostgreSQL (a past commitment date cannot be
 * registered through the API). Dates are relative to CURRENT_DATE, which the
 * pool evaluates in the business time zone.
 */
async function insertarOrden(sufijo: string, estado: string, compromiso: number, estimada: number | null, etapas: string[]): Promise<string> {
  const { pool } = entorno.contenedor;
  const { rows: [codigo] } = await pool.query<{ n: number }>(
    `SELECT COALESCE(MAX(split_part(codigo, '-', 3)::int), 0) + 1 + floor(random() * 1000)::int AS n
       FROM sgp.orden_trabajo WHERE codigo LIKE 'OT-1999-%'`,
  );
  const { rows: [o] } = await pool.query<{ id: string }>(
    `INSERT INTO sgp.orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, estado,
                                    fecha_compromiso, fecha_estimada_termino, creado_por, terminada_en)
     VALUES ($1, 2, $2, 'Panel', 1, $3::varchar, CURRENT_DATE + $4::int, CURRENT_DATE + $5::int, $6,
             CASE WHEN $3::varchar IN ('TERMINADA','ENTREGADA') THEN now() END)
     RETURNING id`,
    [`OT-1999-${String(codigo!.n).padStart(6, '0')}`, `${MARCA} ${sufijo}`, estado, compromiso, estimada, encargada.id],
  );
  for (const [i, e] of etapas.entries()) {
    await pool.query(
      `INSERT INTO sgp.etapa_orden (orden_id, secuencia, nombre, area_id, instrucciones, estado, duracion_estimada_horas,
                                    iniciada_en, terminada_en)
       VALUES ($1, $2, $3, 3, 'prueba', $4::varchar, 1,
               CASE WHEN $4::varchar IN ('EN_CURSO','TERMINADA') THEN now() END, CASE WHEN $4::varchar = 'TERMINADA' THEN now() END)`,
      [o!.id, i + 1, `Etapa ${i + 1}`, e],
    );
  }
  return o!.id;
}

beforeAll(async () => {
  entorno = await prepararEntorno();
  encargada = await entorno.sesion('ENCARGADA_PRODUCCION');
  // ES2 CP-18: commitment yesterday (active), tomorrow, yesterday (TERMINADA),
  // and an active order whose estimate is later than the commitment.
  ids.atrasada = await insertarOrden('atrasada', 'EN_PRODUCCION', -1, null, ['TERMINADA', 'EN_CURSO']);
  ids.manana = await insertarOrden('mañana', 'EN_PRODUCCION', 1, 1, ['DISPONIBLE', 'PENDIENTE']);
  ids.terminada = await insertarOrden('terminada', 'TERMINADA', -1, -2, ['TERMINADA']);
  ids.riesgo = await insertarOrden('riesgo', 'EN_PRODUCCION', 5, 7, ['EN_CURSO', 'PENDIENTE', 'PENDIENTE', 'PENDIENTE']);
});
afterAll(async () => {
  await entorno?.limpiar();
});

const panel = (query: Record<string, string>, token = encargada.token) =>
  request(entorno.app()).get('/api/v1/panel').query({ q: MARCA, ...query }).auth(token, { type: 'bearer' });

describe('CP-18: the panel identifies overdue and at-risk orders (HU-10 / CU-10)', () => {
  it('filtro=atrasadas returns only the active order committed for yesterday, with its progress', async () => {
    const res = await panel({ filtro: 'atrasadas' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.datos).toEqual([
      expect.objectContaining({
        id: ids.atrasada,
        atrasada: true,
        enRiesgo: false,
        porcentajeAvance: 50,
        etapaActual: 'Etapa 2',
        areaActual: 'Corte',
      }),
    ]);
  });

  it('filtro=en_riesgo returns the order whose estimate is later than its commitment', async () => {
    const res = await panel({ filtro: 'en_riesgo' });

    expect(res.body.datos.map((f: { id: string }) => f.id)).toEqual([ids.riesgo]);
    expect(res.body.datos[0]).toMatchObject({ atrasada: false, enRiesgo: true, porcentajeAvance: 0 });
  });

  it('filtro=activas (default) leaves the finished order out, overdue first', async () => {
    const res = await panel({});

    expect(res.body.datos.map((f: { id: string }) => f.id)).toEqual([ids.atrasada, ids.riesgo, ids.manana]);
  });

  it('filtro=todas includes the finished order, which is never overdue', async () => {
    const res = await panel({ filtro: 'todas' });

    expect(res.body.total).toBe(4);
    expect(res.body.datos.find((f: { id: string }) => f.id === ids.terminada)).toMatchObject({ atrasada: false, enRiesgo: false, porcentajeAvance: 100 });
  });

  it('paginates and returns the global counters', async () => {
    const res = await panel({ filtro: 'todas', tamano: '2', pagina: '2' });

    expect(res.body).toMatchObject({ total: 4, pagina: 2, tamano: 2 });
    expect(res.body.datos).toHaveLength(2);
    expect(res.body.resumen.atrasadas).toBeGreaterThanOrEqual(1);
    expect(res.body.resumen.enRiesgo).toBeGreaterThanOrEqual(1);
    expect(res.body.resumen.activas).toBeGreaterThanOrEqual(3);
  });

  it('rejects an unknown filter → 400', async () => {
    expect((await panel({ filtro: 'urgentes' })).status).toBe(400);
  });

  it('OPERARIO → 403 (Table 7.1: the panel is not for operators)', async () => {
    const operario = await entorno.sesion('OPERARIO');
    expect((await panel({}, operario.token)).status).toBe(403);
  });
});
