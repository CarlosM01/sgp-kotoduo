// Building blocks shared by the screens: notices, loading/empty/error states,
// modal dialogs and data loading. They render the ES2 prototype classes.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { mensajeDeError } from './api';
import { Icono, type IconoNombre } from './iconos';

const ICONO_AVISO = { exito: 'check', alerta: 'alerta', adv: 'alerta', info: 'flecha' } as const satisfies Record<string, IconoNombre>;

export function Aviso({
  tipo,
  titulo,
  children,
  icono,
  rol,
}: {
  tipo: keyof typeof ICONO_AVISO;
  titulo: ReactNode;
  children?: ReactNode;
  icono?: IconoNombre;
  rol?: 'status' | 'alert';
}) {
  return (
    <div className={`aviso ${tipo}`} role={rol}>
      <Icono nombre={icono ?? ICONO_AVISO[tipo]} />
      <div>
        <p>{titulo}</p>
        {children ? <p className="meta">{children}</p> : null}
      </div>
    </div>
  );
}

export function Cargando({ etiqueta, tarjetas = 2 }: { etiqueta: string; tarjetas?: number }) {
  return (
    <div aria-busy="true" aria-label={etiqueta} role="status">
      <div className="esqueleto linea corta" />
      {Array.from({ length: tarjetas }, (_, i) => (
        <div key={i} className="esqueleto tarjeta" />
      ))}
    </div>
  );
}

export function EstadoVacio({ titulo, children, icono = 'bandeja' }: { titulo: string; children?: ReactNode; icono?: IconoNombre }) {
  return (
    <div className="estado-vacio card">
      <Icono nombre={icono} clase={`grande${icono === 'check' ? ' ok' : ''}`} />
      <strong>{titulo}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function ErrorCarga({ error, alReintentar }: { error: unknown; alReintentar: () => void }) {
  return (
    <div>
      <Aviso tipo="alerta" rol="alert" icono="sinred" titulo={mensajeDeError(error)} />
      <button className="btn secundario bloque" type="button" onClick={alReintentar}>
        <Icono nombre="reintentar" />
        Reintentar
      </button>
    </div>
  );
}

export type Carga<T> =
  | { estado: 'cargando'; datos?: T }
  | { estado: 'listo'; datos: T }
  | { estado: 'error'; error: unknown; datos?: T };

/** Loads data when `clave` changes; `recargar` repeats the request and keeps the data on screen meanwhile. */
export function useCarga<T>(cargar: (senal: AbortSignal) => Promise<T>, clave: string): Carga<T> & { recargar: () => void } {
  const [vuelta, setVuelta] = useState(0);
  const llave = `${clave}#${vuelta}`;
  // Result of the last finished request and the key it answered; a different
  // key means a request is in flight (the last data stays on screen meanwhile).
  const [resultado, setResultado] = useState<{ llave: string; ok: boolean; datos?: T; error?: unknown } | null>(null);
  const cargarRef = useRef(cargar);
  useEffect(() => {
    cargarRef.current = cargar;
  });

  useEffect(() => {
    const control = new AbortController();
    cargarRef
      .current(control.signal)
      .then((datos) => {
        if (!control.signal.aborted) setResultado({ llave, ok: true, datos });
      })
      .catch((error: unknown) => {
        if (!control.signal.aborted) setResultado((r) => ({ llave, ok: false, error, ...(r?.datos !== undefined ? { datos: r.datos } : {}) }));
      });
    return () => control.abort();
  }, [llave]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  const previos = resultado?.datos !== undefined ? { datos: resultado.datos } : {};
  if (!resultado || resultado.llave !== llave) return { estado: 'cargando', ...previos, recargar };
  if (resultado.ok) return { estado: 'listo', datos: resultado.datos as T, recargar };
  return { estado: 'error', error: resultado.error, ...previos, recargar };
}

export function useTitulo(titulo: string): void {
  useEffect(() => {
    document.title = `${titulo} · SGP`;
  }, [titulo]);
}

/**
 * Modal dialog on the native <dialog> (focus trap, Esc to cancel, focus returns
 * to the opener). `alConfirmar` runs on submit; the dialog closes only when it resolves to true.
 */
export function Dialogo({
  abierto,
  titulo,
  children,
  textoConfirmar,
  iconoConfirmar,
  peligro,
  ocupado,
  alConfirmar,
  alCerrar,
}: {
  abierto: boolean;
  titulo: string;
  children: ReactNode;
  textoConfirmar: string;
  iconoConfirmar?: IconoNombre;
  peligro?: boolean;
  ocupado?: boolean;
  alConfirmar: () => void;
  alCerrar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal?.();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!ocupado) alCerrar();
      }}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!ocupado) alConfirmar();
        }}
      >
        <h2 id={id}>{titulo}</h2>
        {children}
        <div className="acciones">
          <button className="btn secundario" type="button" onClick={alCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button className={`btn${peligro ? ' peligro' : ''}`} type="submit" disabled={ocupado} aria-busy={ocupado || undefined}>
            {iconoConfirmar ? <Icono nombre={iconoConfirmar} /> : null}
            {ocupado ? 'Enviando…' : textoConfirmar}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Field error linked to its input with aria-describedby (empty = hidden by the CSS). */
export function ErrorCampo({ id, mensaje }: { id: string; mensaje?: string | undefined }) {
  return (
    <p id={id} className="error">
      {mensaje ? (
        <>
          <Icono nombre="alerta" clase="chico" />
          {mensaje}
        </>
      ) : null}
    </p>
  );
}
