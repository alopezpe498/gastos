// Que no haya texto invisible: letra y fondo casi del mismo color.
//
// Nació de dos fallos reales que ninguna otra prueba veía, porque los botones
// estaban, respondían y hacían lo suyo. Solo no se leían:
//
//   - `.peligro` es en alias.css una utilidad de color de TEXTO, y como esa
//     hoja se carga después le ganaba el color al `.btn-primary`: el botón de
//     «Sí, reiniciar el mes» salía coral sobre coral.
//   - La barra de selección del extracto es negra y presta su tinta blanca a
//     todo lo de dentro, incluidos un desplegable y un botón que se pintan su
//     propio fondo blanco. Blanco sobre blanco.
//
// Los dos son el mismo error: una superficie que se pinta el fondo y no dice su
// tinta. Por eso esto no mide una pantalla concreta, sino todos los textos de
// unos cuantos estados, contra el fondo que de verdad tienen detrás.
//
// El listón está en 2:1, no en el 4,5:1 de la WCAG. Esto no persigue
// accesibilidad perfecta —el gris tenue del diseño está en 2,61 y es una
// decisión tomada—: persigue texto que no se ve, que es lo que pasó.
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { levantar, crearLlamar, crearComprobador, RAIZ } from './entorno.mjs'
import { comoTexto } from './fixtures/extractoEjemplo.mjs'

if (!fs.existsSync(path.join(RAIZ, 'dist', 'index.html'))) {
  console.log('\n  No hay dist/. Ejecuta "npm run build" antes de esta suite.\n')
  process.exit(1)
}

const MINIMO = 2

const entorno = await levantar('contraste')
const llamar = crearLlamar(entorno)
const { comprobar, estado } = crearComprobador()

const WEB = entorno.base.replace(/\/api$/, '/')
const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } })
const pagina = await contexto.newPage()

/**
 * El contraste de cada texto visible contra el primer fondo opaco que tiene
 * encima, subiendo por los padres.
 */
const MEDIR = () => {
  const aRgb = (color) => {
    const m = color.match(/[\d.]+/g)
    if (!m) return null
    const [r, v, a, alfa] = m.map(Number)
    if (alfa === 0) return null
    return [r, v, a]
  }

  const luz = ([r, v, a]) => {
    const c = [r, v, a].map((x) => {
      const s = x / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }

  const contraste = (a, b) => {
    const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }

  const fondoDe = (el) => {
    let actual = el
    while (actual && actual !== document.documentElement) {
      const color = aRgb(getComputedStyle(actual).backgroundColor)
      if (color) return color
      actual = actual.parentElement
    }
    return [255, 255, 255]
  }

  const salida = []
  for (const el of document.querySelectorAll('body *')) {
    // Solo el texto propio: si no, un div carga con la queja de sus hijos.
    const texto = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim()
    if (!texto) continue
    // Un signo suelto no es texto que se lea: el punto verde de «gastos.» es un
    // adorno, y quejarse de él solo enseña a ignorar la lista.
    if (texto.length === 1 && !/[a-z0-9]/i.test(texto)) continue

    const caja = el.getBoundingClientRect()
    if (caja.width < 2 || caja.height < 2) continue

    const estilo = getComputedStyle(el)
    if (estilo.visibility === 'hidden' || estilo.opacity === '0') continue

    const tinta = aRgb(estilo.color)
    if (!tinta) continue

    salida.push({
      texto: texto.slice(0, 40),
      donde: `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ').join('.') : ''}`.slice(0, 60),
      razon: Math.round(contraste(tinta, fondoDe(el)) * 100) / 100,
    })
  }
  return salida.sort((a, b) => a.razon - b.razon)
}

/** Mide lo que hay en pantalla ahora mismo y lo cuenta como una comprobación. */
async function seLee(nombre) {
  await pagina.waitForTimeout(400)
  const medidas = await pagina.evaluate(MEDIR)
  const flojos = medidas.filter((m) => m.razon < MINIMO)
  comprobar(
    medidas.length > 10,
    `${nombre}: hay texto que medir (${medidas.length})`,
    String(medidas.length),
  )
  comprobar(
    flojos.length === 0,
    `${nombre}: todo se lee`,
    flojos
      .slice(0, 3)
      .map((f) => `${f.razon}:1 «${f.texto}» en ${f.donde}`)
      .join(' · '),
  )
}

try {
  const hoy = new Date()
  await llamar('/meses/asegurar', {
    metodo: 'POST',
    cuerpo: { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 },
  })

  await pagina.goto(WEB)
  await pagina.evaluate((token) => localStorage.setItem('gastos.token', token), entorno.token)
  await pagina.goto(WEB, { waitUntil: 'networkidle' })
  await pagina.waitForSelector('.hero', { timeout: 15000 })

  // -------------------------------------------------------------------------
  console.log('\nLa pantalla de cada día')
  // -------------------------------------------------------------------------
  await seLee('Mes')

  // -------------------------------------------------------------------------
  console.log('\nEl menú del mes y su confirmación en rojo')
  // -------------------------------------------------------------------------
  {
    await pagina.getByRole('button', { name: 'Más cosas de este mes' }).click()
    await pagina.waitForSelector('.dialogo', { timeout: 5000 })
    await seLee('Menú del mes')

    await pagina.getByRole('button', { name: /Reiniciar el mes/ }).click()
    await pagina.waitForTimeout(300)
    const boton = pagina.locator('.btn-primary.peligro').first()
    comprobar((await boton.count()) === 1, 'sale el botón rojo de confirmar')
    await seLee('Confirmación de reiniciar')

    await pagina.keyboard.press('Escape')
    await pagina.waitForTimeout(400)
  }

  // -------------------------------------------------------------------------
  console.log('\nLa barra de selección del extracto, que es negra')
  // -------------------------------------------------------------------------
  {
    await pagina.getByRole('button', { name: 'Importar', exact: true }).first().click()
    await pagina.waitForTimeout(700)
    await pagina.getByRole('button', { name: 'Pegar una tabla' }).click()
    await pagina.waitForTimeout(300)
    await pagina.getByLabel('Tabla pegada').fill(comoTexto())
    // El área de texto guarda al salir, no al escribir.
    await pagina.getByLabel('Tabla pegada').blur()
    await pagina.waitForTimeout(300)
    await pagina.getByRole('button', { name: 'Leer lo pegado' }).click()
    await pagina.waitForSelector('.atajos', { timeout: 20000 })
    await pagina.waitForTimeout(900)

    await pagina.locator('.atajos .chip').first().click()
    await pagina.waitForSelector('.barra-seleccion', { timeout: 5000 })
    await seLee('Extracto con líneas seleccionadas')

    // Lo que destapó el fallo: la lista blanca dentro de la barra negra.
    await pagina.getByLabel('Concepto para los seleccionados').click()
    await pagina.waitForSelector('.buscador-lista', { timeout: 5000 })
    await seLee('Extracto con el desplegable de conceptos abierto')
  }
} finally {
  await navegador.close()
  await entorno.cerrar()
}

console.log(
  `\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`,
)
process.exit(estado.fallos === 0 ? 0 : 1)
