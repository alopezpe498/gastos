/**
 * Formato espanol para todo lo que se ve: 1.234,56 €, fechas dd/mm/aaaa y la
 * semana empezando en lunes.
 *
 * Los formateadores de Intl se crean una vez y se reutilizan: crear uno en cada
 * celda de la tabla anual seria caro y se nota.
 *
 * AGRUPAR no es opcional. El castellano, por defecto, NO separa los millares de
 * cuatro cifras: 3220 sale "3220,00" y 13220 sale "13.220,00". Uno debajo del
 * otro, en la misma columna, eso se lee fatal, y el Excel del que viene todo
 * esto siempre escribio "3.220,00 €".
 *
 * El cast es porque la libreria ES2022 de TypeScript todavia declara
 * useGrouping como booleano; el valor 'always' es ES2023 y los navegadores lo
 * entienden desde hace años.
 */
const AGRUPAR = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions

const MONEDA = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  ...AGRUPAR,
})

const MONEDA_REDONDA = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  ...AGRUPAR,
})

const NUMERO = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  ...AGRUPAR,
})

/** 1234.5 -> "1.234,50 €". Sin decimales si se pide (para cifras grandes). */
export function euros(valor: number | null | undefined, { redondo = false } = {}): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—'
  return redondo ? MONEDA_REDONDA.format(valor) : MONEDA.format(valor)
}

/** Sin el simbolo: para las celdas de una tabla donde el € se repetiria. */
export function numero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return ''
  return NUMERO.format(valor)
}

/** Con signo delante siempre: para el sobrante y las diferencias. */
export function conSigno(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—'
  return `${valor > 0 ? '+' : ''}${MONEDA.format(valor)}`
}

export function porcentaje(valor: number | null | undefined, decimales = 0): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—'
  return `${valor.toFixed(decimales).replace('.', ',')} %`
}

/**
 * Lee un importe tal como lo escribe una persona: "12,50", "1.234,56", "-500",
 * "12.5" o con el euro pegado. Devuelve null si no hay nada que leer, para que
 * quien llame decida si eso es un error o simplemente un campo vacio.
 */
export function leerImporte(texto: string): number | null {
  const limpio = texto.trim().replace(/[\s €]/g, '')
  if (!limpio) return null

  const ultimaComa = limpio.lastIndexOf(',')
  const ultimoPunto = limpio.lastIndexOf('.')
  let normalizado: string

  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    // Con los dos separadores, el ultimo que aparece es el decimal.
    const decimal = ultimaComa > ultimoPunto ? ',' : '.'
    const miles = decimal === ',' ? '.' : ','
    normalizado = limpio.split(miles).join('').replace(decimal, '.')
  } else if (ultimaComa >= 0) {
    // Solo coma: decimal, salvo que separe justo tres cifras ("1,234").
    normalizado = limpio.length - ultimaComa - 1 === 3 ? limpio.split(',').join('') : limpio.replace(',', '.')
  } else if (ultimoPunto >= 0 && limpio.length - ultimoPunto - 1 === 3) {
    // La misma regla al reves: en "3.220" el punto separa millares, no decimas.
    // Sin esto, borrarle los decimales a "3.220,00" dejaria 3,22 €.
    normalizado = limpio.split('.').join('')
  } else {
    normalizado = limpio
  }

  const n = Number(normalizado)
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null
}

/** Lo contrario: el valor que se mete en un campo de texto para editarlo. */
export function escribirImporte(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return ''
  return NUMERO.format(valor)
}

// ---------- fechas ----------

const FECHA_CORTA = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const FECHA_DIA_MES = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' })

function aFecha(iso: string): Date {
  // Se construye en local, no con new Date(iso), que interpreta UTC y puede
  // devolver el dia anterior segun la hora.
  const [anio, mes, dia] = iso.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

/** "2026-08-28" -> "28/08/2026". */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return ''
  return FECHA_CORTA.format(aFecha(iso))
}

/** "2026-08-28" -> "28 ago". Para las listas, donde el año sobra. */
/** Solo el día y el mes: "29/07". Para el periodo, donde el año se repite. */
export function fechaMuyCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [, mes, dia] = iso.split('-')
  return dia && mes ? `${dia}/${mes}` : '—'
}

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return ''
  return FECHA_DIA_MES.format(aFecha(iso)).replace('.', '')
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

export const MESES_CORTOS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
]

export function hoyIso(): string {
  const ahora = new Date()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${ahora.getFullYear()}-${mes}-${dia}`
}

/** Plural sin pensarlo: cuantos(1, 'apunte') -> "1 apunte". */
export function cuantos(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}
