import { describe, expect, it, vi } from 'vitest';
import { api, ErrorApi } from '../src/compartido/api';
import { sesionActual, tomarMotivoCierre } from '../src/compartido/sesion';
import { sesionDe, simularFetch } from './apoyo';

describe('API client', () => {
  it('sends the session token to the same-origin API and returns the JSON body', async () => {
    sesionDe(['OPERARIO']);
    const fetch = simularFetch([{ status: 200, body: { siguiente: null, etapas: [] } }]);

    const datos = await api('/mi-trabajo');

    expect(datos).toEqual({ siguiente: null, etapas: [] });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/v1/mi-trabajo');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer a.b.c');
  });

  it('an error answer becomes ErrorApi with the public message, code and field details', async () => {
    simularFetch([
      { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Los datos enviados no son válidos', details: [{ campo: 'titulo', problema: 'too_small' }] } } },
    ]);

    const error = await api('/ordenes', { metodo: 'POST', cuerpo: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({ status: 400, codigo: 'VALIDATION_ERROR', message: 'Los datos enviados no son válidos' });
    expect((error as ErrorApi).detalles).toEqual([{ campo: 'titulo', problema: 'too_small' }]);
  });

  it('a 401 with a session ends it (expired or revoked token)', async () => {
    sesionDe(['OPERARIO']);
    simularFetch([{ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' } } }]);

    await expect(api('/mi-trabajo')).rejects.toMatchObject({ status: 401 });

    expect(sesionActual()).toBeNull();
    expect(tomarMotivoCierre()).toBe('expirada');
  });

  it('a network failure gives a readable message, never the technical error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(api('/panel')).rejects.toMatchObject({ status: 0, message: expect.stringContaining('No pudimos conectar') });
  });

  it('a 500 without body gives a generic message', async () => {
    simularFetch([{ status: 500 }]);
    await expect(api('/panel')).rejects.toMatchObject({ status: 500, message: expect.stringContaining('El servidor tuvo un problema') });
  });
});
