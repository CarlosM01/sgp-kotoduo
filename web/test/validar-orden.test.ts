import { describe, expect, it } from 'vitest';
import { validarOrden, type FormularioOrden } from '../src/ordenes/validar-orden';

const valido: FormularioOrden = {
  tipoTrabajoId: '1',
  titulo: 'Camisetas sublimadas',
  referenciaCliente: 'Club Deportivo Los Aromos',
  cantidad: '30',
  prioridad: 'NORMAL',
  especificaciones: 'S 5 · M 15 · L 10 · azul y blanco',
  fechaCompromiso: '2026-12-10',
};
const HOY = '2026-11-25';

describe('new order form (CP-06 schema of the API + readable messages)', () => {
  it('a valid form becomes exactly the body POST /ordenes accepts', () => {
    expect(validarOrden(valido, HOY)).toEqual({
      ok: true,
      cuerpo: {
        tipoTrabajoId: 1,
        titulo: 'Camisetas sublimadas',
        referenciaCliente: 'Club Deportivo Los Aromos',
        cantidad: 30,
        prioridad: 'NORMAL',
        especificaciones: { detalle: 'S 5 · M 15 · L 10 · azul y blanco' },
        fechaCompromiso: '2026-12-10',
      },
    });
  });

  it('empty specifications are not sent', () => {
    const r = validarOrden({ ...valido, especificaciones: '   ' }, HOY);
    expect(r.ok && r.cuerpo.especificaciones).toEqual({});
  });

  it('each invalid field gets its own message in Spanish', () => {
    const r = validarOrden(
      { ...valido, tipoTrabajoId: '', titulo: 'ab', referenciaCliente: '', cantidad: '0', fechaCompromiso: '' },
      HOY,
    );
    expect(r).toEqual({
      ok: false,
      errores: {
        tipoTrabajoId: 'Elige el tipo de trabajo.',
        titulo: 'Escribe un título de 3 a 120 caracteres.',
        referenciaCliente: 'Escribe el nombre de la institución (2 a 80 caracteres).',
        cantidad: 'Ingresa una cantidad entera entre 1 y 100.000.',
        fechaCompromiso: 'Elige la fecha comprometida.',
      },
    });
  });

  it('a decimal or huge quantity is rejected', () => {
    expect(validarOrden({ ...valido, cantidad: '2.5' }, HOY)).toMatchObject({ ok: false, errores: { cantidad: expect.any(String) } });
    expect(validarOrden({ ...valido, cantidad: '100001' }, HOY)).toMatchObject({ ok: false, errores: { cantidad: expect.any(String) } });
  });

  it('a past commitment date names today, as in the prototype', () => {
    expect(validarOrden({ ...valido, fechaCompromiso: '2026-11-24' }, HOY)).toEqual({
      ok: false,
      errores: { fechaCompromiso: 'La fecha ya pasó. Elige una fecha desde hoy (25-11-2026).' },
    });
    expect(validarOrden({ ...valido, fechaCompromiso: HOY }, HOY).ok).toBe(true);
  });

  it('control characters in the title are rejected like the API does', () => {
    expect(validarOrden({ ...valido, titulo: 'Camisetas\u0000' }, HOY)).toMatchObject({ ok: false, errores: { titulo: expect.any(String) } });
  });
});
