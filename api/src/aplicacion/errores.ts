// Expected, typed errors. The HTTP error handler turns them into uniform JSON
// responses; anything else becomes a generic 500 without internal details.

export interface DetalleValidacion {
  campo: string;
  problema: string;
}

export class ErrorAplicacion extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    readonly mensajePublico: string,
    readonly detalles?: readonly DetalleValidacion[],
  ) {
    super(mensajePublico);
    this.name = new.target.name;
  }
}

export class ErrorValidacion extends ErrorAplicacion {
  constructor(mensaje = 'Los datos enviados no son válidos', detalles?: readonly DetalleValidacion[]) {
    super(400, 'VALIDATION_ERROR', mensaje, detalles);
  }
}

export class ErrorNoAutenticado extends ErrorAplicacion {
  constructor() {
    super(401, 'UNAUTHENTICATED', 'Debe iniciar sesión');
  }
}

/** Same message whether the user exists, is locked or the password is wrong. */
export class ErrorCredenciales extends ErrorAplicacion {
  constructor() {
    super(401, 'INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos');
  }
}

export class ErrorProhibido extends ErrorAplicacion {
  constructor() {
    super(403, 'FORBIDDEN', 'No tiene permiso para realizar esta acción');
  }
}

export class ErrorCambioClaveRequerido extends ErrorAplicacion {
  constructor() {
    super(403, 'PASSWORD_CHANGE_REQUIRED', 'Debe cambiar su contraseña antes de continuar');
  }
}

export class ErrorNoEncontrado extends ErrorAplicacion {
  constructor() {
    super(404, 'NOT_FOUND', 'Recurso no encontrado');
  }
}

export class ErrorDemasiadasSolicitudes extends ErrorAplicacion {
  constructor() {
    super(429, 'TOO_MANY_REQUESTS', 'Demasiadas solicitudes; intente de nuevo en un minuto');
  }
}

export class ErrorConflicto extends ErrorAplicacion {
  constructor(mensaje = 'La operación no es válida en el estado actual') {
    super(409, 'CONFLICT', mensaje);
  }
}
