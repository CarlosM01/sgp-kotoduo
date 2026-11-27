// New order form → body of POST /ordenes. The rules are the API's own schema
// (NuevaOrdenSchema, CP-06); this file only turns its issues into messages a
// person understands, one per field, and adds the "date already passed" check.
import { NuevaOrdenSchema, type NuevaOrden } from '@dominio/nueva-orden.js';
import { fecha } from '../compartido/formato';

export interface FormularioOrden {
  tipoTrabajoId: string;
  titulo: string;
  referenciaCliente: string;
  cantidad: string;
  prioridad: string;
  especificaciones: string;
  fechaCompromiso: string;
}

export type CampoOrden = keyof FormularioOrden;
export type ErroresOrden = Partial<Record<CampoOrden, string>>;

export const MENSAJES: Readonly<Record<CampoOrden, string>> = {
  tipoTrabajoId: 'Elige el tipo de trabajo.',
  titulo: 'Escribe un título de 3 a 120 caracteres.',
  referenciaCliente: 'Escribe el nombre de la institución (2 a 80 caracteres).',
  cantidad: 'Ingresa una cantidad entera entre 1 y 100.000.',
  prioridad: 'Elige una prioridad.',
  especificaciones: 'Las especificaciones son demasiado largas (máximo 2.000 caracteres).',
  fechaCompromiso: 'Elige la fecha comprometida.',
};

const entero = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : Number.NaN);

export function validarOrden(f: FormularioOrden, hoy: string): { ok: true; cuerpo: NuevaOrden } | { ok: false; errores: ErroresOrden } {
  const detalle = f.especificaciones.trim();
  const resultado = NuevaOrdenSchema.safeParse({
    tipoTrabajoId: f.tipoTrabajoId ? entero(f.tipoTrabajoId) : undefined,
    titulo: f.titulo,
    referenciaCliente: f.referenciaCliente,
    cantidad: entero(f.cantidad),
    prioridad: f.prioridad,
    especificaciones: detalle ? { detalle } : {},
    fechaCompromiso: f.fechaCompromiso,
  });

  const errores: ErroresOrden = {};
  if (!resultado.success) {
    for (const issue of resultado.error.issues) {
      const campo = issue.path[0] as CampoOrden | undefined;
      if (campo && campo in MENSAJES && !errores[campo]) errores[campo] = MENSAJES[campo];
    }
  }
  if (!errores.fechaCompromiso && f.fechaCompromiso && f.fechaCompromiso < hoy) {
    errores.fechaCompromiso = `La fecha ya pasó. Elige una fecha desde hoy (${fecha(hoy)}).`;
  }
  if (Object.keys(errores).length || !resultado.success) return { ok: false, errores };
  return { ok: true, cuerpo: resultado.data };
}
