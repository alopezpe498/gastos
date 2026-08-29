import { useEffect, useRef, useState } from 'react'
import type { CintaMes } from '../../lib/tipos'
import { euros, fechaMuyCorta } from '../../lib/formato'

/**
 * La cinta del mes: el elemento firma de la aplicación.
 *
 * Una línea horizontal que representa el mes de nómina a nómina. Encima, cada
 * recibo fijo clavado en su día. Debajo, el gasto acumulado creciendo, y una
 * línea de puntos con el ritmo «ideal» —los ingresos repartidos por igual entre
 * los días—. Si el área va por encima de los puntos, el mes se está yendo
 * rápido, y eso se ve sin leer una sola cifra.
 *
 * No es un gráfico de una librería: es el dibujo de este problema concreto, y
 * es lo que hace que esta pantalla no se parezca a ningún panel de control.
 */

type Props = {
  cinta: CintaMes
  onIrAlFijo?: (movimientoId: number) => void
}

const ALTO = 92
const ALTO_LINEA = 40 // dónde cae la línea del mes dentro del dibujo

export function CintaDelMes({ cinta, onIrAlFijo }: Props) {
  const [encima, setEncima] = useState<number | null>(null)
  const [dibujado, setDibujado] = useState(false)
  const area = useRef<SVGPathElement>(null)

  // Se dibuja de izquierda a derecha una sola vez, al abrir el mes.
  useEffect(() => {
    const t = window.setTimeout(() => setDibujado(true), 40)
    return () => window.clearTimeout(t)
  }, [])

  const { puntos, marcas, dias, hoy, ingreso } = cinta
  if (dias === 0) return null

  const x = (indice: number) => (indice / Math.max(1, dias - 1)) * 100

  /*
   * La escala la manda el GASTO, no el ingreso. Escalando por el ingreso, un
   * mes a medias dibujaba una línea casi plana pegada al suelo y no se veía
   * nada. El ritmo ideal se dibuja igual aunque se salga por arriba: lo que
   * importa es si el área lo cruza, y eso se ve mejor con el gasto mandando.
   */
  const gastoMaximo = Math.max(...puntos.map((p) => p.acumulado ?? 0), 1)
  const maximo = Math.max(gastoMaximo * 1.15, 1)
  const y = (valor: number) => ALTO - ((valor / maximo) * (ALTO - ALTO_LINEA - 6) + 6)

  const conDatos = puntos.filter((p) => p.acumulado !== null)
  const linea = conDatos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(puntos.indexOf(p))} ${y(p.acumulado ?? 0)}`)
    .join(' ')
  const relleno =
    conDatos.length > 1
      ? `${linea} L ${x(puntos.indexOf(conDatos[conDatos.length - 1]))} ${ALTO} L ${x(0)} ${ALTO} Z`
      : ''

  const indiceHoy = hoy ? puntos.findIndex((p) => p.dia === hoy) : -1

  /*
   * El ritmo ideal: los ingresos repartidos por igual entre los días. Se corta
   * donde se sale del dibujo, que es justo la información útil: a partir de ahí
   * el mes ya va holgado y no hace falta seguir la línea.
   */
  const ideal = (() => {
    if (!ingreso) return ''
    const porDia = ingreso / Math.max(1, dias - 1)
    const diaTope = maximo / porDia
    const hasta = Math.min(dias - 1, diaTope)
    return `M ${x(0)} ${y(0)} L ${x(hasta)} ${y(Math.min(ingreso, maximo))}`
  })()

  const laMarca = marcas.find((m) => m.movimientoId === encima) ?? null

  return (
    <div className="cinta">
      <svg
        viewBox={`0 0 100 ${ALTO}`}
        preserveAspectRatio="none"
        className={`cinta-dibujo${dibujado ? ' dibujada' : ''}`}
        role="img"
        aria-label={`El mes del ${fechaMuyCorta(cinta.desde)} al ${fechaMuyCorta(cinta.hasta)}, con ${marcas.length} recibos`}
      >
        {/* El área del gasto acumulado, que crece día a día. */}
        {relleno ? <path d={relleno} className="cinta-area" ref={area} /> : null}
        {linea ? <path d={linea} className="cinta-linea-gasto" /> : null}

        {/* El ritmo ideal, en puntos: si el área lo pasa, se va rápido. */}
        {ideal ? <path d={ideal} className="cinta-ideal" /> : null}

        {/* La línea del mes. */}
        <line x1="0" y1={ALTO_LINEA} x2="100" y2={ALTO_LINEA} className="cinta-eje" />

      </svg>

      {/*
        Las marcas van en una capa aparte, en HTML: dentro del SVG estirado
        (preserveAspectRatio="none") un círculo se convierte en una elipse y una
        marca vertical cambia de grosor según el ancho de la ventana.
      */}
      <div className="cinta-marcas" aria-hidden="true">
        {marcas.map((m) => {
          const i = puntos.findIndex((p) => p.dia === m.dia)
          if (i < 0) return null
          return (
            <span
              key={m.movimientoId}
              className={`cinta-marca ${m.estado}`}
              style={{ left: `${x(i)}%` }}
              onMouseEnter={() => setEncima(m.movimientoId)}
              onMouseLeave={() => setEncima(null)}
              onClick={() => onIrAlFijo?.(m.movimientoId)}
            />
          )
        })}
        {indiceHoy >= 0 ? (
          <span className="cinta-punto-hoy" style={{ left: `${x(indiceHoy)}%` }} />
        ) : null}
      </div>

      <div className="cinta-pie">
        <span className="fecha">{fechaMuyCorta(cinta.desde)}</span>
        {indiceHoy >= 0 ? (
          <span
            className="cinta-etiqueta-hoy"
            style={{ left: `${x(indiceHoy)}%` }}
            aria-hidden="true"
          >
            hoy
          </span>
        ) : null}
        <span className="fecha">{fechaMuyCorta(cinta.hasta)}</span>
      </div>

      {laMarca ? (
        <p className="cinta-aviso" role="status">
          <span className="fecha">{fechaMuyCorta(laMarca.dia)}</span> {laMarca.concepto}{' '}
          <span className="dinero">{euros(laMarca.importe)}</span>
          {laMarca.estado === 'pasado' ? <span className="rojo"> · sin cobrar</span> : null}
        </p>
      ) : null}
    </div>
  )
}
