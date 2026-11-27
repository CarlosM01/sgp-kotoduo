import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { hoy } from '../src/compartido/formato';
import { renderEn, sesionDe, simularFetch } from './apoyo';

const PLANTILLAS = {
  datos: [
    {
      id: 2,
      nombre: 'Letrero publicitario',
      descripcion: null,
      horasTotales: 9,
      etapas: [
        { id: 7, secuencia: 1, nombre: 'Diseño', areaId: 1, area: 'Diseño', instrucciones: '', duracionEstimadaHoras: 4, esEtapaDiseno: true, insumos: [] },
        { id: 8, secuencia: 2, nombre: 'Impresión', areaId: 2, area: 'Impresión gran formato', instrucciones: '', duracionEstimadaHoras: 5, esEtapaDiseno: false, insumos: [] },
      ],
    },
  ],
};

const ID_ORDEN = '11111111-2222-3333-4444-555555555555';

function detalle(version = 3) {
  return {
    id: ID_ORDEN,
    codigo: 'OT-2026-0042',
    titulo: 'Letrero feria',
    tipoTrabajo: 'Letrero publicitario',
    tipoTrabajoId: 2,
    referenciaCliente: 'Junta de Vecinos',
    cantidad: 1,
    prioridad: 'NORMAL',
    estado: 'REGISTRADA',
    fechaCompromiso: '2026-12-10',
    fechaEstimadaTermino: '2026-11-27',
    creadoEn: '2026-11-25T13:00:00.000Z',
    descripcion: null,
    especificaciones: { detalle: 'Lona 2 × 1 m' },
    creadoPor: { id: 'u-v', nombreCompleto: 'Vendedor Demo' },
    terminadaEn: null,
    etapas: [
      {
        id: 'e-1', secuencia: 1, nombre: 'Diseño', area: 'Diseño', instrucciones: '', estado: 'DISPONIBLE', responsable: null,
        duracionEstimadaHoras: 4, esEtapaDiseno: true, version, iniciadaEn: null, terminadaEn: null, requerimientos: [],
      },
    ],
  };
}

describe('flow 2: new order (HU-05, CU-04)', () => {
  it('shows the stages of the chosen template and sends the validated body; the summary links to the saved order', async () => {
    sesionDe(['VENDEDOR']);
    const fetch = simularFetch((url, init) => {
      if (url.endsWith('/plantillas')) return { status: 200, body: PLANTILLAS };
      if (url.endsWith('/ordenes') && init?.method === 'POST') {
        return { status: 201, body: { id: ID_ORDEN, codigo: 'OT-2026-0042', estado: 'REGISTRADA', fechaEstimadaTermino: '2026-11-27', etapas: 2 } };
      }
      throw new Error(url);
    });
    renderEn('/ordenes/nueva');

    await userEvent.selectOptions(await screen.findByLabelText('Tipo de trabajo'), '2');
    expect(screen.getByRole('heading', { name: 'Se generarán 2 etapas' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Título'), 'Letrero feria');
    await userEvent.type(screen.getByLabelText('Cliente (institución)'), 'Junta de Vecinos');
    await userEvent.type(screen.getByLabelText('Fecha comprometida'), '2026-12-10');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar orden' }));

    expect(await screen.findByRole('status')).toHaveTextContent('OT-2026-0042 registrada con 2 etapas.');
    expect(screen.getByRole('link', { name: 'Ver la orden' })).toHaveAttribute('href', `/ordenes/${ID_ORDEN}`);
    const post = fetch.mock.calls.find(([, i]) => i?.method === 'POST')!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({
      tipoTrabajoId: 2, titulo: 'Letrero feria', referenciaCliente: 'Junta de Vecinos', cantidad: 1, prioridad: 'NORMAL', especificaciones: {}, fechaCompromiso: '2026-12-10',
    });
  });

  it('invalid fields are marked and nothing is sent', async () => {
    sesionDe(['VENDEDOR']);
    const fetch = simularFetch((url) => (url.endsWith('/plantillas') ? { status: 200, body: PLANTILLAS } : { status: 500 }));
    renderEn('/ordenes/nueva');

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar orden' }));

    expect(screen.getByLabelText('Tipo de trabajo')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Escribe un título de 3 a 120 caracteres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha comprometida')).toHaveAttribute('min', hoy());
    expect(fetch.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });
});

describe('flow 2: order detail and assignment (HU-08 partial, CU-12)', () => {
  it('the Encargada assigns a responsible person with the stage version and sees the saved data again', async () => {
    sesionDe(['ENCARGADA_PRODUCCION']);
    let asignado = false;
    const fetch = simularFetch((url, init) => {
      if (url.endsWith('/responsables')) return { status: 200, body: { datos: [{ id: 'u-op', nombreCompleto: 'Operario Demo', roles: ['OPERARIO'] }] } };
      if (url.includes('/bitacora')) return { status: 200, body: { datos: [] } };
      if (init?.method === 'PATCH') {
        asignado = true;
        return { status: 200, body: { etapaId: 'e-1', responsableId: 'u-op', version: 4 } };
      }
      const d = detalle(asignado ? 4 : 3);
      if (asignado) d.etapas[0]!.responsable = { id: 'u-op', nombreCompleto: 'Operario Demo' } as never;
      return { status: 200, body: d };
    });
    renderEn(`/ordenes/${ID_ORDEN}`);

    const select = await screen.findByLabelText('Responsable de Diseño');
    await screen.findByRole('option', { name: 'Operario Demo' });
    await userEvent.selectOptions(select, 'u-op');
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Diseño: responsable Operario Demo asignado.');
    const patch = fetch.mock.calls.find(([, i]) => i?.method === 'PATCH')!;
    expect(patch[0]).toBe('/api/v1/etapas/e-1/responsable');
    expect(JSON.parse(patch[1]!.body as string)).toEqual({ responsableId: 'u-op', version: 3 });
    const recorrido = screen.getByRole('region', { name: 'Recorrido del trabajo' });
    expect(await within(recorrido).findByText(/Operario Demo/, { selector: '.meta' })).toBeInTheDocument();
  });

  it('a stale version (409) shows the API message and reloads the order', async () => {
    sesionDe(['ENCARGADA_PRODUCCION']);
    let lecturas = 0;
    simularFetch((url, init) => {
      if (url.endsWith('/responsables')) return { status: 200, body: { datos: [{ id: 'u-op', nombreCompleto: 'Operario Demo', roles: ['OPERARIO'] }] } };
      if (url.includes('/bitacora')) return { status: 200, body: { datos: [] } };
      if (init?.method === 'PATCH') {
        return { status: 409, body: { error: { code: 'CONFLICT', message: 'La etapa fue modificada por otra persona; recargue e intente de nuevo' } } };
      }
      lecturas += 1;
      return { status: 200, body: detalle() };
    });
    renderEn(`/ordenes/${ID_ORDEN}`);

    const select = await screen.findByLabelText('Responsable de Diseño');
    await screen.findByRole('option', { name: 'Operario Demo' });
    await userEvent.selectOptions(select, 'u-op');
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La etapa fue modificada por otra persona');
    expect(lecturas).toBe(2);
  });

  it('the Vendedor sees the order read only: no assignment and no history', async () => {
    sesionDe(['VENDEDOR']);
    const fetch = simularFetch(() => ({ status: 200, body: detalle() }));
    renderEn(`/ordenes/${ID_ORDEN}`);

    expect(await screen.findByRole('heading', { name: 'Letrero feria' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Responsable de Diseño')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Historial de la orden' })).not.toBeInTheDocument();
    expect(fetch.mock.calls.map(([u]) => u)).toEqual([`/api/v1/ordenes/${ID_ORDEN}`]);
  });
});
