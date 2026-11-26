// Forced password change (D12): while it is pending the API only accepts this
// call, so the client shows nothing else. The policy (CP-07) is checked by the API.
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { inicioDe } from '../compartido/acceso';
import { api, ErrorApi, mensajeDeError } from '../compartido/api';
import type { Sesion } from '../compartido/contrato';
import { Icono } from '../compartido/iconos';
import { cerrarSesion, iniciarSesion, sesionActual, useSesion } from '../compartido/sesion';
import { Aviso, ErrorCampo, useTitulo } from '../compartido/ui';

const MINIMO = 12;

export function CambiarClave() {
  useTitulo('Cambiar contraseña');
  const sesion = useSesion();
  const navegar = useNavigate();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [errores, setErrores] = useState<{ actual?: string; nueva?: string; repetida?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    document.body.className = 'acceso';
  }, []);

  if (!sesion) return <Navigate to="/ingresar" replace />;
  if (!sesion.debeCambiarClave && !enviando) return <Navigate to={inicioDe(sesion.usuario.roles)} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const nuevos: typeof errores = {};
    if (!actual) nuevos.actual = 'Escribe tu contraseña actual.';
    if ([...nueva].length < MINIMO) nuevos.nueva = `La nueva contraseña debe tener al menos ${MINIMO} caracteres.`;
    else if (nueva === actual) nuevos.nueva = 'La nueva contraseña debe ser distinta de la actual.';
    if (repetida !== nueva) nuevos.repetida = 'Las contraseñas no coinciden.';
    setErrores(nuevos);
    setError(null);
    if (Object.keys(nuevos).length) return;

    setEnviando(true);
    try {
      const s = await api<Sesion>('/auth/cambiar-clave', { metodo: 'POST', cuerpo: { claveActual: actual, claveNueva: nueva } });
      iniciarSesion(s);
      navegar(inicioDe(sesionActual()?.usuario.roles ?? []), { replace: true });
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 400 && err.detalles.some((d) => d.campo === 'claveNueva')) {
        setErrores({ nueva: err.message });
      } else {
        setError(mensajeDeError(err));
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="acceso-caja" style={{ padding: 0 }}>
      <div className="marca">
        <Icono nombre="capas" />
        SGP · Gestión productiva
      </div>
      <form className="card" noValidate onSubmit={enviar} aria-labelledby="t-clave">
        <h1 id="t-clave">Cambia tu contraseña</h1>
        <p className="meta">Es tu primer ingreso con una clave entregada por otra persona. Elige una propia para continuar.</p>
        {error ? <Aviso tipo="alerta" rol="alert" titulo={error} /> : null}

        <label htmlFor="actual">Contraseña actual</label>
        <input id="actual" type="password" autoComplete="current-password" maxLength={256} value={actual}
          onChange={(e) => setActual(e.target.value)} aria-invalid={errores.actual ? true : undefined} aria-describedby="actual-error" />
        <ErrorCampo id="actual-error" mensaje={errores.actual} />

        <label htmlFor="nueva">Nueva contraseña</label>
        <input id="nueva" type="password" autoComplete="new-password" maxLength={256} value={nueva}
          onChange={(e) => setNueva(e.target.value)} aria-invalid={errores.nueva ? true : undefined} aria-describedby="nueva-ayuda nueva-error" />
        <p id="nueva-ayuda" className="ayuda">Al menos {MINIMO} caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.</p>
        <ErrorCampo id="nueva-error" mensaje={errores.nueva} />

        <label htmlFor="repetida">Repite la nueva contraseña</label>
        <input id="repetida" type="password" autoComplete="new-password" maxLength={256} value={repetida}
          onChange={(e) => setRepetida(e.target.value)} aria-invalid={errores.repetida ? true : undefined} aria-describedby="repetida-error" />
        <ErrorCampo id="repetida-error" mensaje={errores.repetida} />

        <div className="acciones">
          <button className="btn secundario" type="button" disabled={enviando}
            onClick={() => { cerrarSesion('salida'); navegar('/ingresar', { replace: true }); }}>
            Salir
          </button>
          <button className="btn" type="submit" disabled={enviando} aria-busy={enviando || undefined}>
            {enviando ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </div>
      </form>
    </main>
  );
}
