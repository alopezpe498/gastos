/** Las hojas que se abren encima: ficha de concepto y menú del mes. */
import { chromium } from 'playwright'
const URL = 'http://127.0.0.1:3099/'
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

  // La ficha de un concepto.
  await pagina.goto(URL, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(900)
  await pagina.getByRole('button', { name: 'Conceptos', exact: true }).first().click()
  await pagina.waitForTimeout(900)
  await pagina.locator('.fila-concepto').nth(1).locator('.fila-nombre').click()
  await pagina.waitForTimeout(800)
  await pagina.screenshot({ path: `capturas/ficha-concepto-${t.sufijo}.png` })
  console.log('  ', `capturas/ficha-concepto-${t.sufijo}.png`)

  // El menú del mes.
  await pagina.goto(URL, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(900)
  await pagina.getByRole('button', { name: 'Más cosas de este mes' }).first().click()
  await pagina.waitForTimeout(800)
  await pagina.screenshot({ path: `capturas/menu-mes-${t.sufijo}.png` })
  console.log('  ', `capturas/menu-mes-${t.sufijo}.png`)

  await contexto.close()
}
await navegador.close()
