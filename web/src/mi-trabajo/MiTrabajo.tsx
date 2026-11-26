// P-02 /mi-trabajo (HU-01, HU-02, HU-03; CU-05, CU-06, CU-08, CU-09). The
// operator sees what to do now and the next stages, starts and finishes the
// stage (declaring what was used) and reports a missing supply. Mobile first:
// one big primary action, secondary actions below.
import { useState } from 'react';
import { api, ErrorApi, mensajeDeError } from '../compartido/api';
import type { AlertaReportada, EtapaDeTrabajo, EtapaIniciada, EtapaTerminada, MiTrabajo as DatosMiTrabajo } from '../compartido/contrato';
import { ChipEtapa, ChipPrioridad } from '../compartido/estados';
import { cantidad, fecha } from '../compartido/formato';
import { Icono } from '../compartido/iconos';
import type { SesionCliente } from '../compartido/sesion';
import { Aviso, Cargando, ErrorCarga, EstadoVacio, useCarga, useTitulo } from '../compartido/ui';
import { DialogoFaltante, DialogoTerminar } from './dialogos';

type Mensaje = { tipo: 'exito' | 'alerta' | 'adv' | 'info'; titulo: string; detalle?: string };

const DIA = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
const REPORTABLE = new Set(['DISPONIBLE', 'EN_CURSO', 'BLOQUEADA']);

export function MiTrabajo({ sesion }: { sesion: SesionCliente }) {
  useTitulo('Mi Trabajo');
  const carga = useCarga((senal) => api<DatosMiTrabajo>('/mi-trabajo', { senal }), 'mi-trabajo');
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [dialogo, setDialogo] = useState<'terminar' | 'faltante' | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const nombre = sesion.usuario.nombreCompleto.split(/\s+/)[0];

  const datos = carga.datos;
  const siguiente = datos?.siguiente ?? null;
  const proximas = datos?.etapas.filter((e) => e.id !== siguiente?.id) ?? [];

  async function iniciar(etapa: EtapaDeTrabajo) {
    setOcupado(true);
    try {
      await api<EtapaIniciada>(`/etapas/${etapa.id}/iniciar`, { metodo: 'POST', cuerpo: { version: etapa.version } });
      setMensajes([{ tipo: 'info', titulo: `Iniciaste «${etapa.nombre}».`, detalle: 'Cuando termines, confirma cuánto usaste de cada insumo.' }]);
    } catch (err) {
      setMensajes([{ tipo: 'alerta', titulo: mensajeDeError(err) }]);
    } finally {
      setOcupado(false);
      carga.recargar();
    }
  }

  function terminada(etapa: EtapaDeTrabajo, r: EtapaTerminada) {
    const nuevos: Mensaje[] = [
      r.ordenTerminada
        ? { tipo: 'exito', titulo: `Listo. Con esta etapa la orden ${etapa.orden.codigo} quedó terminada.` }
        : r.siguienteEtapa
          ? { tipo: 'exito', titulo: `Listo. Sigue: ${r.siguienteEtapa}${r.area ? ` — área ${r.area}` : ''}.`, detalle: 'Si es tuya, ya aparece en tu lista.' }
          : { tipo: 'exito', titulo: `Listo. «${etapa.nombre}» quedó terminada.` },
    ];
    const bajos = r.consumos.filter((c) => c.bajoMinimo).map((c) => c.codigo);
    if (bajos.length) {
      nuevos.push({
        tipo: 'adv',
        titulo: `El stock de ${bajos.join(', ')} quedó en el mínimo o bajo él.`,
        detalle: r.alertas.length ? 'Se creó una alerta para la Encargada de Producción.' : 'La alerta ya estaba abierta para la Encargada de Producción.',
      });
    }
    setMensajes(nuevos);
    setDialogo(null);
    carga.recargar();
  }

  if (carga.estado === 'error' && !datos) return <ErrorCarga error={carga.error} alReintentar={carga.recargar} />;
  if (!datos) return <Cargando etiqueta="Cargando tu trabajo" />;

  return (
    <>
      <header className="cabecera">
        <h1>Hola, {nombre}</h1>
        <p className="meta">{DIA.format(new Date())}</p>
      </header>

      <div aria-live="polite">
        {mensajes.map((m, i) => (
          <Aviso key={i} tipo={m.tipo} rol={m.tipo === 'alerta' ? 'alert' : 'status'} titulo={m.titulo}>{m.detalle}</Aviso>
        ))}
      </div>
      {carga.estado === 'error' ? <ErrorCarga error={carga.error} alReintentar={carga.recargar} /> : null}

      {!siguiente && proximas.length === 0 ? (
        <EstadoVacio titulo="No tienes etapas pendientes" icono="check">Cuando te asignen una etapa aparecerá aquí.</EstadoVacio>
      ) : null}

      {siguiente ? (
        <section aria-labelledby="t-ahora">
          <h2 id="t-ahora">Ahora te toca</h2>
          <article className="card destacada" aria-labelledby={`etapa-${siguiente.id}`}>
            <div className="fila">
              <h3 id={`etapa-${siguiente.id}`}>{siguiente.nombre}</h3>
              <span className="chips"><ChipPrioridad prioridad={siguiente.orden.prioridad} /><ChipEtapa estado={siguiente.estado} /></span>
            </div>
            <p style={{ marginTop: 6 }}>{siguiente.orden.codigo} · {siguiente.orden.titulo}</p>
            <p className="meta">
              Etapa {siguiente.secuencia} · Área {siguiente.area} · Entrega comprometida {fecha(siguiente.orden.fechaCompromiso)} · Estimado {siguiente.duracionEstimadaHoras} h
            </p>
            {siguiente.instrucciones ? (
              <>
                <h3 style={{ marginTop: 16 }}>Instrucciones</h3>
                <p>{siguiente.instrucciones}</p>
              </>
            ) : null}
            {siguiente.requerimientos.length ? (
              <>
                <h3 style={{ marginTop: 16 }}>Insumos de esta etapa</h3>
                <ul className="insumos">
                  {siguiente.requerimientos.map((r) => (
                    <li key={r.insumoId}>{r.nombre} — {cantidad(r.cantidadRequerida, r.unidad)}</li>
                  ))}
                </ul>
              </>
            ) : null}

            <div className="acciones una">
              {siguiente.estado === 'DISPONIBLE' ? (
                <button className="btn bloque grande" type="button" disabled={ocupado} aria-busy={ocupado || undefined} onClick={() => iniciar(siguiente)}>
                  <Icono nombre="play" />
                  {ocupado ? 'Iniciando…' : 'Iniciar etapa'}
                </button>
              ) : null}
              {siguiente.estado === 'EN_CURSO' ? (
                <button className="btn bloque grande" type="button" onClick={() => setDialogo('terminar')}>
                  <Icono nombre="check" />
                  Terminar etapa
                </button>
              ) : null}
            </div>

            {REPORTABLE.has(siguiente.estado) && siguiente.requerimientos.length ? (
              <div className="acciones-secundarias">
                <p className="meta">¿Algo no va bien?</p>
                <div className="acciones una">
                  <button className="btn secundario" type="button" onClick={() => setDialogo('faltante')}>
                    <Icono nombre="caja" />
                    Reportar faltante
                  </button>
                </div>
              </div>
            ) : null}
          </article>

          <DialogoTerminar
            abierto={dialogo === 'terminar'}
            etapa={siguiente}
            alCerrar={() => setDialogo(null)}
            alTerminar={(r) => terminada(siguiente, r)}
            alConflicto={(err: ErrorApi) => {
              setDialogo(null);
              setMensajes([{ tipo: 'alerta', titulo: err.message }]);
              carga.recargar();
            }}
          />
          <DialogoFaltante
            abierto={dialogo === 'faltante'}
            etapa={siguiente}
            alCerrar={() => setDialogo(null)}
            alReportar={(a: AlertaReportada) => {
              const insumo = siguiente.requerimientos.find((r) => r.insumoId === a.insumoId);
              setDialogo(null);
              setMensajes([{ tipo: 'info', titulo: `Faltante de ${insumo?.nombre ?? 'insumo'} informado a la Encargada de Producción.`, detalle: 'Puedes seguir con lo que tengas.' }]);
            }}
          />
        </section>
      ) : null}

      {proximas.length ? (
        <section aria-labelledby="t-proximas">
          <h2 id="t-proximas">{siguiente ? 'Próximas' : 'Tus etapas'}</h2>
          {proximas.map((e) => (
            <article key={e.id} className="card" aria-labelledby={`etapa-${e.id}`}>
              <div className="fila">
                <h3 id={`etapa-${e.id}`}>{e.nombre}</h3>
                <span className="chips"><ChipPrioridad prioridad={e.orden.prioridad} /><ChipEtapa estado={e.estado} /></span>
              </div>
              <p style={{ marginTop: 6 }}>{e.orden.codigo} · {e.orden.titulo}</p>
              <p className="meta">
                {e.estado === 'PENDIENTE' ? 'Espera: que terminen las etapas anteriores' : `Área ${e.area}`} · Entrega comprometida {fecha(e.orden.fechaCompromiso)}
                {e.orden.estado === 'DETENIDA' ? ' · Orden detenida' : ''}
              </p>
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}
