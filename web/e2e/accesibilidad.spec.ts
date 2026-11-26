// CP-36 (RNF-01, desirable): automated accessibility of the 8 MVP screens with
// @axe-core/playwright, WCAG 2.0/2.1/2.2 A and AA rules, at 1280×800 and
// 360×800. Expected (ES2): 0 violations with impact "serious" or "critical".
// Every violation is printed (rule, impact, nodes) so the run is evidence even
// when it fails. Read only: it creates no data.
// Run against the compose stack with E2E_BASE_URL=http://localhost:8080.
// CP36_ADMIN: an Administrador user with the demo password that does not have
// to change it (the seed admin does, D12); without it the audit log is skipped.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

const CLAVE_DEMO = 'kotoduo demo local 2026';
const ADMIN = process.env.CP36_ADMIN;
const ORDEN_DEMO = '10000000-0000-0000-0000-000000000001';
const ETIQUETAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const GRAVES = new Set(['serious', 'critical']);
const VIEWPORTS = [
  { nombre: '1280x800', width: 1280, height: 800 },
  { nombre: '360x800', width: 360, height: 800 },
] as const;

interface Pantalla {
  id: string;
  ruta: string;
  usuario: string | null;
  listo: (page: Page) => Promise<void>;
}

const encabezado = (texto: string | RegExp) => async (page: Page) => {
  await expect(page.getByRole('heading', { level: 1, name: texto }).first()).toBeVisible();
};

const PANTALLAS: Pantalla[] = [
  { id: 'P-01_ingresar', ruta: '/ingresar', usuario: null, listo: async (p) => expect(p.getByRole('button', { name: 'Ingresar' })).toBeVisible() },
  { id: 'P-06_panel', ruta: '/panel', usuario: 'encargada', listo: encabezado(/Panel/) },
  { id: 'P-04a_ordenes', ruta: '/ordenes', usuario: 'encargada', listo: encabezado(/Órdenes/) },
  { id: 'P-04_ordenes-nueva', ruta: '/ordenes/nueva', usuario: 'encargada', listo: encabezado(/Nueva orden/i) },
  { id: 'P-03_detalle-orden', ruta: `/ordenes/${ORDEN_DEMO}`, usuario: 'encargada', listo: async (p) => expect(p.getByRole('heading', { level: 1 })).toBeVisible() },
  { id: 'P-08_insumos', ruta: '/insumos', usuario: 'encargada', listo: encabezado('Insumos') },
  { id: 'P-02_mi-trabajo', ruta: '/mi-trabajo', usuario: 'operario', listo: encabezado(/^Hola, /) },
  { id: 'P-10_bitacora', ruta: '/bitacora', usuario: ADMIN ?? '', listo: encabezado(/Bitácora/i) },
];

async function sesion(browser: Browser, usuario: string | null): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  if (usuario) {
    await page.goto('/ingresar');
    await page.getByLabel('Usuario').fill(usuario);
    await page.getByLabel('Contraseña').fill(CLAVE_DEMO);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).not.toHaveURL(/\/ingresar/);
  }
  return page;
}

test('CP-36: the 8 MVP screens have no serious or critical WCAG A/AA violations', async ({ browser }) => {
  // One login per role: /auth allows 10 requests per minute per IP (CP-29).
  const paginas = new Map<string, Page>();
  const graves: string[] = [];
  let analizadas = 0;

  for (const pantalla of PANTALLAS) {
    if (pantalla.usuario === '') {
      console.log(`${pantalla.id}: OMITIDA (sin CP36_ADMIN)`);
      continue;
    }
    const clave = pantalla.usuario ?? '(sin sesión)';
    if (!paginas.has(clave)) paginas.set(clave, await sesion(browser, pantalla.usuario));
    const page = paginas.get(clave)!;

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(pantalla.ruta);
      await pantalla.listo(page);
      await page.waitForLoadState('networkidle');

      const { violations, passes } = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
      analizadas += 1;
      console.log(`${pantalla.id.padEnd(20)} ${vp.nombre.padEnd(9)} reglas OK=${passes.length} violaciones=${violations.length}`);
      for (const v of violations) {
        const objetivos = v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ');
        console.log(`  - [${v.impact}] ${v.id} (${v.nodes.length} nodos): ${v.help} → ${objetivos}`);
        if (v.impact && GRAVES.has(v.impact)) graves.push(`${pantalla.id} ${vp.nombre} ${v.id}`);
      }
    }
  }
  console.log(`analizadas=${analizadas} graves=${graves.length} ${JSON.stringify(graves)}`);
  expect(graves).toEqual([]);
});
