import { useEffect, useState } from 'react'

/**
 * Claro, oscuro, o lo que diga el sistema.
 *
 * La preferencia vive en el navegador, no en el servidor: es de este aparato,
 * no de la familia. El móvil puede estar en oscuro y el portátil en claro.
 *
 * Todo el cambio de piel lo hacen los tokens: aquí solo se pone un atributo en
 * el <html> y tokens.css se encarga del resto.
 */

export type Tema = 'sistema' | 'claro' | 'oscuro'

const CLAVE = 'gastos.tema'

function leer(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE)
    return guardado === 'claro' || guardado === 'oscuro' ? guardado : 'sistema'
  } catch {
    // Un navegador con el almacenamiento bloqueado sigue funcionando: sistema.
    return 'sistema'
  }
}

export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement
  if (tema === 'sistema') raiz.removeAttribute('data-tema')
  else raiz.setAttribute('data-tema', tema)
}

/** Se llama una vez al arrancar, antes de pintar nada. */
export function temaInicial() {
  aplicarTema(leer())
}

export function useTema(): [Tema, (tema: Tema) => void] {
  const [tema, setTema] = useState<Tema>(leer)

  useEffect(() => {
    aplicarTema(tema)
    try {
      if (tema === 'sistema') localStorage.removeItem(CLAVE)
      else localStorage.setItem(CLAVE, tema)
    } catch {
      // Si no se puede guardar, al menos se aplica en esta sesión.
    }
  }, [tema])

  return [tema, setTema]
}
