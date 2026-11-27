// Password policy (ES2 section 7.2; NIST SP 800-63B): minimum length, no
// composition rules, no expiry, and compromised passwords are rejected.

export const CLAVE_LARGO_MINIMO = 12;
export const CLAVE_LARGO_MAXIMO = 128;

// Local list of known compromised or public passwords. In production this
// would be a breached-password corpus; the MVP keeps a short curated list.
// It includes the public demo password of the seed (D9/D12).
const CLAVES_COMPROMETIDAS: ReadonlySet<string> = new Set(
  [
    'contraseña123',
    'contrasena123',
    'contraseña1234',
    'password1234',
    'password12345',
    '123456789012',
    '1234567890123',
    'qwertyuiopas',
    'qwerty123456',
    'abcdefghijkl',
    'aaaaaaaaaaaa',
    'iloveyou1234',
    'administrador',
    'administrador1',
    'bienvenido123',
    'kotoduo12345',
    'kotoduo2026!!',
    'kotoduo demo local 2026',
  ].map(normalizar),
);

function normalizar(clave: string): string {
  return clave.normalize('NFC').trim().toLowerCase();
}

export type ResultadoPoliticaClave =
  | { ok: true }
  | { ok: false; motivo: 'MUY_CORTA' | 'MUY_LARGA' | 'COMPROMETIDA' };

export function validarPoliticaClave(clave: string): ResultadoPoliticaClave {
  // Length is counted in Unicode code points, not UTF-16 units or bytes.
  const largo = [...clave.normalize('NFC')].length;
  if (largo < CLAVE_LARGO_MINIMO) return { ok: false, motivo: 'MUY_CORTA' };
  if (largo > CLAVE_LARGO_MAXIMO) return { ok: false, motivo: 'MUY_LARGA' };
  if (CLAVES_COMPROMETIDAS.has(normalizar(clave))) return { ok: false, motivo: 'COMPROMETIDA' };
  return { ok: true };
}
