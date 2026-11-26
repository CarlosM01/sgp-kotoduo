// P-01 /ingresar (HU-11, CU-01 without MFA). Same generic message whether the
// user exists or not (the API decides it); fields are validated before sending.
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { inicioDe } from '../compartido/acceso';
import { api, ErrorApi, mensajeDeError } from '../compartido/api';
import type { Sesion } from '../compartido/contrato';
import { Icono } from '../compartido/iconos';
import { iniciarSesion, sesionActual, tomarMotivoCierre, useSesion } from '../compartido/sesion';
import { Aviso, ErrorCampo, useTitulo } from '../compartido/ui';

const USUARIO_VALIDO = /^[a-z0-9._-]{3,40}$/;

export function Ingresar() {
  useTitulo('Ingresar');
  const sesion = useSesion();
  const navegar = useNavigate();
  const desde = (useLocation().state as { desde?: string } | null)?.desde;
  const [motivo] = useState(tomarMotivoCierre);
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [errores, setErrores] = useState<{ usuario?: string; clave?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    document.body.className = 'acceso';
  }, []);

  if (sesion && !enviando) {
    return <Navigate to={sesion.debeCambiarClave ? '/cambiar-clave' : (desde ?? inicioDe(sesion.usuario.roles))} replace />;
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const nombre = usuario.trim().toLowerCase();
    const nuevos: typeof errores = {};
    if (!nombre) nuevos.usuario = 'Escribe tu usuario.';
    else if (!USUARIO_VALIDO.test(nombre)) nuevos.usuario = 'El usuario tiene de 3 a 40 letras minúsculas, números, punto, guion o guion bajo.';
    if (!clave) nuevos.clave = 'Escribe tu contraseña.';
    setErrores(nuevos);
    setError(null);
    if (nuevos.usuario || nuevos.clave) return;

    setEnviando(true);
    try {
      const s = await api<Sesion>('/auth/login', { metodo: 'POST', cuerpo: { nombreUsuario: nombre, clave } });
      iniciarSesion(s);
      navegar(s.debeCambiarClave ? '/cambiar-clave' : (desde ?? inicioDe(sesionActual()?.usuario.roles ?? [])), { replace: true });
    } catch (err) {
      setClave('');
      setError(err instanceof ErrorApi && err.status === 400 ? 'Revisa el usuario y la contraseña.' : mensajeDeError(err));
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
      <form className="card" noValidate onSubmit={enviar} aria-labelledby="t-ingresar">
        <h1 id="t-ingresar">Ingresar</h1>
        <p className="meta">Usa la cuenta que te entregó tu encargada o el administrador.</p>
        {motivo === 'expirada' ? <Aviso tipo="info" rol="status" icono="reloj" titulo="Tu sesión terminó. Ingresa de nuevo para continuar." /> : null}
        {error ? <Aviso tipo="alerta" rol="alert" titulo={error} /> : null}

        <label htmlFor="usuario">Usuario</label>
        <input
          id="usuario"
          name="usuario"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={40}
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          aria-invalid={errores.usuario ? true : undefined}
          aria-describedby="usuario-error"
        />
        <ErrorCampo id="usuario-error" mensaje={errores.usuario} />

        <label htmlFor="clave">Contraseña</label>
        <input
          id="clave"
          name="clave"
          type="password"
          autoComplete="current-password"
          maxLength={256}
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          aria-invalid={errores.clave ? true : undefined}
          aria-describedby="clave-error"
        />
        <ErrorCampo id="clave-error" mensaje={errores.clave} />

        <div className="acciones una">
          <button className="btn bloque grande" type="submit" disabled={enviando} aria-busy={enviando || undefined}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </div>
        <p className="ayuda">¿Olvidaste tu contraseña? Pide una clave temporal a la Encargada de Producción o al Administrador.</p>
      </form>
    </main>
  );
}
