import { describe, expect, it } from 'vitest';
import {
  ESTADOS_ETAPA,
  ESTADOS_ORDEN,
  puedeTransicionarEtapa,
  puedeTransicionarOrden,
  type EstadoEtapa,
  type EstadoOrden,
} from '../../src/dominio/estados.js';

// The rules mirror the DDL triggers fn_validar_transicion_etapa and
// fn_validar_transicion_orden (ES2 Figures A.5 and A.6).
const SIN_ETAPAS_ABIERTAS = { etapasAbiertas: 0, etapasBloqueadas: 0 };

describe('CP-01: valid transitions (HU-02 / CU-06)', () => {
  it.each<[EstadoEtapa, EstadoEtapa]>([
    ['DISPONIBLE', 'EN_CURSO'],
    ['EN_CURSO', 'TERMINADA'],
    ['EN_CURSO', 'BLOQUEADA'],
    ['BLOQUEADA', 'EN_CURSO'],
    ['DISPONIBLE', 'OMITIDA'],
  ])('stage %s → %s', (desde, hacia) => {
    expect(puedeTransicionarEtapa(desde, hacia, 'EN_PRODUCCION')).toBe(true);
  });

  it.each<[EstadoOrden, EstadoOrden]>([
    ['EN_PRODUCCION', 'DETENIDA'],
    ['DETENIDA', 'EN_DISENO'],
  ])('order %s → %s', (desde, hacia) => {
    expect(puedeTransicionarOrden(desde, hacia, SIN_ETAPAS_ABIERTAS)).toBe(true);
  });

  it('the first started stage moves a registered order into production', () => {
    expect(puedeTransicionarOrden('REGISTRADA', 'EN_PRODUCCION', { etapasAbiertas: 6, etapasBloqueadas: 0 })).toBe(true);
  });

  it('an order with every stage closed may finish', () => {
    expect(puedeTransicionarOrden('EN_PRODUCCION', 'TERMINADA', SIN_ETAPAS_ABIERTAS)).toBe(true);
  });
});

describe('CP-02: invalid transitions are rejected (HU-02 / CU-06)', () => {
  it.each<[EstadoEtapa, EstadoEtapa, EstadoOrden]>([
    ['PENDIENTE', 'TERMINADA', 'EN_PRODUCCION'],
    ['TERMINADA', 'EN_CURSO', 'EN_PRODUCCION'],
    ['DISPONIBLE', 'TERMINADA', 'EN_PRODUCCION'],
    ['EN_CURSO', 'OMITIDA', 'EN_PRODUCCION'],
    ['DISPONIBLE', 'EN_CURSO', 'DETENIDA'],
    ['EN_CURSO', 'TERMINADA', 'DETENIDA'],
  ])('stage %s → %s with the order %s', (desde, hacia, orden) => {
    expect(puedeTransicionarEtapa(desde, hacia, orden)).toBe(false);
  });

  it.each<[EstadoOrden, EstadoOrden, { etapasAbiertas: number; etapasBloqueadas: number }]>([
    ['TERMINADA', 'EN_PRODUCCION', SIN_ETAPAS_ABIERTAS],
    ['DETENIDA', 'TERMINADA', SIN_ETAPAS_ABIERTAS],
    ['EN_PRODUCCION', 'TERMINADA', { etapasAbiertas: 1, etapasBloqueadas: 0 }],
    ['DETENIDA', 'EN_PRODUCCION', { etapasAbiertas: 2, etapasBloqueadas: 1 }],
  ])('order %s → %s (%o)', (desde, hacia, etapas) => {
    expect(puedeTransicionarOrden(desde, hacia, etapas)).toBe(false);
  });

  it('a stage of a cancelled order may only be skipped, and only from EN_CURSO or BLOQUEADA', () => {
    expect(puedeTransicionarEtapa('EN_CURSO', 'OMITIDA', 'ANULADA')).toBe(true);
    expect(puedeTransicionarEtapa('BLOQUEADA', 'OMITIDA', 'ANULADA')).toBe(true);
    expect(puedeTransicionarEtapa('TERMINADA', 'OMITIDA', 'ANULADA')).toBe(false);
  });

  it('staying in the same state is not a transition', () => {
    for (const e of ESTADOS_ETAPA) expect(puedeTransicionarEtapa(e, e, 'EN_PRODUCCION')).toBe(false);
    for (const o of ESTADOS_ORDEN) expect(puedeTransicionarOrden(o, o, SIN_ETAPAS_ABIERTAS)).toBe(false);
  });

  it('only the 7 stage transitions of Figure A.5 are allowed with an active order (exhaustive)', () => {
    const permitidas = ESTADOS_ETAPA.flatMap((d) =>
      ESTADOS_ETAPA.filter((h) => puedeTransicionarEtapa(d, h, 'EN_PRODUCCION')).map((h) => `${d}→${h}`),
    );
    expect(permitidas.sort()).toEqual(
      [
        'PENDIENTE→DISPONIBLE',
        'PENDIENTE→OMITIDA',
        'DISPONIBLE→EN_CURSO',
        'DISPONIBLE→OMITIDA',
        'EN_CURSO→TERMINADA',
        'EN_CURSO→BLOQUEADA',
        'BLOQUEADA→EN_CURSO',
      ].sort(),
    );
  });
});
