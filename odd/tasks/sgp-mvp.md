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
| T2 | S3 | inline | done | 8b86442 + B1 fix commit on `feat/f2-api-seguridad` · unit 116, integration 29 (3 runs stable) · mutation check: lockout 5→6 and dcc bypass both caught · verifier: CP-07/08/09/24/28 + D12 PASS, CP-29 FAIL (B1) → fixed |
| T3 | S4 | inline | in progress | branch `feat/f3-ordenes-etapas` from `feat/f2-api-seguridad` |
| T3a | S4 | inline | pending | domain: puedeTransicionar (CP-01/02), generarEtapas (CP-03), calcularFechaEstimada (CP-04), NuevaOrdenSchema (CP-06) |
| T3b | S4 | inline | pending | GET /plantillas, POST /ordenes (CP-11), GET /ordenes, GET /ordenes/{id} |
| T3c | S4 | inline | pending | PATCH /etapas/{id}/responsable, GET /mi-trabajo, POST /etapas/{id}/iniciar\|terminar (CP-12, CP-13, CP-19, CP-27) |
| T3d | S4 | inline | pending | GET /panel over v_panel_ordenes (CP-18) |
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
- L9 (2026-11-24): "El CI de GitHub está resultando ser más un problema. ¿Es completamente necesario que lo use? Revisen la rúbrica. Podría ser que lo programes directamente en el código y haga las pruebas por terminal. Así de paso puedo documentar las pruebas en el informe." → none of the teacher documents (rubric, guide, template, presentation guidelines) require CI. "Sí, hazlo": removed `.github/workflows/ci.yml`; added `npm run verify` (`scripts/verify.mjs`: lint, typecheck, test; all steps run; dated log with commit/branch/dirty/Node/OS in `evidencias/ejecuciones/`; exit 1 on any failure, proven with a failing lint in a scratch copy). README, roadmap §F0 and evidencias index updated.
- Next: T2 (F2) — API layers, zod, auth with Argon2id (same params as the seed), RBAC, hardening, Mongo audit log. Pending user: push branch, close issue #12.
- L10 (2026-11-25): "Sí, empieza F2". Branch `feat/f2-api-seguridad` from `feat/f1-database`. Layers dominio/aplicacion/infraestructura; CP-07 policy (≥12 code points, local compromised list incl. demo password), CP-08 map (17 permissions × 5 roles = 85 cells of Table 7.1; ES2 text says "25 permisos", Table 7.1 has 17 — to correct in the F7 plan), login with dummy-hash timing, lockout 5/15 min (atomic UPDATE), rate limit 10/min on /auth, JWT HS256 10 min (D14), D12 cambiar-clave, route registry + inventory test, GET /bitacora (Admin full, Encargada per OT), audit best effort (D15), Mongo enum + counter ids (D13, collMod applied locally, README command), integration suite in verify (D16). Refresh/logout stay for step 5 (S8). CP-27 ownership waits for F3 stage routes. Unimplemented CP-28 targets (`POST /plantillas`, `PATCH /usuarios/{id}/roles`) return 404, not 403 — note in the CP-28 sheet.
- (superseded) Next: commit, independent verifier (Risk item 2), then T3 (F3).
- L11 (2026-11-25): independent verifier on 8b86442 → B1 blocker: concurrent logins bypass CP-29 (lock read before Argon2, unconditional unlock on success; 9 wrong + 1 right in parallel → 200, lock wiped). Fix: reserve the attempt atomically before verifying (`reservarIntento`, stale after 1 min), `registrarFallo` locks at 5, `registrarAccesoExitoso` conditional. Advisories applied: NUL/format → 400 (user name regex = DB check, PG 22021/22P02 → 400), cambiar-clave guesses count toward the lock, test cleanup removes only its own request events. Advisories documented, not fixed: trust proxy at deploy, tokens outlive deactivation (D2), typed user names in LOGIN_FALLIDO. RED 7 → GREEN 29.
- (superseded) Next: B1 recheck by the verifier, native review (high_risk), then T3 (F3).
- L12 (2026-11-25): B1 recheck PASS (12/12 rounds: exactly 5 passwords checked, no success after a lock). Native review consent "Revisar este cambio" (granted), lenses risk/resilience/reliability, lineage review-93a3ee517614b0da APPROVED and acknowledged (authority burned) on 8b86442..2f237ce. Non-blocking findings fixed in a follow-up commit: pg.Pool 'error' listener (RED without it: unhandled error), dummy-hash rejection not cached, D12 integration test uses its own admin (seed flag checked statically), placeholder JWT_SECRET warns in dev and `npm start` runs as production. Left as documented: timing difference active vs unknown user (rate-limited), in-flight reservations can lock after 4 real failures (fail-safe), audit waits up to 5 s if Mongo is down, verify summary width.
- L13 (2026-11-25): "tacha los chekboxes del roadmat cuando termines algo de la checklist" → F0/F1 finished items ticked in docs/roadmap.md (D1–D4 item left open: assumptions 1, 5, 12 missing; teacher consultation open). Rule saved: tick each item as soon as it is done.
- (superseded) Next: T3 (F3) — orders and stages, flows 2 and 3.
- L14 (2026-11-25): follow-up b45f1c0 assessed high_risk (auth.ts) → consent "Revisar este cambio" (granted), lineage review-93554b35d259f1ee APPROVED and acknowledged. Its repeated WARNING (POSIX `NODE_ENV=production` in `npm start` breaks on Windows cmd.exe and overrides the deploy env) fixed in 8bd1dac: portable start script, production declared by the environment (F6 compose); pool test waits on the pool 'remove' event (still RED without the listener). 8bd1dac assessed medium / under_budget: no review, pending slice. Final verify on a clean tree: 4/4 PASS.
- Next: T3 (F3) — orders and stages, flows 2 and 3. Pending user: push branches, merge F1/F2 into main, assumptions 1/5/12 of §3.
- L15 (2026-11-25): "Sí, empieza F3" / "Continúa con la siguiente etapa del roadmap". Scope from ES2 Table 9.x: CP-01/02 mirror the DDL triggers; CP-04 = ceil(hours/8) working days counted from the registration day (Mon 23 h → Wed), Chile calendar date; CP-12 consumptions and the ETAPA_DISPONIBLE notification belong to F4 / excluded notifications; CP-18 "Verificador de atrasos" excluded with notifications (panel reads `en_riesgo` from the stored estimate). CP-27: Table 7.1 "Avanzar etapas" is ◐ for every role → only the assigned responsable may start/finish; other stages answer 404 and log ACCESO_DENEGADO. Order code: next number per year under `pg_advisory_xact_lock`. Optimistic lock: order row then stage row locked FOR UPDATE, version compared in the use case (409). Risk: item 4 (concurrency) → independent verifier at the end of F3.
