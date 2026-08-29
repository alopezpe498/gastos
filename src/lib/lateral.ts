import { useEffect, useState } from 'react'

/**
 * Estado de la barra lateral de escritorio: completa o en modo iconos.
 *
 * Manda siempre lo que haya elegido quien usa la app. Mientras no elija nada,
 * el ancho de la ventana decide: en una ventana estrecha (la tipica de la PWA
 * instalada) la barra estorba mas de lo que ayuda, asi que arranca en iconos.
 *
 * La preferencia se guarda en localStorage y no caduca: si un dia se elige
 * "completa" en una ventana pequena, se respeta aunque el ancho diga otra cosa.
 */

const CLAVE = 'menusemanal:lateral'

/** Por debajo de este ancho la barra arranca colapsada. */
export const CORTE_LATERAL_ESTRECHO = 1280

type Preferencia = 'iconos' | 'completa' | null

function leerPreferencia(): Preferencia {
  try {
    const guardada = window.localStorage.getItem(CLAVE)
    return guardada === 'iconos' || guardada === 'completa' ? guardada : null
  } catch {
    // Modo privado o almacenamiento bloqueado: se sigue sin preferencia.
    return null
  }
}

function guardarPreferencia(valor: Exclude<Preferencia, null>) {
  try {
    window.localStorage.setItem(CLAVE, valor)
  } catch {
    // Que no se pueda recordar no es motivo para que deje de funcionar.
  }
}

const ventanaEstrecha = () =>
  typeof window !== 'undefined' && window.innerWidth < CORTE_LATERAL_ESTRECHO

export function useLateralColapsada(): [boolean, () => void] {
  const [preferencia, setPreferencia] = useState<Preferencia>(() =>
    typeof window === 'undefined' ? null : leerPreferencia(),
  )
  const [estrecha, setEstrecha] = useState(ventanaEstrecha)

  // El ancho solo se vigila mientras no haya eleccion manual: en cuanto la hay,
  // redimensionar la ventana no debe deshacerla.
  useEffect(() => {
    if (preferencia !== null || typeof window === 'undefined') return
    const alCambiar = () => setEstrecha(ventanaEstrecha())
    window.addEventListener('resize', alCambiar)
    alCambiar()
    return () => window.removeEventListener('resize', alCambiar)
  }, [preferencia])

  const colapsada = preferencia === null ? estrecha : preferencia === 'iconos'

  const alternar = () => {
    const siguiente = colapsada ? 'completa' : 'iconos'
    setPreferencia(siguiente)
    guardarPreferencia(siguiente)
  }

  return [colapsada, alternar]
}
