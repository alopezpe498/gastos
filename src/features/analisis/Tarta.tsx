import type { Trozo } from '../../lib/tipos'
import { euros, porcentaje } from '../../lib/formato'

/**
 * Tarta del reparto del mes, en SVG a mano.
 *
 * Es un donut y no un circulo lleno: el hueco del centro sirve para poner los
 * ingresos, que es la cifra contra la que se comparan todos los trozos.
 *
 * Se dibuja con un solo circulo por trozo y stroke-dasharray. Cada trozo lleva
 * ademas su color en la leyenda, porque un grafico que solo se puede leer por
 * color no se puede leer.
 */

const RADIO = 60
const GROSOR = 26
const PERIMETRO = 2 * Math.PI * RADIO

type Props = { trozos: Trozo[]; ingreso: number }

export function Tarta({ trozos, ingreso }: Props) {
  // El sobrante negativo no se puede dibujar como porcion: un mes en el que se
  // gasta mas de lo que entra no tiene "trozo de sobrante", tiene un agujero.
  const visibles = trozos.filter((t) => t.importe > 0)
  const total = visibles.reduce((suma, t) => suma + t.importe, 0)

  if (total <= 0) {
    return <p className="pista">Todavía no hay nada que repartir en este mes.</p>
  }

  let acumulado = 0

  return (
    <div className="tarta-bloque">
      <svg
        className="tarta"
        viewBox="0 0 160 160"
        role="img"
        aria-label={`Reparto del mes: ${visibles
          .map((t) => `${t.nombre} ${euros(t.importe)}`)
          .join(', ')}`}
      >
        <g transform="rotate(-90 80 80)">
          {visibles.map((trozo) => {
            const proporcion = trozo.importe / total
            const largo = proporcion * PERIMETRO
            const desfase = -acumulado * PERIMETRO
            acumulado += proporcion
            return (
              <circle
                key={trozo.clave}
                className={`tarta-trozo trozo-${trozo.clave}`}
                cx="80"
                cy="80"
                r={RADIO}
                fill="none"
                strokeWidth={GROSOR}
                strokeDasharray={`${largo} ${PERIMETRO - largo}`}
                strokeDashoffset={desfase}
              />
            )
          })}
        </g>
        <text className="tarta-centro-cifra" x="80" y="76" textAnchor="middle">
          {euros(ingreso, { redondo: true })}
        </text>
        <text className="tarta-centro-nota" x="80" y="94" textAnchor="middle">
          ingresos
        </text>
      </svg>

      <ul className="tarta-leyenda">
        {trozos.map((trozo) => (
          <li key={trozo.clave}>
            <span className={`tarta-punto trozo-${trozo.clave}`} aria-hidden="true" />
            <span className="tarta-nombre">{trozo.nombre}</span>
            <span className={`dinero tarta-importe${trozo.importe < 0 ? ' negativo' : ''}`}>
              {euros(trozo.importe)}
            </span>
            <span className="tarta-porcentaje">{porcentaje(trozo.porcentaje)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
