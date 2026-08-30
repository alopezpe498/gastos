/** Las confirmaciones nuevas y la línea de «qué acaba de pasar». */
import { chromium } from 'playwright'
const URL = 'http://127.0.0.1:3099/'
const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1120, height: 800 }, deviceScaleFactor: 2 })
const pagina = await contexto.newPage()

const abrir = async () => {
  await pagina.goto(URL, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(900)
  const b = pagina.getByRole('button', { name: 'Abrir este mes' })
  if (await b.count()) { await b.click(); await pagina.waitForTimeout(1500) }
  // Si quedó cerrado de una prueba anterior, se reabre: con el mes cerrado
  // reiniciar y regenerar están desactivados a propósito.
  await pagina.getByRole('button', { name: 'Más cosas de este mes' }).click()
  await pagina.waitForTimeout(600)
  const reabrir = pagina.getByRole('button', { name: /Reabrir el mes/ })
  if (await reabrir.count()) { await reabrir.click(); await pagina.waitForTimeout(1500) }
  // Se cierre como se cierre, la hoja tiene que quedar fuera.
  await pagina.keyboard.press('Escape')
  await pagina.waitForTimeout(700)
}

await abrir()
await pagina.getByRole('button', { name: 'Más cosas de este mes' }).click()
await pagina.waitForTimeout(700)
await pagina.getByRole('button', { name: /Reiniciar el mes/ }).click()
await pagina.waitForTimeout(600)
await pagina.screenshot({ path: 'capturas/confirmar-reiniciar.png' })
console.log('   capturas/confirmar-reiniciar.png')

await abrir()
const menu = pagina.locator('.fila .boton-icono').first()
if (await menu.count()) {
  await menu.click()
  await pagina.waitForTimeout(300)
  await pagina.getByRole('button', { name: 'Borrar', exact: true }).click()
  await pagina.waitForTimeout(400)
  await pagina.screenshot({ path: 'capturas/confirmar-borrar-fila.png' })
  console.log('   capturas/confirmar-borrar-fila.png')

  await pagina.locator('.fila-borrando').getByRole('button', { name: 'Borrar' }).click()
  await pagina.waitForTimeout(1300)
  await pagina.screenshot({ path: 'capturas/linea-deshacer.png' })
  console.log('   capturas/linea-deshacer.png')
} else {
  console.log('   (no hay movimientos que borrar)')
}
await navegador.close()
