# Manual de usuario — SGP-Kotoduo (MVP)

Guía breve de lo que hace cada rol en la interfaz. Para instalar el sistema, vea el [README](../README.md).

## Para todos

**Ingresar.** Abra `http://localhost:8080`, escriba su usuario y contraseña y pulse **Ingresar**. Cada rol llega a su pantalla de inicio.

**Cambiar la contraseña.** Si el sistema lo pide (por ejemplo, el primer ingreso de `admin`), aparece **Cambia tu contraseña**: escriba la actual y dos veces la nueva. La nueva debe tener al menos 12 caracteres y ser distinta de la actual. Hasta cambiarla, no se puede usar el resto del sistema.

**Navegar.** En computador el menú está a la izquierda, y en el celular es una barra inferior. Cada rol ve solo las pantallas que puede usar. Si abre la dirección de una que no le corresponde, aparece **Sin acceso** con un enlace a su inicio, y la API rechaza igualmente la operación.

**Sesión.** La sesión dura 10 minutos y se cierra al cerrar la pestaña. Al vencer, el sistema pide ingresar de nuevo. Para salir antes, pulse **Salir** (arriba a la derecha).

## Vendedor

Pantalla de inicio: **Órdenes**.

| Tarea | Cómo |
|---|---|
| Buscar una orden | En **Órdenes**, escriba el código (`OT-2026-0001`) o parte del título y pulse **Buscar** |
| Registrar una orden | **Nueva orden** → elija el **Tipo de trabajo**. A la derecha aparecen las etapas que se generarán (por ejemplo, "Se generarán 6 etapas"). Complete título, cliente (solo la institución, sin teléfonos ni correos), cantidad, prioridad, especificaciones y fecha comprometida, y pulse **Registrar orden**. Los campos con error se marcan con su mensaje y no se envía nada hasta corregirlos |
| Revisar la orden registrada | Tras registrarla, pulse **Ver la orden**: muestra los datos, las etapas y el historial |
| Ver el avance general | **Panel**: órdenes en curso, atrasadas y en riesgo |

## Encargada de Producción

Pantalla de inicio: **Panel**.

| Tarea | Cómo |
|---|---|
| Ver cómo va la producción | **Panel**: las tarjetas **En curso**, **Atrasadas**, **En riesgo** y **Alertas de insumo** filtran la tabla. **Buscar orden** acepta código o título. **Actualizar** recarga los datos |
| Asignar responsables | Abra una orden desde **Órdenes** o desde el panel. En cada etapa use **Asignar responsable…**, elija a la persona y pulse **Asignar**. El historial de la orden registra cada asignación. Si otra persona cambió la etapa al mismo tiempo, el sistema avisa y recarga los datos |
| Registrar una orden | Igual que el Vendedor, desde **Órdenes → Nueva orden** |
| Revisar insumos | **Insumos**: la tabla **Stock** muestra stock y mínimo de cada insumo. **Alertas** lista las automáticas (el stock quedó en el mínimo o bajo él) y los faltantes reportados por los operarios, con la orden afectada |
| Trabajar una etapa propia | **Mi Trabajo**, igual que el Operario |

## Operario y Diseñador

Pantalla de inicio: **Mi Trabajo**.

| Tarea | Cómo |
|---|---|
| Ver qué hacer | **Ahora te toca** muestra la siguiente etapa, con sus instrucciones y los insumos que usa. Debajo están las próximas. Si no tiene etapas asignadas, la pantalla lo indica |
| Empezar una etapa | Pulse **Iniciar etapa** |
| Terminar una etapa | Pulse **Terminar etapa**. El diálogo trae precargadas las cantidades requeridas de cada insumo: ajústelas a lo que realmente usó y pulse **Terminar**. Si un insumo queda en su mínimo o bajo él, se crea una alerta automática para la Encargada. Al terminar la última etapa, la orden se cierra |
| Avisar un faltante | En **¿Algo no va bien?**, pulse **Reportar faltante**, elija el insumo, indique cuánto falta (opcional) y un comentario (opcional), y pulse **Enviar aviso**. La Encargada lo ve en **Insumos** |

Solo el responsable asignado puede iniciar o terminar su etapa.

## Administrador

Pantalla de inicio: **Panel**. Tiene todo lo de la Encargada y además:

| Tarea | Cómo |
|---|---|
| Revisar la bitácora de auditoría | **Bitácora**: lista los eventos (ingresos, accesos denegados, órdenes registradas, asignaciones, etapas, alertas) con fecha, usuario y detalle. Se filtra por **Tipo de evento** y por orden, usuario o detalle. **Actualizar** trae los últimos |

En el MVP la gestión de usuarios no tiene pantalla: los usuarios vienen del seed (vea las exclusiones en el roadmap, §1.2).
