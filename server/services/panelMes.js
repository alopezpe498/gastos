import * as movimientosBd from '../db/movimientos.js'
import * as conceptosBd from '../db/conceptos.js'
import { comidaQueCuenta } from './calculos.js'
import { diasDelMes } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

/**
 * Los datos que necesitan los bloques de la pantalla Mes.
 *
 * SOLO LEE. No cambia ningun calculo: el gasto de cada dia sale de los mismos
 * movimientos que el resumen, y la comida sigue la regla de siempre.
 *
 * Lo que la API no daba y aqui se calcula:
 *
 *   - El periodo real y en que dia de el estamos, para "dia 12 de 29" y para
 *     repartir lo que queda entre los dias que faltan.
 *   - El gasto acumulado, para la barra del bloque principal.
 *   - Los extras por dia, para las barritas del bloque Extras.
 *   - Que concepto se lleva mas de los extras, para su frase.
 *   - Que fijos faltan por cobrar, para los puntos y la frase de Fijos.
 */

const soloFecha = (iso) => String(iso ?? '').slice(0, 10)

function diasEntre(desde, hasta) {
  const dias = []
  const fin = new Date(`${hasta}T00:00:00Z`)
  for (let d = new Date(`${desde}T00:00:00Z`); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(d.toISOString().slice(0, 10))
  }
  return dias
}

export function panel(mes, ajustes) {
  const movimientos = movimientosBd.delMes(mes.id)
  const sobre = conceptosBd.sobrePrincipal()

  /*
   * El periodo. Si el mes viene de un extracto va de nomina a nomina y lo dice
   * el propio mes; si no, el mes del calendario, que es lo unico que se sabe.
   */
  const ultimoDia = String(diasDelMes(mes.anio, mes.mes)).padStart(2, '0')
  const mm = String(mes.mes).padStart(2, '0')
  const desde = mes.fechaInicio || `${mes.anio}-${mm}-01`
  const hasta = mes.fechaFin || `${mes.anio}-${mm}-${ultimoDia}`
  const dias = diasEntre(desde, hasta)

  const hoy = new Date().toISOString().slice(0, 10)
  const dentro = hoy >= desde && hoy <= hasta
  // Si el mes ya pasó, se considera terminado; si aún no ha empezado, va por 0.
  const diaActual = dentro ? dias.indexOf(hoy) + 1 : hoy > hasta ? dias.length : 0
  const diasQueQuedan = Math.max(0, dias.length - diaActual)

  // ---- el gasto de cada dia ----
  const porDia = new Map(dias.map((d) => [d, 0]))
  const extrasPorDia = new Map(dias.map((d) => [d, 0]))
  const porConcepto = new Map()
  let comidaGastada = 0
  const comidaPorDia = new Map()

  for (const m of movimientos) {
    if (m.esObjetivo) continue
    const dia = soloFecha(m.fechaCobro)

    if (m.tipo === 'sobre') {
      comidaGastada = redondear(comidaGastada + m.importe)
      if (porDia.has(dia)) comidaPorDia.set(dia, redondear((comidaPorDia.get(dia) ?? 0) + m.importe))
      continue
    }

    if (m.tipo === 'variable') {
      if (extrasPorDia.has(dia)) {
        extrasPorDia.set(dia, redondear((extrasPorDia.get(dia) ?? 0) + m.importe))
      }
      const actual = porConcepto.get(m.conceptoId) ?? { concepto: m.concepto, total: 0 }
      actual.total = redondear(actual.total + m.importe)
      porConcepto.set(m.conceptoId, actual)
    }

    // Un fijo pendiente todavia no se ha pagado: no cuenta en el acumulado.
    if (m.tipo === 'fijo' && !m.cobrado) continue
    if (porDia.has(dia)) porDia.set(dia, redondear((porDia.get(dia) ?? 0) + m.importe))
  }

  /*
   * La comida cuenta por la regla de la casa, que puede ser mas que lo gastado
   * (el sobre se reserva entero). Lo que sobra se reparte por los dias en que
   * de verdad se compro, para que la barra no de un salto raro.
   */
  const comidaContada = comidaQueCuenta(mes.presupuestoComida, comidaGastada, ajustes.comidaEnTotal)
  const factor = comidaGastada > 0 ? comidaContada / comidaGastada : 0
  for (const [dia, importe] of comidaPorDia) {
    porDia.set(dia, redondear((porDia.get(dia) ?? 0) + importe * factor))
  }
  if (comidaGastada === 0 && comidaContada !== 0 && dias.length > 0) {
    porDia.set(dias[0], redondear((porDia.get(dias[0]) ?? 0) + comidaContada))
  }

  let acumulado = 0
  const puntos = dias.map((dia) => {
    acumulado = redondear(acumulado + (porDia.get(dia) ?? 0))
    return {
      dia,
      extras: extrasPorDia.get(dia) ?? 0,
      acumulado: dentro && dia > hoy ? null : acumulado,
    }
  })

  // ---- los fijos ----
  const fijos = movimientos
    .filter((m) => m.tipo === 'fijo' && !m.esObjetivo)
    .map((m) => ({
      movimientoId: m.id,
      concepto: m.concepto,
      importe: m.importe,
      diaPrevisto: m.diaPrevisto,
      cobrado: m.cobrado,
      // Pendiente y su dia ya paso: es lo unico que pide atencion.
      tarde: !m.cobrado && yaPaso(m.diaPrevisto, hoy, dentro),
    }))
    // Por dia previsto, que es como se leen.
    .sort((a, b) => primerDia(a.diaPrevisto) - primerDia(b.diaPrevisto))

  const pendientes = fijos.filter((f) => !f.cobrado)

  // El concepto que mas pesa de los extras, para la frase del bloque.
  const totalExtras = redondear([...porConcepto.values()].reduce((t, c) => t + c.total, 0))
  const mayor = [...porConcepto.values()].sort((a, b) => b.total - a.total)[0] ?? null

  return {
    periodo: {
      desde,
      hasta,
      dias: dias.length,
      diaActual,
      diasQueQuedan,
      hoy: dentro ? hoy : null,
      /** true si sale del extracto; false si es el mes del calendario. */
      delExtracto: !!(mes.fechaInicio && mes.fechaFin),
    },
    puntos,
    gastado: acumulado,
    fijos,
    pendientes: pendientes.length,
    // Los dos primeros pendientes, para la frase "comunidad y luz aún no".
    nombresPendientes: pendientes.slice(0, 2).map((f) => f.concepto.toLowerCase()),
    extras: {
      total: totalExtras,
      mayor: mayor && totalExtras > 0
        ? { concepto: mayor.concepto, porcentaje: Math.round((mayor.total / totalExtras) * 100) }
        : null,
    },
    comida: {
      presupuesto: mes.presupuestoComida,
      gastado: comidaGastada,
      contada: comidaContada,
      sobreId: sobre?.id ?? null,
    },
  }
}

function primerDia(diaPrevisto) {
  const n = Number(String(diaPrevisto ?? '').split(/[^0-9]+/).filter(Boolean)[0])
  return Number.isFinite(n) && n > 0 ? n : 99
}

function yaPaso(diaPrevisto, hoy, dentro) {
  if (!dentro) return false
  const dia = primerDia(diaPrevisto)
  return dia < 99 && dia < Number(hoy.slice(8, 10))
}
