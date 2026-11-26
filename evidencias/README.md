# Índice de evidencias

| ID | Archivo | Qué muestra | Respalda |
|---|---|---|---|
| E-01 | `E-01_repo-monorepo-estructura.png` | Repositorio público con la estructura del monorepo | F0, 3.1.3.6 |
| E-02 | `E-02_issues-hu-fases.png` | Issues por HU y por fase | F0, 3.1.3.6 |
| E-03 | `E-03_milestones-v09-v10.png` | Milestones `v0.9` (congelamiento) y `v1.0` (entrega) | F0 |
| E-04 | `E-04_ci-run-bloqueado-billing.png` | El CI no arrancó por un bloqueo de facturación de la cuenta, no por el código | F0, 3.1.4 |
| E-05 | `E-05_ci-local-lint-typecheck-test.log` | Lint, typecheck y tests en verde en local | F0 |
| E-06 | `E-06_integridad-postgres-rechazos.png` / `.log` | 8 escrituras inválidas rechazadas (NOT NULL, FK, CHECK de estado, formato de código, UNIQUE, cantidad, stock, máquina de estados) y verificación de que no se guardó nada | F1, 3.1.2 |
| E-07 | `E-07_integridad-mongo-validador.png` / `.log` | 4 documentos inválidos rechazados por el validador de `bitacora_eventos` | F1, 3.1.2 |
| E-08 | `E-08_volumen-5000-ot.log` | Carga de 5.000 OT y 30.000 etapas | F1, CP-23 |
| E-09 | `E-09_issue-12-f1-cerrado.png` | Issue #12 (F1) cerrado con el resumen, los commits y los enlaces a las evidencias | F1, 3.1.3.6 |
| E-10 | `E-10_pr-17-f1.png` | PR #17 de F1 hacia `main`: resumen, verificación, revisión y vínculo con el issue #12 | F1, 3.1.3.6 |
| E-11 | `E-11_f5-nueva-ot-validaciones.png` | Nueva OT enviada vacía: cada campo marcado con su mensaje, nada se envía | F5, 3.1.1 |
| E-12 | `E-12_f5-ot-registrada-detalle.png` | OT registrada por el Vendedor y leída de vuelta en su detalle (6 etapas de la plantilla, sin responsables) | F5, flujo 2 |
| E-13 | `E-13_f5-asignacion-historial.png` | La Encargada asigna las 6 etapas; el historial de la OT (bitácora en Mongo) registra cada asignación | F5, flujo 2, HU-12 |
| E-14 | `E-14_f5-mi-trabajo-360px.png` | Mi Trabajo del Operario a 360 px, sin desplazamiento horizontal | F5, flujo 3, mobile-first |
| E-15 | `E-15_f5-terminar-etapa-consumos.png` | Terminar etapa con los consumos precargados desde lo requerido | F5, flujo 3, CP-12 |
| E-16 | `E-16_f5-panel-avance.png` | El panel refleja el avance (50 %, etapa actual y responsable) tras 3 etapas | F5, flujo 3, HU-10 |
| E-17 | `E-17_f5-insumos-alerta-manual.png` | Faltante reportado por el Operario visible para la Encargada en Insumos | F5, flujo 4, CP-15 |
| E-18 | `E-18_f5-e2e-flujos.log` | Corrida E2E (Playwright) de los 4 flujos que generó E-11 a E-17 | F5, 3.1.5 |

## Ejecuciones de verificación

`ejecuciones/` guarda los logs de `npm run verify` (lint, typecheck y tests), uno por ejecución: `verify_<fecha>_<hora>_<commit>.log`. El 2026-11-24, después de F1, el proyecto dejó de usar CI en GitHub Actions: la rúbrica de la ES3 no lo exige y los runs quedaban bloqueados por facturación de la cuenta (E-04). La verificación se ejecuta en local y estos logs son su evidencia (3.1.5.10). Las rutas locales aparecen como `<repo>` y `~`. No se borran logs con fallos: si una corrección arregla un fallo, se agrega una nueva ejecución.
