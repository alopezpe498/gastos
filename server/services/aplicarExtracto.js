import { bd } from '../db/index.js'
import * as mesesBd from '../db/meses.js'
import * as movimientosBd from '../db/movimientos.js'
import * as conceptosBd from '../db/conceptos.js'
import * as plantillaBd from '../db/plantilla.js'
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
 * Antes de escribir se valida que la propuesta cuadra: el numero de movimientos
 * del fichero tiene que ser exactamente la suma de lo que se hace con ellos, y
 * el dinero tambien. Si no cuadra no se guarda y se dice por que.
 */

export class ErrorAplicacion extends Error {
  constructor(mensaje, detalle = null) {
    super(mensaje)
    this.detalle = detalle
  }
}

/** El banco cobra en negativo; aqui un gasto suma. Un abono resta. */
const aImporteDeApp = (importeBanco) => redondear(-importeBanco)

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

  // El dinero: lo que entra mas lo que se queda fuera tiene que ser el total.
  const total = redondear(lineas.reduce((t, l) => t + Math.abs(l.importe), 0))
  const dentro = redondear(
    lineas
      .filter((l) => ['fijo', 'comida', 'variable', 'ingreso'].includes(l.destino))
      .reduce((t, l) => t + Math.abs(l.importe), 0),
  )
  const fuera = redondear(
    lineas
      .filter((l) => ['descartado', 'duplicado'].includes(l.destino))
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
 * mes antes y despues.
 */
export function previsualizar({ importacionId, lineas, conciliaciones }) {
  const importacion = importacionesBd.obtener(importacionId)
  if (!importacion) throw new ErrorAplicacion('Esa importación ya no existe.')
  const mes = mesesBd.obtener(importacion.mesId)

  const porConcepto = new Map()
  const sumar = (conceptoId, nombre, importe) => {
    const actual = porConcepto.get(conceptoId) ?? {
      conceptoId,
      concepto: nombre,
      total: 0,
      cuantos: 0,
    }
    actual.total = redondear(actual.total + importe)
    actual.cuantos += 1
    porConcepto.set(conceptoId, actual)
  }

  for (const linea of lineas) {
    if (!['comida', 'variable'].includes(linea.destino)) continue
    sumar(linea.conceptoId, linea.concepto, aImporteDeApp(linea.importe))
  }
  for (const c of conciliaciones) {
    if (c.accion === 'igual') continue
    sumar(c.conceptoId, c.concepto, c.importe)
  }

  const nomina = lineas.find((l) => l.destino === 'ingreso')

  return {
    conceptos: [...porConcepto.values()].sort((a, b) => b.total - a.total),
    mes: { anio: mes.anio, mes: mes.mes, id: mes.id },
    antes: mes.resumen ?? null,
    entra: redondear([...porConcepto.values()].reduce((t, c) => t + c.total, 0)),
    ingreso: nomina ? { antes: mes.ingreso, despues: Math.abs(nomina.importe) } : null,
  }
}

/**
 * Aplica la importacion. Devuelve el mes ya montado.
 *
 * `lineas` y `conciliaciones` vienen del borrador revisado, no de volver a
 * clasificar: lo que se acepta tiene que ser exactamente lo que se vio.
 */
export const aceptar = bd.transaction(
  ({ importacionId, lineas, conciliaciones, reglasNuevas = [], plantilla = [], periodo = null }) => {
    const importacion = importacionesBd.obtener(importacionId)
    if (!importacion) throw new ErrorAplicacion('Esa importación ya no existe.')
    if (importacion.estado !== 'borrador') {
      throw new ErrorAplicacion(
        'Esa importación ya se aplicó. Deshazla antes de volver a aplicarla.',
      )
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
      throw new ErrorAplicacion(
        'La importación no cuadra, así que no se ha guardado nada.',
        problemas,
      )
    }

    const porId = new Map(lineas.map((l) => [l.id, l]))
    const guardadas = new Set()
    let cobrados = 0
    let actualizados = 0
    let creados = 0
    let comida = 0
    let variables = 0

    // ---- 1. Fijos: se ponen al dia con lo que dice el banco ----
    for (const c of conciliaciones) {
      let movimientoId = c.movimientoId

      if (c.accion === 'igual') {
        // La misma linea ya importada: no se toca nada, pero su huella se
        // guarda para que no vuelva a proponerse.
        for (const idLinea of c.lineas) {
          const linea = porId.get(idLinea)
          if (!linea) continue
          importacionesBd.guardarHuella({
            importacionId,
            hash: linea.huella,
            fecha: linea.fecha,
            importe: linea.importe,
            descripcionOriginal: linea.descripcionOriginal,
            descripcionLimpia: linea.descripcionLimpia,
            resultado: 'duplicado',
            movimientoId,
          })
          guardadas.add(idLinea)
        }
        continue
      }

      if (c.accion === 'crear' || !movimientoId) {
        const nuevo = movimientosBd.crear({
          mesId: mes.id,
          conceptoId: c.conceptoId,
          importe: c.importe,
          importePrevisto: c.importePrevisto ?? c.importe,
          fechaCobro: c.fecha,
          descripcion: c.detalle || '',
          origen: 'extracto',
        })
        movimientoId = nuevo.id
        creados += 1
      } else {
        movimientosBd.actualizar(movimientoId, {
          importe: c.importe,
          fechaCobro: c.fecha,
          ...(c.detalle ? { descripcion: c.detalle } : {}),
        })
        if (c.accion === 'actualizar') actualizados += 1
        else cobrados += 1
      }

      for (const idLinea of c.lineas) {
        const linea = porId.get(idLinea)
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
        guardadas.add(idLinea)
      }
      marcarImportacion(movimientoId, importacionId)
    }

    // ---- 2. Variables, comida y la nomina ----
    const sobre = conceptosBd.sobrePrincipal()
    const ingresoAnterior = mes.ingreso
    let ingresoNuevo = null

    for (const linea of lineas) {
      if (guardadas.has(linea.id)) continue

      let resultado = 'ignorado'
      let movimientoId = null

      if (linea.destino === 'ingreso') {
        // La nomina no crea un apunte: es el ingreso del mes.
        ingresoNuevo = Math.abs(linea.importe)
        resultado = 'ingreso'
      } else if (['comida', 'variable'].includes(linea.destino)) {
        const nuevo = movimientosBd.crear({
          mesId: mes.id,
          conceptoId: linea.conceptoId,
          // Un abono entra en negativo: resta gasto, no lo suma.
          importe: aImporteDeApp(linea.importe),
          fechaCobro: linea.fecha,
          descripcion: linea.descripcion ?? linea.descripcionLimpia,
          origen: 'extracto',
        })
        movimientoId = nuevo.id
        resultado = 'creado'
        if (linea.conceptoId === sobre?.id) comida += 1
        else variables += 1
        marcarImportacion(movimientoId, importacionId, linea.descripcionOriginal)
      } else if (linea.destino === 'descartado') {
        resultado = 'descartado'
      } else if (linea.destino === 'duplicado') {
        resultado = 'duplicado'
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

    // ---- 3. El mes: el ingreso y el periodo que cubre ----
    const cambiosDelMes = {}
    if (ingresoNuevo !== null) cambiosDelMes.ingreso = ingresoNuevo
    if (periodo?.desde) cambiosDelMes.fechaInicio = periodo.desde
    if (periodo?.hasta) cambiosDelMes.fechaFin = periodo.hasta
    if (Object.keys(cambiosDelMes).length > 0) mesesBd.actualizar(mes.id, cambiosDelMes)

    // ---- 4. La plantilla, para los fijos que se hayan marcado ----
    let plantillaActualizada = 0
    for (const entrada of plantilla) {
      if (!entrada?.aplicar || !entrada.conceptoId || !entrada.vigenteDesde) continue
      plantillaBd.guardar(entrada.conceptoId, {
        diaPrevisto: entrada.diaPrevisto ?? null,
        importePrevisto: entrada.real,
        vigenteDesde: entrada.vigenteDesde,
      })
      plantillaActualizada += 1
    }

    // ---- 5. Las reglas que se hayan pedido recordar ----
    for (const regla of reglasNuevas) {
      if (!regla?.texto || reglasBd.buscarPorTexto(regla.texto)) continue
      const concepto = regla.conceptoId ? conceptosBd.obtener(regla.conceptoId) : null
      reglasBd.crear({
        texto: regla.texto,
        conceptoId: concepto?.id ?? null,
        tipo: concepto ? (concepto.tipo === 'sobre' ? 'sobre' : concepto.tipo) : 'manual',
        coincidencia: ['exacta', 'regex'].includes(regla.coincidencia)
          ? regla.coincidencia
          : 'empieza',
        estado: 'propuesta',
        origen: 'aprendida',
      })
    }

    // ---- 6. Cerrar la importacion ----
    const cuenta = contar(lineas)
    importacionesBd.actualizarConteos(importacionId, {
      fijos: conciliaciones.filter((c) => c.accion !== 'igual').length,
      variables: cuenta.variables,
      ingresos: cuenta.ingreso,
      descartados: cuenta.descartados,
      duplicados: cuenta.duplicados,
    })
    importacionesBd.guardarBorrador(importacionId, null)
    importacionesBd.marcar(importacionId, 'aceptada', { ingresoAnterior })

    return {
      cobrados,
      actualizados,
      creados,
      comida,
      variables,
      descartados: cuenta.descartados,
      duplicados: cuenta.duplicados,
      plantillaActualizada,
      ingreso: ingresoNuevo === null ? null : { antes: ingresoAnterior, despues: ingresoNuevo },
      mes: mesesBd.obtener(mes.id),
    }
  },
)

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
 * previsto, restaura el ingreso anterior y marca la importacion como deshecha,
 * con lo que sus huellas dejan de contar como duplicados.
 *
 * Las reglas aprendidas y los cambios de plantilla NO se tocan: lo que se
 * aprendio sigue valiendo.
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
    // A pendiente y a lo que decia la plantilla.
    movimientosBd.actualizarPrevisto(movimientoId, {
      importePrevisto: movimiento.importePrevisto ?? movimiento.importe,
      importe: movimiento.importePrevisto ?? movimiento.importe,
    })
    bd.prepare(
      'UPDATE movimientos SET fecha_cobro = NULL, importacion_id = NULL, descripcion = ? WHERE id = ?',
    ).run('', movimientoId)
    devueltos += 1
  }

  const cambios = {}
  if (importacion.ingresoAnterior !== null && importacion.ingresoAnterior !== undefined) {
    cambios.ingreso = importacion.ingresoAnterior
  }
  // El periodo lo puso esta importacion: al deshacerla, el mes deja de tenerlo.
  cambios.fechaInicio = null
  cambios.fechaFin = null
  mesesBd.actualizar(importacion.mesId, cambios)

  importacionesBd.marcar(importacionId, 'deshecha')

  return { borrados, devueltos, mes: mesesBd.obtener(importacion.mesId) }
})
