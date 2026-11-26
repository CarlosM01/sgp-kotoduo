// Routes of the MVP (8 screens of ES2 + forced password change). Each
// protected route declares the same access rule the API applies to its data.
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';
import { CambiarClave } from '../acceso/CambiarClave';
import { Ingresar } from '../acceso/Ingresar';
import { inicioDe, REGLAS } from '../compartido/acceso';
import { SpriteIconos } from '../compartido/iconos';
import { useSesion } from '../compartido/sesion';
import { useTitulo } from '../compartido/ui';
import { RutaProtegida } from '../marco/RutaProtegida';
import { DetalleOrden } from '../ordenes/DetalleOrden';
import { ListaOrdenes } from '../ordenes/ListaOrdenes';
import { NuevaOrden } from '../ordenes/NuevaOrden';

function Inicio() {
  const sesion = useSesion();
  return <Navigate to={sesion ? inicioDe(sesion.usuario.roles) : '/ingresar'} replace />;
}

function NoEncontrada() {
  useTitulo('Página no encontrada');
  return (
    <div className="estado-vacio">
      <strong>Esta página no existe</strong>
      <p>Revisa la dirección o vuelve a tu inicio.</p>
      <Link className="btn" to="/">
        Ir a mi inicio
      </Link>
    </div>
  );
}

export function Rutas() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/ingresar" element={<Ingresar />} />
      <Route path="/cambiar-clave" element={<CambiarClave />} />
      <Route
        path="/ordenes"
        element={<RutaProtegida regla={REGLAS.ordenes} titulo="Órdenes">{(s) => <ListaOrdenes sesion={s} />}</RutaProtegida>}
      />
      <Route
        path="/ordenes/nueva"
        element={<RutaProtegida regla={REGLAS.nueva} titulo="Nueva orden" volver="/ordenes">{() => <NuevaOrden />}</RutaProtegida>}
      />
      <Route
        path="/ordenes/:id"
        element={<RutaProtegida regla={REGLAS.ordenes} titulo="Detalle de orden" volver="/ordenes">{(s) => <DetalleOrden sesion={s} />}</RutaProtegida>}
      />
      <Route
        path="*"
        element={
          <RutaProtegida regla={REGLAS['mi-trabajo']} titulo="SGP">
            {() => <NoEncontrada />}
          </RutaProtegida>
        }
      />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SpriteIconos />
      <Rutas />
    </BrowserRouter>
  );
}
