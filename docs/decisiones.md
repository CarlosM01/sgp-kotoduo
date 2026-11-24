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
