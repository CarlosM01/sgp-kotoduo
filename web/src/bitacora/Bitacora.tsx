// P-10 /bitacora (HU-12, CU-11): full audit log, Administrador only; read only.
// The API returns the latest events; the search and the type filter narrow
// what is on screen.
import { useState } from 'react';
import { api } from '../compartido/api';
import type { EventoBitacora, Responsable } from '../compartido/contrato';
import { Cargando, ErrorCarga, useCarga, useTitulo } from '../compartido/ui';
import { detalleEvento, ETIQUETAS_EVENTO, GRUPOS_EVENTO, quienEs, TablaEventos } from './eventos';

const LIMITE = 100;

export function Bitacora() {
  useTitulo('Bitácora');
  const eventos = useCarga((senal) => api<{ datos: EventoBitacora[] }>(`/bitacora?limite=${LIMITE}`, { senal }), 'bitacora');
  // Names of the people who can be assigned; other users show their login name or a short id.
  const personas = useCarga((senal) => api<{ datos: Responsable[] }>('/responsables', { senal }), 'personas');
  const [q, setQ] = useState('');
  const [grupo, setGrupo] = useState('');

  const nombres = new Map((personas.datos?.datos ?? []).map((p) => [p.id, p.nombreCompleto]));
  const texto = q.trim().toLowerCase();
  const visibles = (eventos.datos?.datos ?? []).filter((e) => {
    if (grupo && !GRUPOS_EVENTO[grupo]?.includes(e.tipo)) return false;
    if (!texto) return true;
    return [quienEs(e, nombres), ETIQUETAS_EVENTO[e.tipo] ?? e.tipo, detalleEvento(e, nombres)].some((s) => s.toLowerCase().includes(texto));
  });

  return (
    <>
      <header className="cabecera fila">
        <div>
          <h1>Bitácora de auditoría</h1>
          <p className="meta">Registro de solo lectura: los eventos no se pueden editar ni borrar. Se muestran los últimos {LIMITE}.</p>
        </div>
        <button className="btn secundario chico" type="button" onClick={eventos.recargar} disabled={eventos.estado === 'cargando'}>Actualizar</button>
      </header>

      <form className="filtros" role="search" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="q">Orden, usuario o detalle</label>
          <input id="q" type="search" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} placeholder="Ej.: OT-2026-0001" />
        </div>
        <div>
          <label htmlFor="grupo">Tipo de evento</label>
          <select id="grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Todos</option>
            {Object.keys(GRUPOS_EVENTO).map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </form>

      {eventos.estado === 'error' ? <ErrorCarga error={eventos.error} alReintentar={eventos.recargar} /> : null}
      {!eventos.datos && eventos.estado === 'cargando' ? <Cargando etiqueta="Cargando bitácora" tarjetas={1} /> : null}
      {eventos.datos ? (
        <>
          <p className="meta" aria-live="polite">{visibles.length} de {eventos.datos.datos.length} eventos</p>
          <TablaEventos eventos={visibles} nombres={nombres} />
        </>
      ) : null}
    </>
  );
}
