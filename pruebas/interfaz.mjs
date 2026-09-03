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
import { comoTexto } from './fixtures/extractoEjemplo.mjs'
import { levantarIaFalsa } from './mock-ia.mjs'
import {
  comoRespuestaDeIa,
  comoTexto as ticketComoTexto,
  ESPERADO as TICKET,
} from './fixtures/ticketEjemplo.mjs'

if (!fs.existsSync(path.join(RAIZ, 'dist', 'index.html'))) {
  console.log('\n  No hay dist/. Ejecuta "npm run build" antes de esta suite.\n')
  process.exit(1)
}

/*
 * Una IA simulada para poder leer un ticket. Contesta siempre lo mismo, que
 * es justo lo que hace falta: lo que se prueba es la pantalla, no el modelo.
 */
const ia = await levantarIaFalsa({ responder: () => comoRespuestaDeIa() })
const entorno = await levantar('interfaz', { OPENAI_BASE_URL: ia.base })
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
  console.log('\nCuadrar con el banco')
  // -------------------------------------------------------------------------
  //
  // Lo comprometido son recibos que TODAVÍA no han salido de la cuenta, así que
  // ese dinero sigue en el banco: lo que debería haber es lo libre más lo
  // comprometido. Comparar eso con el saldo anotado es lo que convierte la
  // pantalla en algo que se puede verificar contra la realidad.
  {
    const mes = await leerMes()
    const { datos: panel } = await llamar(`/meses/${mes.id}/panel`)
    const deberia = Math.round((panel.libre + panel.comprometido) * 100) / 100

    // Sin saldo anotado no hay nada que cuadrar, y no se enseña nada.
    await llamar(`/meses/${mes.id}`, { metodo: 'PATCH', cuerpo: { dineroEnCuenta: null } })
    await abrirApp()
    comprobar(
      (await pagina.locator('.cuadre-banco').count()) === 0,
      'sin saldo anotado no se enseña la comparación',
    )

    // Con el saldo que toca, cuadra.
    await llamar(`/meses/${mes.id}`, {
      metodo: 'PATCH',
      cuerpo: { dineroEnCuenta: deberia },
    })
    await abrirApp()
    const cuadrando = await pagina.locator('.cuadre-banco').innerText()
    comprobar(
      cuadrando.includes('cuadra'),
      'con el saldo que toca, dice que cuadra',
      cuadrando,
    )

    // Y con quince euros de menos, lo dice y no lo llama error.
    await llamar(`/meses/${mes.id}`, {
      metodo: 'PATCH',
      cuerpo: { dineroEnCuenta: deberia - 15.44 },
    })
    await abrirApp()
    const difiriendo = await pagina.locator('.cuadre-banco').innerText()
    comprobar(
      // El espacio antes del € es un no-separable: se compara sin atarse a él.
      /15,44\s?€ de diferencia/.test(difiriendo),
      'y con el saldo desviado, dice cuánto se desvía',
      difiriendo,
    )
    comprobar(
      (await pagina.locator('.cuadre-banco-ojo').count()) === 1,
      'en ámbar: una diferencia puede ser dinero del mes anterior, no un error',
    )

    // Se deja el saldo sin poner: la prueba de al lado cuenta con eso.
    await llamar(`/meses/${mes.id}`, { metodo: 'PATCH', cuerpo: { dineroEnCuenta: null } })
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
    await pagina.getByRole('button', { name: /Anotar el saldo/ }).first().click()
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
  console.log('\nDos cambios seguidos en el desglose, con la red lenta')
  // -------------------------------------------------------------------------
  //
  // «Le doy añadir y al dar a intro, el otro lo elimina y solo queda el nuevo».
  //
  // Cada cambio del desglose manda la lista ENTERA. Mientras se construyera a
  // partir de lo que había cuando se pintó la pantalla, dos cambios seguidos
  // eran una carrera: el segundo viajaba con la foto vieja y borraba al
  // primero. En local no se veía —el servidor contesta en dos milisegundos—,
  // así que aquí se le pone a la red el retardo que tiene de verdad.
  {
    await pagina.route('**/api/**', async (ruta) => {
      await new Promise((r) => setTimeout(r, 500))
      await ruta.continue()
    })
    try {
      await abrirApp()
      await pagina.waitForTimeout(1200)
      const antes = await leerMes()
      const fijo = antes.fijos.find((f) => (f.detalle ?? []).length > 0)
      comprobar(!!fijo, 'se parte de un fijo que ya tiene una línea')
      const vieja = fijo.detalle[0].nombre

      await pagina.getByRole('button', { name: `Ver el desglose de ${fijo.concepto}` }).click()
      await pagina.waitForTimeout(600)

      // Se toca el importe y, SIN esperar a que llegue, se añade otra línea.
      const importe = pagina.getByLabel(`Importe de ${vieja}`)
      await importe.click()
      await importe.fill('25')
      await pagina.getByRole('button', { name: 'Añadir' }).click()
      await pagina.getByLabel('Nombre de la cosa nueva').fill('Luz')
      await pagina.keyboard.press('Enter')
      await pagina.waitForTimeout(4000)

      const despues = (await leerMes()).fijos.find((f) => f.id === fijo.id)
      const nombres = (despues.detalle ?? []).map((l) => l.nombre)
      comprobar(
        nombres.length === 2 && nombres.includes(vieja) && nombres.includes('Luz'),
        'LA LÍNEA DE ANTES NO SE BORRA al añadir la nueva',
        JSON.stringify(nombres),
      )
      comprobar(
        Math.abs((despues.detalle.find((l) => l.nombre === vieja)?.importe ?? 0) - 25) < 0.005,
        'y el importe que se estaba escribiendo tampoco se deshace',
        JSON.stringify(despues.detalle),
      )
      comprobar(
        despues.detalle.every((l) => l.importacionId === null || l.importacionId === undefined),
        'una línea escrita a mano no dice venir de la importación número cero',
        JSON.stringify(despues.detalle.map((l) => l.importacionId)),
      )

      /*
       * Y al revés, que es como lo contó: primero se añade y enseguida se toca
       * el importe de la que ya estaba. Aquí el que llega el último es el
       * cambio del importe, y con la foto vieja venía sin la línea nueva: la
       * borraba.
       */
      await llamar(`/movimientos/${fijo.id}`, {
        metodo: 'PATCH',
        cuerpo: { detalle: [{ nombre: vieja, importe: 12.99 }] },
      })
      await abrirApp()
      await pagina.waitForTimeout(1200)
      await pagina.getByRole('button', { name: `Ver el desglose de ${fijo.concepto}` }).click()
      await pagina.waitForTimeout(600)

      await pagina.getByRole('button', { name: 'Añadir' }).click()
      await pagina.getByLabel('Nombre de la cosa nueva').fill('Gas')
      await pagina.keyboard.press('Enter')
      const otro = pagina.getByLabel(`Importe de ${vieja}`)
      await otro.click()
      await otro.fill('30')
      await pagina.keyboard.press('Enter')
      await pagina.waitForTimeout(4000)

      const alReves = (await leerMes()).fijos.find((f) => f.id === fijo.id)
      const suyos = (alReves.detalle ?? []).map((l) => l.nombre)
      comprobar(
        suyos.length === 2 && suyos.includes('Gas'),
        'y tocando el importe justo después de añadir, la nueva tampoco se pierde',
        JSON.stringify(suyos),
      )
      comprobar(
        Math.abs((alReves.detalle.find((l) => l.nombre === vieja)?.importe ?? 0) - 30) < 0.005,
        'con el importe nuevo puesto',
        JSON.stringify(alReves.detalle),
      )
    } finally {
      await pagina.unroute('**/api/**')
    }
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
  console.log('\nAtajos de selección en el extracto')
  // -------------------------------------------------------------------------
  //
  // Lo que queda sin clasificar es casi siempre lo mismo repetido —bizums,
  // abonos, comisiones del banco— y marcarlo de uno en uno era el trabajo
  // aburrido de cada importación. Los atajos solo SELECCIONAN: lo que se hace
  // después sigue siendo cosa de la barra de arriba, así que aquí se comprueban
  // las dos mitades, seleccionar y luego actuar.
  {
    // El bloque anterior borra el mes, y sin mes abierto no hay donde importar.
    await prepararMes()
    await abrirApp()
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
    await pagina.waitForTimeout(800)

    const atajos = await pagina.locator('.atajos .chip').allTextContents()
    comprobar(atajos.length >= 4, 'salen los atajos de selección', atajos.join(' / '))
    comprobar(
      atajos.some((t) => t.startsWith('Todo lo pendiente')),
      'el primero es todo lo pendiente',
    )
    comprobar(
      atajos.some((t) => /^Comisi/.test(t)),
      'y el banco cobrándose lo suyo tiene el suyo',
      atajos.join(' / '),
    )

    // Un grupo pequeño: el Bizum del extracto de ejemplo.
    const bizum = pagina.locator('.atajos .chip', { hasText: /^Bizum/ })
    comprobar((await bizum.count()) === 1, 'hay un atajo para los bizums')
    await bizum.click()
    await pagina.waitForTimeout(400)
    comprobar(
      (await pagina.locator('.barra-seleccion').textContent()).includes('1 seleccionado'),
      'pulsarlo selecciona su línea',
      await pagina.locator('.barra-seleccion').textContent(),
    )

    // Y pulsarlo otra vez la suelta: es el mismo botón.
    await bizum.click()
    await pagina.waitForTimeout(400)
    comprobar(
      (await pagina.locator('.barra-seleccion').count()) === 0,
      'y pulsarlo de nuevo deshace la selección',
    )

    // Todo lo pendiente, y a la basura de una vez.
    const sinClasificarAntes = await pagina.locator('.atajos .chip').first().textContent()
    const cuantos = Number(sinClasificarAntes.match(/\((\d+)\)/)[1])
    comprobar(cuantos > 3, 'quedan varias líneas sin clasificar', String(cuantos))

    await pagina.locator('.atajos .chip').first().click()
    await pagina.waitForTimeout(400)
    comprobar(
      (await pagina.locator('.barra-seleccion').textContent()).includes(`${cuantos} seleccionado`),
      'todo lo pendiente las selecciona todas',
      await pagina.locator('.barra-seleccion').textContent(),
    )

    await pagina.getByRole('button', { name: 'Descartar', exact: true }).click()
    await pagina.waitForTimeout(900)
    comprobar(
      (await pagina.locator('.atajos').count()) === 0,
      'y descartarlas en bloque vacía el bloque de sin clasificar',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nLos fijos del extracto salen en una tabla de verdad')
  // -------------------------------------------------------------------------
  //
  // Antes eran cinco columnas fingidas con un flex: la cabecera decía
  // «Previsto · Real · Diferencia» y debajo cada fila ponía sus cifras donde le
  // cabían. Lo que se comprueba es lo único que garantiza que se alineen: que
  // sea una tabla y que todas las filas declaren tantas columnas como la
  // cabecera, contando las que se extienden.
  {
    const tabla = pagina.locator('.tabla').first()
    comprobar((await tabla.count()) === 1, 'los fijos se pintan con una tabla')

    const columnas = await tabla.locator('thead th').count()
    comprobar(columnas === 5, 'con sus cinco columnas', String(columnas))

    const anchuras = await tabla.evaluate((t) =>
      [...t.querySelectorAll('tbody tr')].map((fila) =>
        [...fila.children].reduce((n, c) => n + (c.colSpan || 1), 0),
      ),
    )
    comprobar(anchuras.length > 3, 'hay fijos que mirar', String(anchuras.length))
    comprobar(
      anchuras.every((n) => n === columnas),
      'y ninguna fila se sale de la rejilla',
      [...new Set(anchuras)].join(', '),
    )

    // Un fijo que suma varias líneas del banco se abre y las enseña.
    const abrir = tabla.locator('.btn-icono').first()
    comprobar((await abrir.count()) === 1, 'un fijo con varias líneas se puede desplegar')
    const antes = await tabla.locator('tbody tr').count()
    await abrir.click()
    await pagina.waitForTimeout(500)
    const despues = await tabla.locator('tbody tr').count()
    comprobar(despues > antes, 'y al abrirlo salen sus líneas', `${antes} → ${despues}`)

    const conDetalle = await tabla.evaluate((t) =>
      [...t.querySelectorAll('tbody tr')].map((fila) =>
        [...fila.children].reduce((n, c) => n + (c.colSpan || 1), 0),
      ),
    )
    comprobar(
      conDetalle.every((n) => n === columnas),
      'las líneas de detalle tampoco',
      [...new Set(conDetalle)].join(', '),
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nRevisar un ticket de la compra')
  // -------------------------------------------------------------------------
  //
  // Lo que se comprueba aquí son las dos garantías de la pantalla, que no se
  // ven desde la API: que Aceptar está bloqueado hasta que el ticket está listo,
  // y que el botón que resuelve el resto lo desbloquea. Un ticket de cuarenta y
  // cinco líneas que no se puede guardar es un ticket que se abandona.
  {
    await prepararMes()
    await llamar('/config/ia', {
      metodo: 'PUT',
      cuerpo: { proveedor: 'openai', clave: 'sk-de-mentira', modelo: 'gpt-4o-mini' },
    })
    await abrirApp()

    await pagina.getByRole('button', { name: 'Importar', exact: true }).first().click()
    await pagina.waitForTimeout(700)
    await pagina.getByRole('tab', { name: 'Tickets', exact: true }).click()
    await pagina.waitForTimeout(600)
    await pagina.getByRole('button', { name: 'Pegar el ticket' }).click()
    await pagina.waitForTimeout(300)
    await pagina.getByLabel('Ticket pegado').fill(ticketComoTexto())
    await pagina.getByLabel('Ticket pegado').blur()
    await pagina.waitForTimeout(300)
    await pagina.getByRole('button', { name: 'Leer lo pegado' }).click()
    await pagina.waitForSelector('.linea-ticket', { timeout: 25000 })
    await pagina.waitForTimeout(800)

    const lineas = await pagina.locator('.linea-ticket').count()
    comprobar(lineas === TICKET.lineas, `salen las ${TICKET.lineas} líneas`, String(lineas))

    const cuadre = await pagina.locator('.cuadre').innerText()
    comprobar(
      cuadre.includes('cuadra con el ticket'),
      'y la cabecera dice que cuadran con el total',
      cuadre,
    )
    comprobar(
      cuadre.includes('sin asignar'),
      'pero avisa de que falta clasificarlas',
      cuadre,
    )

    const aceptar = pagina.getByRole('button', { name: 'Aceptar', exact: true })
    comprobar(
      !(await aceptar.isEnabled()),
      'con líneas sin asignar, Aceptar está bloqueado',
    )

    /*
     * La selección en bloque, que es lo que hace llevadero un ticket. Sin ella,
     * revisar cuarenta y cinco líneas son cuarenta y cinco clics: la IA acierta
     * en casi todas y lo que se quiere es mirarlas y darlas por buenas de golpe.
     */
    const atajos = await pagina.locator('.atajos').first().innerText()
    comprobar(
      atajos.includes(`Todas (${TICKET.lineas})`),
      'hay un atajo para seleccionarlas todas',
      atajos.replace(/\n/g, ' '),
    )
    comprobar(
      /Carne y charcutería \(\d+\)/.test(atajos),
      'y uno por cada categoría que propone la IA',
    )

    // Primero una categoría suelta: se revisa por bloques.
    await pagina.locator('.atajos .chip', { hasText: /^Carne/ }).click()
    await pagina.waitForTimeout(400)
    const barra = await pagina.locator('.barra-seleccion').innerText()
    comprobar(barra.includes('seleccionadas'), 'seleccionarla marca sus líneas', barra)

    await pagina.getByRole('button', { name: /^Aceptar \d+ propuestas?$/ }).click()
    await pagina.waitForTimeout(700)
    const trasCarne = Number(
      (await pagina.locator('.cuadre').innerText()).match(/falta: (\d+) líneas/)?.[1] ?? 0,
    )
    comprobar(
      trasCarne > 0 && trasCarne < TICKET.lineas,
      'y aceptar sus propuestas resuelve ese bloque de una vez',
      `quedan ${trasCarne}`,
    )

    // Y el resto, todas de golpe.
    await pagina.locator('.atajos .chip', { hasText: /^Todas/ }).click()
    await pagina.waitForTimeout(400)
    await pagina.getByRole('button', { name: /^Aceptar \d+ propuestas?$/ }).click()
    await pagina.waitForTimeout(900)
    comprobar(
      await aceptar.isEnabled(),
      'con todas aceptadas, el ticket ya se puede guardar',
    )
    comprobar(
      (await pagina.locator('.cuadre').innerText()).includes('cuadra con el ticket'),
      'y sigue cuadrando',
    )

    const antes = (await leerMes()).variables.length
    await aceptar.click()
    await pagina.waitForTimeout(2500)

    const despues = await leerMes()
    comprobar(
      despues.variables.length === antes + 1,
      'al aceptar se crea UN apunte, no cuarenta y cinco',
      `${antes} → ${despues.variables.length}`,
    )

    const { datos: tickets } = await llamar('/tickets')
    comprobar(tickets.length === 1, 'y queda el ticket guardado')
    comprobar(
      tickets[0].nLineas === TICKET.lineas,
      'con todas sus líneas',
      String(tickets[0].nLineas),
    )

    comprobar(
      (await pagina.locator('.toast').innerText()).includes('Deshacer'),
      'y el aviso ofrece deshacerlo',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nApuntar un ticket a mano')
  // -------------------------------------------------------------------------
  //
  // Se pierde el papel y uno se acuerda de lo que compró. No hay foto que leer,
  // así que el total no está impreso en ningún sitio: sale de sumar lo que se
  // apunta, y eso es lo que se comprueba aquí.
  {
    await abrirApp()
    await pagina.getByRole('button', { name: 'Importar', exact: true }).first().click()
    await pagina.waitForTimeout(700)
    await pagina.getByRole('tab', { name: 'Tickets', exact: true }).click()
    await pagina.waitForTimeout(600)

    await pagina.getByRole('button', { name: 'Apunta la compra a mano' }).click()
    await pagina.waitForTimeout(400)
    await pagina.getByLabel('Dónde se compró').fill('Frutería de la esquina')
    await pagina.getByLabel('Dónde se compró').blur()
    await pagina.waitForTimeout(300)
    await pagina.getByRole('button', { name: 'Escribir la compra' }).click()
    await pagina.waitForTimeout(700)

    comprobar(
      (await pagina.locator('.linea-ticket').count()) === 0,
      'la revisión arranca en blanco: no hay nada que leer',
    )

    for (const [texto, importe] of [['Manzanas', '3,20'], ['Plátanos', '2,15']]) {
      await pagina.getByRole('button', { name: 'Añadir una línea' }).click()
      await pagina.waitForTimeout(300)
      const fila = pagina.locator('.linea-ticket').last()
      await fila.getByLabel('Qué pone en el ticket').fill(texto)
      await fila.getByLabel('Qué pone en el ticket').blur()
      await pagina.waitForTimeout(200)
      const campo = fila.locator('.campo.dinero')
      await campo.click()
      await campo.fill(importe)
      await campo.press('Enter')
      await pagina.waitForTimeout(400)
    }

    comprobar(
      (await pagina.locator('.linea-ticket').count()) === 2,
      'se escriben las líneas una a una',
    )
    const cuadreMano = await pagina.locator('.cuadre').innerText()
    comprobar(
      cuadreMano.includes('5,35'),
      'y el total sale de sumarlas: no hay ninguno impreso que respetar',
      cuadreMano,
    )

    await pagina.getByRole('button', { name: 'Lo que quede, a «Otros»' }).click()
    await pagina.waitForTimeout(700)
    const antesMano = (await leerMes()).variables.length
    await pagina.getByRole('button', { name: 'Aceptar', exact: true }).click()
    await pagina.waitForTimeout(2500)

    const trasMano = await leerMes()
    comprobar(
      trasMano.variables.length === antesMano + 1,
      'y al aceptar se apunta la compra como cualquier otra',
      `${antesMano} → ${trasMano.variables.length}`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nImportar propone el mes en curso, y no lo pierde')
  // -------------------------------------------------------------------------
  //
  // Dos fallos que iban juntos. Cada pestaña cogía «el último abierto», que es
  // el más nuevo de la lista y no el de hoy. Y la lista de meses llega después
  // del primer pintado: al entrar directamente en Tickets, el mes se quedaba a
  // nulo para siempre —«no hay ningún mes abierto»— y solo se arreglaba
  // cambiando de pestaña y volviendo.
  {
    const NOMBRES = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ]
    const nombreDeHoy = NOMBRES[MES - 1]

    // Un mes MÁS NUEVO que el de hoy, que es el que se colaba antes.
    const siguiente = MES === 12 ? { anio: ANIO + 1, mes: 1 } : { anio: ANIO, mes: MES + 1 }
    await llamar('/meses/asegurar', { metodo: 'POST', cuerpo: siguiente })

    await abrirApp()
    await pagina.getByRole('button', { name: 'Importar', exact: true }).first().click()
    await pagina.waitForTimeout(900)

    const delExtracto = await pagina.locator('.card').first().innerText()
    comprobar(
      delExtracto.includes(nombreDeHoy),
      'el extracto propone el mes en curso, no el más nuevo',
      delExtracto.split('\n').find((l) => NOMBRES.some((n) => l.includes(n))) ?? '?',
    )

    await pagina.getByRole('tab', { name: 'Tickets', exact: true }).click()
    await pagina.waitForTimeout(800)
    const deTickets = await pagina.locator('.card').first().innerText()
    comprobar(deTickets.includes(nombreDeHoy), 'y los tickets proponen el mismo', deTickets.split('\n')[1] ?? '?')

    // Ir a Mes y volver: antes esto dejaba los tickets sin mes.
    await pagina.getByRole('button', { name: 'Mes', exact: true }).first().click()
    await pagina.waitForTimeout(1200)
    await pagina.getByRole('button', { name: 'Importar', exact: true }).first().click()
    await pagina.waitForTimeout(1200)

    const alVolver = await pagina.locator('.card').first().innerText()
    comprobar(
      !alVolver.includes('No hay ningún mes abierto'),
      'al volver desde Mes, la pestaña de tickets sigue teniendo mes',
      alVolver.slice(0, 80),
    )
    comprobar(
      alVolver.includes(nombreDeHoy),
      'y es el mes en curso, sin tener que cambiar de pestaña para recuperarlo',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nLa fecha se escribe siempre en dd/mm/aaaa')
  // -------------------------------------------------------------------------
  //
  // Un `input type="date"` a secas se pinta con el idioma del NAVEGADOR, no con
  // el de la página: en uno en inglés salía 10/01/2026 —el mismo día escrito al
  // revés— mientras el resto de la aplicación decía otra cosa. Por eso esta
  // pestaña se abre a propósito en inglés: es donde fallaba.
  {
    const enIngles = await navegador.newContext({ locale: 'en-US' })
    const otra = await enIngles.newPage()
    try {
      await otra.goto(WEB)
      await otra.evaluate((token) => localStorage.setItem('gastos.token', token), entorno.token)
      await otra.goto(WEB, { waitUntil: 'networkidle' })
      await otra.waitForSelector('.hero', { timeout: 15000 })

      await otra.getByRole('button', { name: 'Importar', exact: true }).first().click()
      await otra.waitForTimeout(700)
      await otra.getByRole('tab', { name: 'Tickets', exact: true }).click()
      await otra.waitForTimeout(600)
      await otra.getByRole('button', { name: 'Apunta la compra a mano' }).click()
      await otra.waitForTimeout(500)

      const campo = otra.getByLabel('Fecha de la compra', { exact: true })
      const hoy = new Date()
      const dia = String(hoy.getDate()).padStart(2, '0')
      const mesDeHoy = String(hoy.getMonth() + 1).padStart(2, '0')
      comprobar(
        (await campo.inputValue()) === `${dia}/${mesDeHoy}/${hoy.getFullYear()}`,
        'en un navegador en inglés, la fecha sale igual en dd/mm/aaaa',
        await campo.inputValue(),
      )

      await campo.fill('15/10/2026')
      await campo.press('Enter')
      await otra.waitForTimeout(400)
      comprobar(
        (await otra.locator('.campo-fecha-boton input').inputValue()) === '2026-10-15',
        'se escribe en dd/mm/aaaa y por dentro se guarda en ISO',
      )

      // Una fecha que no existe se rechaza y se vuelve a la que había.
      await campo.fill('31/02/2026')
      await campo.press('Enter')
      await otra.waitForTimeout(400)
      comprobar(
        (await campo.inputValue()) === '15/10/2026',
        'y el 31 de febrero no se traga: vuelve a la anterior',
        await campo.inputValue(),
      )

      // Y el calendario del sistema sigue estando, encima del icono.
      const calendario = otra.locator('.campo-fecha-boton input')
      await calendario.fill('2026-10-22')
      await otra.waitForTimeout(400)
      comprobar(
        (await campo.inputValue()) === '22/10/2026',
        'y elegir en el calendario también funciona',
        await campo.inputValue(),
      )
    } finally {
      await enIngles.close()
    }
  }

  // -------------------------------------------------------------------------
  console.log('\nAnalítica entra por el mes en curso')
  // -------------------------------------------------------------------------
  //
  // Es la pregunta de casi todos los días —«¿cómo voy este mes?»— y era justo
  // la que no se podía hacer sin abrir el rango libre y elegir el mismo mes dos
  // veces.
  {
    await abrirApp()
    await pagina.getByRole('button', { name: 'Analítica', exact: true }).first().click()
    await pagina.waitForSelector('.selector-rango', { timeout: 10000 })
    await pagina.waitForTimeout(800)

    const activo = await pagina.locator('.selector-rango .chip.activo').innerText()
    comprobar(activo === 'Este mes', 'se entra con el mes en curso elegido', activo)

    const NOMBRES = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ]
    const subtitulo = await pagina.locator('.cabecera-sub').innerText()
    comprobar(
      subtitulo.includes(`${NOMBRES[MES - 1]} ${ANIO}`),
      'y la cabecera dice de qué mes habla',
      subtitulo,
    )
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
  console.log('\nEl catálogo de la compra se puede llenar a mano')
  // -------------------------------------------------------------------------
  //
  // El catálogo se llena solo guardando tickets, pero eso no basta: hay que
  // poder preparar una categoría antes del primer ticket y añadir lo que falte
  // sin esperar a comprarlo otra vez. Antes las categorías vacías ni siquiera
  // se pintaban, así que crear una parecía no hacer nada.
  {
    await abrirApp()
    await pagina.getByRole('button', { name: 'Conceptos', exact: true }).first().click()
    await pagina.waitForTimeout(700)
    await pagina.getByRole('tab', { name: 'Productos', exact: true }).click()
    await pagina.waitForTimeout(1000)

    const tarjetas = async () =>
      (await pagina.locator('.card .card-titulo').allTextContents()).filter((t) => t)

    const { datos: categorias } = await llamar('/categorias-producto')
    comprobar(
      (await tarjetas()).length === categorias.length + 1,
      'se ven todas las categorías, tengan productos o no',
      `${(await tarjetas()).length} tarjetas para ${categorias.length} categorías`,
    )

    // Una categoría nueva.
    await pagina.getByLabel('Categoría nueva').fill('Vinos y licores')
    await pagina.getByLabel('Categoría nueva').blur()
    await pagina.waitForTimeout(300)
    await pagina.getByRole('button', { name: 'Añadir', exact: true }).click()
    await pagina.waitForTimeout(1200)

    comprobar(
      (await tarjetas()).includes('Vinos y licores'),
      'la categoría recién creada sale en la lista',
    )

    // Un producto dentro.
    const tarjeta = pagina.locator('.card', { hasText: 'Vinos y licores' }).last()
    await tarjeta.getByRole('button', { name: 'Añadir producto' }).click()
    await pagina.waitForTimeout(400)
    await pagina.getByLabel('Producto nuevo en Vinos y licores').fill('Vino tinto')
    await pagina.getByLabel('Producto nuevo en Vinos y licores').press('Enter')
    await pagina.waitForTimeout(1400)

    const { datos: conProducto } = await llamar('/productos?variantes=1')
    const creado = conProducto.find((p) => p.nombre === 'Vino tinto')
    comprobar(!!creado, 'se le puede añadir un producto')
    comprobar(
      creado?.categoria === 'Vinos y licores',
      'y queda en la categoría desde la que se creó',
      String(creado?.categoria),
    )

    // Y una variante dentro del producto.
    await pagina.locator('.card', { hasText: 'Vinos y licores' }).last().locator('.tabla .btn-icono').first().click()
    await pagina.waitForTimeout(600)
    await pagina.getByRole('button', { name: 'Añadir variante' }).click()
    await pagina.waitForTimeout(400)
    await pagina.getByLabel('Variante nueva de Vino tinto').fill('Rioja crianza')
    await pagina.getByLabel('Variante nueva de Vino tinto').press('Enter')
    await pagina.waitForTimeout(1400)

    const { datos: conVariante } = await llamar('/productos?variantes=1')
    const conSuVariante = conVariante.find((p) => p.nombre === 'Vino tinto')
    comprobar(
      (conSuVariante?.variantes ?? []).some((v) => v.nombre === 'Rioja crianza'),
      'y una variante dentro de ese producto',
      JSON.stringify((conSuVariante?.variantes ?? []).map((v) => v.nombre)),
    )
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

    /*
     * De dónde sale el importe. El selector enseña la opción elegida y solo
     * despliega la lista al pulsarlo, así que hay dos pasos: abrir y elegir.
     */
    const { datos: antesPlantilla } = await llamar('/plantilla')
    const primero = antesPlantilla.fijos[0]
    await pagina
      .getByRole('button', { name: new RegExp(`De dónde sale el importe de ${primero.nombre}`) })
      .click()
    await pagina.waitForTimeout(300)
    await pagina.getByRole('button', { name: 'Mes anterior' }).click()
    await pagina.waitForTimeout(1500)

    const { datos: despuesPlantilla } = await llamar('/plantilla')
    const cambiado = despuesPlantilla.fijos.find((f) => f.conceptoId === primero.conceptoId)
    comprobar(
      cambiado.criterio === 'mes-anterior',
      'el criterio del importe se guarda desde la tabla',
      cambiado.criterio,
    )
    comprobar(
      (await pagina.locator('.tabla').first().textContent()).includes('respaldo'),
      'y la fila pasa a enseñar el importe escrito como respaldo',
    )
  }

  comprobar(fallosDeConsola.length === 0, 'ninguna excepción en la consola del navegador',
    fallosDeConsola.slice(0, 2).join(' | '))
} finally {
  await navegador.close()
  await entorno.cerrar()
  await ia.cerrar()
}

console.log(
  `\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`,
)
process.exit(estado.fallos === 0 ? 0 : 1)
