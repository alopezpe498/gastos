import { bd } from '../db/index.js'
import * as configBd from '../db/config.js'
import * as conceptosBd from '../db/conceptos.js'
import { resumen, reglaCincuentaTreintaVeinte } from './calculos.js'
import { claveMes, NOMBRES_MESES } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

/**
 * Agregaciones del historico.
 *
 * DECISION: todo se calcula en JavaScript sobre los movimientos del rango, no
 * en SQL. Las reglas de la casa (que la comida cuenta por su presupuesto, que
 * el objetivo de ahorro no es un gasto, que el sobrante es ingreso menos
 * gastos) viven en calculos.js y son las que ve el usuario en el mes. Repetirlas
 * en SQL seria tener dos verdades que acabarian discrepando.
 *
 * El coste no es problema: son unas decenas de movimientos por mes. Diez años
 * de cuentas son unas tres mil filas, que se leen enteras en milisegundos.
 *
 * REGLA DE ORO: un mes sin datos vale null, NUNCA cero. Un cero baja las
 * medias y dibuja un valle en las graficas donde en realidad no hay nada.
 */

const numeroDeMes = (anio, mes) => anio * 100 + mes

/** Agrupaciones que no son un concepto suelto pero se miran igual. */
export const AGRUPACIONES = {
  gastos: 'Gastos totales',
  fijos: 'Todos los fijos',
  variables: 'Todos los variables',
  comida: 'Comida',
  ingresos: 'Ingresos',
  sobrante: 'Sobrante',
}

/**
 * Resuelve el rango pedido a un par de meses.
 * Sin nada, los ultimos doce meses con datos.
 */
export function resolverRango({ desde, hasta, anio, ultimos } = {}) {
  const limites = bd
    .prepare('SELECT MIN(anio * 100 + mes) AS min, MAX(anio * 100 + mes) AS max FROM meses')
    .get()
  if (!limites?.min) return null

  const aClave = (n) => `${Math.floor(n / 100)}-${String(n % 100).padStart(2, '0')}`

  if (anio) {
    return { desde: numeroDeMes(Number(anio), 1), hasta: numeroDeMes(Number(anio), 12) }
  }

  if (ultimos) {
    const fin = limites.max
    const anioFin = Math.floor(fin / 100)
    const mesFin = fin % 100
    // Se retrocede por meses de calendario, no por meses con datos: "los
    // ultimos 12 meses" son los ultimos doce del calendario, tengan o no datos.
    const total = anioFin * 12 + (mesFin - 1) - (Number(ultimos) - 1)
    const inicio = numeroDeMes(Math.floor(total / 12), (total % 12) + 1)
    return { desde: Math.max(inicio, limites.min), hasta: fin }
  }

  const leer = (valor, porDefecto) => {
    const encaja = /^(\d{4})-(\d{2})$/.exec(String(valor ?? ''))
    return encaja ? numeroDeMes(Number(encaja[1]), Number(encaja[2])) : porDefecto
  }

  const inicio = leer(desde, limites.min)
  const fin = leer(hasta, limites.max)
  return { desde: Math.min(inicio, fin), hasta: Math.max(inicio, fin), aClave }
}

/** Los meses del rango, con sus movimientos ya colgando de cada uno. */
function cargarRango(rango) {
  const meses = bd
    .prepare(
      `SELECT * FROM meses
       WHERE (anio * 100 + mes) BETWEEN ? AND ?
       ORDER BY anio ASC, mes ASC`,
    )
    .all(rango.desde, rango.hasta)
    .map((m) => ({
      id: m.id,
      anio: m.anio,
      mes: m.mes,
      clave: claveMes(m.anio, m.mes),
      ingreso: m.ingreso,
      dineroEnCuenta: m.dinero_en_cuenta,
      presupuestoComida: m.presupuesto_comida,
      objetivoAhorro: m.objetivo_ahorro,
      estado: m.estado,
      movimientos: [],
    }))

  if (meses.length === 0) return []

  const porId = new Map(meses.map((m) => [m.id, m]))
  const filas = bd
    .prepare(
      `SELECT m.mes_id, m.concepto_id, m.importe, m.fecha_cobro, m.importe_previsto,
              c.nombre AS concepto, c.tipo, c.clasificacion, c.es_objetivo
       FROM movimientos m
       JOIN conceptos c ON c.id = m.concepto_id
       WHERE m.mes_id IN (${meses.map(() => '?').join(',')})`,
    )
    .all(...meses.map((m) => m.id))

  for (const fila of filas) {
    porId.get(fila.mes_id)?.movimientos.push({
      conceptoId: fila.concepto_id,
      concepto: fila.concepto,
      tipo: fila.tipo,
      clasificacion: fila.clasificacion,
      esObjetivo: !!fila.es_objetivo,
      importe: fila.importe,
      importePrevisto: fila.importe_previsto,
      cobrado: !!fila.fecha_cobro,
    })
  }

  return meses
}

/** El resumen de cada mes, con las mismas reglas que ve el usuario. */
function resumirMeses(meses, ajustes) {
  return meses.map((mes) => ({ mes, resumen: resumen(mes, mes.movimientos, ajustes) }))
}

/** Meses del rango, incluidos los que no existen: ahi el valor sera null. */
function calendarioDelRango(rango) {
  const salida = []
  let actual = rango.desde
  while (actual <= rango.hasta) {
    const anio = Math.floor(actual / 100)
    const mes = actual % 100
    salida.push({ anio, mes, clave: claveMes(anio, mes), nombre: NOMBRES_MESES[mes - 1] })
    actual = mes === 12 ? numeroDeMes(anio + 1, 1) : numeroDeMes(anio, mes + 1)
  }
  return salida
}

// ---------------------------------------------------------------------------
// 1.1 Evolucion de un concepto
// ---------------------------------------------------------------------------

/** Valor de una clave (concepto o agrupacion) en un mes concreto. */
function valorDe(clave, mes, resumenMes) {
  if (clave.startsWith('concepto:')) {
    const id = Number(clave.slice(9))
    const suyos = mes.movimientos.filter((m) => m.conceptoId === id)
    // Un concepto sin ningun apunte ese mes no vale cero: vale "nada".
    if (suyos.length === 0) {
      // Salvo el sobre, que siempre tiene su presupuesto aunque no se apunte.
      const sobre = mes.movimientos.some((m) => m.tipo === 'sobre')
      return sobre ? null : null
    }
    return redondear(suyos.reduce((t, m) => t + m.importe, 0))
  }

  switch (clave) {
    case 'gastos':
      return resumenMes.gastos
    case 'fijos':
      return resumenMes.fijos
    case 'variables':
      return resumenMes.extras
    case 'comida':
      return resumenMes.comida.contada
    case 'ingresos':
      return resumenMes.ingreso
    case 'sobrante':
      return resumenMes.sobrante
    default:
      return null
  }
}

export function serie({ clave, rango }) {
  const ajustes = configBd.ajustes()
  const meses = cargarRango(rango)
  const resumidos = resumirMeses(meses, ajustes)
  const porClave = new Map(resumidos.map((r) => [r.mes.clave, r]))

  const nombre = clave.startsWith('concepto:')
    ? (conceptosBd.obtener(Number(clave.slice(9)))?.nombre ?? 'Concepto')
    : (AGRUPACIONES[clave] ?? clave)

  const conceptoId = clave.startsWith('concepto:') ? Number(clave.slice(9)) : null

  const puntos = calendarioDelRango(rango).map((celda) => {
    const encontrado = porClave.get(celda.clave)
    if (!encontrado) return { ...celda, valor: null, previsto: null }

    const valor = valorDe(clave, encontrado.mes, encontrado.resumen)
    // El previsto solo tiene sentido en un fijo: es su plantilla vigente.
    const suyos = conceptoId
      ? encontrado.mes.movimientos.filter((m) => m.conceptoId === conceptoId)
      : []
    const previsto = suyos.find((m) => m.importePrevisto !== null)?.importePrevisto ?? null

    return { ...celda, valor, previsto, mesId: encontrado.mes.id }
  })

  const conDatos = puntos.filter((p) => p.valor !== null)
  const total = redondear(conDatos.reduce((t, p) => t + p.valor, 0))
  const media = conDatos.length ? redondear(total / conDatos.length) : null

  const ordenados = [...conDatos].sort((a, b) => b.valor - a.valor)

  return {
    clave,
    nombre,
    puntos,
    resumen: {
      total,
      media,
      mesesConDatos: conDatos.length,
      maximo: ordenados[0] ? { clave: ordenados[0].clave, nombre: ordenados[0].nombre, anio: ordenados[0].anio, valor: ordenados[0].valor } : null,
      minimo: ordenados.at(-1)
        ? { clave: ordenados.at(-1).clave, nombre: ordenados.at(-1).nombre, anio: ordenados.at(-1).anio, valor: ordenados.at(-1).valor }
        : null,
    },
    comparacion: compararConPeriodoAnterior({ clave, rango, total, mesesConDatos: conDatos.length, ajustes }),
    porAnio: superponerAnios(puntos),
  }
}

/**
 * El mismo rango, corrido hacia atras tantos meses como dure. Sirve para
 * responder "¿voy mejor o peor que antes?" sin tener que elegir el periodo.
 */
function compararConPeriodoAnterior({ clave, rango, total, mesesConDatos, ajustes }) {
  const largo = mesesDeDistancia(rango.desde, rango.hasta) + 1
  const anterior = {
    desde: retroceder(rango.desde, largo),
    hasta: retroceder(rango.hasta, largo),
  }

  const meses = cargarRango(anterior)
  if (meses.length === 0) return null

  const resumidos = resumirMeses(meses, ajustes)
  const valores = resumidos
    .map(({ mes, resumen: r }) => valorDe(clave, mes, r))
    .filter((v) => v !== null)

  if (valores.length === 0) return null

  const totalAnterior = redondear(valores.reduce((t, v) => t + v, 0))
  return {
    desde: claveDeNumero(anterior.desde),
    hasta: claveDeNumero(anterior.hasta),
    total: totalAnterior,
    mesesConDatos: valores.length,
    // Si los dos periodos no tienen los mismos meses con datos, comparar los
    // totales enganaria: se dice, y quien mire decide.
    comparable: valores.length === mesesConDatos,
    variacion: totalAnterior === 0 ? null : redondear(((total - totalAnterior) / Math.abs(totalAnterior)) * 100),
  }
}

const claveDeNumero = (n) => `${Math.floor(n / 100)}-${String(n % 100).padStart(2, '0')}`

function mesesDeDistancia(desde, hasta) {
  const a = Math.floor(desde / 100) * 12 + (desde % 100)
  const b = Math.floor(hasta / 100) * 12 + (hasta % 100)
  return b - a
}

function retroceder(numero, meses) {
  const total = Math.floor(numero / 100) * 12 + ((numero % 100) - 1) - meses
  return numeroDeMes(Math.floor(total / 12), (total % 12) + 1)
}

/** Una linea por año, con el eje de enero a diciembre. */
function superponerAnios(puntos) {
  const porAnio = new Map()
  for (const punto of puntos) {
    const valores = porAnio.get(punto.anio) ?? new Array(12).fill(null)
    valores[punto.mes - 1] = punto.valor
    porAnio.set(punto.anio, valores)
  }
  return [...porAnio.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([anio, valores]) => ({ anio, valores }))
}

// ---------------------------------------------------------------------------
// 1.2 Comparativa entre años
// ---------------------------------------------------------------------------

/**
 * @param {number[]} anios
 * @param {number|null} hastaMes  para comparar años incompletos con los mismos
 *   meses del anterior (enero-agosto de 2026 frente a enero-agosto de 2025).
 */
export function comparativa({ anios, hastaMes = null }) {
  const ajustes = configBd.ajustes()
  const tope = hastaMes && hastaMes >= 1 && hastaMes <= 12 ? hastaMes : 12

  const porAnio = new Map()
  for (const anio of anios) {
    const meses = cargarRango({
      desde: numeroDeMes(anio, 1),
      hasta: numeroDeMes(anio, tope),
    })
    porAnio.set(anio, resumirMeses(meses, ajustes))
  }

  // Filas: un concepto por fila, con el total de cada año.
  const filas = new Map()
  const anotar = (clave, nombre, tipo, anio, importe) => {
    const fila = filas.get(clave) ?? { clave, nombre, tipo, totales: {} }
    fila.totales[anio] = redondear((fila.totales[anio] ?? 0) + importe)
    filas.set(clave, fila)
  }

  for (const [anio, resumidos] of porAnio) {
    for (const { mes, resumen: r } of resumidos) {
      for (const movimiento of mes.movimientos) {
        if (movimiento.esObjetivo) continue
        // El sobre va por su criterio, no apunte a apunte.
        if (movimiento.tipo === 'sobre') continue
        anotar(
          `concepto:${movimiento.conceptoId}`,
          movimiento.concepto,
          movimiento.tipo,
          anio,
          movimiento.importe,
        )
      }
      const sobre = conceptosBd.sobrePrincipal()
      if (sobre) anotar(`concepto:${sobre.id}`, sobre.nombre, 'sobre', anio, r.comida.contada)
    }
  }

  const [ultimo, anterior] = [...anios].sort((a, b) => b - a)

  const conVariacion = [...filas.values()].map((fila) => {
    const a = fila.totales[ultimo] ?? null
    const b = anterior !== undefined ? (fila.totales[anterior] ?? null) : null
    const diferencia = a !== null && b !== null ? redondear(a - b) : null
    return {
      ...fila,
      diferencia,
      // Sin base con la que comparar, no hay porcentaje: null, no infinito.
      variacion: a !== null && b !== null && b !== 0 ? redondear(((a - b) / Math.abs(b)) * 100) : null,
    }
  })

  // Totales por año, con las mismas reglas del mes.
  const totales = {}
  for (const [anio, resumidos] of porAnio) {
    const gastos = redondear(resumidos.reduce((t, r) => t + r.resumen.gastos, 0))
    const ingresos = redondear(resumidos.reduce((t, r) => t + r.resumen.ingreso, 0))
    const sobrante = redondear(ingresos - gastos)
    totales[anio] = {
      gastos,
      ingresos,
      sobrante,
      meses: resumidos.length,
      porcentajeAhorro: ingresos ? redondear((sobrante / ingresos) * 100) : null,
    }
  }

  return {
    anios: [...anios].sort((a, b) => a - b),
    hastaMes: tope,
    parcial: tope < 12,
    filas: conVariacion.sort((a, b) => (b.totales[ultimo] ?? 0) - (a.totales[ultimo] ?? 0)),
    totales,
  }
}

// ---------------------------------------------------------------------------
// 1.3 Reparto del gasto
// ---------------------------------------------------------------------------

const TOPE_REPARTO = 15

export function reparto({ rango }) {
  const ajustes = configBd.ajustes()
  const meses = cargarRango(rango)
  const resumidos = resumirMeses(meses, ajustes)

  const porConcepto = new Map()
  for (const { mes, resumen: r } of resumidos) {
    for (const movimiento of mes.movimientos) {
      if (movimiento.esObjetivo || movimiento.tipo === 'sobre') continue
      const actual = porConcepto.get(movimiento.conceptoId) ?? {
        conceptoId: movimiento.conceptoId,
        nombre: movimiento.concepto,
        tipo: movimiento.tipo,
        clasificacion: movimiento.clasificacion,
        importe: 0,
        apuntes: 0,
      }
      actual.importe = redondear(actual.importe + movimiento.importe)
      actual.apuntes += 1
      porConcepto.set(movimiento.conceptoId, actual)
    }
    const sobre = conceptosBd.sobrePrincipal()
    if (sobre && r.comida.contada !== 0) {
      const actual = porConcepto.get(sobre.id) ?? {
        conceptoId: sobre.id,
        nombre: sobre.nombre,
        tipo: 'sobre',
        clasificacion: 'necesario',
        importe: 0,
        apuntes: 0,
      }
      actual.importe = redondear(actual.importe + r.comida.contada)
      actual.apuntes += 1
      porConcepto.set(sobre.id, actual)
    }
  }

  const ordenados = [...porConcepto.values()].sort((a, b) => b.importe - a.importe)
  const total = redondear(ordenados.reduce((t, c) => t + c.importe, 0))
  const pct = (v) => (total ? redondear((v / total) * 100) : null)

  const arriba = ordenados.slice(0, TOPE_REPARTO).map((c) => ({ ...c, porcentaje: pct(c.importe) }))
  const cola = ordenados.slice(TOPE_REPARTO)
  const resto = redondear(cola.reduce((t, c) => t + c.importe, 0))

  // ---------- por clasificacion ----------
  const clasificacion = { necesario: 0, prescindible: 0, ahorro: 0 }
  for (const { mes, resumen: r } of resumidos) {
    const [necesario, prescindible, ahorro] = reglaCincuentaTreintaVeinte(mes, mes.movimientos, ajustes, r)
    clasificacion.necesario = redondear(clasificacion.necesario + necesario.importe)
    clasificacion.prescindible = redondear(clasificacion.prescindible + prescindible.importe)
    clasificacion.ahorro = redondear(clasificacion.ahorro + ahorro.importe)
  }

  // ---------- evolucion mensual del reparto ----------
  const evolucion = calendarioDelRango(rango).map((celda) => {
    const encontrado = resumidos.find((r) => r.mes.clave === celda.clave)
    if (!encontrado) return { ...celda, necesario: null, prescindible: null, ahorro: null }
    const [n, p, a] = reglaCincuentaTreintaVeinte(
      encontrado.mes,
      encontrado.mes.movimientos,
      ajustes,
      encontrado.resumen,
    )
    return { ...celda, necesario: n.importe, prescindible: p.importe, ahorro: a.importe }
  })

  return {
    total,
    porConcepto: arriba,
    resto: cola.length > 0 ? { importe: resto, porcentaje: pct(resto), cuantos: cola.length } : null,
    porClasificacion: [
      { nombre: 'Necesario', clave: 'necesario', importe: clasificacion.necesario },
      { nombre: 'Prescindible', clave: 'prescindible', importe: clasificacion.prescindible },
      { nombre: 'Ahorro', clave: 'ahorro', importe: clasificacion.ahorro },
    ],
    evolucion,
    // El ranking solo mira los variables: es donde tiene sentido el ticket medio.
    ranking: ordenados
      .filter((c) => c.tipo === 'variable')
      .map((c) => ({
        ...c,
        porcentaje: pct(c.importe),
        ticketMedio: c.apuntes ? redondear(c.importe / c.apuntes) : null,
      })),
  }
}

// ---------------------------------------------------------------------------
// 1.4 Estacionalidad
// ---------------------------------------------------------------------------

export function estacionalidad({ rango }) {
  const ajustes = configBd.ajustes()
  const meses = cargarRango(rango)
  const resumidos = resumirMeses(meses, ajustes)

  // concepto -> mes(1..12) -> [valores de cada año]
  const porConcepto = new Map()
  const anotar = (id, nombre, mes, importe) => {
    const fila = porConcepto.get(id) ?? { conceptoId: id, nombre, celdas: new Map() }
    const lista = fila.celdas.get(mes) ?? []
    lista.push(importe)
    fila.celdas.set(mes, lista)
    porConcepto.set(id, fila)
  }

  const totalesPorMes = new Map()

  for (const { mes, resumen: r } of resumidos) {
    const porMovimiento = new Map()
    for (const movimiento of mes.movimientos) {
      if (movimiento.esObjetivo || movimiento.tipo === 'sobre') continue
      porMovimiento.set(
        movimiento.conceptoId,
        redondear((porMovimiento.get(movimiento.conceptoId) ?? 0) + movimiento.importe),
      )
    }
    for (const [id, importe] of porMovimiento) {
      const nombre = mes.movimientos.find((m) => m.conceptoId === id).concepto
      anotar(id, nombre, mes.mes, importe)
    }
    const sobre = conceptosBd.sobrePrincipal()
    if (sobre && r.comida.contada !== 0) anotar(sobre.id, sobre.nombre, mes.mes, r.comida.contada)

    const lista = totalesPorMes.get(mes.mes) ?? []
    lista.push({ anio: mes.anio, valor: r.gastos })
    totalesPorMes.set(mes.mes, lista)
  }

  const media = (lista) => (lista.length ? redondear(lista.reduce((t, v) => t + v, 0) / lista.length) : null)

  const filas = [...porConcepto.values()]
    .map((fila) => {
      const medias = Array.from({ length: 12 }, (_, i) => media(fila.celdas.get(i + 1) ?? []))
      const conDatos = medias.filter((v) => v !== null)
      return {
        conceptoId: fila.conceptoId,
        nombre: fila.nombre,
        medias,
        total: redondear(conDatos.reduce((t, v) => t + v, 0)),
        // El mes que mas se dispara respecto a su propia media: es lo que se
        // viene a buscar aqui.
        puntaEn: puntaDe(medias),
      }
    })
    .sort((a, b) => b.total - a.total)

  return {
    filas,
    totalPorMes: Array.from({ length: 12 }, (_, i) => {
      const lista = totalesPorMes.get(i + 1) ?? []
      return {
        mes: i + 1,
        nombre: NOMBRES_MESES[i],
        media: media(lista.map((l) => l.valor)),
        anios: lista.sort((a, b) => a.anio - b.anio),
      }
    }),
  }
}

/** Mes en el que un concepto se dispara mas por encima de su media anual. */
function puntaDe(medias) {
  const conDatos = medias.map((v, i) => ({ mes: i + 1, valor: v })).filter((c) => c.valor !== null)
  if (conDatos.length < 3) return null
  const media = conDatos.reduce((t, c) => t + c.valor, 0) / conDatos.length
  if (media <= 0) return null
  const mayor = conDatos.reduce((a, b) => (b.valor > a.valor ? b : a))
  // Solo se llama punta si de verdad destaca: un 60% por encima de su media.
  return mayor.valor > media * 1.6
    ? { mes: mayor.mes, nombre: NOMBRES_MESES[mayor.mes - 1], veces: redondear(mayor.valor / media) }
    : null
}

// ---------------------------------------------------------------------------
// 1.5 Tendencia de ahorro
// ---------------------------------------------------------------------------

export function ahorro({ rango }) {
  const ajustes = configBd.ajustes()
  const meses = cargarRango(rango)
  const resumidos = resumirMeses(meses, ajustes)
  const porClave = new Map(resumidos.map((r) => [r.mes.clave, r]))

  let acumulado = 0
  const puntos = calendarioDelRango(rango).map((celda) => {
    const encontrado = porClave.get(celda.clave)
    if (!encontrado) return { ...celda, sobrante: null, acumulado: null }
    acumulado = redondear(acumulado + encontrado.resumen.sobrante)
    return {
      ...celda,
      mesId: encontrado.mes.id,
      sobrante: encontrado.resumen.sobrante,
      objetivo: encontrado.mes.objetivoAhorro,
      acumulado,
    }
  })

  const conDatos = puntos.filter((p) => p.sobrante !== null)
  const ordenados = [...conDatos].sort((a, b) => b.sobrante - a.sobrante)

  // ---------- 50/30/20 por año ----------
  const porAnio = new Map()
  for (const { mes, resumen: r } of resumidos) {
    const bloques = reglaCincuentaTreintaVeinte(mes, mes.movimientos, ajustes, r)
    const actual = porAnio.get(mes.anio) ?? {
      anio: mes.anio,
      meses: 0,
      ingresos: 0,
      necesario: 0,
      prescindible: 0,
      ahorro: 0,
    }
    actual.meses += 1
    actual.ingresos = redondear(actual.ingresos + r.ingreso)
    actual.necesario = redondear(actual.necesario + bloques[0].importe)
    actual.prescindible = redondear(actual.prescindible + bloques[1].importe)
    actual.ahorro = redondear(actual.ahorro + bloques[2].importe)
    porAnio.set(mes.anio, actual)
  }

  const regla = [...porAnio.values()]
    .sort((a, b) => a.anio - b.anio)
    .map((a) => {
      const pct = (v) => (a.ingresos ? redondear((v / a.ingresos) * 100) : null)
      return {
        ...a,
        porcentajes: {
          necesario: pct(a.necesario),
          prescindible: pct(a.prescindible),
          ahorro: pct(a.ahorro),
        },
        ideales: ajustes.ideales,
      }
    })

  return {
    puntos,
    resumen: {
      mesesConDatos: conDatos.length,
      positivos: conDatos.filter((p) => p.sobrante > 0).length,
      negativos: conDatos.filter((p) => p.sobrante < 0).length,
      media: conDatos.length
        ? redondear(conDatos.reduce((t, p) => t + p.sobrante, 0) / conDatos.length)
        : null,
      total: redondear(conDatos.reduce((t, p) => t + p.sobrante, 0)),
      mejor: ordenados[0] ?? null,
      peor: ordenados.at(-1) ?? null,
    },
    regla,
  }
}

// ---------------------------------------------------------------------------
// 2. Contexto de un mes, para las pantallas que ya existen
// ---------------------------------------------------------------------------

export function contextoDeMes(mesId) {
  const ajustes = configBd.ajustes()
  const fila = bd.prepare('SELECT anio, mes FROM meses WHERE id = ?').get(mesId)
  if (!fila) return null

  const numero = numeroDeMes(fila.anio, fila.mes)

  const deUnMes = (n) => {
    const meses = cargarRango({ desde: n, hasta: n })
    if (meses.length === 0) return null
    return { mes: meses[0], resumen: resumen(meses[0], meses[0].movimientos, ajustes) }
  }

  const actual = deUnMes(numero)
  if (!actual) return null

  const hace12 = deUnMes(numeroDeMes(fila.anio - 1, fila.mes))

  // Los doce meses anteriores a este, sin contarlo.
  const doce = cargarRango({ desde: retroceder(numero, 12), hasta: retroceder(numero, 1) })
  const resumidosDoce = resumirMeses(doce, ajustes)

  const variacion = (ahora, antes) =>
    antes === null || antes === 0 ? null : redondear(((ahora - antes) / Math.abs(antes)) * 100)

  const mediaDe = (extraer) =>
    resumidosDoce.length
      ? redondear(resumidosDoce.reduce((t, r) => t + extraer(r.resumen), 0) / resumidosDoce.length)
      : null

  const mediaGastos = mediaDe((r) => r.gastos)
  const mediaSobrante = mediaDe((r) => r.sobrante)

  return {
    mesId,
    anioAnterior: hace12
      ? {
          clave: hace12.mes.clave,
          gastos: hace12.resumen.gastos,
          sobrante: hace12.resumen.sobrante,
          variacionGastos: variacion(actual.resumen.gastos, hace12.resumen.gastos),
          variacionSobrante: variacion(actual.resumen.sobrante, hace12.resumen.sobrante),
        }
      : null,
    mediaDoceMeses: resumidosDoce.length
      ? {
          meses: resumidosDoce.length,
          gastos: mediaGastos,
          sobrante: mediaSobrante,
          variacionGastos: variacion(actual.resumen.gastos, mediaGastos),
          variacionSobrante: variacion(actual.resumen.sobrante, mediaSobrante),
        }
      : null,
    posiciones: posicionesHistoricas(actual.mes, ajustes),
  }
}

/**
 * En que puesto queda cada concepto de este mes dentro de todo el historico:
 * "este es tu tercer mes con mas gasto en Restaurante".
 */
function posicionesHistoricas(mes, ajustes) {
  const todos = cargarRango({ desde: 0, hasta: 999912 })
  const resumidos = resumirMeses(todos, ajustes)

  const porConcepto = new Map()
  for (const { mes: otro } of resumidos) {
    const suma = new Map()
    for (const movimiento of otro.movimientos) {
      if (movimiento.esObjetivo) continue
      suma.set(
        movimiento.conceptoId,
        redondear((suma.get(movimiento.conceptoId) ?? 0) + movimiento.importe),
      )
    }
    for (const [id, importe] of suma) {
      const lista = porConcepto.get(id) ?? []
      lista.push({ mesId: otro.id, clave: otro.clave, importe })
      porConcepto.set(id, lista)
    }
  }

  const salida = []
  for (const [id, lista] of porConcepto) {
    const suyo = lista.find((l) => l.mesId === mes.id)
    if (!suyo || suyo.importe <= 0) continue

    const ordenada = [...lista].sort((a, b) => b.importe - a.importe)
    const puesto = ordenada.findIndex((l) => l.mesId === mes.id) + 1

    // Solo interesa cuando destaca de verdad y hay historico suficiente.
    if (puesto <= 3 && lista.length >= 6) {
      salida.push({
        conceptoId: id,
        nombre: mes.movimientos.find((m) => m.conceptoId === id)?.concepto ?? '',
        puesto,
        deCuantos: lista.length,
        importe: suyo.importe,
      })
    }
  }

  return salida.sort((a, b) => a.puesto - b.puesto || b.importe - a.importe).slice(0, 4)
}
