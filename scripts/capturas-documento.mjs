/**
 * Todas las pantallas de la aplicación, para el documento.
 *
 * Cada una a 1120 px (escritorio) y a 390 px (móvil). Las que hay que abrir
 * pulsando algo —los diálogos, la revisión del extracto— llevan su ruta de
 * clics. `capturas/` está en .gitignore: esto es una herramienta para mirar,
 * no parte de la aplicación.
 *
 * Uso: node scripts/capturas-documento.mjs [url] [carpeta]
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://127.0.0.1:3099/'
const CARPETA = process.argv[3] ?? 'capturas/doc'

/**
 * `ruta` son clics por texto separados por `>`. `alto` fuerza una altura
 * concreta cuando la página entera sería absurdamente larga.
 */
const PANTALLAS = [
  { id: 'mes', titulo: 'Mes', ruta: [], nota: 'La pantalla de cada día: lo que queda, en qué se va y las dos listas.' },
  { id: 'mes-menu', titulo: 'Mes · acciones del mes', ruta: ['Más cosas de este mes'], nota: 'Regenerar, reiniciar, borrar y cerrar, con los valores propios del mes.' },
  { id: 'mes-analisis', titulo: 'Mes · análisis', ruta: ['Ver análisis'], nota: 'Plegado dentro de Mes: en qué se ha ido y la regla 50/30/20.' },
  { id: 'anual', titulo: 'Año', ruta: ['Año'], nota: 'La matriz concepto × mes, con los totales del año y el anterior.' },
  { id: 'analitica-evolucion', titulo: 'Analítica · Evolución', ruta: ['Analítica'] },
  { id: 'analitica-anios', titulo: 'Analítica · Años', ruta: ['Analítica', 'Años'] },
  { id: 'analitica-reparto', titulo: 'Analítica · Reparto', ruta: ['Analítica', 'Reparto'] },
  { id: 'analitica-ahorro', titulo: 'Analítica · Ahorro', ruta: ['Analítica', 'Ahorro'] },
  { id: 'analitica-meses', titulo: 'Analítica · Meses', ruta: ['Analítica', 'Meses'] },
  { id: 'conceptos', titulo: 'Conceptos', ruta: ['Conceptos'], nota: 'El catálogo, con el color y el icono de cada uno.' },
  { id: 'conceptos-plantilla', titulo: 'Conceptos · Plantilla', ruta: ['Conceptos', 'Plantilla'], nota: 'Lo que costará un mes antes de que pase nada.' },
  { id: 'importar-extracto', titulo: 'Importar · Extracto del banco', ruta: ['Importar'] },
  { id: 'importar-excel', titulo: 'Importar · Excel histórico', ruta: ['Importar', 'Excel histórico'] },
  { id: 'importar-copia', titulo: 'Importar · Copia de seguridad', ruta: ['Importar', 'Copia de seguridad'] },
  { id: 'ajustes-general', titulo: 'Ajustes · General', ruta: ['Ajustes'] },
  { id: 'ajustes-ia', titulo: 'Ajustes · Inteligencia artificial', ruta: ['Ajustes', 'Inteligencia artificial'] },
  { id: 'ajustes-reglas', titulo: 'Ajustes · Reglas de clasificación', ruta: ['Ajustes', 'Reglas de clasificación'] },
  { id: 'ajustes-banco', titulo: 'Ajustes · Formato del banco', ruta: ['Ajustes', 'Formato del banco'] },
]

fs.mkdirSync(CARPETA, { recursive: true })
const navegador = await chromium.launch()

/** Pulsa por texto, probando botón y pestaña: las Tabs son `role="tab"`. */
async function pulsar(pagina, texto) {
  let destino = pagina.getByRole('button', { name: texto, exact: true }).first()
  if (!(await destino.count())) {
    destino = pagina.getByRole('tab', { name: texto, exact: true }).first()
  }
  // «Ver análisis» lleva su frase de ayuda dentro del mismo botón, así que su
  // nombre accesible es más largo que la etiqueta: se busca por trozo.
  if (!(await destino.count())) {
    destino = pagina.getByRole('button', { name: new RegExp(texto, 'i') }).first()
  }
  if (!(await destino.count())) {
    console.log(`   (no encuentro "${texto}")`)
    return false
  }
  await destino.click({ timeout: 6000 }).catch(() => console.log(`   (no puedo pulsar "${texto}")`))
  await pagina.waitForTimeout(900)
  return true
}

for (const tamano of [
  { sufijo: 'escritorio', width: 1120, height: 1000, completa: true },
  { sufijo: 'movil', width: 390, height: 900, completa: false },
]) {
  const contexto = await navegador.newContext({
    viewport: { width: tamano.width, height: tamano.height },
    deviceScaleFactor: 2,
  })
  const pagina = await contexto.newPage()

  for (const pantalla of PANTALLAS) {
    await pagina.goto(URL, { waitUntil: 'networkidle' })
    await pagina.waitForTimeout(900)

    // Si el mes no está abierto no hay nada que enseñar: se abre.
    const abrir = pagina.getByRole('button', { name: 'Abrir este mes' })
    if (await abrir.count()) {
      await abrir.click()
      await pagina.waitForTimeout(1500)
    }

    // En el móvil, las secciones que no caben viven tras «Más».
    for (const paso of pantalla.ruta) {
      const hecho = await pulsar(pagina, paso)
      if (!hecho && tamano.sufijo === 'movil') {
        if (await pulsar(pagina, 'Más')) await pulsar(pagina, paso)
      }
    }

    const destino = `${CARPETA}/${pantalla.id}-${tamano.sufijo}.png`
    // Los diálogos no admiten página completa: flotan sobre lo de debajo.
    const conDialogo = (await pagina.locator('.dialogo').count()) > 0
    await pagina.screenshot({ path: destino, fullPage: tamano.completa && !conDialogo })
    console.log('  ', destino)
  }

  await contexto.close()
}

// El PIN necesita su propio servidor, con APP_PIN puesta.
const pin = process.argv[4]
if (pin) {
  const contexto = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })
  const pagina = await contexto.newPage()
  await pagina.goto(pin, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(1200)
  await pagina.screenshot({ path: `${CARPETA}/pin-movil.png` })
  console.log('  ', `${CARPETA}/pin-movil.png`)
  await contexto.close()
}

await navegador.close()
console.log('listo')
