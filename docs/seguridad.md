# Seguridad de la API (F2–F3)

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
| GET | `/api/v1/plantillas` | `ordenes.crear` | 401 / 403 |
| POST | `/api/v1/ordenes` | `ordenes.crear` | 401 / 403 / 400 |
| GET | `/api/v1/ordenes`, `/api/v1/ordenes/{id}` | `ordenes.ver`; un `id` mal formado responde 400 (CP-24) | 401 / 403 / 400 / 404 |
| PATCH | `/api/v1/etapas/{id}/responsable` | `etapas.gestionar`; el responsable debe tener `etapas.avanzar` | 401 / 403 / 400 / 404 / 409 |
| GET | `/api/v1/mi-trabajo` | `etapas.avanzar`; solo las etapas propias | 401 / 403 |
| POST | `/api/v1/etapas/{id}/iniciar`, `/terminar` | `etapas.avanzar` + ser el responsable de la etapa (◐ de la Tabla 7.1 para todos los roles) | 401 / 403 / **404 si la etapa es ajena** / 409 |
| GET | `/api/v1/panel` | `panel.ver` (Administrador, Encargada y Vendedor según la Tabla 7.1) | 401 / 403 / 400 |

Secuencia por solicitud protegida: token válido (401) → sin cambio de clave pendiente (403 `PASSWORD_CHANGE_REQUIRED`) → permiso del rol (403 `FORBIDDEN`, con evento `ACCESO_DENEGADO`) → validación de la entrada (400) → caso de uso.

## 3. Controles implementados

| Control | Implementación | Prueba |
|---|---|---|
| Política de contraseñas | ≥ 12 caracteres (puntos de código), ≤ 128, sin reglas de composición; lista local de claves comprometidas que incluye la clave pública de demo | CP-07 |
| Almacenamiento de claves | Argon2id, m = 19 456 KiB, t = 2, p = 1 (mismos parámetros que el seed) | CP-09, D12 |
| Login sin enumeración | Mismo 401 y mensaje si el usuario no existe, está inactivo, está bloqueado o la clave es incorrecta; siempre se verifica un hash (real o ficticio) | `auth.test.ts` |
| Bloqueo por fuerza bruta | 5 fallos → bloqueo de 15 min en `usuario.bloqueado_hasta`; evento `CUENTA_BLOQUEADA`. El intento se reserva con un `UPDATE` atómico **antes** de verificar la clave, así que ni con solicitudes simultáneas se revisan más de 5 claves por bloqueo, y un acceso correcto que termina después de un bloqueo no lo levanta. Los intentos fallidos de la clave actual en `cambiar-clave` cuentan para el mismo bloqueo | CP-29 |
| Límite de tasa | 10 solicitudes por minuto e IP en `/auth`, 300 en el resto de `/api/v1` (`express-rate-limit`) | CP-29 |
| Token de acceso | JWT HS256 de 10 min con emisor, audiencia y roles; se rechazan firma ajena, `alg: none`, payload alterado, roles desconocidos y token vencido | `tokens-jwt.test.ts` |
| Cambio de clave obligatorio (D12) | Con `debe_cambiar_clave`, el token solo sirve para `POST /auth/cambiar-clave` | `auth.test.ts` |
| RBAC con denegación por defecto | `requierePermiso` en cada ruta protegida; roles desconocidos no otorgan nada | CP-08, CP-28 |
| Validación de entrada | Esquemas zod `.strict()`: rechazan campos no declarados, tipos no primitivos (`{"$ne": null}`) y parámetros repetidos. El nombre de usuario debe cumplir el mismo formato que la base (`^[a-z0-9._-]{3,40}$`); un valor que PostgreSQL rechace como dato inválido (por ejemplo, un byte NUL) responde 400, no 500 | CP-24 |
| Consultas parametrizadas | Todo el SQL usa `$1…$n`; los filtros de MongoDB se arman solo con valores ya validados y `$eq` | CP-24 |
| Errores sin fugas | Manejador central: errores tipados con `{ error: { code, message, details? } }`; los demás, 500 genérico. El detalle va al log del servidor con `X-Request-Id` | `app.test.ts`, CP-24 |
| Cabeceras | Helmet: CSP `default-src 'none'`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, HSTS; sin `X-Powered-By` | `app.test.ts` |
| CORS | Solo el origen de `CORS_ORIGIN` (cliente web) | `app.test.ts` |
| Tamaño del cuerpo | Máximo 100 kB → 413 | `app.test.ts` |
| Control de propiedad (IDOR, AM-05) | Iniciar o terminar exige `etapa.responsable_id = usuario del token`. Una etapa ajena responde el mismo 404 que una inexistente (no revela que existe), no cambia nada y registra `ACCESO_DENEGADO` con motivo `NO_ES_RESPONSABLE`. En las rutas de etapas, los id mal formados también responden 404; en `/ordenes/{id}` responden 400 por validación (CP-24, D22) | CP-27 |
| Concurrencia en etapas | La transacción bloquea la fila de la OT y luego la de la etapa (`FOR UPDATE`, siempre en ese orden) y compara la `version` enviada por el cliente: dos "terminar" simultáneos dan un 200 y un 409, y la siguiente etapa se habilita una sola vez. El trigger de la base vuelve a validar la transición | CP-19 |
| Bitácora (HU-12) | Eventos `LOGIN_EXITOSO`, `LOGIN_FALLIDO`, `CUENTA_BLOQUEADA`, `CLAVE_CAMBIADA`, `ACCESO_DENEGADO`, `ORDEN_REGISTRADA`, `ORDEN_ESTADO_CAMBIADO`, `ETAPA_ASIGNADA`, `ETAPA_INICIADA`, `ETAPA_TERMINADA` en `bitacora_eventos`, con IP y `request_id`. Nunca se guardan claves ni tokens | CP-09, CP-11, CP-13, CP-28 |

## 4. Pendiente o fuera del MVP

| Elemento | Estado | Riesgo y mitigación |
|---|---|---|
| Token de refresco en cookie con rotación (D2) | Se construye al final (§4.2 del roadmap, paso 5). Hoy la sesión dura lo que dura el token de acceso: 10 min | Si no llega al congelamiento, CP-26 y CP-30 se excluyen |
| `POST /auth/logout` | Depende del token de refresco (D2) | Sin refresco, cerrar sesión es descartar el token en el cliente |
| MFA para Administrador y Encargada | Fuera del MVP (§1.2) | Política de claves, bloqueo y cambio de clave obligatorio del `admin` |
| WAF y HTTPS | Fuera del entorno local | Se describen en el plan de nube del Informe 3 |
| Lista de claves comprometidas | Lista local corta | En producción, un corpus de claves filtradas |
| Límite de tasa detrás de un proxy | `trust proxy` desactivado: correcto en local, pero detrás de Cloudflare todos los clientes compartirían el límite | Configurar `trust proxy` en el despliegue |
| Tokens emitidos antes de un cambio de rol o una desactivación | Siguen vigentes hasta su vencimiento (10 min). §7.3 acepta ese plazo para roles, pero pide cerrar la sesión al desactivar | Se resuelve con la revocación de sesiones de D2; el MVP no tiene ruta para desactivar cuentas |
| `fechaCompromiso` sin tope superior | Se acepta cualquier fecha futura válida (por ejemplo `9999-12-31`) | Sin impacto de seguridad; la Encargada la ve en el panel |
| Asignar un responsable recién desactivado | La vigencia y el rol del responsable se revisan antes de la transacción; una desactivación en ese intervalo no se detecta | El MVP no tiene ruta para desactivar cuentas |
| Número de OT reutilizado | El código es `MAX + 1` del año: si se borra la última OT, su número se repite | No hay ruta para borrar OT; solo la limpieza de pruebas las borra |
| `npm start` sin `NODE_ENV=production` | Desde `8bd1dac` el modo producción lo declara el entorno. Si se arranca con el `.env` de ejemplo y sin `NODE_ENV`, la API solo advierte del `JWT_SECRET` de ejemplo y firma con un secreto público (hallazgo R1-001 de la revisión de F3) | El `docker-compose.yml` de F6 debe fijar `NODE_ENV=production` en el servicio `api`, con una prueba que lo verifique |
| Bitácora secuencial con MongoDB caído | Iniciar la primera etapa o terminar la última escribe dos eventos uno tras otro; con MongoDB caído la respuesta puede tardar unos 10 s (D15) | Se acepta en el MVP; el outbox con relay lo resolvería |
| Escaneo del año bajo el candado del código de OT | `MAX(...)` sobre los códigos del año se calcula dentro del candado por año; con mucho volumen, los registros simultáneos esperan en fila | Se mide junto con CP-23 en F7; alternativa: una secuencia por año |
| Nombre de usuario tecleado en `LOGIN_FALLIDO` | Se guarda para auditar intentos; si alguien escribe su clave en ese campo, queda en la bitácora | El formato del nombre (sin espacios, 3–40 caracteres) reduce el caso; la bitácora solo la lee el Administrador |
