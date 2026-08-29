/**
 * Captura la referencia aprobada (referencia-mes.html) a 1120 y 390 px.
 *
 * Es el objetivo contra el que se compara la pantalla Mes de la aplicación.
 * No es inspiración: es la especificación.
 */
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

fs.mkdirSync('capturas', { recursive: true })
const url = pathToFileURL(path.resolve('referencia-mes.html')).href

const navegador = await chromium.launch()
for (const [nombre, width] of [
  ['1120', 1160],
  ['390', 390],
]) {
  const contexto = await navegador.newContext({
    viewport: { width, height: 1000 },
    deviceScaleFactor: 2,
  })
  const pagina = await contexto.newPage()
  await pagina.goto(url, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1500)
  await pagina.screenshot({ path: `capturas/REFERENCIA-${nombre}.png`, fullPage: true })
  console.log(`  capturas/REFERENCIA-${nombre}.png`)
  await contexto.close()
}
await navegador.close()
