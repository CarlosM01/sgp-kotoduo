// Composition root: wires the real adapters (PostgreSQL, MongoDB, Argon2, JWT)
// into the use cases. Tests build their own wiring with the same pieces.
import { MongoClient } from 'mongodb';
import pg from 'pg';
import type { Servicios } from './app.js';
import { crearServicioAuth } from './aplicacion/auth.js';
import type { Config } from './config.js';
import { crearAuditoriaMongo } from './infraestructura/mongo/auditoria-mongo.js';
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
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });
  // node-postgres emits 'error' when the server drops an idle client (restart,
  // network blip). Without a listener Node treats it as unhandled and the whole
  // API exits; with it, only the affected queries fail and the pool reconnects.
  pool.on('error', (err) => {
    console.error({ msg: 'idle PostgreSQL client error', code: (err as { code?: string }).code });
  });
  const mongo = await MongoClient.connect(config.MONGO_URL, { serverSelectionTimeoutMS: 5_000 });

  const tokens = crearServicioTokensJwt(config.JWT_SECRET);
  const auditoria = crearAuditoriaMongo(mongo.db());
  const auth = crearServicioAuth({
    usuarios: crearUsuarioRepositorioPg(pool),
    hasher: crearHasherArgon2(),
    tokens,
    auditoria,
  });

  return {
    servicios: { auth, tokens, auditoria },
    pool,
    mongo,
    async cerrar() {
      await Promise.allSettled([pool.end(), mongo.close()]);
    },
  };
}
