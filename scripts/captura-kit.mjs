/**
 * La página del kit y la referencia, para poder compararlas lado a lado.
 *
 * Uso: node scripts/captura-kit.mjs [url del vite]
 */
import path from 'node:path'
import { chromium } from 'playwright'

const VITE = process.argv[2] ?? 'http://localhost:5200'
const navegador = await chromium.launch()

for (const t of [
  { sufijo: 'escritorio', width: 1120, height: 1000 },
  { sufijo: 'movil', width: 390, height: 844 },
]) {
  const contexto = await navegador.newContext({
    viewport: { width: t.width, height: t.height },
    deviceScaleFactor: 2,
  })
  const pagina = await contexto.newPage()
  pagina.on('pageerror', (e) => console.log('   ERROR:', e.message.slice(0, 160)))

  await pagina.goto(`${VITE}/#kit`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1600)
  await pagina.screenshot({
    path: `capturas/kit-${t.sufijo}.png`,
    fullPage: t.sufijo === 'escritorio',
  })
  console.log('  ', `capturas/kit-${t.sufijo}.png`)

  await pagina.goto('file://' + path.resolve('referencia-mes-v2.html'), {
    waitUntil: 'networkidle',
  })
  await pagina.waitForTimeout(1200)
  await pagina.screenshot({
    path: `capturas/REFERENCIA-v2-${t.sufijo}.png`,
    fullPage: t.sufijo === 'escritorio',
  })
  console.log('  ', `capturas/REFERENCIA-v2-${t.sufijo}.png`)

  await contexto.close()
}

await navegador.close()
