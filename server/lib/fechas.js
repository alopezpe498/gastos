/**
 * Fechas de la aplicacion, siempre en horario local y en formato ISO corto
 * (AAAA-MM-DD). Nada de UTC: un cobro del dia 1 a las 00:30 no puede aparecer
 * como del ultimo dia del mes anterior.
 */

export function hoy() {
  return aIso(new Date())
}

export function aIso(fecha) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

export function ahora() {
  return new Date().toISOString()
}

/** Clave de un mes: 'AAAA-MM'. Es lo que usa plantilla_fijos.vigente_desde. */
export function claveMes(anio, mes) {
  return `${anio}-${String(mes).padStart(2, '0')}`
}

export function mesSiguiente(anio, mes) {
  return mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 }
}

export function mesAnterior(anio, mes) {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 }
}

export const NOMBRES_MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

export function diasDelMes(anio, mes) {
  return new Date(anio, mes, 0).getDate()
}

/**
 * Fecha de un dia concreto dentro de un mes. El dia previsto es texto libre y
 * puede traer varios ("30,13,23"): se toma el primero. Si se pasa del final del
 * mes, se recorta al ultimo dia; si no hay nada legible, cae en el dia 1.
 */
export function fechaDelDiaPrevisto(anio, mes, diaPrevisto) {
  const primero = String(diaPrevisto ?? '').match(/\d{1,2}/)
  const dia = primero ? Math.min(Math.max(Number(primero[0]), 1), diasDelMes(anio, mes)) : 1
  return `${claveMes(anio, mes)}-${String(dia).padStart(2, '0')}`
}

/** Numero de orden de un dia previsto, para ordenar la tabla de fijos. */
export function ordenDelDiaPrevisto(diaPrevisto) {
  const primero = String(diaPrevisto ?? '').match(/\d{1,2}/)
  // Los que no tienen dia se van al final, no al principio.
  return primero ? Number(primero[0]) : 99
}

export function esFechaIso(valor) {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
}
