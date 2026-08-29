import * as movimientosBd from '../db/movimientos.js'
import * as conceptosBd from '../db/conceptos.js'
import { comidaQueCuenta } from './calculos.js'
import { diasDelMes } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

/**
 * Los datos de la cinta del mes.
 *
 * La cinta es el dibujo que preside la pantalla del mes: una línea de nómina a
 * nómina con los recibos clavados en su día y el gasto acumulado creciendo por
 * debajo. Es lo único de la aplicación que se ve de un vistazo sin leer una
 * sola cifra: si el área va por encima de la línea de puntos, se va rápido.
 *
 * Esto SOLO LEE. No cambia ningún calculo: el gasto de cada dia sale de los
 * mismos movimientos que el resumen, y la comida sigue la regla de siempre
 * (comidaQueCuenta), repartida por los dias en que se compro.
 */

const soloFecha = (iso) => String(iso ?? '').slice(0, 10)

/** Todos los dias entre dos fechas, ambas incluidas. */
function diasEntre(desde, hasta) {
  const dias = []
  const fin = new Date(`${hasta}T00:00:00Z`)
  for (let d = new Date(`${desde}T00:00:00Z`); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(d.toISOString().slice(0, 10))
  }
  return dias
}

export function cinta(mes, ajustes) {
  const movimientos = movimientosBd.delMes(mes.id)
  const sobre = conceptosBd.sobrePrincipal()

  /*
   * El periodo. Si el mes se ha importado de un extracto, va de la nomina a la
   * siguiente y lo dice el propio mes. Si no, el mes del calendario, que es lo
   * unico que se sabe.
   */
  const delCalendario = {
    desde: `${mes.anio}-${String(mes.mes).padStart(2, '0')}-01`,
    hasta: `${mes.anio}-${String(mes.mes).padStart(2, '0')}-${String(diasDelMes(mes.anio, mes.mes)).padStart(2, '0')}`,
  }
  const desde = mes.fechaInicio || delCalendario.desde
  const hasta = mes.fechaFin || delCalendario.hasta
  const dias = diasEntre(desde, hasta)

  const hoy = new Date().toISOString().slice(0, 10)
  const hoyDentro = hoy >= desde && hoy <= hasta

  // ---- el gasto de cada dia ----
  const porDia = new Map(dias.map((d) => [d, 0]))
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
    // Un fijo pendiente todavia no se ha pagado: no cuenta en el acumulado.
    if (m.tipo === 'fijo' && !m.cobrado) continue
    if (porDia.has(dia)) porDia.set(dia, redondear((porDia.get(dia) ?? 0) + m.importe))
  }

  /*
   * La comida cuenta por la regla de la casa, que puede ser mas que lo gastado
   * (el sobre se reserva entero). Lo que sobra de la regla se reparte por los
   * dias en que de verdad se compro, para que el area no de un salto raro.
   */
  const comidaContada = comidaQueCuenta(mes.presupuestoComida, comidaGastada, ajustes.comidaEnTotal)
  const factor = comidaGastada > 0 ? comidaContada / comidaGastada : 0
  for (const [dia, importe] of comidaPorDia) {
    porDia.set(dia, redondear((porDia.get(dia) ?? 0) + importe * factor))
  }
  // Si no se ha comprado nada pero el sobre cuenta igual, se pone el primer dia.
  if (comidaGastada === 0 && comidaContada !== 0 && dias.length > 0) {
    porDia.set(dias[0], redondear((porDia.get(dias[0]) ?? 0) + comidaContada))
  }

  let acumulado = 0
  const puntos = dias.map((dia) => {
    acumulado = redondear(acumulado + (porDia.get(dia) ?? 0))
    return {
      dia,
      gasto: porDia.get(dia) ?? 0,
      // El acumulado se corta en hoy: dibujar el futuro seria inventarselo.
      acumulado: hoyDentro && dia > hoy ? null : acumulado,
    }
  })

  // ---- los fijos, clavados en su dia previsto ----
  const marcas = []
  for (const m of movimientos) {
    if (m.tipo !== 'fijo' || m.esObjetivo) continue

    // El dia previsto es texto y admite varios ("30,13,23"); vale el primero.
    const primerDia = Number(String(m.diaPrevisto ?? '').split(/[^0-9]+/).filter(Boolean)[0])
    const dia = m.cobrado
      ? soloFecha(m.fechaCobro)
      : diaDelPeriodo(primerDia, dias) ?? null

    marcas.push({
      movimientoId: m.id,
      concepto: m.concepto,
      importe: m.importe,
      dia,
      /*
       *   'cobrado'   ya esta pagado: marca rellena.
       *   'pendiente' aun no toca: marca hueca.
       *   'pasado'    pendiente y su dia ya paso: marca en rojo. Es lo unico
       *               rojo que puede aparecer aqui, y significa "mira esto".
       */
      estado: m.cobrado ? 'cobrado' : dia && hoyDentro && dia < hoy ? 'pasado' : 'pendiente',
    })
  }

  return {
    desde,
    hasta,
    dias: dias.length,
    hoy: hoyDentro ? hoy : null,
    // Cuantos dias van del periodo: "dia 12 de 29".
    diaActual: hoyDentro ? dias.indexOf(hoy) + 1 : null,
    /** Del propio extracto, o del calendario si el mes no se ha importado. */
    esDelExtracto: !!(mes.fechaInicio && mes.fechaFin),
    puntos,
    marcas: marcas.filter((m) => m.dia),
    total: acumulado,
    ingreso: mes.ingreso,
  }
}

/** El dia N del periodo, que no tiene por que ser el dia N del calendario. */
function diaDelPeriodo(numeroDeDia, dias) {
  if (!numeroDeDia) return null
  return dias.find((d) => Number(d.slice(8, 10)) === numeroDeDia) ?? null
}
