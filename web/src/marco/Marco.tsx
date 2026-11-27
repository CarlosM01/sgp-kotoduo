// App shell (ES2 Fig. 5.1–5.3): top bar with back link, title and user;
// role navigation as a bottom bar on mobile and a sidebar on desktop.
import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { cargoDe, DESTINOS, inicioDe, navegacionDe } from '../compartido/acceso';
import { Icono } from '../compartido/iconos';
import { cerrarSesion, type SesionCliente } from '../compartido/sesion';

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function Marco({
  sesion,
  titulo,
  volver,
  children,
}: {
  sesion: SesionCliente;
  titulo: string;
  /** Path of the "Volver" link (levels 2 and 3). */
  volver?: string | undefined;
  children: ReactNode;
}) {
  const navegar = useNavigate();
  const { usuario } = sesion;
  const inicio = inicioDe(usuario.roles);

  useEffect(() => {
    document.body.className = 'app';
  }, []);

  return (
    <>
      <header className="topbar">
        <Link className="marca" to={inicio}>
          <Icono nombre="capas" />
          SGP
        </Link>
        {volver ? (
          <Link className="volver" to={volver}>
            <Icono nombre="volver" />
            Volver
          </Link>
        ) : null}
        <span className="titulo">{titulo}</span>
        {/* The name is text (visually hidden on phones, see estilos.css), not an
            aria-label: a <span> without a role cannot carry one (DEF-03). */}
        <span className="usuario">
          <span className="nombre">
            {usuario.nombreCompleto}
            <small>{cargoDe(usuario.roles)}</small>
          </span>
          <span className="avatar" aria-hidden="true">
            {iniciales(usuario.nombreCompleto)}
          </span>
        </span>
        <button
          className="salir"
          type="button"
          aria-label="Cerrar sesión"
          onClick={() => {
            cerrarSesion('salida');
            navegar('/ingresar', { replace: true });
          }}
        >
          <Icono nombre="salir" />
          <span className="texto">Salir</span>
        </button>
      </header>
      <nav className="nav" aria-label="Principal">
        {navegacionDe(usuario.roles).map(({ destino, soloEscritorio }) => {
          const d = DESTINOS[destino];
          return (
            <NavLink key={destino} to={d.ruta} end className={soloEscritorio ? 'solo-escritorio' : undefined}>
              <Icono nombre={d.icono} />
              {d.texto}
            </NavLink>
          );
        })}
      </nav>
      <main id="contenido">{children}</main>
    </>
  );
}
