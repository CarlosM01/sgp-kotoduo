import { describe, expect, it } from 'vitest';
import { CLAVE_LARGO_MAXIMO, CLAVE_LARGO_MINIMO, validarPoliticaClave } from '../../src/dominio/politica-clave.js';

// CP-07 (HU-11 / CU-01): password policy from ES2 section 7.2 — at least 12
// characters, no composition rules, compromised passwords rejected.
describe('CP-07 validarPoliticaClave', () => {
  it('rejects "abc12345678" because it has 11 characters', () => {
    expect(validarPoliticaClave('abc12345678')).toEqual({ ok: false, motivo: 'MUY_CORTA' });
  });

  it('rejects "contraseña123" because it is a compromised password', () => {
    expect(validarPoliticaClave('contraseña123')).toEqual({ ok: false, motivo: 'COMPROMETIDA' });
  });

  it('accepts "tinta plotter azul 2026"', () => {
    expect(validarPoliticaClave('tinta plotter azul 2026')).toEqual({ ok: true });
  });

  it('accepts exactly 12 characters without composition rules (boundary)', () => {
    expect(validarPoliticaClave('aaaabbbbcccc')).toEqual({ ok: true });
  });

  it('counts characters, not bytes: 12 accented letters are enough', () => {
    expect(validarPoliticaClave('ñandúñandúña')).toEqual({ ok: true });
  });

  it('rejects passwords above the maximum length', () => {
    expect(validarPoliticaClave('x'.repeat(CLAVE_LARGO_MAXIMO + 1))).toEqual({ ok: false, motivo: 'MUY_LARGA' });
    expect(validarPoliticaClave('x'.repeat(CLAVE_LARGO_MAXIMO))).toEqual({ ok: true });
  });

  it('compares the compromised list ignoring case and surrounding spaces', () => {
    expect(validarPoliticaClave('  CONTRASEÑA123 ')).toEqual({ ok: false, motivo: 'COMPROMETIDA' });
  });

  it('rejects the public demo password, so the admin cannot keep it (D12)', () => {
    expect(validarPoliticaClave('kotoduo demo local 2026')).toEqual({ ok: false, motivo: 'COMPROMETIDA' });
  });

  it('documents the minimum length of 12', () => {
    expect(CLAVE_LARGO_MINIMO).toBe(12);
  });
});
