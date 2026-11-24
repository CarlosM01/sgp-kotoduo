-- =====================================================================
-- SGP-Kotoduo — Manual integrity check (F1, criterion 3.1.2).
-- Each attempt below is INVALID on purpose: the database must reject it.
--
--   docker compose exec -T postgres sh -c 'psql -U sgp -d sgp_kotoduo -X -f /sgp/pruebas_integridad.sql 2>&1'
--
-- (2>&1 inside the container keeps each error right after its "---" label.)
--
-- How it asserts:
--   * every attempt runs inside BEGIN ... ROLLBACK, so even a write that a
--     broken constraint lets through is never kept;
--   * the SQLSTATE of the attempt must match the expected class
--     (23502 not null, 23503 foreign key, 23505 unique, 23514 check);
--     any other result, including success (00000), is a FALLA;
--   * the final state must equal the baseline (order count, stock, stage);
--   * if anything failed, the script ends with an error (psql exit code 3).
-- Run it on the seeded database (DEMO-01 present). It leaves no data behind.
-- =====================================================================

\set ON_ERROR_STOP off
\set fallas false
SET search_path TO sgp;

\echo '--- Baseline before the attempts'
SELECT (SELECT count(*) FROM orden_trabajo)                         AS ot_antes,
       (SELECT stock_actual FROM insumo WHERE codigo = 'TEL-DRY-BL') AS stock_antes,
       (SELECT e.estado FROM etapa_orden e JOIN orden_trabajo o ON o.id = e.orden_id
         WHERE o.codigo = 'OT-2026-0001' AND e.secuencia = 4)        AS etapa_antes \gset
\echo 'ot_total =' :ot_antes '· stock_tela =' :stock_antes '· etapa4_demo01 =' :etapa_antes

-- ---------------------------------------------------------------------
\echo
\echo '--- I-01 NOT NULL: order without title (expected SQLSTATE 23502)'
BEGIN;
INSERT INTO orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, fecha_compromiso, creado_por)
VALUES ('OT-2026-9001', 1, NULL, 'INTEGRIDAD', 1, CURRENT_DATE, '00000000-0000-0000-0000-000000000003');
\set st :SQLSTATE
ROLLBACK;
SELECT :'st' = '23502' AS ok \gset
\if :ok
\echo 'OK I-01 rechazado, SQLSTATE' :st
\else
\echo 'FALLA I-01: SQLSTATE obtenido' :st '- esperado 23502'
\set fallas true
\endif

-- ---------------------------------------------------------------------
\echo
\echo '--- I-02 FOREIGN KEY: work type 999 does not exist (expected SQLSTATE 23503)'
BEGIN;
INSERT INTO orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, fecha_compromiso, creado_por)
VALUES ('OT-2026-9002', 999, 'INTEGRIDAD-02', 'INTEGRIDAD', 1, CURRENT_DATE, '00000000-0000-0000-0000-000000000003');
\set st :SQLSTATE
ROLLBACK;
SELECT :'st' = '23503' AS ok \gset
\if :ok
\echo 'OK I-02 rechazado, SQLSTATE' :st
\else
\echo 'FALLA I-02: SQLSTATE obtenido' :st '- esperado 23503'
\set fallas true
\endif

-- ---------------------------------------------------------------------
\echo
\echo '--- I-03 CHECK state: order state outside the allowed list (expected SQLSTATE 23514)'
BEGIN;
INSERT INTO orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, estado, fecha_compromiso, creado_por)
VALUES ('OT-2026-9003', 1, 'INTEGRIDAD-03', 'INTEGRIDAD', 1, 'PAUSADA', CURRENT_DATE, '00000000-0000-0000-0000-000000000003');
\set st :SQLSTATE
ROLLBACK;
SELECT :'st' = '23514' AS ok \gset
\if :ok
\echo 'OK I-03 rechazado, SQLSTATE' :st
\else
\echo 'FALLA I-03: SQLSTATE obtenido' :st '- esperado 23514'
\set fallas true
\endif

-- ---------------------------------------------------------------------
\echo
\echo '--- I-04 CHECK code format: "DEMO-01" is not OT-AAAA-NNNN (expected SQLSTATE 23514, ck_ot_codigo)'
BEGIN;
INSERT INTO orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, fecha_compromiso, creado_por)
VALUES ('DEMO-01', 1, 'INTEGRIDAD-04', 'INTEGRIDAD', 1, CURRENT_DATE, '00000000-0000-0000-0000-000000000003');
\set st :SQLSTATE
ROLLBACK;
SELECT :'st' = '23514' AS ok \gset
\if :ok
\echo 'OK I-04 rechazado, SQLSTATE' :st
\else
\echo 'FALLA I-04: SQLSTATE obtenido' :st '- esperado 23514'
\set fallas true
\endif

-- ---------------------------------------------------------------------
\echo
\echo '--- I-05 UNIQUE: duplicated order code OT-2026-0001 (expected SQLSTATE 23505)'
BEGIN;
INSERT INTO orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, fecha_compromiso, creado_por)
VALUES ('OT-2026-0001', 1, 'INTEGRIDAD-05', 'INTEGRIDAD', 1, CURRENT_DATE, '00000000-0000-0000-0000-000000000003');
\set st :SQLSTATE
ROLLBACK;
SELECT :'st' = '23505' AS ok \gset
\if :ok
\echo 'OK I-05 rechazado, SQLSTATE' :st
\else
\echo 'FALLA I-05: SQLSTATE obtenido' :st '- esperado 23505'
\set fallas true
\endif

-- ---------------------------------------------------------------------
\echo
\echo '--- I-06 CHECK quantity: zero units (expected SQLSTATE 23514)'
BEGIN;
INSERT INTO orden_trabajo (codigo, tipo_trabajo_id, titulo, referencia_cliente, cantidad, fecha_compromiso, creado_por)
VALUES ('OT-2026-9006', 1, 'INTEGRIDAD-06', 'INTEGRIDAD', 0, CURRENT_DATE, '00000000-0000-0000-0000-000000000003');
\set st :SQLSTATE
ROLLBACK;
SELECT :'st' = '23514' AS ok \gset
\if :ok
\echo 'OK I-06 rechazado, SQLSTATE' :st
\else
\echo 'FALLA I-06: SQLSTATE obtenido' :st '- esperado 23514'
\set fallas true
\endif

-- ---------------------------------------------------------------------
\echo
\echo '--- I-07 CHECK stock: consumption larger than the stock (expected SQLSTATE 23514 on stock_actual)'
BEGIN;
INSERT INTO movimiento_insumo (insumo_id, tipo, cantidad, etapa_orden_id, usuario_id, comentario)
SELECT i.id, 'CONSUMO', -9999, e.id, '00000000-0000-0000-0000-000000000002', 'INTEGRIDAD-07'
  FROM insumo i, etapa_orden e JOIN orden_trabajo o ON o.id = e.orden_id
 WHERE i.codigo = 'TEL-DRY-BL' AND o.codigo = 'OT-2026-0001' AND e.secuencia = 4;
\set st :SQLSTATE
ROLLBACK;
SELECT :'st' = '23514' AS ok \gset
\if :ok
\echo 'OK I-07 rechazado, SQLSTATE' :st
\else
\echo 'FALLA I-07: SQLSTATE obtenido' :st '- esperado 23514'
\set fallas true
\endif

-- ---------------------------------------------------------------------
\echo
\echo '--- I-08 State machine trigger: stage PENDIENTE -> TERMINADA skips steps (expected SQLSTATE 23514)'
BEGIN;
UPDATE etapa_orden e SET estado = 'TERMINADA', iniciada_en = now(), terminada_en = now()
  FROM orden_trabajo o
 WHERE o.id = e.orden_id AND o.codigo = 'OT-2026-0001' AND e.secuencia = 4;
\set st :SQLSTATE
ROLLBACK;
SELECT :'st' = '23514' AS ok \gset
\if :ok
\echo 'OK I-08 rechazado, SQLSTATE' :st
\else
\echo 'FALLA I-08: SQLSTATE obtenido' :st '- esperado 23514'
\set fallas true
\endif

-- ---------------------------------------------------------------------
\echo
\echo '--- Verification after the attempts: state must equal the baseline'
SELECT (SELECT count(*) FROM orden_trabajo)                                        AS ot_total,
       (SELECT count(*) FROM orden_trabajo WHERE titulo LIKE 'INTEGRIDAD-%'
                                             OR codigo LIKE 'OT-2026-90%')          AS ot_invalidas_guardadas,
       (SELECT count(*) FROM movimiento_insumo WHERE comentario = 'INTEGRIDAD-07')  AS movimientos_invalidos,
       (SELECT stock_actual FROM insumo WHERE codigo = 'TEL-DRY-BL')                AS stock_tela,
       (SELECT e.estado FROM etapa_orden e JOIN orden_trabajo o ON o.id = e.orden_id
         WHERE o.codigo = 'OT-2026-0001' AND e.secuencia = 4)                       AS etapa4_demo01;

SELECT (SELECT count(*) FROM orden_trabajo) = :ot_antes
   AND (SELECT stock_actual FROM insumo WHERE codigo = 'TEL-DRY-BL') = :stock_antes
   AND (SELECT e.estado FROM etapa_orden e JOIN orden_trabajo o ON o.id = e.orden_id
         WHERE o.codigo = 'OT-2026-0001' AND e.secuencia = 4) = :'etapa_antes' AS sin_cambios \gset
\if :sin_cambios
\echo 'OK estado final igual al baseline'
\else
\echo 'FALLA el estado final difiere del baseline'
\set fallas true
\endif

\if :fallas
\echo 'RESULTADO: hay fallas'
\set ON_ERROR_STOP on
DO $$ BEGIN RAISE EXCEPTION 'integrity check failed'; END $$;
\else
\echo 'RESULTADO: 8/8 rechazados, sin cambios en los datos'
\endif
