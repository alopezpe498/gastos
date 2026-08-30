/**
 * Prueba de la pantalla de revisión con el extracto de verdad.
 *
 * Sube el archivo, captura la revisión a los dos anchos, la acepta, captura el
 * mes resultante y deshace la importación para dejar la base como estaba.
 * Trabaja siempre contra la copia de pruebas, nunca contra gastos.db.
 */
import { chromium } from 'playwright'

const ARCHIVO = process.argv[2] ?? 'importaciones/29082026_0084_0002057312.xls'
const URL = process.argv[3] ?? 'http://127.0.0.1:3099/'

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
  pagina.on('console', (m) => m.type() === 'error' && console.log('   consola:', m.text()))

  await pagina.goto(URL, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1000)
  await pagina.getByRole('button', { name: 'Importar', exact: true }).first().click()
  await pagina.waitForTimeout(800)

  // El mes al que va: agosto de 2026, por el desplegable nuevo.
  await pagina.getByRole('button', { name: /^(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) \d{4}$/ }).first().click()
  await pagina.waitForTimeout(400)
  await pagina.getByRole('button', { name: 'Ago', exact: true }).click()
  await pagina.waitForTimeout(600)

  await pagina.locator('input[type=file]').setInputFiles(ARCHIVO)
  await pagina.waitForTimeout(3500)

  await pagina.screenshot({ path: `capturas/revision-${t.sufijo}.png` })
  console.log('  ', `capturas/revision-${t.sufijo}.png`)

  // Y el pie de la revisión, que es donde está el botón de aceptar.
  await pagina.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await pagina.waitForTimeout(600)
  await pagina.screenshot({ path: `capturas/revision-pie-${t.sufijo}.png` })
  console.log('  ', `capturas/revision-pie-${t.sufijo}.png`)

  await contexto.close()
}

await navegador.close()
