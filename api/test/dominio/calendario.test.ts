import { describe, expect, it } from 'vitest';
import { calcularFechaEstimada, fechaLocal } from '../../src/dominio/calendario.js';

// 2026-11-23 is a Monday.
describe('CP-04: estimated end date (HU-05 / CU-04)', () => {
  it('23 h registered on Monday with an 8 h working day → Wednesday of the same week (3 working days)', () => {
    expect(calcularFechaEstimada({ fechaRegistro: '2026-11-23', horasTotales: 23, jornadaHoras: 8 })).toBe('2026-11-25');
  });

  it('skips Saturday and Sunday: 23 h registered on Friday → next Tuesday', () => {
    expect(calcularFechaEstimada({ fechaRegistro: '2026-11-27', horasTotales: 23 })).toBe('2026-12-01');
  });

  it('an order registered on Saturday starts counting on Monday', () => {
    expect(calcularFechaEstimada({ fechaRegistro: '2026-11-28', horasTotales: 8 })).toBe('2026-11-30');
  });

  it('exact multiples do not add a day (24 h → 3 days, 8 h → same day)', () => {
    expect(calcularFechaEstimada({ fechaRegistro: '2026-11-23', horasTotales: 24 })).toBe('2026-11-25');
    expect(calcularFechaEstimada({ fechaRegistro: '2026-11-23', horasTotales: 8 })).toBe('2026-11-23');
  });

  it('crosses month and year boundaries (Thursday 2026-12-31, 23 h → Monday 2027-01-04)', () => {
    expect(calcularFechaEstimada({ fechaRegistro: '2026-12-31', horasTotales: 23 })).toBe('2027-01-04');
  });

  it('rejects invalid input', () => {
    expect(() => calcularFechaEstimada({ fechaRegistro: '2026-02-30', horasTotales: 8 })).toThrow(RangeError);
    expect(() => calcularFechaEstimada({ fechaRegistro: '2026-11-23', horasTotales: 0 })).toThrow(RangeError);
    expect(() => calcularFechaEstimada({ fechaRegistro: '2026-11-23', horasTotales: 8, jornadaHoras: 0 })).toThrow(RangeError);
  });
});

describe('fechaLocal: calendar date in the business time zone', () => {
  it('uses America/Santiago, not UTC', () => {
    // 02:00 UTC is still the previous evening in Chile (UTC-3 in November).
    expect(fechaLocal(new Date('2026-11-25T02:00:00Z'))).toBe('2026-11-24');
    expect(fechaLocal(new Date('2026-11-25T12:00:00Z'))).toBe('2026-11-25');
  });
});
