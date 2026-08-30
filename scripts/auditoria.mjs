/**
 * Auditoría de acciones: pulsa cada una y mira si sale una petición a la API.
 *
 * No comprueba que el resultado sea el correcto —para eso están las pruebas—
 * sino algo más básico: que el botón esté conectado a algo. Es la red la que lo
 * dice, porque un botón sin manejador no hace ni un fetch, y eso es justo lo
 * que se rompe cuando se reescribe el marcado.
 *
 * OJO: cambia datos (borra apuntes, reinicia y borra el mes). Lánzala siempre
 * contra una copia, nunca contra la base de verdad, y contra una copia recién
 * hecha: si el mes se queda cerrado de la vez anterior, «Regenerar» y
 * «Reiniciar» salen desactivados a propósito y parecen rotos.
 *
 * Uso: node scripts/auditoria.mjs [url]
 */
import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://127.0.0.1:3099/'
const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } })
const pagina = await contexto.newPage()

const red = []
const consola = []
pagina.on('request', (r) => {
  if (r.url().includes('/api/')) red.push(r.method() + ' ' + r.url().replace(/^.*\/api/, ''))
})
pagina.on('console', (m) => m.type() === 'error' && consola.push(m.text()))
pagina.on('pageerror', (e) => consola.push('EXCEPCIÓN: ' + e.message))

const resultados = []

/** Ejecuta un paso y anota si ha salido alguna petición que no sea de lectura. */
async function probar(nombre, pasos, opciones = {}) {
  const esperaEscritura = opciones.esperaEscritura !== false
  red.length = 0
  try {
    await pasos()
    await pagina.waitForTimeout(1100)
  } catch (causa) {
    resultados.push({
      nombre,
      ok: false,
      nota: 'no he podido pulsarlo: ' + causa.message.split('\n')[0],
    })
    return
  }
  const escrituras = red.filter((r) => !r.startsWith('GET'))
  const ok = esperaEscritura ? escrituras.length > 0 : red.length > 0
  resultados.push({
    nombre,
    ok,
    nota: (escrituras.length ? escrituras : red).slice(0, 3).join(' · ') || 'ninguna petición',
  })
}

const irA = async (seccion) => {
  await pagina.goto(URL, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(700)
  /*
   * Algunas acciones se llevan el mes por delante (reiniciar, borrar) y las
   * siguientes se quedaban sin nada que pulsar. Si no hay mes, se abre: así
   * cada prueba mide lo suyo y no el destrozo de la anterior.
   */
  const abrir = pagina.getByRole('button', { name: 'Abrir este mes' })
  if (await abrir.count()) {
    await abrir.click()
    await pagina.waitForTimeout(1500)
  }
  if (seccion) {
    const ir = pagina.getByRole('button', { name: seccion, exact: true }).first()
    await (await ir.count() ? ir : pagina.getByRole('tab', { name: seccion, exact: true }).first()).click()
    await pagina.waitForTimeout(800)
  }
}

const mesMenu = async () => {
  await irA(null)
  await pagina.getByRole('button', { name: 'Más cosas de este mes' }).click()
  await pagina.waitForTimeout(700)
}

const pulsarSiEsta = async (nombre) => {
  const b = pagina.getByRole('button', { name: nombre, exact: true }).last()
  if (await b.count()) {
    await b.click()
    await pagina.waitForTimeout(600)
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Mes
// ---------------------------------------------------------------------------
await irA(null)
await probar('Mes · marcar un fijo como cobrado', async () => {
  await pagina.locator('.check').first().click()
})

await irA(null)
await probar('Mes · editar el importe de un fijo', async () => {
  const campo = pagina.locator('.row .campo.dinero').first()
  await campo.click()
  await campo.fill('31,50')
  await campo.press('Enter')
})

await irA(null)
await probar('Mes · anotar el saldo del banco', async () => {
  await pagina.getByRole('button', { name: /saldo del banco|^Saldo/ }).first().click()
  const campo = pagina.getByLabel('Saldo en cuenta')
  await campo.fill('2500')
  await campo.press('Enter')
})

await irA(null)
await probar('Mes · cambiar la nómina', async () => {
  await pagina.locator('.inline-valor').first().click()
  const campo = pagina.getByLabel('Nómina del mes')
  await campo.fill('3300')
  await campo.press('Enter')
})

await irA(null)
await probar('Mes · apuntar un gasto nuevo', async () => {
  await pagina.getByLabel('Apuntar un gasto').fill('comida 12,30')
  await pagina.waitForTimeout(400)
  await pagina.getByRole('button', { name: 'Apuntar', exact: true }).click()
})

await irA(null)
await probar('Mes · duplicar un movimiento', async () => {
  await pagina.locator('.row .btn-icono').first().click()
  await pagina.waitForTimeout(300)
  await pagina.getByRole('button', { name: 'Duplicar', exact: true }).click()
})

await irA(null)
await probar('Mes · borrar un movimiento', async () => {
  await pagina.locator('.row .btn-icono').first().click()
  await pagina.waitForTimeout(300)
  await pagina.getByRole('button', { name: 'Borrar', exact: true }).click()
  await pagina.waitForTimeout(500)
  // La confirmación vive en la propia fila.
  await pagina.locator('.row.confirmando').getByRole('button', { name: 'Borrar' }).click()
})

await irA(null)
await probar('Mes · cambiar el concepto de un movimiento', async () => {
  // La ficha del apunte se abre pulsando su fila.
  await pagina.locator('.row-cuerpo').first().click()
  await pagina.waitForTimeout(600)
  await pagina.locator('.dialogo .buscador button').first().click()
  await pagina.waitForTimeout(400)
  await pagina.locator('.buscador-lista button').nth(1).click()
})

await mesMenu()
await probar('Mes · regenerar desde la plantilla', async () => {
  await pagina.getByRole('button', { name: /Regenerar desde la plantilla/ }).click()
  await pagina.waitForTimeout(1000)
  await pulsarSiEsta('Aplicar')
})

await mesMenu()
await probar('Mes · reiniciar el mes', async () => {
  await pagina.getByRole('button', { name: /Reiniciar el mes/ }).click()
  await pagina.waitForTimeout(700)
  await pulsarSiEsta('Sí, reiniciar el mes')
})

await irA(null)
await probar('Mes · deshacer el borrado de un movimiento', async () => {
  // El paso anterior reinicia el mes y se lleva los variables: hace falta uno.
  await pagina.getByLabel('Apuntar un gasto').fill('comida 56')
  await pagina.waitForTimeout(400)
  await pagina.getByRole('button', { name: 'Apuntar', exact: true }).click()
  await pagina.waitForTimeout(1200)
  await pagina.locator('.row .btn-icono').first().click()
  await pagina.waitForTimeout(300)
  await pagina.getByRole('button', { name: 'Borrar', exact: true }).click()
  await pagina.waitForTimeout(400)
  await pagina.locator('.row.confirmando').getByRole('button', { name: 'Borrar' }).click()
  await pagina.waitForTimeout(1200)
  await pagina.getByRole('button', { name: 'Deshacer', exact: true }).click()
})

await mesMenu()
await probar('Mes · borrar el mes', async () => {
  await pagina.getByRole('button', { name: /Borrar el mes/ }).click()
  await pagina.waitForTimeout(700)
  await pulsarSiEsta('Sí, borrar el mes')
})

await mesMenu()
await probar('Mes · cerrar el mes', async () => {
  await pagina.getByRole('button', { name: /Cerrar el mes|Reabrir el mes/ }).click()
})

// ---------------------------------------------------------------------------
// Conceptos y plantilla
// ---------------------------------------------------------------------------
await irA('Conceptos')
await probar('Conceptos · activar o desactivar', async () => {
  await pagina.locator('.row .interruptor').first().click()
})

await irA('Conceptos')
await probar('Conceptos · cambiar el color', async () => {
  await pagina.locator('.ico-boton').first().click()
  await pagina.waitForTimeout(600)
  await pagina.locator('.rejilla-aspecto .aspecto').nth(3).click()
})

await irA('Conceptos')
await probar('Conceptos · reordenar arrastrando', async () => {
  const filas = pagina.locator('.row')
  const origen = await filas.nth(0).boundingBox()
  const destino = await filas.nth(3).boundingBox()
  await pagina.mouse.move(origen.x + 20, origen.y + origen.height / 2)
  await pagina.mouse.down()
  await pagina.mouse.move(destino.x + 20, destino.y + destino.height / 2, { steps: 12 })
  await pagina.mouse.up()
})

await irA('Conceptos')
await probar('Plantilla · editar el importe previsto', async () => {
  await pagina.getByRole('tab', { name: 'Plantilla', exact: true }).click()
  await pagina.waitForTimeout(1000)
  const campo = pagina.locator('.tabla .campo.dinero').first()
  await campo.click()
  await campo.fill('35,00')
  await campo.press('Enter')
})

await irA('Conceptos')
await probar('Plantilla · cambiar la clasificación', async () => {
  await pagina.getByRole('tab', { name: 'Plantilla', exact: true }).click()
  await pagina.waitForTimeout(1000)
  await pagina.locator('.tabla .chip').first().click()
})

// ---------------------------------------------------------------------------
// Año
// ---------------------------------------------------------------------------
await irA('Año')
await probar(
  'Año · abrir un mes desde una celda',
  async () => {
    await pagina.locator('.celda-enlace').first().click()
  },
  { esperaEscritura: false },
)

console.log('')
console.log('| Acción | ¿Funciona? | Qué manda a la API |')
console.log('| --- | --- | --- |')
for (const r of resultados) {
  console.log('| ' + r.nombre + ' | ' + (r.ok ? 'sí' : '**NO**') + ' | ' + r.nota + ' |')
}
if (consola.length) {
  console.log('')
  console.log('Errores de consola:')
  for (const e of [...new Set(consola)].slice(0, 10)) console.log(' - ' + e)
}
await navegador.close()
