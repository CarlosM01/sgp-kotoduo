// Stage generation from the template of the work type (HU-07, CU-04, CP-03).
import type { EstadoEtapa } from './estados.js';

export interface InsumoPlantilla {
  insumoId: number;
  /** Up to 3 decimals (plantilla_insumo.cantidad_por_unidad NUMERIC(10,3)). */
  cantidadPorUnidad: number;
}

export interface PlantillaEtapa {
  id: number;
  secuencia: number;
  nombre: string;
  areaId: number;
  instrucciones: string;
  duracionEstimadaHoras: number;
  esEtapaDiseno: boolean;
  insumos: readonly InsumoPlantilla[];
}

export interface Requerimiento {
  insumoId: number;
  /** Up to 2 decimals (requerimiento_insumo.cantidad_requerida NUMERIC(12,2)). */
  cantidadRequerida: number;
}

export interface EtapaGenerada {
  plantillaEtapaId: number;
  secuencia: number;
  nombre: string;
  areaId: number;
  instrucciones: string;
  duracionEstimadaHoras: number;
  esEtapaDiseno: boolean;
  estado: EstadoEtapa;
  requerimientos: Requerimiento[];
}

/**
 * quantity × quantity per unit, in integer thousandths to avoid floating point
 * drift, rounded UP to the cent: a requirement is never 0 (CHECK > 0) and the
 * supply estimate errs on the safe side.
 */
function requerido(cantidadPorUnidad: number, cantidad: number): number {
  const milesimas = Math.round(cantidadPorUnidad * 1000) * cantidad;
  return Math.ceil(milesimas / 10) / 100;
}

export function generarEtapas(plantilla: readonly PlantillaEtapa[], cantidad: number): EtapaGenerada[] {
  if (plantilla.length === 0) throw new RangeError('The template has no stages');
  if (!Number.isInteger(cantidad) || cantidad < 1) throw new RangeError('The quantity must be a positive integer');

  return [...plantilla]
    .sort((a, b) => a.secuencia - b.secuencia)
    .map((p, i) => ({
      plantillaEtapaId: p.id,
      secuencia: p.secuencia,
      nombre: p.nombre,
      areaId: p.areaId,
      instrucciones: p.instrucciones,
      duracionEstimadaHoras: p.duracionEstimadaHoras,
      esEtapaDiseno: p.esEtapaDiseno,
      estado: i === 0 ? 'DISPONIBLE' : 'PENDIENTE',
      requerimientos: p.insumos.map((ins) => ({
        insumoId: ins.insumoId,
        cantidadRequerida: requerido(ins.cantidadPorUnidad, cantidad),
      })),
    }));
}
