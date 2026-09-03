// Pruebas de la importación del extracto del banco.
//
// Es la función más delicada de la aplicación: escribe en el mes de golpe. Lo
// que más se comprueba aquí, por ese orden:
//
//   1. Que NO SE PIERDE NADA. El marcador tiene que cuadrar siempre, y aceptar
//      una revisión incompleta tiene que fallar sin escribir una sola fila.
//   2. Que EL EXTRACTO DEFINE EL MES: no se aparta nada por su fecha, la nómina
//      abre el periodo y va al ingreso.
//   3. Que DESHACER devuelve el mes exactamente a como estaba.
//   4. Que el orden de las reglas hace lo que dice (PRIME antes que AMAZON, y
//      BAR sin comerse BARCELONA).
//   5. Que subir dos veces el mismo fichero no duplica nada.
import ExcelJS from 'exceljs'
import { levantar, crearLlamar, crearComprobador, igualEnCentimos } from './entorno.mjs'
import { FILAS, CABECERA, ESPERADO, comoTexto } from './fixtures/extractoEjemplo.mjs'

const entorno = await levantar('extracto')
const llamar = crearLlamar(entorno)
const { comprobar, estado } = crearComprobador()

/**
 * Un extracto pequeño, con la misma forma que el del banco: siete filas de
 * morralla, la cabecera y las líneas que se le pasen.
 *
 * Sirve para las pruebas de DOS importaciones seguidas, que es donde se
 * comprobó que un segundo cargo del mismo fijo se comía el primero.
 */
function extractoDe(filas, { desde, hasta }) {
  const todas = [
    ['Consulta de movimientos'],
    ['03/09/2026 09:00:00'],
    [],
    ['Cuenta: ', 'ES00 0000 0000 0000 0000 0000'],
    ['Divisa: ', 'EUR'],
    ['Titular:', 'NOMBRE*APELLIDO APELLIDO'],
    [`Selección:`, `Desde ${desde} hasta ${hasta}`],
    [],
    CABECERA,
    ...filas,
  ]
  return todas
    .map((fila) =>
      fila
        .map((celda) => (typeof celda === 'number' ? String(celda).replace('.', ',') : String(celda ?? '')))
        .join('\t'),
    )
    .join('\n')
}

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

    // El extracto define el mes: del primer movimiento al ultimo.
    comprobar(
      leido.datos.periodo.desde === ESPERADO.desde && leido.datos.periodo.hasta === ESPERADO.hasta,
      'el periodo va del primer movimiento al último',
      JSON.stringify(leido.datos.periodo),
    )
    comprobar(
      leido.datos.movimientos[0].fecha === ESPERADO.desde,
      'los movimientos vienen ordenados del más antiguo al más reciente',
      leido.datos.movimientos[0].fecha,
    )
    comprobar(
      leido.datos.nominas.length === 1 && leido.datos.nominas[0].abreElMes,
      'y la nómina es la que abre el mes',
      JSON.stringify(leido.datos.nominas),
    )

    const suma = leido.datos.movimientos.reduce((t, m) => t + m.importe, 0)
    comprobar(igualEnCentimos(suma, ESPERADO.suma), 'los importes cuadran al céntimo', `da ${suma}`)

    const condis = leido.datos.movimientos.find((m) => m.descripcionOriginal.includes('CONDIS'))
    comprobar(condis.fecha === '2026-08-26', 'la fecha operativa se lee como AAAA-MM-DD')
    comprobar(
      condis.descripcionLimpia === 'CONDIS-BARCELONA',
      'el prefijo de la tarjeta se quita para poder leerla',
      condis.descripcionLimpia,
    )
    comprobar(
      condis.descripcionOriginal.includes('COMPRA TARJ.'),
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
      prime.datos.ganadora?.concepto === 'Suscripciones',
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
      typeof bar.datos.propuesta?.texto === 'string' && bar.datos.propuesta.texto.length > 2,
      'y propone un texto para recordar',
      JSON.stringify(bar.datos.propuesta),
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
    comprobar(c.ingreso === 1, 'la nómina va al ingreso, ella sola', `da ${c.ingreso}`)
    comprobar(
      !('fueraDeMes' in c),
      'ya no hay "fuera de mes": el extracto define el mes',
      JSON.stringify(Object.keys(c)),
    )

    // Los de julio son del mes igual: la hipoteca del 31/07 es de agosto.
    const hipoteca = propuesta.conciliaciones.find((x) => x.concepto === 'Hipoteca')
    comprobar(!!hipoteca, 'un fijo del 31 de julio se concilia en agosto igual')

    // Un abono que una regla reconoce: variable, y en negativo al guardarlo.
    const devolucion = propuesta.lineas.find((l) => l.descripcionOriginal.includes('JustEat'))
    comprobar(
      devolucion.destino === 'variable' && devolucion.esAbono,
      'una devolución reconocida entra como variable, marcada como abono',
      `${devolucion.destino} abono=${devolucion.esAbono}`,
    )

    const abonoSuelto = propuesta.lineas.find((l) =>
      l.descripcionOriginal.includes('ABONO TRANSFERENCIA'),
    )
    comprobar(
      abonoSuelto.destino === 'sinClasificar' && abonoSuelto.esAbono,
      'y un abono que no reconoce nadie va a revisión, no se omite',
      abonoSuelto.destino,
    )

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
    comprobar(luz.accion === 'cobrar', 'contra el fijo que estaba pendiente', luz.accion)

    comprobar(
      propuesta.plantillaPropuesta.length > 0,
      'se propone actualizar la plantilla con los importes reales',
    )
    comprobar(
      propuesta.plantillaPropuesta.every((x) => x.aplicar),
      'y las casillas vienen premarcadas',
    )
    const dePlantilla = propuesta.plantillaPropuesta.find((x) => x.concepto === 'Luz/Gas/Agua/IBI')
    comprobar(
      dePlantilla && dePlantilla.vigenteDesde === '2026-09',
      'vigente desde el mes siguiente',
      dePlantilla?.vigenteDesde,
    )

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
  let importacionId = propuesta.importacion.id
  {
    const faltan = await llamar(`/extracto/${importacionId}/aceptar`, {
      metodo: 'POST',
      cuerpo: { lineas: propuesta.lineas.slice(0, 5), conciliaciones: propuesta.conciliaciones },
    })
    comprobar(faltan.estado === 400, 'con movimientos de menos, no se acepta')
    comprobar(
      (faltan.datos.detalle ?? []).some((d) => d.includes(String(ESPERADO.movimientos))),
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
    void lineas
    const r = await llamar(`/extracto/${importacionId}/aceptar`, {
      metodo: 'POST',
      cuerpo: {
        lineas,
        conciliaciones: propuesta.conciliaciones,
        plantilla: propuesta.plantillaPropuesta,
        periodo: propuesta.lectura.periodo,
        reglasNuevas: [
          {
            texto: 'TUNELSPAN',
            coincidencia: 'empieza',
            conceptoId: propuesta.conceptos.find((c) => c.nombre === 'Peaje').id,
          },
        ],
      },
    })
    comprobar(r.estado === 200, 'ahora sí se acepta', JSON.stringify(r.datos?.detalle ?? r.datos?.error))
    resultado = r.datos
    comprobar(resultado.cobrados > 0, `se cobran fijos (${resultado.cobrados})`)
    comprobar(resultado.comida > 0, `y entran compras de comida (${resultado.comida})`)
    comprobar(
      resultado.ingreso && igualEnCentimos(resultado.ingreso.despues, 3124.21),
      'la nómina pasa al ingreso del mes',
      JSON.stringify(resultado.ingreso),
    )
    comprobar(
      resultado.plantillaActualizada > 0,
      `y se actualiza la plantilla (${resultado.plantillaActualizada})`,
    )

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

    // El periodo del mes lo pone el extracto.
    comprobar(
      mes.fechaInicio === ESPERADO.desde && mes.fechaFin === ESPERADO.hasta,
      'el mes guarda el periodo que cubre el extracto',
      `${mes.fechaInicio}..${mes.fechaFin}`,
    )

    // El abono entra en NEGATIVO: resta gasto, no lo suma.
    const enJustEat = mes.variables.filter((v) => v.concepto === 'JustEat')
    comprobar(
      enJustEat.some((v) => v.importe < 0),
      'la devolución se apunta en negativo',
      JSON.stringify(enJustEat.map((v) => v.importe)),
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nUn fijo ya cobrado se actualiza, no se duplica')
  // -------------------------------------------------------------------------
  {
    // Se deshace lo anterior y se deja la luz cobrada con OTRO importe.
    await llamar(`/extracto/${importacionId}/deshacer`, { metodo: 'POST' })
    const { datos: antesMes } = await llamar('/meses/2026/8')
    const luz = antesMes.fijos.find((f) => f.concepto === 'Luz/Gas/Agua/IBI')
    await llamar(`/movimientos/${luz.id}`, {
      metodo: 'PATCH',
      cuerpo: { importe: '100,00', fechaCobro: '2026-08-01' },
    })

    const { datos: p2 } = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'extracto.xlsx' },
    })
    const laLuz = p2.conciliaciones.find((c) => c.concepto === 'Luz/Gas/Agua/IBI')
    comprobar(
      laLuz.accion === 'actualizar',
      'un fijo ya cobrado con otro importe se ACTUALIZA, no se duplica',
      laLuz.accion,
    )
    comprobar(
      igualEnCentimos(laLuz.importeAnterior, 100),
      'y se ve lo que tenía antes',
      String(laLuz.importeAnterior),
    )

    const lineas2 = p2.lineas.map((l) =>
      l.destino === 'sinClasificar' ? { ...l, destino: 'descartado' } : l,
    )
    const r2 = await llamar(`/extracto/${p2.importacion.id}/aceptar`, {
      metodo: 'POST',
      cuerpo: { lineas: lineas2, conciliaciones: p2.conciliaciones, periodo: p2.lectura.periodo },
    })
    comprobar(r2.datos.actualizados > 0, 'al aceptar se cuenta como actualizado')

    const { datos: mes2 } = await llamar('/meses/2026/8')
    const cuantasLuces = mes2.fijos.filter((f) => f.concepto === 'Luz/Gas/Agua/IBI').length
    comprobar(cuantasLuces === 1, 'y sigue habiendo un solo apunte de luz', String(cuantasLuces))
    comprobar(
      igualEnCentimos(mes2.fijos.find((f) => f.concepto === 'Luz/Gas/Agua/IBI').importe, 176.43),
      'con el importe del banco',
    )
    await llamar(`/extracto/${p2.importacion.id}/deshacer`, { metodo: 'POST' })

    // Y se vuelve a dejar como estaba para las pruebas de abajo.
    const rehacer = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'extracto.xlsx' },
    })
    await llamar(`/extracto/${rehacer.datos.importacion.id}/aceptar`, {
      metodo: 'POST',
      cuerpo: {
        lineas: rehacer.datos.lineas.map((l) =>
          l.destino === 'sinClasificar' ? { ...l, destino: 'descartado' } : l,
        ),
        conciliaciones: rehacer.datos.conciliaciones,
        periodo: rehacer.datos.lectura.periodo,
      },
    })
    importacionId = rehacer.datos.importacion.id
  }

  // -------------------------------------------------------------------------
  console.log('\nReglas por expresión regular')
  // -------------------------------------------------------------------------
  {
    // Un pago por movil no tiene ningun texto fijo que recordar.
    const codigo = await llamar('/reglas/probar', {
      metodo: 'POST',
      cuerpo: {
        descripcion: 'COMPRA TARJ. 5402XXXXXXXX4010 13AUG BVK11V8J-Barcelona',
        contra: [
          '13AUG BVK11V8J-Barcelona',
          '12AUG BXBRXTF7-Barcelona',
          '10AUG BV5WDRMJ-Barcelona',
          'CONDIS-BARCELONA',
        ],
      },
    })
    comprobar(
      codigo.datos.propuesta.coincidencia === 'regex',
      'para un pago por móvil se propone una expresión regular',
      JSON.stringify(codigo.datos.propuesta),
    )
    comprobar(
      codigo.datos.encajarian === 3,
      'y dice con cuántos movimientos del extracto encajaría',
      String(codigo.datos.encajarian),
    )

    const normal = await llamar('/reglas/probar', {
      metodo: 'POST',
      cuerpo: { descripcion: 'COMPRA TARJ. 5402XXXXXXXX4010 DRUNI-VINAROS', contra: [] },
    })
    comprobar(
      normal.datos.propuesta.texto === 'DRUNI' && normal.datos.propuesta.coincidencia === 'empieza',
      'y para un comercio con nombre, el nombre',
      JSON.stringify(normal.datos.propuesta),
    )

    const creada = await llamar('/reglas', {
      metodo: 'POST',
      cuerpo: {
        texto: codigo.datos.propuesta.texto,
        coincidencia: 'regex',
        conceptoId: null,
      },
    })
    comprobar(creada.estado === 201, 'la regla por expresión regular se crea')

    const mala = await llamar('/reglas', {
      metodo: 'POST',
      cuerpo: { texto: '[sin cerrar', coincidencia: 'regex' },
    })
    comprobar(mala.estado === 400, 'y una expresión regular mal escrita se rechaza')

    await llamar(`/reglas/${creada.datos.id}`, { metodo: 'DELETE' })
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
  console.log('\nReiniciar y borrar el mes liberan las huellas')
  // -------------------------------------------------------------------------
  {
    /*
     * El fallo que arregla esto: tras reiniciar el mes, el mismo extracto salia
     * entero como duplicado y no habia forma comoda de volver a cargarlo.
     */
    const { datos: p } = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'para-reiniciar.xlsx' },
    })
    await llamar(`/extracto/${p.importacion.id}/aceptar`, {
      metodo: 'POST',
      cuerpo: {
        lineas: p.lineas.map((l) =>
          l.destino === 'sinClasificar' ? { ...l, destino: 'descartado' } : l,
        ),
        conciliaciones: p.conciliaciones,
        periodo: p.lectura.periodo,
      },
    })

    const repetido = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'repetido.xlsx' },
    })
    comprobar(
      repetido.datos.resumen.duplicados === ESPERADO.movimientos,
      'antes de reiniciar, el mismo extracto sale entero como duplicado',
    )
    comprobar(
      !!repetido.datos.yaImportado && repetido.datos.yaImportado.nombreMes === 'Agosto',
      'y se dice en qué importación entró',
      JSON.stringify(repetido.datos.yaImportado),
    )
    await llamar(`/extracto/${repetido.datos.importacion.id}`, { metodo: 'DELETE' })

    // El resumen avisa de cuántas importaciones se van a deshacer.
    const resumenPrevio = await llamar(`/meses/${mesId}/regeneracion`)
    comprobar(
      resumenPrevio.datos.importacionesAceptadas >= 1,
      'el resumen de reinicio dice cuántas importaciones se desharán',
      String(resumenPrevio.datos.importacionesAceptadas),
    )

    const rei = await llamar(`/meses/${mesId}/reiniciar`, {
      metodo: 'POST',
      cuerpo: { confirmar: true },
    })
    comprobar(rei.estado === 200, 'se reinicia el mes')
    comprobar(
      rei.datos.reinicio.importacionesDeshechas >= 1,
      'deshaciendo sus importaciones',
      String(rei.datos.reinicio.importacionesDeshechas),
    )

    const trasReiniciar = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'tras-reiniciar.xlsx' },
    })
    comprobar(
      trasReiniciar.datos.resumen.duplicados === 0,
      'y TRAS REINICIAR el mismo extracto se puede volver a subir entero',
      `quedan ${trasReiniciar.datos.resumen.duplicados} duplicados`,
    )
    await llamar(`/extracto/${trasReiniciar.datos.importacion.id}`, { metodo: 'DELETE' })
  }

  // -------------------------------------------------------------------------
  console.log('\nDeshacer desde el historial también libera las huellas')
  // -------------------------------------------------------------------------
  {
    const { datos: p } = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'para-deshacer.xlsx' },
    })
    await llamar(`/extracto/${p.importacion.id}/aceptar`, {
      metodo: 'POST',
      cuerpo: {
        lineas: p.lineas.map((l) =>
          l.destino === 'sinClasificar' ? { ...l, destino: 'descartado' } : l,
        ),
        conciliaciones: p.conciliaciones,
        periodo: p.lectura.periodo,
      },
    })
    await llamar(`/extracto/${p.importacion.id}/deshacer`, { metodo: 'POST' })

    const otra = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId, archivo, nombreArchivo: 'otra.xlsx' },
    })
    comprobar(
      otra.datos.resumen.duplicados === 0,
      'tras deshacer una importación, sus huellas dejan de contar',
      `quedan ${otra.datos.resumen.duplicados}`,
    )

    const historial = await llamar(`/extracto/historial?mesId=${mesId}`)
    comprobar(
      historial.datos.every((i) => i.mesId === mesId),
      'el historial del mes solo trae las de ese mes',
    )
    comprobar(
      historial.datos.some((i) => i.estado === 'deshecha'),
      'y las deshechas siguen constando',
    )
    await llamar(`/extracto/${otra.datos.importacion.id}`, { metodo: 'DELETE' })
  }

  // -------------------------------------------------------------------------
  console.log('\nBorrar un mes')
  // -------------------------------------------------------------------------
  {
    const { datos: nuevo } = await llamar('/meses', {
      metodo: 'POST',
      cuerpo: { anio: 2031, mes: 5 },
    })
    const { datos: p } = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId: nuevo.id, archivo, nombreArchivo: 'del-mes-a-borrar.xlsx' },
    })
    await llamar(`/extracto/${p.importacion.id}/aceptar`, {
      metodo: 'POST',
      cuerpo: {
        lineas: p.lineas.map((l) =>
          l.destino === 'sinClasificar' ? { ...l, destino: 'descartado' } : l,
        ),
        conciliaciones: p.conciliaciones,
        periodo: p.lectura.periodo,
      },
    })

    const sinConfirmar = await llamar(`/meses/${nuevo.id}`, { metodo: 'DELETE', cuerpo: {} })
    comprobar(sinConfirmar.estado === 400, 'borrar un mes sin confirmar no hace nada')

    const borrado = await llamar(`/meses/${nuevo.id}`, {
      metodo: 'DELETE',
      cuerpo: { confirmar: true },
    })
    comprobar(borrado.estado === 200, 'confirmando sí se borra')
    comprobar(
      borrado.datos.importaciones >= 1 && borrado.datos.movimientos > 0,
      'y dice qué se ha llevado por delante',
      JSON.stringify(borrado.datos),
    )

    const yaNo = await llamar('/meses/2031/5')
    comprobar(yaNo.estado === 404, 'el mes deja de existir')

    // Y su extracto se puede volver a importar en otro mes.
    const { datos: otroMes } = await llamar('/meses', {
      metodo: 'POST',
      cuerpo: { anio: 2031, mes: 6 },
    })
    const reintento = await llamar('/extracto/clasificar', {
      metodo: 'POST',
      cuerpo: { mesId: otroMes.id, archivo, nombreArchivo: 'reintento.xlsx' },
    })
    comprobar(
      reintento.datos.resumen.duplicados === 0,
      'y sus huellas se han ido con él',
      `quedan ${reintento.datos.resumen.duplicados}`,
    )
    await llamar(`/extracto/${reintento.datos.importacion.id}`, { metodo: 'DELETE' })
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
  // -------------------------------------------------------------------------
  console.log('\nDos extractos seguidos: el segundo SUMA, no pisa')
  // -------------------------------------------------------------------------
  //
  // El caso que se rompía: en el primer extracto llegan varias suscripciones y
  // se agrupan bien, con su desglose. En un extracto POSTERIOR llega una más, y
  // lo que hacía era machacar el total con el importe de esa última y ni
  // siquiera añadirla al desglose. Ocho suscripciones por 200 € se quedaban en
  // los 9,99 de la novena.
  {
    const { datos: sept } = await llamar('/meses', { metodo: 'POST', cuerpo: { anio: 2026, mes: 9 } })

    const aceptarExtracto = async (texto) => {
      const { datos: p } = await llamar('/extracto/clasificar', {
        metodo: 'POST',
        cuerpo: { mesId: sept.id, texto, nombreArchivo: `mini-${Date.now()}.csv` },
      })
      const lineas = p.lineas.map((l) =>
        l.destino === 'sinClasificar' ? { ...l, destino: 'descartado' } : l,
      )
      const r = await llamar(`/extracto/${p.importacion.id}/aceptar`, {
        metodo: 'POST',
        cuerpo: { lineas, conciliaciones: p.conciliaciones, periodo: p.lectura.periodo },
      })
      return { propuesta: p, respuesta: r }
    }

    const suscripciones = async () => {
      const { datos: mes } = await llamar('/meses/2026/9')
      return mes.fijos.find((f) => f.concepto === 'Suscripciones')
    }

    // --- primer extracto: dos suscripciones ---
    const primero = await aceptarExtracto(
      extractoDe(
        [
          ['02/09/2026', 'COMPRA TARJ. 5402XXXXXXXX4010 NETFLIX.COM-MADRID', '02/09/2026', -21.99, 500, '', ''],
          ['03/09/2026', 'COMPRA TARJ. 5402XXXXXXXX4010 SPOTIFY-STOCKHOLM', '03/09/2026', -10.99, 489, '', ''],
        ],
        { desde: '01/09/2026', hasta: '10/09/2026' },
      ),
    )
    comprobar(primero.respuesta.estado === 200, 'se acepta el primer extracto', JSON.stringify(primero.respuesta.datos?.detalle ?? ''))

    const tras1 = await suscripciones()
    comprobar(
      igualEnCentimos(tras1.importe, 32.98),
      'las dos suscripciones se agrupan en un solo apunte',
      String(tras1.importe),
    )
    comprobar(tras1.detalle.length === 2, 'con su desglose de dos líneas', String(tras1.detalle.length))

    // --- segundo extracto: una más ---
    const segundo = await aceptarExtracto(
      extractoDe(
        [
          ['20/09/2026', 'COMPRA TARJ. 5402XXXXXXXX4010 DISNEY PLUS-MADRID', '20/09/2026', -8.99, 400, '', ''],
        ],
        { desde: '11/09/2026', hasta: '25/09/2026' },
      ),
    )
    comprobar(segundo.respuesta.estado === 200, 'y el segundo también')

    const tras2 = await suscripciones()
    comprobar(
      igualEnCentimos(tras2.importe, 41.97),
      'EL TOTAL SE SUMA: 32,98 + 8,99, no se queda en 8,99',
      String(tras2.importe),
    )
    comprobar(
      tras2.detalle.length === 3,
      'y la nueva entra en el desglose, con las que ya había',
      JSON.stringify(tras2.detalle.map((l) => l.nombre)),
    )
    comprobar(
      tras2.detalle.some((l) => l.nombre.includes('DISNEY')),
      'la de verdad, no una copia del total',
    )
    comprobar(
      igualEnCentimos(
        tras2.detalle.reduce((t, l) => t + l.importe, 0),
        tras2.importe,
      ),
      'y el desglose sigue sumando el importe del apunte',
    )

    // --- deshacer el segundo: vuelve a lo del primero, no a cero ---
    await llamar(`/extracto/${segundo.propuesta.importacion.id}/deshacer`, { metodo: 'POST' })
    const trasDeshacer = await suscripciones()
    comprobar(
      igualEnCentimos(trasDeshacer.importe, 32.98),
      'deshacer el segundo devuelve el total del primero',
      String(trasDeshacer.importe),
    )
    comprobar(
      trasDeshacer.detalle.length === 2,
      'y se lleva solo su línea: las dos primeras siguen ahí',
      JSON.stringify(trasDeshacer.detalle.map((l) => l.nombre)),
    )
    comprobar(trasDeshacer.cobrado === true, 'y el apunte sigue cobrado, que lo cobró el primero')

    // --- y deshacer el primero lo deja como estaba ---
    await llamar(`/extracto/${primero.propuesta.importacion.id}/deshacer`, { metodo: 'POST' })
    const limpio = await suscripciones()
    comprobar(limpio.detalle.length === 0, 'deshacer el primero se lleva el desglose entero')
    comprobar(limpio.cobrado === false, 'y lo deja pendiente otra vez')
  }

} finally {
  await entorno.cerrar()
}

console.log(`\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`)
process.exit(estado.fallos === 0 ? 0 : 1)
