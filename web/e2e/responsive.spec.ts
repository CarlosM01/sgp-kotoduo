// CP-34 (RNF-02, desirable): the 8 MVP screens at 360×800 (phone) and
// 1280×800 (desktop). For each one: no horizontal scroll
// (document.documentElement.scrollWidth <= innerWidth), where the role
// navigation sits (bottom bar under 600 px, sidebar from 1024 px) and a
// viewport capture. Read only: it creates no data.
// Run against the compose stack with E2E_BASE_URL=http://localhost:8080.
// E2E_EVIDENCIAS: folder for the captures. CP34_ADMIN: an Administrador user
// with the demo password that does not have to change it (the seed admin does,
// D12); without it the audit log screen is skipped.
import { expect, test, type Browser, type Page } from '@playwright/test';

const CLAVE_DEMO = 'kotoduo demo local 2026';
const EVIDENCIAS = process.env.E2E_EVIDENCIAS ?? '../evidencias/E-25_cp34-responsive';
const ADMIN = process.env.CP34_ADMIN;
const ORDEN_DEMO = '10000000-0000-0000-0000-000000000001';
const VIEWPORTS = [
  { nombre: '360x800', width: 360, height: 800 },
  { nombre: '1280x800', width: 1280, height: 800 },
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

test('CP-34: the 8 MVP screens have no horizontal scroll at 360×800 and 1280×800', async ({ browser }) => {
  const paginas = new Map<string, Page>();
  const filas: string[] = [];
  const desbordes: string[] = [];

  for (const pantalla of PANTALLAS) {
    if (pantalla.usuario === '') {
      console.log(`${pantalla.id}: OMITIDA (sin CP34_ADMIN)`);
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
      await page.evaluate(() => window.scrollTo(0, 0));

      const m = await page.evaluate(() => {
        const nav = document.querySelector('nav.nav');
        const r = nav?.getBoundingClientRect();
        let posicion = 'sin navegación';
        if (r && r.width > 0) {
          if (r.top >= window.innerHeight / 2 && r.width >= window.innerWidth * 0.9) posicion = 'inferior';
          else if (r.left <= 1 && r.width < window.innerWidth / 2 && r.height > window.innerHeight / 2) posicion = 'lateral';
          else posicion = `otra (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)})`;
        }
        const anchos = Array.from(document.querySelectorAll('body *'))
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${(el as HTMLElement).className || ''}`.slice(0, 60));
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          bodyScrollWidth: document.body.scrollWidth,
          posicion,
          fueraDeVista: anchos,
        };
      });
      const ok = m.scrollWidth <= m.innerWidth;
      const fila = `${pantalla.id.padEnd(20)} ${vp.nombre.padEnd(9)} scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth} body=${m.bodyScrollWidth} ` +
        `navegación=${m.posicion} ${ok ? 'OK' : 'DESBORDE'}${m.fueraDeVista.length ? ` fuera=${JSON.stringify(m.fueraDeVista)}` : ''}`;
      console.log(fila);
      filas.push(fila);
      if (!ok) desbordes.push(`${pantalla.id} ${vp.nombre}`);
      await page.screenshot({ path: `${EVIDENCIAS}/${pantalla.id}_${vp.nombre}.png` });
    }
  }
  console.log(`total=${filas.length} desbordes=${desbordes.length} ${JSON.stringify(desbordes)}`);
  expect(desbordes).toEqual([]);
});
