// HTTP client of the API. Every call goes to the same origin (/api/v1, proxied
// to the API), sends the session token and turns error responses into ErrorApi
// with the public message of the API (ES2 Table 7.3: no internal details).
import { cerrarSesion, sesionActual } from './sesion';

export interface DetalleCampo {
  campo: string;
  problema: string;
}

export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
    readonly detalles: readonly DetalleCampo[] = [],
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

const SIN_CONEXION = 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.';

function mensajePorEstado(status: number): string {
  if (status >= 500) return 'El servidor tuvo un problema. Intenta de nuevo en un momento.';
  return 'No se pudo completar la solicitud.';
}

interface Opciones {
  metodo?: 'GET' | 'POST' | 'PATCH';
  cuerpo?: unknown;
  senal?: AbortSignal;
}

export async function api<T>(ruta: string, { metodo = 'GET', cuerpo, senal }: Opciones = {}): Promise<T> {
  const sesion = sesionActual();
  const cabeceras: Record<string, string> = { Accept: 'application/json' };
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (sesion) cabeceras.Authorization = `Bearer ${sesion.accessToken}`;

  let res: Response;
  try {
    res = await fetch(`/api/v1${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? null : JSON.stringify(cuerpo),
      signal: senal ?? null,
      credentials: 'same-origin',
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ErrorApi(0, 'NETWORK', SIN_CONEXION);
  }

  const datos: unknown = await res.json().catch(() => null);
  if (res.ok) return datos as T;

  const error = (datos as { error?: { code?: string; message?: string; details?: DetalleCampo[] } } | null)?.error;
  // An expired or revoked token: the session is over (the login keeps its own 401 message).
  if (res.status === 401 && sesion) cerrarSesion('expirada');
  throw new ErrorApi(res.status, error?.code ?? `HTTP_${res.status}`, error?.message ?? mensajePorEstado(res.status), error?.details ?? []);
}

/** Message to show for any error thrown while calling the API. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorApi) return e.message;
  return 'Ocurrió un error inesperado. Intenta de nuevo.';
}
