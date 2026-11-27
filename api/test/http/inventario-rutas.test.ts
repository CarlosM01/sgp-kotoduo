import { describe, expect, it } from 'vitest';
import { PERMISOS } from '../../src/dominio/permisos.js';
import { crearApiDePrueba } from '../apoyo/fakes.js';

// CP-28 (AM-06) route inventory: every route declares its access rule and
// only an explicit allow-list may skip the permission check.
describe('CP-28 route inventory', () => {
  const { rutas } = crearApiDePrueba();
  const firma = (r: (typeof rutas)[number]) => `${r.metodo.toUpperCase()} ${r.ruta}`;

  it('only health and login are public', () => {
    expect(rutas.filter((r) => r.acceso.tipo === 'publica').map(firma).sort()).toEqual([
      'GET /health',
      'POST /auth/login',
    ]);
  });

  it('only cambiar-clave accepts a session without a permission', () => {
    expect(rutas.filter((r) => r.acceso.tipo === 'sesion').map(firma)).toEqual(['POST /auth/cambiar-clave']);
  });

  it('every other route requires a permission from the single map: 0 routes without permission', () => {
    const resto = rutas.filter((r) => r.acceso.tipo !== 'publica' && r.acceso.tipo !== 'sesion');
    const sinPermiso = resto.filter(
      (r) => r.acceso.tipo !== 'permiso' || !(PERMISOS as readonly string[]).includes(r.acceso.permiso),
    );

    expect(resto.length).toBeGreaterThan(0);
    expect(sinPermiso).toEqual([]);
  });

  it('declares each method and path once', () => {
    const firmas = rutas.map(firma);
    expect(new Set(firmas).size).toBe(firmas.length);
  });
});
