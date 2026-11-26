# Roadmap ES3 — SGP-Kotoduo (MVP)

**Objetivo:** construir, ejecutar y validar un MVP operativo del SGP-Kotoduo, y documentarlo en el Informe 3 con evidencia verificable.
**Modalidad:** desarrollo individual.
**Stack (heredado del diseño ES2):** Node.js 24 + Express + TypeScript · React + TypeScript · PostgreSQL 16 · MongoDB · Docker Compose.

---

## 0. Qué se entrega y dónde están los puntos

| Entregable | Descripción |
|---|---|
| Software funcionando | MVP de 4 flujos de punta a punta: interfaz → API → base de datos → interfaz. |
| Informe 3 | Plantilla oficial de 13 secciones, sin las referencias a criterios en los títulos. |
| Demo en vivo | 10 min + 2 min de preguntas. Sin diapositivas. Entorno instalado de antemano. Tenida semiformal. |

| Criterio | Pts | Dónde se gana |
|---|---|---|
| 3.1.1 Interfaces (coherencia + lineamientos) | 10 | F5 |
| 3.1.2 Base de datos (estructura + normalización/optimización) | 10 | F1 |
| 3.1.3 Seguridad + colaboración | 10 | F2, F0 |
| 3.1.4 Entorno (10) + documentación (5) | 15 | F6 |
| 3.1.5 Cobertura, ejecución y validación de pruebas | **30** | F7 |
| 3.1.6 Comparación (10), recomendaciones (5), preguntas (5), informe (5) | **25** | F7, F8 |

> Las pruebas y su análisis valen 45 de 100 pts. Todo lo que se construye en F1–F5 existe para poder probarlo en F7.

---

## 1. Alcance del MVP

### 1.1 Flujos incluidos

| # | Flujo | HU | CU | Pantallas (prototipo ES2) |
|---|---|---|---|---|
| 1 | Login con roles, autorización validada en el servidor | HU-11 (sin gestión de usuarios), HU-12 | CU-01 (sin MFA), CU-11 | `index`, `bitacora` |
| 2 | Crear una OT a partir de la plantilla de su tipo de trabajo | HU-05, HU-07 (solo lectura), HU-08 (parcial) | CU-04, CU-12 (asignar) | `ordenes`, `ordenes-nueva`, `detalle-orden` |
| 3 | El operario inicia/termina su etapa y el panel refleja el avance | HU-01, HU-02, HU-10 | CU-05, CU-06, CU-10, CU-14 | `mi-trabajo`, `panel` |
| 4 | Alerta de insumo faltante (automática bajo mínimo + reporte manual) | HU-09, HU-03 | CU-08 (consumo), CU-09 | `insumos` |

### 1.2 Excluido del MVP (se declara en la sección 4 del Informe 3)

| Excluido | HU / CU | Riesgo residual | Mitigación declarada |
|---|---|---|---|
| MFA de la Encargada | CU-01 (parte) | Cuenta privilegiada protegida solo con contraseña | Política de contraseñas (CP-07) + bloqueo por fuerza bruta (CP-29) |
| Gestión de usuarios y roles desde la UI | HU-11 (parte), CU-02 | Las altas y bajas requieren el script de seed | Usuarios sembrados; el mapa de permisos se prueba igual (CP-08) |
| Edición de plantillas | HU-07 (parte), CU-03 | Las plantillas nuevas requieren seed | Plantillas "Uniforme" y "Letrero" sembradas |
| Evidencias de etapa (foto/nota) | HU-04 | No queda constancia visual del trabajo | Versión posterior; el diseño con URL prefirmada ya está en ES2 |
| Aprobación de diseño | HU-06, CU-07 | El flujo diseñador–vendedor sigue fuera del sistema | Versión posterior |
| Relay outbox PostgreSQL → MongoDB | — | Sin consistencia eventual entre motores | La bitácora se escribe directo en Mongo desde la API; el outbox queda como mejora |
| Notificaciones push/correo | — | Las alertas solo se ven dentro del sistema | Alertas visibles en `insumos` y `panel` |
| Refresh token con rotación (D2 a) | — | La sesión dura 10 min y luego pide volver a entrar; sin revocación del token emitido | Access JWT corto (D14), `sessionStorage` por pestaña (D27); D28 |

---

## 2. Decisiones abiertas (cerrar en F0)

| ID | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | Frontend | (a) Migrar a React + Vite reutilizando `estilos.css`; (b) conectar el HTML actual a la API | **Adoptada (a)**: coincide con el diseño aprobado, sin cambio que justificar. Se migran solo las 8 pantallas del MVP. Si los flujos 1–3 no quedan listos en React antes del cierre de F5/F6, se pasa a (b). |
| D2 | Sesión | (a) Access JWT corto + refresh en cookie `httpOnly` con rotación; (b) solo access JWT | **Adoptada (a)**, pero se construye al final (paso 5 de §4.1). Si no queda listo al congelar el código, se pasa a (b) y CP-26/CP-30 se excluyen. **Al congelar `v0.9` se pasó a (b)** (D28 en `docs/decisiones.md`). |
| D3 | Uso de MongoDB | Bitácora de auditoría (`bitacora_eventos`) | Escritura directa desde la API en cada acción relevante; lectura solo para Administrador (CU-11). |
| D4 | Nube | (a) Solo local con Docker + plan de nube descrito; (b) desplegar BD en un servicio gestionado | **(a)** como base; **(b)** solo si sobra tiempo. La plantilla 6.3 pide "cómo se considera su utilización en la nube, cuando corresponda". |

---

## 3. Supuestos de negocio (preguntas prioritarias del banco)

Las respuestas no vienen del cliente: se declaran como **supuestos de diseño** en la sección 4 del Informe 3 (la guía 6.3 pide separar lo "no confirmado por el cliente").

| # | Pregunta prioritaria | Supuesto adoptado | Fuente / justificación |
|---|---|---|---|
| 1 | Problema principal a resolver primero | _completar_ | |
| 2 | Trabajos con etapas estandarizables | Uniformes y letreros | Plantillas de ES2 |
| 3 | Quién define y valida las etapas | Encargada de Producción | HU-07 |
| 4 | Cómo se asigna y se indica qué hacer después | Asignación por la Encargada; "Mi Trabajo" muestra la siguiente actividad | HU-01, HU-08 |
| 5 | Datos necesarios para registrar un trabajo | _completar_ (campos de `orden_trabajo`) | DDL |
| 6 | Cómo se determinan los insumos antes de producir | Requerimiento derivado de la plantilla × cantidad | `plantilla_insumo` |
| 7 | Inventario completo o anticipar faltantes | Anticipar faltantes con stock mínimo | HU-09 |
| 8 | Estados y eventos de avance | Estados de etapa: PENDIENTE, DISPONIBLE, EN_CURSO, BLOQUEADA, TERMINADA, OMITIDA | CP-01/CP-02 |
| 9 | Roles y permisos | 5 roles: Operario, Vendedor, Diseñador, Encargada, Administrador | Tabla 7.1 ES2 |
| 10 | Dispositivos y conectividad | Celular del operario + PC de oficina; mobile-first | RNF-01, RNF-02 |
| 11 | Funcionalidades de la primera versión | Los 4 flujos de §1.1 | Este roadmap |
| 12 | Quién aprueba y cómo se acepta | _completar_ | |

---

## 4. Fases

Se mantiene el alcance completo de §1.1.

### 4.1 Secuencia

| Paso | Fases | Resultado esperado |
|---|---|---|
| 1 | F0, F1, F2, F3, F4 | Repo, BD con seed y API completa de los 4 flujos, con tests unitarios y de integración en verde |
| 2 | F5, F6 | Las 8 pantallas en React conectadas a la API; compose del stack completo y README; prueba desde un clon limpio |
| 3 | F8 (parte) | Secciones 1–4 del Informe 3 (no dependen del resultado de las pruebas) |
| 4 | Cierre de F5/F6 | Pendientes menores y capturas de interfaz y BD |
| 5 | **Congelamiento** | Tag `v0.9`. **Desde aquí no se programa nada nuevo.** |
| 6 | F7 | Protocolo ejecutado sobre `v0.9`, `DEF-xx` registrados, correcciones en `v1.0`, re-ejecución |
| 7 | F8 | Secciones 5–13 del informe, hoja de apoyo y ensayo cronometrado de la demo |

### 4.2 Orden de construcción y línea de corte

Se construye en este orden. Lo que no esté terminado al congelar el código pasa a la tabla de exclusiones (§1.2) con su riesgo, y no se sigue programando.

1. Flujo 1: login + RBAC en el servidor + bitácora en Mongo (seguridad, 3.1.3).
2. Flujo 2: crear OT desde plantilla (escritura y lectura desde la UI, 3.1.1 y 3.1.2).
3. Flujo 3: Mi Trabajo, iniciar/terminar etapa, panel.
4. Flujo 4: consumo de insumos y alertas.
5. Refresh token con rotación (D2), CP deseables (CP-34, CP-36).

### F0 — Preparación y trazabilidad

- [x] Crear el repositorio `sgp-kotoduo` como monorepo: `api/`, `web/`, `db/`, `docs/`, `evidencias/`.
- [x] Crear un tablero (GitHub Projects) con una tarjeta por HU del MVP. Evidencia para 3.1.3.6.
- [x] Definir los IDs estables: HU, CU, CP, `DEF-xx` (defectos), `E-xx` (evidencias).
- [ ] Cerrar las decisiones D1–D4 y completar los supuestos de §3. _D1–D4 cerradas en `docs/decisiones.md`; faltan los supuestos 1, 5 y 12._
- [x] Verificación local por terminal (`npm run verify`): lint + typecheck + tests, con log fechado en `evidencias/ejecuciones/`. Reemplaza el CI de GitHub Actions, que la rúbrica no exige.
- [x] `.env.example` con valores ficticios. Ningún secreto real en el repositorio.
- [ ] Consultar al docente cómo se evalúa 3.1.3.6 (colaboración) en un proyecto individual.

**Salida:** repositorio con la estructura, tablero cargado y decisiones registradas en `docs/decisiones.md`.

### F1 — Base de datos · criterio 3.1.2

- [x] Reutilizar `ddl_postgresql.sql` (16 tablas). Las tablas fuera del MVP (`aprobacion_diseno`, `outbox_evento`) se conservan sin uso y se declara.
- [x] Revisar las restricciones que se van a probar: `NOT NULL`, `FOREIGN KEY`, `CHECK` de estados y de stock, `UNIQUE` del código de OT.
- [x] Seed reproducible: 5 usuarios (uno por rol), 2 plantillas, insumos con stock y mínimo, `DEMO-01` como OT de ejemplo.
- [x] Script de volumen: 5.000 OT y 30.000 etapas, para el `EXPLAIN ANALYZE` de CP-23.
- [x] Mongo: colección `bitacora_eventos` con validador de esquema e índice por fecha y usuario.
- [x] Prueba manual de integridad: `INSERT` inválidos (nulo, FK inexistente, estado fuera del `CHECK`) → captura del rechazo y consulta de que no quedó guardado.

**Salida:** `docker compose up` levanta ambas bases con esquema y seed. Evidencias de restricciones capturadas (E-xx).

### F2 — API núcleo y seguridad · criterio 3.1.3

- [x] Express + TypeScript con capas separadas: dominio (reglas puras, testeables con Vitest), aplicación (casos de uso), infraestructura (repositorios PG/Mongo, HTTP).
- [x] Validación de entrada con esquemas (zod), por ejemplo `NuevaOrdenSchema`, que rechace campos extra.
- [x] Manejo central de errores: respuestas uniformes, sin trazas internas hacia el cliente.
- [x] Autenticación: hash de contraseñas con argon2 o bcrypt, política de contraseñas (CP-07), JWT y refresh según D2. _El refresh (D2) queda para el paso 5 de §4.2._
- [x] Cambio de clave obligatorio: si `debe_cambiar_clave` es verdadero, el login solo permite `POST /auth/cambiar-clave` (aplica CP-07). El `admin` del seed parte así (D12).
- [x] Autorización RBAC **en el servidor**: middleware de permisos con `PERMISOS_POR_ROL` (CP-08) y control de propiedad de la etapa contra IDOR (CP-27). _El control de propiedad se aplica en F3, cuando existan las rutas de etapas._
- [x] Endurecimiento: límite de intentos y bloqueo de login (CP-29), `helmet`, CORS restringido, consultas parametrizadas (CP-24).
- [x] Bitácora: cada acción relevante escribe un evento en Mongo (HU-12).

**Salida:** login funcional y rutas protegidas. Una tabla de perfiles × operaciones en `docs/seguridad.md`.

### F3 — Órdenes y etapas · flujos 2 y 3

- [x] Dominio: `generarEtapas` (CP-03), `calcularFechaEstimada` (CP-04) y la máquina de estados `puedeTransicionar` (CP-01, CP-02).
- [x] `POST /ordenes`: crea la OT con código `OT-AAAA-NNNN`, genera sus etapas y sus requerimientos de insumo en una sola transacción (CP-11).
- [x] Asignación mínima de responsables (HU-08 parcial).
- [x] `GET /mi-trabajo`: etapas del operario y siguiente actividad.
- [x] `POST /etapas/{id}/iniciar` y `/terminar` con bloqueo optimista por `version` (CP-12, CP-19). Terminar la última etapa cierra la OT (CP-13).
- [x] `GET /panel`: órdenes atrasadas y en riesgo (CP-18), sobre `v_panel_ordenes` paginada.

**Salida:** flujos 2 y 3 operativos vía API, con tests unitarios y de integración en verde.

### F4 — Insumos y alertas · flujo 4

- [x] Registrar consumos al terminar una etapa (`movimiento_insumo`).
- [x] Alerta automática **única** cuando el stock queda en el mínimo o bajo él (regla `≤`; CP-05, CP-14).
- [x] `POST /alertas`: reporte manual de faltante del operario (CP-15).
- [x] `GET /insumos` y `GET /alertas` para la Encargada.

**Salida:** flujo 4 operativo vía API.

### F5 — Frontend operativo · criterio 3.1.1

- [x] Migrar las 8 pantallas del MVP según D1, reutilizando `estilos.css` y los componentes del prototipo.
- [x] Guardas de ruta por rol en el cliente (solo UX; la autorización real está en la API).
- [x] Validaciones en los formularios con mensajes coherentes y estados de carga, error y vacío.
- [x] Consistencia: mismos botones, etiquetas, mensajes y forma de volver atrás entre "Nueva OT" y "Detalle OT".
- [x] Mobile-first: revisar 360 px (observación pendiente de ES2) y la navegación con teclado.

**Salida:** los 4 flujos completos desde el navegador, con el dato recuperado tras guardarlo.

### F6 — Entorno y documentación · criterio 3.1.4

- [x] `docker-compose.yml` del stack completo: `postgres`, `mongo`, `api`, `web`. El servicio `api` fija `NODE_ENV=production` (hallazgo R1-001 de la revisión de F3). _`web` es nginx: sirve el build, reenvía `/api` y fija la CSP. La API no se publica y confía en un salto de proxy (`TRUST_PROXY=1`)._
- [x] `README.md` de instalación: SO probado, versiones, comandos en orden, seed, verificación con `DEMO-01`, problemas conocidos.
- [x] Manual de usuario breve, por rol. _`docs/manual-usuario.md`._
- [x] **Prueba desde un clon limpio**, idealmente hecha por un compañero. Registrar los pasos que generaron dudas, corregir y repetir (la guía 4.2 lo valora). _Hecha en local por el autor siguiendo el README (E-19), con build sin caché y E2E de los 4 flujos sobre el stack (E-20, E-21). Falta la prueba por otra persona._
- [x] Sin rutas absolutas personales ni secretos. _Búsqueda en E-19 §6: 0 coincidencias._

**Salida:** instalación reproducible con su evidencia (registro de consola y capturas).

### F7 — Ejecución y validación de pruebas · criterios 3.1.5 y 3.1.6

- [ ] **Congelar una versión** (tag `v0.9`) y ejecutar el protocolo sobre ella.
- [ ] Actualizar el plan de ES2 al MVP: matriz HU–CU–CP con alcance y exclusiones (§5).
- [ ] Calcular la cobertura con denominador explícito ("X CU cubiertos de Y implementados").
- [ ] Ejecutar cada CP con una ficha: precondiciones, datos, pasos, esperado, **obtenido (observado de verdad)**, fecha, versión, estado.
- [ ] Estados permitidos: Aprobado / Fallido / Bloqueado / No ejecutado.
- [ ] Cada fallo genera un `DEF-xx` con causa: hipótesis o confirmada.
- [ ] Corregir, publicar `v1.0` y **re-ejecutar sin borrar la ejecución fallida**.
- [ ] Resumen numérico de estados, separando defectos críticos de menores.
- [ ] Tabla de recomendaciones: hallazgo → acción → cómo verificar. Separar las corregidas de las propuestas para una versión futura.

**Salida:** `evidencias/` con fichas, reportes de herramientas (Vitest, Supertest, Playwright, k6) y registro de defectos.

### F8 — Informe 3 y demo · criterios 3.1.6.14 y 3.1.6.15

- [ ] Redactar el informe según §8.
- [ ] Ensayar el guion de demo (§9) con cronómetro. **Máximo 10 minutos.**
- [ ] Preparar una hoja de apoyo para preguntas: dónde está cada HU en el código, qué CP la prueba y qué quedó pendiente.
- [ ] Repasar la checklist (§11).

---

## 5. Plan de pruebas recortado al MVP

### 5.1 Casos que se ejecutan

| CP | HU / CU | Qué prueba | Tipo / herramienta |
|---|---|---|---|
| CP-01 | HU-02 / CU-06 | Transiciones válidas de etapa | Unitaria · Vitest |
| CP-02 | HU-02 / CU-06 | Transiciones inválidas rechazadas | Unitaria · Vitest |
| CP-03 | HU-07 / CU-04 | Generación de etapas desde la plantilla | Unitaria · Vitest |
| CP-04 | HU-05 / CU-04 | Fecha estimada de término | Unitaria · Vitest |
| CP-05 | HU-09 / CU-08 | Umbral de stock mínimo (borde `≤`) | Unitaria · Vitest |
| CP-06 | HU-05 / CU-04 | Validación de la OT | Unitaria · Vitest |
| CP-07 | HU-11 / CU-01 | Política de contraseñas | Unitaria · Vitest |
| CP-08 | HU-11 / CU-02 | Mapa de permisos por rol | Unitaria tabular · Vitest |
| CP-09 | HU-11 / CU-01 | Login correcto | Integración · Supertest |
| CP-11 | HU-05, HU-12 / CU-04 | Registro de OT de punta a punta en datos | Integración · Supertest |
| CP-12 | HU-02 / CU-06 | Terminar etapa habilita la siguiente | Integración · Supertest |
| CP-13 | HU-02 / CU-06 | Terminar la última etapa cierra la OT | Integración · Supertest |
| CP-14 | HU-09 / CU-08 | Alerta automática única | Integración · Supertest |
| CP-15 | HU-03 / CU-09 | Reporte manual de faltante | Integración · Supertest |
| CP-18 | HU-10 / CU-10, CU-14 | Panel identifica atrasadas y en riesgo | Integración · Supertest |
| CP-19 | HU-02 / CU-06 | Concurrencia sobre la misma etapa | Integración · Supertest |
| CP-20 (reducido) | HU-01 / CU-05 | Carga de Mi Trabajo, en local y con menos VU | Estrés · k6 |
| CP-23 (parcial) | HU-10 / CU-10 | `EXPLAIN ANALYZE` del panel con volumen | Rendimiento BD · psql |
| CP-24 | AM-01, AM-02 | Inyección SQL/NoSQL | Seguridad · Supertest |
| CP-25 (adaptado) | AM-03 | XSS almacenado en el comentario de la alerta | Seguridad · Playwright |
| CP-27 | AM-05 | IDOR horizontal | Seguridad · Supertest |
| CP-28 | AM-06 | Escalada vertical | Seguridad · Supertest |
| CP-29 | AM-07 | Fuerza bruta | Seguridad · Supertest |
| CP-32 (parcial) | AM-10–AM-12 | Cabeceras + `npm audit` | Seguridad · CLI |

**Deseables** (se ejecutan si queda tiempo; cierran observaciones de ES2):

| CP | Qué prueba | Condición |
|---|---|---|
| CP-26, CP-30 | CSRF en el refresh y reutilización de un refresh rotado | Solo si D2 = (a) |
| CP-34 | Diseño responsive (360 px y más) | Playwright |
| CP-36 | Accesibilidad automatizada | `@axe-core/playwright` |

> Se conserva **una prueba de estrés reducida** (CP-20): la rúbrica 3.1.5.9 nombra "pruebas de borde y estrés" en el nivel Destacado.

### 5.2 Casos excluidos

| CP | Motivo | Riesgo |
|---|---|---|
| CP-10 | MFA fuera del MVP | Cuenta privilegiada sin segundo factor |
| CP-16 | Aprobación de diseño fuera del MVP | — |
| CP-17, CP-31 | Evidencias de etapa fuera del MVP | — |
| CP-21, CP-22 | Sin entorno staging; se cubre parcialmente con CP-20 | Rendimiento de escrituras y de la PWA móvil sin medir |
| CP-33, CP-35 | Sin acceso a usuarios reales de Kotoduo | Usabilidad no validada con operarios (brecha de ES2) |
| CP-26, CP-30 | D2 pasó a (b) al congelar `v0.9` (D28): no hay refresh token | Robo de un access token válido por hasta 10 min |

---

## 6. Endpoints del MVP

| Método | Ruta | Roles | CP |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Público | CP-07, CP-09, CP-29 |
| POST | `/api/v1/auth/refresh` | Sesión (D2) | CP-26, CP-30 |
| POST | `/api/v1/auth/logout` | Sesión | — |
| POST | `/api/v1/auth/cambiar-clave` | Sesión (incluida la que debe cambiar clave) | CP-07 |
| GET | `/api/v1/plantillas` | Vendedor, Encargada | — |
| POST | `/api/v1/ordenes` | Vendedor, Encargada | CP-06, CP-11 |
| GET | `/api/v1/ordenes`, `/ordenes/{id}` | Vendedor, Encargada, Admin | CP-24 |
| PATCH | `/api/v1/etapas/{id}/responsable` | Encargada | — |
| GET | `/api/v1/mi-trabajo` | Operario | CP-20 |
| POST | `/api/v1/etapas/{id}/iniciar` | Operario (dueño) | CP-27 |
| POST | `/api/v1/etapas/{id}/terminar` | Operario (dueño) | CP-12, CP-13, CP-19, CP-27 |
| GET | `/api/v1/insumos` | Encargada | — |
| GET, POST | `/api/v1/alertas` | GET: Encargada · POST: Operario | CP-14, CP-15, CP-25 |
| GET | `/api/v1/panel` | Encargada, Admin, Vendedor (`panel.ver`, Tabla 7.1) | CP-18, CP-23 |
| GET | `/api/v1/bitacora` | Admin | CP-28 |

---

## 7. Convenciones de evidencia

- `evidencias/E-xx_<descripcion>.png|log`: cada evidencia indica qué CP, HU o criterio respalda.
- `evidencias/defectos.md`: `DEF-xx` con CP, paso, dato, esperado, obtenido, causa (hipótesis/confirmada), corrección y re-ejecución.
- `evidencias/ejecuciones/`: una ficha por CP ejecutado, más los reportes HTML/JSON de las herramientas.
- Datos de prueba siempre identificables: `DEMO-01`, `DEMO-02`, …
- Nunca incluir contraseñas reales, tokens ni capturas que permitan acceder a servicios.

---

## 8. Mapa del Informe 3

| Sección de la plantilla | Contenido | Fuente |
|---|---|---|
| 1–2 Portada, índice | Datos institucionales e índice automático | — |
| 3 Introducción | Problema, objetivo y relación entre U1 → U2 → U3 | Informe 2 |
| 4 Alcance | §1 + §2 + §3 de este roadmap. Cambios respecto del diseño. Desarrollo individual (corrige la observación 2.1.1.1 de ES2) | F0 |
| 5 Interfaces | Pantallas ↔ HU, navegación, validaciones, consistencia, capturas antes/guardar/consultar | F5 |
| 6 Bases de datos | Esquema real, restricciones probadas, `EXPLAIN ANALYZE`, documento real de Mongo, plan de nube | F1, CP-23 |
| 7 Programación | Arquitectura implementada, seguridad (matriz rol × operación), colaboración: commits, PRs, tablero | F2–F4 |
| 8 Instalación | Versiones, procedimiento, verificación, prueba desde clon limpio | F6 |
| 9 Pruebas | Matriz HU–CU–CP, cobertura con denominador, fichas de ejecución | F7 |
| 10 Comparación | Esperado vs. obtenido, `DEF-xx`, re-ejecuciones, recomendaciones trazables | F7 |
| 11 Conclusiones | Cumplimiento, logros, limitaciones, próximos pasos | — |
| 12 Referencias | Solo las fuentes consultadas | — |
| 13 Anexos | Repo y tag entregado, scripts, manuales, registros de pruebas; todos citados desde el cuerpo | — |

---

## 9. Guion de demo (10 min)

| Paso | Acción | Criterio |
|---|---|---|
| 1 | Entorno: `docker compose ps`, versiones, `.env.example` | 3.1.4 |
| 2 | Vendedor crea `DEMO-02` desde la plantilla "Uniforme" → se ven las etapas generadas | 3.1.1 |
| 3 | Consulta de `DEMO-02` en PostgreSQL y de su evento en la bitácora de Mongo | 3.1.2 |
| 4 | Operario: Mi Trabajo → inicia y termina su etapa → el consumo dispara una alerta de insumo | 3.1.1 |
| 5 | Encargada: el panel refleja el avance y la alerta | 3.1.1 |
| 6 | Operario intenta `GET /bitacora` → 403 (autorización en el servidor) | 3.1.3 |
| 7 | CP representativo: ficha, ejecución en vivo y resultado registrado | 3.1.5 |
| 8 | Un `DEF-xx`: esperado vs. obtenido, causa, corrección y re-ejecución | 3.1.6 |

---

## 10. Riesgos del roadmap

| Riesgo | Mitigación |
|---|---|
| El frontend consume más tiempo del previsto | Al cierre de F5/F6 se evalúa: si los flujos 1–3 no están en React, se pasa a D1 (b). |
| Falta tiempo para F7 | El código se congela en el paso 5 de §4.1, sin excepciones. Lo que falte se declara excluido (§4.2). |
| El código generado con IA no se entiende lo suficiente para defenderlo (3.1.6.14) | Revisar cada módulo al cerrarlo; la hoja de apoyo de F8 ubica cada HU en el código. |
| 3.1.3.6 está pensado para equipos | Consultar al docente (F0). Evidenciar con commits, PRs autorrevisados, tablero y decisiones. |
| El entorno falla en la demo | Antes de la demo, probar desde un clon limpio en el equipo que se usará. |
| Kernel ≥ 6.19 con MongoDB 8 | Ya resuelto en el compose (`mongo:9.0`). Documentarlo en problemas conocidos. |

---

## 11. Checklist previa a la entrega (guía ES3 §8)

- [ ] La versión implementada y sus limitaciones están declaradas.
- [ ] Cada funcionalidad se vincula con una HU.
- [ ] Las evidencias muestran acción y resultado, no pantallas estáticas.
- [ ] Almacenamiento, consulta y restricciones comprobados en la base.
- [ ] Cada mecanismo de seguridad tiene al menos una prueba.
- [ ] Las instrucciones de instalación son reales y están probadas.
- [ ] La matriz distingue Aprobado / Fallido / Bloqueado / No ejecutado.
- [ ] Los resultados esperado y obtenido están registrados por separado.
- [ ] Cada discrepancia tiene una recomendación trazable o constancia de su corrección.
- [ ] El informe sigue las 13 secciones, sin "— criterio 3.X.X" en los títulos.

---

## 12. Brechas de ES2 que este roadmap cierra

| Observación ES2 | Cómo se cierra |
|---|---|
| 2.1.1.1: responsables "Integrante 1/2" | La sección 4 declara el desarrollo individual |
| 2.1.3.6: 320 px y teclado sin verificar | F5 + CP-34 (deseable) |
| 2.1.3.7: sin retroalimentación de usuarios | Se declara como supuesto y como exclusión con su riesgo (CP-33, CP-35) |
| 2.1.4.9: flujo API ↔ PG ↔ Mongo sin demostrar | F3 + paso 3 de la demo (§9) |
| 2.1.5.12: patrones seguros sin evidencia operativa | F2 + CP-24 a CP-29 |
| 2.1.6.13/14: CP sin ejecutar ni reportes | F7 con reportes de las herramientas |
