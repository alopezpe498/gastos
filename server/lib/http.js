/** Todas las respuestas de error de la API tienen la forma { error: "..." }. */
export function fallo(res, codigo, mensaje) {
  return res.status(codigo).json({ error: mensaje })
}

/** Envuelve un manejador async para que los rechazos lleguen al middleware de errores. */
export function ruta(manejador) {
  return (req, res, siguiente) => Promise.resolve(manejador(req, res, siguiente)).catch(siguiente)
}

/** Entero positivo, o null si no lo es. Para ids de la URL. */
export function enteroDe(valor) {
  const n = Number(valor)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function textoDe(valor, { max = 200 } = {}) {
  if (typeof valor !== 'string') return ''
  return valor.trim().slice(0, max)
}

/**
 * Importe monetario. Acepta numero o texto en formato espanol ("1.234,56") o
 * ingles ("1234.56"), y admite negativos: una devolucion es un gasto negativo.
 * Devuelve null si no hay forma de leer un numero.
 */
export function importeDe(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? redondear(valor) : null
  if (typeof valor !== 'string') return null

  const limpio = valor.trim().replace(/[\s\u00a0€]/g, '')
  if (!limpio) return null

  // Si hay coma y punto, el ultimo separador que aparece es el decimal.
  const ultimaComa = limpio.lastIndexOf(',')
  const ultimoPunto = limpio.lastIndexOf('.')
  let normalizado
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    const decimal = ultimaComa > ultimoPunto ? ',' : '.'
    const miles = decimal === ',' ? '.' : ','
    normalizado = limpio.split(miles).join('').replace(decimal, '.')
  } else if (ultimaComa >= 0) {
    // Solo coma: decimal salvo que separe grupos de tres ("1,234").
    const decimales = limpio.length - ultimaComa - 1
    normalizado = decimales === 3 ? limpio.split(',').join('') : limpio.replace(',', '.')
  } else {
    normalizado = limpio
  }

  const n = Number(normalizado)
  return Number.isFinite(n) ? redondear(n) : null
}

/** Los importes se guardan siempre con dos decimales: es dinero, no fisica. */
export function redondear(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
