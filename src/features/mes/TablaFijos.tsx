import type { Movimiento } from '../../lib/tipos'
import { CampoImporte } from '../../components/Campos'
import { CampoFecha } from '../../components/CampoFecha'
import { IconoComprobado } from '../../components/Iconos'
import { cuantos, euros, fecha, hoyIso, porcentaje } from '../../lib/formato'

type Props = {
  fijos: Movimiento[]
  onCambiarImporte: (id: number, importe: number | null) => Promise<void>
  onAlternarCobro: (movimiento: Movimiento) => Promise<void>
  onCambiarFecha: (id: number, fecha: string) => Promise<void>
  /** Mes que se esta viendo ('AAAA-MM'), para completar fechas a medio escribir. */
  mesReferencia: string
}

/** Cuánto se aleja el importe real de lo previsto, en porcentaje. */
function desvio(fijo: Movimiento): number | null {
  if (fijo.importePrevisto === null || fijo.importePrevisto === 0) return null
  return ((fijo.importe - fijo.importePrevisto) / Math.abs(fijo.importePrevisto)) * 100
}

/**
 * Un 15 % arriba o abajo ya no es redondeo: o el recibo ha cambiado o la
 * plantilla se ha quedado vieja. Cualquiera de las dos cosas conviene mirarla.
 */
function desviado(fijo: Movimiento): boolean {
  const d = desvio(fijo)
  return d !== null && Math.abs(d) > 15
}

/**
 * Los fijos del mes, ordenados por dia previsto, como en el Excel.
 *
 * Lo que se hace aqui todos los meses es marcar lo que ya han cobrado y
 * corregir el importe cuando no coincide con lo previsto. Todo lo demas es
 * lectura, asi que solo esas dos cosas piden atencion: el pendiente lleva su
 * banda ambar y el importe se edita escribiendo encima.
 */
export function TablaFijos({
  fijos,
  onCambiarImporte,
  onAlternarCobro,
  onCambiarFecha,
  mesReferencia,
}: Props) {
  const total = fijos.reduce((t, f) => t + f.importe, 0)
  const pendientes = fijos.filter((f) => !f.cobrado)
  const totalPendiente = pendientes.reduce((t, f) => t + f.importe, 0)

  return (
    <section className="panel">
      <div className="panel-cabecera">
        <h2 className="seccion-titulo">Fijos</h2>
        <span className="panel-nota">
          {pendientes.length === 0
            ? 'Todos cobrados'
            : `${cuantos(pendientes.length, 'pendiente')} · ${euros(totalPendiente)}`}
        </span>
      </div>

      <div className="tarjeta tabla-fijos">
        <div className="fijo-fila cabecera" aria-hidden="true">
          <span className="fijo-dia">Día</span>
          <span className="fijo-concepto">Concepto</span>
          <span className="fijo-importe">Importe</span>
          <span className="fijo-cobro">Cobrado</span>
        </div>

        {fijos.map((fijo) => (
          <div
            key={fijo.id}
            className={`fijo-fila${fijo.cobrado ? '' : ' fila-pendiente'}`}
          >
            <span className="fijo-dia dinero">{fijo.diaPrevisto ?? '—'}</span>

            <span className="fijo-concepto">
              {fijo.concepto}
              {/* Solo se dice lo previsto cuando difiere de lo real: si coincide,
                  repetirlo es ruido en quince filas seguidas. */}
              {fijo.importePrevisto !== null && fijo.importePrevisto !== fijo.importe ? (
                <span
                  className={`fijo-previsto dinero${desviado(fijo) ? ' desviado' : ''}`}
                  title={
                    desviado(fijo)
                      ? 'Se desvía más de un 15 % de lo previsto: quizá haya que actualizar la plantilla.'
                      : undefined
                  }
                >
                  previsto {euros(fijo.importePrevisto)}
                  {desviado(fijo) ? ` · ${porcentaje(desvio(fijo), 0)}` : ''}
                </span>
              ) : null}
            </span>

            <CampoImporte
              valor={fijo.importe}
              onGuardar={(valor) => onCambiarImporte(fijo.id, valor)}
              ariaLabel={`Importe de ${fijo.concepto}`}
              className="fijo-importe"
            />

            <span className="fijo-cobro">
              <button
                className={`casilla${fijo.cobrado ? ' marcada' : ''}`}
                aria-label={
                  fijo.cobrado
                    ? `${fijo.concepto}: cobrado el ${fecha(fijo.fechaCobro)}. Marcar como pendiente`
                    : `${fijo.concepto}: pendiente. Marcar como cobrado hoy`
                }
                aria-pressed={fijo.cobrado}
                onClick={() => void onAlternarCobro(fijo)}
              >
                {fijo.cobrado ? <IconoComprobado size={16} /> : null}
              </button>

              {fijo.cobrado ? (
                <CampoFecha
                  valor={fijo.fechaCobro ?? hoyIso()}
                  mesReferencia={mesReferencia}
                  onGuardar={(iso) => onCambiarFecha(fijo.id, iso)}
                  ariaLabel={`Fecha de cobro de ${fijo.concepto}`}
                  className="fijo-fecha"
                  compacto
                />
              ) : null}
            </span>
          </div>
        ))}

        <div className="fijo-fila total">
          <span className="fijo-dia" />
          <span className="fijo-concepto">Total fijos</span>
          <span className="fijo-importe dinero">{euros(total)}</span>
          <span className="fijo-cobro" />
        </div>
      </div>
    </section>
  )
}
