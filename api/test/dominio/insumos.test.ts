import { describe, expect, it } from 'vitest';
import { ConsumosSchema, estaBajoMinimo, NuevaAlertaSchema } from '../../src/dominio/insumos.js';

const ETAPA = '10000000-0000-0000-0000-000000000011';

// CP-05 (HU-09 / CU-08): the minimum stock rule is "≤", the same one the DDL
// trigger fn_aplicar_movimiento_insumo applies.
describe('CP-05 minimum stock threshold', () => {
  it.each([
    [2, 2, true],
    [2.01, 2, false],
    [0, 0, true],
    [1.99, 2, true],
    [120, 40, false],
  ])('stock %s with minimum %s → %s', (stock, minimo, esperado) => {
    expect(estaBajoMinimo(stock, minimo)).toBe(esperado);
  });
});

describe('ConsumosSchema (D23)', () => {
  it('accepts the CP-12 body and defaults to no consumption', () => {
    expect(ConsumosSchema.parse([{ insumoId: 3, cantidad: 0.6 }])).toEqual([{ insumoId: 3, cantidad: 0.6 }]);
    expect(ConsumosSchema.parse(undefined)).toEqual([]);
  });

  it.each([
    ['zero quantity', [{ insumoId: 3, cantidad: 0 }]],
    ['negative quantity', [{ insumoId: 3, cantidad: -1 }]],
    ['more than 2 decimals', [{ insumoId: 3, cantidad: 0.125 }]],
    ['quantity above the NUMERIC(12,2) range', [{ insumoId: 3, cantidad: 1e10 }]],
    ['quantity as text', [{ insumoId: 3, cantidad: '1' }]],
    ['non-integer supply id', [{ insumoId: 1.5, cantidad: 1 }]],
    ['the same supply twice', [{ insumoId: 3, cantidad: 1 }, { insumoId: 3, cantidad: 2 }]],
    ['an undeclared field', [{ insumoId: 3, cantidad: 1, stock: 99 }]],
    ['more than 20 items', Array.from({ length: 21 }, (_, i) => ({ insumoId: i + 1, cantidad: 1 }))],
  ])('rejects %s', (_caso, valor) => {
    expect(ConsumosSchema.safeParse(valor).success).toBe(false);
  });

  it('accepts amounts with 2 decimals that are not exact in binary (0.6, 2.55)', () => {
    expect(ConsumosSchema.safeParse([{ insumoId: 1, cantidad: 2.55 }]).success).toBe(true);
  });
});

describe('NuevaAlertaSchema (CP-15, D24)', () => {
  it('accepts the CP-15 body and trims the comment', () => {
    expect(NuevaAlertaSchema.parse({ insumoId: 3, etapaId: ETAPA, comentario: '  Queda medio rollo  ' })).toEqual({
      insumoId: 3,
      etapaId: ETAPA,
      comentario: 'Queda medio rollo',
    });
  });

  it('accepts an optional missing quantity and no comment', () => {
    expect(NuevaAlertaSchema.parse({ insumoId: 3, etapaId: ETAPA, cantidadFaltante: 1.5 })).toEqual({
      insumoId: 3,
      etapaId: ETAPA,
      cantidadFaltante: 1.5,
    });
  });

  it.each([
    ['a missing stage', { insumoId: 3, comentario: 'x' }],
    ['a malformed stage id', { insumoId: 3, etapaId: '1;DROP TABLE x', comentario: 'x' }],
    ['a comment over 255 characters', { insumoId: 3, etapaId: ETAPA, comentario: 'a'.repeat(256) }],
    ['a blank comment', { insumoId: 3, etapaId: ETAPA, comentario: '   ' }],
    ['a NUL character in the comment', { insumoId: 3, etapaId: ETAPA, comentario: 'a\u0000b' }],
    ['a zero missing quantity', { insumoId: 3, etapaId: ETAPA, cantidadFaltante: 0 }],
    ['an undeclared field (mass assignment)', { insumoId: 3, etapaId: ETAPA, origen: 'AUTOMATICA' }],
  ])('rejects %s', (_caso, valor) => {
    expect(NuevaAlertaSchema.safeParse(valor).success).toBe(false);
  });
});
