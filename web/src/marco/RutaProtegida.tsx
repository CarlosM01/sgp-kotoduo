// Route guard (UX only; the API authorizes every request). Without a session
// → login; with a pending forced password change (D12) → change it first;
// a role without the screen → "No tienes acceso" (ES2 prototype guard).
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { cargoDe, cumple, inicioDe, type Regla } from '../compartido/acceso';
import { Icono } from '../compartido/iconos';
import { useSesion, type SesionCliente } from '../compartido/sesion';
import { useTitulo } from '../compartido/ui';
import { Marco } from './Marco';

export function RutaProtegida({
  regla,
  titulo,
  volver,
  children,
}: {
  regla: Regla;
  titulo: string;
  volver?: string;
  children: (sesion: SesionCliente) => ReactNode;
}) {
  const sesion = useSesion();
  const ubicacion = useLocation();

  if (!sesion) return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />;
  if (sesion.debeCambiarClave) return <Navigate to="/cambiar-clave" replace />;

  return (
    <Marco sesion={sesion} titulo={titulo} volver={volver}>
      {cumple(sesion.usuario.roles, regla) ? children(sesion) : <SinAcceso sesion={sesion} />}
    </Marco>
  );
}

function SinAcceso({ sesion }: { sesion: SesionCliente }) {
  useTitulo('Sin acceso');
  const inicio = inicioDe(sesion.usuario.roles);
  return (
    <div className="estado-vacio">
      <Icono nombre="candado" clase="grande" />
      <strong>No tienes acceso a esta pantalla</strong>
      <p>Tu rol ({cargoDe(sesion.usuario.roles)}) no incluye esta sección.</p>
      {inicio !== '/sin-acceso' ? (
        <Link className="btn" to={inicio}>
          Ir a mi inicio
        </Link>
      ) : null}
    </div>
  );
}
