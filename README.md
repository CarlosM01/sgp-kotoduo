# SGP-Kotoduo

Sistema de Gestión y Seguimiento Productivo para Kotoduo (MVP, Evaluación Sumativa 3).

| Carpeta | Contenido |
|---|---|
| `api/` | API REST: Node.js 24 + Express 5 + TypeScript |
| `web/` | Interfaz React + Vite, servida por nginx en el stack de Docker |
| `db/` | Scripts de PostgreSQL 16 y MongoDB |
| `docs/` | Roadmap, decisiones, trazabilidad, seguridad y [manual de usuario](docs/manual-usuario.md) |
| `evidencias/` | Fichas de ejecución, reportes y registro de defectos |

## Instalación

Levanta el sistema completo (PostgreSQL, MongoDB, API e interfaz) con Docker. No necesita Node.js.

### Requisitos

| Componente | Versión probada | Notas |
|---|---|---|
| Sistema operativo | Ubuntu 24.04 LTS (kernel 7.0) | Cualquier sistema con Docker y Compose v2 debería servir; solo se probó en este |
| Docker Engine | 29.9 | |
| Docker Compose | v5.0 (plugin `docker compose`) | El antiguo `docker-compose` v1 no sirve |
| Git | cualquiera reciente | |
| OpenSSL | cualquiera | Solo para generar el secreto; vale cualquier cadena aleatoria de 32 caracteres o más |

Puertos libres en `127.0.0.1`: `8080` (interfaz), `5432` (PostgreSQL) y `27017` (MongoDB). Se cambian en `.env` con `WEB_PORT`, `POSTGRES_PORT` y `MONGO_PORT`.

### Pasos

```bash
git clone <url-del-repositorio> sgp-kotoduo
cd sgp-kotoduo
cp .env.example .env
```

Genere un secreto para firmar las sesiones:

```bash
openssl rand -base64 48
```

Abra `.env` y reemplace el valor de `JWT_SECRET` por el resultado. **Este paso es obligatorio:** en el stack de Docker la API corre con `NODE_ENV=production` y no arranca con el valor de ejemplo, porque es público y cualquiera podría firmar sesiones válidas.

```bash
docker compose up -d --build
docker compose ps
```

La primera vez construye las imágenes y crea las bases con el esquema y los datos de demo, lo que toma alrededor de un minuto. Está listo cuando `docker compose ps` muestra los 4 servicios (`sgp-postgres`, `sgp-mongo`, `sgp-api` y `sgp-web`) como `healthy`.

### Verificar la instalación con `DEMO-01`

1. La API responde a través de la interfaz:

   ```bash
   curl http://localhost:8080/api/v1/health
   ```

   Respuesta esperada: `{"status":"ok"}`.

2. Abra `http://localhost:8080` e ingrese con el usuario `encargada` y la contraseña `kotoduo demo local 2026`. Debe llegar al **Panel de producción**.
3. En **Órdenes**, abra `OT-2026-0001` (título `DEMO-01 · …`). Debe mostrar 6 etapas y su historial.
4. La misma orden está en PostgreSQL y su evento de creación en MongoDB:

   ```bash
   docker compose exec -T postgres psql -U sgp -d sgp_kotoduo -c "SELECT codigo, titulo, estado FROM sgp.orden_trabajo WHERE codigo = 'OT-2026-0001';"
   docker compose exec -T mongo mongosh --quiet sgp_docs --eval 'db.bitacora_eventos.countDocuments({ tipo: "ORDEN_REGISTRADA" })'
   ```

   Esperado: una fila con la OT y un conteo de 1 o más.

### Usuarios de demo

Todos usan la contraseña `kotoduo demo local 2026`. Son datos de prueba locales, cargados por `db/postgres/02_seed.sql`.

| Usuario | Rol | Pantalla de inicio |
|---|---|---|
| `admin` | Administrador | Panel. Debe cambiar la contraseña en el primer ingreso (D12) |
| `encargada` | Encargada de Producción | Panel |
| `vendedor` | Vendedor | Órdenes |
| `disenador` | Diseñador | Mi Trabajo |
| `operario` | Operario | Mi Trabajo |

Qué puede hacer cada rol en la interfaz: [docs/manual-usuario.md](docs/manual-usuario.md).

### Operación

| Acción | Comando |
|---|---|
| Ver el estado | `docker compose ps` |
| Ver los registros de la API | `docker compose logs api` |
| Detener sin borrar datos | `docker compose stop` |
| Volver a levantar | `docker compose up -d` |
| Reconstruir tras cambiar el código | `docker compose up -d --build` |
| Borrar todo y partir de cero (datos incluidos) | `docker compose down -v` |

### Problemas conocidos

| Síntoma | Causa | Solución |
|---|---|---|
| `docker compose up` termina con `dependency failed to start: container sgp-api is unhealthy` | `JWT_SECRET` sigue con el valor de `.env.example`. `docker compose logs api` muestra `JWT_SECRET still has the .env.example placeholder` | Genere un secreto (vea Pasos) y vuelva a ejecutar `docker compose up -d` |
| `required variable JWT_SECRET is missing a value` | Falta `.env` o no tiene `JWT_SECRET` | `cp .env.example .env` y complete el secreto |
| `sgp-mongo` se reinicia en bucle | `mongo:8` no arranca en kernels Linux 6.19 o posteriores | Use la imagen por defecto, `MONGO_IMAGE=mongo:9.0` (misma API) |
| `bind: address already in use` | Otro servicio usa el puerto 8080, 5432 o 27017 | Cambie `WEB_PORT`, `POSTGRES_PORT` o `MONGO_PORT` en `.env` |
| La API no conecta con PostgreSQL tras cambiar `POSTGRES_PASSWORD` | La clave solo se aplica al crear el volumen, y la URL de conexión no admite caracteres como `@`, `/` o `:` sin codificar | Use letras, números, `-` y `_`, y recree el volumen con `docker compose down -v` |
| El esquema o los datos de demo no cambian tras editar `db/` | Los scripts de inicio solo corren con el volumen vacío | `docker compose down -v && docker compose up -d` |
| `admin` no puede usar el sistema después de ingresar | Debe cambiar su contraseña primero (D12) | Cámbiela en la pantalla que aparece: 12 caracteres o más |

### Seguridad del despliegue

- Los puertos solo se publican en `127.0.0.1`. La API no se publica: se llega a ella a través de nginx en `/api`.
- nginx sobrescribe `X-Forwarded-For` con la IP real del cliente, y la API confía en un solo salto (`TRUST_PROXY=1`). Así el límite de intentos de login y la bitácora usan la IP del cliente, y un cliente no puede inventarse otra.
- La interfaz se sirve con una política CSP sin scripts inline ni orígenes externos (`web/nginx/cabeceras-seguridad.conf`). La API mantiene sus propias cabeceras (helmet).
- El detalle de los controles está en [docs/seguridad.md](docs/seguridad.md).

## Desarrollo

Para trabajar en el código se levantan solo las bases en Docker, y la API y la interfaz con Node.js 24 en modo desarrollo:

```bash
cp .env.example .env          # el JWT_SECRET de ejemplo se acepta en desarrollo, con una advertencia
docker compose up -d postgres mongo
npm install
npm run verify                # lint, typecheck y tests, con log en evidencias/ejecuciones/
npm run dev -w api            # API en http://localhost:3000/api/v1/health
npm run dev -w web            # interfaz en http://localhost:5173 (reenvía /api a la API)
```

Si el stack completo está corriendo, la API y la interfaz de desarrollo pueden convivir con él: usan los puertos 3000 y 5173, y el stack usa el 8080.

## Verificación

El proyecto no usa CI remoto: la verificación se ejecuta en local desde la terminal.

```bash
npm run verify
```

Corre `npm run lint`, `npm run typecheck`, `npm test` y `npm run test:integracion` en ese orden, aunque uno falle, y guarda toda la salida en `evidencias/ejecuciones/verify_<fecha>_<hora>_<commit>.log`. El log registra fecha, rama, commit, si había cambios sin confirmar, versión de Node y sistema operativo, y termina con un resumen PASS/FAIL por paso. El comando sale con código distinto de 0 si algún paso falla. Cada log se puede citar como evidencia de ejecución en el informe.

Los pasos también se pueden correr por separado: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integracion`.

| Suite | Carpeta | Necesita |
|---|---|---|
| Unitarias (`npm test`) | `api/test/` (salvo `integracion/`) y `web/test/` | Nada: usan adaptadores en memoria y un `fetch` simulado |
| Integración (`npm run test:integracion`) | `api/test/integracion/` | `docker compose up -d postgres mongo` y el `.env`. Crean sus propios usuarios `t.*` y los borran al terminar; no modifican los usuarios de demo |
| E2E (`npm run test:e2e -w web`) | `web/e2e/` | Las bases, el `.env` y Google Chrome instalado (no descarga navegadores). Levanta la API y la interfaz de desarrollo si no están corriendo. Recorre los 4 flujos con los usuarios de demo y guarda capturas `E-11` a `E-17` en `evidencias/`. Cada corrida deja en la base su propia OT terminada y una alerta manual; no forma parte de `npm run verify` |

Para correr el E2E contra el stack de Docker en vez del servidor de desarrollo, indique su URL y una carpeta para las capturas (así no se sobrescriben las de F5):

```bash
E2E_BASE_URL=http://localhost:8080 E2E_EVIDENCIAS=/tmp/e2e-docker npm run test:e2e -w web
```

## Interfaz web

En desarrollo, `npm run dev -w web` levanta la interfaz en `http://localhost:5173`; en el stack de Docker la sirve nginx en `http://localhost:8080`. En ambos casos el navegador solo habla con ese origen, que reenvía `/api` a la API (en desarrollo, a `VITE_API_URL`, por defecto `http://localhost:3000`). Cada rol llega a su pantalla de inicio. La sesión dura lo que el token (10 min) y se guarda solo en la pestaña (D27).

## API

`npm run dev -w api` levanta la API en `http://localhost:3000/api/v1` y lee la configuración del `.env` de la raíz. En el stack de Docker la configuración la fija `docker-compose.yml` y la API se alcanza en `http://localhost:8080/api/v1`.

La API no arranca si falta una variable o si `JWT_SECRET` tiene menos de 32 caracteres. Con el valor de ejemplo de `JWT_SECRET` muestra una advertencia en desarrollo, y con `NODE_ENV=production` se niega a arrancar.

| Variable | Por defecto | Para qué |
|---|---|---|
| `DATABASE_URL` | — | Conexión a PostgreSQL |
| `MONGO_URL` | — | Conexión a MongoDB (bitácora) |
| `JWT_SECRET` | — | Firma de las sesiones; 32 caracteres o más |
| `API_PORT` | `3000` | Puerto de la API |
| `CORS_ORIGIN` | `http://localhost:5173` | Único origen web permitido |
| `NODE_ENV` | `development` | `production` en el stack de Docker |
| `TRUST_PROXY` | `0` | Saltos de proxy de confianza para la IP del cliente; `1` detrás de nginx |

Todas las rutas cuelgan de `/api/v1`. La autorización se decide en el servidor con la matriz de permisos de [docs/seguridad.md](docs/seguridad.md).

| Método | Ruta | Acceso (permiso) | Roles |
|---|---|---|---|
| GET | `/health` | Pública | — |
| POST | `/auth/login` | Pública (máx. 10 solicitudes por minuto e IP) | — |
| POST | `/auth/cambiar-clave` | Cualquier sesión, incluida la que debe cambiar clave | Todos |
| GET | `/plantillas` | `ordenes.crear` | Administrador, Encargada, Vendedor |
| POST | `/ordenes` | `ordenes.crear` | Administrador, Encargada, Vendedor |
| GET | `/ordenes`, `/ordenes/{id}` | `ordenes.ver` | Administrador, Encargada, Vendedor |
| GET | `/responsables` | `etapas.gestionar` | Administrador, Encargada |
| PATCH | `/etapas/{id}/responsable` | `etapas.gestionar` | Administrador, Encargada |
| GET | `/mi-trabajo` | `etapas.avanzar` | Administrador, Encargada, Diseñador, Operario |
| POST | `/etapas/{id}/iniciar`, `/etapas/{id}/terminar` | `etapas.avanzar` y ser el responsable de la etapa | Administrador, Encargada, Diseñador, Operario |
| GET | `/panel` | `panel.ver` | Administrador, Encargada, Vendedor |
| GET | `/insumos`, `/alertas` | `insumos.gestionar` | Administrador, Encargada |
| POST | `/alertas` | `insumos.reportar_faltante` | Administrador, Encargada, Diseñador, Operario |
| GET | `/bitacora` | `bitacora.ver` | Administrador (completa), Encargada (solo con `orden_id`) |

## Base de datos y datos de demo

`docker compose up -d` crea el esquema y carga el seed **solo la primera vez** (volumen vacío). Para reiniciar desde cero: `docker compose down -v && docker compose up -d`.

| Script | Cuándo corre | Qué hace |
|---|---|---|
| `db/postgres/01_ddl.sql` | Al iniciar (automático) | 16 tablas, restricciones, triggers, vista del panel y catálogos |
| `db/postgres/02_seed.sql` | Al iniciar (automático) | 5 usuarios (uno por rol), la OT de ejemplo `DEMO-01` y un ajuste de stock para la alerta de la demo |
| `db/mongo/mongo_init.js` + `mongo_seed.js` | Al iniciar (automático, vía `mongo-init.sh`) | Colecciones con validador e índices, y el evento de creación de `DEMO-01` |
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

Para quitar el volumen de prueba antes de la demo: `DELETE FROM sgp.orden_trabajo WHERE codigo ~ '^OT-2025-[0-9]{5}$' AND titulo LIKE 'VOL-%';`
