import { bd } from '../db/index.js'
import * as reglasBd from '../db/reglas.js'
import * as movimientosBd from '../db/movimientos.js'
import * as conceptosBd from '../db/conceptos.js'
import * as plantillaBd from '../db/plantilla.js'
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
 * EL EXTRACTO DEFINE EL MES
 * ---------------------------------------------------------------------------
 *
 * El mes de esta casa no es el del calendario: empieza el dia que se cobra la
 * nomina (el 27 o el 28 del mes anterior) y acaba el dia antes de la siguiente.
 * El extracto se descarga justo entre nomina y nomina, asi que TODO lo que trae
 * el fichero pertenece al mes que se elija.
 *
 * Por eso aqui NO se aparta nada por su fecha. Lo unico que se aparta es lo que
 * ya entro en una importacion aceptada, sea del mes que sea: eso es un
 * duplicado de verdad.
 *
 * ---------------------------------------------------------------------------
 * El orden de las decisiones (se para en la primera que aplica)
 * ---------------------------------------------------------------------------
 *
 *   1. DUPLICADO   su huella ya entro en una importacion aceptada.
 *   2. NOMINA      un abono que lleva el texto de la nomina: va al ingreso.
 *   3. REGLA       la primera regla activa que encaje, por orden de prioridad.
 *   4. NADA        al bloque de sin clasificar, que es el que se mira primero.
 *
 * Un ABONO que no es la nomina (una devolucion, un Bizum recibido) no se omite:
 * se propone como VARIABLE EN NEGATIVO, porque eso es lo que es. En la
 * aplicacion el signo va al reves que en el banco: lo que el banco cobra suma
 * gasto, y lo que devuelve lo resta.
 */

/** El importe tal como se apunta: el banco cobra en negativo, aqui suma gasto. */
const aImporteDeApp = (importeBanco) => redondear(-importeBanco)

/**
 * Un fijo del mes puede recibir varias lineas: tres facturas de luz, gas y
 * agua, o cinco suscripciones que caen todas en "Suscripciones". Se suman.
 */
function agruparFijos(lineas, fijosDelMes) {
  const porConcepto = new Map()

  for (const linea of lineas) {
    if (linea.destino !== 'fijo') continue
    const grupo = porConcepto.get(linea.conceptoId) ?? {
      conceptoId: linea.conceptoId,
      concepto: linea.concepto,
      lineas: [],
      total: 0,
    }
    grupo.lineas.push(linea)
    grupo.total = redondear(grupo.total + aImporteDeApp(linea.importe))
    porConcepto.set(linea.conceptoId, grupo)
  }

  const conciliaciones = []
  for (const grupo of porConcepto.values()) {
    const suyos = fijosDelMes.filter((f) => f.conceptoId === grupo.conceptoId)
    const pendiente = suyos.find((f) => !f.cobrado)
    const cobrado = suyos.find((f) => f.cobrado)
    const cual = pendiente ?? cobrado ?? null

    // La fecha del cobro es la del ultimo movimiento del grupo.
    const fecha = grupo.lineas.map((l) => l.fecha).filter(Boolean).sort().pop() ?? null

    /*
     * Que va a pasar. Ya no se pregunta por fila: el extracto es la verdad, y
     * el fijo se pone al dia con lo que dice el banco.
     *
     *   'cobrar'      estaba pendiente -> cobrado con el importe real.
     *   'actualizar'  ya estaba cobrado con OTRO importe -> se sustituye. No es
     *                 un duplicado: es la misma factura mejor informada.
     *   'crear'       no esta en el mes -> se crea ya cobrado.
     *   'igual'       ya estaba cobrado con la misma fecha e importe: no hay
     *                 nada que hacer, es la misma linea ya importada.
     */
    let accion = 'crear'
    if (pendiente) accion = 'cobrar'
    else if (cobrado) {
      const mismoImporte = Math.abs(cobrado.importe - grupo.total) < 0.005
      accion = mismoImporte && cobrado.fechaCobro === fecha ? 'igual' : 'actualizar'
    }

    conciliaciones.push({
      conceptoId: grupo.conceptoId,
      concepto: grupo.concepto,
      lineas: grupo.lineas.map((l) => l.id),
      // El detalle de cada linea, para desplegar la fila y para guardarlo.
      detalleLineas: grupo.lineas.map((l) => ({
        fecha: l.fecha,
        importe: aImporteDeApp(l.importe),
        descripcion: l.descripcionLimpia,
      })),
      cuantasLineas: grupo.lineas.length,
      importe: grupo.total,
      fecha,
      detalle:
        grupo.lineas.length > 1
          ? grupo.lineas
              .map((l) => `${l.descripcionLimpia} ${aImporteDeApp(l.importe).toFixed(2)}`)
              .join(' · ')
          : '',
      movimientoId: cual?.id ?? null,
      importePrevisto: cual?.importePrevisto ?? null,
      importeAnterior: cobrado?.importe ?? null,
      accion,
    })
  }
  return conciliaciones
}

/**
 * Los fijos cuyo importe real no coincide con la plantilla.
 *
 * Se propone actualizarla desde el mes siguiente: si la luz sube, lo normal es
 * que siga subida. Van premarcados, y quien revisa desmarca lo que sea un
 * importe puntual que no se va a repetir.
 */
function proponerPlantilla(conciliaciones, mes) {
  const siguiente =
    mes.mes === 12
      ? `${mes.anio + 1}-01`
      : `${mes.anio}-${String(mes.mes + 1).padStart(2, '0')}`

  return conciliaciones
    .filter((c) => c.accion !== 'igual')
    .map((c) => {
      const vigente = plantillaBd.vigenteEn(c.conceptoId, mes.anio, mes.mes)
      const previsto = vigente?.importePrevisto ?? 0
      return {
        conceptoId: c.conceptoId,
        concepto: c.concepto,
        previsto,
        real: c.importe,
        // Se propone lo que difiera, incluido cuando la plantilla estaba a cero.
        aplicar: Math.abs(previsto - c.importe) >= 0.005,
        diaPrevisto: vigente?.diaPrevisto ?? null,
        vigenteDesde: siguiente,
      }
    })
    .filter((p) => p.aplicar)
}

/**
 * Clasifica los movimientos leidos contra las reglas y el mes destino.
 *
 * `huellasUsadas` es un Set con las huellas ya importadas y aceptadas, de
 * cualquier mes.
 */
export function clasificar({ movimientos, mes, huellasUsadas = new Set(), formato = null }) {
  const reglas = reglasBd.listar({ soloActivas: true })
  const delMes = movimientosBd.delMes(mes.id)
  const fijosDelMes = delMes.filter((m) => m.tipo === 'fijo' && !m.esObjetivo)
  const sobre = conceptosBd.sobrePrincipal()

  const textoNomina = (formato?.textoNomina ?? 'NOMINA').toLowerCase()
  const esNomina = (m) =>
    m.importe > 0 &&
    !!textoNomina &&
    m.descripcionOriginal.toLowerCase().includes(textoNomina)

  const lineas = []
  const usoDeReglas = new Map()

  for (const movimiento of movimientos) {
    const linea = {
      ...movimiento,
      id: movimiento.id,
      // El importe tal como venia del banco. Se guarda aparte porque dividir un
      // movimiento cambia `importe`, y luego hay que comprobar que los trozos
      // suman exactamente esto.
      importeOriginal: movimiento.importe,
      // Un abono: el banco ingresa dinero. No se omite; se apunta en negativo.
      esAbono: movimiento.importe > 0,
      destino: null,
      conceptoId: null,
      concepto: null,
      reglaId: null,
      // De donde sale la asignacion, para verlo de un vistazo:
      // regla (verde), aprendida (azul), ia (lila), manual (gris), ninguno (rojo).
      procedencia: 'ninguno',
      nota: '',
    }

    if (huellasUsadas.has(movimiento.huella)) {
      linea.destino = 'duplicado'
      linea.nota = 'Ya entró en una importación aceptada.'
      lineas.push(linea)
      continue
    }

    if (esNomina(movimiento)) {
      linea.destino = 'ingreso'
      linea.procedencia = 'regla'
      linea.nota = 'La nómina: va al ingreso del mes.'
      lineas.push(linea)
      continue
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
      if (linea.esAbono) linea.nota = 'Un abono: entrará en negativo.'
    }

    lineas.push(linea)
  }

  const conciliaciones = agruparFijos(lineas, fijosDelMes)

  return {
    lineas,
    conciliaciones,
    plantillaPropuesta: proponerPlantilla(conciliaciones, mes),
    // Los fijos del mes que el extracto no menciona: siguen pendientes, y
    // saberlo es util (¿se ha pasado el recibo?).
    fijosSinEncontrar: fijosDelMes
      .filter(
        (f) => !f.cobrado && !lineas.some((l) => l.destino === 'fijo' && l.conceptoId === f.conceptoId),
      )
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
 * N = fijos + variables + comida + ingreso + descartados + duplicados +
 *     sin clasificar. Si esta suma no da, algo se ha perdido por el camino y no
 *     se puede aceptar la importacion.
 */
export function contar(lineas) {
  const cuenta = {
    total: lineas.length,
    fijos: 0,
    variables: 0,
    comida: 0,
    ingreso: 0,
    descartados: 0,
    duplicados: 0,
    sinClasificar: 0,
  }
  for (const l of lineas) {
    if (l.destino === 'descartado') cuenta.descartados += 1
    else if (l.destino === 'duplicado') cuenta.duplicados += 1
    else if (l.destino === 'ingreso') cuenta.ingreso += 1
    else if (l.destino === 'fijo') cuenta.fijos += 1
    else if (l.destino === 'comida') cuenta.comida += 1
    else if (l.destino === 'variable') cuenta.variables += 1
    else cuenta.sinClasificar += 1
  }
  cuenta.suma =
    cuenta.fijos +
    cuenta.variables +
    cuenta.comida +
    cuenta.ingreso +
    cuenta.descartados +
    cuenta.duplicados +
    cuenta.sinClasificar
  cuenta.cuadra = cuenta.suma === cuenta.total
  return cuenta
}

/**
 * Los conceptos mas usados en los ultimos meses.
 *
 * Es lo que va arriba del desplegable: con cincuenta conceptos, el orden
 * alfabetico obliga a leerlos todos para encontrar el de siempre. El sobre de
 * la comida va el primero pase lo que pase, porque es el que mas se usa.
 */
export function conceptosFrecuentes(mes, cuantosMeses = 3) {
  const desde = mes.anio * 12 + (mes.mes - 1) - cuantosMeses
  const filas = bd
    .prepare(
      `SELECT m.concepto_id AS id, COUNT(*) AS n
       FROM movimientos m
       JOIN meses s ON s.id = m.mes_id
       JOIN conceptos c ON c.id = m.concepto_id
       WHERE (s.anio * 12 + s.mes - 1) >= @desde AND c.tipo = 'variable' AND c.activo = 1
       GROUP BY m.concepto_id
       ORDER BY n DESC
       LIMIT 12`,
    )
    .all({ desde })

  const sobre = conceptosBd.sobrePrincipal()
  const ids = filas.map((f) => f.id)
  return sobre ? [sobre.id, ...ids.filter((id) => id !== sobre.id)] : ids
}

/** Las huellas ya usadas en importaciones aceptadas, de cualquier mes. */
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

/**
 * La importacion aceptada que ya trajo estas huellas.
 *
 * Se usa para poder decir "este extracto ya se importó en Agosto 2026 el 29/08"
 * en vez de dejar setenta y una lineas marcadas como duplicadas sin explicar de
 * donde salen.
 */
export function importacionQueLoTrajo(huellas) {
  if (huellas.length === 0) return null
  const marcas = huellas.map(() => '?').join(',')
  const fila = bd
    .prepare(
      `SELECT i.id, i.fecha, i.nombre_archivo, m.anio, m.mes, COUNT(*) AS cuantas
       FROM huellas_banco h
       JOIN importaciones i ON i.id = h.importacion_id
       JOIN meses m ON m.id = i.mes_id
       WHERE i.estado = 'aceptada' AND h.hash IN (${marcas})
       GROUP BY i.id
       ORDER BY cuantas DESC
       LIMIT 1`,
    )
    .get(...huellas)
  return fila
    ? {
        id: fila.id,
        fecha: fila.fecha,
        nombreArchivo: fila.nombre_archivo,
        anio: fila.anio,
        mes: fila.mes,
        cuantas: fila.cuantas,
      }
    : null
}
