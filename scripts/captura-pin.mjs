/** Captura suelta de la pantalla del PIN, que solo sale con APP_PIN definida. */
import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://127.0.0.1:3098/'
const navegador = await chromium.launch()
for (const t of [
  { nombre: 'escritorio', width: 1120, height: 900 },
  { nombre: 'movil', width: 390, height: 844 },
]) {
  const contexto = await navegador.newContext({
    viewport: { width: t.width, height: t.height },
    deviceScaleFactor: 2,
  })
  const pagina = await contexto.newPage()
  await pagina.goto(URL, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(900)
  await pagina.screenshot({ path: `capturas/pin-${t.nombre}.png` })
  console.log('  ', `capturas/pin-${t.nombre}.png`)
  await contexto.close()
}
await navegador.close()
