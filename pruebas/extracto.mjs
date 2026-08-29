// Pruebas de la importación del extracto del banco.
//
// Es la función más delicada de la aplicación: escribe en el mes de golpe. Lo
// que más se comprueba aquí, por ese orden:
//
//   1. Que NO SE PIERDE NADA. El marcador tiene que cuadrar siempre, y aceptar
//      una revisión incompleta tiene que fallar sin escribir una sola fila.
//   2. Que DESHACER devuelve el mes exactamente a como estaba.
//   3. Que el orden de las reglas hace lo que dice (PRIME antes que AMAZON, y
//      BAR sin comerse BARCELONA).
//   4. Que subir dos veces el mismo fichero no duplica nada.
import ExcelJS from 'exceljs'
import { levantar, crearLlamar, crearComprobador, igualEnCentimos } from './entorno.mjs'
import { FILAS, ESPERADO, comoTexto } from './fixtures/extractoEjemplo.mjs'

const entorno = await levantar('extracto')
const llamar = crearLlamar(entorno)
const { comprobar, estado } = crearComprobador()

/** El fixture, convertido en un .xlsx de verdad y en base64. */
async function comoXlsx() {
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('Movimientos')
  for (const fila of FILAS) hoja.addRow(fila)
  const buffer = await libro.xlsx.writeBuffer()
  return Buffer.from(buffer).toString('base64')
}

try {
  // -------------------------------------------------------------------------
  console.log('\nLeer el fichero del banco')
  // -------------------------------------------------------------------------
  const archivo = await comoXlsx()
  let mesId = null
  {
    const { datos } = await llamar('/meses', { metodo: 'POST', cuerpo: { anio: 2026, mes: 8 } })
    mesId = datos.id

    const leido = await llamar('/extracto/leer', {
      metodo: 'POST',
      cuerpo: { archivo, nombreArchivo: 'extracto.xlsx' },
    })
    comprobar(leido.estado === 200, 'se lee el archivo')
    comprobar(
      leido.datos.filaCabecera === ESPERADO.filaCabecera,
      'la cabecera se encuentra aunque tenga ocho filas de titulo encima',
      `dice ${leido.datos.filaCabecera}`,
    )
    comprobar(
      leido.datos.nOrigen === ESPERADO.movimientos,
      `salen los ${ESPERADO.movimientos} movimientos`,
      `dice ${leido.datos.nOrigen}`,
    )
    comprobar(
      leido.datos.filasDescartadas >= 1,
      'y las filas sin importe (saldo final, avisos) no cuentan como movimiento',
    )

    const suma = leido.datos.movimientos.reduce((t, m) => t + m.importe, 0)
    comprobar(igualEnCentimos(suma, ESPERADO.suma), 'los importes cuadran al céntimo', `da ${suma}`)

    const primero = leido.datos.movimientos[0]
    comprobar(primero.fecha === '2026-08-26', 'la fecha operativa se lee como AAAA-MM-DD')
    comprobar(
      primero.descripcionLimpia === 'CONDIS-BARCELONA',
      'el prefijo de la tarjeta se quita para poder leerla',
      primero.descripcionLimpia,
    )
    comprobar(
      primero.descripcionOriginal.includes('COMPRA TARJ.'),
      'pero la original se conserva entera',
    )

    // La que se perdia al limpiar de mas.
    const cajero = leido.datos.movimientos.find((m) => m.importe === -800)
    comprobar(
      /REINTEGRO/i.test(cajero.descripcionLimpia),
      'limpiar no se lleva por delante la palabra que identifica el movimiento',
      cajero.descripcionLimpia,
    )

    // El mismo contenido pegado como texto tiene que dar lo mismo.
    const pegado = await llamar('/extracto/leer', { metodo: 'POST', cuerpo: { texto: comoTexto() } })
    comprobar(
      pegado.datos.nOrigen === ESPERADO.movimientos,
      'pegar la tabla como texto da los mismos movimientos',
      `da ${pegado.datos.nOrigen}`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nEl orden de las reglas')
  // -------------------------------------------------------------------------
  {
    const prime = await llamar('/reglas/probar', {
      metodo: 'POST',
      cuerpo: { descripcion: 'COMPRA TARJ. 5402XXXXXXXX4010 Compra de Prime Video-MADRID' },
    })
    comprobar(
      prime.datos.ganadora?.concepto === 'Netflix etc',
      'PRIME se evalúa antes que AMAZON: Prime Video es una suscripción',
      prime.datos.ganadora?.concepto,
    )

    const amazon = await llamar('/reglas/probar', {
      metodo: 'POST',
      cuerpo: { descripcion: 'COMPRA TARJ. 5402XXXXXXXX4010 WWW.AMAZON-LUXEM' },
    })
    comprobar(amazon.datos.ganadora?.concepto === 'Amazon', 'y una compra en Amazon sí es Amazon')

    const fruteria = await llamar('/reglas/probar', {
      metodo: 'POST',
      cuerpo: { descripcion: 'COMPRA TARJ. 5402XXXXXXXX4010 FRUTERIA SAFSAFI-BARCELONA' },
    })
    comprobar(
      fruteria.datos.ganadora?.concepto === 'Comida',
      'BAR no se come BARCELONA: la frutería es comida',
      fruteria.datos.ganadora?.concepto,
    )

    const bar = await llamar('/reglas/probar', {
      metodo: 'POST',
      cuerpo: { descripcion: 'COMPRA TARJ. 5402XXXXXXXX4010 BAR CAFETERIA AYING-BARCELONA' },
    })
    comprobar(bar.datos.ganadora?.concepto === 'Bar', 'pero un bar de verdad sí es Bar')

    const autopista = await llamar('/reglas/probar', {
      metodo: 'POST',
      cuerpo: { descripcion: 'COMPRA TARJ. 5402XXXXXXXX4010 14.08 AUTOPISTAS TERRASSA-CASTELBELL' },
    })
    comprobar(
      autopista.datos.ganadora?.concepto === 'Coche',
      'AUTOPISTA encaja con AUTOPISTAS, que es como lo escribe el banco',
      autopista.datos.ganadora?.concepto,
    )

    comprobar(
      typeof bar.datos.propuesta === 'string' && bar.datos.propuesta.length > 2,
      'y propone un texto para recordar',
      bar.datos.propuesta,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nClasificar')
  // -------------------------------------------------------------------------
  let propuesta = null
  {
    const r = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'extracto.xlsx' },
    })
    comprobar(r.estado === 201, 'se clasifica y se crea la importación en borrador')
    propuesta = r.datos
    comprobar(propuesta.importacion.estado === 'borrador', 'nace como borrador, sin tocar el mes')

    const c = propuesta.resumen
    comprobar(c.cuadra, 'el marcador cuadra', JSON.stringify(c))
    comprobar(c.total === ESPERADO.movimientos, 'con todos los movimientos del fichero')
    comprobar(c.omitidos === ESPERADO.ingresos, 'los positivos se omiten', `da ${c.omitidos}`)
    comprobar(c.fueraDeMes === 3, 'los de julio quedan fuera del mes', `da ${c.fueraDeMes}`)

    const luz = propuesta.conciliaciones.find((x) => x.concepto === 'Luz/Gas/Agua/IBI')
    comprobar(!!luz, 'la luz/gas/agua se concilia')
    comprobar(
      luz.cuantasLineas === 3 && igualEnCentimos(luz.importe, 176.43),
      'sumando las tres facturas del mes',
      JSON.stringify({ lineas: luz?.cuantasLineas, importe: luz?.importe }),
    )
    comprobar(
      luz.detalle.includes('AGUA') && luz.detalle.includes('GAS'),
      'y guardando el detalle de cada una',
    )
    comprobar(luz.situacion === 'pendiente', 'contra el fijo que estaba pendiente')

    const bizum = propuesta.lineas.find((l) => l.descripcionOriginal.includes('BIZUM'))
    comprobar(
      bizum.destino === 'sinClasificar',
      'un Bizum se reconoce pero siempre pasa por revisión',
      bizum.destino,
    )

    comprobar(
      propuesta.fijosSinEncontrar.length > 0,
      'y dice qué fijos del mes no menciona el extracto',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nNo se puede aceptar lo que no cuadra')
  // -------------------------------------------------------------------------
  const importacionId = propuesta.importacion.id
  {
    const faltan = await llamar(`/extracto/${importacionId}/aceptar`, {
      metodo: 'POST',
      cuerpo: { lineas: propuesta.lineas.slice(0, 5), conciliaciones: propuesta.conciliaciones },
    })
    comprobar(faltan.estado === 400, 'con movimientos de menos, no se acepta')
    comprobar(
      (faltan.datos.detalle ?? []).some((d) => d.includes('20')),
      'y dice cuántos faltan',
      JSON.stringify(faltan.datos.detalle),
    )

    const sinClasificar = await llamar(`/extracto/${importacionId}/aceptar`, {
      metodo: 'POST',
      cuerpo: { lineas: propuesta.lineas, conciliaciones: propuesta.conciliaciones },
    })
    comprobar(sinClasificar.estado === 400, 'con movimientos sin clasificar, tampoco')

    const { datos: mesAhora } = await llamar(`/meses/2026/8`)
    comprobar(
      mesAhora.variables.length === 0,
      'y no se ha escrito NADA en el mes: todo o nada',
      `hay ${mesAhora.variables.length} variables`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nAceptar')
  // -------------------------------------------------------------------------
  const antes = await llamar('/meses/2026/8')
  let resultado = null
  {
    // Se revisa: lo que no reconoce nadie se descarta.
    const lineas = propuesta.lineas.map((l) =>
      l.destino === 'sinClasificar' ? { ...l, destino: 'descartado' } : l,
    )
    const r = await llamar(`/extracto/${importacionId}/aceptar`, {
      metodo: 'POST',
      cuerpo: {
        lineas,
        conciliaciones: propuesta.conciliaciones,
        reglasNuevas: [
          { texto: 'TUNELSPAN', conceptoId: propuesta.conceptos.find((c) => c.nombre === 'Peaje').id },
        ],
      },
    })
    comprobar(r.estado === 200, 'ahora sí se acepta')
    resultado = r.datos
    comprobar(resultado.conciliados > 0, `se concilian fijos (${resultado.conciliados})`)
    comprobar(resultado.comida > 0, `y entran compras de comida (${resultado.comida})`)

    const { datos: mes } = await llamar('/meses/2026/8')
    const luz = mes.fijos.find((f) => f.concepto === 'Luz/Gas/Agua/IBI')
    comprobar(luz.cobrado, 'el fijo queda cobrado')
    comprobar(igualEnCentimos(luz.importe, 176.43), 'con la suma de las tres facturas', `${luz.importe}`)
    comprobar(luz.fechaCobro === '2026-08-20', 'y la fecha del último movimiento', luz.fechaCobro)

    comprobar(
      mes.variables.length > antes.datos.variables.length,
      'y se han creado los variables y la comida',
    )

    const aprendida = await llamar('/reglas?estado=propuesta')
    comprobar(
      aprendida.datos.some((x) => x.texto === 'TUNELSPAN'),
      'la regla que se pidió recordar queda como propuesta',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nDuplicados')
  // -------------------------------------------------------------------------
  {
    const r = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'extracto.xlsx' },
    })
    comprobar(
      r.datos.resumen.duplicados === ESPERADO.movimientos,
      'subir el mismo fichero otra vez marca todo como duplicado',
      `da ${r.datos.resumen.duplicados}`,
    )
    await llamar(`/extracto/${r.datos.importacion.id}`, { metodo: 'DELETE' })
  }

  // -------------------------------------------------------------------------
  console.log('\nDeshacer')
  // -------------------------------------------------------------------------
  {
    const r = await llamar(`/extracto/${importacionId}/deshacer`, { metodo: 'POST' })
    comprobar(r.estado === 200, 'se deshace la importación')
    comprobar(r.datos.borrados > 0 && r.datos.devueltos > 0, 'borrando lo creado y devolviendo los fijos')

    const { datos: mes } = await llamar('/meses/2026/8')
    comprobar(
      mes.variables.length === antes.datos.variables.length,
      'el mes queda con los variables que tenía',
      `${mes.variables.length} contra ${antes.datos.variables.length}`,
    )
    const luz = mes.fijos.find((f) => f.concepto === 'Luz/Gas/Agua/IBI')
    comprobar(!luz.cobrado, 'y los fijos vuelven a estar pendientes')

    const sumaAntes = antes.datos.fijos.reduce((t, f) => t + f.importe, 0)
    const sumaAhora = mes.fijos.reduce((t, f) => t + f.importe, 0)
    comprobar(
      igualEnCentimos(sumaAntes, sumaAhora),
      'con el mismo importe que antes de importar',
      `${sumaAhora} contra ${sumaAntes}`,
    )

    const aprendida = await llamar('/reglas?estado=propuesta')
    comprobar(
      aprendida.datos.some((x) => x.texto === 'TUNELSPAN'),
      'las reglas aprendidas NO se pierden al deshacer',
    )

    // Y se puede volver a importar.
    const otra = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'extracto.xlsx' },
    })
    comprobar(
      otra.datos.resumen.duplicados === 0,
      'tras deshacer, el extracto se puede volver a importar',
      `hay ${otra.datos.resumen.duplicados} duplicados`,
    )
    await llamar(`/extracto/${otra.datos.importacion.id}`, { metodo: 'DELETE' })
  }

  // -------------------------------------------------------------------------
  console.log('\nDividir y mes cerrado')
  // -------------------------------------------------------------------------
  {
    // Partir un movimiento: la suma tiene que seguir cuadrando.
    const { datos: p } = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'extracto.xlsx' },
    })
    const original = p.lineas.find((l) => igualEnCentimos(l.importe, -379.99))
    const peaje = p.conceptos.find((c) => c.nombre === 'Peaje')
    const lineas = [
      ...p.lineas.filter((l) => l.id !== original.id),
      { ...original, id: 9001, importe: -300, conceptoId: peaje.id, concepto: 'Peaje', destino: 'variable' },
      { ...original, id: 9002, importe: -79.99, conceptoId: peaje.id, concepto: 'Peaje', destino: 'variable' },
    ].map((l) => (l.destino === 'sinClasificar' ? { ...l, destino: 'descartado' } : l))

    const roto = await llamar(`/extracto/${p.importacion.id}/aceptar`, {
      metodo: 'POST',
      cuerpo: {
        lineas: lineas.map((l) => (l.id === 9002 ? { ...l, importe: -50 } : l)),
        conciliaciones: p.conciliaciones,
      },
    })
    comprobar(roto.estado === 400, 'dividir mal (los trozos no suman) no se acepta')

    const bien = await llamar(`/extracto/${p.importacion.id}/aceptar`, {
      metodo: 'POST',
      cuerpo: { lineas, conciliaciones: p.conciliaciones },
    })
    comprobar(bien.estado === 200, 'y dividido bien sí', JSON.stringify(bien.datos?.error))
    await llamar(`/extracto/${p.importacion.id}/deshacer`, { metodo: 'POST' })

    // Un mes cerrado no admite importaciones.
    await llamar(`/meses/${mesId}`, { metodo: 'PATCH', cuerpo: { estado: 'cerrado' } })
    const cerrado = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'extracto.xlsx' },
    })
    comprobar(cerrado.estado === 409, 'un mes cerrado no admite el extracto')
    await llamar(`/meses/${mesId}`, { metodo: 'PATCH', cuerpo: { estado: 'abierto' } })
  }

  // -------------------------------------------------------------------------
  console.log('\nBorradores e historial')
  // -------------------------------------------------------------------------
  {
    const { datos: p } = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'extracto.xlsx' },
    })
    const cambiadas = p.lineas.map((l) =>
      l.destino === 'sinClasificar' ? { ...l, destino: 'descartado' } : l,
    )
    const guardado = await llamar(`/extracto/${p.importacion.id}/borrador`, {
      metodo: 'PATCH',
      cuerpo: { lineas: cambiadas, conciliaciones: p.conciliaciones },
    })
    comprobar(guardado.datos.guardado === true, 'la revisión a medias se guarda sola')
    comprobar(guardado.datos.cuenta.sinClasificar === 0, 'y el marcador se recalcula')

    const retomada = await llamar(`/extracto/${p.importacion.id}`)
    comprobar(
      retomada.datos.borrador.lineas.length === ESPERADO.movimientos,
      'y se puede retomar más tarde',
    )

    const historial = await llamar('/extracto/historial')
    comprobar(historial.datos.length > 0, 'el historial lista las importaciones')
    comprobar(
      historial.datos.some((i) => i.estado === 'deshecha'),
      'incluidas las deshechas',
    )

    await llamar(`/extracto/${p.importacion.id}`, { metodo: 'DELETE' })
  }

  // -------------------------------------------------------------------------
  console.log('\nFicheros que no se entienden')
  // -------------------------------------------------------------------------
  {
    const basura = Buffer.from('esto no es un extracto\nni de lejos').toString('base64')
    const r = await llamar('/extracto/leer', {
      metodo: 'POST',
      cuerpo: { archivo: basura, nombreArchivo: 'cosa.csv' },
    })
    comprobar(
      r.datos.necesitaAyuda === true,
      'un archivo que no se entiende pide ayuda en vez de fallar',
    )
    comprobar(!!r.datos.motivo, 'y dice qué es lo que no ha encontrado', r.datos.motivo)

    const vacio = await llamar('/extracto/leer', { metodo: 'POST', cuerpo: {} })
    comprobar(vacio.estado === 400, 'sin archivo ni texto, se rechaza')
  }
} finally {
  await entorno.cerrar()
}

console.log(`\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`)
process.exit(estado.fallos === 0 ? 0 : 1)
