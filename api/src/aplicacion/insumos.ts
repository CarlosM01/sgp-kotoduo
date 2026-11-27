// Read use cases of flow 4 for the Encargada (HU-09; CU-08): supplies under
// their minimum and the supply alerts. Consumptions and the manual report act
// on a stage, so they live in the stage use cases (etapas.ts).
import { estaBajoMinimo } from '../dominio/insumos.js';
import type { AlertaVista, FiltroAlerta, InsumoRepositorio, InsumoVista, Pagina } from './puertos.js';

export interface InsumoConEstado extends InsumoVista {
  /** CP-05 rule, the same one that opens the automatic alert. */
  bajoMinimo: boolean;
}

export interface ServicioInsumos {
  listar(): Promise<{ datos: InsumoConEstado[] }>;
  alertas(filtro: { estado: FiltroAlerta; insumoId?: number | undefined; pagina: number; tamano: number }): Promise<Pagina<AlertaVista>>;
}

export function crearServicioInsumos({ insumos }: { insumos: InsumoRepositorio }): ServicioInsumos {
  return {
    async listar() {
      const datos = await insumos.listar();
      return { datos: datos.map((i) => ({ ...i, bajoMinimo: estaBajoMinimo(i.stockActual, i.stockMinimo) })) };
    },

    async alertas(filtro) {
      const { datos, total } = await insumos.listarAlertas(filtro);
      return { datos, total, pagina: filtro.pagina, tamano: filtro.tamano };
    },
  };
}
