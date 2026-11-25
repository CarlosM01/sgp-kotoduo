// Integration fixtures: each test creates its own users (prefix "t.") so the
// seed users of the demo are never modified, and everything is removed after.
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { createApp, type AppOptions } from '../../src/app.js';
import { leerConfig } from '../../src/config.js';
import { crearContenedor, type Contenedor } from '../../src/contenedor.js';
import type { CodigoRol } from '../../src/dominio/permisos.js';
import { crearHasherArgon2 } from '../../src/infraestructura/seguridad/argon2.js';

export const CLAVE_PRUEBA = 'tinta plotter azul 2026';
export const CLAVE_DEMO_SEED = 'kotoduo demo local 2026';
export const ADMIN_SEED_ID = '00000000-0000-0000-0000-000000000001';

export interface UsuarioPrueba {
  id: string;
  nombreUsuario: string;
  clave: string;
}

export interface Entorno {
  contenedor: Contenedor;
  app(limites?: AppOptions['limites']): Express;
  crearUsuario(rol: CodigoRol, opciones?: { debeCambiarClave?: boolean }): Promise<UsuarioPrueba>;
  eventosDe(usuarioId: string): Promise<Array<{ tipo: string; payload: Record<string, unknown>; actor: { ip?: string } }>>;
  usuario(id: string): Promise<{ intentos_fallidos: number; bloqueado_hasta: Date | null; debe_cambiar_clave: boolean; password_hash: string }>;
  limpiar(): Promise<void>;
}

export async function prepararEntorno(): Promise<Entorno> {
  const contenedor = await crearContenedor(leerConfig(process.env));
  const { pool, mongo } = contenedor;
  const eventos = mongo.db().collection('bitacora_eventos');
  const hasher = crearHasherArgon2();
  const creados: string[] = [];
  const inicio = new Date();
  const silencioso = { error: () => {}, warn: () => {} };

  return {
    contenedor,

    app(limites = { authPorMinuto: 10_000, apiPorMinuto: 10_000 }) {
      return createApp({ corsOrigin: 'http://localhost:5173', servicios: contenedor.servicios, limites, log: silencioso });
    },

    async crearUsuario(rol, { debeCambiarClave = false } = {}) {
      const id = randomUUID();
      const nombreUsuario = `t.${id.slice(0, 8)}`;
      await pool.query(
        `INSERT INTO sgp.usuario (id, nombre_usuario, nombre_completo, password_hash, debe_cambiar_clave)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, nombreUsuario, `Prueba ${rol}`, await hasher.hash(CLAVE_PRUEBA), debeCambiarClave],
      );
      await pool.query(
        `INSERT INTO sgp.usuario_rol (usuario_id, rol_id) SELECT $1, id FROM sgp.rol WHERE codigo = $2`,
        [id, rol],
      );
      creados.push(id);
      return { id, nombreUsuario, clave: CLAVE_PRUEBA };
    },

    async eventosDe(usuarioId) {
      const docs = await eventos.find({ 'actor.usuario_id': usuarioId, ts: { $gte: inicio } }).sort({ _id: 1 }).toArray();
      return docs.map((d) => ({ tipo: d.tipo as string, payload: d.payload as Record<string, unknown>, actor: d.actor as { ip?: string } }));
    },

    async usuario(id) {
      const { rows } = await pool.query(
        `SELECT intentos_fallidos, bloqueado_hasta, debe_cambiar_clave, password_hash FROM sgp.usuario WHERE id = $1`,
        [id],
      );
      return rows[0];
    },

    async limpiar() {
      try {
        await eventos.deleteMany({
          ts: { $gte: inicio },
          $or: [
            { 'actor.usuario_id': { $in: creados } },
            { 'payload.nombre_usuario': { $regex: '^t\\.' } },
            { 'actor.usuario_id': ADMIN_SEED_ID },
          ],
        });
        await pool.query(`DELETE FROM sgp.usuario WHERE id = ANY($1::uuid[])`, [creados]);
      } finally {
        await contenedor.cerrar();
      }
    },
  };
}
