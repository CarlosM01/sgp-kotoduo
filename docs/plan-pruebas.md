# Plan de pruebas del MVP (ES2 recortado) y resultados

Actualiza el plan de pruebas de ES2 al alcance del MVP (`roadmap.md` §1 y §5). Cada CP tiene su ficha en `evidencias/ejecuciones/fichas/CP-xx.md`, con todas sus ejecuciones; los defectos están en `evidencias/defectos.md`.

- Versión probada: `v0.9` (congelamiento, `df19bbc`). Re-ejecución: `v1.0`.
- Estados permitidos: **Aprobado**, **Fallido**, **Bloqueado**, **No ejecutado**.
- Una ejecución fallida o bloqueada nunca se borra: la siguiente se agrega como E2, E3…

## 1. Alcance

| | Total en ES2 | En el MVP | Fuera del MVP |
|---|---|---|---|
| Casos de uso | 14 | 10: CU-01 (sin MFA), CU-04, CU-05, CU-06, CU-08 (consumo), CU-09, CU-10, CU-11, CU-12 (asignar), CU-14 | 4: CU-02, CU-03, CU-07, CU-13 |
| Casos de prueba | 36 | 26 ejecutados: 24 de §5.1 + 2 deseables (CP-34, CP-36) | 10 excluidos (§4) |

## 2. Matriz CU – HU – CP

| CU | HU | CP ejecutados | Estado en `v0.9` | Estado en `v1.0` |
|---|---|---|---|---|
| CU-01 Iniciar sesión (sin MFA) | HU-11 | CP-07, CP-09, CP-29 | Aprobado ×3 | — (sin cambios) |
| CU-04 Registrar OT | HU-05, HU-07, HU-12 | CP-03, CP-04, CP-06, CP-11 | Aprobado ×4 | — |
| CU-05 Consultar Mi Trabajo | HU-01 | CP-20 | Aprobado | — |
| CU-06 Actualizar avance de etapa | HU-02 | CP-01, CP-02, CP-12, CP-13, CP-19, CP-27 | Aprobado ×6 | — |
| CU-08 Insumos y movimientos (consumo) | HU-09 | CP-05, CP-14 | Aprobado ×2 | — |
| CU-09 Reportar faltante | HU-03 | CP-15, CP-25 | Aprobado ×2 | — |
| CU-10 Supervisar producción | HU-10 | CP-18, CP-23 | Aprobado (CP-18) · **Fallido (CP-23, DEF-01)** | CP-23: Aprobado |
| CU-11 Consultar bitácora | HU-12 | CP-28 (acceso solo Administrador), CP-11 (escritura de eventos) | Aprobado ×2 | — |
| CU-12 Gestionar etapas (asignar) | HU-08 | — (ES2 no define CP; ver §3) | — | — |
| CU-14 Detectar OT en riesgo | HU-10 | CP-18 | Aprobado | — |
| Transversal: autorización | HU-11 | CP-08 (mapa de permisos), CP-24 (inyección) | Aprobado ×2 | — |
| Transversal: configuración y dependencias | — (AM-10, AM-11, AM-12) | CP-32 | **Fallido (DEF-02)** | Aprobado |
| Transversal: interfaz (deseables) | RNF-01, RNF-02 | CP-34 (responsive), CP-36 (accesibilidad) | Aprobado (CP-34) · **Fallido (CP-36, DEF-03)** | CP-36: Aprobado |

CP-20 y CP-36 tienen además una ejecución E1 **Bloqueado** (herramienta no instalada) antes de su ejecución E2 en `v0.9`.

## 3. Cobertura

- **Casos de uso:** 9 CU cubiertos por al menos un CP ejecutado, de 10 CU implementados (90 %). CU-12 (asignar responsable) no tiene CP en ES2: lo cubren pruebas de integración sin CP (`api/test/integracion/responsables.test.ts` y las de asignación en `etapas.test.ts`). Se declara como brecha del plan de ES2.
- **Casos de prueba:** 26 de 26 CP del alcance ejecutados (100 %); 0 quedan Bloqueado o No ejecutado.
- **Pruebas automatizadas:** `v0.9` 350 (204 unitarias API, 98 de integración API, 48 unitarias web); `v1.0` 363 (207, 107 y 49: se suman las pruebas de las correcciones). Todas en verde; reportes en `evidencias/ejecuciones/v0.9/` y `v1.0/`.

## 4. Casos excluidos

| CP | Motivo | Riesgo residual |
|---|---|---|
| CP-10 | MFA fuera del MVP | Cuenta privilegiada sin segundo factor |
| CP-16 | Aprobación de diseño fuera del MVP | — |
| CP-17, CP-31 | Evidencias de etapa fuera del MVP | — |
| CP-21, CP-22 | Sin staging; CP-20 lo cubre en parte | Escrituras concurrentes y carga de la PWA móvil sin medir |
| CP-26, CP-30 | Sin refresh token (D28) | Un access token robado sirve hasta 10 min |
| CP-33, CP-35 | Sin acceso a usuarios reales | Usabilidad no validada con operarios |

## 5. Desviaciones respecto de ES2

| CP | Desviación | Decisión |
|---|---|---|
| CP-08 | 17 permisos (85 celdas), no 25: errata de ES2 | D29 |
| CP-09 | Sin cookie de refresh | D28 |
| CP-18 | Sin verificador de atrasos ni notificación | D21 |
| CP-20 | Local, 12 VU en vez de 40 (límite de 300 solicitudes/min por IP) | Ficha CP-20 |
| CP-24, CP-32 | Sin ZAP; Supertest, sondas `curl` y CLI | D29 |
| CP-27 | Etapa ajena responde 404 | D19, D22 |
| CP-28 | Solo las rutas que existen en el MVP | D29 |
| CP-23 | Se evalúa por el p95 con k6 a 10 VU, no por el uso del índice | D30 |
| CP-34, CP-36 | Local, las 8 pantallas del MVP (no P-01 a P-12) | Fichas |

## 6. Resumen numérico

| Ejecución | CP ejecutados | Aprobado | Fallido | Bloqueado | No ejecutado |
|---|---|---|---|---|---|
| `v0.9`, primera pasada (E1) | 26 | 22 | 2 (CP-23, CP-32) | 2 (CP-20, CP-36: herramienta no instalada) | 0 |
| `v0.9`, tras instalar k6 y axe (E2 de CP-20 y CP-36) | 26 | 23 | 3 | 0 | 0 |
| `v1.0`, re-ejecución de los fallidos (CP-23, CP-32, CP-36) | 3 | 3 | 0 | 0 | 0 |
| **Estado final (última ejecución de cada CP)** | **26** | **26** | **0** | **0** | **0** |

En `v1.0` se re-ejecutaron los 3 CP fallidos y la regresión automatizada completa (363 pruebas). Los CP manuales que ya estaban aprobados (CP-02 en BD, sondas de CP-24, CP-25, CP-34) no se repitieron: las correcciones no tocan esas partes.

| Defectos | Crítico | Menor | Total |
|---|---|---|---|
| Encontrados al ejecutar CP | 0 | 3 (DEF-01 rendimiento, DEF-02 mínimo privilegio, DEF-03 accesibilidad) | 3 |
| Corregidos y re-ejecutados en `v1.0` | 0 | 3 | 3 |

Durante la verificación de las correcciones, antes de publicar `v1.0`, aparecieron dos fallas de la propia corrección de DEF-02, ambas resueltas y con prueba: el `search_path` que rompía los triggers con `sgp_app` (lo detectó el E2E) y la API que no arrancaba con `DB_ROL=` vacío (lo detectó el verificador independiente).

## 7. Recomendaciones

### 7.1 Corregidas en `v1.0`

| Hallazgo | Acción | Cómo se verificó |
|---|---|---|
| DEF-01: el panel tardaba 706 ms con 5.000 OT | Paginar sobre `orden_trabajo` antes de agregar las etapas | CP-23 E2: 13 ms y p95 34,67 ms con k6 a 10 VU; prueba de paridad con `v_panel_ordenes` |
| DEF-02: la API operaba como superusuario | `DB_ROL=sgp_app` en el compose, con `search_path` explícito y rechazo si el rol no existe | CP-32 E2 y E3 (stack Docker reconstruido, E-33); 8 pruebas de `DB_ROL`; E2E de los 4 flujos como `sgp_app` |
| DEF-03: `aria-label` prohibido en la sesión a 360 px | Nombre como texto, oculto solo a la vista en el celular | CP-36 E3: 0 violaciones en 16 análisis; prueba de componente |

### 7.2 Propuestas para una versión futura

| Hallazgo | Acción propuesta | Cómo verificar |
|---|---|---|
| La API se autentica como `sgp` (superusuario) y solo cambia a `sgp_app`; una inyección podría ejecutar `SET ROLE NONE` | Crear en el script de inicio de la BD un usuario de login sin superusuario, miembro de `sgp_app`, y usarlo en `DATABASE_URL` | `SET ROLE NONE` sigue sin privilegios; repetir CP-32 |
| La suite de integración corre como dueño del esquema; los permisos de `sgp_app` solo los prueba el E2E | Separar la conexión de limpieza (dueño) del pool de la aplicación con `DB_ROL=sgp_app` | `npm run test:integracion` con `DB_ROL=sgp_app` en verde |
| Las funciones de los triggers dependen del `search_path` de la sesión | Fijar `SET search_path = sgp` en cada función del DDL | Ejecutar los flujos con una sesión sin `search_path` explícito |
| CU-12 (asignar responsable) no tiene CP en ES2 | Definir un CP para HU-08 y su ficha | Ficha ejecutada en la próxima versión |
| ZAP no se ejecutó (D29) | Escaneo ZAP *baseline* contra el stack local | Sin alertas High ni Medium |
| El detalle de la OT muestra las especificaciones como JSON crudo (observado en CP-34) | Mostrar las especificaciones como pares clave–valor | Captura del detalle a 360 y 1280 px |
| Sin carga distribuida ni staging (CP-21, CP-22 excluidos; CP-20 reducido a 12 VU) | Medir con varias IP de origen en un entorno de staging | k6 con 40 VU y p95 < 500 ms |

