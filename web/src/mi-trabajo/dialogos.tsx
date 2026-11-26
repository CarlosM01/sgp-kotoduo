// Dialogs of the operator's stage: finish declaring the supplies used (CP-12,
// D23) and report a missing supply (CP-15, D24).
import { useState } from 'react';
import { api, ErrorApi, mensajeDeError } from '../compartido/api';
import type { AlertaReportada, EtapaDeTrabajo, EtapaTerminada } from '../compartido/contrato';
import { cantidad, cantidadEditable, leerCantidad } from '../compartido/formato';
import { Aviso, Dialogo, ErrorCampo } from '../compartido/ui';

const FORMATO = 'Escribe una cantidad con hasta 2 decimales, por ejemplo 0,60.';

/**
 * A 409 (stale version, order on hold, not enough stock) means the screen is
 * out of date: the caller shows the API message and reloads. Anything else
 * stays in the dialog so the person can correct it.
 */
const esConflicto = (e: unknown): e is ErrorApi => e instanceof ErrorApi && e.status === 409;

export function DialogoTerminar({
  abierto,
  etapa,
  alCerrar,
  alTerminar,
  alConflicto,
}: {
  abierto: boolean;
  etapa: EtapaDeTrabajo;
  alCerrar: () => void;
  alTerminar: (r: EtapaTerminada) => void;
  alConflicto: (e: ErrorApi) => void;
}) {
  // Prefilled with what the stage still requires; the person corrects it.
  // The caller keys this dialog by stage and version, so the state starts fresh for each one.
  const [valores, setValores] = useState<Record<number, string>>(() =>
    Object.fromEntries(etapa.requerimientos.map((r) => [r.insumoId, cantidadEditable(Math.max(r.cantidadRequerida - r.cantidadConsumida, 0))])),
  );
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    const nuevos: Record<number, string> = {};
    const consumos: { insumoId: number; cantidad: number }[] = [];
    for (const r of etapa.requerimientos) {
      const texto = valores[r.insumoId] ?? '';
      if (!texto.trim()) continue;
      const n = leerCantidad(texto);
      if (n === null) nuevos[r.insumoId] = FORMATO;
      else if (n > 0) consumos.push({ insumoId: r.insumoId, cantidad: n });
    }
    setErrores(nuevos);
    setError(null);
    if (Object.keys(nuevos).length) return;

    setOcupado(true);
    try {
      alTerminar(await api<EtapaTerminada>(`/etapas/${etapa.id}/terminar`, { metodo: 'POST', cuerpo: { version: etapa.version, consumos } }));
    } catch (err) {
      if (esConflicto(err)) alConflicto(err);
      else setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialogo abierto={abierto} titulo="Terminar etapa" textoConfirmar="Terminar" iconoConfirmar="check" ocupado={ocupado} alConfirmar={confirmar} alCerrar={alCerrar}>
      {etapa.requerimientos.length ? (
        <p>Confirma cuánto usaste. Puedes corregir la cantidad; deja en blanco lo que no usaste.</p>
      ) : (
        <p>Esta etapa no usa insumos registrados. ¿Confirmas que la terminaste?</p>
      )}
      {error ? <Aviso tipo="alerta" rol="alert" titulo={error} /> : null}
      {etapa.requerimientos.map((r) => {
        const id = `consumo-${r.insumoId}`;
        return (
          <div key={r.insumoId}>
            <label htmlFor={id}>{r.nombre} ({r.unidad.toLowerCase()})</label>
            <input id={id} inputMode="decimal" autoComplete="off" value={valores[r.insumoId] ?? ''}
              onChange={(e) => setValores((v) => ({ ...v, [r.insumoId]: e.target.value }))}
              aria-invalid={errores[r.insumoId] ? true : undefined} aria-describedby={`${id}-ayuda ${id}-error`} />
            <p id={`${id}-ayuda`} className="ayuda">Requerido para esta etapa: {cantidad(r.cantidadRequerida, r.unidad)}</p>
            <ErrorCampo id={`${id}-error`} mensaje={errores[r.insumoId]} />
          </div>
        );
      })}
    </Dialogo>
  );
}

export function DialogoFaltante({
  abierto,
  etapa,
  alCerrar,
  alReportar,
}: {
  abierto: boolean;
  etapa: EtapaDeTrabajo;
  alCerrar: () => void;
  alReportar: (a: AlertaReportada) => void;
}) {
  const [insumoId, setInsumoId] = useState(String(etapa.requerimientos[0]?.insumoId ?? ''));
  const [falta, setFalta] = useState('');
  const [comentario, setComentario] = useState('');
  const [errores, setErrores] = useState<{ falta?: string; comentario?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    const nuevos: typeof errores = {};
    const n = falta.trim() ? leerCantidad(falta) : undefined;
    if (n === null || n === 0) nuevos.falta = FORMATO;
    if (comentario.trim().length > 255) nuevos.comentario = 'El comentario admite hasta 255 caracteres.';
    setErrores(nuevos);
    setError(null);
    if (Object.keys(nuevos).length) return;

    setOcupado(true);
    try {
      const a = await api<AlertaReportada>('/alertas', {
        metodo: 'POST',
        cuerpo: {
          insumoId: Number(insumoId),
          etapaId: etapa.id,
          ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
          ...(n ? { cantidadFaltante: n } : {}),
        },
      });
      setFalta('');
      setComentario('');
      alReportar(a);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialogo abierto={abierto} titulo="Reportar faltante" textoConfirmar="Enviar aviso" ocupado={ocupado} alConfirmar={confirmar} alCerrar={alCerrar}>
      {error ? <Aviso tipo="alerta" rol="alert" titulo={error} /> : null}
      <label htmlFor="faltante-insumo">Insumo</label>
      <select id="faltante-insumo" value={insumoId} onChange={(e) => setInsumoId(e.target.value)}>
        {etapa.requerimientos.map((r) => <option key={r.insumoId} value={r.insumoId}>{r.nombre}</option>)}
      </select>
      <label htmlFor="faltante-cantidad">¿Cuánto falta? (opcional)</label>
      <input id="faltante-cantidad" inputMode="decimal" autoComplete="off" placeholder="Ej.: 0,5" value={falta}
        onChange={(e) => setFalta(e.target.value)} aria-invalid={errores.falta ? true : undefined} aria-describedby="faltante-cantidad-error" />
      <ErrorCampo id="faltante-cantidad-error" mensaje={errores.falta} />
      <label htmlFor="faltante-comentario">Comentario (opcional)</label>
      <textarea id="faltante-comentario" rows={2} maxLength={255} value={comentario} onChange={(e) => setComentario(e.target.value)}
        aria-invalid={errores.comentario ? true : undefined} aria-describedby="faltante-comentario-ayuda faltante-comentario-error" />
      <p id="faltante-comentario-ayuda" className="ayuda">Avisamos a la Encargada de Producción. Puedes seguir con lo que tengas.</p>
      <ErrorCampo id="faltante-comentario-error" mensaje={errores.comentario} />
    </Dialogo>
  );
}
