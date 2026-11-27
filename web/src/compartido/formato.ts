// Formats of the interface (es-CL, business time zone America/Santiago).
const ZONA = 'America/Santiago';

/** 'YYYY-MM-DD' → 'DD-MM-YYYY'. */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}-${m}-${a}` : iso;
}

const FECHA_HORA = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** ISO instant → 'DD-MM-YYYY HH:mm' in the business time zone. */
export function fechaHora(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const p = Object.fromEntries(FECHA_HORA.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

const FECHA_LOCAL = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today's calendar date in the business time zone, 'YYYY-MM-DD' (same rule as the API). */
export function hoy(ahora = new Date()): string {
  return FECHA_LOCAL.format(ahora);
}

const DECIMAL = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function cantidad(n: number, unidad?: string): string {
  return unidad ? `${DECIMAL.format(n)} ${unidad.toLowerCase()}` : DECIMAL.format(n);
}

/**
 * Quantity typed by a person: comma or point as decimal mark, at most two
 * decimals (NUMERIC(12,2)). Returns null when the text is not such a number.
 */
export function leerCantidad(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(limpio)) return null;
  return Number(limpio);
}

/** Number written for an input the person can correct: 0.6 → '0,60'. */
export function cantidadEditable(n: number): string {
  return n.toFixed(2).replace('.', ',');
}
