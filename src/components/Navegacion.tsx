import { useState, type ComponentType } from 'react'

/**
 * La navegación de «La libreta».
 *
 * Fuera el menú lateral de iconos: ocupaba una columna entera para decir seis
 * palabras, y hacía que la app pareciera un panel de administración. Aquí es
 * una línea fina sobre el papel, con las secciones en texto y la activa
 * subrayada con el sello.
 *
 * En móvil baja abajo, que es donde llega el pulgar, y ahí sí lleva iconos
 * porque no cabe otra cosa.
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
  /** A la derecha de la barra: ajustes, bloquear. */
  extra?: React.ReactNode
}

export function BarraSuperior<T extends string>({ secciones, activa, onIr, extra }: Props<T>) {
  return (
    <header className="barra-superior">
      <div className="limite barra-superior-fila">
        <span className="marca">Gastos</span>

        <nav className="barra-secciones" aria-label="Secciones">
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
        </nav>

        <div className="barra-extra">{extra}</div>
      </div>
    </header>
  )
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
        <div className="barra-mas">
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
