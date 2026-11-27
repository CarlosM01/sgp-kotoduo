// P-03 /ordenes/:id (HU-07 read only, HU-08 partial, HU-12; CU-11, CU-12).
// Reads back what was saved: data, stages generated from the template, their
// supplies and responsible people. The Encargada assigns responsible people
// (optimistic lock by version, CP-19) and sees the order history.
import { useState } from 'react';
import { useParams } from 'react-router';
import { TablaEventos } from '../bitacora/eventos';
import { puede } from '../compartido/acceso';
import { api, ErrorApi, mensajeDeError } from '../compartido/api';
import type { Asignacion, EtapaVista, EventoBitacora, OrdenDetalle, Responsable } from '../compartido/contrato';
import { ChipEtapa, ChipOrden, ChipPrioridad } from '../compartido/estados';
import { cantidad, fecha, fechaHora } from '../compartido/formato';
import { Icono } from '../compartido/iconos';
import type { SesionCliente } from '../compartido/sesion';
import { Aviso, Cargando, ErrorCarga, EstadoVacio, useCarga, useTitulo } from '../compartido/ui';

const ORDEN_CERRADA = new Set(['TERMINADA', 'ENTREGADA', 'ANULADA']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clasePaso(e: EtapaVista): string | undefined {
  if (e.estado === 'TERMINADA') return 'hecha';
  if (e.estado === 'OMITIDA') return 'omitida';
  if (e.estado === 'EN_CURSO' || e.estado === 'DISPONIBLE' || e.estado === 'BLOQUEADA') return 'actual';
  return undefined;
}

export function DetalleOrden({ sesion }: { sesion: SesionCliente }) {
  const { id = '' } = useParams();
  const roles = sesion.usuario.roles;
  const gestiona = puede(roles, 'etapas.gestionar');
  const veHistorial = puede(roles, 'bitacora.ver');

  const orden = useCarga((senal) => api<OrdenDetalle>(`/ordenes/${encodeURIComponent(id)}`, { senal }), id);
  const responsables = useCarga(
    (senal) => (gestiona ? api<{ datos: Responsable[] }>('/responsables', { senal }) : Promise.resolve({ datos: [] })),
    `resp-${gestiona}`,
  );
  const historial = useCarga(
    (senal) =>
      veHistorial && UUID.test(id)
        ? api<{ datos: EventoBitacora[] }>(`/bitacora?orden_id=${id}&limite=50`, { senal })
        : Promise.resolve({ datos: [] }),
    `hist-${id}`,
  );
  useTitulo(orden.datos?.codigo ?? 'Detalle de orden');

  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'alerta'; texto: string } | null>(null);

  if (orden.estado === 'error' && !orden.datos) {
    if (orden.error instanceof ErrorApi && (orden.error.status === 404 || orden.error.status === 400)) {
      return <EstadoVacio titulo="No encontramos esta orden" icono="lista">Puede que el enlace esté incompleto. Búscala en la lista de órdenes.</EstadoVacio>;
    }
    return <ErrorCarga error={orden.error} alReintentar={orden.recargar} />;
  }
  if (!orden.datos) return <Cargando etiqueta="Cargando la orden" />;

  const o = orden.datos;
  const cerrada = ORDEN_CERRADA.has(o.estado);
  const nombres = new Map<string, string>([
    [o.creadoPor.id, o.creadoPor.nombreCompleto],
    ...(responsables.datos?.datos ?? []).map((r) => [r.id, r.nombreCompleto] as [string, string]),
    ...o.etapas.flatMap((e) => (e.responsable ? [[e.responsable.id, e.responsable.nombreCompleto] as [string, string]] : [])),
  ]);
  const detalle = typeof o.especificaciones.detalle === 'string' ? o.especificaciones.detalle : null;
  const otras = Object.entries(o.especificaciones).filter(([k]) => k !== 'detalle');
  const terminadas = o.etapas.filter((e) => e.estado === 'TERMINADA' || e.estado === 'OMITIDA').length;

  function asignado(texto: string) {
    setAviso({ tipo: 'exito', texto });
    orden.recargar();
    historial.recargar();
  }

  return (
    <>
      <header className="cabecera">
        <div className="fila">
          <h1 style={{ margin: 0 }}>{o.titulo}</h1>
          <span className="chips"><ChipPrioridad prioridad={o.prioridad} /><ChipOrden estado={o.estado} /></span>
        </div>
        <p className="meta" style={{ marginTop: 6 }}>
          {o.codigo} · {o.cantidad} {o.cantidad === 1 ? 'unidad' : 'unidades'} · {o.referenciaCliente} · {o.tipoTrabajo} · Entrega comprometida {fecha(o.fechaCompromiso)} · Estimada {fecha(o.fechaEstimadaTermino)}
        </p>
      </header>

      {aviso ? <Aviso tipo={aviso.tipo} rol={aviso.tipo === 'exito' ? 'status' : 'alert'} titulo={aviso.texto} /> : null}

      <div className="tres-col">
        <div>
          <section className="card" aria-labelledby="t-datos">
            <h2 id="t-datos" style={{ marginTop: 0 }}>Datos de la orden</h2>
            <dl className="datos">
              <dt>Especificaciones</dt>
              <dd>{detalle ?? (otras.length ? null : 'Sin especificaciones')}</dd>
              {otras.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                </div>
              ))}
              {o.descripcion ? (<><dt>Descripción</dt><dd>{o.descripcion}</dd></>) : null}
              <dt>Registrada por</dt>
              <dd>{o.creadoPor.nombreCompleto} · {fechaHora(o.creadoEn)}</dd>
              <dt>Avance</dt>
              <dd>{terminadas} de {o.etapas.length} etapas cerradas</dd>
              {o.terminadaEn ? (<><dt>Terminada</dt><dd>{fechaHora(o.terminadaEn)}</dd></>) : null}
            </dl>
            {!gestiona ? <p className="aviso info"><Icono nombre="candado" /><span>Solo lectura. Las etapas las asigna la Encargada de Producción y las avanza su responsable.</span></p> : null}
          </section>

          {veHistorial ? (
            <section aria-labelledby="t-historial">
              <div className="seccion-titulo"><h2 id="t-historial">Historial de la orden</h2></div>
              {historial.estado === 'error' && !historial.datos ? <ErrorCarga error={historial.error} alReintentar={historial.recargar} /> : null}
              {historial.datos ? <TablaEventos eventos={historial.datos.datos} nombres={nombres} /> : historial.estado === 'cargando' ? <Cargando etiqueta="Cargando historial" tarjetas={1} /> : null}
            </section>
          ) : null}
        </div>

        <section className="card" aria-labelledby="t-recorrido">
          <h2 id="t-recorrido" style={{ marginTop: 0 }}>Recorrido del trabajo</h2>
          {gestiona && responsables.estado === 'error' ? <Aviso tipo="alerta" rol="alert" titulo={`No pudimos cargar las personas para asignar: ${mensajeDeError(responsables.error)}`} /> : null}
          <ol className="pasos">
            {o.etapas.map((e) => (
              <li key={e.id} className={clasePaso(e)}>
                <span className="num">{e.estado === 'TERMINADA' ? <Icono nombre="check" /> : e.secuencia}</span>
                <div className="cuerpo">
                  <div className="fila">
                    <span className="nombre">{e.nombre}</span>
                    <ChipEtapa estado={e.estado} />
                  </div>
                  <span className="meta">
                    {e.area} · {e.duracionEstimadaHoras} h ·{' '}
                    {e.responsable ? e.responsable.nombreCompleto : <strong style={{ color: 'var(--color-peligro)' }}>sin responsable</strong>}
                  </span>
                  {e.requerimientos.length ? (
                    <ul className="insumos meta">
                      {e.requerimientos.map((r) => (
                        <li key={r.insumoId}>
                          {r.nombre}: {cantidad(r.cantidadRequerida, r.unidad)}
                          {r.cantidadConsumida > 0 ? ` (usado ${cantidad(r.cantidadConsumida, r.unidad)})` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {gestiona && !cerrada && e.estado !== 'TERMINADA' && e.estado !== 'OMITIDA' ? (
                    <AsignarResponsable
                      etapa={e}
                      personas={responsables.datos?.datos ?? []}
                      alAsignar={asignado}
                      alFallar={(texto, recargar) => {
                        setAviso({ tipo: 'alerta', texto });
                        if (recargar) orden.recargar();
                      }}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

function AsignarResponsable({
  etapa,
  personas,
  alAsignar,
  alFallar,
}: {
  etapa: EtapaVista;
  personas: Responsable[];
  alAsignar: (texto: string) => void;
  alFallar: (texto: string, recargar: boolean) => void;
}) {
  const actual = etapa.responsable?.id ?? '';
  const [elegido, setElegido] = useState(actual);
  const [enviando, setEnviando] = useState(false);
  const idSelect = `resp-${etapa.id}`;
  // The current person may be missing from the list (deactivated): keep showing them.
  const opciones = etapa.responsable && !personas.some((p) => p.id === actual) ? [{ id: actual, nombreCompleto: etapa.responsable.nombreCompleto, roles: [] }, ...personas] : personas;

  async function asignar() {
    if (!elegido || elegido === actual) return;
    setEnviando(true);
    try {
      await api<Asignacion>(`/etapas/${etapa.id}/responsable`, { metodo: 'PATCH', cuerpo: { responsableId: elegido, version: etapa.version } });
      alAsignar(`${etapa.nombre}: responsable ${opciones.find((p) => p.id === elegido)?.nombreCompleto ?? ''} asignado.`);
    } catch (err) {
      alFallar(mensajeDeError(err), err instanceof ErrorApi && err.status === 409);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="gestion">
      <label className="sr" htmlFor={idSelect}>Responsable de {etapa.nombre}</label>
      <select id={idSelect} value={elegido} onChange={(e) => setElegido(e.target.value)} aria-invalid={!actual || undefined} disabled={enviando}>
        {!actual ? <option value="">Asignar responsable…</option> : null}
        {opciones.map((p) => <option key={p.id} value={p.id}>{p.nombreCompleto}</option>)}
      </select>
      <button className="btn secundario chico" type="button" onClick={asignar} disabled={enviando || !elegido || elegido === actual} aria-busy={enviando || undefined}>
        {enviando ? 'Asignando…' : 'Asignar'}
      </button>
    </div>
  );
}
