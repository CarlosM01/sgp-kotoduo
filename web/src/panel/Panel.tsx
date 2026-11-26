// P-06 /panel (HU-10, CU-10): orders in progress with their current stage and
// progress; each indicator filters the list (IK-7). Data from v_panel_ordenes.
import { Link, useSearchParams } from 'react-router';
import { puede } from '../compartido/acceso';
import { api } from '../compartido/api';
import type { FilaPanel, Pagina, ResumenPanel } from '../compartido/contrato';
import { Chip, ChipOrden, ChipPrioridad } from '../compartido/estados';
import { fecha, fechaHora } from '../compartido/formato';
import { Icono, type IconoNombre } from '../compartido/iconos';
import type { SesionCliente } from '../compartido/sesion';
import { Aviso, Cargando, ErrorCarga, EstadoVacio, useCarga, useTitulo } from '../compartido/ui';

const TAMANO = 20;
type Filtro = 'activas' | 'atrasadas' | 'en_riesgo';

const KPIS: ReadonlyArray<{ filtro: Filtro; texto: string; icono: IconoNombre; clase: string; valor: (r: ResumenPanel) => number }> = [
  { filtro: 'activas', texto: 'En curso', icono: 'lista', clase: '', valor: (r) => r.activas },
  { filtro: 'atrasadas', texto: 'Atrasadas', icono: 'reloj', clase: ' peligro', valor: (r) => r.atrasadas },
  { filtro: 'en_riesgo', texto: 'En riesgo', icono: 'alerta', clase: ' adv', valor: (r) => r.enRiesgo },
];

const TITULOS: Readonly<Record<Filtro, string>> = {
  activas: 'Órdenes en curso',
  atrasadas: 'Órdenes atrasadas',
  en_riesgo: 'Órdenes en riesgo',
};

const VACIOS: Readonly<Record<Filtro, string>> = {
  activas: 'No hay órdenes en curso',
  atrasadas: 'No hay órdenes atrasadas',
  en_riesgo: 'No hay órdenes en riesgo',
};

function Situacion({ f }: { f: FilaPanel }) {
  return (
    <span className="chips">
      <ChipPrioridad prioridad={f.prioridad} />
      {f.estado === 'DETENIDA' ? <ChipOrden estado="DETENIDA" /> : null}
      {f.atrasada ? <Chip tono="t-peligro" icono="reloj" texto="Atrasada" /> : null}
      {f.enRiesgo && !f.atrasada ? <Chip tono="t-adv" icono="alerta" texto="En riesgo" /> : null}
      {!f.atrasada && !f.enRiesgo && f.estado !== 'DETENIDA' ? <Chip tono="t-ok" icono="check" texto="A tiempo" /> : null}
    </span>
  );
}

export function Panel({ sesion }: { sesion: SesionCliente }) {
  useTitulo('Panel');
  const [params, setParams] = useSearchParams();
  const filtro = (['activas', 'atrasadas', 'en_riesgo'].includes(params.get('filtro') ?? '') ? params.get('filtro') : 'activas') as Filtro;
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);
  const consulta = `filtro=${filtro}&pagina=${pagina}&tamano=${TAMANO}`;
  const carga = useCarga(
    (senal) => api<Pagina<FilaPanel> & { resumen: ResumenPanel }>(`/panel?${consulta}`, { senal }).then((d) => ({ ...d, en: new Date() })),
    consulta,
  );
  const gestionaInsumos = puede(sesion.usuario.roles, 'insumos.gestionar');
  const datos = carga.datos;
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / TAMANO)) : 1;
  const ir = (cambios: Record<string, string>) => setParams({ filtro, pagina: '1', ...cambios }, { replace: true });

  return (
    <>
      <header className="cabecera fila">
        <div>
          <h1>Panel de producción</h1>
          <p className="meta" aria-live="polite">
            {datos ? `Actualizado ${fechaHora(datos.en).slice(-5)} · ${datos.resumen.activas} ${datos.resumen.activas === 1 ? 'orden' : 'órdenes'} en curso` : 'Cargando…'}
          </p>
        </div>
        <button className="btn secundario chico" type="button" onClick={carga.recargar} disabled={carga.estado === 'cargando'}>
          <Icono nombre="reintentar" />
          Actualizar
        </button>
      </header>

      {carga.estado === 'error' ? <ErrorCarga error={carga.error} alReintentar={carga.recargar} /> : null}
      {!datos && carga.estado === 'cargando' ? <Cargando etiqueta="Cargando el panel" /> : null}

      {datos ? (
        <>
          <div className="kpis" role="group" aria-label="Filtrar órdenes">
            {KPIS.map((k) => (
              <button key={k.filtro} className={`kpi${k.clase}`} type="button" aria-pressed={filtro === k.filtro} onClick={() => ir({ filtro: k.filtro })}>
                <span><Icono nombre={k.icono} clase="chico" />{k.texto}</span>
                <b>{k.valor(datos.resumen)}</b>
              </button>
            ))}
            {gestionaInsumos ? (
              <Link className={`kpi${datos.resumen.alertasAbiertas ? ' peligro' : ''}`} to="/insumos" style={{ textDecoration: 'none' }}>
                <span><Icono nombre="caja" clase="chico" />Alertas de insumo</span>
                <b>{datos.resumen.alertasAbiertas}</b>
              </Link>
            ) : (
              <div className={`kpi${datos.resumen.alertasAbiertas ? ' peligro' : ''}`} style={{ cursor: 'default' }}>
                <span><Icono nombre="caja" clase="chico" />Alertas de insumo</span>
                <b>{datos.resumen.alertasAbiertas}</b>
              </div>
            )}
          </div>

          {datos.resumen.alertasAbiertas > 0 ? (
            <Aviso tipo="alerta" icono="caja" titulo={`Hay ${datos.resumen.alertasAbiertas} ${datos.resumen.alertasAbiertas === 1 ? 'alerta' : 'alertas'} de insumo sin cerrar.`}>
              {gestionaInsumos ? <Link to="/insumos">Revisar insumos</Link> : 'La Encargada de Producción ya fue avisada.'}
            </Aviso>
          ) : null}

          <div className="seccion-titulo">
            <h2>{TITULOS[filtro]}</h2>
            <Link to="/ordenes" className="meta">Ver todas</Link>
          </div>

          {datos.datos.length === 0 ? (
            <EstadoVacio titulo={VACIOS[filtro]} icono="check" />
          ) : (
            <div className="tabla" aria-busy={carga.estado === 'cargando' || undefined}>
              <table className="responsive">
                <thead>
                  <tr>
                    <th scope="col">OT</th>
                    <th scope="col">Trabajo</th>
                    <th scope="col">Etapa actual</th>
                    <th scope="col">Responsable</th>
                    <th scope="col">Avance</th>
                    <th scope="col">Compromiso</th>
                    <th scope="col">Situación</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.datos.map((f) => (
                    <tr key={f.id}>
                      <td data-label="OT"><Link to={`/ordenes/${f.id}`}>{f.codigo}</Link></td>
                      <td data-label="Trabajo">{f.titulo}</td>
                      <td data-label="Etapa actual">{f.etapaActual ?? '—'}</td>
                      <td data-label="Responsable">{f.responsableActual ?? (f.etapaActual ? 'Sin asignar' : '—')}</td>
                      <td data-label="Avance">{Math.round(f.porcentajeAvance)} %</td>
                      <td data-label="Compromiso">{fecha(f.fechaCompromiso)}</td>
                      <td data-label="Situación"><Situacion f={f} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {paginas > 1 ? (
            <nav className="paginacion" aria-label="Páginas">
              <button className="btn secundario chico" type="button" disabled={pagina <= 1} onClick={() => ir({ pagina: String(pagina - 1) })}>Anterior</button>
              <span className="meta">Página {pagina} de {paginas}</span>
              <button className="btn secundario chico" type="button" disabled={pagina >= paginas} onClick={() => ir({ pagina: String(pagina + 1) })}>Siguiente</button>
            </nav>
          ) : null}
        </>
      ) : null}
    </>
  );
}
