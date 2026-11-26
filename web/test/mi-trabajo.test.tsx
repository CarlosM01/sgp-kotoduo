import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderEn, sesionDe, simularFetch } from './apoyo';

function etapa(estado: string, version = 5) {
  return {
    id: 'e-2',
    secuencia: 2,
    nombre: 'Impresión de transfer',
    area: 'Impresión gran formato',
    instrucciones: 'Imprimir con el perfil de color validado.',
    estado,
    version,
    duracionEstimadaHoras: 3,
    iniciadaEn: null,
    orden: { id: 'o-1', codigo: 'OT-2026-0001', titulo: 'Camisetas sublimadas', prioridad: 'NORMAL', estado: 'EN_PRODUCCION', fechaCompromiso: '2026-12-01' },
    requerimientos: [
      { insumoId: 3, codigo: 'PAP-SUB', nombre: 'Papel sublimación', unidad: 'ROLLO', cantidadRequerida: 0.6, cantidadConsumida: 0 },
      { insumoId: 4, codigo: 'TIN-CY', nombre: 'Tinta cian', unidad: 'L', cantidadRequerida: 0.3, cantidadConsumida: 0 },
    ],
  };
}

const miTrabajo = (e: ReturnType<typeof etapa> | null, otras: ReturnType<typeof etapa>[] = []) => ({ siguiente: e, etapas: e ? [e, ...otras] : otras });

describe('flow 3: Mi Trabajo (HU-01, HU-02)', () => {
  it('starts the available stage with its version and then offers to finish it', async () => {
    sesionDe(['OPERARIO']);
    let iniciada = false;
    const fetch = simularFetch((url, init) => {
      if (init?.method === 'POST') {
        iniciada = true;
        return { status: 200, body: { etapaId: 'e-2', estado: 'EN_CURSO', version: 6, estadoOrden: 'EN_PRODUCCION' } };
      }
      return { status: 200, body: miTrabajo(etapa(iniciada ? 'EN_CURSO' : 'DISPONIBLE', iniciada ? 6 : 5)) };
    });
    renderEn('/mi-trabajo');

    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar etapa' }));

    expect(await screen.findByRole('button', { name: 'Terminar etapa' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Iniciaste «Impresión de transfer».');
    const post = fetch.mock.calls.find(([, i]) => i?.method === 'POST')!;
    expect(post[0]).toBe('/api/v1/etapas/e-2/iniciar');
    expect(JSON.parse(post[1]!.body as string)).toEqual({ version: 5 });
  });

  it('finishing sends only the quantities typed (comma decimals) and reports the next stage and the low stock', async () => {
    sesionDe(['OPERARIO']);
    const fetch = simularFetch((url, init) => {
      if (init?.method === 'POST') {
        return {
          status: 200,
          body: {
            etapaId: 'e-2', estado: 'TERMINADA', version: 7, siguienteEtapa: 'Sublimado', area: 'Sublimación', ordenTerminada: false,
            consumos: [{ insumoId: 3, codigo: 'PAP-SUB', cantidad: 0.5, stockActual: 1, bajoMinimo: true }],
            alertas: [{ id: 9, insumoId: 3, codigo: 'PAP-SUB' }],
          },
        };
      }
      return { status: 200, body: miTrabajo(etapa('EN_CURSO')) };
    });
    renderEn('/mi-trabajo');

    await userEvent.click(await screen.findByRole('button', { name: 'Terminar etapa' }));
    const dialogo = screen.getByRole('dialog', { name: 'Terminar etapa' });
    const papel = within(dialogo).getByLabelText('Papel sublimación (rollo)');
    expect(papel).toHaveValue('0,60');
    await userEvent.clear(papel);
    await userEvent.type(papel, '0,5');
    await userEvent.clear(within(dialogo).getByLabelText('Tinta cian (l)'));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Terminar' }));

    expect(await screen.findByText('Listo. Sigue: Sublimado — área Sublimación.')).toBeInTheDocument();
    expect(screen.getByText('El stock de PAP-SUB quedó en el mínimo o bajo él.')).toBeInTheDocument();
    const post = fetch.mock.calls.find(([, i]) => i?.method === 'POST')!;
    expect(post[0]).toBe('/api/v1/etapas/e-2/terminar');
    expect(JSON.parse(post[1]!.body as string)).toEqual({ version: 5, consumos: [{ insumoId: 3, cantidad: 0.5 }] });
  });

  it('a quantity with more than two decimals is marked and nothing is sent', async () => {
    sesionDe(['OPERARIO']);
    const fetch = simularFetch(() => ({ status: 200, body: miTrabajo(etapa('EN_CURSO')) }));
    renderEn('/mi-trabajo');

    await userEvent.click(await screen.findByRole('button', { name: 'Terminar etapa' }));
    const dialogo = screen.getByRole('dialog', { name: 'Terminar etapa' });
    const papel = within(dialogo).getByLabelText('Papel sublimación (rollo)');
    await userEvent.clear(papel);
    await userEvent.type(papel, '0,125');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Terminar' }));

    expect(papel).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialogo).getByText('Escribe una cantidad con hasta 2 decimales, por ejemplo 0,60.')).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('a conflict (not enough stock, stale version) closes the dialog, shows the API message and reloads', async () => {
    sesionDe(['OPERARIO']);
    let lecturas = 0;
    simularFetch((url, init) => {
      if (init?.method === 'POST') return { status: 409, body: { error: { code: 'CONFLICT', message: 'Stock insuficiente de PAP-SUB: quedan 0,20' } } };
      lecturas += 1;
      return { status: 200, body: miTrabajo(etapa('EN_CURSO')) };
    });
    renderEn('/mi-trabajo');

    await userEvent.click(await screen.findByRole('button', { name: 'Terminar etapa' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Terminar etapa' })).getByRole('button', { name: 'Terminar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Stock insuficiente de PAP-SUB: quedan 0,20');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(lecturas).toBe(2);
  });

  it('reports a missing supply of the stage (HU-03, CP-15)', async () => {
    sesionDe(['OPERARIO']);
    const fetch = simularFetch((url, init) => {
      if (init?.method === 'POST') return { status: 201, body: { id: 12, insumoId: 4, etapaId: 'e-2', origen: 'MANUAL', estado: 'ABIERTA', creadaEn: '2026-11-25T13:00:00Z' } };
      return { status: 200, body: miTrabajo(etapa('EN_CURSO')) };
    });
    renderEn('/mi-trabajo');

    await userEvent.click(await screen.findByRole('button', { name: 'Reportar faltante' }));
    const dialogo = screen.getByRole('dialog', { name: 'Reportar faltante' });
    await userEvent.selectOptions(within(dialogo).getByLabelText('Insumo'), '4');
    await userEvent.type(within(dialogo).getByLabelText('¿Cuánto falta? (opcional)'), '0,5');
    await userEvent.type(within(dialogo).getByLabelText('Comentario (opcional)'), 'No alcanza para las 30');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Enviar aviso' }));

    expect(await screen.findByText('Faltante de Tinta cian informado a la Encargada de Producción.')).toBeInTheDocument();
    const post = fetch.mock.calls.find(([, i]) => i?.method === 'POST')!;
    expect(post[0]).toBe('/api/v1/alertas');
    expect(JSON.parse(post[1]!.body as string)).toEqual({ insumoId: 4, etapaId: 'e-2', comentario: 'No alcanza para las 30', cantidadFaltante: 0.5 });
  });

  it('without assigned stages shows the empty state', async () => {
    sesionDe(['OPERARIO']);
    simularFetch(() => ({ status: 200, body: miTrabajo(null) }));
    renderEn('/mi-trabajo');
    expect(await screen.findByText('No tienes etapas pendientes')).toBeInTheDocument();
  });
});

describe('flow 3: panel (HU-10, CU-10)', () => {
  const panel = (filtro: string) => ({
    datos: [
      {
        id: 'o-1', codigo: 'OT-2026-0002', titulo: 'Polerones', tipoTrabajo: 'Uniforme', estado: 'EN_PRODUCCION', prioridad: 'URGENTE',
        fechaCompromiso: '2026-11-14', fechaEstimadaTermino: '2026-11-20', etapaActual: 'Bordado', areaActual: 'Confección',
        responsableActual: 'Operario Demo', porcentajeAvance: 60, enRiesgo: true, atrasada: filtro !== 'en_riesgo',
      },
    ],
    total: 1, pagina: 1, tamano: 20,
    resumen: { activas: 5, atrasadas: 2, enRiesgo: 1, alertasAbiertas: 3 },
  });

  it('indicators show the counts and filter the list through the API', async () => {
    sesionDe(['ENCARGADA_PRODUCCION']);
    const fetch = simularFetch((url) => ({ status: 200, body: panel(new URL(url, 'http://x').searchParams.get('filtro')!) }));
    renderEn('/panel');

    const atrasadas = await screen.findByRole('button', { name: /Atrasadas/ });
    expect(atrasadas).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /En curso/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /Alertas de insumo/ })).toHaveAttribute('href', '/insumos');

    await userEvent.click(atrasadas);

    expect(await screen.findByRole('heading', { name: 'Órdenes atrasadas' })).toBeInTheDocument();
    expect(fetch.mock.calls.at(-1)![0]).toContain('filtro=atrasadas');
    const fila = screen.getByRole('row', { name: /OT-2026-0002/ });
    expect(fila).toHaveTextContent('60 %');
    expect(fila).toHaveTextContent('Atrasada');
    expect(fila).toHaveTextContent('Urgente');
  });

  it('the Vendedor sees the supply alerts count but cannot open supplies', async () => {
    sesionDe(['VENDEDOR']);
    simularFetch(() => ({ status: 200, body: panel('activas') }));
    renderEn('/panel');

    expect(await screen.findByText('Alertas de insumo')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Alertas de insumo/ })).not.toBeInTheDocument();
    expect(screen.getByText('La Encargada de Producción ya fue avisada.')).toBeInTheDocument();
  });
});
