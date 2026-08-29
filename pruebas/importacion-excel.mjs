// Pruebas del parser y de la importación, contra un libro generado con el
// mismo formato que las hojas anuales de verdad.
import { levantar, crearLlamar, crearComprobador, igualEnCentimos } from './entorno.mjs'
import { libroDeEjemplo, EJEMPLO, gastosEsperados } from './fixtures/hojaEjemplo.mjs'

const entorno = await levantar('excel')
const llamar = crearLlamar(entorno)
const { comprobar, estado } = crearComprobador()

const archivo = (await libroDeEjemplo()).toString('base64')

try {
  // -------------------------------------------------------------------------
  console.log('\nHojas del libro')
  // -------------------------------------------------------------------------
  {
    const { estado: codigo, datos } = await llamar('/importar/excel/hojas', {
      metodo: 'POST',
      cuerpo: { archivo },
    })
    comprobar(codigo === 200, 'se abre el archivo')

    const candidatas = datos.hojas.filter((h) => h.esCandidata)
    comprobar(candidatas.length === 1, 'solo una hoja parece de cuentas anuales')
    comprobar(candidatas[0].nombre === 'Cuentas2023', 'es la hoja Cuentas2023')
    comprobar(candidatas[0].anio === 2023, 'el año se deduce del nombre')
    comprobar(
      datos.hojas.some((h) => h.nombre === 'Notas' && !h.esCandidata),
      'la hoja que no es de cuentas no se propone',
    )

    const vacio = await llamar('/importar/excel/hojas', { metodo: 'POST', cuerpo: {} })
    comprobar(vacio.estado === 400, 'sin archivo responde 400')

    const basura = await llamar('/importar/excel/hojas', {
      metodo: 'POST',
      cuerpo: { archivo: Buffer.from('esto no es un xlsx').toString('base64') },
    })
    comprobar(basura.estado === 400, 'un archivo que no es xlsx responde 400')
  }

  // -------------------------------------------------------------------------
  console.log('\nVista previa')
  // -------------------------------------------------------------------------
  let previa = null
  {
    const respuesta = await llamar('/importar/excel/vista-previa', {
      metodo: 'POST',
      cuerpo: { archivo, hoja: 'Cuentas2023' },
    })
    comprobar(respuesta.estado === 200, 'la vista previa responde')
    previa = respuesta.datos

    comprobar(previa.anio === 2023, 'año 2023')
    comprobar(previa.meses.length === 3, 'solo los tres meses con datos', `da ${previa.meses.length}`)
    comprobar(!previa.yaImportado, 'todavía no hay nada de ese año')

    const enero = previa.meses.find((m) => m.mes === 1)
    comprobar(igualEnCentimos(enero.ingreso, EJEMPLO.ingresos[1]), 'el ingreso de enero sale de la fila Ingresos')
    comprobar(igualEnCentimos(enero.comida, 400), 'la comida de enero es 400')
    comprobar(igualEnCentimos(enero.objetivoAhorro, 500), 'el ahorro de enero se lee como objetivo')
    comprobar(enero.variables === 4, 'enero tiene cuatro apuntes variables')
    comprobar(
      igualEnCentimos(enero.otrosCalculado, 166.64),
      'la suma de los variables de enero es 166,64 (con la devolución restada)',
      `da ${enero.otrosCalculado}`,
    )
    comprobar(enero.descuadre === 0, 'enero cuadra con su fila "Otros"')
    comprobar(
      igualEnCentimos(enero.gastosCalculado, gastosEsperados(1)),
      'los gastos calculados de enero son los esperados',
      `da ${enero.gastosCalculado}, esperado ${gastosEsperados(1)}`,
    )

    const marzo = previa.meses.find((m) => m.mes === 3)
    comprobar(
      igualEnCentimos(marzo.descuadre, 100),
      'marzo descuadra en 100 con su fila "Otros"',
      `da ${marzo.descuadre}`,
    )

    // Conceptos.
    comprobar(
      previa.fijos.some((f) => f.nombreExcel === 'Gimasio' && f.porAlias),
      '"Gimasio" se reconoce por alias como Gimnasio',
    )
    comprobar(
      previa.fijos.find((f) => f.nombreExcel === 'Gimasio')?.conceptoNombre === 'Gimnasio',
      'y apunta al concepto Gimnasio',
    )
    comprobar(
      previa.fijos.some((f) => f.nombreExcel === 'Luz,Gas,Agua,IBI' && f.porAlias),
      '"Luz,Gas,Agua,IBI" también se reconoce por alias',
    )
    comprobar(
      previa.fijos.every((f) => f.nombreExcel !== 'Otros' && f.nombreExcel !== 'Gastos'),
      'las filas de totales no se toman por conceptos',
    )
    comprobar(
      previa.fijos.some((f) => f.nombreExcel === 'Ahorro'),
      'el "Ahorro" del bloque de fijos sí es un concepto',
    )
    comprobar(
      !previa.fijos.some((f) => f.nombreExcel === 'Colegio Nur'),
      'las etiquetas sueltas de debajo no entran como conceptos',
    )
    comprobar(
      previa.variables.some((v) => v.nombreExcel === 'Préstamo' && v.total === -100),
      'la devolución llega con su signo',
    )

    // Avisos.
    comprobar(
      previa.avisos.some((a) => a.includes('fórmula')),
      'avisa de la fórmula sin resultado guardado',
      JSON.stringify(previa.avisos),
    )
    comprobar(
      previa.avisos.some((a) => a.includes('Ahorro') && a.includes('objetivo')),
      'avisa de que el ahorro no cuenta como gasto',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nImportación')
  // -------------------------------------------------------------------------
  {
    const { estado: codigo, datos } = await llamar('/importar/excel/confirmar', {
      metodo: 'POST',
      cuerpo: { archivo, hoja: 'Cuentas2023', crearAjustes: true },
    })
    comprobar(codigo === 200, 'la importación responde')
    comprobar(datos.meses === 3, 'entran tres meses')
    comprobar(
      datos.ajustes.length === 1 && datos.ajustes[0].mes === 3,
      'se anota el descuadre de marzo',
    )
    comprobar(datos.ajustes[0].aplicado === true, 'y se crea su movimiento de ajuste')

    const { datos: enero } = await llamar('/meses/2023/1')
    comprobar(enero.estado === 'cerrado', 'los meses importados quedan cerrados')
    comprobar(enero.dineroEnCuenta === null, 'el dinero en cuenta no se inventa')
    comprobar(
      enero.fijos.every((f) => f.cobrado && f.origen === 'excel'),
      'los fijos importados entran cobrados y con origen "excel"',
    )
    comprobar(
      igualEnCentimos(enero.presupuestoComida, 400),
      'la comida se guarda como presupuesto del mes',
    )
    comprobar(
      igualEnCentimos(enero.objetivoAhorro, 500),
      'el ahorro se guarda como objetivo del mes',
    )
    comprobar(
      !enero.fijos.some((f) => f.concepto === 'Ahorro'),
      'el ahorro no genera un movimiento de gasto',
    )
    comprobar(
      enero.variables.some((v) => v.concepto === 'Comida' && igualEnCentimos(v.importe, 400)),
      'sin detalle de comida, el importe del mes entra como movimiento del sobre',
    )
    comprobar(
      igualEnCentimos(enero.resumen.gastos, gastosEsperados(1)),
      'los gastos de enero coinciden con lo esperado',
      `da ${enero.resumen.gastos}, esperado ${gastosEsperados(1)}`,
    )
    comprobar(
      enero.variables.some((v) => igualEnCentimos(v.importe, -100)),
      'la devolución se guarda en negativo',
    )

    const { datos: marzo } = await llamar('/meses/2023/3')
    comprobar(
      marzo.variables.some((v) => v.concepto === 'Ajuste importación' && igualEnCentimos(v.importe, 100)),
      'marzo lleva su "Ajuste importación" de 100',
    )
    comprobar(
      igualEnCentimos(marzo.resumen.extras, EJEMPLO.otros[3]),
      'con el ajuste, los extras de marzo cuadran con la hoja',
      `da ${marzo.resumen.extras}`,
    )

    const { datos: abril } = await llamar('/meses/2023/4')
    comprobar(abril?.error !== undefined || abril === null, 'abril no se importa: no tenía datos')
  }

  // -------------------------------------------------------------------------
  console.log('\nReimportar')
  // -------------------------------------------------------------------------
  {
    const sinPermiso = await llamar('/importar/excel/confirmar', {
      metodo: 'POST',
      cuerpo: { archivo, hoja: 'Cuentas2023' },
    })
    comprobar(sinPermiso.estado === 400, 'reimportar sin sobrescribir se rechaza')
    comprobar(
      sinPermiso.datos.error.includes('sobrescribir'),
      'y el error dice cómo continuar',
      sinPermiso.datos.error,
    )

    const { datos: antes } = await llamar('/anual/2023')
    const conPermiso = await llamar('/importar/excel/confirmar', {
      metodo: 'POST',
      cuerpo: { archivo, hoja: 'Cuentas2023', sobrescribir: true, crearAjustes: true },
    })
    comprobar(conPermiso.estado === 200, 'con sobrescribir sí entra')

    const { datos: despues } = await llamar('/anual/2023')
    comprobar(despues.meses.length === 3, 'siguen siendo tres meses, no seis')
    const gastosAntes = antes.filas.find((f) => f.nombre === 'Gastos').total
    const gastosDespues = despues.filas.find((f) => f.nombre === 'Gastos').total
    comprobar(
      igualEnCentimos(gastosAntes, gastosDespues),
      'los totales no se duplican al reimportar',
      `${gastosAntes} -> ${gastosDespues}`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nMapeo de conceptos')
  // -------------------------------------------------------------------------
  {
    // "Taxi" existe; se manda a "Metro" a mano y debe quedar recordado.
    const { datos: conceptos } = await llamar('/conceptos')
    const metro = conceptos.find((c) => c.nombre === 'Metro')

    await llamar('/importar/excel/confirmar', {
      metodo: 'POST',
      cuerpo: {
        archivo,
        hoja: 'Cuentas2023',
        sobrescribir: true,
        mapeos: { Taxi: String(metro.id) },
      },
    })

    const { datos: marzo } = await llamar('/meses/2023/3')
    comprobar(
      marzo.variables.some((v) => v.concepto === 'Metro' && igualEnCentimos(v.importe, 150)),
      'el apunte de Taxi se ha guardado en Metro',
    )

    const { datos: detalle } = await llamar(`/conceptos/${metro.id}/plantilla`)
    comprobar(Array.isArray(detalle), 'la plantilla responde aunque sea un variable')

    const { datos: conDetalle } = await llamar('/conceptos?detalle=1')
    const metroDetalle = conDetalle.find((c) => c.id === metro.id)
    comprobar(
      metroDetalle.alias.some((a) => a.alias === 'Taxi'),
      'el mapeo queda guardado como alias para la próxima vez',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nHoja que no existe')
  // -------------------------------------------------------------------------
  {
    const mala = await llamar('/importar/excel/vista-previa', {
      metodo: 'POST',
      cuerpo: { archivo, hoja: 'Cuentas1999' },
    })
    comprobar(mala.estado === 400, 'una hoja inexistente responde 400')

    const sinMeses = await llamar('/importar/excel/vista-previa', {
      metodo: 'POST',
      cuerpo: { archivo, hoja: 'Notas' },
    })
    comprobar(sinMeses.estado === 400, 'una hoja sin fila de meses responde 400')
    comprobar(
      sinMeses.datos.error.includes('meses'),
      'y el error explica qué falta',
      sinMeses.datos.error,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nIda y vuelta: exportar e importar lo exportado')
  // -------------------------------------------------------------------------
  {
    const respuesta = await fetch(`${entorno.base}/exportar/excel?anio=2023`, {
      headers: { authorization: `Bearer ${entorno.token}` },
    })
    const exportado = Buffer.from(await respuesta.arrayBuffer()).toString('base64')

    const { estado: codigo, datos: vuelta } = await llamar('/importar/excel/vista-previa', {
      metodo: 'POST',
      cuerpo: { archivo: exportado, hoja: 'Cuentas2023' },
    })
    comprobar(codigo === 200, 'el Excel que exporta la app se puede volver a leer')
    comprobar(vuelta.meses.length === 3, 'con sus tres meses')
    comprobar(
      vuelta.fijos.every((f) => !f.nuevo),
      'y sin conceptos nuevos: los nombres salen tal como se llaman aquí',
    )

    const { datos: anual } = await llamar('/anual/2023')
    const gastosEnLaApp = anual.filas.find((f) => f.nombre === 'Gastos').valores[0]
    comprobar(
      igualEnCentimos(vuelta.meses[0].gastosExcel, gastosEnLaApp),
      'los gastos de enero sobreviven a la ida y vuelta',
      `${vuelta.meses[0].gastosExcel} vs ${gastosEnLaApp}`,
    )
  }
} finally {
  await entorno.cerrar()
}

console.log(`\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`)
process.exit(estado.fallos === 0 ? 0 : 1)
