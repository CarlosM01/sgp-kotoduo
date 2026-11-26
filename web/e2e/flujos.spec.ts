// The 4 MVP flows from the browser, with the saved data read back (F5 exit
// criterion). Each run creates its own URGENT order (unique title) and takes
// it to the end, so runs do not depend on each other. Screenshots go to
// evidencias/ (E-11 to E-17). Credentials are the local demo seed (db/postgres/02_seed.sql).
import { expect, test, type Browser, type Page } from '@playwright/test';

const CLAVE_DEMO = 'kotoduo demo local 2026';
// E2E_EVIDENCIAS keeps the F5 captures intact when the flows run elsewhere (F6 stack).
const EVIDENCIAS = process.env.E2E_EVIDENCIAS ?? '../evidencias';
// Viewport captures from the top: full-page captures repeat the sticky top bar
// and the fixed navigation in the middle of the image.
async function captura(page: Page, nombre: string, { arriba = true } = {}) {
  if (arriba) await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${EVIDENCIAS}/${nombre}.png` });
}

async function ingresar(browser: Browser, usuario: string, viewport = { width: 1280, height: 1400 }): Promise<Page> {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto('/ingresar');
  await page.getByLabel('Usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill(CLAVE_DEMO);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).not.toHaveURL(/\/ingresar/);
  return page;
}

const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

test('flows 1–4 from the browser: create, assign, advance, panel and supply alert', async ({ browser }) => {
  const titulo = `E2E F5 ${Date.now().toString(36)}`;
  let codigo = '';
  let urlOrden = '';

  await test.step('flow 1 + 2: the Vendedor registers an order and reads it back', async () => {
    const page = await ingresar(browser, 'vendedor');
    await expect(page).toHaveURL(/\/ordenes$/);
    await page.goto('/ordenes/nueva');

    await page.getByRole('button', { name: 'Registrar orden' }).click();
    await expect(page.getByText('Elige el tipo de trabajo.')).toBeVisible();
    await expect(page.getByLabel('Título')).toHaveAttribute('aria-invalid', 'true');
    await captura(page, 'E-11_f5-nueva-ot-validaciones');

    await page.getByLabel('Tipo de trabajo').selectOption({ label: 'Uniforme deportivo sublimado' });
    await expect(page.getByRole('heading', { name: 'Se generarán 6 etapas' })).toBeVisible();
    await page.getByLabel('Título').fill(titulo);
    await page.getByLabel('Cliente (institución)').fill('Club Deportivo Los Aromos');
    await page.getByLabel('Cantidad').fill('30');
    await page.getByLabel('Prioridad').selectOption('URGENTE');
    await page.getByLabel('Especificaciones (tallas, medidas, colores)').fill('S 5 · M 15 · L 10 · azul y blanco');
    await page.getByLabel('Fecha comprometida').fill(hoyChile());
    await page.getByRole('button', { name: 'Registrar orden' }).click();

    const resumen = page.getByRole('status');
    await expect(resumen).toContainText('registrada con 6 etapas');
    codigo = (await resumen.innerText()).match(/OT-\d{4}-\d{4}/)![0];

    await page.getByRole('link', { name: 'Ver la orden' }).click();
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
    await expect(page.getByText('S 5 · M 15 · L 10 · azul y blanco')).toBeVisible();
    await expect(page.getByText(`${codigo} · 30 unidades · Club Deportivo Los Aromos`)).toBeVisible();
    await expect(page.getByText('sin responsable')).toHaveCount(6);
    urlOrden = page.url();
    await captura(page, 'E-12_f5-ot-registrada-detalle');
    await page.context().close();
  });

  await test.step('flow 2: the Encargada assigns every stage and the history records it', async () => {
    const page = await ingresar(browser, 'encargada');
    await page.goto(urlOrden);
    const gestiones = page.locator('.gestion');
    await expect(gestiones).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const g = gestiones.nth(i);
      await g.getByRole('combobox').selectOption({ label: 'Operario Demo' });
      await g.getByRole('button', { name: 'Asignar' }).click();
      await expect(page.getByRole('status')).toContainText('responsable Operario Demo asignado');
      await expect(g.getByRole('button', { name: 'Asignar' })).toBeDisabled();
    }
    await expect(page.getByText('sin responsable')).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Responsable asignado/ })).toHaveCount(6);
    await captura(page, 'E-13_f5-asignacion-historial');
    await page.context().close();
  });

  await test.step('flow 3 + 4: the Operario advances the stages on a 360 px phone; the panel follows', async () => {
    const page = await ingresar(browser, 'operario', { width: 360, height: 740 });
    await expect(page).toHaveURL(/\/mi-trabajo$/);
    const ahora = page.getByRole('region', { name: 'Ahora te toca' });
    await expect(ahora).toContainText(codigo);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await captura(page, 'E-14_f5-mi-trabajo-360px');

    for (let etapa = 1; etapa <= 6; etapa++) {
      await expect(ahora).toContainText(codigo);
      await ahora.getByRole('button', { name: 'Iniciar etapa' }).click();
      await ahora.getByRole('button', { name: 'Terminar etapa' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Terminar etapa' });
      await expect(dialogo).toBeVisible();

      if (etapa === 2) {
        // Prefilled with what the stage requires; the operator confirms it.
        await expect(dialogo.getByLabel(/Papel sublimación/)).toHaveValue('0,60');
        await captura(page, 'E-15_f5-terminar-etapa-consumos', { arriba: false });
      }
      if (etapa === 4) {
        // Corte uses 36 m of fabric: declare a small real use so repeated runs keep stock.
        await dialogo.getByLabel(/Tela dry-fit/).fill('1,00');
      }
      await dialogo.getByRole('button', { name: 'Terminar' }).click();
      await expect(page.getByText(etapa === 6 ? `la orden ${codigo} quedó terminada` : /Listo\. Sigue:/)).toBeVisible();

      if (etapa === 3) {
        // Corte is now available: report a missing supply (manual alert, CP-15).
        await ahora.getByRole('button', { name: 'Reportar faltante' }).click();
        const faltante = page.getByRole('dialog', { name: 'Reportar faltante' });
        await faltante.getByLabel('¿Cuánto falta? (opcional)').fill('5');
        await faltante.getByLabel('Comentario (opcional)').fill(`No alcanza la tela para ${titulo}`);
        await faltante.getByRole('button', { name: 'Enviar aviso' }).click();
        await expect(page.getByText('Faltante de Tela dry-fit blanca informado a la Encargada de Producción.')).toBeVisible();

        const encargada = await ingresar(browser, 'encargada');
        await encargada.goto(`/panel?q=${codigo}`);
        const fila = encargada.getByRole('row', { name: new RegExp(codigo) });
        await expect(fila).toContainText('50 %');
        await expect(fila).toContainText('Corte');
        await expect(fila).toContainText('Operario Demo');
        await captura(encargada, 'E-16_f5-panel-avance');

        await encargada.goto('/insumos');
        const alerta = encargada.getByRole('article').filter({ hasText: titulo });
        await expect(alerta).toContainText('Reportada por Operario Demo');
        await expect(alerta).toContainText('Falta: 5,00 metro');
        await expect(alerta.getByRole('link', { name: codigo })).toBeVisible();
        await captura(encargada, 'E-17_f5-insumos-alerta-manual');
        await encargada.context().close();
      }
    }
    await page.context().close();
  });

  await test.step('the order detail shows the finished order (data read back)', async () => {
    const page = await ingresar(browser, 'vendedor');
    await page.goto(urlOrden);
    await expect(page.getByText('6 de 6 etapas cerradas')).toBeVisible();
    await expect(page.locator('.cabecera')).toContainText('Terminada');
    await page.context().close();
  });
});
