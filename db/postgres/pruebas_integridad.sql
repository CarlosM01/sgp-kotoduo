-- =====================================================================
-- SGP-Kotoduo — Manual integrity check (F1, criterion 3.1.2).
-- Each statement below is INVALID on purpose: the database must reject it.
-- After the attempts, the verification queries prove nothing was stored.
--
--   docker compose exec -T postgres sh -c 'psql -U sgp -d sgp_kotoduo -X -f /sgp/pruebas_integridad.sql 2>&1'
--
-- (2>&1 inside the container keeps each error right after its "---" label.)
-- Run it on the seeded database (DEMO-01 present). It leaves no data behind.
-- Test rows use the title prefix "INTEGRIDAD-" so they are easy to look for.
-- =====================================================================

\set ON_ERROR_STOP off
SET search_path TO sgp;

\echo '--- Baseline before the attempts'
SELECT (SELECT count(*) FROM orden_trabajo) AS ot_total,
       (SELECT stock_actual FROM insumo WHERE codigo = 'TEL-DRY-BL') AS stock_tela,
       (SELECT e.estado FROM etapa_orden e JOIN orden_trabajo o ON o.id = e.orden_id
         WHERE o.codigo = 'OT-2026-0001' AND e.secuencia = 4) AS etapa4_demo01;

\echo '--- I-01 NOT NULL: order without title (expected: not-null violation)'
INSERT INTO orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, fecha_compromiso, creado_por)
VALUES ('OT-2026-9001', 1, NULL, 'INTEGRIDAD', 1, CURRENT_DATE, '00000000-0000-0000-0000-000000000003');

\echo '--- I-02 FOREIGN KEY: work type 999 does not exist (expected: foreign-key violation)'
INSERT INTO orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, fecha_compromiso, creado_por)
VALUES ('OT-2026-9002', 999, 'INTEGRIDAD-02', 'INTEGRIDAD', 1, CURRENT_DATE, '00000000-0000-0000-0000-000000000003');

\echo '--- I-03 CHECK state: order state outside the allowed list (expected: check violation)'
INSERT INTO orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, estado, fecha_compromiso, creado_por)
VALUES ('OT-2026-9003', 1, 'INTEGRIDAD-03', 'INTEGRIDAD', 1, 'PAUSADA', CURRENT_DATE, '00000000-0000-0000-0000-000000000003');

\echo '--- I-04 CHECK code format: "DEMO-01" is not OT-AAAA-NNNN (expected: check violation ck_ot_codigo)'
INSERT INTO orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, fecha_compromiso, creado_por)
VALUES ('DEMO-01', 1, 'INTEGRIDAD-04', 'INTEGRIDAD', 1, CURRENT_DATE, '00000000-0000-0000-0000-000000000003');

\echo '--- I-05 UNIQUE: duplicated order code OT-2026-0001 (expected: unique violation)'
INSERT INTO orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, fecha_compromiso, creado_por)
VALUES ('OT-2026-0001', 1, 'INTEGRIDAD-05', 'INTEGRIDAD', 1, CURRENT_DATE, '00000000-0000-0000-0000-000000000003');

\echo '--- I-06 CHECK quantity: zero units (expected: check violation)'
INSERT INTO orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, fecha_compromiso, creado_por)
VALUES ('OT-2026-9006', 1, 'INTEGRIDAD-06', 'INTEGRIDAD', 0, CURRENT_DATE, '00000000-0000-0000-0000-000000000003');

\echo '--- I-07 CHECK stock: consumption larger than the stock (expected: check violation on stock_actual)'
INSERT INTO movimiento_insumo (insumo_id, tipo, cantidad, etapa_orden_id, usuario_id, comentario)
SELECT i.id, 'CONSUMO', -9999, e.id, '00000000-0000-0000-0000-000000000002', 'INTEGRIDAD-07'
  FROM insumo i, etapa_orden e JOIN orden_trabajo o ON o.id = e.orden_id
 WHERE i.codigo = 'TEL-DRY-BL' AND o.codigo = 'OT-2026-0001' AND e.secuencia = 4;

\echo '--- I-08 State machine trigger: stage PENDIENTE -> TERMINADA skips steps (expected: transition rejected)'
UPDATE etapa_orden e SET estado = 'TERMINADA', iniciada_en = now(), terminada_en = now()
  FROM orden_trabajo o
 WHERE o.id = e.orden_id AND o.codigo = 'OT-2026-0001' AND e.secuencia = 4;

\echo '--- Verification after the attempts: nothing was stored or changed'
SELECT (SELECT count(*) FROM orden_trabajo)                                        AS ot_total,
       (SELECT count(*) FROM orden_trabajo WHERE titulo LIKE 'INTEGRIDAD-%'
                                             OR codigo LIKE 'OT-2026-90%')          AS ot_invalidas_guardadas,
       (SELECT count(*) FROM movimiento_insumo WHERE comentario = 'INTEGRIDAD-07')  AS movimientos_invalidos,
       (SELECT stock_actual FROM insumo WHERE codigo = 'TEL-DRY-BL')                AS stock_tela,
       (SELECT e.estado FROM etapa_orden e JOIN orden_trabajo o ON o.id = e.orden_id
         WHERE o.codigo = 'OT-2026-0001' AND e.secuencia = 4)                       AS etapa4_demo01;
