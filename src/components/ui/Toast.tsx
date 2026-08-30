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
import { BotonIcono } from './Basicos'

/**
 * La línea que dice qué acaba de pasar.
 *
 * Va justo debajo de la navegación, donde estabas mirando, y no flotando al
 * final de la página: un aviso que aparece fuera de la pantalla no es un aviso.
 * Cuando lo que ha pasado se puede deshacer, lo lleva ahí mismo, que es cuando
 * te acabas de dar cuenta de que no querías hacerlo.
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

/** Dónde aterriza la línea: lo pinta la navegación. */
export const HUECO_TOAST = 'toast-de-la-pantalla'

let siguienteId = 1
const DURACION = 5000

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [hueco, setHueco] = useState<HTMLElement | null>(null)

  // El hueco lo pinta la navegación, así que no existe hasta después del primer
  // render. En la pantalla del PIN no hay navegación y la línea flota abajo.
  useEffect(() => {
    setHueco(document.getElementById(HUECO_TOAST))
  })

  const quitar = useCallback((id: number) => {
    setAvisos((actuales) => actuales.filter((a) => a.id !== id))
  }, [])

  const mostrar = useCallback(
    (texto: string, tipo: 'info' | 'error', deshacer?: () => void | Promise<void>) => {
      const id = siguienteId++
      // Uno cada vez: dos frases seguidas debajo de la barra empujan la página.
      setAvisos([{ id, texto, tipo, deshacer }])
      setTimeout(() => quitar(id), DURACION)
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
    <div className={`toasts${hueco ? '' : ' flotante'}`} aria-live="polite">
      {avisos.map((aviso) => (
        <div key={aviso.id} className={`toast${aviso.tipo === 'error' ? ' error' : ''}`}>
          <span>{aviso.texto}</span>
          {aviso.deshacer ? (
            <button
              onClick={() => {
                quitar(aviso.id)
                void aviso.deshacer?.()
              }}
            >
              Deshacer
            </button>
          ) : null}
          <BotonIcono icono="cerrar" etiqueta="Cerrar el aviso" size={13} onClick={() => quitar(aviso.id)} />
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
