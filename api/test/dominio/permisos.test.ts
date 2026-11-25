import { describe, expect, it } from 'vitest';
import {
  PERMISOS,
  PERMISOS_POR_ROL,
  ROLES,
  alcanceBitacora,
  tienePermiso,
  type CodigoRol,
  type Permiso,
} from '../../src/dominio/permisos.js';

// CP-08 (HU-11 / CU-02): the permission map must match ES2 Table 7.1.
// Transcription of the table: ✔ allowed · ◐ allowed only over own resources or
// depending on state (checked in the service) · — denied.
const TABLA_7_1: Record<Permiso, Record<CodigoRol, '✔' | '◐' | '—'>> = {
  'usuarios.gestionar':        { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '—', VENDEDOR: '—', DISENADOR: '—', OPERARIO: '—' },
  'claves.restablecer':        { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '—', DISENADOR: '—', OPERARIO: '—' },
  'plantillas.gestionar':      { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '—', DISENADOR: '—', OPERARIO: '—' },
  'ordenes.crear':             { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '✔', DISENADOR: '—', OPERARIO: '—' },
  'ordenes.editar':            { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '◐', DISENADOR: '—', OPERARIO: '—' },
  'ordenes.ver':               { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '✔', DISENADOR: '—', OPERARIO: '—' },
  'ordenes.controlar':         { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '—', DISENADOR: '—', OPERARIO: '—' },
  'ordenes.entregar':          { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '✔', DISENADOR: '—', OPERARIO: '—' },
  'etapas.gestionar':          { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '—', DISENADOR: '—', OPERARIO: '—' },
  'etapas.avanzar':            { ADMINISTRADOR: '◐', ENCARGADA_PRODUCCION: '◐', VENDEDOR: '—', DISENADOR: '◐', OPERARIO: '◐' },
  'evidencias.adjuntar':       { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '—', DISENADOR: '◐', OPERARIO: '◐' },
  'diseno.subir':              { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '—', DISENADOR: '✔', OPERARIO: '—' },
  'diseno.resolver':           { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '✔', DISENADOR: '—', OPERARIO: '—' },
  'insumos.gestionar':         { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '—', DISENADOR: '—', OPERARIO: '—' },
  'insumos.reportar_faltante': { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '—', DISENADOR: '✔', OPERARIO: '✔' },
  'panel.ver':                 { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '✔', VENDEDOR: '✔', DISENADOR: '—', OPERARIO: '—' },
  'bitacora.ver':              { ADMINISTRADOR: '✔', ENCARGADA_PRODUCCION: '◐', VENDEDOR: '—', DISENADOR: '—', OPERARIO: '—' },
};

const celdas = (Object.keys(TABLA_7_1) as Permiso[]).flatMap((permiso) =>
  ROLES.map((rol) => ({ permiso, rol, celda: TABLA_7_1[permiso][rol] })),
);

describe('CP-08 PERMISOS_POR_ROL', () => {
  it('declares exactly the 17 permissions of Table 7.1', () => {
    expect([...PERMISOS].sort()).toEqual(Object.keys(TABLA_7_1).sort());
  });

  it('covers the 5 roles of the system', () => {
    expect(Object.keys(PERMISOS_POR_ROL).sort()).toEqual([...ROLES].sort());
  });

  it.each(celdas)('$rol · $permiso = $celda', ({ permiso, rol, celda }) => {
    expect(tienePermiso([rol], permiso)).toBe(celda !== '—');
  });

  it('Operario cannot create work orders and Diseñador cannot resolve designs', () => {
    expect(tienePermiso(['OPERARIO'], 'ordenes.crear')).toBe(false);
    expect(tienePermiso(['DISENADOR'], 'diseno.resolver')).toBe(false);
  });

  it('denies by default: no roles or unknown roles grant nothing', () => {
    expect(tienePermiso([], 'ordenes.ver')).toBe(false);
    expect(tienePermiso(['ROOT' as CodigoRol], 'ordenes.ver')).toBe(false);
  });

  it('a user with several roles gets the union of their permissions', () => {
    expect(tienePermiso(['OPERARIO', 'VENDEDOR'], 'ordenes.crear')).toBe(true);
    expect(tienePermiso(['OPERARIO', 'VENDEDOR'], 'insumos.reportar_faltante')).toBe(true);
  });
});

describe('alcanceBitacora (◐ "por OT" of the Encargada)', () => {
  it('Administrador sees the whole log, Encargada only per work order, others nothing', () => {
    expect(alcanceBitacora(['ADMINISTRADOR'])).toBe('COMPLETA');
    expect(alcanceBitacora(['ENCARGADA_PRODUCCION'])).toBe('POR_ORDEN');
    expect(alcanceBitacora(['OPERARIO'])).toBe('NINGUNA');
    expect(alcanceBitacora(['ENCARGADA_PRODUCCION', 'ADMINISTRADOR'])).toBe('COMPLETA');
  });
});
