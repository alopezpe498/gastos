import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * La línea que dice qué acaba de pasar.
 *
 * Va justo debajo de la barra de arriba, donde estabas mirando, y no flotando
 * al final de la página: un aviso que aparece fuera de la pantalla no es un
 * aviso. Cuando lo que ha pasado se puede deshacer, lo lleva ahí mismo; es el
 * único sitio donde tiene sentido ofrecerlo, porque es cuando te acabas de dar
 * cuenta de que no querías hacerlo.
 */

type Aviso = {
  id: number
  texto: string
  tipo: 'info' | 'error'
  deshacer?: () => void | Promise<void>
}

type Opciones = { deshacer?: () => void | Promise<void> }

type ContextoAvisos = {
  avisar: (texto: string, opciones?: Opciones) => void
  avisarError: (texto: string) => void
}

const Contexto = createContext<ContextoAvisos>({ avisar: () => {}, avisarError: () => {} })

export const useAvisos = () => useContext(Contexto)

/** Dónde aterriza la línea: lo pinta la barra de navegación. */
export const HUECO_AVISOS = 'avisos-de-la-pantalla'

let siguienteId = 1

/*
 * Con «Deshacer» dura más: hay que leer la frase, entender que te has
 * equivocado y llegar al botón. Sin él, lo justo para leerla.
 */
const DURACION = 3600
const DURACION_CON_DESHACER = 9000

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [hueco, setHueco] = useState<HTMLElement | null>(null)

  // El hueco lo pinta la barra, así que no existe hasta después del primer
  // render. En la pantalla del PIN no hay barra y la línea se queda flotando.
  useEffect(() => {
    setHueco(document.getElementById(HUECO_AVISOS))
  })

  const quitar = useCallback((id: number) => {
    setAvisos((actuales) => actuales.filter((a) => a.id !== id))
  }, [])

  const mostrar = useCallback(
    (texto: string, tipo: 'info' | 'error', deshacer?: () => void | Promise<void>) => {
      const id = siguienteId++
      // Uno cada vez: dos frases seguidas debajo de la barra empujan la página.
      setAvisos([{ id, texto, tipo, deshacer }])
      setTimeout(() => quitar(id), deshacer ? DURACION_CON_DESHACER : DURACION)
    },
    [quitar],
  )

  const valor = useMemo(
    () => ({
      avisar: (texto: string, opciones?: Opciones) => mostrar(texto, 'info', opciones?.deshacer),
      avisarError: (texto: string) => mostrar(texto, 'error'),
    }),
    [mostrar],
  )

  const linea = (
    <div className={`avisos${hueco ? '' : ' avisos-flotantes'}`} aria-live="polite">
      {avisos.map((aviso) => (
        <div key={aviso.id} className={`aviso${aviso.tipo === 'error' ? ' error' : ''}`}>
          <span>{aviso.texto}</span>
          {aviso.deshacer ? (
            <button
              className="aviso-boton"
              onClick={() => {
                quitar(aviso.id)
                void aviso.deshacer?.()
              }}
            >
              Deshacer
            </button>
          ) : null}
          <button
            className="aviso-cerrar"
            aria-label="Cerrar el aviso"
            onClick={() => quitar(aviso.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )

  return (
    <Contexto.Provider value={valor}>
      {children}
      {hueco ? createPortal(linea, hueco) : linea}
    </Contexto.Provider>
  )
}
