// Single permission map (ES2 section 7.3, Table 7.1). The API decides with it;
// the web client may reuse it only to hide buttons.
// Cells marked ◐ in Table 7.1 grant the permission here; the ownership or state
// condition is enforced by the use case (for example, only own stages).

export const ROLES = [
  'ADMINISTRADOR',
  'ENCARGADA_PRODUCCION',
  'VENDEDOR',
  'DISENADOR',
  'OPERARIO',
] as const;
export type CodigoRol = (typeof ROLES)[number];

export const PERMISOS = [
  'usuarios.gestionar',
  'claves.restablecer',
  'plantillas.gestionar',
  'ordenes.crear',
  'ordenes.editar',
  'ordenes.ver',
  'ordenes.controlar',
  'ordenes.entregar',
  'etapas.gestionar',
  'etapas.avanzar',
  'evidencias.adjuntar',
  'diseno.subir',
  'diseno.resolver',
  'insumos.gestionar',
  'insumos.reportar_faltante',
  'panel.ver',
  'bitacora.ver',
] as const;
export type Permiso = (typeof PERMISOS)[number];

const ENCARGADA: readonly Permiso[] = [
  'claves.restablecer',
  'plantillas.gestionar',
  'ordenes.crear',
  'ordenes.editar',
  'ordenes.ver',
  'ordenes.controlar',
  'ordenes.entregar',
  'etapas.gestionar',
  'etapas.avanzar',
  'evidencias.adjuntar',
  'diseno.subir',
  'diseno.resolver',
  'insumos.gestionar',
  'insumos.reportar_faltante',
  'panel.ver',
  'bitacora.ver',
];

export const PERMISOS_POR_ROL: Readonly<Record<CodigoRol, ReadonlySet<Permiso>>> = {
  ADMINISTRADOR: new Set<Permiso>([...ENCARGADA, 'usuarios.gestionar']),
  ENCARGADA_PRODUCCION: new Set<Permiso>(ENCARGADA),
  VENDEDOR: new Set<Permiso>([
    'ordenes.crear',
    'ordenes.editar',
    'ordenes.ver',
    'ordenes.entregar',
    'diseno.resolver',
    'panel.ver',
  ]),
  DISENADOR: new Set<Permiso>([
    'etapas.avanzar',
    'evidencias.adjuntar',
    'diseno.subir',
    'insumos.reportar_faltante',
  ]),
  OPERARIO: new Set<Permiso>([
    'etapas.avanzar',
    'evidencias.adjuntar',
    'insumos.reportar_faltante',
  ]),
};

export function esCodigoRol(valor: string): valor is CodigoRol {
  return (ROLES as readonly string[]).includes(valor);
}

/** Deny by default: unknown roles and empty role lists grant nothing. */
export function tienePermiso(roles: readonly CodigoRol[], permiso: Permiso): boolean {
  return roles.some((rol) => PERMISOS_POR_ROL[rol]?.has(permiso) ?? false);
}

export type AlcanceBitacora = 'COMPLETA' | 'POR_ORDEN' | 'NINGUNA';

/** Table 7.1, "Ver bitácora": Administrador ✔, Encargada ◐ per work order. */
export function alcanceBitacora(roles: readonly CodigoRol[]): AlcanceBitacora {
  if (roles.includes('ADMINISTRADOR')) return 'COMPLETA';
  if (roles.includes('ENCARGADA_PRODUCCION')) return 'POR_ORDEN';
  return 'NINGUNA';
}
