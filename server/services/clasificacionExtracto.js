import { bd } from '../db/index.js'
import * as reglasBd from '../db/reglas.js'
import * as movimientosBd from '../db/movimientos.js'
import * as conceptosBd from '../db/conceptos.js'
import { buscarRegla } from './reglas.js'
import { redondear } from '../lib/http.js'

/**
 * Repartir los movimientos de un extracto entre los conceptos.
 *
 * Todo pasa aqui, en el servidor, y NADA se guarda: esto devuelve una propuesta
 * que el cliente enseña, se corrige a mano y solo entonces se acepta. Es la
 * misma regla que ya cumple la IA en el resto de la aplicacion.
 *
 * ---------------------------------------------------------------------------
 * El orden de las decisiones (se para en la primera que aplica)
 * ---------------------------------------------------------------------------
 *
 *   1. DUPLICADO   ya se importo en una importacion aceptada.
 *   2. OMITIDO     el importe es positivo. Solo entra lo que resta: la nomina
 *                  sale de la plantilla, y los abonos y devoluciones se dejan
 *                  fuera. Se ven en su bloque y se pueden rescatar a mano.
 *   3. REGLA       la primera regla activa que encaje, por orden de prioridad.
 *                  Segun su tipo: conciliar un fijo, comida, variable, o
 *                  'manual' (reconocido pero a revision, como los Bizum).
 *   4. IA          si esta configurada, se le pasan de golpe los que queden.
 *   5. NADA        al bloque de sin clasificar, que es el que se mira primero.
 *
 * Lo de FUERA DE MES no es un paso: se marca aparte. Un movimiento de otro mes
 * se clasifica igual, para que incluirlo sea un clic y no volver a empezar.
 */

/** Un fijo del mes puede recibir varias lineas (dos facturas de gas). */
function agruparFijos(lineas, fijosDelMes) {
  const porConcepto = new Map()

  for (const linea of lineas) {
    if (linea.destino !== 'fijo' || linea.fueraDeMes) continue
    const grupo = porConcepto.get(linea.conceptoId) ?? {
      conceptoId: linea.conceptoId,
      concepto: linea.concepto,
      lineas: [],
      total: 0,
    }
    grupo.lineas.push(linea)
    grupo.total = redondear(grupo.total + Math.abs(linea.importe))
    porConcepto.set(linea.conceptoId, grupo)
  }

  const conciliaciones = []
  for (const grupo of porConcepto.values()) {
    // Del mes: puede haber varios apuntes del mismo fijo (raro, pero pasa).
    const suyos = fijosDelMes.filter((f) => f.conceptoId === grupo.conceptoId)
    const pendiente = suyos.find((f) => !f.cobrado)
    const cobrado = suyos.find((f) => f.cobrado)

    // La fecha del cobro es la del ultimo movimiento del grupo.
    const fecha = grupo.lineas.map((l) => l.fecha).filter(Boolean).sort().pop() ?? null

    conciliaciones.push({
      conceptoId: grupo.conceptoId,
      concepto: grupo.concepto,
      lineas: grupo.lineas.map((l) => l.id),
      cuantasLineas: grupo.lineas.length,
      importe: grupo.total,
      fecha,
      // El detalle se guarda en la descripcion cuando son varias facturas.
      detalle:
        grupo.lineas.length > 1
          ? grupo.lineas.map((l) => `${l.descripcionLimpia} ${l.importe.toFixed(2)}`).join(' · ')
          : '',
      movimientoId: pendiente?.id ?? cobrado?.id ?? null,
      importePrevisto: pendiente?.importePrevisto ?? cobrado?.importePrevisto ?? null,
      /*
       *   'pendiente'  lo normal: se marca cobrado con el importe real.
       *   'ya-cobrado' posible duplicado: hay que decidir que hacer.
       *   'no-existe'  el fijo no esta en el mes: se ofrece crearlo.
       */
      situacion: pendiente ? 'pendiente' : cobrado ? 'ya-cobrado' : 'no-existe',
      // Qué hacer, editable en la revision.
      accion: pendiente ? 'conciliar' : cobrado ? 'decidir' : 'crear',
    })
  }
  return conciliaciones
}

/**
 * Clasifica los movimientos leidos contra las reglas y el mes destino.
 *
 * `huellasUsadas` es un Set con las huellas ya importadas y aceptadas.
 */
export function clasificar({ movimientos, mes, huellasUsadas = new Set() }) {
  const reglas = reglasBd.listar({ soloActivas: true })
  const delMes = movimientosBd.delMes(mes.id)
  const fijosDelMes = delMes.filter((m) => m.tipo === 'fijo' && !m.esObjetivo)
  const sobre = conceptosBd.sobrePrincipal()

  const claveMes = `${mes.anio}-${String(mes.mes).padStart(2, '0')}`
  const lineas = []
  const usoDeReglas = new Map()

  movimientos.forEach((movimiento, indice) => {
    const linea = {
      id: indice + 1,
      ...movimiento,
      // El importe tal como venia del banco. Se guarda aparte porque dividir un
      // movimiento cambia `importe`, y luego hay que poder comprobar que los
      // trozos suman exactamente esto.
      importeOriginal: movimiento.importe,
      destino: null,
      conceptoId: null,
      concepto: null,
      reglaId: null,
      // De donde sale la asignacion, para poder verlo de un vistazo:
      // regla (verde), aprendida (azul), ia (lila), manual (gris), ninguno (rojo).
      procedencia: 'ninguno',
      fueraDeMes: !!movimiento.fecha && !movimiento.fecha.startsWith(claveMes),
      nota: '',
    }

    if (huellasUsadas.has(movimiento.huella)) {
      linea.destino = 'duplicado'
      linea.nota = 'Ya entró en una importación anterior.'
      lineas.push(linea)
      return
    }

    if (movimiento.importe > 0) {
      linea.destino = 'omitido'
      linea.nota = 'Ingreso: solo entra lo que resta.'
      lineas.push(linea)
      return
    }

    const regla = buscarRegla(movimiento.descripcionOriginal, reglas)
    if (regla) {
      usoDeReglas.set(regla.id, (usoDeReglas.get(regla.id) ?? 0) + 1)
      linea.reglaId = regla.id
      linea.procedencia = regla.estado === 'propuesta' ? 'aprendida' : 'regla'

      if (regla.tipo === 'manual' || !regla.conceptoId) {
        // Reconocido, pero solo tu sabes de que es: los Bizum.
        linea.destino = 'sinClasificar'
        linea.procedencia = 'ninguno'
        linea.nota = `Reconocido por "${regla.texto}", pero hay que decir de qué es.`
      } else {
        linea.conceptoId = regla.conceptoId
        linea.concepto = regla.concepto
        linea.destino =
          regla.tipo === 'fijo' ? 'fijo' : regla.conceptoId === sobre?.id ? 'comida' : 'variable'
      }
    } else {
      linea.destino = 'sinClasificar'
    }

    lineas.push(linea)
  })

  return {
    lineas,
    conciliaciones: agruparFijos(lineas, fijosDelMes),
    // Los fijos del mes que el extracto no menciona: siguen pendientes, y
    // saberlo es util (¿se ha pasado el recibo?).
    fijosSinEncontrar: fijosDelMes
      .filter((f) => !f.cobrado && !lineas.some((l) => l.destino === 'fijo' && l.conceptoId === f.conceptoId))
      .map((f) => ({
        movimientoId: f.id,
        conceptoId: f.conceptoId,
        concepto: f.concepto,
        importePrevisto: f.importePrevisto,
        diaPrevisto: f.diaPrevisto,
      })),
    usoDeReglas: Object.fromEntries(usoDeReglas),
    resumen: contar(lineas),
  }
}

/**
 * El marcador que tiene que cuadrar siempre.
 *
 * N = fijos + variables + comida + omitidos + descartados + fuera de mes +
 *     duplicados + sin clasificar. Si esta suma no da, algo se ha perdido por
 *     el camino y no se puede aceptar la importacion.
 */
export function contar(lineas) {
  const cuenta = {
    total: lineas.length,
    fijos: 0,
    variables: 0,
    comida: 0,
    omitidos: 0,
    descartados: 0,
    fueraDeMes: 0,
    duplicados: 0,
    sinClasificar: 0,
  }
  for (const l of lineas) {
    if (l.destino === 'descartado') cuenta.descartados += 1
    else if (l.destino === 'duplicado') cuenta.duplicados += 1
    else if (l.destino === 'omitido') cuenta.omitidos += 1
    else if (l.fueraDeMes) cuenta.fueraDeMes += 1
    else if (l.destino === 'fijo') cuenta.fijos += 1
    else if (l.destino === 'comida') cuenta.comida += 1
    else if (l.destino === 'variable') cuenta.variables += 1
    else cuenta.sinClasificar += 1
  }
  cuenta.suma =
    cuenta.fijos +
    cuenta.variables +
    cuenta.comida +
    cuenta.omitidos +
    cuenta.descartados +
    cuenta.fueraDeMes +
    cuenta.duplicados +
    cuenta.sinClasificar
  cuenta.cuadra = cuenta.suma === cuenta.total
  return cuenta
}

/** Las huellas ya usadas en importaciones aceptadas de esta base de datos. */
export function huellasAceptadas() {
  const filas = bd
    .prepare(
      `SELECT h.hash FROM huellas_banco h
       JOIN importaciones i ON i.id = h.importacion_id
       WHERE i.estado = 'aceptada'`,
    )
    .all()
  return new Set(filas.map((f) => f.hash))
}
