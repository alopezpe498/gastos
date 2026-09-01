import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { RUTA_BD } from './db/index.js'
import { sembrar } from './db/semilla.js'
import { sembrarReglas } from './db/semillaReglas.js'
import { sembrarFormatos } from './db/formatosBanco.js'
import { sembrarCategorias } from './db/semillaProductos.js'
import { exigirAuth, PROTEGIDO } from './lib/auth.js'
import { fallo } from './lib/http.js'
import { ErrorLectura } from './services/lecturaExcel.js'
import { ErrorIa } from './services/ia.js'
import { rutasAuth } from './routes/auth.js'
import { rutasConceptos } from './routes/conceptos.js'
import { rutasPlantilla } from './routes/plantilla.js'
import { rutasReglas } from './routes/reglas.js'
import { rutasExtracto } from './routes/extracto.js'
import { rutasMeses } from './routes/meses.js'
import { rutasMovimientos } from './routes/movimientos.js'
import { rutasAnual } from './routes/anual.js'
import { rutasConfig } from './routes/config.js'
import { rutasImportar } from './routes/importar.js'
import { rutasExportar } from './routes/exportar.js'
import { rutasAnalitica } from './routes/analitica.js'
import { rutasTickets } from './routes/tickets.js'
import { rutasProductos, rutasCategoriasProducto } from './routes/productos.js'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(aqui, '..')
const DIST = path.join(RAIZ, 'dist')
const PUERTO = Number(process.env.PORT) || 3003

// Catalogo inicial la primera vez que arranca. Si ya hay conceptos, no toca nada.
const sembrado = sembrar()
// Las reglas del extracto se cargan aparte: el catalogo puede llevar meses
// creado y aun asi no tener reglas, porque son de la fase 3.
const reglasSembradas = sembrarReglas()
sembrarFormatos()
// El catalogo de la compra: catorce categorias y el cajon de «Otros».
sembrarCategorias()

const app = express()
// Detras de nginx: req.ip debe ser la IP real para que el limitador de intentos
// no bloquee a toda la familia por culpa de un solo dispositivo.
app.set('trust proxy', 1)
// El limite alto es para la importacion, que sube el .xlsx o la foto como
// base64. Va a la par con el client_max_body_size de nginx (20M): subirlo aqui
// sin subirlo alli solo cambia quien da el error.
app.use(express.json({ limit: '20mb' }))

app.use('/api/auth', rutasAuth)

// Todo lo que va por debajo exige el PIN (si hay APP_PIN definida).
app.use('/api', exigirAuth)
app.use('/api/conceptos', rutasConceptos)
app.use('/api/plantilla', rutasPlantilla)
app.use('/api/reglas', rutasReglas)
app.use('/api/extracto', rutasExtracto)
app.use('/api/meses', rutasMeses)
app.use('/api/movimientos', rutasMovimientos)
app.use('/api/anual', rutasAnual)
app.use('/api/tickets', rutasTickets)
app.use('/api/productos', rutasProductos)
app.use('/api/categorias-producto', rutasCategoriasProducto)
app.use('/api/config', rutasConfig)
app.use('/api/importar', rutasImportar)
app.use('/api/exportar', rutasExportar)
app.use('/api/analitica', rutasAnalitica)

app.use('/api', (req, res) => fallo(res, 404, 'Esa direccion de la API no existe.'))

// En produccion este mismo proceso sirve el frontend construido.
if (fs.existsSync(DIST)) {
  app.use(
    express.static(DIST, {
      // index.html y el service worker no se cachean, para que una version
      // nueva se vea nada mas recargar; el resto lleva hash en el nombre.
      setHeaders: (res, archivo) => {
        const nombre = path.basename(archivo)
        if (nombre === 'index.html' || nombre === 'sw.js') {
          res.setHeader('Cache-Control', 'no-cache')
        } else if (archivo.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }),
  )
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

// Manejador de errores final: siempre { error: "mensaje en espanol" }.
app.use((error, req, res, siguiente) => {
  if (res.headersSent) return siguiente(error)
  if (error instanceof ErrorLectura) return fallo(res, error.codigo, error.message)
  if (error instanceof ErrorIa) return fallo(res, error.codigo, error.message)
  if (error?.type === 'entity.too.large') {
    return fallo(res, 413, 'El archivo es demasiado grande. Prueba con uno mas pequeno.')
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return fallo(res, 400, 'La peticion no se ha entendido.')
  }
  console.error('[gastos] error no controlado:', error)
  return fallo(res, 500, 'Algo ha fallado en el servidor. Reintenta en un momento.')
})

const servidor = app.listen(PUERTO, () => {
  console.log(`[gastos] escuchando en http://127.0.0.1:${PUERTO}`)
  console.log(`[gastos] base de datos: ${RUTA_BD}`)
  if (sembrado) console.log('[gastos] catalogo inicial de conceptos creado')
  if (reglasSembradas.creadas > 0) {
    const extra = reglasSembradas.conceptosCreados.length
      ? ` (y los conceptos ${reglasSembradas.conceptosCreados.join(', ')})`
      : ''
    const rehechas = reglasSembradas.borradas > 0 ? ' (actualizadas)' : ''
    console.log(
      `[gastos] ${reglasSembradas.creadas} reglas de clasificacion cargadas${rehechas}${extra}`,
    )
  }
  if (!PROTEGIDO) {
    console.warn(
      '[gastos] AVISO: APP_PIN no esta definida, la aplicacion arranca SIN proteccion por PIN.',
    )
  }
  if (!fs.existsSync(DIST)) {
    console.log('[gastos] no hay carpeta dist/: modo desarrollo, el frontend lo sirve Vite.')
  }
})

/*
 * El puerto ocupado es el error mas comun al arrancar en local, y casi siempre
 * es un servidor viejo que se quedo colgado. Sin esto, node escupe un volcado de
 * pila de veinte lineas que no dice que hacer; y en modo --watch se queda
 * esperando un cambio de fichero que no llega, asi que conviene decir tambien
 * que hay que relanzarlo a mano.
 */
servidor.on('error', (error) => {
  if (error.code !== 'EADDRINUSE') throw error
  console.error(
    [
      '',
      `[gastos] El puerto ${PUERTO} ya esta ocupado, seguramente por otro`,
      '         servidor de gastos que se quedo abierto. Para ver cual es:',
      '',
      `           netstat -ano | findstr :${PUERTO}`,
      '           taskkill /PID <el numero de la ultima columna> /F',
      '',
      '         Despues, Ctrl+C aqui y "npm run dev" otra vez: en modo --watch',
      '         esto no se reintenta solo.',
      '',
    ].join('\n'),
  )
  process.exit(1)
})
