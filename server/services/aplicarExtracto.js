import { bd } from '../db/index.js'
import * as mesesBd from '../db/meses.js'
import * as movimientosBd from '../db/movimientos.js'
import * as conceptosBd from '../db/conceptos.js'
import * as importacionesBd from '../db/importaciones.js'
import * as reglasBd from '../db/reglas.js'
import { contar } from './clasificacionExtracto.js'
import { redondear } from '../lib/http.js'

/**
 * Aplicar una importacion revisada, y poder deshacerla entera.
 *
 * TODO O NADA. Las dos operaciones van dentro de una transaccion: o entra el
 * extracto completo o no entra nada. Una importacion a medias seria peor que no
 * haberla hecho, porque no se sabria por donde iba.
 *
 * Antes de escribir se valida que la propuesta cuadra: el numero de lineas del
 * fichero tiene que ser exactamente la suma de lo que se hace con ellas, y el
 * dinero tambien. Si no cuadra no se guarda y se dice por que.
 */

export class ErrorAplicacion extends Error {
  constructor(mensaje, detalle = null) {
    super(mensaje)
    this.detalle = detalle
  }
}

/**
 * Comprueba que no se pierde ni aparece nada.
 *
 * Devuelve la lista de descuadres; vacia si todo esta bien.
 */
export function validar({ lineas, nOrigen }) {
  const problemas = []
  const cuenta = contar(lineas)

  /*
   * Se cuentan HUELLAS DISTINTAS, no lineas. Dividir un movimiento en dos deja
   * dos lineas que siguen siendo el mismo apunte del banco, con la misma
   * huella: contando lineas, dividir algo daba un descuadre falso.
   */
  const porHuella = new Map()
  for (const linea of lineas) {
    const grupo = porHuella.get(linea.huella) ?? { suma: 0, original: null, cuantas: 0 }
    grupo.suma = redondear(grupo.suma + linea.importe)
    grupo.cuantas += 1
    if (linea.importeOriginal !== undefined) grupo.original = linea.importeOriginal
    porHuella.set(linea.huella, grupo)
  }

  if (nOrigen !== undefined && porHuella.size !== nOrigen) {
    problemas.push(
      `El fichero traía ${nOrigen} movimientos y la revisión tiene ${porHuella.size}.`,
    )
  }

  /*
   * Un movimiento dividido sigue siendo uno: sus trozos tienen que sumar
   * exactamente lo que cobro el banco. Sin esto, partir 379,99 en 300 y 50
   * entraria tan campante y se perderian 29,99 sin que nadie lo notara.
   */
  for (const [, grupo] of porHuella) {
    if (grupo.cuantas === 1 || grupo.original === null) continue
    if (Math.abs(grupo.suma - grupo.original) > 0.005) {
      problemas.push(
        `Un movimiento dividido no cuadra: sus trozos suman ${Math.abs(grupo.suma).toFixed(2)} ` +
          `y el banco cobró ${Math.abs(grupo.original).toFixed(2)}.`,
      )
    }
  }
  if (!cuenta.cuadra) {
    problemas.push(
      `Los ${cuenta.total} movimientos no cuadran con el reparto (suman ${cuenta.suma}).`,
    )
  }
  if (cuenta.sinClasificar > 0) {
    problemas.push(
      `Quedan ${cuenta.sinClasificar} movimientos sin clasificar. Asígnalos o descártalos.`,
    )
  }

  // El dinero tambien tiene que cuadrar: lo que entra en la aplicacion mas lo
  // que se queda fuera tiene que ser el total del extracto, al centimo.
  const total = redondear(lineas.reduce((t, l) => t + Math.abs(l.importe), 0))
  const dentro = redondear(
    lineas
      .filter((l) => ['fijo', 'comida', 'variable'].includes(l.destino) && !l.fueraDeMes)
      .reduce((t, l) => t + Math.abs(l.importe), 0),
  )
  const fuera = redondear(
    lineas
      .filter(
        (l) =>
          l.fueraDeMes ||
          ['omitido', 'descartado', 'duplicado'].includes(l.destino),
      )
      .reduce((t, l) => t + Math.abs(l.importe), 0),
  )
  if (Math.abs(total - (dentro + fuera)) > 0.005) {
    problemas.push(
      `Los importes no cuadran: ${total.toFixed(2)} en el fichero, ` +
        `${dentro.toFixed(2)} que entran y ${fuera.toFixed(2)} que se quedan fuera.`,
    )
  }

  return { problemas, cuenta, totales: { total, dentro, fuera } }
}

/**
 * Lo que va a pasar, sin hacerlo: cuanto entra en cada concepto y como queda el
 * mes antes y despues. Es la pantalla previa a confirmar.
 */
export function previsualizar({ importacionId, lineas, conciliaciones }) {
  const importacion = importacionesBd.obtener(importacionId)
  if (!importacion) throw new ErrorAplicacion('Esa importación ya no existe.')
  const mes = mesesBd.obtener(importacion.mesId)

  const porConcepto = new Map()
  const sumar = (conceptoId, nombre, importe) => {
    const actual = porConcepto.get(conceptoId) ?? { conceptoId, concepto: nombre, total: 0, cuantos: 0 }
    actual.total = redondear(actual.total + Math.abs(importe))
    actual.cuantos += 1
    porConcepto.set(conceptoId, actual)
  }

  for (const linea of lineas) {
    if (linea.fueraDeMes || !['comida', 'variable'].includes(linea.destino)) continue
    sumar(linea.conceptoId, linea.concepto, linea.importe)
  }
  for (const c of conciliaciones) {
    if (c.accion === 'descartar') continue
    sumar(c.conceptoId, c.concepto, c.importe)
  }

  const antes = mes.resumen ?? null
  const nuevoGasto = redondear([...porConcepto.values()].reduce((t, c) => t + c.total, 0))

  return {
    conceptos: [...porConcepto.values()].sort((a, b) => b.total - a.total),
    mes: { anio: mes.anio, mes: mes.mes, id: mes.id },
    antes,
    // Cuanto suma lo que entra. El "despues" real lo calcula el cliente con el
    // resumen del mes, que ya sabe restar la comida y el ahorro como toca.
    entra: nuevoGasto,
  }
}

/**
 * Aplica la importacion. Devuelve el mes ya montado.
 *
 * `lineas` y `conciliaciones` vienen del borrador revisado, no de volver a
 * clasificar: lo que se acepta tiene que ser exactamente lo que se vio.
 */
export const aceptar = bd.transaction(({ importacionId, lineas, conciliaciones, reglasNuevas = [] }) => {
  const importacion = importacionesBd.obtener(importacionId)
  if (!importacion) throw new ErrorAplicacion('Esa importación ya no existe.')
  if (importacion.estado !== 'borrador') {
    throw new ErrorAplicacion('Esa importación ya se aplicó. Deshazla antes de volver a aplicarla.')
  }

  const mes = mesesBd.obtener(importacion.mesId)
  if (!mes) throw new ErrorAplicacion('El mes de esa importación ya no existe.')
  if (mes.estado !== 'abierto') {
    throw new ErrorAplicacion(
      `${mes.nombreMes} de ${mes.anio} está cerrado. Reábrelo antes de importar en él.`,
    )
  }

  const { problemas } = validar({ lineas, nOrigen: importacion.conteos.movimientos })
  if (problemas.length > 0) {
    throw new ErrorAplicacion('La importación no cuadra, así que no se ha guardado nada.', problemas)
  }

  const huellaDeLinea = new Map(lineas.map((l) => [l.id, l]))
  let conciliados = 0
  let creados = 0
  let comida = 0

  // ---- 1. Fijos: conciliar, crear o sustituir ----
  for (const c of conciliaciones) {
    if (c.accion === 'descartar') continue

    const descripcion = c.detalle || ''
    let movimientoId = c.movimientoId

    if (c.accion === 'crear' || !movimientoId) {
      const nuevo = movimientosBd.crear({
        mesId: mes.id,
        conceptoId: c.conceptoId,
        importe: c.importe,
        importePrevisto: c.importePrevisto ?? c.importe,
        fechaCobro: c.fecha,
        descripcion,
        origen: 'extracto',
      })
      movimientoId = nuevo.id
      creados += 1
    } else {
      movimientosBd.actualizar(movimientoId, {
        importe: c.importe,
        fechaCobro: c.fecha,
        ...(descripcion ? { descripcion } : {}),
      })
      conciliados += 1
    }

    // La huella de cada linea que ha ido a este fijo apunta al mismo movimiento.
    for (const idLinea of c.lineas) {
      const linea = huellaDeLinea.get(idLinea)
      if (!linea) continue
      importacionesBd.guardarHuella({
        importacionId,
        hash: linea.huella,
        fecha: linea.fecha,
        importe: linea.importe,
        descripcionOriginal: linea.descripcionOriginal,
        descripcionLimpia: linea.descripcionLimpia,
        resultado: 'conciliado',
        movimientoId,
      })
      linea.yaGuardada = true
    }
    marcarImportacion(movimientoId, importacionId)
  }

  // ---- 2. Variables y comida ----
  const sobre = conceptosBd.sobrePrincipal()
  for (const linea of lineas) {
    if (linea.yaGuardada) continue

    let resultado = 'ignorado'
    let movimientoId = null

    const entra = !linea.fueraDeMes && ['comida', 'variable'].includes(linea.destino)
    if (entra) {
      const nuevo = movimientosBd.crear({
        mesId: mes.id,
        conceptoId: linea.conceptoId,
        importe: Math.abs(linea.importe),
        fechaCobro: linea.fecha,
        descripcion: linea.descripcion ?? linea.descripcionLimpia,
        origen: 'extracto',
      })
      movimientoId = nuevo.id
      resultado = 'creado'
      if (linea.conceptoId === sobre?.id) comida += 1
      else creados += 1
      marcarImportacion(movimientoId, importacionId, linea.descripcionOriginal)
    } else if (linea.destino === 'descartado') {
      resultado = 'descartado'
    } else if (linea.destino === 'duplicado') {
      resultado = 'duplicado'
    } else if (linea.destino === 'omitido') {
      // Los positivos: se guarda la huella para que no vuelvan a proponerse,
      // pero no entran en el mes.
      resultado = 'ingreso'
    }

    importacionesBd.guardarHuella({
      importacionId,
      hash: linea.huella,
      fecha: linea.fecha,
      importe: linea.importe,
      descripcionOriginal: linea.descripcionOriginal,
      descripcionLimpia: linea.descripcionLimpia,
      resultado,
      movimientoId,
    })
  }

  // ---- 3. Las reglas que se hayan pedido recordar ----
  for (const regla of reglasNuevas) {
    if (!regla?.texto || reglasBd.buscarPorTexto(regla.texto)) continue
    const concepto = regla.conceptoId ? conceptosBd.obtener(regla.conceptoId) : null
    reglasBd.crear({
      texto: regla.texto,
      conceptoId: concepto?.id ?? null,
      tipo: concepto ? (concepto.tipo === 'sobre' ? 'sobre' : concepto.tipo) : 'manual',
      coincidencia: regla.coincidencia === 'exacta' ? 'exacta' : 'empieza',
      estado: 'propuesta',
      origen: 'aprendida',
    })
  }

  // ---- 4. Cerrar la importacion ----
  const cuenta = contar(lineas)
  importacionesBd.actualizarConteos(importacionId, {
    fijos: conciliaciones.filter((c) => c.accion !== 'descartar').length,
    variables: cuenta.variables,
    ingresos: cuenta.omitidos,
    descartados: cuenta.descartados,
    duplicados: cuenta.duplicados,
  })
  importacionesBd.guardarBorrador(importacionId, null)
  // El ingreso no se toca (solo entra lo que resta), pero se guarda el que
  // habia por si algun dia vuelve a tocarse: deshacer tiene que poder volver.
  importacionesBd.marcar(importacionId, 'aceptada', { ingresoAnterior: mes.ingreso })

  return {
    conciliados,
    creados,
    comida,
    descartados: cuenta.descartados,
    omitidos: cuenta.omitidos,
    mes: mesesBd.obtener(mes.id),
  }
})

function marcarImportacion(movimientoId, importacionId, descripcionOriginal = null) {
  bd.prepare(
    `UPDATE movimientos SET importacion_id = @importacion
     ${descripcionOriginal ? ', descripcion_original = @original' : ''}
     WHERE id = @id`,
  ).run(
    descripcionOriginal
      ? { id: movimientoId, importacion: importacionId, original: descripcionOriginal }
      : { id: movimientoId, importacion: importacionId },
  )
}

/**
 * Deshace una importacion entera.
 *
 * Borra lo que creo, devuelve los fijos conciliados a pendiente y a su importe
 * previsto, y marca la importacion como deshecha, con lo que sus huellas dejan
 * de contar como duplicados y el extracto se puede volver a importar.
 *
 * Las reglas aprendidas NO se tocan: lo que se aprendio sigue valiendo.
 */
export const deshacer = bd.transaction((importacionId) => {
  const importacion = importacionesBd.obtener(importacionId)
  if (!importacion) throw new ErrorAplicacion('Esa importación ya no existe.')
  if (importacion.estado !== 'aceptada') {
    throw new ErrorAplicacion('Esa importación no está aplicada, así que no hay nada que deshacer.')
  }

  const huellas = importacionesBd.huellasDe(importacionId)
  let borrados = 0
  let devueltos = 0

  // Los movimientos creados por la importacion se van; los que ya existian y
  // solo se conciliaron vuelven a pendiente.
  const creadosPorEsta = bd
    .prepare('SELECT id FROM movimientos WHERE importacion_id = ?')
    .all(importacionId)
    .map((m) => m.id)

  const conciliados = new Set(
    huellas.filter((h) => h.resultado === 'conciliado' && h.movimientoId).map((h) => h.movimientoId),
  )

  for (const id of creadosPorEsta) {
    if (conciliados.has(id)) continue
    movimientosBd.borrar(id)
    borrados += 1
  }

  for (const movimientoId of conciliados) {
    const movimiento = movimientosBd.obtener(movimientoId)
    if (!movimiento) continue
    // A pendiente y a lo que decia la plantilla: el importe real del banco era
    // justo lo que aporto esta importacion.
    movimientosBd.actualizarPrevisto(movimientoId, {
      importePrevisto: movimiento.importePrevisto ?? movimiento.importe,
      importe: movimiento.importePrevisto ?? movimiento.importe,
    })
    bd.prepare(
      'UPDATE movimientos SET fecha_cobro = NULL, importacion_id = NULL, descripcion = ? WHERE id = ?',
    ).run('', movimientoId)
    devueltos += 1
  }

  if (importacion.ingresoAnterior !== null && importacion.ingresoAnterior !== undefined) {
    mesesBd.actualizar(importacion.mesId, { ingreso: importacion.ingresoAnterior })
  }

  importacionesBd.marcar(importacionId, 'deshecha')

  return { borrados, devueltos, mes: mesesBd.obtener(importacion.mesId) }
})
