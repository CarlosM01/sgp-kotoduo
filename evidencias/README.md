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
