import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderEn, sesionDe, simularFetch } from './apoyo';

const STOCK = {
  datos: [
    { id: 3, codigo: 'PAP-SUB', nombre: 'Papel sublimación', unidad: 'ROLLO', stockActual: 1, stockMinimo: 2, alertasAbiertas: 1, bajoMinimo: true },
    { id: 5, codigo: 'HIL-BL', nombre: 'Hilo blanco', unidad: 'UNIDAD', stockActual: 0, stockMinimo: 4, alertasAbiertas: 0, bajoMinimo: true },
    { id: 6, codigo: 'TEL-DRY', nombre: 'Tela dry-fit', unidad: 'METRO', stockActual: 120, stockMinimo: 40, alertasAbiertas: 0, bajoMinimo: false },
  ],
};

const alerta = (estado: string) => ({
  id: 7, origen: 'MANUAL', estado, cantidadFaltante: 0.5,
  comentario: '<img src=x onerror=alert(1)> falta hilo',
  insumo: { id: 5, codigo: 'HIL-BL', nombre: 'Hilo blanco', unidad: 'UNIDAD' },
  etapa: { id: 'e-5', nombre: 'Confección' }, orden: { id: 'o-4', codigo: 'OT-2026-0004' },
  reportadaPor: { id: 'u-op', nombreCompleto: 'Operario Demo' }, creadaEn: '2026-11-25T13:00:00Z', cerradaEn: null,
});

describe('flow 4: supplies and alerts (HU-09, HU-03)', () => {
  it('shows open alerts with who reported them and the stock state of each supply', async () => {
    sesionDe(['ENCARGADA_PRODUCCION']);
    const fetch = simularFetch((url) => (url.startsWith('/api/v1/alertas') ? { status: 200, body: { datos: [alerta('ABIERTA')], total: 1, pagina: 1, tamano: 50 } } : { status: 200, body: STOCK }));
    const { container } = renderEn('/insumos');

    expect(await screen.findByRole('heading', { name: 'Hilo blanco' })).toBeInTheDocument();
    expect(screen.getByText(/Reportada por Operario Demo/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'OT-2026-0004' })).toHaveAttribute('href', '/ordenes/o-4');
    expect(screen.getByRole('row', { name: /PAP-SUB/ })).toHaveTextContent('Bajo mínimo');
    expect(screen.getByRole('row', { name: /HIL-BL/ })).toHaveTextContent('Sin stock');
    expect(screen.getByRole('row', { name: /TEL-DRY/ })).toHaveTextContent('Suficiente');
    expect(fetch.mock.calls.map(([u]) => u)).toContain('/api/v1/alertas?estado=abiertas&tamano=50');
    // CP-25: the reporter's text is shown as text, never interpreted as HTML.
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)> falta hilo/)).toBeInTheDocument();
  });

  it('the filter asks the API for closed alerts', async () => {
    sesionDe(['ENCARGADA_PRODUCCION']);
    const fetch = simularFetch((url) => (url.startsWith('/api/v1/alertas') ? { status: 200, body: { datos: [], total: 0, pagina: 1, tamano: 50 } } : { status: 200, body: STOCK }));
    renderEn('/insumos');

    expect(await screen.findByText('No hay alertas abiertas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerradas' }));

    expect(await screen.findByText('No hay alertas para mostrar')).toBeInTheDocument();
    expect(fetch.mock.calls.map(([u]) => u)).toContain('/api/v1/alertas?estado=cerradas&tamano=50');
  });
});

describe('audit log (HU-12, CU-11)', () => {
  const EVENTOS = {
    datos: [
      { id: 'evt-3', ts: '2026-11-25T13:10:00Z', tipo: 'ETAPA_ASIGNADA', agregado: { tipo: 'etapa_orden', id: 'e-1' }, ordenId: 'o-1', actor: { usuarioId: 'u-enc', roles: ['ENCARGADA_PRODUCCION'] }, payload: { etapa: 'Corte', responsable_nuevo: 'u-op' } },
      { id: 'evt-2', ts: '2026-11-25T13:05:00Z', tipo: 'ORDEN_REGISTRADA', agregado: { tipo: 'orden_trabajo', id: 'o-1' }, ordenId: 'o-1', actor: { usuarioId: 'u-ven', roles: ['VENDEDOR'] }, payload: { codigo: 'OT-2026-0009', etapas: 6 } },
      { id: 'evt-1', ts: '2026-11-25T13:00:00Z', tipo: 'LOGIN_FALLIDO', agregado: { tipo: 'usuario', id: 'desconocido' }, ordenId: null, actor: { usuarioId: null, roles: [] }, payload: { nombre_usuario: 'nadie', motivo: 'NO_EXISTE' } },
    ],
  };

  it('the Administrador reads the events in plain language and narrows them on screen', async () => {
    sesionDe(['ADMINISTRADOR']);
    simularFetch((url) =>
      url.startsWith('/api/v1/bitacora')
        ? { status: 200, body: EVENTOS }
        : { status: 200, body: { datos: [{ id: 'u-op', nombreCompleto: 'Operario Demo', roles: ['OPERARIO'] }, { id: 'u-enc', nombreCompleto: 'Encargada Demo', roles: ['ENCARGADA_PRODUCCION'] }] } },
    );
    renderEn('/bitacora');

    const asignacion = await screen.findByRole('row', { name: /Responsable asignado/ });
    expect(asignacion).toHaveTextContent('Encargada Demo');
    expect(asignacion).toHaveTextContent('Corte → Operario Demo');
    expect(screen.getByRole('row', { name: /Orden registrada/ })).toHaveTextContent('OT-2026-0009 · 6 etapas');
    expect(screen.getByRole('row', { name: /Ingreso fallido/ })).toHaveTextContent('Sistema');

    await userEvent.type(screen.getByLabelText('Orden, usuario o detalle'), 'OT-2026-0009');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await userEvent.clear(screen.getByLabelText('Orden, usuario o detalle'));
    await userEvent.selectOptions(screen.getByLabelText('Tipo de evento'), 'Accesos');
    expect(screen.getByText('1 de 3 eventos')).toBeInTheDocument();
  });

  it('the Encargada has no full log screen (she reads it per order)', async () => {
    sesionDe(['ENCARGADA_PRODUCCION']);
    const fetch = simularFetch([]);
    renderEn('/bitacora');
    expect(await screen.findByText('No tienes acceso a esta pantalla')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
