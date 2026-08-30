import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icono, type NombreIcono } from './Icono'
import { HUECO_TOAST } from './Toast'

/**
 * La navegación: una píldora blanca flotante con icono y texto.
 *
 * En el móvil baja al pulgar y se queda solo con los iconos. Las dos se pintan
 * siempre y quién se ve lo decide el CSS, no el JavaScript: así no hay un salto
 * al cargar mientras se mide la ventana.
 */

export type Seccion<T extends string> = { id: T; nombre: string; icono: NombreIcono }

/** Dónde aterrizan las acciones de la pantalla activa. */
const HUECO_ACCIONES = 'acciones-de-la-pantalla'

export function Navegacion<T extends string>({
  secciones,
  activa,
  onIr,
}: {
  secciones: Seccion<T>[]
  activa: T
  onIr: (id: T) => void
}) {
  return (
    <>
      <nav className="nav" aria-label="Secciones">
        <span className="marca">
          gastos<span>.</span>
        </span>

        <div className="pill">
          {secciones.map((s) => (
            <button
              key={s.id}
              className={`pill-boton${activa === s.id ? ' on' : ''}`}
              aria-current={activa === s.id ? 'page' : undefined}
              onClick={() => onIr(s.id)}
            >
              <Icono nombre={s.icono} size={15} />
              {s.nombre}
            </button>
          ))}
        </div>

        <div className="nav-acciones" id={HUECO_ACCIONES} />
        {/* La línea de «qué acaba de pasar» va aquí debajo, a renglón propio. */}
        <div id={HUECO_TOAST} className="toast-hueco" />
      </nav>

      <nav className="nav-abajo" aria-label="Secciones">
        {secciones.map((s) => (
          <button
            key={s.id}
            className={`pill-boton${activa === s.id ? ' on' : ''}`}
            aria-current={activa === s.id ? 'page' : undefined}
            onClick={() => onIr(s.id)}
          >
            <Icono nombre={s.icono} size={17} />
            {s.nombre}
          </button>
        ))}
      </nav>
    </>
  )
}

/**
 * Las acciones de la pantalla activa, arriba a la derecha.
 *
 * Van por portal y no por props porque quien sabe qué se puede hacer con un mes
 * es la pantalla Mes, no la aplicación. Pasarlo hacia arriba obligaría a `App`
 * a conocer el mes abierto, que es justo lo que no queremos.
 */
export function Acciones({ children }: { children: ReactNode }) {
  const [hueco, setHueco] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setHueco(document.getElementById(HUECO_ACCIONES))
  }, [])
  return hueco ? createPortal(children, hueco) : null
}
