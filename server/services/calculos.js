import { redondear } from '../lib/http.js'
import { ordenDelDiaPrevisto, NOMBRES_MESES } from '../lib/fechas.js'

/**
 * Todos los numeros del mes salen de aqui.
 *
 * Las reglas son las del Excel que sustituye la aplicacion:
 *
 *   fijos    = movimientos de conceptos 'fijo', sin contar el objetivo Ahorro
 *   extras   = movimientos de conceptos 'variable'
 *   comida   = el sobre; ver comidaQueCuenta() aqui abajo
 *   gastos   = fijos + extras + comida
 *   sobrante = ingreso - gastos
 *
 * El objetivo de ahorro NO es un gasto: es lo que me gustaria apartar, y se
 * compara contra el sobrante, que es lo que de verdad queda.
 */

const suma = (movimientos) => redondear(movimientos.reduce((total, m) => total + m.importe, 0))

/**
 * LO QUE APORTA EL SOBRE DE LA COMIDA A LOS GASTOS DEL MES.
 *
 * Esta funcion es la unica que decide esto, y la usan el resumen del mes, la
 * tabla anual, el analisis, la analitica, los informes y la exportacion. Si
 * alguna vez alguien vuelve a calcularlo por su cuenta, los totales dejaran de
 * cuadrar entre pantallas.
 *
 *   'presupuesto' -> max(presupuesto, gastado)
 *       El sobre se reserva entero aunque no se agote, como en el Excel de
 *       siempre. Pero si me paso, PASARSE ES UN GASTO: con 500 de presupuesto y
 *       620 gastados, el mes tiene que sumar 620. Antes sumaba 500 y los 120 de
 *       exceso desaparecian de las cuentas sin dejar rastro.
 *
 *   'gastado'     -> lo gastado, siempre.
 */
export function comidaQueCuenta(presupuesto, gastado, criterio) {
  const presu = redondear(presupuesto ?? 0)
  const gasto = redondear(gastado ?? 0)
  return criterio === 'gastado' ? gasto : Math.max(presu, gasto)
}

/**
 * EN QUE ESTADO ESTA EL DINERO DEL MES: pagado, comprometido y libre.
 *
 * Igual que `comidaQueCuenta`, esta funcion es la unica que decide esto. La
 * usan el panel de la pantalla Mes y el resumen, y si alguien vuelve a
 * calcularlo por su cuenta las dos barras dejaran de cuadrar.
 *
 * La distincion importa y no es cosmetica:
 *
 *   PAGADO        lo que YA ha salido de la cuenta: los fijos que se han
 *                 cobrado, los gastos variables y lo que se lleva gastado de
 *                 comida. Nada mas.
 *
 *   COMPROMETIDO  lo que sigue en la cuenta pero ya tiene dueno: los fijos que
 *                 faltan por cobrar y, si la comida cuenta por el presupuesto,
 *                 lo que queda del sobre. Ese resto NO esta gastado, pero
 *                 tampoco es tuyo para otra cosa: por eso no es «libre».
 *
 *   LIBRE         nomina - pagado - comprometido. Es lo que de verdad queda.
 *
 * El error que habia: el sobre entero se metia en «pagado» desde el dia 1, asi
 * que un mes recien abierto sin gastar un euro decia que llevabas 500 pagados.
 * Y los fijos cobrados no entraban porque se contaban dia a dia y su fecha caia
 * fuera del periodo; el resultado era una barra que no describia nada.
 *
 * Con el criterio 'gastado' la comida no compromete nada: solo cuenta lo que se
 * ha ido, que es justo lo que dice esa opcion.
 */
export function repartoDelMes(mes, movimientos, ajustes) {
  const sinObjetivo = movimientos.filter((m) => !m.esObjetivo)
  const fijos = sinObjetivo.filter((m) => m.tipo === 'fijo')
  const variables = sinObjetivo.filter((m) => m.tipo === 'variable')

  const fijosCobrados = suma(fijos.filter((m) => m.cobrado))
  const fijosPendientes = suma(fijos.filter((m) => !m.cobrado))
  const comidaGastada = suma(sinObjetivo.filter((m) => m.tipo === 'sobre'))

  const presupuestoComida = redondear(mes.presupuestoComida ?? 0)
  const porPresupuesto = ajustes.comidaEnTotal !== 'gastado'
  // Solo lo que queda del sobre, y solo si queda: pasarse no compromete mas.
  const sobreSinGastar = porPresupuesto
    ? Math.max(0, redondear(presupuestoComida - comidaGastada))
    : 0

  const pagado = redondear(fijosCobrados + suma(variables) + comidaGastada)
  const comprometido = redondear(fijosPendientes + sobreSinGastar)
  const libre = redondear((mes.ingreso ?? 0) - pagado - comprometido)

  return {
    pagado,
    comprometido,
    libre,
    /*
     * Lo pagado SIN los fijos. Es con lo unico que se puede juzgar el ritmo:
     * los fijos no dependen de como te portes este mes, llegan cuando llegan, y
     * meterlos hace que el dia que pasa la hipoteca parezca un desastre.
     */
    pagadoSinFijos: redondear(suma(variables) + comidaGastada),
    fijosCobrados,
    fijosPendientes,
    comidaGastada,
    sobreSinGastar,
  }
}

/** Porcentaje sobre los ingresos; null si no hay ingresos con los que dividir. */
function porcentaje(parte, total) {
  if (!total) return null
  return redondear((parte / total) * 100)
}

export function resumen(mes, movimientos, ajustes) {
  const fijos = movimientos.filter((m) => m.tipo === 'fijo' && !m.esObjetivo)
  const variables = movimientos.filter((m) => m.tipo === 'variable')
  const comida = movimientos.filter((m) => m.tipo === 'sobre')

  const totalFijos = suma(fijos)
  const totalExtras = suma(variables)
  const comidaGastada = suma(comida)
  const comidaContada = comidaQueCuenta(
    mes.presupuestoComida,
    comidaGastada,
    ajustes.comidaEnTotal,
  )

  const gastos = redondear(totalFijos + totalExtras + comidaContada)
  const sobrante = redondear(mes.ingreso - gastos)

  const pendientes = fijos.filter((m) => !m.cobrado)

  return {
    ingreso: mes.ingreso,
    gastos,
    sobrante,
    dineroEnCuenta: mes.dineroEnCuenta,
    fijos: totalFijos,
    extras: totalExtras,
    comida: {
      presupuesto: mes.presupuestoComida,
      gastado: comidaGastada,
      // Negativo cuando me he pasado: la pantalla lo pinta en rojo como exceso.
      queda: redondear(mes.presupuestoComida - comidaGastada),
      contada: comidaContada,
      criterio: ajustes.comidaEnTotal,
    },
    objetivoAhorro: mes.objetivoAhorro,
    fijosPendientes: {
      cuantos: pendientes.length,
      importe: suma(pendientes),
    },
    // Lo mismo que el sobrante, pero con nombre propio: es lo que la regla
    // 50/30/20 considera ahorro real.
    ahorroReal: sobrante,
  }
}

/**
 * Regla 50/30/20. La comida entra por el mismo criterio con el que cuenta en el
 * total de gastos, para que los tres bloques y el total cuadren entre si.
 */
export function reglaCincuentaTreintaVeinte(mes, movimientos, ajustes, resumenMes) {
  const deClase = (clasificacion) =>
    suma(
      movimientos.filter(
        (m) => m.clasificacion === clasificacion && m.tipo !== 'sobre' && !m.esObjetivo,
      ),
    )

  let necesario = deClase('necesario')
  let prescindible = deClase('prescindible')

  // El sobre no se suma apunte a apunte: aporta entero al bloque que le toque
  // por su clasificacion.
  const sobres = movimientos.filter((m) => m.tipo === 'sobre')
  const clasificacionSobre = sobres[0]?.clasificacion ?? 'necesario'
  if (clasificacionSobre === 'prescindible') {
    prescindible = redondear(prescindible + resumenMes.comida.contada)
  } else {
    necesario = redondear(necesario + resumenMes.comida.contada)
  }

  const ingreso = mes.ingreso

  const bloque = (nombre, real, ideal, mejorSiSube) => {
    const pct = porcentaje(real, ingreso)
    return {
      nombre,
      importe: real,
      porcentaje: pct,
      ideal,
      // Verde si va bien: gastar menos de lo ideal, ahorrar mas.
      cumple: pct === null ? null : mejorSiSube ? pct >= ideal : pct <= ideal,
      desvio: pct === null ? null : redondear(pct - ideal),
    }
  }

  return [
    bloque('Necesario', necesario, ajustes.ideales.necesario, false),
    bloque('Prescindible', prescindible, ajustes.ideales.prescindible, false),
    bloque('Ahorro', resumenMes.ahorroReal, ajustes.ideales.ahorro, true),
  ]
}

/** Reparto del mes por tipo, para la tarta. Los % son sobre los ingresos. */
export function repartoPorTipo(mes, resumenMes) {
  const trozos = [
    { nombre: 'Gastos fijos', clave: 'fijos', importe: resumenMes.fijos },
    { nombre: 'Gastos extras', clave: 'extras', importe: resumenMes.extras },
    { nombre: 'Comida', clave: 'comida', importe: resumenMes.comida.contada },
    { nombre: 'Ahorro (objetivo)', clave: 'ahorro', importe: resumenMes.objetivoAhorro },
    { nombre: 'Sobrante', clave: 'sobrante', importe: resumenMes.sobrante },
  ]
  return trozos.map((t) => ({ ...t, porcentaje: porcentaje(t.importe, mes.ingreso) }))
}

/**
 * Peso de los fijos principales sobre el total de fijos. Los grupos se
 * configuran en Ajustes; lo que no entre en ninguno cae en "Resto".
 */
export function pesoDeFijos(movimientos, gruposFijos, totalFijos) {
  const fijos = movimientos.filter((m) => m.tipo === 'fijo' && !m.esObjetivo)
  const asignados = new Set()

  const grupos = gruposFijos.map((grupo) => {
    const ids = new Set(grupo.conceptos ?? [])
    const suyos = fijos.filter((m) => ids.has(m.conceptoId))
    suyos.forEach((m) => asignados.add(m.id))
    const importe = suma(suyos)
    return { nombre: grupo.nombre, importe, porcentaje: porcentaje(importe, totalFijos) }
  })

  const resto = suma(fijos.filter((m) => !asignados.has(m.id)))
  if (resto !== 0 || grupos.length === 0) {
    grupos.push({ nombre: 'Resto', importe: resto, porcentaje: porcentaje(resto, totalFijos) })
  }
  return grupos
}

/** Variables del mes agrupados por concepto y ordenados por importe. */
export function rankingVariables(movimientos) {
  const porConcepto = new Map()
  for (const m of movimientos.filter((x) => x.tipo === 'variable')) {
    const actual = porConcepto.get(m.conceptoId) ?? {
      conceptoId: m.conceptoId,
      concepto: m.concepto,
      clasificacion: m.clasificacion,
      importe: 0,
      cuantos: 0,
    }
    actual.importe = redondear(actual.importe + m.importe)
    actual.cuantos += 1
    porConcepto.set(m.conceptoId, actual)
  }
  return [...porConcepto.values()].sort((a, b) => b.importe - a.importe)
}

/** Separa los movimientos del mes en las dos listas que pinta la pantalla. */
export function separar(movimientos) {
  const fijos = movimientos
    .filter((m) => m.tipo === 'fijo' && !m.esObjetivo)
    .sort((a, b) => {
      const orden = ordenDelDiaPrevisto(a.diaPrevisto) - ordenDelDiaPrevisto(b.diaPrevisto)
      return orden !== 0 ? orden : a.id - b.id
    })

  // Los variables, del mas reciente al mas antiguo. Los que aun no tienen fecha
  // van arriba: son los que se acaban de apuntar.
  const variables = movimientos
    .filter((m) => m.tipo === 'variable' || m.tipo === 'sobre')
    .sort((a, b) => {
      if (a.fechaCobro && b.fechaCobro && a.fechaCobro !== b.fechaCobro) {
        return a.fechaCobro < b.fechaCobro ? 1 : -1
      }
      if (!a.fechaCobro && b.fechaCobro) return -1
      if (a.fechaCobro && !b.fechaCobro) return 1
      return b.id - a.id
    })

  return { fijos, variables }
}

/**
 * Matriz concepto x mes de la vision anual, con el mismo aspecto que la hoja
 * del Excel: los fijos por orden, una fila "Otros" que agrupa los variables, y
 * las filas de Gastos, Ingresos y Ahorro (que es el sobrante de cada mes).
 *
 * La media mensual se divide entre los meses que existen en el año, no siempre
 * entre doce: en un año a medias, dividir entre doce daria una media falsa.
 */
export function matrizAnual({ anio, meses, movimientos, conceptos, ajustes }) {
  const porNumero = new Map(meses.map((m) => [m.mes, m]))
  const numerosDeMes = meses.map((m) => m.mes).sort((a, b) => a - b)

  // Un acumulador por concepto y, dentro, por numero de mes.
  const acumulado = new Map()
  const detalleVariables = new Map()

  for (const m of movimientos) {
    if (m.esObjetivo) continue

    if (m.tipo === 'variable') {
      const lista = detalleVariables.get(m.numeroMes) ?? []
      lista.push({
        conceptoId: m.conceptoId,
        concepto: m.concepto,
        importe: m.importe,
        descripcion: m.descripcion,
        fecha: m.fechaCobro,
      })
      detalleVariables.set(m.numeroMes, lista)
    }

    // La comida no se acumula apunte a apunte: va por su presupuesto, mas abajo.
    if (m.tipo === 'sobre') continue

    const clave = m.tipo === 'variable' ? 'otros' : m.conceptoId
    const celdas = acumulado.get(clave) ?? new Map()
    celdas.set(m.numeroMes, redondear((celdas.get(m.numeroMes) ?? 0) + m.importe))
    acumulado.set(clave, celdas)
  }

  const construirFila = (nombre, tipo, celdas, extras = {}) => {
    const valores = numerosDeMes.map((n) => celdas.get(n) ?? null)
    const total = redondear(valores.filter((v) => v !== null).reduce((t, v) => t + v, 0))
    return {
      nombre,
      tipo,
      valores,
      total,
      // Se divide entre todos los meses del año que existen, tengan importe o
      // no: es la media de lo que cuesta al mes, no la media de los meses en
      // que hubo recibo.
      media: numerosDeMes.length ? redondear(total / numerosDeMes.length) : 0,
      ...extras,
    }
  }

  const filas = []

  for (const concepto of conceptos) {
    if (concepto.tipo === 'sobre') {
      const celdas = new Map()
      for (const mes of meses) {
        const gastado = movimientos
          .filter((m) => m.numeroMes === mes.mes && m.conceptoId === concepto.id)
          .reduce((t, m) => t + m.importe, 0)
        // La misma regla que en el resumen del mes: si no, la tabla anual y la
        // pantalla del mes darian totales distintos para el mismo mes.
        celdas.set(
          mes.mes,
          comidaQueCuenta(mes.presupuestoComida, gastado, ajustes.comidaEnTotal),
        )
      }
      filas.push(construirFila(concepto.nombre, 'sobre', celdas, { conceptoId: concepto.id }))
      continue
    }
    if (concepto.tipo !== 'fijo' || concepto.esObjetivo) continue
    // Un fijo sin ningun apunte en todo el año no pinta fila: la hoja del Excel
    // tampoco tenia ese concepto ese año. Un cero SI se pinta, porque un cero es
    // un dato ("este mes el seguro no me lo han cobrado").
    const celdas = acumulado.get(concepto.id)
    if (!celdas || celdas.size === 0) continue
    filas.push(construirFila(concepto.nombre, 'fijo', celdas, { conceptoId: concepto.id }))
  }

  filas.push(construirFila('Otros', 'otros', acumulado.get('otros') ?? new Map()))

  // Filas de totales, calculadas mes a mes con las mismas reglas del resumen.
  const gastos = new Map()
  const ingresos = new Map()
  const ahorro = new Map()
  for (const mes of meses) {
    const suyos = movimientos.filter((m) => m.numeroMes === mes.mes)
    const r = resumen(mes, suyos, ajustes)
    gastos.set(mes.mes, r.gastos)
    ingresos.set(mes.mes, r.ingreso)
    ahorro.set(mes.mes, r.sobrante)
  }

  filas.push(construirFila('Gastos', 'total', gastos))
  filas.push(construirFila('Ingresos', 'total', ingresos))
  filas.push(construirFila('Ahorro', 'total', ahorro))

  return {
    anio,
    meses: numerosDeMes.map((n) => ({
      numero: n,
      nombre: NOMBRES_MESES[n - 1],
      mesId: porNumero.get(n)?.id ?? null,
      estado: porNumero.get(n)?.estado ?? null,
    })),
    filas,
    detalleVariables: Object.fromEntries(
      [...detalleVariables.entries()].map(([mes, lista]) => [
        mes,
        lista.sort((a, b) => b.importe - a.importe),
      ]),
    ),
  }
}
