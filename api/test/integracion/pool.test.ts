import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepararEntorno, type Entorno } from './apoyo.js';

let entorno: Entorno;
beforeAll(async () => {
  entorno = await prepararEntorno();
});
afterAll(async () => {
  await entorno?.limpiar();
});

// Review R3/R4: PostgreSQL dropping an idle pooled client must not crash the API.
describe('PostgreSQL pool resilience', () => {
  it('survives the server terminating an idle client and keeps answering', async () => {
    const { pool } = entorno.contenedor;
    const { rows } = await pool.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    const pid = rows[0]?.pid;
    const antes = pool.totalCount;
    // 'remove' fires when the pool discards the dead client; it is not an 'error'
    // listener, so only the API's own listener keeps the error from crashing the process.
    const descartado = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('the pool did not discard the client in 10 s')), 10_000);
      pool.once('remove', () => {
        clearTimeout(t);
        resolve();
      });
    });

    // A separate session terminates the idle backend, as a DB restart or admin would.
    const otro = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await otro.connect();
    try {
      await otro.query('SELECT pg_terminate_backend($1)', [pid]);
    } finally {
      await otro.end();
    }
    await descartado;
    expect(pool.totalCount).toBeLessThan(antes);

    const despues = await pool.query<{ ok: number }>('SELECT 1 AS ok');
    expect(despues.rows[0]?.ok).toBe(1);
  });
});
