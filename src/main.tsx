import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Tres hojas y ninguna mas: las variables, las piezas comunes y lo que solo
// usa una pantalla. En ese orden, porque el orden es la cascada.
import './styles/tokens.css'
import './styles/app.css'
import './styles/pantallas.css'

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
