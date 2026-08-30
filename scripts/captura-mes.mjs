/** Mes, con el desplegable de meses abierto, para revisar el selector. */
import { chromium } from 'playwright'
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
  await pagina.goto('http://127.0.0.1:3099/', { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1200)
  await pagina
    .getByRole('button', {
      name: /^(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)$/,
    })
    .first()
    .click()
  await pagina.waitForTimeout(500)
  await pagina.screenshot({ path: `capturas/mes-calendario-${t.sufijo}.png` })
  console.log('  ', `capturas/mes-calendario-${t.sufijo}.png`)
  await contexto.close()
}
await navegador.close()
