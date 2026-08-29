import { useCallback, useRef, useState, type ReactNode } from 'react'

/**
 * El andamiaje que comparten todos los gráficos.
 *
 * Los gráficos de esta aplicación son SVG escrito a mano, sin librería. No es
 * cabezonería: la app entera pesa 68 KB comprimidos y una librería de gráficos
 * pesa más que eso ella sola, además de traer su propio sistema visual que
 * habría que domar. Lo que se dibuja aquí son líneas, barras y rectángulos.
 *
 * Este módulo pone lo que de verdad se repite: el marco con sus márgenes, las
 * escalas, la rejilla, los ejes y el tooltip. Cada gráfico solo dibuja su parte.
 */

export const MARGEN = { arriba: 12, derecha: 12, abajo: 26, izquierda: 52 }

export type Escala = {
  /** De valor de datos a coordenada X. */
  x: (indice: number) => number
  /** De valor de datos a coordenada Y. */
  y: (valor: number) => number
  /** Ancho de una banda cuando el eje X son categorías (barras, mapa de calor). */
  banda: number
  ancho: number
  alto: number
  minimo: number
  maximo: number
}

/**
 * Escala vertical "bonita": redondea el máximo hacia arriba a una cifra legible
 * para que las líneas de la rejilla caigan en números redondos.
 */
export function escalaBonita(valores: (number | null)[], { desdeCero = true } = {}) {
  const limpios = valores.filter((v): v is number => v !== null && Number.isFinite(v))
  if (limpios.length === 0) return { minimo: 0, maximo: 1, pasos: [0, 1] }

  let maximo = Math.max(...limpios)
  let minimo = desdeCero ? Math.min(0, ...limpios) : Math.min(...limpios)

  if (maximo === minimo) {
    maximo = maximo === 0 ? 1 : maximo * 1.2
    minimo = Math.min(0, minimo)
  }

  const bruto = (maximo - minimo) / 4
  const magnitud = Math.pow(10, Math.floor(Math.log10(Math.abs(bruto) || 1)))
  const paso = Math.ceil(bruto / magnitud) * magnitud

  const inicio = Math.floor(minimo / paso) * paso
  const fin = Math.ceil(maximo / paso) * paso

  const pasos: number[] = []
  for (let v = inicio; v <= fin + paso / 2; v += paso) pasos.push(Math.round(v * 100) / 100)

  return { minimo: inicio, maximo: fin, pasos }
}

type PropsMarco = {
  /** Cuántas posiciones hay en el eje X. */
  columnas: number
  minimo: number
  maximo: number
  /** Líneas horizontales de referencia, con su etiqueta ya formateada. */
  pasos?: { valor: number; etiqueta: string }[]
  /** Etiquetas del eje X. Se van salteando solas si no caben. */
  etiquetasX?: string[]
  alto?: number
  /** Lo que se dibuja dentro, ya con las escalas resueltas. */
  children: (escala: Escala) => ReactNode
  /** Descripción para quien no ve el gráfico. */
  titulo: string
  /** Contenido del tooltip para la columna que se señala. */
  tooltip?: (indice: number) => ReactNode
  className?: string
}

const ANCHO = 720

export function Marco({
  columnas,
  minimo,
  maximo,
  pasos = [],
  etiquetasX = [],
  alto = 240,
  children,
  titulo,
  tooltip,
  className = '',
}: PropsMarco) {
  const [señalada, setSeñalada] = useState<number | null>(null)
  const contenedor = useRef<HTMLDivElement>(null)

  const ancho = ANCHO
  const util = { ancho: ancho - MARGEN.izquierda - MARGEN.derecha, alto: alto - MARGEN.arriba - MARGEN.abajo }
  const banda = columnas > 0 ? util.ancho / columnas : util.ancho

  const escala: Escala = {
    x: (indice) => MARGEN.izquierda + banda * (indice + 0.5),
    y: (valor) => {
      const proporcion = maximo === minimo ? 0 : (valor - minimo) / (maximo - minimo)
      return MARGEN.arriba + util.alto - proporcion * util.alto
    },
    banda,
    ancho: util.ancho,
    alto: util.alto,
    minimo,
    maximo,
  }

  /** Qué columna cae bajo el puntero. Se usa para el tooltip y el resalte. */
  const alMover = useCallback(
    (evento: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
      if (!tooltip || columnas === 0) return
      const caja = evento.currentTarget.getBoundingClientRect()
      const puntoX =
        'touches' in evento ? (evento.touches[0]?.clientX ?? 0) : (evento as React.MouseEvent).clientX
      // De píxeles de pantalla a coordenadas del viewBox.
      const enSvg = ((puntoX - caja.left) / caja.width) * ancho
      const indice = Math.floor((enSvg - MARGEN.izquierda) / banda)
      setSeñalada(indice >= 0 && indice < columnas ? indice : null)
    },
    [tooltip, columnas, banda, ancho],
  )

  // Con muchas columnas no caben todas las etiquetas: se van salteando.
  const cadaCuantas = Math.max(1, Math.ceil(columnas / 14))

  return (
    <div className={`grafico ${className}`} ref={contenedor}>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={titulo}
        onMouseMove={alMover}
        onMouseLeave={() => setSeñalada(null)}
        onTouchStart={alMover}
        onTouchMove={alMover}
        onTouchEnd={() => setSeñalada(null)}
      >
        <title>{titulo}</title>

        {/* Rejilla y eje vertical */}
        {pasos.map((paso) => (
          <g key={paso.valor}>
            <line
              className={`rejilla${paso.valor === 0 ? ' cero' : ''}`}
              x1={MARGEN.izquierda}
              x2={ancho - MARGEN.derecha}
              y1={escala.y(paso.valor)}
              y2={escala.y(paso.valor)}
            />
            <text className="eje-etiqueta" x={MARGEN.izquierda - 8} y={escala.y(paso.valor) + 4} textAnchor="end">
              {paso.etiqueta}
            </text>
          </g>
        ))}

        {/* Columna señalada, por debajo de los datos */}
        {señalada !== null ? (
          <rect
            className="grafico-resalte"
            x={MARGEN.izquierda + banda * señalada}
            y={MARGEN.arriba}
            width={banda}
            height={util.alto}
          />
        ) : null}

        {children(escala)}

        {/* Eje horizontal */}
        {etiquetasX.map((etiqueta, indice) =>
          indice % cadaCuantas === 0 ? (
            <text
              key={`${etiqueta}-${indice}`}
              className="eje-etiqueta"
              x={escala.x(indice)}
              y={alto - 8}
              textAnchor="middle"
            >
              {etiqueta}
            </text>
          ) : null,
        )}
      </svg>

      {/*
        El tooltip es HTML y no SVG: así hereda la tipografía y los colores de la
        aplicación, y el texto se puede seleccionar. Se coloca en porcentaje
        sobre el contenedor, que es lo que de verdad mide en pantalla.
      */}
      {tooltip && señalada !== null ? (
        <div
          className={`grafico-tooltip${señalada > columnas / 2 ? ' izquierda' : ''}`}
          style={{ left: `${((MARGEN.izquierda + banda * (señalada + 0.5)) / ancho) * 100}%` }}
          role="status"
        >
          {tooltip(señalada)}
        </div>
      ) : null}
    </div>
  )
}
