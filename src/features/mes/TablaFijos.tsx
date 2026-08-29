import { useState } from 'react'
import type { Movimiento } from '../../lib/tipos'
import { CampoImporte } from '../../components/Campos'
import { cuantos, euros, hoyIso } from '../../lib/formato'

type Props = {
  fijos: Movimiento[]
  onCambiarImporte: (id: number, importe: number | null) => Promise<void>
  onAlternarCobro: (movimiento: Movimiento) => Promise<void>
  onCambiarFecha: (id: number, fecha: string) => Promise<void>
  mesReferencia: string
  onRegenerar?: () => void
}

/**
 * Los fijos del mes: una lista de comprobación, no una tabla.
 *
 * Lo que se hace aquí cada mes es marcar lo que ya han cobrado, así que la
 * pieza principal es el círculo de la izquierda. Todo lo demás —el día, el
 * concepto, el importe— es lectura.
 *
 * Va plegada por defecto con su resumen: son catorce filas que casi siempre
 * están bien, y no tienen por qué competir con los movimientos.
 */
export function TablaFijos({
  fijos,
  onCambiarImporte,
  onAlternarCobro,
  onRegenerar,
}: Props) {
  const pendientes = fijos.filter((f) => !f.cobrado)
  const [abierta, setAbierta] = useState(pendientes.length > 0)
  const hoy = hoyIso()

  return (
    <section className="seccion">
      <button
        className="seccion-cabecera seccion-plegable"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
      >
        <h2 className="titulo-seccion">Fijos</h2>
        <span className="secundario">
          {pendientes.length === 0
            ? 'Todos cobrados'
            : `${cuantos(pendientes.length, 'pendiente')} · `}
          {pendientes.length > 0 ? (
            <span className="dinero">{euros(pendientes.reduce((t, f) => t + f.importe, 0))}</span>
          ) : null}{' '}
          <span aria-hidden="true">{abierta ? '−' : '+'}</span>
        </span>
      </button>

      {abierta ? (
        <div className="fijos">
          {fijos.map((fijo) => {
            const desvio =
              fijo.importePrevisto && fijo.importePrevisto !== 0
                ? (fijo.importe - fijo.importePrevisto) / Math.abs(fijo.importePrevisto)
                : null
            const desviado = desvio !== null && Math.abs(desvio) > 0.1
            const muyDesviado = desvio !== null && Math.abs(desvio) > 0.25
            // Pendiente y su día ya pasó: lo único que pide atención aquí.
            const tarde = !fijo.cobrado && diaYaPaso(fijo.diaPrevisto, hoy)

            return (
              <div className="fijo" key={fijo.id}>
                <button
                  className={`fijo-marca${fijo.cobrado ? ' cobrado' : ''}`}
                  aria-label={`${fijo.cobrado ? 'Desmarcar' : 'Marcar como cobrado'} ${fijo.concepto}`}
                  aria-pressed={fijo.cobrado}
                  onClick={() => void onAlternarCobro(fijo)}
                >
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                    <circle cx="8" cy="8" r="7" className="fijo-circulo" />
                    <path d="M4.5 8.5 L7 11 L11.5 5.5" className="fijo-tic" />
                  </svg>
                </button>

                <span className={`fecha fijo-dia${tarde ? ' rojo' : ''}`}>
                  {fijo.diaPrevisto || '—'}
                </span>

                <span className="fijo-concepto">
                  {fijo.concepto}
                  {desviado ? (
                    <span className="fijo-desvio">
                      <span className="dinero tachado">{euros(fijo.importePrevisto ?? 0)}</span>{' '}
                      <span className={muyDesviado ? 'rojo' : 'apagado'}>
                        {fijo.importe > (fijo.importePrevisto ?? 0) ? '+' : '−'}
                        {euros(Math.abs(fijo.importe - (fijo.importePrevisto ?? 0)))}
                      </span>
                    </span>
                  ) : null}
                </span>

                <CampoImporte
                  valor={fijo.importe}
                  ariaLabel={`Importe de ${fijo.concepto}`}
                  className="dinero fijo-importe"
                  onGuardar={(importe) => void onCambiarImporte(fijo.id, importe)}
                />
              </div>
            )
          })}

          {onRegenerar ? (
            <button className="boton-texto fijos-pie" onClick={onRegenerar}>
              Regenerar desde plantilla
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** El día previsto admite varios ("30,13,23"); vale el primero. */
function diaYaPaso(diaPrevisto: string | null, hoy: string) {
  const primero = Number(String(diaPrevisto ?? '').split(/[^0-9]+/).filter(Boolean)[0])
  if (!primero) return false
  return primero < Number(hoy.slice(8, 10))
}
