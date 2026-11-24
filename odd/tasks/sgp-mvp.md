# SGP-Kotoduo MVP (ES3)

Objective: build, run and validate the 4-flow MVP defined in `docs/roadmap.md`. Branch: `main` (individual project; feature branches per phase). Delivery: Friday 2026-11-27, code freeze tag `v0.9` before F7.
Test runner: Vitest + Supertest (api), Playwright (web, F5+). Delivery strategy: `exception-ok` (individual academic repo, no PR size gate).

## Specs

The full specification is `docs/roadmap.md`. Numbered references:

- S1 — F0: "Crear el repositorio `sgp-kotoduo` como monorepo: `api/`, `web/`, `db/`, `docs/`, `evidencias/`." + IDs, decisions D1–D4, CI "lint + typecheck + tests unitarios", "`.env.example` con valores ficticios. Ningún secreto real en el repositorio."
- S2 — F1: "`docker compose up` levanta ambas bases con esquema y seed." Seed: "5 usuarios (uno por rol), 2 plantillas, insumos con stock y mínimo, `DEMO-01` como OT de ejemplo." Volume script "5.000 OT y 30.000 etapas".
- S3 — F2: "login funcional y rutas protegidas. Una tabla de perfiles × operaciones en `docs/seguridad.md`." (CP-07, CP-08, CP-09, CP-24, CP-27, CP-28, CP-29)
- S4 — F3: "flujos 2 y 3 operativos vía API, con tests unitarios y de integración en verde." (CP-01..CP-04, CP-06, CP-11..CP-13, CP-18, CP-19)
- S5 — F4: "flujo 4 operativo vía API." (CP-05, CP-14, CP-15)
- S6 — F5: "los 4 flujos completos desde el navegador, con el dato recuperado tras guardarlo."
- S7 — F6: "instalación reproducible con su evidencia (registro de consola y capturas)."
- S8 — D2 refresh rotation, built last (roadmap §4.2 step 5).

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T0 | S1 | inline | in progress | — |
| T1 | S2 | inline | pending | — |
| T2 | S3 | inline | pending | — |
| T3 | S4 | inline | pending | — |
| T4 | S5 | inline | pending | — |
| T5 | S6 | inline | pending | — |
| T6 | S7 | inline | pending | — |
| T7 | S8 | inline | pending | — |

Remote items outside the agent's reach (need the user): GitHub repo + push, GitHub Projects board, teacher consultation on 3.1.3.6.

## Log

- L1 (2026-11-24): "Ayúdame a comenzar el desarrollo, analiza el roadmap"
- L2: repo created at `Kotoduo/sgp-kotoduo`; DB scripts copied from `informe-2/bd` unchanged. `gh` CLI is not installed, so board/CI activation stays manual.
