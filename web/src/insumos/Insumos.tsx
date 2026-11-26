// P-08 /insumos (HU-09, HU-03; CU-08, CU-09): open supply alerts (automatic
// at or below the minimum, CP-14; manual reports, CP-15) and the stock.
// Free text from reporters is rendered as text, never as HTML (CP-25).
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../compartido/api';
import type { AlertaVista, InsumoConEstado, Pagina } from '../compartido/contrato';
import { Chip } from '../compartido/estados';
import { cantidad, fechaHora } from '../compartido/formato';
import { Cargando, ErrorCarga, EstadoVacio, useCarga, useTitulo } from '../compartido/ui';

type FiltroAlerta = 'abiertas' | 'cerradas' | 'todas';
const FILTROS: ReadonlyArray<[FiltroAlerta, string]> = [
  ['abiertas', 'Abiertas'],
  ['cerradas', 'Cerradas'],
  ['todas', 'Todas'],
];

const ESTADO_ALERTA = {
  ABIERTA: { tono: 't-peligro', icono: 'alerta', texto: 'Abierta' },
  EN_GESTION: { tono: 't-adv', icono: 'reloj', texto: 'En gestión' },
  CERRADA: { tono: 't-ok', icono: 'check', texto: 'Cerrada' },
} as const;

function EstadoStock({ i }: { i: InsumoConEstado }) {
  if (i.stockActual <= 0) return <Chip tono="t-peligro" icono="x" texto="Sin stock" />;
  if (i.bajoMinimo) return <Chip tono="t-adv" icono="alerta" texto="Bajo mínimo" />;
  return <Chip tono="t-ok" icono="check" texto="Suficiente" />;
}

function TarjetaAlerta({ a }: { a: AlertaVista }) {
  return (
    <article className="card" aria-labelledby={`alerta-${a.id}`}>
      <div className="fila">
        <h3 id={`alerta-${a.id}`}>{a.insumo.nombre}</h3>
        <Chip {...ESTADO_ALERTA[a.estado]} />
      </div>
      {a.origen === 'MANUAL' ? (
        <p style={{ marginTop: 6 }}>
          Reportada por {a.reportadaPor?.nombreCompleto ?? 'una persona'}
          {a.comentario ? <>: «{a.comentario}»</> : null}
        </p>
      ) : (
        <p style={{ marginTop: 6 }}>El stock quedó en el mínimo o bajo él.</p>
      )}
      {a.cantidadFaltante !== null ? <p><strong>Falta: {cantidad(a.cantidadFaltante, a.insumo.unidad)}</strong></p> : null}
      <p className="meta">
        {a.origen === 'MANUAL' ? 'Manual' : 'Automática'}
        {a.orden ? <> · afecta a <Link to={`/ordenes/${a.orden.id}`}>{a.orden.codigo}</Link></> : null}
        {a.etapa ? ` (${a.etapa.nombre})` : ''} · {fechaHora(a.creadaEn)}
        {a.cerradaEn ? ` · cerrada ${fechaHora(a.cerradaEn)}` : ''}
      </p>
    </article>
  );
}

export function Insumos() {
  useTitulo('Insumos');
  const [filtro, setFiltro] = useState<FiltroAlerta>('abiertas');
  const alertas = useCarga((senal) => api<Pagina<AlertaVista>>(`/alertas?estado=${filtro}&tamano=50`, { senal }), filtro);
  const stock = useCarga((senal) => api<{ datos: InsumoConEstado[] }>('/insumos', { senal }), 'insumos');

  return (
    <>
      <header className="cabecera">
        <h1>Insumos</h1>
        <p className="meta">Stock y alertas. Las alertas automáticas aparecen cuando un consumo deja el stock en el mínimo o bajo él.</p>
      </header>

      <section aria-labelledby="t-alertas">
        <div className="seccion-titulo">
          <h2 id="t-alertas" style={{ marginTop: 0 }}>Alertas</h2>
          {alertas.datos ? <span className="meta">{alertas.datos.total}</span> : null}
        </div>
        <div className="segmentos" role="group" aria-label="Filtrar alertas">
          {FILTROS.map(([k, texto]) => (
            <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{texto}</button>
          ))}
        </div>
        {alertas.estado === 'error' ? <ErrorCarga error={alertas.error} alReintentar={alertas.recargar} /> : null}
        {!alertas.datos && alertas.estado === 'cargando' ? <Cargando etiqueta="Cargando alertas" tarjetas={1} /> : null}
        {alertas.datos && alertas.datos.datos.length === 0 ? (
          <EstadoVacio titulo={filtro === 'abiertas' ? 'No hay alertas abiertas' : 'No hay alertas para mostrar'} icono="check" />
        ) : null}
        {alertas.datos && alertas.datos.datos.length > 0 ? (
          <div className="dos-col" aria-busy={alertas.estado === 'cargando' || undefined}>
            {alertas.datos.datos.map((a) => <TarjetaAlerta key={a.id} a={a} />)}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="t-stock">
        <div className="seccion-titulo"><h2 id="t-stock">Stock</h2></div>
        {stock.estado === 'error' ? <ErrorCarga error={stock.error} alReintentar={stock.recargar} /> : null}
        {!stock.datos && stock.estado === 'cargando' ? <Cargando etiqueta="Cargando stock" tarjetas={1} /> : null}
        {stock.datos ? (
          <div className="tabla">
            <table className="responsive">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Insumo</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Mínimo</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {stock.datos.datos.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Código">{i.codigo}</td>
                    <td data-label="Insumo">{i.nombre}</td>
                    <td data-label="Stock" className="stock">{cantidad(i.stockActual, i.unidad)}</td>
                    <td data-label="Mínimo" className="stock">{cantidad(i.stockMinimo, i.unidad)}</td>
                    <td data-label="Estado"><EstadoStock i={i} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
