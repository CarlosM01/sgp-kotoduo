-- =====================================================================
-- SGP-Kotoduo — Demo seed (F1). Runs after 01_ddl.sql on first start.
-- Catalogs (roles, areas, work types, templates, supplies) come from 01_ddl.sql.
-- This script adds: one user per role, the sample work order DEMO-01
-- (code OT-2026-0001) and a stock adjustment that makes the supply alert
-- reproducible in the demo.
--
-- Demo credentials (local test data only, never reuse elsewhere):
--   users:    admin · encargada · vendedor · disenador · operario
--   password: "kotoduo demo local 2026"  (passphrase, >= 12 chars, CP-07)
-- Hashes: Argon2id, OWASP minimum parameters (m=19456 KiB, t=2, p=1), one salt per user.
--
-- Fixed UUIDs keep PostgreSQL and the MongoDB sample documents consistent
-- (db/mongo/mongo_esquemas.json uses the same order, stage and user ids).
-- =====================================================================

BEGIN;
SET search_path TO sgp;

-- ---------------------------------------------------------------------
-- 1. Users, one per role (HU-11)
-- ---------------------------------------------------------------------
INSERT INTO usuario (id, nombre_usuario, nombre_completo, correo, password_hash, debe_cambiar_clave, area_id) VALUES
 ('00000000-0000-0000-0000-000000000001', 'admin',     'Administrador Demo', 'admin@kotoduo.test',
  '$argon2id$v=19$m=19456,t=2,p=1$VUUHD1RJLA26+juOZ70r5A$x17gbGV2+Zyr6IE246xUpgmloOPbBnq7jfguD50LcO4', FALSE, NULL),
 ('00000000-0000-0000-0000-000000000002', 'operario',  'Operario Demo',      NULL,
  '$argon2id$v=19$m=19456,t=2,p=1$v1KSMp19ORZH0kpqf6Q3qA$1skTDb6CK+oDp2MsdcQmGrSV41jkpANek1QHxBUqJtA', FALSE,
  (SELECT id FROM area WHERE nombre = 'Sublimación')),
 ('00000000-0000-0000-0000-000000000003', 'vendedor',  'Vendedor Demo',      'ventas@kotoduo.test',
  '$argon2id$v=19$m=19456,t=2,p=1$ZeFEnYt2xGxljyYZSqG8Mg$wapC50vpqPb+bIzdeKfYBtTI9h2d7eikuuvkcTkaUps', FALSE,
  (SELECT id FROM area WHERE nombre = 'Ventas')),
 ('00000000-0000-0000-0000-000000000004', 'disenador', 'Diseñador Demo',     'diseno@kotoduo.test',
  '$argon2id$v=19$m=19456,t=2,p=1$uIz1Hub7WWn2h0mx4QqlMw$q5ggs2IRS8Wl47h+xvZPmT1GE4COlApkFu/1IAh0KGM', FALSE,
  (SELECT id FROM area WHERE nombre = 'Diseño')),
 ('00000000-0000-0000-0000-000000000005', 'encargada', 'Encargada Demo',     'produccion@kotoduo.test',
  '$argon2id$v=19$m=19456,t=2,p=1$doZ8Y39VTw3RvzUnKE8g5g$egtHi+WRerQ6MsbJuCQitDDdVdOOgPPfBSTF04NHW5A', FALSE, NULL);

INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por)
SELECT u.id::uuid, r.id, '00000000-0000-0000-0000-000000000001'::uuid
  FROM (VALUES ('00000000-0000-0000-0000-000000000001', 'ADMINISTRADOR'),
               ('00000000-0000-0000-0000-000000000002', 'OPERARIO'),
               ('00000000-0000-0000-0000-000000000003', 'VENDEDOR'),
               ('00000000-0000-0000-0000-000000000004', 'DISENADOR'),
               ('00000000-0000-0000-0000-000000000005', 'ENCARGADA_PRODUCCION')) AS u(id, rol)
  JOIN rol r ON r.codigo = u.rol;

-- ---------------------------------------------------------------------
-- 2. DEMO-01: uniform order in production (HU-05, HU-01, HU-02)
--    The code must match OT-AAAA-NNNN (ck_ot_codigo), so the DEMO-01
--    marker lives in the title. Stages 1-2 are done, stage 3 is available.
-- ---------------------------------------------------------------------
INSERT INTO orden_trabajo (id, codigo, tipo_trabajo_id, titulo, referencia_cliente, descripcion, cantidad,
                           especificaciones, prioridad, estado, fecha_compromiso, fecha_estimada_termino,
                           creado_por, creado_en)
VALUES ('10000000-0000-0000-0000-000000000001', 'OT-2026-0001',
        (SELECT id FROM tipo_trabajo WHERE nombre = 'Uniforme deportivo sublimado'),
        'DEMO-01 · Camisetas sublimadas Club Deportivo Demo', 'Club Deportivo Demo',
        'Orden de ejemplo del seed.', 30,
        '{"tallas": {"S": 5, "M": 15, "L": 10}, "colores": ["azul", "blanco"]}',
        'NORMAL', 'EN_PRODUCCION', CURRENT_DATE + 7, CURRENT_DATE + 5,
        '00000000-0000-0000-0000-000000000003', now() - interval '3 days');

-- Stages copied from the template; stage 2 keeps the id used by the Mongo sample event.
INSERT INTO etapa_orden (id, orden_id, plantilla_etapa_id, secuencia, nombre, area_id, instrucciones,
                         responsable_id, estado, duracion_estimada_horas, es_etapa_diseno, iniciada_en, terminada_en)
SELECT COALESCE(x.id, gen_random_uuid()), '10000000-0000-0000-0000-000000000001', p.id, p.secuencia, p.nombre,
       p.area_id, p.instrucciones, x.responsable_id::uuid, x.estado, p.duracion_estimada_horas, p.es_etapa_diseno,
       x.iniciada_en, x.terminada_en
  FROM plantilla_etapa p
  JOIN tipo_trabajo t ON t.id = p.tipo_trabajo_id AND t.nombre = 'Uniforme deportivo sublimado'
  JOIN (VALUES
        (1, NULL::uuid, '00000000-0000-0000-0000-000000000004', 'TERMINADA',
            now() - interval '3 days', now() - interval '2 days 20 hours'),
        (2, '891b7e01-85bc-42ef-9c23-25b9396704f0'::uuid, '00000000-0000-0000-0000-000000000002', 'TERMINADA',
            now() - interval '1 day', now() - interval '21 hours'),
        (3, NULL, '00000000-0000-0000-0000-000000000002', 'DISPONIBLE', NULL, NULL),
        (4, NULL, '00000000-0000-0000-0000-000000000002', 'PENDIENTE',  NULL, NULL),
        (5, NULL, '00000000-0000-0000-0000-000000000002', 'PENDIENTE',  NULL, NULL),
        (6, NULL, NULL,                                   'PENDIENTE',  NULL, NULL)  -- unassigned (HU-08)
       ) AS x(secuencia, id, responsable_id, estado, iniciada_en, terminada_en)
    ON x.secuencia = p.secuencia;

-- Supply requirements = template quantity per unit × order quantity
INSERT INTO requerimiento_insumo (etapa_orden_id, insumo_id, cantidad_requerida, cantidad_consumida)
SELECT e.id, pi.insumo_id, pi.cantidad_por_unidad * o.cantidad,
       CASE WHEN e.estado = 'TERMINADA' THEN pi.cantidad_por_unidad * o.cantidad ELSE 0 END
  FROM etapa_orden e
  JOIN orden_trabajo o     ON o.id = e.orden_id
  JOIN plantilla_insumo pi ON pi.plantilla_etapa_id = e.plantilla_etapa_id
 WHERE o.id = '10000000-0000-0000-0000-000000000001';

-- Consumption of the finished stages (the kardex trigger updates the stock)
INSERT INTO movimiento_insumo (insumo_id, tipo, cantidad, etapa_orden_id, usuario_id, comentario)
SELECT r.insumo_id, 'CONSUMO', -r.cantidad_consumida, r.etapa_orden_id, e.responsable_id,
       'Consumo al terminar etapa (seed DEMO-01)'
  FROM requerimiento_insumo r
  JOIN etapa_orden e ON e.id = r.etapa_orden_id
 WHERE e.orden_id = '10000000-0000-0000-0000-000000000001' AND r.cantidad_consumida > 0;

-- ---------------------------------------------------------------------
-- 3. Reproducible alert for the demo (HU-09): after a physical count the
--    dry-fit fabric drops to 70 m; finishing "Corte" on DEMO-01 consumes
--    36 m, leaving 34 m <= minimum 40 m, which opens the automatic alert.
-- ---------------------------------------------------------------------
INSERT INTO movimiento_insumo (insumo_id, tipo, cantidad, usuario_id, comentario)
SELECT id, 'AJUSTE', 70.00 - stock_actual, '00000000-0000-0000-0000-000000000005',
       'Ajuste por conteo físico (seed demo)'
  FROM insumo WHERE codigo = 'TEL-DRY-BL';

COMMIT;
