// Central error handling (ES2 Table 7.3, pattern 7): expected errors become
// typed responses; unexpected ones become a generic 500. Technical details
// (stack, SQL, versions) only go to the server log, tagged with the request id.
import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ErrorAplicacion } from '../../aplicacion/errores.js';

export const asignarRequestId: RequestHandler = (_req, res, next) => {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

export const noEncontrado: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
};

const RESPUESTAS_BODY_PARSER: Record<string, { status: number; code: string; message: string }> = {
  'entity.parse.failed': { status: 400, code: 'INVALID_JSON', message: 'El cuerpo de la solicitud no es JSON válido' },
  'entity.too.large': { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo de la solicitud es demasiado grande' },
  'encoding.unsupported': { status: 415, code: 'UNSUPPORTED_ENCODING', message: 'Codificación no soportada' },
};

// PostgreSQL integrity violations: CHECK, FOREIGN KEY, UNIQUE, NOT NULL.
const CODIGOS_INTEGRIDAD_PG = new Set(['23514', '23503', '23505', '23502']);
// PostgreSQL rejected the value itself (NUL byte, invalid text for the type): defense in depth
// for inputs a schema let through.
const CODIGOS_DATO_INVALIDO_PG = new Set(['22021', '22P02']);

function campo(err: unknown, nombre: string): unknown {
  return typeof err === 'object' && err !== null ? (err as Record<string, unknown>)[nombre] : undefined;
}

export function crearManejadorErrores(log: Pick<Console, 'error' | 'warn'> = console): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    const requestId = res.locals.requestId as string | undefined;

    if (err instanceof ErrorAplicacion) {
      const error: Record<string, unknown> = { code: err.codigo, message: err.mensajePublico };
      if (err.detalles?.length) error.details = err.detalles;
      res.status(err.status).json({ error });
      return;
    }

    const tipo = campo(err, 'type');
    const parser = typeof tipo === 'string' ? RESPUESTAS_BODY_PARSER[tipo] : undefined;
    if (parser) {
      res.status(parser.status).json({ error: { code: parser.code, message: parser.message } });
      return;
    }

    const pgCode = campo(err, 'code');
    if (typeof pgCode === 'string' && CODIGOS_DATO_INVALIDO_PG.has(pgCode)) {
      log.warn({ msg: 'invalid value rejected by the database', requestId, pgCode });
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Los datos enviados no son válidos' } });
      return;
    }

    if (typeof pgCode === 'string' && CODIGOS_INTEGRIDAD_PG.has(pgCode)) {
      log.warn({ msg: 'integrity violation', requestId, pgCode });
      res.status(409).json({ error: { code: 'CONFLICT', message: 'La operación no es válida en el estado actual' } });
      return;
    }

    log.error({ msg: 'unhandled error', requestId, err });
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Error interno' } });
  };
}
