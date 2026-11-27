// Supply rules of flow 4 (HU-09, HU-03; CU-08, CU-09). Quantities follow the
// NUMERIC(12,2) columns of insumo, movimiento_insumo and alerta_insumo.
import { z } from 'zod';

/**
 * CP-05: a supply needs attention when its stock is at or below the minimum.
 * Same "≤" rule as the DDL trigger fn_aplicar_movimiento_insumo, which opens
 * the automatic alert.
 */
export function estaBajoMinimo(stock: number, minimo: number): boolean {
  return stock <= minimo;
}

// NUMERIC(12,2): at most 10 integer digits and 2 decimals. The decimals are
// checked on the decimal text of the number, so 0.6 or 2.55 (not exact in
// binary) are accepted and 0.125 is not.
const MAXIMO = 9_999_999_999.99;
const conDosDecimales = (n: number) => /^\d+(\.\d{1,2})?$/.test(String(n));

export const CantidadSchema = z.number().positive().max(MAXIMO).refine(conDosDecimales, { message: 'At most 2 decimals' });

const IdInsumoSchema = z.number().int().min(1).max(2_147_483_647);

/** Body item of POST /etapas/{id}/terminar (CP-12, D23): the actual quantity used. */
export const ConsumoSchema = z.object({ insumoId: IdInsumoSchema, cantidad: CantidadSchema }).strict();

export const ConsumosSchema = z
  .array(ConsumoSchema)
  .max(20)
  .refine((lista) => new Set(lista.map((c) => c.insumoId)).size === lista.length, { message: 'Duplicate supply' })
  .default([]);

export type Consumo = z.output<typeof ConsumoSchema>;

// Control characters other than tab and line breaks never belong in a comment;
// NUL cannot be stored in a PostgreSQL text column.
const SIN_CONTROL = /^(?:[^\p{Cc}]|[\t\n\r])*$/u;

/** Body of POST /alertas (CP-15, D24). The origin and the reporter are never taken from the body. */
export const NuevaAlertaSchema = z
  .object({
    insumoId: IdInsumoSchema,
    // z.guid(): the seed uses fixed, non-RFC-4122 UUIDs.
    etapaId: z.guid(),
    comentario: z.string().trim().min(1).max(255).regex(SIN_CONTROL).optional(),
    cantidadFaltante: CantidadSchema.optional(),
  })
  .strict();

export type NuevaAlerta = z.output<typeof NuevaAlertaSchema>;
