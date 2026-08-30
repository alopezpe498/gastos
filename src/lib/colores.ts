/**
 * El color de cada concepto.
 *
 * Es lo que hace que el diseño funcione: se reconoce Comida por el coral antes
 * de leer la palabra. Por eso el color tiene que cumplir tres cosas, en este
 * orden:
 *
 *   1. **Estable.** El mismo concepto, el mismo color, siempre y en todas las
 *      pantallas. No puede depender del orden en que lleguen los datos ni de
 *      cómo esté ordenado el catálogo ese día.
 *   2. **Sin repetir entre los que más se usan.** Si Amazon y Extras salen del
 *      mismo lavanda, el color deja de decir nada. Por eso el reparto no es un
 *      `id % n` —que choca en cuanto hay más conceptos que colores— sino un
 *      reparto por posición, que solo repite cuando de verdad se acaban.
 *   3. **Con excepciones fijas.** Comida es coral y el ahorro es azul porque
 *      tienen bloque propio en la pantalla Mes, y ahí el color ya está dicho.
 *
 * Y por encima de todo, lo que se elija a mano en Conceptos.
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
/* Cuatro más, para que los conceptos que más se usan no compartan tinta. */
const TURQUESA: Paleta = { color: '#12A8A0', suave: '#D5F2F0', texto: '#0A6360' }
const ROSA: Paleta = { color: '#D6478E', suave: '#FBE0EE', texto: '#8C2358' }
const OLIVA: Paleta = { color: '#8A9A2B', suave: '#EDF2CF', texto: '#4E5814' }
const TIERRA: Paleta = { color: '#A9722F', suave: '#F5E6D3', texto: '#6A4517' }

/** Por nombre, que es como se guarda en la base de datos. */
export const PALETAS: Record<string, Paleta> = {
  lavanda: LAVANDA,
  ambar: AMBAR,
  verde: VERDE,
  gris: GRIS,
  coral: CORAL,
  azul: AZUL,
  turquesa: TURQUESA,
  rosa: ROSA,
  oliva: OLIVA,
  tierra: TIERRA,
}

/** El orden en que se ofrecen al elegir a mano. */
export const NOMBRES_COLOR = [
  'lavanda',
  'ambar',
  'verde',
  'turquesa',
  'rosa',
  'oliva',
  'tierra',
  'azul',
  'coral',
  'gris',
] as const

/**
 * Los que se reparten solos, en orden. El gris va el último a propósito: es el
 * que menos se nota, así que le toca a los conceptos que menos pesan.
 */
const AUTOMATICOS = ['lavanda', 'ambar', 'verde', 'turquesa', 'rosa', 'oliva', 'tierra', 'gris']

type Ficha = { id: number; tipo?: string; esObjetivo?: boolean; color?: string | null }

/*
 * El reparto vive aquí, en el módulo, y no en cada componente: si cada lista
 * calculara el suyo, la etiqueta de un movimiento y el punto del mismo concepto
 * en Conceptos podrían no coincidir, que es justo lo que rompe la idea.
 */
const asignados = new Map<number, Paleta>()

/**
 * Reparte los colores automáticos a partir del catálogo completo.
 *
 * Se llama cada vez que llega el catálogo. El orden es por `id` y no por el
 * campo `orden` para que arrastrar un concepto en la lista no le cambie el
 * color a él ni a los demás: el id es lo único que no se mueve nunca.
 */
export function registrarConceptos(conceptos: Ficha[]): void {
  asignados.clear()
  const porRepartir = [...conceptos]
    .filter((c) => !c.color && c.tipo !== 'sobre' && !c.esObjetivo)
    .sort((a, b) => a.id - b.id)

  porRepartir.forEach((concepto, indice) => {
    asignados.set(concepto.id, PALETAS[AUTOMATICOS[indice % AUTOMATICOS.length]])
  })
}

/**
 * El color de un concepto.
 *
 * Si el catálogo aún no ha llegado se cae a un reparto por `id`: no es tan
 * bueno, pero es estable y no deja nada sin pintar mientras carga.
 */
export function paletaDe(concepto: Ficha | null): Paleta {
  if (!concepto) return GRIS
  // Lo que se ha elegido a mano manda sobre todo lo demás.
  if (concepto.color && PALETAS[concepto.color]) return PALETAS[concepto.color]
  if (concepto.tipo === 'sobre') return CORAL
  if (concepto.esObjetivo) return AZUL
  return asignados.get(concepto.id) ?? deReserva(concepto.id)
}

/**
 * Igual, pero cuando solo se tiene el id (una fila de movimiento).
 *
 * `color` viene del catálogo cuando quien pinta lo tiene a mano; si no, se usa
 * el reparto que ya está hecho.
 */
export function paletaDeId(
  conceptoId: number | null,
  esSobre = false,
  color?: string | null,
): Paleta {
  if (color && PALETAS[color]) return PALETAS[color]
  if (esSobre) return CORAL
  if (conceptoId === null) return GRIS
  return asignados.get(conceptoId) ?? deReserva(conceptoId)
}

function deReserva(id: number): Paleta {
  return PALETAS[AUTOMATICOS[id % AUTOMATICOS.length]]
}
