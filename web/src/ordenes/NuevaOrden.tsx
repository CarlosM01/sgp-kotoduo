// P-04 /ordenes/nueva (HU-05, CU-04 «include» generar etapas). The stages,
// supplies and estimated date come from the template of the work type: the
// preview shows the template, the API generates and stores everything.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, ErrorApi, mensajeDeError } from '../compartido/api';
import type { OrdenCreada, TipoTrabajoVista } from '../compartido/contrato';
import { PRIORIDAD } from '../compartido/estados';
import { fecha, hoy } from '../compartido/formato';
import { Icono } from '../compartido/iconos';
import { Aviso, Cargando, ErrorCampo, ErrorCarga, useCarga, useTitulo } from '../compartido/ui';
import { MENSAJES, validarOrden, type CampoOrden, type ErroresOrden, type FormularioOrden } from './validar-orden';

const VACIO: FormularioOrden = {
  tipoTrabajoId: '',
  titulo: '',
  referenciaCliente: '',
  cantidad: '1',
  prioridad: 'NORMAL',
  especificaciones: '',
  fechaCompromiso: '',
};

/** Props of an input linked to its error message (aria-invalid + aria-describedby). */
function enlazar(campo: CampoOrden, errores: ErroresOrden, ayuda?: string) {
  return {
    id: campo,
    'aria-invalid': errores[campo] ? true : undefined,
    'aria-describedby': [ayuda, `${campo}-error`].filter(Boolean).join(' '),
  } as const;
}

export function NuevaOrden() {
  useTitulo('Nueva orden');
  const plantillas = useCarga((senal) => api<{ datos: TipoTrabajoVista[] }>('/plantillas', { senal }), 'plantillas');
  const [f, setF] = useState<FormularioOrden>(VACIO);
  const [errores, setErrores] = useState<ErroresOrden>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [creada, setCreada] = useState<OrdenCreada | null>(null);
  const minimo = hoy();

  const tipos = plantillas.datos?.datos ?? [];
  const tipo = tipos.find((t) => String(t.id) === f.tipoTrabajoId);

  const cambiar = (campo: CampoOrden) => (e: { target: { value: string } }) => {
    setF((x) => ({ ...x, [campo]: e.target.value }));
    if (errores[campo]) setErrores((x) => ({ ...x, [campo]: undefined }));
  };

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const r = validarOrden(f, hoy());
    if (!r.ok) {
      setErrores(r.errores);
      document.getElementById(Object.keys(r.errores)[0]!)?.focus();
      return;
    }
    setEnviando(true);
    try {
      setCreada(await api<OrdenCreada>('/ordenes', { metodo: 'POST', cuerpo: r.cuerpo }));
      window.scrollTo(0, 0);
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 400 && err.detalles.length) {
        const delServidor: ErroresOrden = {};
        for (const d of err.detalles) {
          if (d.campo in MENSAJES) delServidor[d.campo as CampoOrden] = d.campo === 'fechaCompromiso' ? err.message : MENSAJES[d.campo as CampoOrden];
        }
        setErrores(delServidor);
      }
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  }

  if (creada) {
    return (
      <section aria-labelledby="t-creada">
        <h1 id="t-creada" className="sr">Orden registrada</h1>
        <Aviso tipo="exito" rol="status" titulo={`${creada.codigo} registrada con ${creada.etapas} etapas.`}>
          Término estimado: {fecha(creada.fechaEstimadaTermino)}. Asigna los responsables de cada etapa desde el detalle de la orden.
        </Aviso>
        <div className="acciones linea">
          <Link className="btn" to={`/ordenes/${creada.id}`}>Ver la orden</Link>
          <Link className="btn secundario" to="/ordenes">Volver a órdenes</Link>
          <button className="btn texto" type="button" onClick={() => { setCreada(null); setF(VACIO); setErrores({}); }}>
            <Icono nombre="mas" />
            Registrar otra
          </button>
        </div>
      </section>
    );
  }

  if (plantillas.estado === 'error' && !plantillas.datos) return <ErrorCarga error={plantillas.error} alReintentar={plantillas.recargar} />;
  if (!plantillas.datos) return <Cargando etiqueta="Cargando tipos de trabajo" />;

  const horas = tipo?.etapas.reduce((t, e) => t + e.duracionEstimadaHoras, 0) ?? 0;

  return (
    <>
      <header className="cabecera">
        <h1>Nueva orden de trabajo</h1>
        <p className="meta">Regístrala una sola vez: las etapas, los insumos y la fecha estimada salen de la plantilla del tipo de trabajo.</p>
      </header>

      {error ? <Aviso tipo="alerta" rol="alert" titulo={error}>{Object.keys(errores).length ? 'Revisa los campos marcados.' : null}</Aviso> : null}

      <form className="tres-col" noValidate onSubmit={enviar} aria-label="Nueva orden">
        <section className="card" aria-labelledby="t-datos">
          <h2 id="t-datos" style={{ marginTop: 0 }}>Datos de la orden</h2>

          <label htmlFor="tipoTrabajoId">Tipo de trabajo</label>
          <select {...enlazar('tipoTrabajoId', errores)} value={f.tipoTrabajoId} onChange={cambiar('tipoTrabajoId')}>
            <option value="">Elige un tipo…</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <ErrorCampo id="tipoTrabajoId-error" mensaje={errores.tipoTrabajoId} />

          <label htmlFor="titulo">Título</label>
          <input {...enlazar('titulo', errores)} maxLength={120} value={f.titulo} onChange={cambiar('titulo')} placeholder="Ej.: Camisetas sublimadas" />
          <ErrorCampo id="titulo-error" mensaje={errores.titulo} />

          <label htmlFor="referenciaCliente">Cliente (institución)</label>
          <input {...enlazar('referenciaCliente', errores, 'ref-ayuda')} maxLength={80} value={f.referenciaCliente} onChange={cambiar('referenciaCliente')} />
          <p id="ref-ayuda" className="ayuda">Solo el nombre de la institución. No registres teléfonos, correos ni montos.</p>
          <ErrorCampo id="referenciaCliente-error" mensaje={errores.referenciaCliente} />

          <div className="dos-col">
            <div>
              <label htmlFor="cantidad">Cantidad</label>
              <input {...enlazar('cantidad', errores)} type="number" inputMode="numeric" min={1} max={100000} step={1} value={f.cantidad} onChange={cambiar('cantidad')} />
              <ErrorCampo id="cantidad-error" mensaje={errores.cantidad} />
            </div>
            <div>
              <label htmlFor="prioridad">Prioridad</label>
              <select {...enlazar('prioridad', errores)} value={f.prioridad} onChange={cambiar('prioridad')}>
                {(['NORMAL', 'ALTA', 'URGENTE', 'BAJA'] as const).map((p) => <option key={p} value={p}>{PRIORIDAD[p]}</option>)}
              </select>
              <ErrorCampo id="prioridad-error" mensaje={errores.prioridad} />
            </div>
          </div>

          <label htmlFor="especificaciones">Especificaciones (tallas, medidas, colores)</label>
          <textarea {...enlazar('especificaciones', errores)} rows={3} maxLength={2000} value={f.especificaciones} onChange={cambiar('especificaciones')} placeholder="Ej.: S 5 · M 15 · L 10 · azul y blanco" />
          <ErrorCampo id="especificaciones-error" mensaje={errores.especificaciones} />

          <label htmlFor="fechaCompromiso">Fecha comprometida</label>
          <input {...enlazar('fechaCompromiso', errores)} type="date" min={minimo} value={f.fechaCompromiso} onChange={cambiar('fechaCompromiso')} />
          <ErrorCampo id="fechaCompromiso-error" mensaje={errores.fechaCompromiso} />
        </section>

        <section className="card" aria-labelledby="t-prev" aria-live="polite">
          {tipo ? (
            <>
              <h2 id="t-prev" style={{ marginTop: 0 }}>Se generarán {tipo.etapas.length} etapas</h2>
              <p className="meta">Plantilla «{tipo.nombre}» · {horas} h estimadas en total</p>
              <ol className="pasos">
                {tipo.etapas.map((e) => (
                  <li key={e.secuencia}>
                    <span className="num">{e.secuencia}</span>
                    <div className="cuerpo">
                      <span className="nombre">{e.nombre}</span>
                      <br />
                      <span className="meta">{e.area} · {e.duracionEstimadaHoras} h</span>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <h2 id="t-prev" style={{ marginTop: 0 }}>Etapas de la orden</h2>
              <p className="meta">Elige el tipo de trabajo para ver las etapas que se generarán.</p>
            </>
          )}
          <div className="acciones una">
            <button className="btn bloque grande" type="submit" disabled={enviando} aria-busy={enviando || undefined}>
              {enviando ? 'Registrando…' : 'Registrar orden'}
            </button>
          </div>
        </section>
      </form>
    </>
  );
}
