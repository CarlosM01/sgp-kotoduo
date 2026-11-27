// What each role sees in the client (ES2 Fig. 5.1 to 5.3). UX only: it reuses
// the API's single permission map to hide screens and buttons; the API decides.
import { alcanceBitacora, tienePermiso, type CodigoRol, type Permiso } from '@dominio/permisos.js';
import type { IconoNombre } from './iconos';

export type Destino = 'panel' | 'ordenes' | 'nueva' | 'mi-trabajo' | 'insumos' | 'bitacora';

export const DESTINOS: Readonly<Record<Destino, { ruta: string; texto: string; icono: IconoNombre }>> = {
  panel: { ruta: '/panel', texto: 'Panel', icono: 'panel' },
  ordenes: { ruta: '/ordenes', texto: 'Órdenes', icono: 'lista' },
  nueva: { ruta: '/ordenes/nueva', texto: 'Nueva orden', icono: 'mas' },
  'mi-trabajo': { ruta: '/mi-trabajo', texto: 'Mi Trabajo', icono: 'trabajo' },
  insumos: { ruta: '/insumos', texto: 'Insumos', icono: 'caja' },
  bitacora: { ruta: '/bitacora', texto: 'Bitácora', icono: 'bitacora' },
};

/** Access rule of each screen: a permission of Table 7.1, or the full audit log. */
export type Regla = { permiso: Permiso } | { bitacoraCompleta: true };

export const REGLAS: Readonly<Record<Destino, Regla>> = {
  panel: { permiso: 'panel.ver' },
  ordenes: { permiso: 'ordenes.ver' },
  nueva: { permiso: 'ordenes.crear' },
  'mi-trabajo': { permiso: 'etapas.avanzar' },
  insumos: { permiso: 'insumos.gestionar' },
  bitacora: { bitacoraCompleta: true },
};

// Navigation of each role, in order; "+" = desktop sidebar only (bottom bar keeps 3–4 items).
const NAV: Readonly<Record<CodigoRol, readonly string[]>> = {
  OPERARIO: ['mi-trabajo'],
  DISENADOR: ['mi-trabajo'],
  VENDEDOR: ['ordenes', 'nueva', 'panel'],
  ENCARGADA_PRODUCCION: ['panel', 'ordenes', 'insumos', 'mi-trabajo'],
  ADMINISTRADOR: ['panel', 'ordenes', 'insumos', 'bitacora', '+mi-trabajo'],
};

export function cumple(roles: readonly CodigoRol[], regla: Regla): boolean {
  return 'permiso' in regla ? tienePermiso(roles, regla.permiso) : alcanceBitacora(roles) === 'COMPLETA';
}

export function puede(roles: readonly CodigoRol[], permiso: Permiso): boolean {
  return tienePermiso(roles, permiso);
}

export interface EntradaNav {
  destino: Destino;
  soloEscritorio: boolean;
}

/** Union of the navigation of every role of the user, without repeats and only what they may open. */
export function navegacionDe(roles: readonly CodigoRol[]): EntradaNav[] {
  const vistas = new Set<Destino>();
  const entradas: EntradaNav[] = [];
  for (const rol of roles) {
    for (const clave of NAV[rol] ?? []) {
      const destino = clave.replace('+', '') as Destino;
      if (vistas.has(destino) || !cumple(roles, REGLAS[destino])) continue;
      vistas.add(destino);
      entradas.push({ destino, soloEscritorio: clave.startsWith('+') });
    }
  }
  return entradas;
}

/** Home screen of the user (Fig. 5.1): panel for management, orders for sales, my work otherwise. */
export function inicioDe(roles: readonly CodigoRol[]): string {
  if (roles.includes('ADMINISTRADOR') || roles.includes('ENCARGADA_PRODUCCION')) return DESTINOS.panel.ruta;
  if (puede(roles, 'ordenes.ver')) return DESTINOS.ordenes.ruta;
  if (puede(roles, 'etapas.avanzar')) return DESTINOS['mi-trabajo'].ruta;
  return '/sin-acceso';
}

const CARGOS: Readonly<Record<CodigoRol, string>> = {
  ADMINISTRADOR: 'Administrador',
  ENCARGADA_PRODUCCION: 'Encargada de Producción',
  VENDEDOR: 'Vendedor',
  DISENADOR: 'Diseñador',
  OPERARIO: 'Operario',
};

export function cargoDe(roles: readonly CodigoRol[]): string {
  return roles.map((r) => CARGOS[r]).join(' · ') || 'Sin rol';
}
