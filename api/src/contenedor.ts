// Composition root: wires the real adapters (PostgreSQL, MongoDB, Argon2, JWT)
// into the use cases. Tests build their own wiring with the same pieces.
import { MongoClient } from 'mongodb';
import pg from 'pg';
import type { Servicios } from './app.js';
import { crearServicioAuth } from './aplicacion/auth.js';
import { crearServicioEtapas } from './aplicacion/etapas.js';
import { crearServicioInsumos } from './aplicacion/insumos.js';
import { crearServicioOrdenes } from './aplicacion/ordenes.js';
import type { Config } from './config.js';
import { crearAuditoriaMongo } from './infraestructura/mongo/auditoria-mongo.js';
import { crearEtapaRepositorioPg } from './infraestructura/pg/etapa-repositorio.js';
import { crearInsumoRepositorioPg } from './infraestructura/pg/insumo-repositorio.js';
import { crearOrdenRepositorioPg } from './infraestructura/pg/orden-repositorio.js';
import { crearUsuarioRepositorioPg } from './infraestructura/pg/usuario-repositorio.js';
import { crearHasherArgon2 } from './infraestructura/seguridad/argon2.js';
import { crearServicioTokensJwt } from './infraestructura/seguridad/tokens-jwt.js';

export interface Contenedor {
  servicios: Servicios;
  pool: pg.Pool;
  mongo: MongoClient;
  cerrar(): Promise<void>;
}

export async function crearContenedor(config: Pick<Config, 'DATABASE_URL' | 'MONGO_URL' | 'JWT_SECRET'>): Promise<Contenedor> {
  // Business time zone: CURRENT_DATE (overdue orders in v_panel_ordenes) is the
  // Chilean calendar date, the same one the API uses for the estimated end date.
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10, options: '-c TimeZone=America/Santiago' });
  // node-postgres emits 'error' when the server drops an idle client (restart,
  // network blip). Without a listener Node treats it as unhandled and the whole
  // API exits; with it, only the affected queries fail and the pool reconnects.
  pool.on('error', (err) => {
    console.error({ msg: 'idle PostgreSQL client error', code: (err as { code?: string }).code });
  });
  const mongo = await MongoClient.connect(config.MONGO_URL, { serverSelectionTimeoutMS: 5_000 });

  const tokens = crearServicioTokensJwt(config.JWT_SECRET);
  const auditoria = crearAuditoriaMongo(mongo.db());
  const usuarios = crearUsuarioRepositorioPg(pool);
  const etapasRepo = crearEtapaRepositorioPg(pool);
  const auth = crearServicioAuth({
    usuarios,
    hasher: crearHasherArgon2(),
    tokens,
    auditoria,
  });

  return {
    servicios: {
      auth,
      ordenes: crearServicioOrdenes({ ordenes: crearOrdenRepositorioPg(pool), etapas: etapasRepo, usuarios, auditoria }),
      etapas: crearServicioEtapas({ etapas: etapasRepo, auditoria }),
      insumos: crearServicioInsumos({ insumos: crearInsumoRepositorioPg(pool) }),
      tokens,
      auditoria,
    },
    pool,
    mongo,
    async cerrar() {
      await Promise.allSettled([pool.end(), mongo.close()]);
    },
  };
}
