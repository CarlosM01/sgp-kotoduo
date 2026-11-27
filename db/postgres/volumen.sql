-- =====================================================================
-- SGP-Kotoduo — Volume data for CP-23 (EXPLAIN ANALYZE of the panel).
-- Adds 5,000 work orders and 30,000 stages (6 per order, "Uniforme" template).
-- Not part of the init seed: run on demand and remove before the demo.
--
--   run:    docker compose exec postgres psql -U sgp -d sgp_kotoduo -f /sgp/volumen.sql
--   remove: DELETE FROM sgp.orden_trabajo WHERE codigo ~ '^OT-2025-[0-9]{5}$' AND titulo LIKE 'VOL-%';
--           (stages cascade; both conditions so a user-made order titled "VOL-…" is never touched)
--
-- Deterministic: same ids, codes and states on every run (re-running replaces the set).
-- Volume rows are identifiable by the title prefix "VOL-" and codes OT-2025-NNNNN.
-- Stages have no responsible user, so the operator's "Mi Trabajo" stays as seeded.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;
SET search_path TO sgp;

DELETE FROM orden_trabajo WHERE codigo ~ '^OT-2025-[0-9]{5}$' AND titulo LIKE 'VOL-%';

-- State mix per order n: 20 % finished, 10 % registered, 70 % in production
-- with 0-4 finished stages. Due dates span 20 days in the past to 40 in the
-- future, so the panel finds overdue and at-risk orders.
CREATE TEMP TABLE tmp_vol ON COMMIT DROP AS
SELECT n,
       md5('vol-' || n)::uuid                                   AS id,
       'OT-2025-' || lpad(n::text, 5, '0')                       AS codigo,
       CASE WHEN n % 10 IN (0, 1) THEN 'TERMINADA'
            WHEN n % 10 = 2       THEN 'REGISTRADA'
            ELSE 'EN_PRODUCCION' END                             AS estado,
       CASE WHEN n % 10 IN (0, 1) THEN 6
            WHEN n % 10 = 2       THEN 0
            ELSE n % 5 END                                       AS terminadas,
       now() - make_interval(days => 30 - n % 25)                AS creado_en,
       CURRENT_DATE + (n % 60 - 20)                              AS compromiso,
       CURRENT_DATE + (n % 60 - 20) + (n % 7 - 3)                AS estimada
  FROM generate_series(1, 5000) AS n;

INSERT INTO orden_trabajo (id, codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, prioridad, estado,
                           fecha_compromiso, fecha_estimada_termino, creado_por, creado_en, terminada_en)
SELECT v.id, v.codigo, t.id, 'VOL-' || lpad(v.n::text, 5, '0'), 'Cliente volumen ' || (v.n % 200),
       10 + v.n % 90,
       (ARRAY['BAJA','NORMAL','NORMAL','ALTA','URGENTE'])[1 + v.n % 5],
       v.estado, v.compromiso, v.estimada, '00000000-0000-0000-0000-000000000003', v.creado_en,
       CASE WHEN v.estado = 'TERMINADA' THEN v.creado_en + interval '28 hours' END
  FROM tmp_vol v
  JOIN tipo_trabajo t ON t.nombre = 'Uniforme deportivo sublimado';

-- Stage state follows the number of finished stages k:
-- seq <= k TERMINADA, seq = k + 1 EN_CURSO (odd n) or DISPONIBLE (even n), rest PENDIENTE.
INSERT INTO etapa_orden (orden_id, plantilla_etapa_id, secuencia, nombre, area_id, instrucciones, estado,
                         duracion_estimada_horas, es_etapa_diseno, iniciada_en, terminada_en)
SELECT v.id, p.id, p.secuencia, p.nombre, p.area_id, p.instrucciones, s.estado,
       p.duracion_estimada_horas, p.es_etapa_diseno,
       CASE WHEN s.estado IN ('TERMINADA', 'EN_CURSO') THEN v.creado_en + make_interval(hours => 4 * p.secuencia) END,
       CASE WHEN s.estado = 'TERMINADA' THEN v.creado_en + make_interval(hours => 4 * p.secuencia + 3) END
  FROM tmp_vol v
  JOIN tipo_trabajo t     ON t.nombre = 'Uniforme deportivo sublimado'
  JOIN plantilla_etapa p  ON p.tipo_trabajo_id = t.id
  CROSS JOIN LATERAL (
        SELECT CASE WHEN p.secuencia <= v.terminadas THEN 'TERMINADA'
                    WHEN p.secuencia = v.terminadas + 1 AND v.n % 2 = 1 THEN 'EN_CURSO'
                    WHEN p.secuencia = v.terminadas + 1 THEN 'DISPONIBLE'
                    ELSE 'PENDIENTE' END AS estado) s;

COMMIT;

ANALYZE sgp.orden_trabajo;
ANALYZE sgp.etapa_orden;

SELECT (SELECT count(*) FROM sgp.orden_trabajo WHERE codigo ~ '^OT-2025-[0-9]{5}$' AND titulo LIKE 'VOL-%')                 AS ot_volumen,
       (SELECT count(*) FROM sgp.etapa_orden e JOIN sgp.orden_trabajo o ON o.id = e.orden_id
         WHERE o.codigo ~ '^OT-2025-[0-9]{5}$' AND o.titulo LIKE 'VOL-%')                                                      AS etapas_volumen;
