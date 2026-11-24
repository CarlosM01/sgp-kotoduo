# SGP-Kotoduo MVP (ES3)

Objective: build, run and validate the 4-flow MVP defined in `docs/roadmap.md`. Branch: `main` (individual project; feature branches per phase). Delivery: Friday 2026-11-27, code freeze tag `v0.9` before F7.
Test runner: Vitest + Supertest (api), Playwright (web, F5+). Delivery strategy: `exception-ok` (individual academic repo, no PR size gate).

## Specs

The full specification is `docs/roadmap.md`. Numbered references:

- S1 — F0: "Crear el repositorio `sgp-kotoduo` como monorepo: `api/`, `web/`, `db/`, `docs/`, `evidencias/`." + IDs, decisions D1–D4, CI "lint + typecheck + tests unitarios", "`.env.example` con valores ficticios. Ningún secreto real en el repositorio."
- S2 — F1: "`docker compose up` levanta ambas bases con esquema y seed." Seed: "5 usuarios (uno por rol), 2 plantillas, insumos con stock y mínimo, `DEMO-01` como OT de ejemplo." Volume script "5.000 OT y 30.000 etapas".
- S3 — F2: "login funcional y rutas protegidas. Una tabla de perfiles × operaciones en `docs/seguridad.md`." (CP-07, CP-08, CP-09, CP-24, CP-27, CP-28, CP-29) + D12: "Forzar cambio a admin" → `POST /api/v1/auth/cambiar-clave`; while `debe_cambiar_clave` is true, login only allows that endpoint.
- S4 — F3: "flujos 2 y 3 operativos vía API, con tests unitarios y de integración en verde." (CP-01..CP-04, CP-06, CP-11..CP-13, CP-18, CP-19)
- S5 — F4: "flujo 4 operativo vía API." (CP-05, CP-14, CP-15)
- S6 — F5: "los 4 flujos completos desde el navegador, con el dato recuperado tras guardarlo."
- S7 — F6: "instalación reproducible con su evidencia (registro de consola y capturas)."
- S8 — D2 refresh rotation, built last (roadmap §4.2 step 5).

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T0 | S1 | inline | done (local part) | 048c7e4 · RED→GREEN 3 tests, lint/typecheck OK, compose: 16 tables + 3 collections |
| T1 | S2 | inline | done | commit "feat(db): add demo seed…" on `feat/f1-database` · clean `down -v`/`up`: 5 users, DEMO-01 (6 stages), Mongo event · volume 5000/30000 twice (idempotent) · E-06 8/8 rejected, E-07 4/4 rejected · D10 alert simulated (34 ≤ 40, rolled back) |
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
- L3: `.env.example` write denied by user permission settings (`.env*` rule); user must create it (content proposed in chat). esbuild postinstall was blocked by npm install-scripts but vitest/tsx work.
- L4: public repo github.com/CarlosM01/sgp-kotoduo created and pushed; labels, milestones (v0.9, v1.0), issues #1–#16 (10 HU + 6 phases) and Project #6 "SGP-Kotoduo MVP" linked. F0 issue #11 closed with commit evidence. CI did not start: GitHub account locked by a billing issue (user must resolve in billing settings); local lint/typecheck/tests pass.
- L5 (2026-11-24): "Cómo vamos con el roadmap, qué falta? Necesito que vayas sacando capturas de pantallas para evidencias cuando sea necesario." → E-01..E-05 captured (headless Chrome, public pages; Claude in Chrome not connected, Project #6 is private and was not captured). `.gitignore` now keeps `evidencias/**/*.log`.
- L6 (2026-11-24): "Sí, empieza F1". Catalogs and 2 templates already come from 01_ddl.sql; added 02_seed.sql (users with Argon2id hashes generated with @node-rs/argon2 in a scratch dir, DEMO-01 = OT-2026-0001 because ck_ot_codigo rejects "DEMO-01", D8–D11), mongo_seed.js, volumen.sql, pruebas_integridad.sql/.js. Mongo `ix_actor_ts` covers the "fecha y usuario" index. Evidence E-06..E-08.
- L7 (2026-11-24): "Sí, sincroniza" → `gentle-ai sync` run; review of the F1 commit (lenses risk + reliability, consent granted) approved and acknowledged, lineage review-26feb1e2b7f1e4a1. 4 non-blocking WARNINGs: R1-001 admin demo account without forced password change; R1-002 volume DELETE matches any `VOL-%` title; R3 Mongo integrity script treats any error as rejection; R3 PG integrity script has no assertion/rollback and always exits 0.
- L8 (2026-11-24): "Sí, corrígelas" + admin choice "Forzar cambio a admin". R1-002: volume DELETE/count scoped to codigo `OT-2025-NNNNN` AND title `VOL-` (hand-made `VOL-` order kept). R3 Mongo: only code 121 counts, accepted docs removed, exit 1 on failure. R3 PG: each attempt in BEGIN/ROLLBACK, SQLSTATE asserted, final state vs baseline, exit 3 on failure. Failure paths proven on scratch DBs (NOT NULL dropped → FALLA I-01, exit 3, nothing kept; no validator → 4 FALLA, exit 1, nothing kept). R1-001: D12, admin `debe_cambiar_clave = TRUE`, `POST /auth/cambiar-clave` added to F2/§6. E-06/E-07 regenerated.
- Next: T2 (F2) — API layers, zod, auth with Argon2id (same params as the seed), RBAC, hardening, Mongo audit log. Pending user: push branch, close issue #12, fix GitHub billing lock for CI.
