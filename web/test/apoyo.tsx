import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { Rutas } from '../src/app/App';
import type { CodigoRol } from '../src/compartido/contrato';
import { iniciarSesion } from '../src/compartido/sesion';

export function sesionDe(roles: CodigoRol[], opciones: { debeCambiarClave?: boolean } = {}) {
  iniciarSesion({
    accessToken: 'a.b.c',
    tokenType: 'Bearer',
    expiraEn: new Date(Date.now() + 600_000).toISOString(),
    debeCambiarClave: opciones.debeCambiarClave ?? false,
    usuario: { id: 'u-1', nombreUsuario: 'prueba', nombreCompleto: 'Persona Prueba', roles },
  });
}

export function renderEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Rutas />
    </MemoryRouter>,
  );
}

type Respuesta = { status: number; body?: unknown };

/** Replaces fetch: each call takes the next answer (or the one for its path). */
export function simularFetch(respuestas: Respuesta[] | ((url: string, init?: RequestInit) => Respuesta)) {
  const cola = Array.isArray(respuestas) ? [...respuestas] : null;
  const espia = vi.fn(async (url: string, init?: RequestInit) => {
    const r = cola ? cola.shift() : (respuestas as (u: string, i?: RequestInit) => Respuesta)(url, init);
    if (!r) throw new Error(`unexpected fetch ${url}`);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', espia);
  return espia;
}
