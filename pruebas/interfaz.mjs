// Pruebas de la interfaz: que los botones estén conectados a algo.
//
// Las demás suites hablan con la API directamente, así que pasan aunque la
// pantalla esté rota. Esta es la que faltaba: después del rediseño, «Reiniciar
// el mes», «Borrar el mes» y «Borrar» un apunte se quedaron sin hacer nada —el
// diálogo de confirmación se pintaba al final de la página, invisible— y las
// 505 comprobaciones de entonces seguían en verde.
//
// Por eso aquí se pulsa de verdad, en un navegador, y se comprueba el efecto
// preguntándole después a la API. Necesita `npm run build`: el servidor sirve
// lo que haya en dist/, no lo que haya en src/.
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { levantar, crearLlamar, crearComprobador, PIN, RAIZ } from './entorno.mjs'

if (!fs.existsSync(path.join(RAIZ, 'dist', 'index.html'))) {
  console.log('\n  No hay dist/. Ejecuta "npm run build" antes de esta suite.\n')
  process.exit(1)
}

const entorno = await levantar('interfaz')
const llamar = crearLlamar(entorno)
const { comprobar, estado } = crearComprobador()

const WEB = entorno.base.replace(/\/api$/, '/')
const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } })
const pagina = await contexto.newPage()

const fallosDeConsola = []
pagina.on('pageerror', (e) => fallosDeConsola.push(e.message))

/** El mes de trabajo, recién abierto con sus fijos desde la plantilla. */
const hoy = new Date()
const ANIO = hoy.getFullYear()
const MES = hoy.getMonth() + 1

async function prepararMes() {
  const { datos } = await llamar('/meses/asegurar', {
    metodo: 'POST',
    cuerpo: { anio: ANIO, mes: MES },
  })
  return datos
}

/** Lo que la API dice del mes ahora mismo. */
const leerMes = async () => (await llamar(`/meses/${ANIO}/${MES}`)).datos

/** Un gasto variable para tener algo que borrar y duplicar. */
async function crearVariable(mesId, importe = 56) {
  const { datos: conceptos } = await llamar('/conceptos?activos=1')
  const concepto = conceptos.find((c) => c.tipo === 'variable')
  await llamar('/movimientos', {
    metodo: 'POST',
    cuerpo: {
      mesId,
      conceptoId: concepto.id,
      importe,
      descripcion: 'Apunte de prueba',
      fechaCobro: `${ANIO}-${String(MES).padStart(2, '0')}-05`,
    },
  })
  return concepto
}

/** Abre la aplicación ya desbloqueada y en la pantalla Mes. */
async function abrirApp() {
  await pagina.goto(WEB)
  await pagina.evaluate((token) => localStorage.setItem('gastos.token', token), entorno.token)
  await pagina.goto(WEB, { waitUntil: 'networkidle' })
  await pagina.waitForSelector('.hero', { timeout: 15000 })
  await pagina.waitForTimeout(400)
}

const abrirMenuDelMes = async () => {
  await pagina.getByRole('button', { name: 'Más cosas de este mes' }).click()
  await pagina.waitForSelector('.dialogo', { timeout: 5000 })
  await pagina.waitForTimeout(300)
}

try {
  // Sin un mes abierto la pantalla Mes enseña «Abrir este mes» y no hay nada
  // que pulsar: se prepara antes de tocar el navegador.
  await prepararMes()

  // -------------------------------------------------------------------------
  console.log('\nEl PIN deja entrar')
  // -------------------------------------------------------------------------
  {
    await pagina.goto(WEB, { waitUntil: 'networkidle' })
    await pagina.waitForSelector('.pin-teclado', { timeout: 15000 })
    for (const digito of PIN) {
      await pagina.getByRole('button', { name: digito, exact: true }).click()
    }
    await pagina.getByRole('button', { name: 'Desbloquear' }).click()
    await pagina.waitForSelector('.hero', { timeout: 15000 })
    comprobar(true, 'con el PIN correcto se entra en la pantalla Mes')
  }

  // -------------------------------------------------------------------------
  console.log('\nBorrar un apunte, y deshacerlo')
  // -------------------------------------------------------------------------
  {
    const mes = await leerMes()
    await crearVariable(mes.id, 56)
    await abrirApp()

    const antes = await leerMes()
    await pagina.locator('.row .btn-icono').first().click()
    await pagina.waitForTimeout(250)
    await pagina.getByRole('button', { name: 'Borrar', exact: true }).click()
    await pagina.waitForTimeout(300)

    const fila = pagina.locator('.row.confirmando')
    comprobar(await fila.isVisible(), 'la confirmación aparece en la propia fila')
    comprobar(
      (await fila.textContent()).includes('56,00'),
      'y dice de cuánto es el apunte que vas a borrar',
    )

    await fila.getByRole('button', { name: 'Borrar' }).click()
    await pagina.waitForTimeout(1200)

    const despues = await leerMes()
    comprobar(
      despues.variables.length === antes.variables.length - 1,
      'al confirmar, el apunte se borra de verdad',
      `${antes.variables.length} → ${despues.variables.length}`,
    )

    const aviso = pagina.locator('.toast')
    comprobar(await aviso.isVisible(), 'sale la línea de confirmación')
    const caja = await aviso.boundingBox()
    comprobar(caja && caja.y < 200, 'y sale arriba, bajo la barra, no al final de la página')

    await pagina.getByRole('button', { name: 'Deshacer', exact: true }).click()
    await pagina.waitForTimeout(1200)
    const vuelto = await leerMes()
    comprobar(
      vuelto.variables.length === antes.variables.length,
      'y «Deshacer» lo devuelve',
      `${despues.variables.length} → ${vuelto.variables.length}`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nBorrar un apunte se puede cancelar')
  // -------------------------------------------------------------------------
  {
    const antes = await leerMes()
    await abrirApp()
    await pagina.locator('.row .btn-icono').first().click()
    await pagina.waitForTimeout(250)
    await pagina.getByRole('button', { name: 'Borrar', exact: true }).click()
    await pagina.waitForTimeout(300)
    await pagina.locator('.row.confirmando').getByRole('button', { name: 'Cancelar' }).click()
    await pagina.waitForTimeout(800)
    const despues = await leerMes()
    comprobar(
      despues.variables.length === antes.variables.length,
      'cancelar no borra nada',
      `${antes.variables.length} → ${despues.variables.length}`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nMarcar un fijo como cobrado')
  // -------------------------------------------------------------------------
  {
    await abrirApp()
    const antes = await leerMes()
    const pendientesAntes = antes.fijos.filter((f) => !f.cobrado).length
    await pagina.locator('.check').first().click()
    await pagina.waitForTimeout(1000)
    const despues = await leerMes()
    const pendientesDespues = despues.fijos.filter((f) => !f.cobrado).length
    comprobar(
      pendientesDespues === pendientesAntes - 1,
      'el círculo marca el cobro',
      `${pendientesAntes} → ${pendientesDespues} pendientes`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nEditar un importe escribiendo encima')
  // -------------------------------------------------------------------------
  {
    await abrirApp()
    const campo = pagina.locator('.row .campo.dinero').first()
    await campo.click()
    await campo.fill('41,25')
    await campo.press('Enter')
    await pagina.waitForTimeout(1000)
    const despues = await leerMes()
    comprobar(
      despues.fijos.some((f) => Math.abs(f.importe - 41.25) < 0.005),
      'el importe se guarda al pulsar Intro',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nLa nómina y el saldo se cambian donde se leen')
  // -------------------------------------------------------------------------
  {
    await abrirApp()
    await pagina.locator('.inline-valor').first().click()
    const campo = pagina.getByLabel('Nómina del mes')
    await campo.fill('3333')
    await campo.press('Enter')
    await pagina.waitForTimeout(1000)
    comprobar(Math.abs((await leerMes()).ingreso - 3333) < 0.005, 'la nómina se guarda')

    await abrirApp()
    await pagina.getByRole('button', { name: /saldo del banco/ }).first().click()
    const saldo = pagina.getByLabel('Saldo en cuenta')
    await saldo.fill('1200')
    await saldo.press('Enter')
    await pagina.waitForTimeout(1000)
    comprobar(
      Math.abs((await leerMes()).dineroEnCuenta - 1200) < 0.005,
      'el saldo del banco también',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nEl sobre de comida y el objetivo de ahorro, de este mes')
  // -------------------------------------------------------------------------
  {
    /*
     * Los tres valores del mes se han perdido una vez cada uno al rehacer la
     * pantalla: la nómina en la v2, el sobre y el objetivo en la v3. Cada uno
     * tiene aquí su comprobación para que la próxima vez salte una prueba y no
     * lo tenga que ver Toni.
     */
    await abrirApp()
    await pagina.getByRole('button', { name: /^\/ / }).first().click()
    const sobre = pagina.getByLabel('Presupuesto de comida de este mes')
    await sobre.fill('650')
    await sobre.press('Enter')
    await pagina.waitForTimeout(1200)
    const conSobre = await leerMes()
    comprobar(
      Math.abs(conSobre.presupuestoComida - 650) < 0.005,
      'el sobre de comida se cambia desde su propio tile',
      String(conSobre.presupuestoComida),
    )

    await abrirApp()
    await abrirMenuDelMes()
    const objetivo = pagina.getByLabel('Objetivo de ahorro de este mes')
    await objetivo.fill('400')
    await objetivo.press('Enter')
    await pagina.waitForTimeout(1200)
    comprobar(
      Math.abs((await leerMes()).objetivoAhorro - 400) < 0.005,
      'y el objetivo de ahorro desde el menú del mes',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nApuntar un gasto desde la línea de texto libre')
  // -------------------------------------------------------------------------
  {
    await abrirApp()
    const antes = await leerMes()
    const { datos: conceptos } = await llamar('/conceptos?activos=1')
    const variable = conceptos.find((c) => c.tipo === 'variable')
    await pagina.getByLabel('Apuntar un gasto').fill(`${variable.nombre} 9,76`)
    await pagina.waitForTimeout(400)
    await pagina.getByRole('button', { name: 'Apuntar', exact: true }).click()
    await pagina.waitForTimeout(1200)
    const despues = await leerMes()
    comprobar(
      despues.variables.length === antes.variables.length + 1,
      'se crea el apunte con el concepto y el importe del texto',
    )
    comprobar(
      despues.variables.some((v) => Math.abs(v.importe - 9.76) < 0.005),
      'y con el importe que se escribió',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nLa lista separa los extras de la comida')
  // -------------------------------------------------------------------------
  //
  // Mezclados en una sola lista, el total de la cabecera no era el de ninguno
  // de los dos: en «Extras» salia la compra del super.
  {
    const mes = await leerMes()
    const { datos: conceptos } = await llamar('/conceptos?activos=1')
    const sobre = conceptos.find((c) => c.tipo === 'sobre')
    await llamar('/movimientos', {
      metodo: 'POST',
      cuerpo: {
        mesId: mes.id,
        conceptoId: sobre.id,
        importe: 41,
        descripcion: 'Compra',
        fechaCobro: `${ANIO}-${String(MES).padStart(2, '0')}-06`,
      },
    })
    await crearVariable(mes.id, 30)
    await abrirApp()

    const tramos = await pagina.locator('.row-tramo').allTextContents()
    comprobar(tramos.length === 2, 'la lista se parte en dos tramos', tramos.join(' / '))
    comprobar(tramos[0].includes('Extras'), 'el primero es Extras')
    comprobar(tramos[1].includes('Comida'), 'y el segundo, Comida')
    comprobar(tramos[1].includes('41'), 'cada tramo lleva su propio sumatorio', tramos[1])
    comprobar(
      !tramos[0].includes('41') && !tramos[0].includes('71'),
      'y el de extras ya no arrastra la comida',
      tramos[0],
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nEl desglose de un fijo')
  // -------------------------------------------------------------------------
  //
  // Suscripciones son seis cargos y el mes que viene siete. Se despliega la
  // fila, se añade una cosa y el importe del fijo pasa a ser la suma.
  {
    await abrirApp()
    const antes = await leerMes()
    const fijo = antes.fijos[0]

    await pagina
      .getByRole('button', { name: `Ver el desglose de ${fijo.concepto}` })
      .click()
    await pagina.waitForTimeout(400)
    comprobar(await pagina.locator('.desglose').isVisible(), 'la fila se abre y enseña el desglose')

    await pagina.getByRole('button', { name: 'Añadir' }).click()
    await pagina.waitForTimeout(300)
    await pagina.getByLabel('Nombre de la cosa nueva').fill('Netflix')
    await pagina.keyboard.press('Enter')
    await pagina.waitForTimeout(1200)

    await pagina.getByLabel('Importe de Netflix').click()
    await pagina.waitForTimeout(200)
    await pagina.getByLabel('Importe de Netflix').fill('12,99')
    await pagina.keyboard.press('Enter')
    await pagina.waitForTimeout(1400)

    const despues = await leerMes()
    const cambiado = despues.fijos.find((f) => f.id === fijo.id)
    comprobar(cambiado.detalle.length === 1, 'la linea se guarda de verdad')
    comprobar(cambiado.detalle[0].nombre === 'Netflix', 'con el nombre que se escribió')
    comprobar(
      Math.abs(cambiado.importe - 12.99) < 0.005,
      'y el importe del fijo pasa a ser la suma del desglose',
      `da ${cambiado.importe}`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nRegenerar desde la plantilla')
  // -------------------------------------------------------------------------
  {
    const mes = await leerMes()
    // Se borra un fijo para que la regeneración tenga algo que hacer.
    await llamar(`/movimientos/${mes.fijos[0].id}`, { metodo: 'DELETE' })
    const antes = await leerMes()

    await abrirApp()
    await abrirMenuDelMes()
    await pagina.getByRole('button', { name: /Regenerar desde la plantilla/ }).click()
    await pagina.waitForTimeout(1200)
    await pagina.getByRole('button', { name: 'Aplicar', exact: true }).click()
    await pagina.waitForTimeout(1500)

    const despues = await leerMes()
    comprobar(
      despues.fijos.length === antes.fijos.length + 1,
      'vuelve a poner el fijo que faltaba',
      `${antes.fijos.length} → ${despues.fijos.length}`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nReiniciar el mes')
  // -------------------------------------------------------------------------
  {
    const mes = await leerMes()
    await crearVariable(mes.id, 77)
    const antes = await leerMes()
    comprobar(antes.variables.length > 0, 'hay algo que perder antes de reiniciar')

    await abrirApp()
    await abrirMenuDelMes()
    await pagina.getByRole('button', { name: /Reiniciar el mes/ }).click()
    await pagina.waitForTimeout(600)

    const confirmacion = pagina.locator('.confirmacion')
    comprobar(await confirmacion.isVisible(), 'la confirmación sale dentro de la propia hoja')
    comprobar(
      (await confirmacion.textContent()).includes('apunte'),
      'y dice cuántos apuntes se pierden',
    )

    await pagina.getByRole('button', { name: 'Sí, reiniciar el mes' }).click()
    await pagina.waitForTimeout(2000)

    const despues = await leerMes()
    comprobar(despues.variables.length === 0, 'reiniciar se lleva los variables')
    comprobar(despues.fijos.length > 0, 'y regenera los fijos desde la plantilla')
    comprobar(
      despues.fijos.every((f) => !f.cobrado),
      'todos pendientes de cobro otra vez',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nReiniciar se puede cancelar')
  // -------------------------------------------------------------------------
  {
    const antes = await leerMes()
    await abrirApp()
    await abrirMenuDelMes()
    await pagina.getByRole('button', { name: /Reiniciar el mes/ }).click()
    await pagina.waitForTimeout(500)
    await pagina.locator('.confirmacion').getByRole('button', { name: 'Cancelar' }).click()
    await pagina.waitForTimeout(800)
    comprobar(
      (await pagina.locator('.accion').count()) > 0,
      'cancelar devuelve a la lista de acciones',
    )
    const despues = await leerMes()
    comprobar(despues.fijos.length === antes.fijos.length, 'y no toca nada del mes')
  }

  // -------------------------------------------------------------------------
  console.log('\nCerrar y reabrir el mes')
  // -------------------------------------------------------------------------
  {
    await abrirApp()
    await abrirMenuDelMes()
    await pagina.getByRole('button', { name: /Cerrar el mes/ }).click()
    await pagina.waitForTimeout(1500)
    comprobar((await leerMes()).estado === 'cerrado', 'el mes se cierra')

    await abrirApp()
    await abrirMenuDelMes()
    await pagina.getByRole('button', { name: /Reabrir el mes/ }).click()
    await pagina.waitForTimeout(1500)
    comprobar((await leerMes()).estado === 'abierto', 'y se vuelve a abrir')
  }

  // -------------------------------------------------------------------------
  console.log('\nBorrar el mes entero')
  // -------------------------------------------------------------------------
  {
    await abrirApp()
    await abrirMenuDelMes()
    await pagina.getByRole('button', { name: /Borrar el mes/ }).click()
    await pagina.waitForTimeout(600)

    const confirmacion = pagina.locator('.confirmacion')
    comprobar(await confirmacion.isVisible(), 'también pregunta dentro de la hoja')
    comprobar(
      (await confirmacion.textContent()).includes('No se puede deshacer'),
      'y avisa de que no se puede deshacer',
    )

    await pagina.getByRole('button', { name: 'Sí, borrar el mes' }).click()
    await pagina.waitForTimeout(2000)

    const { estado: codigo } = await llamar(`/meses/${ANIO}/${MES}`)
    comprobar(codigo === 404, 'el mes deja de existir')
  }

  // -------------------------------------------------------------------------
  console.log('\nConceptos: activar, colorear y ordenar')
  // -------------------------------------------------------------------------
  {
    // El bloque anterior ha borrado el mes: sin uno abierto no hay pantalla Mes
    // por la que entrar.
    await prepararMes()
    await abrirApp()
    await pagina.getByRole('button', { name: 'Conceptos', exact: true }).first().click()
    await pagina.waitForSelector('.row', { timeout: 10000 })
    await pagina.waitForTimeout(500)

    const { datos: antes } = await llamar('/conceptos')
    await pagina.locator('.row .interruptor').first().click()
    await pagina.waitForTimeout(1200)
    const { datos: despues } = await llamar('/conceptos')
    comprobar(
      despues[0].activo !== antes[0].activo,
      'el interruptor activa y desactiva',
      `${antes[0].activo} → ${despues[0].activo}`,
    )

    await pagina.locator('.ico-boton').first().click()
    await pagina.waitForTimeout(600)
    await pagina.locator('.rejilla-aspecto .aspecto').nth(3).click()
    await pagina.waitForTimeout(1200)
    const { datos: coloreados } = await llamar('/conceptos')
    comprobar(coloreados[0].color !== null, 'el punto de color abre la paleta y guarda el elegido')

    // El diálogo del aspecto se queda abierto a propósito (se prueban varios);
    // hay que cerrarlo antes de tocar la lista de debajo.
    await pagina.keyboard.press('Escape')
    await pagina.waitForTimeout(500)

    const filas = pagina.locator('.card .row')
    // `dragTo` manda los eventos de arrastre de verdad; mover el ratón a mano
    // no dispara el drag-and-drop de HTML5.
    await filas.nth(0).dragTo(filas.nth(3))
    await pagina.waitForTimeout(1500)
    const { datos: ordenados } = await llamar('/conceptos')
    // Lo que importa es que la secuencia cambie, no cuál queda primero: el
    // arrastre mueve dentro de su grupo y el primero puede ser el mismo.
    const antesOrden = coloreados.map((c) => c.id).join(',')
    const despuesOrden = ordenados.map((c) => c.id).join(',')
    comprobar(antesOrden !== despuesOrden, 'y arrastrar cambia el orden', despuesOrden.slice(0, 40))
  }

  // -------------------------------------------------------------------------
  console.log('\nLa plantilla se edita en su tabla')
  // -------------------------------------------------------------------------
  {
    await pagina.getByRole('tab', { name: 'Plantilla', exact: true }).click()
    await pagina.waitForSelector('.tabla', { timeout: 10000 })
    await pagina.waitForTimeout(600)

    const campo = pagina.locator('.tabla .campo.dinero').first()
    await campo.click()
    await campo.fill('123,45')
    await campo.press('Enter')
    await pagina.waitForTimeout(1500)
    const { datos: plantilla } = await llamar('/plantilla')
    comprobar(
      plantilla.fijos.some((f) => Math.abs(f.importePrevisto - 123.45) < 0.005),
      'el importe previsto se guarda escribiendo encima',
    )

    const chip = pagina.locator('.tabla .chip').first()
    const antesTexto = await chip.textContent()
    await chip.click()
    await pagina.waitForTimeout(1500)
    const despuesTexto = await pagina.locator('.tabla .chip').first().textContent()
    comprobar(antesTexto !== despuesTexto, 'y el chip de clasificación cicla al pulsarlo')
  }

  comprobar(fallosDeConsola.length === 0, 'ninguna excepción en la consola del navegador',
    fallosDeConsola.slice(0, 2).join(' | '))
} finally {
  await navegador.close()
  await entorno.cerrar()
}

console.log(
  `\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`,
)
process.exit(estado.fallos === 0 ? 0 : 1)
