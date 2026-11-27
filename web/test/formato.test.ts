import { describe, expect, it } from 'vitest';
import { cantidad, cantidadEditable, fecha, fechaHora, hoy, leerCantidad } from '../src/compartido/formato';

describe('formats (es-CL, America/Santiago)', () => {
  it('quantities typed with comma or point, at most two decimals (NUMERIC(12,2))', () => {
    expect(leerCantidad('0,60')).toBe(0.6);
    expect(leerCantidad(' 2.5 ')).toBe(2.5);
    expect(leerCantidad('3')).toBe(3);
    expect(leerCantidad('0,125')).toBeNull();
    expect(leerCantidad('-1')).toBeNull();
    expect(leerCantidad('1.000,5')).toBeNull();
    expect(leerCantidad('abc')).toBeNull();
    expect(leerCantidad('')).toBeNull();
  });

  it('dates and instants as the prototype shows them', () => {
    expect(fecha('2026-11-26')).toBe('26-11-2026');
    expect(fechaHora('2026-11-25T13:05:00.000Z')).toBe('25-11-2026 10:05');
    expect(hoy(new Date('2026-11-26T02:00:00Z'))).toBe('2026-11-25');
  });

  it('numbers with two decimals and the unit', () => {
    expect(cantidad(1, 'ROLLO')).toBe('1,00 rollo');
    expect(cantidadEditable(0.6)).toBe('0,60');
  });
});
