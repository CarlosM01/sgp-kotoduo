import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularFechaEstimada, fechaLocal } from '../../src/dominio/calendario.js';
import { prepararEntorno, type Entorno, type UsuarioPrueba } from './apoyo.js';

let entorno: Entorno;
let vendedor: UsuarioPrueba & { token: string };
let operario: UsuarioPrueba & { token: string };
// Every order of this file carries the marker in its title, so the queries
// never depend on the seed or on the volume data.
const MARCA = `T-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  entorno = await prepararEntorno();
  vendedor = await entorno.sesion('VENDEDOR');
  operario = await entorno.sesion('OPERARIO');
});
afterAll(async () => {
  await entorno?.limpiar();
});

const enDias = (n: number) => {
  const d = new Date(`${fechaLocal(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const nuevaOrden = (cambios: Record<string, unknown> = {}) => ({
  tipoTrabajoId: 1,
  titulo: `${MARCA} · Camisetas sublimadas`,
  referenciaCliente: 'Club Deportivo Prueba',
  cantidad: 30,
  fechaCompromiso: enDias(10),
  especificaciones: { tallas: { S: 10, M: 20 } },
  ...cambios,
});

const crear = (cuerpo: unknown, token = vendedor.token) =>
  request(entorno.app()).post('/api/v1/ordenes').auth(token, { type: 'bearer' }).send(cuerpo as object);

const contarConTitulo = async (titulo: string) =>
  Number((await entorno.contenedor.pool.query(`SELECT COUNT(*) AS n FROM sgp.orden_trabajo WHERE titulo = $1`, [titulo])).rows[0].n);

describe('CP-11: work order registered end to end in the data (HU-05, HU-12 / CU-04)', () => {
  it('201 with code OT-AAAA-NNNN, 6 stages in PostgreSQL and ORDEN_REGISTRADA in MongoDB', async () => {
    const hoy = fechaLocal(new Date());

    const res = await crear(nuevaOrden());

    expect(res.status).toBe(201);
    expect(res.body.codigo).toMatch(new RegExp(`^OT-${hoy.slice(0, 4)}-\\d{4,6}$`));
    expect(res.body).toMatchObject({ estado: 'REGISTRADA', etapas: 6 });
    expect(res.headers.location).toBe(`/api/v1/ordenes/${res.body.id}`);
    // Uniform template: 4+3+4+3+8+1 = 23 h.
    expect(res.body.fechaEstimadaTermino).toBe(calcularFechaEstimada({ fechaRegistro: hoy, horasTotales: 23 }));

    const { pool } = entorno.contenedor;
    const { rows: [orden] } = await pool.query(
      `SELECT codigo, estado, cantidad, creado_por, especificaciones,
              to_char(fecha_estimada_termino, 'YYYY-MM-DD') AS estimada
         FROM sgp.orden_trabajo WHERE id = $1`,
      [res.body.id],
    );
    expect(orden).toEqual({
      codigo: res.body.codigo,
      estado: 'REGISTRADA',
      cantidad: 30,
      creado_por: vendedor.id,
      especificaciones: { tallas: { S: 10, M: 20 } },
      estimada: res.body.fechaEstimadaTermino,
    });
    const { rows: etapas } = await pool.query(
      `SELECT secuencia, nombre, estado, responsable_id FROM sgp.etapa_orden WHERE orden_id = $1 ORDER BY secuencia`,
      [res.body.id],
    );
    expect(etapas.map((e) => [e.secuencia, e.estado])).toEqual([
      [1, 'DISPONIBLE'], [2, 'PENDIENTE'], [3, 'PENDIENTE'], [4, 'PENDIENTE'], [5, 'PENDIENTE'], [6, 'PENDIENTE'],
    ]);
    const { rows: reqs } = await pool.query(
      `SELECT e.secuencia, i.codigo, r.cantidad_requerida::text AS requerida, r.cantidad_consumida::text AS consumida
         FROM sgp.requerimiento_insumo r
         JOIN sgp.etapa_orden e ON e.id = r.etapa_orden_id
         JOIN sgp.insumo i      ON i.id = r.insumo_id
        WHERE e.orden_id = $1 ORDER BY e.secuencia, i.codigo`,
      [res.body.id],
    );
    expect(reqs).toEqual([
      { secuencia: 2, codigo: 'PAP-SUB-RL', requerida: '0.60', consumida: '0.00' },
      { secuencia: 2, codigo: 'TIN-SUB-CY', requerida: '0.30', consumida: '0.00' },
      { secuencia: 4, codigo: 'TEL-DRY-BL', requerida: '36.00', consumida: '0.00' },
    ]);

    const [evento] = (await entorno.eventosDe(vendedor.id)).filter(
      (e) => e.tipo === 'ORDEN_REGISTRADA' && e.payload.codigo === res.body.codigo,
    );
    expect(evento?.payload).toMatchObject({ codigo: res.body.codigo, tipo_trabajo_id: 1, cantidad: 30, etapas: 6 });
    const doc = await entorno.contenedor.mongo.db().collection('bitacora_eventos').findOne({ tipo: 'ORDEN_REGISTRADA', orden_id: res.body.id });
    expect(String(doc?._id)).toMatch(/^evt-\d+$/);
  });

  it('concurrent registrations get distinct consecutive codes', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, (_, i) => crear(nuevaOrden({ titulo: `${MARCA} · concurrente ${i}` }))),
    );

    expect(respuestas.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const numeros = respuestas.map((r) => Number(String(r.body.codigo).split('-')[2])).sort((a, b) => a - b);
    expect(new Set(numeros).size).toBe(5);
    expect(numeros.at(-1)! - numeros[0]!).toBe(4);
  });
});

describe('CP-06 through the API: invalid orders store nothing', () => {
  it.each([
    ['undeclared field precio', { precio: 15000 }, 'unrecognized_keys'],
    ['quantity 0', { cantidad: 0 }, 'too_small'],
    ['200-character title', { titulo: `${MARCA} ${'x'.repeat(190)}` }, 'too_big'],
  ])('%s → 400 VALIDATION_ERROR', async (_caso, cambio, problema) => {
    const cuerpo = nuevaOrden({ titulo: `${MARCA} · inválida ${problema}`, ...cambio });

    const res = await crear(cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { problema: string }) => d.problema)).toContain(problema);
    expect(await contarConTitulo(cuerpo.titulo as string)).toBe(0);
  });

  it('a commitment date before today → 400', async () => {
    const cuerpo = nuevaOrden({ titulo: `${MARCA} · pasada`, fechaCompromiso: enDias(-1) });

    const res = await crear(cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ campo: 'fechaCompromiso', problema: 'too_small' }]);
    expect(await contarConTitulo(cuerpo.titulo)).toBe(0);
  });

  it.each([
    ['an unknown work type', 99],
    ['a work type without template (Polerón de generación)', 3],
  ])('%s → 400', async (_caso, tipoTrabajoId) => {
    const cuerpo = nuevaOrden({ titulo: `${MARCA} · tipo ${tipoTrabajoId}`, tipoTrabajoId });

    const res = await crear(cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ campo: 'tipoTrabajoId', problema: 'invalid_value' }]);
    expect(await contarConTitulo(cuerpo.titulo)).toBe(0);
  });

  it('a NUL character inside the specifications → 400, never a 500', async () => {
    const res = await crear(nuevaOrden({ titulo: `${MARCA} · nul`, especificaciones: { color: 'azul\u0000' } }));
    expect(res.status).toBe(400);
  });
});

describe('roles on the order routes (Table 7.1)', () => {
  it('OPERARIO cannot create orders → 403', async () => {
    const cuerpo = nuevaOrden({ titulo: `${MARCA} · operario` });
    const res = await crear(cuerpo, operario.token);
    expect(res.status).toBe(403);
    expect(await contarConTitulo(cuerpo.titulo)).toBe(0);
  });

  it.each(['/api/v1/plantillas', '/api/v1/ordenes'])('OPERARIO → GET %s is 403', async (ruta) => {
    const res = await request(entorno.app()).get(ruta).auth(operario.token, { type: 'bearer' });
    expect(res.status).toBe(403);
  });
});

describe('templates and order queries', () => {
  it('GET /plantillas lists the active work types with their ordered stages and total hours', async () => {
    const res = await request(entorno.app()).get('/api/v1/plantillas').auth(vendedor.token, { type: 'bearer' });

    expect(res.status).toBe(200);
    const uniforme = res.body.datos.find((t: { id: number }) => t.id === 1);
    expect(uniforme.horasTotales).toBe(23);
    expect(uniforme.etapas.map((e: { secuencia: number }) => e.secuencia)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(uniforme.etapas[3]).toMatchObject({ nombre: 'Corte', area: 'Corte', insumos: [{ insumoId: 4, cantidadPorUnidad: 1.2 }] });
    expect(res.body.datos.find((t: { id: number }) => t.id === 2).etapas).toHaveLength(4);
  });

  it('GET /ordenes filters by text and paginates; GET /ordenes/{id} returns stages and requirements', async () => {
    const creada = await crear(nuevaOrden({ titulo: `${MARCA} · consulta` }));

    const lista = await request(entorno.app())
      .get('/api/v1/ordenes')
      .query({ q: `${MARCA} · consulta`, tamano: 5 })
      .auth(vendedor.token, { type: 'bearer' });
    expect(lista.status).toBe(200);
    expect(lista.body).toMatchObject({ total: 1, pagina: 1, tamano: 5 });
    expect(lista.body.datos[0]).toMatchObject({ id: creada.body.id, codigo: creada.body.codigo, estado: 'REGISTRADA', tipoTrabajo: 'Uniforme deportivo sublimado' });

    const detalle = await request(entorno.app()).get(`/api/v1/ordenes/${creada.body.id}`).auth(vendedor.token, { type: 'bearer' });
    expect(detalle.status).toBe(200);
    expect(detalle.body).toMatchObject({ id: creada.body.id, creadoPor: { id: vendedor.id }, terminadaEn: null });
    expect(detalle.body.etapas).toHaveLength(6);
    expect(detalle.body.etapas[0]).toMatchObject({ secuencia: 1, estado: 'DISPONIBLE', version: 1, responsable: null, area: 'Diseño' });
    expect(detalle.body.etapas[3].requerimientos).toEqual([
      { insumoId: 4, codigo: 'TEL-DRY-BL', nombre: 'Tela dry-fit blanca', unidad: 'METRO', cantidadRequerida: 36, cantidadConsumida: 0 },
    ]);
  });

  it.each([
    ['unknown id', randomUUID()],
    ['malformed id', 'not-a-uuid'],
  ])('GET /ordenes/{%s} → 404', async (_caso, id) => {
    const res = await request(entorno.app()).get(`/api/v1/ordenes/${id}`).auth(vendedor.token, { type: 'bearer' });
    expect(res.status).toBe(404);
  });

  it('CP-24: the text filter is a parameter, never SQL (LIKE wildcards are literal)', async () => {
    for (const q of [`' OR 1=1 --`, '%', '_']) {
      const res = await request(entorno.app()).get('/api/v1/ordenes').query({ q: `${MARCA}${q}` }).auth(vendedor.token, { type: 'bearer' });
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    }
  });

  it('rejects unknown query parameters → 400', async () => {
    const res = await request(entorno.app()).get('/api/v1/ordenes').query({ orden: 'codigo; DROP TABLE x' }).auth(vendedor.token, { type: 'bearer' });
    expect(res.status).toBe(400);
  });
});
