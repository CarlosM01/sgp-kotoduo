# SGP-Kotoduo

Sistema de Gestión y Seguimiento Productivo para Kotoduo (MVP, Evaluación Sumativa 3).

| Carpeta | Contenido |
|---|---|
| `api/` | API REST: Node.js 24 + Express 5 + TypeScript |
| `web/` | Frontend React + Vite (F5) |
| `db/` | Scripts de PostgreSQL 16 y MongoDB |
| `docs/` | Roadmap, decisiones, trazabilidad y seguridad |
| `evidencias/` | Fichas de ejecución, reportes y registro de defectos |

## Inicio rápido (desarrollo)

```bash
cp .env.example .env          # valores locales ficticios
docker compose up -d          # PostgreSQL + MongoDB con esquema
npm install
npm test                      # lint, typecheck y tests: npm run lint / npm run typecheck
npm run dev -w api            # API en http://localhost:3000/api/v1/health
```

La guía de instalación completa se escribe en F6.

## Base de datos y datos de demo

`docker compose up -d` crea el esquema y carga el seed **solo la primera vez** (volumen vacío). Para reiniciar desde cero: `docker compose down -v && docker compose up -d`.

| Script | Cuándo corre | Qué hace |
|---|---|---|
| `db/postgres/01_ddl.sql` | Al iniciar (automático) | 16 tablas, restricciones, triggers, vista del panel y catálogos |
| `db/postgres/02_seed.sql` | Al iniciar (automático) | 5 usuarios (uno por rol), la OT de ejemplo `DEMO-01` y un ajuste de stock para la alerta de la demo |
| `db/mongo/mongo_init.js` + `mongo_seed.js` | Al iniciar (automático) | Colecciones con validador e índices, y el evento de creación de `DEMO-01` |
| `db/postgres/volumen.sql` | A mano | 5.000 OT y 30.000 etapas para `EXPLAIN ANALYZE` (CP-23) |
| `db/postgres/pruebas_integridad.sql` | A mano | Intentos inválidos que la base debe rechazar; no deja datos |
| `db/mongo/pruebas_integridad.js` | A mano | Documentos inválidos que el validador debe rechazar |

```bash
docker compose exec -T postgres psql -U sgp -d sgp_kotoduo -f /sgp/volumen.sql
docker compose exec -T postgres sh -c 'psql -U sgp -d sgp_kotoduo -X -f /sgp/pruebas_integridad.sql 2>&1'
docker compose exec -T mongo mongosh --quiet sgp_docs --file /bd/pruebas_integridad.js
```

Para quitar el volumen antes de la demo: `DELETE FROM sgp.orden_trabajo WHERE codigo ~ '^OT-2025-[0-9]{5}$' AND titulo LIKE 'VOL-%';`

**Usuarios de demo** (datos de prueba locales): `admin`, `encargada`, `vendedor`, `disenador`, `operario`. Todos con la frase de acceso `kotoduo demo local 2026`. El `admin` debe cambiarla en su primer inicio de sesión (D12). La OT de ejemplo es `OT-2026-0001`, con el título `DEMO-01 · …`.
