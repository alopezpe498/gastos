/**
 * Las capturas del detalle de la compra, con la IA simulada.
 *
 * Deja un ticket revisado en octubre y fotografía las dos pantallas nuevas a
 * los dos anchos. `capturas/` está en .gitignore: esto es para mirar.
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { levantarIaFalsa } from '../pruebas/mock-ia.mjs'
import { comoRespuestaDeIa, comoTexto } from '../pruebas/fixtures/ticketEjemplo.mjs'

const ia = await levantarIaFalsa({ responder: () => comoRespuestaDeIa() })
const servidor = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, GASTOS_DB: 'server/data/test-fin.db', APP_PIN: '', PORT: '3090', OPENAI_BASE_URL: ia.base },
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 5000))

const B = 'http://127.0.0.1:3090/api'
const pedir = async (r, m = 'GET', c) => {
  const res = await fetch(B + r, { method: m, headers: { 'Content-Type': 'application/json' }, body: c ? JSON.stringify(c) : undefined })
  return res.json()
}
await pedir('/config/ia', 'PUT', { proveedor: 'openai', clave: 'sk-x', modelo: 'gpt-4o-mini' })
const mes = await pedir('/meses/asegurar', 'POST', { anio: 2026, mes: 10 })

const navegador = await chromium.launch()
for (const t of [{ s: 'escritorio', w: 1120 }, { s: 'movil', w: 390 }]) {
  const pagina = await navegador.newPage({ viewport: { width: t.w, height: 1000 }, deviceScaleFactor: 2 })
  pagina.on('pageerror', (e) => console.log('  error:', e.message))
  await pagina.goto('http://127.0.0.1:3090/', { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1200)

  const ir = async (nombre) => {
    let b = pagina.getByRole('button', { name: nombre, exact: true }).first()
    if (!(await b.count())) {
      await pagina.getByRole('button', { name: 'Más', exact: true }).click()
      await pagina.waitForTimeout(400)
      b = pagina.getByRole('button', { name: nombre, exact: true }).first()
    }
    await b.click()
    await pagina.waitForTimeout(800)
  }

  // --- la revisión de un ticket ---
  await ir('Importar')
  await pagina.getByRole('tab', { name: 'Tickets', exact: true }).click()
  await pagina.waitForTimeout(600)
  await pagina.getByRole('button', { name: 'Pegar el ticket' }).click()
  await pagina.waitForTimeout(300)
  await pagina.getByLabel('Ticket pegado').fill(comoTexto())
  await pagina.getByLabel('Ticket pegado').blur()
  await pagina.waitForTimeout(300)
  await pagina.getByRole('button', { name: 'Leer lo pegado' }).click()
  await pagina.waitForSelector('.linea-ticket', { timeout: 25000 })
  await pagina.waitForTimeout(1000)
  await pagina.screenshot({ path: `capturas/fase4-revision-${t.s}.png`, fullPage: t.s === 'movil' ? false : false })
  console.log(t.s, 'revisión · scrollWidth', await pagina.evaluate(() => document.documentElement.scrollWidth))

  // Guardar, para tener datos que enseñar en Compra.
  if (t.s === 'escritorio') {
    const p = await pedir('/tickets', 'POST', { mesId: mes.id, texto: comoTexto() })
    const lineas = p.lineas.map((l) => ({ ...l, varianteNueva: l.propuesta?.variante, productoNuevo: l.propuesta?.producto, categoriaId: l.propuesta?.categoriaId, marca: l.propuesta?.marca }))
    await pedir('/tickets/aceptar', 'POST', { mesId: mes.id, cabecera: p.cabecera, lineas, origen: 'portapapeles' })
  }

  // --- la pestaña Compra ---
  await pagina.goto('http://127.0.0.1:3090/', { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1000)
  await ir('Analítica')
  await pagina.getByRole('tab', { name: 'Compra', exact: true }).click()
  await pagina.waitForTimeout(1500)
  await pagina.screenshot({ path: `capturas/fase4-compra-${t.s}.png`, fullPage: true })
  console.log(t.s, 'compra · scrollWidth', await pagina.evaluate(() => document.documentElement.scrollWidth))
  await pagina.close()
}
await navegador.close()
servidor.kill()
await ia.cerrar()
