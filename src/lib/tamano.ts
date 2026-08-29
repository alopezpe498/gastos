import { useEffect, useState } from 'react'

/**
 * Los tres tamanos de la app. El movil es el diseno original y no cambia; el
 * tablet vertical usa ese mismo diseno con mas aire; el escritorio tiene su
 * propia presentacion (tabla semanal, barra lateral, dos paneles).
 */
export type Tamano = 'movil' | 'tablet' | 'escritorio'

export const CORTE_TABLET = 768
export const CORTE_ESCRITORIO = 1024

const consulta = `(min-width: ${CORTE_ESCRITORIO}px)`
const consultaTablet = `(min-width: ${CORTE_TABLET}px)`

function medir(): Tamano {
  if (typeof window === 'undefined' || !window.matchMedia) return 'movil'
  if (window.matchMedia(consulta).matches) return 'escritorio'
  if (window.matchMedia(consultaTablet).matches) return 'tablet'
  return 'movil'
}

/**
 * Tamano actual, recalculado cuando cambia el ancho de la ventana.
 * Es la unica fuente de verdad: los componentes deciden que presentacion pintan
 * a partir de esto, sin duplicar la logica que hay debajo.
 */
export function useTamano(): Tamano {
  const [tamano, setTamano] = useState<Tamano>(medir)

  useEffect(() => {
    if (!window.matchMedia) return
    const escritorio = window.matchMedia(consulta)
    const tablet = window.matchMedia(consultaTablet)
    const alCambiar = () => setTamano(medir())

    escritorio.addEventListener('change', alCambiar)
    tablet.addEventListener('change', alCambiar)
    // Por si el ancho cambio entre el primer render y el efecto.
    alCambiar()
    return () => {
      escritorio.removeEventListener('change', alCambiar)
      tablet.removeEventListener('change', alCambiar)
    }
  }, [])

  return tamano
}

export function useEsEscritorio(): boolean {
  return useTamano() === 'escritorio'
}
