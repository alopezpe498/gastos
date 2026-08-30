import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icono, type NombreIcono } from './Icono'

/**
 * Las piezas sueltas de la caja: botones, cabeceras, pestañas, tarjetas, chips.
 *
 * Todas escriben clases de kit.css y ninguna acepta estilos por parámetro. Si
 * una pantalla necesita algo distinto, se añade una variante aquí; así el
 * aspecto se cambia en un sitio y no en cuarenta.
 */

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

type PropsBoton = {
  children?: ReactNode
  onClick?: () => void
  disabled?: boolean
  icono?: NombreIcono
  peligro?: boolean
  /** Para los que abren algo: el lector de pantalla necesita saberlo. */
  expandido?: boolean
  titulo?: string
}

/** El único botón negro de la pantalla. Si hay dos, uno sobra. */
export function BotonPrimario({ children, onClick, disabled, icono, peligro }: PropsBoton) {
  return (
    <button
      className={`btn-primary${peligro ? ' peligro' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icono ? <Icono nombre={icono} size={15} /> : null}
      {children}
    </button>
  )
}

export function BotonTexto({ children, onClick, disabled, icono, peligro }: PropsBoton) {
  return (
    <button className={`btn-text${peligro ? ' peligro' : ''}`} onClick={onClick} disabled={disabled}>
      {icono ? <Icono nombre={icono} size={15} /> : null}
      {children}
    </button>
  )
}

export function BotonIcono({
  icono,
  etiqueta,
  onClick,
  disabled,
  expandido,
  size = 16,
}: {
  icono: NombreIcono
  etiqueta: string
  onClick?: () => void
  disabled?: boolean
  expandido?: boolean
  size?: number
}) {
  return (
    <button
      className="btn-icono"
      aria-label={etiqueta}
      title={etiqueta}
      aria-expanded={expandido}
      onClick={onClick}
      disabled={disabled}
    >
      <Icono nombre={icono} size={size} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// PageHeader
// ---------------------------------------------------------------------------

export function Cabecera({
  titulo,
  subtitulo,
  acciones,
  debajo,
}: {
  titulo: string
  subtitulo?: string
  acciones?: ReactNode
  debajo?: ReactNode
}) {
  return (
    <header className="cabecera">
      <div>
        <h1 className="cabecera-titulo">{titulo}</h1>
        {subtitulo ? <p className="cabecera-sub">{subtitulo}</p> : null}
        {debajo ? <div style={{ marginTop: 10 }}>{debajo}</div> : null}
      </div>
      {acciones ? <div className="cabecera-acciones">{acciones}</div> : null}
    </header>
  )
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export type Pestana<T extends string> = { id: T; nombre: string }

/**
 * Pestañas dentro de una píldora gris; la activa, blanca con sombra.
 *
 * Nunca subrayadas y nunca con borde: un recuadro alrededor de la activa se
 * lee como un anillo de foco, y el foco es otra cosa.
 */
export function Tabs<T extends string>({
  pestanas,
  activa,
  onCambiar,
}: {
  pestanas: Pestana<T>[]
  activa: T
  onCambiar: (id: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {pestanas.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={activa === p.id}
          className={`tab${activa === p.id ? ' on' : ''}`}
          onClick={() => onCambiar(p.id)}
        >
          {p.nombre}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card y Tile
// ---------------------------------------------------------------------------

export function Card({
  titulo,
  ayuda,
  derecha,
  children,
  className = '',
}: {
  titulo?: string
  ayuda?: string
  derecha?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className}`.trim()}>
      {titulo || derecha ? (
        <div className="card-cabecera">
          <div>
            <h2 className="card-titulo">{titulo}</h2>
            {ayuda ? <p className="card-ayuda">{ayuda}</p> : null}
          </div>
          {derecha}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** Un cuadradito de icono con el fondo suave de su color. */
export function IconoConcepto({
  icono,
  color,
  suave,
  size = 16,
}: {
  icono: string
  color: string
  suave: string
  size?: number
}) {
  return (
    <span className="ico" style={{ background: suave, color }}>
      <Icono nombre={icono} size={size} />
    </span>
  )
}

export function Tile({
  icono,
  color,
  suave,
  etiqueta,
  cifra,
  sufijo,
  frase,
  children,
  className = '',
}: {
  icono: NombreIcono
  color?: string
  suave?: string
  etiqueta: string
  cifra: string
  /** Lo que va detrás de la cifra en pequeño, como «/ 500». Puede ser un
      campo: el presupuesto se cambia donde se lee, no en otra pantalla. */
  sufijo?: ReactNode
  frase?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={`card tile ${className}`.trim()}>
      <div className="tile-h">
        <IconoConcepto
          icono={icono}
          color={color ?? 'var(--tinta-2)'}
          suave={suave ?? 'var(--linea)'}
        />
        {etiqueta}
      </div>
      <div className="tile-n">
        {cifra}
        {sufijo ? <small> {sufijo}</small> : null}
      </div>
      {children}
      {frase ? <div className="tile-pie">{frase}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

export function Chip({
  children,
  color,
  suave,
  punto,
  onClick,
  etiqueta,
}: {
  children: ReactNode
  color?: string
  suave?: string
  /** Un punto del color delante, para las etiquetas de concepto. */
  punto?: boolean
  onClick?: () => void
  etiqueta?: string
}) {
  const estilo = { background: suave, color }
  if (!onClick) {
    return (
      <span className="chip" style={estilo}>
        {punto ? <span className="dot" style={{ background: color }} /> : null}
        {children}
      </span>
    )
  }
  return (
    <button className="chip pulsable" style={estilo} onClick={onClick} aria-label={etiqueta}>
      {punto ? <span className="dot" style={{ background: color }} /> : null}
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export function Check({
  marcado,
  tarde = false,
  etiqueta,
  onClick,
}: {
  marcado: boolean
  tarde?: boolean
  etiqueta: string
  onClick?: () => void
}) {
  const clase = `check${marcado ? ' on' : tarde ? ' late' : ''}`
  if (!onClick) return <span className={clase}>{marcado ? <Icono nombre="check" size={12} /> : null}</span>
  return (
    <button className={clase} aria-label={etiqueta} aria-pressed={marcado} onClick={onClick}>
      {marcado ? <Icono nombre="check" size={12} /> : null}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Interruptor
// ---------------------------------------------------------------------------

export function Interruptor({
  activo,
  etiqueta,
  onCambiar,
}: {
  activo: boolean
  etiqueta: string
  onCambiar: (valor: boolean) => void
}) {
  return (
    <button
      className="interruptor"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onCambiar(!activo)}
    />
  )
}

// ---------------------------------------------------------------------------
// EmptyState y estados
// ---------------------------------------------------------------------------

export function Vacio({
  icono = 'nota',
  frase,
  accion,
  onAccion,
}: {
  icono?: NombreIcono
  frase: string
  accion?: string
  onAccion?: () => void
}) {
  return (
    <div className="vacio">
      <span className="ico">
        <Icono nombre={icono} size={16} />
      </span>
      <p className="vacio-frase">{frase}</p>
      {accion && onAccion ? <BotonTexto onClick={onAccion}>{accion}</BotonTexto> : null}
    </div>
  )
}

export function Cargando({ texto = 'Un momento…' }: { texto?: string }) {
  return <div className="cargando">{texto}</div>
}

export function Esqueleto({ filas = 6 }: { filas?: number }) {
  return (
    <div className="esqueleto" aria-hidden="true">
      {Array.from({ length: filas }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  )
}

export function ErrorLinea({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
  if (!mensaje) return null
  return (
    <div className="vacio">
      <span className="ico" style={{ background: 'var(--comida-suave)', color: 'var(--comida)' }}>
        <Icono nombre="aviso" size={16} />
      </span>
      <p className="vacio-frase">{mensaje}</p>
      {onReintentar ? <BotonTexto onClick={onReintentar}>Reintentar</BotonTexto> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Menú de una fila
// ---------------------------------------------------------------------------

export type OpcionMenu = { id: string; nombre: string; icono?: NombreIcono; peligro?: boolean }

export function MenuFila({
  etiqueta,
  opciones,
  onElegir,
}: {
  etiqueta: string
  opciones: OpcionMenu[]
  onElegir: (id: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  return (
    <span className="row-acciones" ref={caja}>
      <BotonIcono
        icono="puntos"
        etiqueta={etiqueta}
        expandido={abierto}
        onClick={() => setAbierto((a) => !a)}
      />
      {abierto ? (
        <span className="menu">
          {opciones.map((o) => (
            <button
              key={o.id}
              className={o.peligro ? 'peligro' : undefined}
              onClick={() => {
                setAbierto(false)
                onElegir(o.id)
              }}
            >
              {o.icono ? <Icono nombre={o.icono} size={15} /> : null}
              {o.nombre}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}
