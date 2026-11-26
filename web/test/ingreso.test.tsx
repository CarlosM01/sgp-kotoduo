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
