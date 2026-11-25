// PostgreSQL repository of stages. Concurrency (CP-19): the order row and
// then the stage row are locked FOR UPDATE, always in that order, so two
// requests on the same order are serialized without deadlocks; the second one
// sees the new version and is rejected by the use case. Supply rows are locked
// after them, in id order (D25).
import type { Pool, PoolClient } from 'pg';
import type {
  EtapaBloqueada,
  EtapaDeTrabajo,
  EtapaRepositorio,
  InsumoBloqueado,
  SiguienteEtapa,
  TransaccionEtapa,
} from '../../aplicacion/puertos.js';
import { ESTADOS_ORDEN_ACTIVOS, type EstadoEtapa, type EstadoOrden } from '../../dominio/estados.js';
import { enTransaccion } from './orden-repositorio.js';

function transaccion(c: PoolClient, etapa: EtapaBloqueada): TransaccionEtapa {
  return {
    etapa,

    async cambiarEstado(hacia: EstadoEtapa) {
      // The DDL trigger validates the transition again and increments version.
      const { rows: [r] } = await c.query<{ version: number }>(
        `UPDATE sgp.etapa_orden
            SET estado       = $2::varchar,
                iniciada_en  = CASE WHEN $2::varchar = 'EN_CURSO' THEN COALESCE(iniciada_en, now()) ELSE iniciada_en END,
                terminada_en = CASE WHEN $2::varchar = 'TERMINADA' THEN now() ELSE terminada_en END
          WHERE id = $1
        RETURNING version`,
        [etapa.id, hacia],
      );
      return r!.version;
    },

    async asignarResponsable(responsableId: string) {
      // No state change, so the trigger does not run: the version is bumped here.
      const { rows: [r] } = await c.query<{ version: number }>(
        `UPDATE sgp.etapa_orden SET responsable_id = $2, version = version + 1 WHERE id = $1 RETURNING version`,
        [etapa.id, responsableId],
      );
      return r!.version;
    },

    async habilitarSiguiente(): Promise<SiguienteEtapa | null> {
      const { rows: [s] } = await c.query<{ id: string; nombre: string; area: string; responsable_id: string | null }>(
        `WITH siguiente AS (
           SELECT id FROM sgp.etapa_orden
            WHERE orden_id = $1 AND secuencia > $2 AND estado = 'PENDIENTE'
            ORDER BY secuencia
            LIMIT 1
            FOR UPDATE)
         UPDATE sgp.etapa_orden e
            SET estado = 'DISPONIBLE'
           FROM siguiente, sgp.area a
          WHERE e.id = siguiente.id AND a.id = e.area_id
        RETURNING e.id, e.nombre, a.nombre AS area, e.responsable_id`,
        [etapa.ordenId, etapa.secuencia],
      );
      return s ? { id: s.id, nombre: s.nombre, area: s.area, responsableId: s.responsable_id } : null;
    },

    async resumenEtapas() {
      const { rows: [r] } = await c.query<{ abiertas: string; bloqueadas: string }>(
        `SELECT COUNT(*) FILTER (WHERE estado NOT IN ('TERMINADA','OMITIDA')) AS abiertas,
                COUNT(*) FILTER (WHERE estado = 'BLOQUEADA') AS bloqueadas
           FROM sgp.etapa_orden WHERE orden_id = $1`,
        [etapa.ordenId],
      );
      return { etapasAbiertas: Number(r?.abiertas ?? 0), etapasBloqueadas: Number(r?.bloqueadas ?? 0) };
    },

    async cambiarEstadoOrden(hacia: EstadoOrden) {
      await c.query(
        `UPDATE sgp.orden_trabajo
            SET estado = $2::varchar,
                terminada_en = CASE WHEN $2::varchar IN ('TERMINADA','ENTREGADA') THEN COALESCE(terminada_en, now()) ELSE NULL END
          WHERE id = $1`,
        [etapa.ordenId, hacia],
      );
    },

    async bloquearInsumoRequerido(insumoId: number): Promise<InsumoBloqueado | null> {
      const { rows: [i] } = await c.query<{
        id: number;
        codigo: string;
        nombre: string;
        unidad_medida: string;
        stock_actual: string;
        stock_minimo: string;
      }>(
        `SELECT i.id, i.codigo, i.nombre, i.unidad_medida, i.stock_actual, i.stock_minimo
           FROM sgp.insumo i
          WHERE i.id = $2 AND i.activo
            AND EXISTS (SELECT 1 FROM sgp.requerimiento_insumo r WHERE r.etapa_orden_id = $1 AND r.insumo_id = i.id)
            FOR UPDATE OF i`,
        [etapa.id, insumoId],
      );
      if (!i) return null;
      // Read after the lock, in a new statement: it sees the alert committed by
      // a transaction this one waited for.
      return {
        id: i.id,
        codigo: i.codigo,
        nombre: i.nombre,
        unidad: i.unidad_medida,
        stockActual: Number(i.stock_actual),
        stockMinimo: Number(i.stock_minimo),
        alertaAutomaticaId: await alertaAutomaticaAbierta(c, insumoId),
      };
    },

    async registrarConsumo(insumoId: number, cantidad: number, usuarioId: string) {
      await c.query(
        `INSERT INTO sgp.movimiento_insumo (insumo_id, tipo, cantidad, etapa_orden_id, usuario_id, comentario)
         VALUES ($1, 'CONSUMO', -($2::numeric), $3, $4, 'Consumo al terminar etapa')`,
        [insumoId, cantidad, etapa.id, usuarioId],
      );
      await c.query(
        `UPDATE sgp.requerimiento_insumo SET cantidad_consumida = cantidad_consumida + $3::numeric
          WHERE etapa_orden_id = $1 AND insumo_id = $2`,
        [etapa.id, insumoId, cantidad],
      );
      const { rows: [r] } = await c.query<{ stock_actual: string }>(`SELECT stock_actual FROM sgp.insumo WHERE id = $1`, [insumoId]);
      return { stockActual: Number(r!.stock_actual), alertaAutomaticaId: await alertaAutomaticaAbierta(c, insumoId) };
    },

    async crearAlertaManual(alerta) {
      const { rows: [a] } = await c.query<{ id: number; codigo: string; creada_en: Date }>(
        `WITH i AS (SELECT id, codigo FROM sgp.insumo WHERE id = $1 AND activo),
              nueva AS (
                INSERT INTO sgp.alerta_insumo (insumo_id, etapa_orden_id, origen, cantidad_faltante, comentario, reportada_por)
                SELECT i.id, $2, 'MANUAL', $3::numeric, $4, $5 FROM i
                RETURNING id, creada_en)
         SELECT nueva.id, i.codigo, nueva.creada_en FROM nueva, i`,
        [alerta.insumoId, etapa.id, alerta.cantidadFaltante ?? null, alerta.comentario ?? null, alerta.reportadaPor],
      );
      return a ? { id: a.id, codigo: a.codigo, creadaEn: a.creada_en.toISOString() } : null;
    },
  };
}

async function alertaAutomaticaAbierta(c: PoolClient, insumoId: number): Promise<number | null> {
  const { rows: [a] } = await c.query<{ id: number }>(
    `SELECT id FROM sgp.alerta_insumo WHERE insumo_id = $1 AND origen = 'AUTOMATICA' AND estado <> 'CERRADA'`,
    [insumoId],
  );
  return a?.id ?? null;
}

export function crearEtapaRepositorioPg(pool: Pool): EtapaRepositorio {
  return {
    enTransaccion(etapaId, trabajo) {
      return enTransaccion(pool, async (c) => {
        const { rows: [o] } = await c.query<{ orden_id: string; estado: EstadoOrden }>(
          `SELECT o.id AS orden_id, o.estado
             FROM sgp.orden_trabajo o
            WHERE o.id = (SELECT orden_id FROM sgp.etapa_orden WHERE id = $1)
              FOR UPDATE`,
          [etapaId],
        );
        if (!o) return trabajo(null);
        const { rows: [e] } = await c.query<{
          id: string;
          secuencia: number;
          nombre: string;
          estado: EstadoEtapa;
          version: number;
          responsable_id: string | null;
        }>(
          `SELECT id, secuencia, nombre, estado, version, responsable_id
             FROM sgp.etapa_orden WHERE id = $1 FOR UPDATE`,
          [etapaId],
        );
        if (!e) return trabajo(null);
        return trabajo(
          transaccion(c, {
            id: e.id,
            ordenId: o.orden_id,
            secuencia: e.secuencia,
            nombre: e.nombre,
            estado: e.estado,
            version: e.version,
            responsableId: e.responsable_id,
            estadoOrden: o.estado,
          }),
        );
      });
    },

    async deResponsable(usuarioId) {
      const { rows } = await pool.query<{
        id: string;
        secuencia: number;
        nombre: string;
        area: string;
        instrucciones: string;
        estado: EstadoEtapa;
        version: number;
        duracion: string;
        iniciada_en: Date | null;
        orden_id: string;
        codigo: string;
        titulo: string;
        prioridad: EtapaDeTrabajo['orden']['prioridad'];
        estado_orden: EstadoOrden;
        fecha_compromiso: string;
        requerimientos: Array<{ insumoId: number; codigo: string; nombre: string; unidad: string; requerida: string; consumida: string }>;
      }>(
        // Supplies use the same projection as the order detail (OrdenRepositorio.obtener), D26.
        `SELECT e.id, e.secuencia, e.nombre, a.nombre AS area, e.instrucciones, e.estado, e.version,
                e.duracion_estimada_horas AS duracion, e.iniciada_en,
                o.id AS orden_id, o.codigo, o.titulo, o.prioridad, o.estado AS estado_orden,
                to_char(o.fecha_compromiso, 'YYYY-MM-DD') AS fecha_compromiso,
                COALESCE(json_agg(json_build_object(
                    'insumoId', i.id, 'codigo', i.codigo, 'nombre', i.nombre, 'unidad', i.unidad_medida,
                    'requerida', r.cantidad_requerida::text, 'consumida', r.cantidad_consumida::text)
                  ORDER BY i.id) FILTER (WHERE r.id IS NOT NULL), '[]') AS requerimientos
           FROM sgp.etapa_orden e
           JOIN sgp.orden_trabajo o ON o.id = e.orden_id
           JOIN sgp.area a          ON a.id = e.area_id
           LEFT JOIN sgp.requerimiento_insumo r ON r.etapa_orden_id = e.id
           LEFT JOIN sgp.insumo i               ON i.id = r.insumo_id
          WHERE e.responsable_id = $1
            AND e.estado IN ('PENDIENTE','DISPONIBLE','EN_CURSO','BLOQUEADA')
            AND o.estado = ANY($2::text[])
          GROUP BY e.id, a.nombre, o.id
          ORDER BY CASE e.estado WHEN 'EN_CURSO' THEN 0 WHEN 'DISPONIBLE' THEN 1 WHEN 'BLOQUEADA' THEN 2 ELSE 3 END,
                   CASE o.prioridad WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
                   o.fecha_compromiso, o.codigo, e.secuencia
          LIMIT 200`,
        [usuarioId, ESTADOS_ORDEN_ACTIVOS],
      );
      return rows.map((f) => ({
        id: f.id,
        secuencia: f.secuencia,
        nombre: f.nombre,
        area: f.area,
        instrucciones: f.instrucciones,
        estado: f.estado,
        version: f.version,
        duracionEstimadaHoras: Number(f.duracion),
        iniciadaEn: f.iniciada_en ? f.iniciada_en.toISOString() : null,
        orden: {
          id: f.orden_id,
          codigo: f.codigo,
          titulo: f.titulo,
          prioridad: f.prioridad,
          estado: f.estado_orden,
          fechaCompromiso: f.fecha_compromiso,
        },
        requerimientos: f.requerimientos.map((r) => ({
          insumoId: r.insumoId,
          codigo: r.codigo,
          nombre: r.nombre,
          unidad: r.unidad,
          cantidadRequerida: Number(r.requerida),
          cantidadConsumida: Number(r.consumida),
        })),
      }));
    },
  };
}
