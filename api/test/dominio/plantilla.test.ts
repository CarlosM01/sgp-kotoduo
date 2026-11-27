import { describe, expect, it } from 'vitest';
import { generarEtapas, type PlantillaEtapa } from '../../src/dominio/plantilla.js';

// Template "Uniforme deportivo sublimado" as seeded by 01_ddl.sql
// (plantilla_etapa ids 1-6, plantilla_insumo rows of stages 2 and 4).
const UNIFORME: PlantillaEtapa[] = [
  { id: 4, secuencia: 4, nombre: 'Corte', areaId: 3, instrucciones: 'Cortar', duracionEstimadaHoras: 3, esEtapaDiseno: false, insumos: [{ insumoId: 4, cantidadPorUnidad: 1.2 }] },
  { id: 1, secuencia: 1, nombre: 'Diseño y aprobación', areaId: 2, instrucciones: 'Diseñar', duracionEstimadaHoras: 4, esEtapaDiseno: true, insumos: [] },
  { id: 2, secuencia: 2, nombre: 'Impresión de transfer', areaId: 7, instrucciones: 'Imprimir', duracionEstimadaHoras: 3, esEtapaDiseno: false, insumos: [{ insumoId: 1, cantidadPorUnidad: 0.01 }, { insumoId: 3, cantidadPorUnidad: 0.02 }] },
  { id: 3, secuencia: 3, nombre: 'Sublimado', areaId: 6, instrucciones: 'Planchar', duracionEstimadaHoras: 4, esEtapaDiseno: false, insumos: [] },
  { id: 5, secuencia: 5, nombre: 'Confección', areaId: 4, instrucciones: 'Unir', duracionEstimadaHoras: 8, esEtapaDiseno: false, insumos: [] },
  { id: 6, secuencia: 6, nombre: 'Control y despacho', areaId: 10, instrucciones: 'Revisar', duracionEstimadaHoras: 1, esEtapaDiseno: false, insumos: [] },
];

describe('CP-03: stages generated from the template (HU-07 / CU-04)', () => {
  const etapas = generarEtapas(UNIFORME, 30);

  it('creates the 6 stages in sequence 1..6', () => {
    expect(etapas.map((e) => e.secuencia)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(etapas.map((e) => e.plantillaEtapaId)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(etapas[0]).toMatchObject({ nombre: 'Diseño y aprobación', areaId: 2, esEtapaDiseno: true, duracionEstimadaHoras: 4 });
  });

  it('the first stage is DISPONIBLE and the rest PENDIENTE', () => {
    expect(etapas.map((e) => e.estado)).toEqual(['DISPONIBLE', 'PENDIENTE', 'PENDIENTE', 'PENDIENTE', 'PENDIENTE', 'PENDIENTE']);
  });

  it('requirements = quantity × quantity per unit (fabric 36 m)', () => {
    expect(etapas[3]?.requerimientos).toEqual([{ insumoId: 4, cantidadRequerida: 36 }]);
    expect(etapas[1]?.requerimientos).toEqual([
      { insumoId: 1, cantidadRequerida: 0.3 },
      { insumoId: 3, cantidadRequerida: 0.6 },
    ]);
    expect(etapas[0]?.requerimientos).toEqual([]);
  });

  it('rounds requirements up to the cent so a small order never needs 0', () => {
    const [etapa] = generarEtapas([{ ...UNIFORME[2]!, secuencia: 1, insumos: [{ insumoId: 1, cantidadPorUnidad: 0.001 }] }], 1);
    expect(etapa?.requerimientos).toEqual([{ insumoId: 1, cantidadRequerida: 0.01 }]);
  });

  it('avoids floating point drift (0.01 × 7 = 0.07, 1.2 × 3 = 3.6)', () => {
    const [etapa] = generarEtapas(
      [{ ...UNIFORME[2]!, secuencia: 1, insumos: [{ insumoId: 1, cantidadPorUnidad: 0.01 }, { insumoId: 4, cantidadPorUnidad: 1.2 }] }],
      7,
    );
    expect(etapa?.requerimientos).toEqual([
      { insumoId: 1, cantidadRequerida: 0.07 },
      { insumoId: 4, cantidadRequerida: 8.4 },
    ]);
    expect(generarEtapas([{ ...UNIFORME[0]!, secuencia: 1 }], 3)[0]?.requerimientos).toEqual([{ insumoId: 4, cantidadRequerida: 3.6 }]);
  });

  it('does not modify the template', () => {
    const copia = structuredClone(UNIFORME);
    generarEtapas(UNIFORME, 30);
    expect(UNIFORME).toEqual(copia);
  });

  it('rejects an empty template and a quantity that is not a positive integer', () => {
    expect(() => generarEtapas([], 30)).toThrow(RangeError);
    expect(() => generarEtapas(UNIFORME, 0)).toThrow(RangeError);
    expect(() => generarEtapas(UNIFORME, 2.5)).toThrow(RangeError);
  });
});
