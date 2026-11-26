// P-04a /ordenes (HU-05, CU-04): search and filter, the data comes from the API page by page.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { puede } from '../compartido/acceso';
import { api } from '../compartido/api';
import type { EstadoOrden, OrdenResumen, Pagina } from '../compartido/contrato';
import { ChipOrden, ChipPrioridad, ESTADO_ORDEN } from '../compartido/estados';
import { fecha } from '../compartido/formato';
import { Icono } from '../compartido/iconos';
import type { SesionCliente } from '../compartido/sesion';
import { Cargando, ErrorCarga, EstadoVacio, useCarga, useTitulo } from '../compartido/ui';

const TAMANO = 20;

export function ListaOrdenes({ sesion }: { sesion: SesionCliente }) {
  useTitulo('Órdenes');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const estado = params.get('estado') ?? '';
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);
  const [texto, setTexto] = useState(q);

  const consulta = new URLSearchParams({ pagina: String(pagina), tamano: String(TAMANO) });
  if (q) consulta.set('q', q);
  if (estado) consulta.set('estado', estado);
  const carga = useCarga((senal) => api<Pagina<OrdenResumen>>(`/ordenes?${consulta}`, { senal }), consulta.toString());

  function cambiar(cambios: Record<string, string>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('pagina' in cambios)) p.delete('pagina');
    setParams(p, { replace: true });
  }

  const datos = carga.datos;
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / TAMANO)) : 1;

  return (
    <>
      <header className="cabecera fila">
        <div>
          <h1>Órdenes de trabajo</h1>
          <p className="meta" aria-live="polite">
            {datos ? `${datos.total} ${datos.total === 1 ? 'orden' : 'órdenes'}${q || estado ? ' con estos filtros' : ''}` : 'Cargando órdenes…'}
          </p>
        </div>
        {puede(sesion.usuario.roles, 'ordenes.crear') ? (
          <Link className="btn" to="/ordenes/nueva">
            <Icono nombre="mas" />
            Nueva orden
          </Link>
        ) : null}
      </header>

      <form
        className="filtros"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          cambiar({ q: texto.trim() });
        }}
      >
        <div>
          <label htmlFor="q">Buscar</label>
          <input id="q" type="search" placeholder="Código de OT o título" maxLength={60} value={texto}
            onChange={(e) => setTexto(e.target.value)} onBlur={() => texto.trim() !== q && cambiar({ q: texto.trim() })} />
        </div>
        <div>
          <label htmlFor="estado">Estado</label>
          <select id="estado" value={estado} onChange={(e) => cambiar({ estado: e.target.value })}>
            <option value="">Todos los estados</option>
            {(Object.keys(ESTADO_ORDEN) as EstadoOrden[]).map((k) => (
              <option key={k} value={k}>
                {ESTADO_ORDEN[k].texto}
              </option>
            ))}
          </select>
        </div>
      </form>

      {carga.estado === 'error' ? <ErrorCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {!datos && carga.estado === 'cargando' ? <Cargando etiqueta="Cargando órdenes" /> : null}
      {datos && datos.datos.length === 0 ? (
        <EstadoVacio titulo={q || estado ? 'Ninguna orden coincide con la búsqueda' : 'Aún no hay órdenes registradas'}>
          {q || estado ? 'Prueba con otro código, título o estado.' : 'Registra la primera con «Nueva orden».'}
        </EstadoVacio>
      ) : null}
      {datos && datos.datos.length > 0 ? (
        <div className="tabla" aria-busy={carga.estado === 'cargando' || undefined}>
          <table className="responsive">
            <thead>
              <tr>
                <th scope="col">OT</th>
                <th scope="col">Trabajo</th>
                <th scope="col">Cliente</th>
                <th scope="col">Compromiso</th>
                <th scope="col">Estado</th>
                <th scope="col"><span className="sr">Acción</span></th>
              </tr>
            </thead>
            <tbody>
              {datos.datos.map((o) => (
                <tr key={o.id}>
                  <td data-label="OT"><Link to={`/ordenes/${o.id}`}>{o.codigo}</Link></td>
                  <td data-label="Trabajo">{o.titulo} ×{o.cantidad}</td>
                  <td data-label="Cliente">{o.referenciaCliente}</td>
                  <td data-label="Compromiso">{fecha(o.fechaCompromiso)}</td>
                  <td data-label="Estado">
                    <span className="chips"><ChipPrioridad prioridad={o.prioridad} /><ChipOrden estado={o.estado} /></span>
                  </td>
                  <td className="acc">
                    <Link className="btn texto chico" to={`/ordenes/${o.id}`} aria-label={`Ver ${o.codigo}`}>Ver</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {datos && paginas > 1 ? (
        <nav className="paginacion" aria-label="Páginas">
          <button className="btn secundario chico" type="button" disabled={pagina <= 1} onClick={() => cambiar({ pagina: String(pagina - 1) })}>Anterior</button>
          <span className="meta">Página {pagina} de {paginas}</span>
          <button className="btn secundario chico" type="button" disabled={pagina >= paginas} onClick={() => cambiar({ pagina: String(pagina + 1) })}>Siguiente</button>
        </nav>
      ) : null}
    </>
  );
}
