// Calendar rules: estimated end date (HU-05, CU-04, CP-04).
// Dates are plain calendar dates ('YYYY-MM-DD'), the same as the DATE columns.
// Chilean public holidays are not considered (declared limitation of the MVP).

export const ZONA_HORARIA_NEGOCIO = 'America/Santiago';
export const JORNADA_HORAS = 8;

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DIA = 86_400_000;

function aUtc(fecha: string): number {
  const m = FECHA.exec(fecha);
  if (!m) throw new RangeError(`Invalid date: ${fecha}`);
  const [, a, mes, d] = m.map(Number) as [number, number, number, number];
  const t = Date.UTC(a, mes - 1, d);
  // Date.UTC rolls 2026-02-30 over to March: reject anything that does not round-trip.
  if (new Date(t).toISOString().slice(0, 10) !== fecha) throw new RangeError(`Invalid date: ${fecha}`);
  return t;
}

const esHabil = (t: number) => {
  const dia = new Date(t).getUTCDay();
  return dia !== 0 && dia !== 6;
};

/** Calendar date of an instant in the business time zone. */
export function fechaLocal(instante: Date, zona = ZONA_HORARIA_NEGOCIO): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
}

/**
 * The work takes ceil(hours / working day) working days. Day 1 is the
 * registration day when it is a working day, otherwise the next one; Saturday
 * and Sunday are skipped. Monday + 23 h with 8 h days → Wednesday.
 */
export function calcularFechaEstimada({
  fechaRegistro,
  horasTotales,
  jornadaHoras = JORNADA_HORAS,
}: {
  fechaRegistro: string;
  horasTotales: number;
  jornadaHoras?: number;
}): string {
  if (!(horasTotales > 0) || !Number.isFinite(horasTotales)) throw new RangeError('Total hours must be positive');
  if (!(jornadaHoras > 0) || !Number.isFinite(jornadaHoras)) throw new RangeError('The working day must be positive');

  let pendientes = Math.ceil(horasTotales / jornadaHoras);
  let t = aUtc(fechaRegistro);
  for (;;) {
    if (esHabil(t) && --pendientes === 0) return new Date(t).toISOString().slice(0, 10);
    t += MS_DIA;
  }
}

/** Throws RangeError when the text is not a real calendar date. */
export function validarFecha(fecha: string): void {
  aUtc(fecha);
}
