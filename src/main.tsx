import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// LA LIBRETA. tokens.css primero (las variables) y base.css al final, para que
// sus reglas ganen a las del diseño anterior mientras queda CSS por retirar.
import './styles/tokens.css'
import './styles/global.css'
import './styles/base-pantallas.css'
import './styles/dinero.css'
import './styles/componentes.css'
import './styles/pantallas.css'
import './styles/mes.css'
import './styles/importar.css'
import './styles/anual.css'
import './styles/analisis.css'
import './styles/graficos.css'
import './styles/analitica.css'
import './styles/informe.css'
import './styles/escritorio.css'
import './styles/base.css'

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
