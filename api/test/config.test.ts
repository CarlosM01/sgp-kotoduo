import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { leerConfig } from '../src/config.js';

const BASE = {
  DATABASE_URL: 'postgres://x',
  MONGO_URL: 'mongodb://x',
  JWT_SECRET: 'a-random-secret-with-more-than-32-chars',
};
const PLACEHOLDER = 'replace_with_a_long_random_string';

describe('leerConfig', () => {
  it('refuses secrets shorter than 32 characters', () => {
    expect(() => leerConfig({ ...BASE, JWT_SECRET: 'short' }, { warn: () => {} })).toThrow(/JWT_SECRET/);
  });

  it('refuses the public placeholder secret in production', () => {
    expect(() => leerConfig({ ...BASE, JWT_SECRET: PLACEHOLDER, NODE_ENV: 'production' }, { warn: () => {} })).toThrow(
      /placeholder/,
    );
  });

  it('warns about the placeholder secret outside production (review R1-001)', () => {
    const warn = vi.fn();
    leerConfig({ ...BASE, JWT_SECRET: PLACEHOLDER }, { warn });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('TRUST_PROXY defaults to 0 (no proxy trusted) and accepts a hop count (F6)', () => {
    expect(leerConfig(BASE).TRUST_PROXY).toBe(0);
    expect(leerConfig({ ...BASE, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
  });

  it('refuses a TRUST_PROXY that is not a hop count', () => {
    expect(() => leerConfig({ ...BASE, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(() => leerConfig({ ...BASE, TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
  });

  it('DB_ROL is optional and accepts a PostgreSQL role name (DEF-02)', () => {
    expect(leerConfig(BASE).DB_ROL).toBeUndefined();
    expect(leerConfig({ ...BASE, DB_ROL: 'sgp_app' }).DB_ROL).toBe('sgp_app');
  });

  it('an empty DB_ROL (the line in .env.example) means no role switch', () => {
    expect(leerConfig({ ...BASE, DB_ROL: '' }).DB_ROL).toBeUndefined();
  });

  it('refuses a DB_ROL that is not a plain role name (it goes into the connection options)', () => {
    expect(() => leerConfig({ ...BASE, DB_ROL: 'sgp_app -c role=sgp' })).toThrow(/DB_ROL/);
    expect(() => leerConfig({ ...BASE, DB_ROL: 'Sgp-App' })).toThrow(/DB_ROL/);
  });
});

describe('seed (D12)', () => {
  it('the seed admin starts with debe_cambiar_clave = TRUE', () => {
    const seed = readFileSync(new URL('../../db/postgres/02_seed.sql', import.meta.url), 'utf8');
    const filaAdmin = /\('00000000-0000-0000-0000-000000000001', 'admin',[\s\S]*?\$argon2id\$[^']*', (TRUE|FALSE),/.exec(seed);
    expect(filaAdmin?.[1]).toBe('TRUE');
  });
});
