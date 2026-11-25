// PostgreSQL read side of flow 4: the supply catalogue with its stock and the
// alert list of the Encargada (HU-09). Writes happen inside the stage
// transaction (etapa-repositorio.ts).
import type { Pool } from 'pg';
import type { AlertaVista, InsumoRepositorio } from '../../aplicacion/puertos.js';

const FILTRO_ESTADO = `($1::text = 'todas'
                    OR ($1::text = 'abiertas' AND a.estado <> 'CERRADA')
                    OR ($1::text = 'cerradas' AND a.estado = 'CERRADA'))
                  AND ($2::int IS NULL OR a.insumo_id = $2::int)`;

export function crearInsumoRepositorioPg(pool: Pool): InsumoRepositorio {
  return {
    async listar() {
      const { rows } = await pool.query<{
        id: number;
        codigo: string;
        nombre: string;
        unidad_medida: string;
        stock_actual: string;
        stock_minimo: string;
        alertas: number;
      }>(
        `SELECT i.id, i.codigo, i.nombre, i.unidad_medida, i.stock_actual, i.stock_minimo,
                (SELECT COUNT(*)::int FROM sgp.alerta_insumo a WHERE a.insumo_id = i.id AND a.estado <> 'CERRADA') AS alertas
           FROM sgp.insumo i
          WHERE i.activo
          ORDER BY (i.stock_actual <= i.stock_minimo) DESC, i.codigo
          LIMIT 500`,
      );
      return rows.map((f) => ({
        id: f.id,
        codigo: f.codigo,
        nombre: f.nombre,
        unidad: f.unidad_medida,
        stockActual: Number(f.stock_actual),
        stockMinimo: Number(f.stock_minimo),
        alertasAbiertas: f.alertas,
      }));
    },

    async listarAlertas({ estado, insumoId, pagina, tamano }) {
      const filtro = [estado, insumoId ?? null];
      const [{ rows }, { rows: [cuenta] }] = await Promise.all([
        pool.query<{
          id: number;
          origen: AlertaVista['origen'];
          estado: AlertaVista['estado'];
          cantidad_faltante: string | null;
          comentario: string | null;
          creada_en: Date;
          cerrada_en: Date | null;
          insumo_id: number;
          insumo_codigo: string;
          insumo_nombre: string;
          unidad_medida: string;
          etapa_id: string | null;
          etapa_nombre: string | null;
          orden_id: string | null;
          orden_codigo: string | null;
          usuario_id: string | null;
          nombre_completo: string | null;
        }>(
          `SELECT a.id, a.origen, a.estado, a.cantidad_faltante, a.comentario, a.creada_en, a.cerrada_en,
                  i.id AS insumo_id, i.codigo AS insumo_codigo, i.nombre AS insumo_nombre, i.unidad_medida,
                  e.id AS etapa_id, e.nombre AS etapa_nombre, o.id AS orden_id, o.codigo AS orden_codigo,
                  u.id AS usuario_id, u.nombre_completo
             FROM sgp.alerta_insumo a
             JOIN sgp.insumo i             ON i.id = a.insumo_id
             LEFT JOIN sgp.etapa_orden e   ON e.id = a.etapa_orden_id
             LEFT JOIN sgp.orden_trabajo o ON o.id = e.orden_id
             LEFT JOIN sgp.usuario u       ON u.id = a.reportada_por
            WHERE ${FILTRO_ESTADO}
            ORDER BY a.creada_en DESC, a.id DESC
            LIMIT $3 OFFSET $4`,
          [...filtro, tamano, (pagina - 1) * tamano],
        ),
        pool.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM sgp.alerta_insumo a WHERE ${FILTRO_ESTADO}`, filtro),
      ]);
      return {
        total: cuenta?.total ?? 0,
        datos: rows.map((f) => ({
          id: f.id,
          origen: f.origen,
          estado: f.estado,
          cantidadFaltante: f.cantidad_faltante === null ? null : Number(f.cantidad_faltante),
          comentario: f.comentario,
          insumo: { id: f.insumo_id, codigo: f.insumo_codigo, nombre: f.insumo_nombre, unidad: f.unidad_medida },
          etapa: f.etapa_id ? { id: f.etapa_id, nombre: f.etapa_nombre! } : null,
          orden: f.orden_id ? { id: f.orden_id, codigo: f.orden_codigo! } : null,
          reportadaPor: f.usuario_id ? { id: f.usuario_id, nombreCompleto: f.nombre_completo! } : null,
          creadaEn: f.creada_en.toISOString(),
          cerradaEn: f.cerrada_en ? f.cerrada_en.toISOString() : null,
        })),
      };
    },
  };
}
