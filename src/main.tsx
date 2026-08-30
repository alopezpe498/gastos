import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Tres hojas y ninguna mas: las variables, las piezas comunes y lo que solo
// usa una pantalla. En ese orden, porque el orden es la cascada.
// Dos hojas y ninguna más: los tokens y la caja de componentes. Ninguna
// pantalla tiene CSS propio; si le falta algo, se añade a la caja.
import './styles/tokens.css'
import './styles/kit.css'
// Los nombres viejos de las piezas, mientras quedan pantallas por componer.
// Este fichero solo puede encoger.
import './styles/alias.css'

const raiz = document.getElementById('root')
if (raiz) createRoot(raiz).render(<StrictMode><App /></StrictMode>)

// El service worker solo se registra en produccion: en desarrollo estorba,
// porque servirian ficheros cacheados en vez de los que recarga Vite.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app sigue funcionando, solo pierde el modo offline.
    })
  })
}
