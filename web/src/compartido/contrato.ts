// HTTP contract of the API, imported as types only from the API sources so the
// client cannot drift from the responses it reads (erased at build time).
export type {
  AlertaVista,
  EtapaDeTrabajo,
  EtapaVista,
  EventoBitacora,
  FilaPanel,
  InsumoVista,
  OrdenDetalle,
  OrdenResumen,
  Pagina,
  RequerimientoVista,
  Responsable,
  ResumenPanel,
  TipoTrabajoVista,
} from '@api/aplicacion/puertos.js';
export type { Sesion } from '@api/aplicacion/auth.js';
export type { AlertaReportada, EtapaIniciada, EtapaTerminada, MiTrabajo } from '@api/aplicacion/etapas.js';
export type { Asignacion, OrdenCreada } from '@api/aplicacion/ordenes.js';
export type { EstadoEtapa, EstadoOrden } from '@dominio/estados.js';
export type { Prioridad } from '@dominio/nueva-orden.js';
export type { CodigoRol } from '@dominio/permisos.js';
