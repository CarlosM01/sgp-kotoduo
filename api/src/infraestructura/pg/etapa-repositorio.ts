// PostgreSQL repository of stages. Concurrency (CP-19): the order row and
// then the stage row are locked FOR UPDATE, always in that order, so two
// requests on the same order are serialized without deadlocks; the second one
// sees the new version and is rejected by the use case.
import type { Pool, PoolClient } from 'pg';
import type { EtapaBloqueada, EtapaDeTrabajo, EtapaRepositorio, SiguienteEtapa, TransaccionEtapa } from '../../aplicacion/puertos.js';
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
  };
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
      }>(
        `SELECT e.id, e.secuencia, e.nombre, a.nombre AS area, e.instrucciones, e.estado, e.version,
                e.duracion_estimada_horas AS duracion, e.iniciada_en,
                o.id AS orden_id, o.codigo, o.titulo, o.prioridad, o.estado AS estado_orden,
                to_char(o.fecha_compromiso, 'YYYY-MM-DD') AS fecha_compromiso
           FROM sgp.etapa_orden e
           JOIN sgp.orden_trabajo o ON o.id = e.orden_id
           JOIN sgp.area a          ON a.id = e.area_id
          WHERE e.responsable_id = $1
            AND e.estado IN ('PENDIENTE','DISPONIBLE','EN_CURSO','BLOQUEADA')
            AND o.estado = ANY($2::text[])
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
      }));
    },
  };
}
