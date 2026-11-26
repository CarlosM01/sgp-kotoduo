// Client session (D27): the access token lives in sessionStorage, scoped to
// the tab and gone when it closes. It is used only to call the API; the API
// re-checks every permission (the client only hides what a role cannot do).
import { useSyncExternalStore } from 'react';
import type { CodigoRol, Sesion } from './contrato';
import { esCodigoRol } from '@dominio/permisos.js';

export interface SesionCliente {
  accessToken: string;
  expiraEn: string;
  debeCambiarClave: boolean;
  usuario: { id: string; nombreUsuario: string; nombreCompleto: string; roles: CodigoRol[] };
}

/** Why the last session ended, shown once on the login screen. */
export type MotivoCierre = 'salida' | 'expirada';

const CLAVE = 'sgp.sesion';
type Oyente = () => void;

let actual: SesionCliente | null = leerAlmacenada();
let motivo: MotivoCierre | null = null;
const oyentes = new Set<Oyente>();
let temporizador: ReturnType<typeof setTimeout> | undefined;

function leerAlmacenada(): SesionCliente | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (!crudo) return null;
    const s = JSON.parse(crudo) as SesionCliente;
    return vigente(s) ? s : null;
  } catch {
    return null;
  }
}

function vigente(s: SesionCliente): boolean {
  return typeof s.accessToken === 'string' && Date.parse(s.expiraEn) > Date.now();
}

function notificar(): void {
  for (const o of oyentes) o();
}

function programarExpiracion(): void {
  clearTimeout(temporizador);
  if (!actual) return;
  // setTimeout accepts at most ~24.8 days; tokens last minutes (D14).
  const ms = Math.min(Date.parse(actual.expiraEn) - Date.now(), 2_147_483_647);
  temporizador = setTimeout(() => cerrarSesion('expirada'), Math.max(ms, 0));
}

export function iniciarSesion(s: Sesion): void {
  actual = {
    accessToken: s.accessToken,
    expiraEn: s.expiraEn,
    debeCambiarClave: s.debeCambiarClave,
    usuario: { ...s.usuario, roles: s.usuario.roles.filter(esCodigoRol) },
  };
  motivo = null;
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(actual));
  } catch {
    // Without storage the session still works until the page reloads.
  }
  programarExpiracion();
  notificar();
}

export function cerrarSesion(porque: MotivoCierre): void {
  if (!actual) return;
  actual = null;
  motivo = porque;
  clearTimeout(temporizador);
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    // Nothing stored.
  }
  notificar();
}

export function sesionActual(): SesionCliente | null {
  if (actual && !vigente(actual)) cerrarSesion('expirada');
  return actual;
}

/** Returns and forgets the reason of the last close. */
export function tomarMotivoCierre(): MotivoCierre | null {
  const m = motivo;
  motivo = null;
  return m;
}

function suscribir(o: Oyente): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

export function useSesion(): SesionCliente | null {
  return useSyncExternalStore(suscribir, () => actual);
}

programarExpiracion();
