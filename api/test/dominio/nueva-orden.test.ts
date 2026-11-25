import { describe, expect, it } from 'vitest';
import { NuevaOrdenSchema } from '../../src/dominio/nueva-orden.js';

const VALIDA = {
  tipoTrabajoId: 1,
  titulo: 'DEMO-02 · Camisetas Club Atlético',
  referenciaCliente: 'Club Atlético Demo',
  cantidad: 30,
  fechaCompromiso: '2026-12-15',
};

const fallaEn = (datos: unknown) => {
  const r = NuevaOrdenSchema.safeParse(datos);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.') || i.code);
};

describe('CP-06: work order validation (HU-05 / CU-04)', () => {
  it('rejects quantity 0', () => {
    expect(fallaEn({ ...VALIDA, cantidad: 0 })).toEqual(['cantidad']);
  });

  it('rejects a 200-character title', () => {
    expect(fallaEn({ ...VALIDA, titulo: 'x'.repeat(200) })).toEqual(['titulo']);
  });

  it('rejects an undeclared field (precio): no mass assignment', () => {
    expect(fallaEn({ ...VALIDA, precio: 15000 })).toEqual(['unrecognized_keys']);
  });

  it('accepts the valid order and fills the defaults', () => {
    const r = NuevaOrdenSchema.safeParse(VALIDA);
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ ...VALIDA, prioridad: 'NORMAL', especificaciones: {} });
  });

  it.each([
    ['decimal quantity', { cantidad: 2.5 }, 'cantidad'],
    ['quantity as text', { cantidad: '30' }, 'cantidad'],
    ['unknown priority', { prioridad: 'MAXIMA' }, 'prioridad'],
    ['impossible date', { fechaCompromiso: '2026-02-30' }, 'fechaCompromiso'],
    ['date with time', { fechaCompromiso: '2026-12-15T10:00:00Z' }, 'fechaCompromiso'],
    ['blank title', { titulo: '   ' }, 'titulo'],
    ['control character in the title', { titulo: 'Camisetas\u0000' }, 'titulo'],
    ['client reference over 80', { referenciaCliente: 'x'.repeat(81) }, 'referenciaCliente'],
    ['specifications as an array', { especificaciones: ['S', 'M'] }, 'especificaciones'],
    ['NUL inside the specifications', { especificaciones: { color: 'azul\u0000' } }, 'especificaciones'],
    ['missing template', { tipoTrabajoId: undefined }, 'tipoTrabajoId'],
  ])('rejects %s', (_caso, cambio, campo) => {
    expect(fallaEn({ ...VALIDA, ...cambio })).toContain(campo);
  });

  it('trims the text fields and keeps the specifications object', () => {
    const r = NuevaOrdenSchema.parse({ ...VALIDA, titulo: '  Polerones 4°B  ', especificaciones: { tallas: { S: 5 } } });
    expect(r.titulo).toBe('Polerones 4°B');
    expect(r.especificaciones).toEqual({ tallas: { S: 5 } });
  });
});
