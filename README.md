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
npm run verify                # lint, typecheck y tests, con log en evidencias/ejecuciones/
npm run dev -w api            # API en http://localhost:3000/api/v1/health
```

La guía de instalación completa se escribe en F6.

## Verificación

El proyecto no usa CI remoto: la verificación se ejecuta en local desde la terminal.

```bash
npm run verify
```

Corre `npm run lint`, `npm run typecheck`, `npm test` y `npm run test:integracion` en ese orden, aunque uno falle, y guarda toda la salida en `evidencias/ejecuciones/verify_<fecha>_<hora>_<commit>.log`. El log registra fecha, rama, commit, si había cambios sin confirmar, versión de Node y sistema operativo, y termina con un resumen PASS/FAIL por paso. El comando sale con código distinto de 0 si algún paso falla. Cada log se puede citar como evidencia de ejecución en el informe.

Los pasos también se pueden correr por separado: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integracion`.

| Suite | Carpeta | Necesita |
|---|---|---|
| Unitarias (`npm test`) | `api/test/` (salvo `integracion/`) | Nada: usan adaptadores en memoria |
| Integración (`npm run test:integracion`) | `api/test/integracion/` | `docker compose up -d` y el `.env`. Crean sus propios usuarios `t.*` y los borran al terminar; no modifican los usuarios de demo |

## API

`npm run dev -w api` levanta la API en `http://localhost:3000/api/v1` y lee la configuración del `.env` de la raíz. Si falta una variable o `JWT_SECRET` tiene menos de 32 caracteres, no arranca. Con el valor de ejemplo de `JWT_SECRET` muestra una advertencia en desarrollo, y `npm start -w api` (compilado, `NODE_ENV=production`) se niega a arrancar: genere uno propio, por ejemplo con `openssl rand -base64 48`.

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/health` | Pública |
| POST | `/auth/login` | Pública (máx. 10 solicitudes por minuto e IP) |
| POST | `/auth/cambiar-clave` | Cualquier sesión, incluida la que debe cambiar clave |
| GET | `/bitacora` | Permiso `bitacora.ver` (Administrador completa; Encargada solo con `orden_id`) |

La matriz de permisos y los controles de seguridad están en [docs/seguridad.md](docs/seguridad.md).

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

Si el volumen de MongoDB se creó antes de F2, su validador no acepta los eventos `CLAVE_CAMBIADA` y `ACCESO_DENEGADO` (D13). Se actualiza sin borrar datos con:

```bash
docker compose exec -T mongo mongosh --quiet sgp_docs --eval 'const d = JSON.parse(fs.readFileSync("/bd/mongo_esquemas.json", "utf8")).colecciones.bitacora_eventos; printjson(db.runCommand({ collMod: "bitacora_eventos", validator: d.validator }))'
```

Para quitar el volumen antes de la demo: `DELETE FROM sgp.orden_trabajo WHERE codigo ~ '^OT-2025-[0-9]{5}$' AND titulo LIKE 'VOL-%';`

**Usuarios de demo** (datos de prueba locales): `admin`, `encargada`, `vendedor`, `disenador`, `operario`. Todos con la frase de acceso `kotoduo demo local 2026`. El `admin` debe cambiarla en su primer inicio de sesión (D12). La OT de ejemplo es `OT-2026-0001`, con el título `DEMO-01 · …`.
