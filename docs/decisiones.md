# Registro de decisiones

| ID | Decisión | Elegida | Motivo | Plan B |
|---|---|---|---|---|
| D1 | Frontend | React + Vite + TypeScript, reutilizando `estilos.css` del prototipo ES2. Solo las 8 pantallas del MVP. | Coincide con el diseño aprobado en ES2. | Si los flujos 1–3 no están en React al cierre de F5/F6, se conecta el HTML del prototipo a la API. |
| D2 | Sesión | Access JWT corto + refresh en cookie `httpOnly` con rotación (tabla `sesion_refresh`). Se construye al final. | Diseño ES2; cierra AM de robo de sesión. | Solo access JWT; CP-26 y CP-30 pasan a excluidos. |
| D3 | Uso de MongoDB | Bitácora `bitacora_eventos`, escrita directamente por la API en cada acción relevante; lectura solo para Administrador (CU-11). | Demuestra el flujo API ↔ PostgreSQL ↔ MongoDB (observación 2.1.4.9). | — |
| D4 | Nube | Ejecución local con Docker Compose; plan de nube descrito en el Informe 3 §6. | Plazo de entrega. | Base gestionada solo si sobra tiempo. |
| D5 | Estructura | Monorepo con workspaces de npm: `api/`, `web/`, `db/`, `docs/`, `evidencias/`. | Un solo `clone` + `compose` para la instalación y la demo. | — |
| D6 | Arquitectura de la API | Capas: `dominio` (reglas puras), `aplicacion` (casos de uso), `infraestructura` (PG, Mongo, HTTP). | Reglas testeables con Vitest sin base de datos (CP-01 a CP-08). | — |
| D7 | Scripts de BD | Se reutilizan sin cambios los de ES2 (`informe-2/bd`). Las tablas fuera del MVP (`aprobacion_diseno`, `outbox_evento`) se conservan sin uso. | Trazabilidad con el diseño aprobado. | — |
| D8 | Marca `DEMO-xx` | Va en el título de la OT (`DEMO-01 · …`); el código sigue siendo `OT-2026-0001`. | `ck_ot_codigo` exige `OT-AAAA-NNNN`; la prueba I-04 lo demuestra. | — |
| D9 | Seed de demo | UUID fijos para usuarios y `DEMO-01`, iguales a los de los documentos de ejemplo de MongoDB. Clave común de demo `kotoduo demo local 2026` (Argon2id, parámetros mínimos OWASP). | Historial coherente entre PostgreSQL y MongoDB; credenciales de prueba sin valor fuera del entorno local. | — |
| D10 | Alerta reproducible | El seed deja la tela dry-fit en 70 m con un movimiento `AJUSTE`; terminar "Corte" en `DEMO-01` consume 36 m y abre la alerta automática (34 ≤ 40). | Paso 4 del guion de demo determinista, sin tocar el DDL de ES2. | — |
| D11 | Datos de volumen | Script manual `volumen.sql`, determinista, con prefijo `VOL-` y sin responsable asignado. | No contamina "Mi Trabajo" ni la demo; se borra con un `DELETE` acotado a código `OT-2025-NNNNN` y título `VOL-`. | — |
| D12 | Clave del `admin` de demo | El `admin` del seed parte con `debe_cambiar_clave = TRUE`; F2 agrega `POST /api/v1/auth/cambiar-clave` y F5 su pantalla. Mientras no cambie la clave, el login solo permite ese endpoint. | La clave de demo es pública en el repo; la cuenta privilegiada no puede quedar usable con ella (hallazgo R1-001 de la revisión de F1). Las demás cuentas de demo mantienen la clave pública para la presentación. | Declarar el riesgo como aceptado y dejar el `admin` sin cambio forzado. |
