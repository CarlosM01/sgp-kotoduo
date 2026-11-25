// Strict input validation (ES2 Table 7.3, pattern 2): every route parses its
// input with an allow-list schema; controllers only use the parsed result.
import type { z } from 'zod';
import { ErrorValidacion } from '../../aplicacion/errores.js';

export function parsear<S extends z.ZodType>(esquema: S, valor: unknown): z.output<S> {
  const r = esquema.safeParse(valor);
  if (!r.success) {
    // Only the field path and the issue kind are returned, never the received value.
    const detalles = r.error.issues.map((i) => ({
      campo: i.path.length ? i.path.join('.') : '(raíz)',
      problema: i.code,
    }));
    throw new ErrorValidacion('Los datos enviados no son válidos', detalles);
  }
  return r.data;
}
