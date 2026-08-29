/**
 * Capturas de pantalla para revisar el diseño.
 *
 * Uso: node scripts/capturas.mjs [url] [carpeta]
 *
 * Saca cada pantalla a 1280 px (escritorio) y 390 px (móvil) y las deja en
 * `capturas/`, que está en .gitignore. No forma parte de la aplicación: es una
 * herramienta para no diseñar a ciegas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:5186/'
const CARPETA = process.argv[3] ?? 'capturas'

const PANTALLAS = [
  { id: 'mes', nombre: 'Mes' },
  { id: 'analisis', nombre: 'Análisis' },
  { id: 'anual', nombre: 'Año' },
  { id: 'analitica', nombre: 'Analítica' },
  { id: 'conceptos', nombre: 'Conceptos' },
  { id: 'importar', nombre: 'Importar' },
  { id: 'ajustes', nombre: 'Ajustes' },
]

const TAMANOS = [
  { nombre: 'escritorio', width: 1280, height: 900 },
  { nombre: 'movil', width: 390, height: 844 },
]

fs.mkdirSync(CARPETA, { recursive: true })

const navegador = await chromium.launch()

for (const tamano of TAMANOS) {
  const contexto = await navegador.newContext({
    viewport: { width: tamano.width, height: tamano.height },
    deviceScaleFactor: 2,
  })
  const pagina = await contexto.newPage()
  await pagina.goto(URL, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1200)

  for (const pantalla of PANTALLAS) {
    // La navegación es por texto, tanto arriba como abajo.
    // Si una pantalla no se puede abrir, se sigue con las demas: esto es una
    // herramienta para mirar, no una prueba que deba fallar.
    try {
      const boton = pagina.getByRole('button', { name: pantalla.nombre, exact: true }).first()
      if (await boton.count()) {
        await boton.click({ timeout: 4000 })
        await pagina.waitForTimeout(900)
      }
    } catch {
      console.log('   (no he podido abrir', pantalla.nombre + ')')
    }
    const destino = path.join(CARPETA, `${pantalla.id}-${tamano.nombre}.png`)
    await pagina.screenshot({ path: destino, fullPage: false })
    console.log('  ', destino)
  }

  await contexto.close()
}

await navegador.close()
console.log('listo')
