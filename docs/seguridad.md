# Seguridad de la API (F2)

Implementación de la sección 7 del Informe 2 en el MVP. La autorización se decide **siempre en el servidor**. El cliente web podrá usar el mismo mapa solo para ocultar botones.

## 1. Perfiles × operaciones

Fuente única: [`api/src/dominio/permisos.ts`](../api/src/dominio/permisos.ts) (`PERMISOS_POR_ROL`), transcripción de la Tabla 7.1 del Informe 2. La prueba CP-08 ([`api/test/dominio/permisos.test.ts`](../api/test/dominio/permisos.test.ts)) compara las 85 celdas (17 permisos × 5 roles) contra la tabla.

✔ = permitido · ◐ = permitido solo sobre lo propio o según el estado (lo comprueba el caso de uso) · — = denegado

| Permiso | Operación | Admin | Encargada | Vendedor | Diseñador | Operario |
|---|---|---|---|---|---|---|
| `usuarios.gestionar` | Gestionar usuarios, roles y sesiones | ✔ | — | — | — | — |
| `claves.restablecer` | Restablecer la clave de un operario | ✔ | ✔ | — | — | — |
| `plantillas.gestionar` | Gestionar plantillas | ✔ | ✔ | — | — | — |
| `ordenes.crear` | Crear OT | ✔ | ✔ | ✔ | — | — |
| `ordenes.editar` | Editar OT | ✔ | ✔ | ◐ | — | — |
| `ordenes.ver` | Ver todas las OT | ✔ | ✔ | ✔ | — | — |
| `ordenes.controlar` | Detener, reanudar o anular OT | ✔ | ✔ | — | — | — |
| `ordenes.entregar` | Marcar OT entregada | ✔ | ✔ | ✔ | — | — |
| `etapas.gestionar` | Asignar, omitir o desbloquear etapas | ✔ | ✔ | — | — | — |
| `etapas.avanzar` | Avanzar etapas | ◐ | ◐ | — | ◐ | ◐ |
| `evidencias.adjuntar` | Adjuntar evidencias | ✔ | ✔ | — | ◐ | ◐ |
| `diseno.subir` | Subir diseño | ✔ | ✔ | — | ✔ | — |
| `diseno.resolver` | Resolver diseño | ✔ | ✔ | ✔ | — | — |
| `insumos.gestionar` | Gestionar insumos y alertas | ✔ | ✔ | — | — | — |
| `insumos.reportar_faltante` | Reportar faltante | ✔ | ✔ | — | ✔ | ✔ |
| `panel.ver` | Ver panel | ✔ | ✔ | ✔ | — | — |
| `bitacora.ver` | Ver bitácora | ✔ | ◐ por OT | — | — | — |

## 2. Rutas y control de acceso

Cada ruta se declara en un registro con su regla de acceso ([`registro-rutas.ts`](../api/src/infraestructura/http/registro-rutas.ts)); el registro arma la cadena de middlewares. La prueba de inventario ([`inventario-rutas.test.ts`](../api/test/http/inventario-rutas.test.ts)) falla si aparece una ruta pública o sin permiso fuera de la lista permitida.

| Método | Ruta | Acceso | Respuesta si no cumple |
|---|---|---|---|
| GET | `/api/v1/health` | Pública | — |
| POST | `/api/v1/auth/login` | Pública | 401 genérico; 429 desde la solicitud 11 del minuto |
| POST | `/api/v1/auth/cambiar-clave` | Sesión válida, aunque deba cambiar clave | 401 |
| GET | `/api/v1/bitacora` | `bitacora.ver`; la Encargada debe indicar `orden_id` | 401 / 403 / 400 |

Secuencia por solicitud protegida: token válido (401) → sin cambio de clave pendiente (403 `PASSWORD_CHANGE_REQUIRED`) → permiso del rol (403 `FORBIDDEN`, con evento `ACCESO_DENEGADO`) → validación de la entrada (400) → caso de uso.

## 3. Controles implementados

| Control | Implementación | Prueba |
|---|---|---|
| Política de contraseñas | ≥ 12 caracteres (puntos de código), ≤ 128, sin reglas de composición; lista local de claves comprometidas que incluye la clave pública de demo | CP-07 |
| Almacenamiento de claves | Argon2id, m = 19 456 KiB, t = 2, p = 1 (mismos parámetros que el seed) | CP-09, D12 |
| Login sin enumeración | Mismo 401 y mensaje si el usuario no existe, está inactivo, está bloqueado o la clave es incorrecta; siempre se verifica un hash (real o ficticio) | `auth.test.ts` |
| Bloqueo por fuerza bruta | 5 fallos → bloqueo de 15 min en `usuario.bloqueado_hasta`, con un `UPDATE` atómico; evento `CUENTA_BLOQUEADA` | CP-29 |
| Límite de tasa | 10 solicitudes por minuto e IP en `/auth`, 300 en el resto de `/api/v1` (`express-rate-limit`) | CP-29 |
| Token de acceso | JWT HS256 de 10 min con emisor, audiencia y roles; se rechazan firma ajena, `alg: none`, payload alterado, roles desconocidos y token vencido | `tokens-jwt.test.ts` |
| Cambio de clave obligatorio (D12) | Con `debe_cambiar_clave`, el token solo sirve para `POST /auth/cambiar-clave` | `auth.test.ts` |
| RBAC con denegación por defecto | `requierePermiso` en cada ruta protegida; roles desconocidos no otorgan nada | CP-08, CP-28 |
| Validación de entrada | Esquemas zod `.strict()`: rechazan campos no declarados, tipos no primitivos (`{"$ne": null}`) y parámetros repetidos | CP-24 |
| Consultas parametrizadas | Todo el SQL usa `$1…$n`; los filtros de MongoDB se arman solo con valores ya validados y `$eq` | CP-24 |
| Errores sin fugas | Manejador central: errores tipados con `{ error: { code, message, details? } }`; los demás, 500 genérico. El detalle va al log del servidor con `X-Request-Id` | `app.test.ts`, CP-24 |
| Cabeceras | Helmet: CSP `default-src 'none'`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, HSTS; sin `X-Powered-By` | `app.test.ts` |
| CORS | Solo el origen de `CORS_ORIGIN` (cliente web) | `app.test.ts` |
| Tamaño del cuerpo | Máximo 100 kB → 413 | `app.test.ts` |
| Bitácora (HU-12) | Eventos `LOGIN_EXITOSO`, `LOGIN_FALLIDO`, `CUENTA_BLOQUEADA`, `CLAVE_CAMBIADA`, `ACCESO_DENEGADO` en `bitacora_eventos`, con IP y `request_id`. Nunca se guardan claves ni tokens | CP-09, CP-28 |

## 4. Pendiente o fuera del MVP

| Elemento | Estado | Riesgo y mitigación |
|---|---|---|
| Token de refresco en cookie con rotación (D2) | Se construye al final (§4.2 del roadmap, paso 5). Hoy la sesión dura lo que dura el token de acceso: 10 min | Si no llega al congelamiento, CP-26 y CP-30 se excluyen |
| `POST /auth/logout` | Depende del token de refresco (D2) | Sin refresco, cerrar sesión es descartar el token en el cliente |
| MFA para Administrador y Encargada | Fuera del MVP (§1.2) | Política de claves, bloqueo y cambio de clave obligatorio del `admin` |
| WAF y HTTPS | Fuera del entorno local | Se describen en el plan de nube del Informe 3 |
| Lista de claves comprometidas | Lista local corta | En producción, un corpus de claves filtradas |
