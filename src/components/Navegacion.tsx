import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * La navegación.
 *
 * En pantalla grande es una sola línea sobre el fondo: la marca, las secciones
 * en texto con la activa subrayada, y a la derecha las acciones de la pantalla
 * en la que estás. No hay columna lateral ni cabecera con fondo propio; el
 * contenido empieza catorce píxeles más abajo y ya está.
 *
 * En móvil la línea baja al pulgar y ahí sí lleva iconos, porque no cabe otra
 * cosa. Las dos se pintan siempre: quién se ve lo decide el CSS, no el
 * JavaScript, y así no hay un salto al cargar.
 */

export type Seccion<T extends string> = {
  id: T
  nombre: string
  icono: ComponentType<{ size?: number; className?: string }>
  /** En móvil no caben todas: las que sobran van al menú de «Más». */
  enMovil?: boolean
}

type Props<T extends string> = {
  secciones: Seccion<T>[]
  activa: T
  onIr: (id: T) => void
}

/** Dónde aterrizan las acciones de cada pantalla. */
const HUECO_ACCIONES = 'acciones-de-la-pantalla'

export function BarraSuperior<T extends string>({ secciones, activa, onIr }: Props<T>) {
  return (
    <nav className="barra" aria-label="Secciones">
      <span className="marca">
        gastos<span>.</span>
      </span>

      <div className="barra-secciones">
        {secciones.map((s) => (
          <button
            key={s.id}
            className={`barra-seccion${activa === s.id ? ' activa' : ''}`}
            aria-current={activa === s.id ? 'page' : undefined}
            onClick={() => onIr(s.id)}
          >
            {s.nombre}
          </button>
        ))}
      </div>
      <div className="barra-acciones" id={HUECO_ACCIONES} />
    </nav>
  )
}

/**
 * Las acciones de la pantalla activa, pintadas arriba a la derecha.
 *
 * Van por portal y no por props porque quien sabe qué se puede hacer con un
 * mes es la pantalla Mes, no la aplicación. Pasarlo hacia arriba obligaría a
 * `App` a conocer el mes abierto, y eso es justo lo que no queremos.
 */
export function Acciones({ children }: { children: ReactNode }) {
  const [hueco, setHueco] = useState<HTMLElement | null>(null)

  // El hueco lo pinta la barra, así que no existe hasta después del primer
  // render: se busca en el efecto, no durante el render.
  useEffect(() => {
    setHueco(document.getElementById(HUECO_ACCIONES))
  }, [])

  return hueco ? createPortal(children, hueco) : null
}

export function BarraInferior<T extends string>({ secciones, activa, onIr }: Props<T>) {
  const [mas, setMas] = useState(false)
  const visibles = secciones.filter((s) => s.enMovil !== false)
  const enElMenu = secciones.filter((s) => s.enMovil === false)

  return (
    <nav className="barra-inferior" aria-label="Secciones">
      {visibles.map((s) => {
        const Icono = s.icono
        return (
          <button
            key={s.id}
            className={`barra-inferior-boton${activa === s.id ? ' activa' : ''}`}
            aria-current={activa === s.id ? 'page' : undefined}
            onClick={() => onIr(s.id)}
          >
            <Icono size={18} />
            <span>{s.nombre}</span>
          </button>
        )
      })}

      {/* Las que no caben abajo viven aquí: cinco es el tope con el pulgar. */}
      {enElMenu.length > 0 ? (
        <button
          className={`barra-inferior-boton${enElMenu.some((s) => s.id === activa) ? ' activa' : ''}`}
          onClick={() => setMas((m) => !m)}
          aria-expanded={mas}
        >
          <span aria-hidden="true">···</span>
          <span>Más</span>
        </button>
      ) : null}

      {mas ? (
        <div className="menu menu-abajo">
          {enElMenu.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setMas(false)
                onIr(s.id)
              }}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      ) : null}
    </nav>
  )
}
