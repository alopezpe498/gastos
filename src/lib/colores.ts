/**
 * El color de cada concepto.
 *
 * Es lo que hace que el diseño funcione: se reconoce Comida por el coral antes
 * de leer la palabra. Por eso el color tiene que ser **estable** —el mismo
 * concepto, el mismo color, siempre y en todas las pantallas— y no puede
 * depender del orden en que lleguen los datos.
 *
 * Comida es coral y el ahorro es azul porque tienen sitio propio en el diseño.
 * El resto se reparten los colores secundarios por su id, que no cambia nunca.
 */

export type Paleta = {
  /** El punto y las barras. */
  color: string
  /** El fondo de la etiqueta. */
  suave: string
  /** El texto de la etiqueta. */
  texto: string
}

const LAVANDA: Paleta = { color: '#6C5CE7', suave: '#EEEBFF', texto: '#4B3BC4' }
const AMBAR: Paleta = { color: '#F5A623', suave: '#FFF1D6', texto: '#8A5A00' }
const VERDE: Paleta = { color: '#2FBF71', suave: '#DFF5E7', texto: '#1E6B3A' }
const GRIS: Paleta = { color: '#999999', suave: '#F1F1F1', texto: '#444444' }
const CORAL: Paleta = { color: '#FF6B4A', suave: '#FFD9CF', texto: '#8A3A22' }
const AZUL: Paleta = { color: '#4B7BD4', suave: '#D7E8FF', texto: '#1F4C99' }

/** Los cuatro que se reparten los conceptos variables, en orden fijo. */
const SECUNDARIOS = [LAVANDA, AMBAR, VERDE, GRIS]

/** Por nombre, que es como se guarda en la base de datos. */
export const PALETAS: Record<string, Paleta> = {
  lavanda: LAVANDA,
  ambar: AMBAR,
  verde: VERDE,
  gris: GRIS,
  coral: CORAL,
  azul: AZUL,
}

/** El orden en que se ofrecen al elegir. */
export const NOMBRES_COLOR = ['lavanda', 'ambar', 'verde', 'gris', 'coral', 'azul'] as const

/**
 * El color de un concepto.
 *
 * `id` es la clave: es lo único que no cambia cuando se renombra un concepto o
 * se reordena el catálogo. El sobre de la comida y el objetivo de ahorro tienen
 * su color reservado porque el diseño les da un bloque propio.
 */
export function paletaDe(
  concepto: { id: number; tipo?: string; esObjetivo?: boolean; color?: string | null } | null,
): Paleta {
  if (!concepto) return GRIS
  // Lo que se ha elegido a mano manda sobre todo lo demás.
  if (concepto.color && PALETAS[concepto.color]) return PALETAS[concepto.color]
  if (concepto.tipo === 'sobre') return CORAL
  if (concepto.esObjetivo) return AZUL
  return SECUNDARIOS[concepto.id % SECUNDARIOS.length]
}

/**
 * Igual, pero cuando solo se tiene el id (una fila de movimiento).
 *
 * `color` viene del catálogo cuando quien pinta lo tiene a mano; si no, se cae
 * al reparto por id, que es estable y no necesita consultar nada.
 */
export function paletaDeId(
  conceptoId: number | null,
  esSobre = false,
  color?: string | null,
): Paleta {
  if (color && PALETAS[color]) return PALETAS[color]
  if (esSobre) return CORAL
  if (conceptoId === null) return GRIS
  return SECUNDARIOS[conceptoId % SECUNDARIOS.length]
}
