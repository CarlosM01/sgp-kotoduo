// Allow-list schema of a new work order (HU-05, CU-04, CP-06). Limits follow
// the orden_trabajo columns; undeclared fields are rejected (mass assignment,
// ES2 Table 7.3 pattern 2). The web form can reuse it (F5).
import { z } from 'zod';

export const PRIORIDADES = ['BAJA', 'NORMAL', 'ALTA', 'URGENTE'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

// Control characters (NUL included) never belong in a title or a reference.
const SIN_CONTROL = /^[^\p{Cc}]*$/u;
// NUL cannot be stored in a PostgreSQL text or jsonb value.
const sinNul = (v: unknown) => !JSON.stringify(v).includes('\\u0000');

const PROFUNDIDAD_MAXIMA = 8;

/** Nesting depth of a JSON value, computed iteratively; stops past the limit. */
function profundidad(valor: unknown): number {
  let maxima = 0;
  const pila: Array<[unknown, number]> = [[valor, 0]];
  while (pila.length) {
    const [v, d] = pila.pop()!;
    if (v === null || typeof v !== 'object') continue;
    if (d + 1 > maxima) maxima = d + 1;
    if (maxima > PROFUNDIDAD_MAXIMA) return maxima;
    for (const hijo of Object.values(v)) pila.push([hijo, d + 1]);
  }
  return maxima;
}

const texto = (min: number, max: number) => z.string().trim().min(min).max(max).regex(SIN_CONTROL);

export const NuevaOrdenSchema = z
  .object({
    tipoTrabajoId: z.number().int().min(1).max(32_767),
    titulo: texto(3, 120),
    referenciaCliente: texto(2, 80),
    descripcion: z.string().trim().max(2_000).refine(sinNul).optional(),
    cantidad: z.number().int().min(1).max(100_000),
    // Sizes, colours, measures: free JSON object, bounded in keys and size.
    // The depth is checked first, without recursion: z.json() recurses and a
    // hostile body nested thousands of levels deep would overflow the stack.
    especificaciones: z
      .unknown()
      .refine((v) => profundidad(v) <= PROFUNDIDAD_MAXIMA, { message: 'Too deep' })
      .pipe(z.record(z.string().min(1).max(40), z.json()))
      .refine((o) => Object.keys(o).length <= 30, { message: 'Too many keys' })
      .refine((o) => JSON.stringify(o).length <= 4_000, { message: 'Too large' })
      .refine(sinNul)
      .default({}),
    prioridad: z.enum(PRIORIDADES).default('NORMAL'),
    fechaCompromiso: z.iso.date(),
  })
  .strict();

export type NuevaOrden = z.output<typeof NuevaOrdenSchema>;
