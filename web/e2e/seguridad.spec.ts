// CP-25 (AM-03, adapted to the MVP): stored XSS through the free-text comment
// of a manual supply alert. The Operario stores HTML/script payloads with
// POST /api/v1/alertas on one of their own open stages; the Encargada then
// opens P-08 Insumos in a real browser. Expected: the text is shown literally,
// no dialog fires and no element is injected. Each run adds two identifiable
// alerts (comment prefix "XSS-CP25"). Run against the compose stack with
// E2E_BASE_URL=http://localhost:8080 and E2E_EVIDENCIAS=<folder for the capture>.
import { expect, test, type APIRequestContext } from '@playwright/test';

const CLAVE_DEMO = 'kotoduo demo local 2026';
const EVIDENCIAS = process.env.E2E_EVIDENCIAS ?? '../evidencias';
const ESTADOS_REPORTE = ['DISPONIBLE', 'EN_CURSO', 'BLOQUEADA'];

async function token(request: APIRequestContext, usuario: string): Promise<string> {
  const r = await request.post('/api/v1/auth/login', { data: { nombreUsuario: usuario, clave: CLAVE_DEMO } });
  expect(r.status()).toBe(200);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

test('CP-25: a stored HTML/script comment in a manual alert renders as text for the Encargada', async ({ browser, request }) => {
  const marca = Date.now().toString(36);
  const cargas = [
    `XSS-CP25-${marca} img <img src=x onerror=alert(1)>`,
    `XSS-CP25-${marca} script <script>alert(2)</script>`,
  ];

  await test.step('the Operario stores both payloads on an open stage of their own', async () => {
    const t = await token(request, 'operario');
    const trabajo = (await (await request.get('/api/v1/mi-trabajo', { headers: { Authorization: `Bearer ${t}` } })).json()) as {
      etapas: Array<{ id: string; estado: string; nombre: string; orden: { codigo: string } }>;
    };
    const etapa = trabajo.etapas.find((e) => ESTADOS_REPORTE.includes(e.estado));
    expect(etapa, 'the Operario needs an open stage of their own').toBeTruthy();
    console.log(`etapa usada: ${etapa!.id} (${etapa!.nombre}, ${etapa!.estado}, ${etapa!.orden.codigo})`);
    for (const comentario of cargas) {
      const r = await request.post('/api/v1/alertas', {
        headers: { Authorization: `Bearer ${t}` },
        data: { insumoId: 4, etapaId: etapa!.id, comentario },
      });
      const cuerpo = (await r.json()) as { id?: string | number };
      console.log(`POST /api/v1/alertas -> ${r.status()} id=${cuerpo.id ?? '?'} comentario=${JSON.stringify(comentario)}`);
      expect(r.status()).toBe(201);
    }
  });

  await test.step('the Encargada opens Insumos: literal text, no dialog, no injected element', async () => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const dialogos: string[] = [];
    page.on('dialog', async (d) => {
      dialogos.push(`${d.type()}: ${d.message()}`);
      await d.dismiss();
    });
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(e.message));

    await page.goto('/ingresar');
    await page.getByLabel('Usuario').fill('encargada');
    await page.getByLabel('Contraseña').fill(CLAVE_DEMO);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).not.toHaveURL(/\/ingresar/);
    await page.goto('/insumos');

    for (const comentario of cargas) {
      await expect(page.getByText(`«${comentario}»`, { exact: false })).toBeVisible();
    }
    // Give a possible onerror handler time to fire before checking.
    await page.waitForTimeout(1500);

    const inyectados = await page.evaluate(() => ({
      imgSrcX: document.querySelectorAll('main img[src="x"], img[src="x"]').length,
      scriptsEnMain: document.querySelectorAll('main script').length,
      conOnerror: document.querySelectorAll('[onerror]').length,
    }));
    const tarjeta = page.locator('article.card', { hasText: cargas[0]! }).first();
    const html = await tarjeta.innerHTML();
    console.log(`dialogos=${dialogos.length} ${JSON.stringify(dialogos)}`);
    console.log(`errores de pagina=${errores.length} ${JSON.stringify(errores)}`);
    console.log(`elementos inyectados=${JSON.stringify(inyectados)}`);
    console.log(`innerHTML de la tarjeta (fragmento escapado): ${html.slice(html.indexOf('XSS-CP25'), html.indexOf('XSS-CP25') + 90)}`);

    await tarjeta.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${EVIDENCIAS}/E-23_cp25-xss-alerta.png` });

    expect(dialogos).toEqual([]);
    expect(inyectados).toEqual({ imgSrcX: 0, scriptsEnMain: 0, conOnerror: 0 });
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');

    // Second barrier: even if some markup reached the DOM as HTML, the CSP
    // (script-src 'self', no 'unsafe-inline') must block the inline handler.
    const csp = await page.evaluate(async () => {
      const violaciones: string[] = [];
      document.addEventListener('securitypolicyviolation', (e) => violaciones.push(`${e.violatedDirective} ${e.blockedURI}`));
      const w = window as unknown as { __xss?: number };
      const div = document.createElement('div');
      div.innerHTML = '<img src="x" onerror="window.__xss = 1">';
      document.body.appendChild(div);
      await new Promise((r) => setTimeout(r, 1000));
      div.remove();
      return { ejecutado: w.__xss === 1, violaciones };
    });
    console.log(`barrera CSP (manejador en linea forzado en el DOM): ejecutado=${csp.ejecutado} violaciones=${JSON.stringify(csp.violaciones)}`);
    expect(csp.ejecutado).toBe(false);
    expect(csp.violaciones.length).toBeGreaterThan(0);
  });
});
