/**
 * Todas las pantallas y todas sus pestañas, a los dos anchos.
 *
 * Es la herramienta para mirar la aplicación entera de una vez y ver si habla
 * el mismo idioma en todas partes. `capturas/` está en .gitignore.
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://127.0.0.1:3099/'
const SOLO = process.argv[3] ?? ''

const PANTALLAS = [
  { id: 'mes', ruta: ['Mes'] },
  { id: 'mes-analisis', ruta: ['Mes', 'Análisis del mes'] },
  { id: 'anual', ruta: ['Año'] },
  { id: 'analitica-evolucion', ruta: ['Analítica'] },
  { id: 'analitica-anios', ruta: ['Analítica', 'Años'] },
  { id: 'analitica-reparto', ruta: ['Analítica', 'Reparto'] },
  { id: 'analitica-ahorro', ruta: ['Analítica', 'Ahorro'] },
  { id: 'analitica-meses', ruta: ['Analítica', 'Meses'] },
  { id: 'conceptos', ruta: ['Conceptos'] },
  { id: 'conceptos-plantilla', ruta: ['Conceptos', 'Plantilla'] },
  { id: 'importar-extracto', ruta: ['Importar'] },
  { id: 'importar-excel', ruta: ['Importar', 'Excel histórico'] },
  { id: 'importar-copia', ruta: ['Importar', 'Copia de seguridad'] },
  { id: 'ajustes-general', ruta: ['Ajustes'] },
  { id: 'ajustes-ia', ruta: ['Ajustes', 'Inteligencia artificial'] },
  { id: 'ajustes-reglas', ruta: ['Ajustes', 'Reglas de clasificación'] },
  { id: 'ajustes-banco', ruta: ['Ajustes', 'Formato del banco'] },
]

fs.mkdirSync('capturas', { recursive: true })
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

  for (const pantalla of PANTALLAS) {
    if (SOLO && !pantalla.id.includes(SOLO)) continue
    await pagina.goto(URL, { waitUntil: 'networkidle' })
    await pagina.waitForTimeout(700)
    let bien = true
    for (const paso of pantalla.ruta) {
      let boton = pagina.getByRole('button', { name: paso, exact: true }).first()
      // En móvil las secciones que no caben abajo viven tras el botón «Más».
      if (!(await boton.count())) {
        const mas = pagina.getByRole('button', { name: 'Más', exact: true }).first()
        if (await mas.count()) {
          await mas.click().catch(() => undefined)
          await pagina.waitForTimeout(400)
          boton = pagina.getByRole('button', { name: paso, exact: true }).first()
        }
      }
      if (await boton.count()) {
        await boton.click({ timeout: 5000 }).catch(() => (bien = false))
        await pagina.waitForTimeout(800)
      } else {
        console.log(`   (no encuentro "${paso}" en ${pantalla.id})`)
        bien = false
      }
    }
    const destino = `capturas/${pantalla.id}-${t.sufijo}.png`
    await pagina.screenshot({ path: destino, fullPage: t.sufijo === 'escritorio' })
    console.log('  ', destino, bien ? '' : '(incompleta)')
  }

  await contexto.close()
}

await navegador.close()
console.log('listo')
