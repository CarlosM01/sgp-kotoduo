// PostgreSQL repository of work orders, templates and the panel. Every query
// is parameterized (AM-01, CP-24). DATE columns are read with to_char so the
// calendar date never shifts with the time zone of the Node process.
import type { Pool, PoolClient } from 'pg';
import type {
  EtapaVista,
  FilaPanel,
  OrdenDetalle,
  OrdenRepositorio,
  OrdenResumen,
  TipoTrabajoVista,
} from '../../aplicacion/puertos.js';
import { ESTADOS_ORDEN_ACTIVOS, type EstadoOrden } from '../../dominio/estados.js';
import type { PlantillaEtapa } from '../../dominio/plantilla.js';

export async function enTransaccion<T>(pool: Pool, trabajo: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await trabajo(c);
    await c.query('COMMIT');
    return r;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

/** Text search with LIKE: the user's %, _ and \ are literal characters. */
export function patronLike(q: string | undefined): string | null {
  return q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

interface FilaPlantilla {
  tipo_id: number;
  tipo_nombre: string;
  tipo_descripcion: string | null;
  id: number;
  secuencia: number;
  nombre: string;
  area_id: number;
  area: string;
  instrucciones: string;
  duracion: string;
  es_etapa_diseno: boolean;
  insumos: Array<{ insumoId: number; cantidadPorUnidad: string }>;
}

const SELECT_PLANTILLA = `
  SELECT t.id AS tipo_id, t.nombre AS tipo_nombre, t.descripcion AS tipo_descripcion,
         p.id, p.secuencia, p.nombre, p.area_id, a.nombre AS area, p.instrucciones,
         p.duracion_estimada_horas AS duracion, p.es_etapa_diseno,
         COALESCE(json_agg(json_build_object('insumoId', pi.insumo_id, 'cantidadPorUnidad', pi.cantidad_por_unidad::text)
                           ORDER BY pi.insumo_id) FILTER (WHERE pi.insumo_id IS NOT NULL), '[]') AS insumos
    FROM sgp.tipo_trabajo t
    JOIN sgp.plantilla_etapa p     ON p.tipo_trabajo_id = t.id
    JOIN sgp.area a                ON a.id = p.area_id
    LEFT JOIN sgp.plantilla_insumo pi ON pi.plantilla_etapa_id = p.id
   WHERE t.activo`;

function aEtapaPlantilla(f: FilaPlantilla): PlantillaEtapa {
  return {
    id: f.id,
    secuencia: f.secuencia,
    nombre: f.nombre,
    areaId: f.area_id,
    instrucciones: f.instrucciones,
    duracionEstimadaHoras: Number(f.duracion),
    esEtapaDiseno: f.es_etapa_diseno,
    insumos: f.insumos.map((i) => ({ insumoId: i.insumoId, cantidadPorUnidad: Number(i.cantidadPorUnidad) })),
  };
}

const COLUMNAS_RESUMEN = `
  o.id, o.codigo, o.titulo, tt.nombre AS tipo_trabajo, o.referencia_cliente, o.cantidad, o.prioridad, o.estado,
  to_char(o.fecha_compromiso, 'YYYY-MM-DD') AS fecha_compromiso,
  to_char(o.fecha_estimada_termino, 'YYYY-MM-DD') AS fecha_estimada_termino, o.creado_en`;

interface FilaResumen {
  id: string;
  codigo: string;
  titulo: string;
  tipo_trabajo: string;
  referencia_cliente: string;
  cantidad: number;
  prioridad: OrdenResumen['prioridad'];
  estado: EstadoOrden;
  fecha_compromiso: string;
  fecha_estimada_termino: string | null;
  creado_en: Date;
}

function aResumen(f: FilaResumen): OrdenResumen {
  return {
    id: f.id,
    codigo: f.codigo,
    titulo: f.titulo,
    tipoTrabajo: f.tipo_trabajo,
    referenciaCliente: f.referencia_cliente,
    cantidad: f.cantidad,
    prioridad: f.prioridad,
    estado: f.estado,
    fechaCompromiso: f.fecha_compromiso,
    fechaEstimadaTermino: f.fecha_estimada_termino,
    creadoEn: f.creado_en.toISOString(),
  };
}

export function crearOrdenRepositorioPg(pool: Pool): OrdenRepositorio {
  return {
    async listarPlantillas() {
      const { rows } = await pool.query<FilaPlantilla>(
        `${SELECT_PLANTILLA} GROUP BY t.id, p.id, a.nombre ORDER BY t.id, p.secuencia`,
      );
      const tipos = new Map<number, TipoTrabajoVista>();
      for (const f of rows) {
        let t = tipos.get(f.tipo_id);
        if (!t) {
          t = { id: f.tipo_id, nombre: f.tipo_nombre, descripcion: f.tipo_descripcion, horasTotales: 0, etapas: [] };
          tipos.set(f.tipo_id, t);
        }
        const etapa = { ...aEtapaPlantilla(f), area: f.area };
        t.etapas.push(etapa);
        t.horasTotales += etapa.duracionEstimadaHoras;
      }
      return [...tipos.values()];
    },

    async plantillaDe(tipoTrabajoId) {
      const { rows } = await pool.query<FilaPlantilla>(
        `${SELECT_PLANTILLA} AND t.id = $1 GROUP BY t.id, p.id, a.nombre ORDER BY p.secuencia`,
        [tipoTrabajoId],
      );
      return rows.length ? rows.map(aEtapaPlantilla) : null;
    },

    crear({ datos, etapas, fechaEstimadaTermino, creadoPor, anio }) {
      return enTransaccion(pool, async (c) => {
        // One code sequence per year: the advisory lock serializes concurrent
        // registrations until COMMIT, so two orders never get the same number.
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sgp.orden_trabajo.codigo.${anio}`]);
        const { rows: [ultimo] } = await c.query<{ n: number }>(
          `SELECT COALESCE(MAX(split_part(codigo, '-', 3)::int), 0) AS n
             FROM sgp.orden_trabajo WHERE codigo LIKE $1`,
          [`OT-${anio}-%`],
        );
        const codigo = `OT-${anio}-${String((ultimo?.n ?? 0) + 1).padStart(4, '0')}`;

        const { rows: [orden] } = await c.query<{ id: string }>(
          `INSERT INTO sgp.orden_trabajo
             (codigo, tipo_trabajo_id, titulo, referencia_cliente, descripcion, cantidad, especificaciones,
              prioridad, fecha_compromiso, fecha_estimada_termino, creado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [
            codigo,
            datos.tipoTrabajoId,
            datos.titulo,
            datos.referenciaCliente,
            datos.descripcion ?? null,
            datos.cantidad,
            JSON.stringify(datos.especificaciones),
            datos.prioridad,
            datos.fechaCompromiso,
            fechaEstimadaTermino,
            creadoPor,
          ],
        );
        const ordenId = orden!.id;

        for (const e of etapas) {
          const { rows: [etapa] } = await c.query<{ id: string }>(
            `INSERT INTO sgp.etapa_orden
               (orden_id, plantilla_etapa_id, secuencia, nombre, area_id, instrucciones, estado,
                duracion_estimada_horas, es_etapa_diseno)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [ordenId, e.plantillaEtapaId, e.secuencia, e.nombre, e.areaId, e.instrucciones, e.estado, e.duracionEstimadaHoras, e.esEtapaDiseno],
          );
          for (const r of e.requerimientos) {
            await c.query(
              `INSERT INTO sgp.requerimiento_insumo (etapa_orden_id, insumo_id, cantidad_requerida) VALUES ($1, $2, $3)`,
              [etapa!.id, r.insumoId, r.cantidadRequerida],
            );
          }
        }
        return { id: ordenId, codigo };
      });
    },

    async listar({ estado, q, pagina, tamano }) {
      const { rows } = await pool.query<FilaResumen & { total: string }>(
        `SELECT ${COLUMNAS_RESUMEN}, COUNT(*) OVER () AS total
           FROM sgp.orden_trabajo o
           JOIN sgp.tipo_trabajo tt ON tt.id = o.tipo_trabajo_id
          WHERE ($1::text IS NULL OR o.estado = $1)
            AND ($2::text IS NULL OR o.codigo ILIKE $2 OR o.titulo ILIKE $2)
          ORDER BY o.creado_en DESC, o.codigo DESC
          LIMIT $3 OFFSET $4`,
        [estado ?? null, patronLike(q), tamano, (pagina - 1) * tamano],
      );
      return { datos: rows.map(aResumen), total: Number(rows[0]?.total ?? 0) };
    },

    async obtener(id) {
      const { rows: [o] } = await pool.query<
        FilaResumen & {
          tipo_trabajo_id: number;
          descripcion: string | null;
          especificaciones: Record<string, unknown>;
          creado_por: string;
          creado_por_nombre: string;
          terminada_en: Date | null;
        }
      >(
        `SELECT ${COLUMNAS_RESUMEN}, o.tipo_trabajo_id, o.descripcion, o.especificaciones, o.creado_por,
                u.nombre_completo AS creado_por_nombre, o.terminada_en
           FROM sgp.orden_trabajo o
           JOIN sgp.tipo_trabajo tt ON tt.id = o.tipo_trabajo_id
           JOIN sgp.usuario u       ON u.id = o.creado_por
          WHERE o.id = $1`,
        [id],
      );
      if (!o) return null;

      const { rows: etapas } = await pool.query<{
        id: string;
        secuencia: number;
        nombre: string;
        area: string;
        instrucciones: string;
        estado: EtapaVista['estado'];
        responsable_id: string | null;
        responsable_nombre: string | null;
        duracion: string;
        es_etapa_diseno: boolean;
        version: number;
        iniciada_en: Date | null;
        terminada_en: Date | null;
        requerimientos: Array<{ insumoId: number; codigo: string; nombre: string; unidad: string; requerida: string; consumida: string }>;
      }>(
        `SELECT e.id, e.secuencia, e.nombre, a.nombre AS area, e.instrucciones, e.estado,
                e.responsable_id, u.nombre_completo AS responsable_nombre,
                e.duracion_estimada_horas AS duracion, e.es_etapa_diseno, e.version, e.iniciada_en, e.terminada_en,
                COALESCE(json_agg(json_build_object(
                    'insumoId', i.id, 'codigo', i.codigo, 'nombre', i.nombre, 'unidad', i.unidad_medida,
                    'requerida', r.cantidad_requerida::text, 'consumida', r.cantidad_consumida::text)
                  ORDER BY i.id) FILTER (WHERE r.id IS NOT NULL), '[]') AS requerimientos
           FROM sgp.etapa_orden e
           JOIN sgp.area a ON a.id = e.area_id
           LEFT JOIN sgp.usuario u ON u.id = e.responsable_id
           LEFT JOIN sgp.requerimiento_insumo r ON r.etapa_orden_id = e.id
           LEFT JOIN sgp.insumo i ON i.id = r.insumo_id
          WHERE e.orden_id = $1
          GROUP BY e.id, a.nombre, u.nombre_completo
          ORDER BY e.secuencia`,
        [id],
      );

      const detalle: OrdenDetalle = {
        ...aResumen(o),
        tipoTrabajoId: o.tipo_trabajo_id,
        descripcion: o.descripcion,
        especificaciones: o.especificaciones,
        creadoPor: { id: o.creado_por, nombreCompleto: o.creado_por_nombre },
        terminadaEn: iso(o.terminada_en),
        etapas: etapas.map((e) => ({
          id: e.id,
          secuencia: e.secuencia,
          nombre: e.nombre,
          area: e.area,
          instrucciones: e.instrucciones,
          estado: e.estado,
          responsable: e.responsable_id ? { id: e.responsable_id, nombreCompleto: e.responsable_nombre ?? '' } : null,
          duracionEstimadaHoras: Number(e.duracion),
          esEtapaDiseno: e.es_etapa_diseno,
          version: e.version,
          iniciadaEn: iso(e.iniciada_en),
          terminadaEn: iso(e.terminada_en),
          requerimientos: e.requerimientos.map((r) => ({
            insumoId: r.insumoId,
            codigo: r.codigo,
            nombre: r.nombre,
            unidad: r.unidad,
            cantidadRequerida: Number(r.requerida),
            cantidadConsumida: Number(r.consumida),
          })),
        })),
      };
      return detalle;
    },

    async panel({ filtro, q, pagina, tamano }) {
      const { rows } = await pool.query<{
        id: string;
        codigo: string;
        titulo: string;
        tipo_trabajo: string;
        estado: EstadoOrden;
        prioridad: FilaPanel['prioridad'];
        fecha_compromiso: string;
        fecha_estimada_termino: string | null;
        etapa_actual: string | null;
        area_actual: string | null;
        responsable_actual: string | null;
        porcentaje_avance: string | null;
        en_riesgo: boolean;
        atrasada: boolean;
        total: string;
      }>(
        `SELECT v.id, v.codigo, v.titulo, v.tipo_trabajo, v.estado, v.prioridad,
                to_char(v.fecha_compromiso, 'YYYY-MM-DD') AS fecha_compromiso,
                to_char(v.fecha_estimada_termino, 'YYYY-MM-DD') AS fecha_estimada_termino,
                v.etapa_actual, v.area_actual, v.responsable_actual, v.porcentaje_avance, v.en_riesgo, v.atrasada,
                COUNT(*) OVER () AS total
           FROM sgp.v_panel_ordenes v
          WHERE CASE $1::text
                  WHEN 'activas'   THEN v.estado = ANY($2::text[])
                  WHEN 'atrasadas' THEN v.atrasada
                  WHEN 'en_riesgo' THEN v.en_riesgo
                  ELSE TRUE
                END
            AND ($3::text IS NULL OR v.codigo ILIKE $3 OR v.titulo ILIKE $3)
          ORDER BY v.atrasada DESC, v.en_riesgo DESC, v.fecha_compromiso, v.codigo
          LIMIT $4 OFFSET $5`,
        [filtro, ESTADOS_ORDEN_ACTIVOS, patronLike(q), tamano, (pagina - 1) * tamano],
      );
      return {
        total: Number(rows[0]?.total ?? 0),
        datos: rows.map((f) => ({
          id: f.id,
          codigo: f.codigo,
          titulo: f.titulo,
          tipoTrabajo: f.tipo_trabajo,
          estado: f.estado,
          prioridad: f.prioridad,
          fechaCompromiso: f.fecha_compromiso,
          fechaEstimadaTermino: f.fecha_estimada_termino,
          etapaActual: f.etapa_actual,
          areaActual: f.area_actual,
          responsableActual: f.responsable_actual,
          porcentajeAvance: Number(f.porcentaje_avance ?? 0),
          enRiesgo: f.en_riesgo,
          atrasada: f.atrasada,
        })),
      };
    },

    async resumenPanel() {
      // Same predicates as v_panel_ordenes, computed on orden_trabajo alone
      // (no join with the stages), so the counters stay cheap with volume.
      const { rows: [r] } = await pool.query<{ activas: string; atrasadas: string; en_riesgo: string; alertas: string }>(
        `SELECT COUNT(*) AS activas,
                COUNT(*) FILTER (WHERE fecha_compromiso < CURRENT_DATE) AS atrasadas,
                COUNT(*) FILTER (WHERE COALESCE(fecha_estimada_termino, fecha_compromiso) > fecha_compromiso) AS en_riesgo,
                -- ix_alerta_estado (estado, creada_en) serves this count.
                (SELECT COUNT(*) FROM sgp.alerta_insumo WHERE estado <> 'CERRADA') AS alertas
           FROM sgp.orden_trabajo
          WHERE estado = ANY($1::text[])`,
        [ESTADOS_ORDEN_ACTIVOS],
      );
      return {
        activas: Number(r?.activas ?? 0),
        atrasadas: Number(r?.atrasadas ?? 0),
        enRiesgo: Number(r?.en_riesgo ?? 0),
        alertasAbiertas: Number(r?.alertas ?? 0),
      };
    },
  };
}
