// DEF-02 (CP-32, R7/R8): the API can run its queries as the least-privilege
// role sgp_app instead of the superuser that owns the schema.
import { afterAll, describe, expect, it } from 'vitest';
import { leerConfig } from '../../src/config.js';
import { crearContenedor, type Contenedor } from '../../src/contenedor.js';

const abiertos: Contenedor[] = [];
async function contenedorCon(env: NodeJS.ProcessEnv): Promise<Contenedor> {
  const c = await crearContenedor(leerConfig(env, { warn: () => {} }));
  abiertos.push(c);
  return c;
}

afterAll(async () => {
  await Promise.all(abiertos.map((c) => c.cerrar()));
});

describe('DB_ROL (DEF-02)', () => {
  it('with DB_ROL=sgp_app every pooled query runs as sgp_app', async () => {
    const { pool } = await contenedorCon({ ...process.env, DB_ROL: 'sgp_app' });
    const { rows } = await pool.query<{ rol: string; super: boolean }>(
      "SELECT current_user AS rol, current_setting('is_superuser') = 'on' AS super",
    );
    expect(rows[0]).toEqual({ rol: 'sgp_app', super: false });
  });

  it('with DB_ROL=sgp_app unqualified names resolve to the sgp schema, as the DDL triggers need', async () => {
    // The default search_path is "$user", public: it only reached the sgp schema
    // because the login role is also called sgp. Starting a stage as sgp_app
    // failed with 42P01 in the trigger (found by the E2E run with DB_ROL).
    const { pool } = await contenedorCon({ ...process.env, DB_ROL: 'sgp_app' });
    const { rows } = await pool.query<{ esquemas: string[] }>('SELECT current_schemas(false) AS esquemas');
    expect(rows[0]?.esquemas).toContain('sgp');
    // An unqualified table name resolves (any row count, even 0).
    await expect(pool.query('SELECT 1 FROM orden_trabajo LIMIT 1')).resolves.toBeDefined();
  });

  it('with DB_ROL=sgp_app the immutable kardex refuses UPDATE and DELETE (R7)', async () => {
    const { pool } = await contenedorCon({ ...process.env, DB_ROL: 'sgp_app' });
    await expect(pool.query('UPDATE sgp.movimiento_insumo SET cantidad = cantidad WHERE FALSE')).rejects.toMatchObject({ code: '42501' });
    await expect(pool.query('DELETE FROM sgp.movimiento_insumo WHERE FALSE')).rejects.toMatchObject({ code: '42501' });
  });

  it('a DB_ROL that does not exist refuses the connection instead of falling back to the login role', async () => {
    const { pool } = await contenedorCon({ ...process.env, DB_ROL: 'rol_inexistente' });
    await expect(pool.query('SELECT 1')).rejects.toThrow(/role "rol_inexistente" does not exist/);
  });

  it('without DB_ROL the session keeps the login role, as before', async () => {
    const env = { ...process.env };
    delete env.DB_ROL;
    const { pool } = await contenedorCon(env);
    const { rows } = await pool.query<{ rol: string }>('SELECT current_user AS rol');
    expect(rows[0]?.rol).toBe(new URL(process.env.DATABASE_URL!).username);
  });
});
