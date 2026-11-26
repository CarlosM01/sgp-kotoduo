import { describe, expect, it } from 'vitest';
import { cumple, inicioDe, navegacionDe, REGLAS } from '../src/compartido/acceso';

describe('role navigation (ES2 Fig. 5.1–5.3, UX only)', () => {
  const destinos = (roles: Parameters<typeof navegacionDe>[0]) => navegacionDe(roles).map((e) => e.destino);

  it('each role sees only the screens its permissions open', () => {
    expect(destinos(['OPERARIO'])).toEqual(['mi-trabajo']);
    expect(destinos(['DISENADOR'])).toEqual(['mi-trabajo']);
    expect(destinos(['VENDEDOR'])).toEqual(['ordenes', 'nueva', 'panel']);
    expect(destinos(['ENCARGADA_PRODUCCION'])).toEqual(['panel', 'ordenes', 'insumos', 'mi-trabajo']);
    expect(destinos(['ADMINISTRADOR'])).toEqual(['panel', 'ordenes', 'insumos', 'bitacora', 'mi-trabajo']);
  });

  it('the bottom bar keeps at most 4 items; the rest are desktop only', () => {
    for (const rol of ['OPERARIO', 'DISENADOR', 'VENDEDOR', 'ENCARGADA_PRODUCCION', 'ADMINISTRADOR'] as const) {
      expect(navegacionDe([rol]).filter((e) => !e.soloEscritorio).length).toBeLessThanOrEqual(4);
    }
  });

  it('a user with two roles gets the union without repeats', () => {
    expect(destinos(['VENDEDOR', 'OPERARIO'])).toEqual(['ordenes', 'nueva', 'panel', 'mi-trabajo']);
  });

  it('home screen: panel for management, orders for sales, my work for production', () => {
    expect(inicioDe(['ADMINISTRADOR'])).toBe('/panel');
    expect(inicioDe(['ENCARGADA_PRODUCCION'])).toBe('/panel');
    expect(inicioDe(['VENDEDOR'])).toBe('/ordenes');
    expect(inicioDe(['OPERARIO'])).toBe('/mi-trabajo');
    expect(inicioDe(['DISENADOR'])).toBe('/mi-trabajo');
    expect(inicioDe([])).toBe('/sin-acceso');
  });

  it('the full audit log screen is for the Administrador only (the Encargada sees it per order)', () => {
    expect(cumple(['ADMINISTRADOR'], REGLAS.bitacora)).toBe(true);
    expect(cumple(['ENCARGADA_PRODUCCION'], REGLAS.bitacora)).toBe(false);
  });
});
