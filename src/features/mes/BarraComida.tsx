import type { ResumenMes } from '../../lib/tipos'
import { CampoImporte } from '../../components/Campos'
import { euros } from '../../lib/formato'

type Props = {
  resumen: ResumenMes
  onCambiarPresupuesto: (valor: number | null) => Promise<void>
}

/**
 * El sobre de la comida.
 *
 * No es un recibo: es un presupuesto del que se va tirando durante el mes, asi
 * que lo que importa no es cuanto se ha gastado sino cuanto queda. La barra
 * pasa a ambar al acercarse al limite y a rojo al pasarse, que es cuando hace
 * falta enterarse.
 */
export function BarraComida({ resumen, onCambiarPresupuesto }: Props) {
  const { presupuesto, gastado, queda } = resumen.comida
  const proporcion = presupuesto > 0 ? gastado / presupuesto : 0
  const estado = queda < 0 ? 'pasado' : proporcion >= 0.85 ? 'justo' : 'bien'

  return (
    <section className="sobre">
      <div className="sobre-cabecera">
        <h2 className="seccion-titulo">Comida</h2>
        <div className="sobre-presupuesto">
          <label className="sobre-etiqueta" htmlFor="presupuesto-comida">
            Presupuesto
          </label>
          <CampoImporte
            valor={presupuesto}
            onGuardar={onCambiarPresupuesto}
            ariaLabel="Presupuesto de comida"
          />
        </div>
      </div>

      <div
        className="sobre-barra"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={presupuesto}
        aria-valuenow={gastado}
        aria-label={`Gastado en comida: ${euros(gastado)} de ${euros(presupuesto)}`}
      >
        <div
          className={`sobre-relleno ${estado}`}
          // Por encima del 100% la barra se llena del todo y es el color, no el
          // ancho, el que dice que se ha pasado.
          style={{ width: `${Math.min(100, Math.max(0, proporcion * 100))}%` }}
        />
      </div>

      <div className="sobre-cifras">
        <span>
          Gastado <strong className="dinero">{euros(gastado)}</strong>
        </span>
        <span className={queda < 0 ? 'negativo' : ''}>
          {queda < 0 ? 'Pasado de ' : 'Queda '}
          <strong className="dinero">{euros(Math.abs(queda))}</strong>
        </span>
      </div>
    </section>
  )
}
