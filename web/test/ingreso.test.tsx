import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { sesionActual } from '../src/compartido/sesion';
import { renderEn, sesionDe, simularFetch } from './apoyo';

const sesionApi = (roles: string[], debeCambiarClave = false) => ({
  accessToken: 'x.y.z',
  tokenType: 'Bearer',
  expiraEn: new Date(Date.now() + 600_000).toISOString(),
  debeCambiarClave,
  usuario: { id: 'u-9', nombreUsuario: 'encargada', nombreCompleto: 'Encargada Demo', roles },
});

describe('login (HU-11, CU-01)', () => {
  it('empty fields are reported next to each field and nothing is sent', async () => {
    const fetch = simularFetch([]);
    renderEn('/ingresar');

    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(screen.getByLabelText('Usuario')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Escribe tu usuario.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('wrong credentials show the generic API message and clear the password', async () => {
    simularFetch([{ status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos' } } }]);
    renderEn('/ingresar');

    await userEvent.type(screen.getByLabelText('Usuario'), 'encargada');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'no es la clave');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(sesionActual()).toBeNull();
  });

  it('a successful login opens the home screen of the role', async () => {
    simularFetch((url) =>
      url.endsWith('/auth/login')
        ? { status: 200, body: sesionApi(['ENCARGADA_PRODUCCION']) }
        : { status: 200, body: { datos: [], total: 0, pagina: 1, tamano: 20, resumen: { activas: 0, atrasadas: 0, enRiesgo: 0, alertasAbiertas: 0 } } },
    );
    renderEn('/ingresar');

    await userEvent.type(screen.getByLabelText('Usuario'), ' Encargada ');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'kotoduo demo local 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('heading', { name: 'Panel de producción' })).toBeInTheDocument();
    expect(sesionActual()?.usuario.roles).toEqual(['ENCARGADA_PRODUCCION']);
  });

  it('a pending password change (D12) shows only the change form', async () => {
    simularFetch([{ status: 200, body: sesionApi(['ADMINISTRADOR'], true) }]);
    renderEn('/ingresar');

    await userEvent.type(screen.getByLabelText('Usuario'), 'admin');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'kotoduo demo local 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('heading', { name: 'Cambia tu contraseña' })).toBeInTheDocument();
  });
});

describe('route guard (UX; the API authorizes)', () => {
  it('after "Salir" the next person logs in to their own home, not the previous screen', async () => {
    sesionDe(['ENCARGADA_PRODUCCION']);
    simularFetch((url) => {
      if (url.endsWith('/auth/login')) return { status: 200, body: sesionApi(['OPERARIO']) };
      if (url.endsWith('/mi-trabajo')) return { status: 200, body: { siguiente: null, etapas: [] } };
      return { status: 200, body: { datos: [], total: 0, pagina: 1, tamano: 20, resumen: { activas: 0, atrasadas: 0, enRiesgo: 0, alertasAbiertas: 0 } } };
    });
    renderEn('/panel');

    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    await userEvent.type(await screen.findByLabelText('Usuario'), 'operario');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'kotoduo demo local 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByText('No tienes etapas pendientes')).toBeInTheDocument();
  });

  it('after an expired session the same person returns to the screen they were on', async () => {
    sesionDe(['ENCARGADA_PRODUCCION']);
    simularFetch((url) => {
      if (url.endsWith('/auth/login')) return { status: 200, body: sesionApi(['ENCARGADA_PRODUCCION']) };
      if (url.startsWith('/api/v1/alertas')) return { status: 200, body: { datos: [], total: 0, pagina: 1, tamano: 50 } };
      if (url.endsWith('/insumos')) return { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' } } };
      return { status: 200, body: { datos: [] } };
    });
    renderEn('/insumos');

    expect(await screen.findByText('Tu sesión terminó. Ingresa de nuevo para continuar.')).toBeInTheDocument();
    simularFetch((url) => {
      if (url.endsWith('/auth/login')) return { status: 200, body: sesionApi(['ENCARGADA_PRODUCCION']) };
      if (url.startsWith('/api/v1/alertas')) return { status: 200, body: { datos: [], total: 0, pagina: 1, tamano: 50 } };
      return { status: 200, body: { datos: [] } };
    });
    await userEvent.type(screen.getByLabelText('Usuario'), 'encargada');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'kotoduo demo local 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('heading', { name: 'Insumos' })).toBeInTheDocument();
  });

  it('without a session a protected screen sends to the login', async () => {
    renderEn('/panel');
    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument();
  });

  it('a role without the screen sees "No tienes acceso" and its home link', async () => {
    sesionDe(['OPERARIO']);
    renderEn('/panel');

    expect(await screen.findByText('No tienes acceso a esta pantalla')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a mi inicio' })).toHaveAttribute('href', '/mi-trabajo');
  });

  it('with a pending password change every screen leads to the change form', async () => {
    sesionDe(['ADMINISTRADOR'], { debeCambiarClave: true });
    renderEn('/bitacora');
    expect(await screen.findByRole('heading', { name: 'Cambia tu contraseña' })).toBeInTheDocument();
  });

  it('the new password must match its confirmation before anything is sent', async () => {
    sesionDe(['ADMINISTRADOR'], { debeCambiarClave: true });
    const fetch = simularFetch([]);
    renderEn('/cambiar-clave');

    await userEvent.type(screen.getByLabelText('Contraseña actual'), 'kotoduo demo local 2026');
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'una frase larga y propia');
    await userEvent.type(screen.getByLabelText('Repite la nueva contraseña'), 'otra frase distinta');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
