import { useEffect, useRef, useState } from 'react'

/**
 * Los micro-gráficos de la caja.
 *
 * Todos son SVG a mano, sin librería, porque son cuatro formas y una librería
 * de gráficos pesa más que la aplicación entera. Ninguno lleva rejilla, ni
 * leyenda cuando el título ya lo dice, ni ejes que no aporten.
 */

// ---------------------------------------------------------------------------
// SegmentBar
// ---------------------------------------------------------------------------

export type Segmento = { nombre: string; valor: number; color: string }

/**
 * La barra de tres tramos del hero: pagado, comprometido, libre.
 *
 * Los tramos se reparten por `flex` y no por porcentajes calculados: así el
 * navegador hace el reparto y no hay que preocuparse de que sumen 100.
 */
export function SegmentBar({ segmentos, leyenda }: { segmentos: Segmento[]; leyenda?: boolean }) {
  const total = segmentos.reduce((t, s) => t + Math.max(0, s.valor), 0)
  return (
    <>
      <div
        className="seg"
        role="img"
        aria-label={segmentos.map((s) => `${s.nombre} ${Math.round(s.valor)}`).join(', ')}
      >
        {segmentos.map((s) =>
          s.valor <= 0 ? null : (
            <span key={s.nombre} style={{ flex: s.valor, background: s.color }} />
          ),
        )}
        {total <= 0 ? <span style={{ flex: 1, background: 'var(--linea)' }} /> : null}
      </div>
      {leyenda === false ? null : null}
    </>
  )
}

export function Leyenda({ children }: { children: React.ReactNode }) {
  return <div className="leg">{children}</div>
}

export function LeyendaItem({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span>
      <i style={{ background: color }} />
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Ring
// ---------------------------------------------------------------------------

/**
 * Los dos anillos del hero: por fuera el mes transcurrido, por dentro el
 * dinero usado. Comparar los dos de un vistazo es lo que dice si vas rápido.
 */
export function Anillos({
  partePeriodo,
  parteGasto,
  centro,
  pie,
}: {
  partePeriodo: number
  parteGasto: number
  centro: string
  pie: string
}) {
  const perimetro = (r: number) => 2 * Math.PI * r
  const trazo = (r: number, parte: number) => {
    const p = perimetro(r)
    const visible = Math.max(0, Math.min(1, parte)) * p
    return `${visible} ${p - visible}`
  }

  return (
    <svg viewBox="0 0 150 150" width="150" height="150" role="img">
      <title>Anillos: mes transcurrido y dinero usado</title>
      <circle cx="75" cy="75" r="62" fill="none" stroke="#EFEFEA" strokeWidth="10" />
      <circle
        cx="75"
        cy="75"
        r="62"
        fill="none"
        stroke="var(--tinta)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={trazo(62, partePeriodo)}
        transform="rotate(-90 75 75)"
      />
      <circle cx="75" cy="75" r="46" fill="none" stroke="#EFEFEA" strokeWidth="10" />
      <circle
        cx="75"
        cy="75"
        r="46"
        fill="none"
        stroke="var(--acento)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={trazo(46, parteGasto)}
        transform="rotate(-90 75 75)"
      />
      <text
        x="75"
        y="70"
        textAnchor="middle"
        fontFamily="Manrope"
        fontWeight="800"
        fontSize="22"
        fill="#111"
      >
        {centro}
      </text>
      <text x="75" y="88" textAnchor="middle" fontFamily="Manrope" fontSize="10" fill="#7A7A75">
        {pie}
      </text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

/** Una línea con un punto al final. Sin ejes: lo que se mira es la forma. */
export function Sparkline({
  valores,
  color = 'var(--extras)',
  titulo,
}: {
  valores: number[]
  color?: string
  titulo: string
}) {
  const utiles = valores.filter((v) => Number.isFinite(v))
  if (utiles.length < 2) {
    return <div className="muted-3">Aún no hay suficientes días para dibujar la línea.</div>
  }

  const ancho = 200
  const alto = 30
  const maximo = Math.max(...utiles, 1)
  const paso = ancho / (utiles.length - 1)
  const puntos = utiles.map((v, i) => `${(i * paso).toFixed(1)},${(alto - (v / maximo) * (alto - 4) - 2).toFixed(1)}`)
  const [ultimoX, ultimoY] = puntos[puntos.length - 1].split(',')

  return (
    <svg className="sparkline" viewBox={`0 0 ${ancho} ${alto}`} height={alto} role="img">
      <title>{titulo}</title>
      <polyline
        points={puntos.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={ultimoX} cy={ultimoY} r="3.5" fill={color} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// DotRow
// ---------------------------------------------------------------------------

/** Un punto por recibo; se rellenan al cobrar. Máximo 24: más no se leen. */
export function Puntos({
  total,
  llenos,
  titulo,
}: {
  total: number
  llenos: number
  titulo: string
}) {
  const cuantos = Math.min(total, 24)
  return (
    <div className="dots" role="img" aria-label={titulo}>
      {Array.from({ length: cuantos }, (_, i) => (
        <span
          key={i}
          className="dot"
          style={{ background: i < llenos ? 'var(--tinta)' : 'var(--hueco)' }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Barras por día
// ---------------------------------------------------------------------------

/**
 * Una barrita por día del periodo.
 *
 * El viewBox se mide en días y no en píxeles: una barra ocupa lo mismo tenga
 * el mes 28 días o 31, y no hay anchos que calcular a mano.
 */
export function BarrasPorDia({
  valores,
  color = 'var(--extras)',
  suave = 'var(--extras-suave)',
  titulo,
  alto = 34,
}: {
  valores: number[]
  color?: string
  suave?: string
  titulo: string
  alto?: number
}) {
  const conGasto = valores.filter((v) => v > 0)
  const media = conGasto.length > 0 ? conGasto.reduce((a, b) => a + b, 0) / conGasto.length : 0
  const maximo = Math.max(...valores, 1)
  const ancho = Math.max(valores.length, 1)

  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      preserveAspectRatio="none"
      width="100%"
      height={alto}
      role="img"
      aria-label={titulo}
    >
      {valores.map((v, i) =>
        v <= 0 ? null : (
          <rect
            key={i}
            x={i + 0.19}
            y={alto - Math.max(2, (v / maximo) * alto)}
            width={0.62}
            height={Math.max(2, (v / maximo) * alto)}
            /* Los días que pasan del doble de la media, en el color intenso. */
            fill={v > media * 2 ? color : suave}
          />
        ),
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Barra de progreso simple
// ---------------------------------------------------------------------------

export function BarraProgreso({
  parte,
  color = 'var(--comida)',
  titulo,
}: {
  parte: number
  color?: string
  titulo: string
}) {
  return (
    <div
      className="barra-sobre"
      role="img"
      aria-label={`${titulo}: ${Math.round(parte * 100)} %`}
    >
      <span style={{ width: `${Math.min(100, Math.max(0, parte * 100))}%`, background: color }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cifra que cuenta
// ---------------------------------------------------------------------------

/**
 * La cifra grande del hero, contando desde cero.
 *
 * 900 ms con ease-out y una sola vez: es un guiño al abrir, no una animación
 * que se repita cada vez que cambia un céntimo. Con `prefers-reduced-motion`
 * aparece ya puesta.
 */
export function CifraQueCuenta({ valor, formato }: { valor: number; formato: (n: number) => string }) {
  const [mostrado, setMostrado] = useState(valor)
  const yaContado = useRef(false)

  useEffect(() => {
    if (yaContado.current) {
      setMostrado(valor)
      return
    }
    yaContado.current = true

    const sinMovimiento =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (sinMovimiento) {
      setMostrado(valor)
      return
    }

    let cancelado = false
    let inicio: number | null = null
    const paso = (ahora: number) => {
      if (cancelado) return
      if (inicio === null) inicio = ahora
      const p = Math.min((ahora - inicio) / 900, 1)
      const suavizado = 1 - Math.pow(1 - p, 3)
      setMostrado(valor * suavizado)
      if (p < 1) requestAnimationFrame(paso)
    }
    requestAnimationFrame(paso)
    return () => {
      cancelado = true
    }
  }, [valor])

  return <>{formato(mostrado)}</>
}
