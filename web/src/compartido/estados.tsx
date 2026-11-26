// Status chips: colour + icon + text, never colour alone (WCAG 1.4.1).
// Same vocabulary in every screen (consistency, criterion 3.1.1).
import type { EstadoEtapa, EstadoOrden, Prioridad } from './contrato';
import { Icono, type IconoNombre } from './iconos';

type Tono = '' | 't-info' | 't-activo' | 't-ok' | 't-adv' | 't-peligro' | 't-acento' | 't-tachado';

interface Estilo {
  tono: Tono;
  icono: IconoNombre;
  texto: string;
}

export const ESTADO_ETAPA: Readonly<Record<EstadoEtapa, Estilo>> = {
  PENDIENTE: { tono: '', icono: 'circulo', texto: 'Pendiente' },
  DISPONIBLE: { tono: 't-info', icono: 'disponible', texto: 'Disponible' },
  EN_CURSO: { tono: 't-activo', icono: 'reloj', texto: 'En curso' },
  BLOQUEADA: { tono: 't-adv', icono: 'alerta', texto: 'Bloqueada' },
  TERMINADA: { tono: 't-ok', icono: 'check', texto: 'Terminada' },
  OMITIDA: { tono: 't-tachado', icono: 'omitir', texto: 'Omitida' },
};

export const ESTADO_ORDEN: Readonly<Record<EstadoOrden, Estilo>> = {
  REGISTRADA: { tono: '', icono: 'circulo', texto: 'Registrada' },
  EN_DISENO: { tono: '', icono: 'lapiz', texto: 'En diseño' },
  EN_PRODUCCION: { tono: 't-info', icono: 'flecha', texto: 'En producción' },
  DETENIDA: { tono: 't-adv', icono: 'alerta', texto: 'Detenida' },
  TERMINADA: { tono: 't-ok', icono: 'check', texto: 'Terminada' },
  ENTREGADA: { tono: 't-ok', icono: 'camion', texto: 'Entregada' },
  ANULADA: { tono: 't-tachado', icono: 'x', texto: 'Anulada' },
};

export const PRIORIDAD: Readonly<Record<Prioridad, string>> = {
  BAJA: 'Baja',
  NORMAL: 'Normal',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

export function Chip({ tono = '', icono, texto }: Estilo) {
  return (
    <span className={`chip${tono ? ` ${tono}` : ''}`}>
      <Icono nombre={icono} />
      {texto}
    </span>
  );
}

export const ChipEtapa = ({ estado }: { estado: EstadoEtapa }) => <Chip {...ESTADO_ETAPA[estado]} />;
export const ChipOrden = ({ estado }: { estado: EstadoOrden }) => <Chip {...ESTADO_ORDEN[estado]} />;

/** Only the priorities that need attention get a chip (prototype: "Urgente"). */
export function ChipPrioridad({ prioridad }: { prioridad: Prioridad }) {
  if (prioridad === 'URGENTE') return <Chip tono="t-acento" icono="sube" texto="Urgente" />;
  if (prioridad === 'ALTA') return <Chip tono="t-acento" icono="sube" texto="Alta" />;
  return null;
}
