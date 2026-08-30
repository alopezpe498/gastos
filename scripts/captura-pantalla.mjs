/**
 * Captura una pantalla a los dos anchos, siguiendo una ruta de clics por texto.
 *
 * Uso: node scripts/captura-pantalla.mjs nombre "Conceptos>Plantilla" [url]
 */
import { chromium } from 'playwright'

const [nombre, ruta = '', url = 'http://127.0.0.1:3099/'] = process.argv.slice(2)
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

  await pagina.goto(url, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1100)

  for (const paso of ruta.split('>').filter(Boolean)) {
    // Las pestañas son `role="tab"`, no botones: se prueban las dos cosas.
    let boton = pagina.getByRole('button', { name: paso, exact: true }).first()
    if (!(await boton.count())) boton = pagina.getByRole('tab', { name: paso, exact: true }).first()
    if (!(await boton.count())) {
      console.log(`   (no encuentro "${paso}")`)
      continue
    }
    await boton.click({ timeout: 6000 }).catch(() => console.log(`   (no puedo pulsar "${paso}")`))
    await pagina.waitForTimeout(900)
  }

  const destino = `capturas/${nombre}-${t.sufijo}.png`
  await pagina.screenshot({ path: destino, fullPage: t.sufijo === 'escritorio' })
  console.log('  ', destino)
  await contexto.close()
}

await navegador.close()
