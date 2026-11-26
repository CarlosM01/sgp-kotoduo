// Single-stroke SVG icons of the ES2 prototype (24×24, 2 px stroke), served as
// one sprite. The shapes are constants of this file, never user data.
const ICONOS = {
  trabajo: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  caja: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  lista: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  panel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  capas: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  bitacora: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  volver: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  candado: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  lapiz: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  camion: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L18.3 9.38a1 1 0 0 0-.78-.38H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  sinred: '<path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M12 20h.01"/>',
  bandeja: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  reintentar: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  circulo: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>',
  disponible: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
  flecha: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  sube: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  omitir: '<path d="m5 4 10 8-10 8zM19 5v14"/>',
} as const;

export type IconoNombre = keyof typeof ICONOS;

const SPRITE = Object.entries(ICONOS)
  .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
  .join('');

export function SpriteIconos() {
  return <svg xmlns="http://www.w3.org/2000/svg" style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: SPRITE }} />;
}

export function Icono({ nombre, clase }: { nombre: IconoNombre; clase?: string }) {
  return (
    <svg className={`i${clase ? ` ${clase}` : ''}`} aria-hidden="true">
      <use href={`#i-${nombre}`} />
    </svg>
  );
}
