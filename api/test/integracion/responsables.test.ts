import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fechaLocal } from '../../src/dominio/calendario.js';
import { prepararEntorno, type Entorno, type UsuarioPrueba } from './apoyo.js';

// D26: the assignment select of the order detail (HU-08 partial) needs the
// people who can advance stages. Same rule as PATCH /etapas/{id}/responsable.
type Sesion = UsuarioPrueba & { token: string };

let entorno: Entorno;
let encargada: Sesion;
let operario: Sesion;
let vendedor: Sesion;
let disenador: UsuarioPrueba;
let inactivo: UsuarioPrueba;

beforeAll(async () => {
  entorno = await prepararEntorno();
  [encargada, operario, vendedor, disenador, inactivo] = await Promise.all([
    entorno.sesion('ENCARGADA_PRODUCCION'),
    entorno.sesion('OPERARIO'),
    entorno.sesion('VENDEDOR'),
    entorno.crearUsuario('DISENADOR'),
    entorno.crearUsuario('OPERARIO'),
  ]);
  await entorno.contenedor.pool.query(`UPDATE sgp.usuario SET activo = FALSE WHERE id = $1`, [inactivo.id]);
});
afterAll(async () => {
  await entorno?.limpiar();
});

const listar = (token: string) => request(entorno.app()).get('/api/v1/responsables').auth(token, { type: 'bearer' });

describe('GET /responsables (D26)', () => {
  it('lists the active users who can advance stages, with id, full name and roles only', async () => {
    const res = await listar(encargada.token);

    expect(res.status).toBe(200);
    const porId = new Map<string, { id: string; nombreCompleto: string; roles: string[] }>(
      res.body.datos.map((u: { id: string }) => [u.id, u]),
    );
    expect(porId.get(operario.id)).toEqual({ id: operario.id, nombreCompleto: 'Prueba OPERARIO', roles: ['OPERARIO'] });
    expect(porId.get(disenador.id)).toEqual({ id: disenador.id, nombreCompleto: 'Prueba DISENADOR', roles: ['DISENADOR'] });
    expect(porId.has(encargada.id)).toBe(true);
    expect(porId.has(vendedor.id)).toBe(false);
    expect(porId.has(inactivo.id)).toBe(false);
    for (const u of porId.values()) expect(Object.keys(u).sort()).toEqual(['id', 'nombreCompleto', 'roles']);
  });

  it('the listed users are exactly the ones PATCH /etapas/{id}/responsable accepts (same rule, review R3-002)', async () => {
    const api = entorno.app();
    const creada = await request(api)
      .post('/api/v1/ordenes')
      .auth(encargada.token, { type: 'bearer' })
      .send({
        tipoTrabajoId: 2,
        titulo: 'Prueba responsables D26',
        referenciaCliente: 'Cliente de prueba',
        cantidad: 1,
        fechaCompromiso: fechaLocal(new Date(Date.now() + 20 * 86_400_000)),
      });
    expect(creada.status).toBe(201);
    const listados = new Set((await listar(encargada.token)).body.datos.map((u: { id: string }) => u.id));

    // Each test user, listed or not, against the assignment itself.
    for (const u of [operario, disenador, encargada, vendedor, inactivo]) {
      const det = await request(api).get(`/api/v1/ordenes/${creada.body.id}`).auth(encargada.token, { type: 'bearer' });
      const etapa = det.body.etapas[0] as { id: string; version: number };
      const res = await request(api)
        .patch(`/api/v1/etapas/${etapa.id}/responsable`)
        .auth(encargada.token, { type: 'bearer' })
        .send({ responsableId: u.id, version: etapa.version });
      expect({ id: u.id, aceptado: res.status === 200 }).toEqual({ id: u.id, aceptado: listados.has(u.id) });
    }
  });

  it('OPERARIO and VENDEDOR → 403', async () => {
    expect((await listar(operario.token)).status).toBe(403);
    expect((await listar(vendedor.token)).status).toBe(403);
  });

  it('without a token → 401', async () => {
    const res = await request(entorno.app()).get('/api/v1/responsables');
    expect(res.status).toBe(401);
  });
});
