// Audit log rows (HU-12, CU-11): read only. Shared by the full log
// (Administrador) and the history of one order (Encargada and Administrador).
import type { EventoBitacora } from '../compartido/contrato';
import { ESTADO_ETAPA, ESTADO_ORDEN } from '../compartido/estados';
import { fechaHora } from '../compartido/formato';

export const ETIQUETAS_EVENTO: Readonly<Record<string, string>> = {
  LOGIN_EXITOSO: 'Ingreso al sistema',
  LOGIN_FALLIDO: 'Ingreso fallido',
  CUENTA_BLOQUEADA: 'Cuenta bloqueada',
  CLAVE_CAMBIADA: 'Contraseña cambiada',
  ACCESO_DENEGADO: 'Acceso denegado',
  ORDEN_REGISTRADA: 'Orden registrada',
  ORDEN_ESTADO_CAMBIADO: 'Estado de la orden',
  ETAPA_ASIGNADA: 'Responsable asignado',
  ETAPA_INICIADA: 'Etapa iniciada',
  ETAPA_TERMINADA: 'Etapa terminada',
  INSUMO_MOVIMIENTO: 'Movimiento de insumo',
  ALERTA_INSUMO_CREADA: 'Alerta de insumo creada',
};

/** Groups of the type filter of the full log. */
export const GRUPOS_EVENTO: Readonly<Record<string, readonly string[]>> = {
  Accesos: ['LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'CUENTA_BLOQUEADA', 'CLAVE_CAMBIADA', 'ACCESO_DENEGADO'],
  Órdenes: ['ORDEN_REGISTRADA', 'ORDEN_ESTADO_CAMBIADO'],
  Etapas: ['ETAPA_ASIGNADA', 'ETAPA_INICIADA', 'ETAPA_TERMINADA'],
  Insumos: ['INSUMO_MOVIMIENTO', 'ALERTA_INSUMO_CREADA'],
};

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

function estado(v: unknown): string {
  const k = texto(v);
  return (ESTADO_ORDEN as Record<string, { texto: string }>)[k]?.texto ?? (ESTADO_ETAPA as Record<string, { texto: string }>)[k]?.texto ?? k;
}

/** One readable line from the payload of each event type. */
export function detalleEvento(e: EventoBitacora, nombres: ReadonlyMap<string, string>): string {
  const p = e.payload;
  const nombre = (id: unknown) => nombres.get(texto(id)) ?? 'otra persona';
  switch (e.tipo) {
    case 'ORDEN_REGISTRADA':
      return `${texto(p.codigo)} · ${texto(p.etapas)} etapas generadas desde la plantilla`;
    case 'ORDEN_ESTADO_CAMBIADO':
      return `${estado(p.estado_anterior)} → ${estado(p.estado_nuevo)}${p.por_etapa ? ` (al avanzar ${texto(p.por_etapa)})` : ''}`;
    case 'ETAPA_ASIGNADA':
      return `${texto(p.etapa)} → ${nombre(p.responsable_nuevo)}`;
    case 'ETAPA_INICIADA':
    case 'ETAPA_TERMINADA':
      return `${texto(p.etapa)} · ${estado(p.estado_anterior)} → ${estado(p.estado_nuevo)}`;
    case 'INSUMO_MOVIMIENTO':
      return `${texto(p.insumo)} · ${texto(p.cantidad)} (queda ${texto(p.stock_resultante)}) · ${texto(p.etapa)}`;
    case 'ALERTA_INSUMO_CREADA':
      return `${texto(p.insumo)} · ${p.origen === 'MANUAL' ? 'reporte manual' : 'automática bajo el mínimo'}${p.etapa ? ` · ${texto(p.etapa)}` : ''}`;
    case 'LOGIN_FALLIDO':
      return `Usuario «${texto(p.nombre_usuario)}»`;
    case 'CUENTA_BLOQUEADA':
      return `${texto(p.intentos)} intentos fallidos · ${texto(p.minutos)} min`;
    case 'ACCESO_DENEGADO':
      return `${texto(p.metodo)} ${texto(p.ruta)}`;
    default:
      return '';
  }
}

export function quienEs(e: EventoBitacora, nombres: ReadonlyMap<string, string>): string {
  const id = e.actor.usuarioId;
  if (!id) return 'Sistema';
  return nombres.get(id) ?? (typeof e.payload.nombre_usuario === 'string' ? e.payload.nombre_usuario : `Usuario ${id.slice(-4)}`);
}

export function TablaEventos({ eventos, nombres }: { eventos: EventoBitacora[]; nombres: ReadonlyMap<string, string> }) {
  if (!eventos.length) return <div className="tabla"><p className="vacio-tabla">Aún no hay eventos registrados.</p></div>;
  return (
    <div className="tabla">
      <table className="responsive">
        <thead>
          <tr>
            <th scope="col">Fecha y hora</th>
            <th scope="col">Usuario</th>
            <th scope="col">Evento</th>
            <th scope="col">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {eventos.map((e) => (
            <tr key={e.id}>
              <td data-label="Fecha">{fechaHora(e.ts)}</td>
              <td data-label="Usuario">{quienEs(e, nombres)}</td>
              <td data-label="Evento">{ETIQUETAS_EVENTO[e.tipo] ?? e.tipo}</td>
              <td data-label="Detalle">{detalleEvento(e, nombres)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
