/**
 * Captura una pantalla concreta, siguiendo una ruta de clics por texto.
 *
 * Uso: node scripts/captura-una.mjs nombre "Conceptos>Plantilla"
 */
import { chromium } from 'playwright'

const [nombre, ruta = '', url = 'http://127.0.0.1:3099/'] = process.argv.slice(2)
const navegador = await chromium.launch()

for (const t of [
  { sufijo: 'escritorio', width: 1120, height: 900 },
  { sufijo: 'movil', width: 390, height: 844 },
]) {
  const contexto = await navegador.newContext({
    viewport: { width: t.width, height: t.height },
    deviceScaleFactor: 2,
  })
  const pagina = await contexto.newPage()
  await pagina.goto(url, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1000)

  for (const paso of ruta.split('>').filter(Boolean)) {
    const boton = pagina.getByRole('button', { name: paso, exact: true }).first()
    if (await boton.count()) {
      await boton.click({ timeout: 5000 })
      await pagina.waitForTimeout(900)
    } else {
      console.log('   (no encuentro', paso + ')')
    }
  }

  await pagina.screenshot({ path: `capturas/${nombre}-${t.sufijo}.png` })
  console.log('  ', `capturas/${nombre}-${t.sufijo}.png`)
  await contexto.close()
}
await navegador.close()
