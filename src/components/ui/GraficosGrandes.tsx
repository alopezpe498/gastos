import { Marco, escalaBonita, MARGEN, type Escala } from './MarcoGrafico'
import { euros, numero } from '../../lib/formato'

/**
 * Los gráficos de la aplicación. Todos comparten el marco de Marco.tsx y los
 * colores de analisis.css, así que se leen como una familia.
 *
 * Regla común: un valor null es un HUECO, no un cero. Una línea se corta, una
 * barra no se dibuja y una celda del mapa de calor queda en blanco. Pintar
 * ceros donde no hay datos falsea las medias y dibuja valles que no existen.
 */

const etiquetaCorta = (valor: number) => {
  const absoluto = Math.abs(valor)
  if (absoluto >= 1000) return `${numero(Math.round(valor / 100) / 10)}k`
  return numero(valor).replace(',00', '')
}

// ---------------------------------------------------------------------------
// Líneas
// ---------------------------------------------------------------------------

export type Linea = {
  nombre: string
  valores: (number | null)[]
  /** Clase de color: 'serie-1'…'serie-6', o 'media' / 'previsto'. */
  color: string
  discontinua?: boolean
}

/**
 * Construye el path saltándose los huecos: cada tramo con datos es un
 * subcamino propio, así la línea se corta donde no hay nada.
 */
function caminoDeLinea(valores: (number | null)[], escala: Escala): string {
  const tramos: string[] = []
  let abierto = false
  valores.forEach((valor, indice) => {
    if (valor === null) {
      abierto = false
      return
    }
    const x = escala.x(indice)
    const y = escala.y(valor)
    tramos.push(`${abierto ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
    abierto = true
  })
  return tramos.join(' ')
}

export function GraficoLineas({
  lineas,
  etiquetasX,
  titulo,
  alto = 260,
  formato = euros,
  tooltipExtra,
}: {
  lineas: Linea[]
  etiquetasX: string[]
  titulo: string
  alto?: number
  formato?: (v: number | null) => string
  tooltipExtra?: (indice: number) => string | null
}) {
  const todos = lineas.flatMap((l) => l.valores)
  const { minimo, maximo, pasos } = escalaBonita(todos)

  return (
    <Marco
      columnas={etiquetasX.length}
      minimo={minimo}
      maximo={maximo}
      pasos={pasos.map((v) => ({ valor: v, etiqueta: etiquetaCorta(v) }))}
      etiquetasX={etiquetasX}
      alto={alto}
      titulo={titulo}
      tooltip={(indice) => (
        <>
          <strong>{etiquetasX[indice]}</strong>
          {lineas.map((linea) => (
            <span key={linea.nombre} className="tooltip-linea">
              <span className={`tooltip-punto ${linea.color}`} aria-hidden="true" />
              {linea.nombre}: <strong className="dinero">{formato(linea.valores[indice])}</strong>
            </span>
          ))}
          {tooltipExtra?.(indice) ? <span className="tooltip-nota">{tooltipExtra(indice)}</span> : null}
        </>
      )}
    >
      {(escala) => (
        <>
          {lineas.map((linea) => (
            <g key={linea.nombre}>
              <path
                className={`linea ${linea.color}${linea.discontinua ? ' discontinua' : ''}`}
                d={caminoDeLinea(linea.valores, escala)}
              />
              {/* Los puntos solo cuando hay pocos: con treinta meses son ruido. */}
              {linea.valores.length <= 14
                ? linea.valores.map((valor, indice) =>
                    valor === null ? null : (
                      <circle
                        key={indice}
                        className={`punto ${linea.color}`}
                        cx={escala.x(indice)}
                        cy={escala.y(valor)}
                        r={3}
                      />
                    ),
                  )
                : null}
            </g>
          ))}
        </>
      )}
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Barras (una serie, con signo)
// ---------------------------------------------------------------------------

export function GraficoBarras({
  valores,
  etiquetasX,
  titulo,
  alto = 240,
  /** Colorea según el signo: verde lo positivo, rojo lo negativo. */
  porSigno = false,
  color = 'serie-1',
  lineaExtra,
  onPulsar,
}: {
  valores: (number | null)[]
  etiquetasX: string[]
  titulo: string
  alto?: number
  porSigno?: boolean
  color?: string
  /** Una línea superpuesta, por ejemplo el acumulado. */
  lineaExtra?: { nombre: string; valores: (number | null)[]; color: string } | null
  onPulsar?: (indice: number) => void
}) {
  const todos = [...valores, ...(lineaExtra?.valores ?? [])]
  const { minimo, maximo, pasos } = escalaBonita(todos)

  return (
    <Marco
      columnas={etiquetasX.length}
      minimo={minimo}
      maximo={maximo}
      pasos={pasos.map((v) => ({ valor: v, etiqueta: etiquetaCorta(v) }))}
      etiquetasX={etiquetasX}
      alto={alto}
      titulo={titulo}
      tooltip={(indice) => (
        <>
          <strong>{etiquetasX[indice]}</strong>
          <span className="tooltip-linea">
            <strong className="dinero">{euros(valores[indice])}</strong>
          </span>
          {lineaExtra ? (
            <span className="tooltip-linea">
              {lineaExtra.nombre}:{' '}
              <strong className="dinero">{euros(lineaExtra.valores[indice])}</strong>
            </span>
          ) : null}
        </>
      )}
    >
      {(escala) => (
        <>
          {valores.map((valor, indice) => {
            if (valor === null) return null
            const base = escala.y(0)
            const punta = escala.y(valor)
            const clase = porSigno ? (valor < 0 ? 'negativa' : 'positiva') : color
            return (
              <rect
                key={indice}
                className={`barra ${clase}${onPulsar ? ' pulsable' : ''}`}
                x={MARGEN.izquierda + escala.banda * indice + escala.banda * 0.18}
                y={Math.min(base, punta)}
                width={escala.banda * 0.64}
                height={Math.max(1, Math.abs(base - punta))}
                onClick={onPulsar ? () => onPulsar(indice) : undefined}
              />
            )
          })}

          {lineaExtra ? (
            <path
              className={`linea ${lineaExtra.color}`}
              d={caminoDeLinea(lineaExtra.valores, escala)}
            />
          ) : null}
        </>
      )}
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Barras agrupadas (varias series por categoría)
// ---------------------------------------------------------------------------

export function GraficoBarrasAgrupadas({
  categorias,
  series,
  titulo,
  alto = 260,
}: {
  categorias: string[]
  series: { nombre: string; valores: (number | null)[]; color: string }[]
  titulo: string
  alto?: number
}) {
  const { minimo, maximo, pasos } = escalaBonita(series.flatMap((s) => s.valores))
  const cuantas = Math.max(1, series.length)

  return (
    <Marco
      columnas={categorias.length}
      minimo={minimo}
      maximo={maximo}
      pasos={pasos.map((v) => ({ valor: v, etiqueta: etiquetaCorta(v) }))}
      etiquetasX={categorias}
      alto={alto}
      titulo={titulo}
      tooltip={(indice) => (
        <>
          <strong>{categorias[indice]}</strong>
          {series.map((serie) => (
            <span key={serie.nombre} className="tooltip-linea">
              <span className={`tooltip-punto ${serie.color}`} aria-hidden="true" />
              {serie.nombre}: <strong className="dinero">{euros(serie.valores[indice])}</strong>
            </span>
          ))}
        </>
      )}
    >
      {(escala) => (
        <>
          {categorias.map((_, indice) =>
            series.map((serie, s) => {
              const valor = serie.valores[indice]
              if (valor === null) return null
              const base = escala.y(0)
              const punta = escala.y(valor)
              const anchoGrupo = escala.banda * 0.72
              const anchoBarra = anchoGrupo / cuantas
              return (
                <rect
                  key={`${indice}-${serie.nombre}`}
                  className={`barra ${serie.color}`}
                  x={MARGEN.izquierda + escala.banda * indice + escala.banda * 0.14 + anchoBarra * s}
                  y={Math.min(base, punta)}
                  width={Math.max(1, anchoBarra - 2)}
                  height={Math.max(1, Math.abs(base - punta))}
                />
              )
            }),
          )}
        </>
      )}
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Área apilada al 100 %
// ---------------------------------------------------------------------------

/**
 * El reparto mes a mes, normalizado. Al ir al 100 % lo que se ve es la
 * PROPORCIÓN, no el importe: es lo que interesa para "¿estoy gastando cada vez
 * más en cosas prescindibles?".
 */
export function GraficoAreaApilada({
  etiquetasX,
  series,
  titulo,
  alto = 220,
}: {
  etiquetasX: string[]
  series: { nombre: string; valores: (number | null)[]; color: string }[]
  titulo: string
  alto?: number
}) {
  // Proporciones por columna, con los negativos a cero: una porción negativa no
  // se puede apilar y falsearía el reparto.
  const proporciones = etiquetasX.map((_, indice) => {
    const valores = series.map((s) => Math.max(0, s.valores[indice] ?? 0))
    const total = valores.reduce((t, v) => t + v, 0)
    const hayDatos = series.some((s) => s.valores[indice] !== null)
    return hayDatos && total > 0 ? valores.map((v) => v / total) : null
  })

  return (
    <Marco
      columnas={etiquetasX.length}
      minimo={0}
      maximo={1}
      pasos={[0, 0.25, 0.5, 0.75, 1].map((v) => ({ valor: v, etiqueta: `${v * 100} %` }))}
      etiquetasX={etiquetasX}
      alto={alto}
      titulo={titulo}
      tooltip={(indice) => {
        const p = proporciones[indice]
        return (
          <>
            <strong>{etiquetasX[indice]}</strong>
            {p === null ? (
              <span className="tooltip-linea">Sin datos</span>
            ) : (
              series.map((serie, s) => (
                <span key={serie.nombre} className="tooltip-linea">
                  <span className={`tooltip-punto ${serie.color}`} aria-hidden="true" />
                  {serie.nombre}: <strong>{Math.round(p[s] * 100)} %</strong>
                  <span className="tooltip-nota"> {euros(serie.valores[indice])}</span>
                </span>
              ))
            )}
          </>
        )
      }}
    >
      {(escala) => (
        <>
          {etiquetasX.map((_, indice) => {
            const p = proporciones[indice]
            if (p === null) return null
            let acumulado = 0
            return series.map((serie, s) => {
              const desde = acumulado
              acumulado += p[s]
              const y1 = escala.y(acumulado)
              const y2 = escala.y(desde)
              return (
                <rect
                  key={`${indice}-${serie.nombre}`}
                  className={`area ${serie.color}`}
                  x={MARGEN.izquierda + escala.banda * indice}
                  y={y1}
                  width={escala.banda}
                  height={Math.max(0, y2 - y1)}
                />
              )
            })
          })}
        </>
      )}
    </Marco>
  )
}

// ---------------------------------------------------------------------------
// Mapa de calor
// ---------------------------------------------------------------------------

/**
 * Concepto × mes. Cada fila se colorea contra SU PROPIO máximo, no contra el
 * de la tabla: si no, la hipoteca lo pintaría todo y no se vería que los
 * regalos se disparan en diciembre, que es justo lo que se viene a buscar.
 */
export function MapaCalor({
  filas,
  onPulsarCelda,
}: {
  filas: { nombre: string; medias: (number | null)[]; puntaEn?: { mes: number } | null }[]
  onPulsarCelda?: (fila: number, mes: number) => void
}) {
  const MESES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

  return (
    <div className="mapa-calor-marco">
      <table className="mapa-calor">
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            {MESES.map((m, i) => (
              <th scope="col" key={i} abbr={String(i + 1)}>
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, indiceFila) => {
            const conDatos = fila.medias.filter((v): v is number => v !== null && v > 0)
            const maximo = conDatos.length ? Math.max(...conDatos) : 0
            return (
              <tr key={fila.nombre}>
                <th scope="row">{fila.nombre}</th>
                {fila.medias.map((valor, mes) => {
                  const intensidad = valor !== null && maximo > 0 ? Math.max(0, valor / maximo) : 0
                  return (
                    <td
                      key={mes}
                      className={`celda-calor${valor === null ? ' vacia' : ''}${
                        fila.puntaEn?.mes === mes + 1 ? ' punta' : ''
                      }`}
                      style={valor === null ? undefined : { '--intensidad': intensidad.toFixed(3) } as React.CSSProperties}
                      title={`${fila.nombre}, ${MESES[mes]}: ${valor === null ? 'sin datos' : euros(valor)}`}
                      onClick={onPulsarCelda ? () => onPulsarCelda(indiceFila, mes + 1) : undefined}
                    >
                      <span className="solo-lectores">
                        {valor === null ? 'sin datos' : euros(valor)}
                      </span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

/** Una línea diminuta sin ejes, para meter dentro de una fila de tabla. */
export function Sparkline({
  valores,
  titulo,
  ancho = 96,
  alto = 22,
}: {
  valores: (number | null)[]
  titulo: string
  ancho?: number
  alto?: number
}) {
  const limpios = valores.filter((v): v is number => v !== null)
  if (limpios.length < 2) return <span className="sparkline-vacia" aria-hidden="true" />

  const maximo = Math.max(...limpios)
  const minimo = Math.min(0, ...limpios)
  const rango = maximo - minimo || 1
  const paso = valores.length > 1 ? ancho / (valores.length - 1) : ancho

  const tramos: string[] = []
  let abierto = false
  valores.forEach((valor, indice) => {
    if (valor === null) {
      abierto = false
      return
    }
    const x = indice * paso
    const y = alto - ((valor - minimo) / rango) * (alto - 2) - 1
    tramos.push(`${abierto ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
    abierto = true
  })

  return (
    <svg className="sparkline" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={titulo}>
      <title>{titulo}</title>
      <path d={tramos.join(' ')} />
    </svg>
  )
}
