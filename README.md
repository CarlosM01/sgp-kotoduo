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
