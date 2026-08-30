/**
 * El color y el icono de cada concepto.
 *
 * Los dos cumplen lo mismo: que reconozcas Comida antes de leer la palabra. Y
 * los dos tienen que ser **estables** —el mismo concepto, el mismo color y el
 * mismo icono, siempre y en todas las pantallas— y **no repetirse** entre los
 * que más se usan, porque un color que llevan diez conceptos no dice nada.
 *
 * Comida tiene el suyo reservado, que es el único que el diseño da por sabido.
 * El resto se reparten por posición dentro del catálogo ordenado por `id`: el
 * id es lo único que no se mueve al renombrar ni al reordenar. Y por encima de
 * todo, lo que se elija a mano en Conceptos.
 */

export type Paleta = {
  /** El icono y el punto. */
  color: string
  /** El fondo del cuadradito del icono y de los chips. */
  suave: string
}

const COMIDA: Paleta = { color: 'var(--comida)', suave: 'var(--comida-suave)' }
const EXTRAS: Paleta = { color: 'var(--extras)', suave: 'var(--extras-suave)' }
const OK: Paleta = { color: 'var(--ok)', suave: 'var(--ok-suave)' }
const AMBAR: Paleta = { color: 'var(--ambar)', suave: 'var(--ambar-suave)' }
const AZUL: Paleta = { color: 'var(--azul)', suave: 'var(--azul-suave)' }
const ROSA: Paleta = { color: 'var(--rosa)', suave: 'var(--rosa-suave)' }
const NEUTRO: Paleta = { color: 'var(--tinta-2)', suave: 'var(--linea)' }

export const PALETAS: Record<string, Paleta> = {
  comida: COMIDA,
  extras: EXTRAS,
  ok: OK,
  ambar: AMBAR,
  azul: AZUL,
  rosa: ROSA,
  neutro: NEUTRO,
}

/** Los que se reparten solos. El neutro va el último: es el que menos pesa. */
const AUTOMATICOS = ['extras', 'ok', 'ambar', 'azul', 'rosa', 'neutro']

export const NOMBRES_COLOR = ['extras', 'ok', 'ambar', 'azul', 'rosa', 'comida', 'neutro'] as const

// ---------------------------------------------------------------------------
// Iconos
// ---------------------------------------------------------------------------

/**
 * El icono que le toca a un concepto por su nombre.
 *
 * Se busca la primera palabra clave que aparezca en el nombre normalizado. El
 * orden importa: «seguro coche» tiene que dar coche y no escudo, así que lo
 * más específico va primero.
 */
const POR_NOMBRE: [RegExp, string][] = [
  [/hipotec|alquiler|piso|casa|vivienda/, 'casa'],
  [/comida|mercadona|super|aliment/, 'comida'],
  [/restaurant|bar\b|cafeter|cerve/, 'bar'],
  [/luz|gas|agua|electric|ibi|sumin/, 'rayo'],
  [/telf|telefon|movil|fibra|digi|internet|telecom/, 'antena'],
  [/netflix|spotify|suscrip|prime|hbo|disney|cursor|openai|anthropic/, 'pantalla'],
  [/coche|gasolin|taller|itv|parking|aparca/, 'coche'],
  [/peaje|autopista|tunel/, 'flecha'],
  [/tren|metro|bus|taxi|viaje|vuelo|avion|hotel/, 'avion'],
  [/gimnas|deport|padel|futbol|piscina/, 'pesa'],
  [/farmac|medic|dentist|salud|optic/, 'cruz'],
  [/nin|colegi|escuela|guarder|extraescolar/, 'mochila'],
  [/gato|perro|veterinar|mascota/, 'huella'],
  [/amazon|compra|ropa|zapat|regalo|reyes/, 'carro'],
  [/ahorro|inversion|fondo|bote/, 'hucha'],
  [/nomina|ingreso|sueldo|paga/, 'entrada'],
  [/seguro/, 'escudo'],
  [/comunidad|vecin/, 'edificio'],
  [/loteria|quiniela|juego/, 'trebol'],
  [/banco|comision|cajero|efectivo/, 'billete'],
]

const NORMALIZAR = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** El icono adivinado por el nombre; «etiqueta» si no se parece a nada. */
export function iconoPorNombre(nombre: string): string {
  const limpio = NORMALIZAR(nombre)
  for (const [patron, icono] of POR_NOMBRE) {
    if (patron.test(limpio)) return icono
  }
  return 'etiqueta'
}

// ---------------------------------------------------------------------------
// El reparto
// ---------------------------------------------------------------------------

type Ficha = {
  id: number
  nombre?: string
  tipo?: string
  esObjetivo?: boolean
  color?: string | null
  icono?: string | null
}

/*
 * El reparto vive en el módulo y no en cada componente: si cada lista calculara
 * el suyo, la etiqueta de un movimiento y el punto del mismo concepto en
 * Conceptos podrían no coincidir, que es justo lo que rompe la idea.
 */
const asignados = new Map<number, Paleta>()

/**
 * Reparte los colores automáticos con el catálogo entero delante.
 *
 * Se llama cada vez que llega el catálogo. Los que tienen color a mano y el
 * sobre de la comida no entran en el reparto: no ocupan un turno, así que los
 * demás tardan más en repetirse.
 */
export function registrarConceptos(conceptos: Ficha[]): void {
  asignados.clear()
  const porRepartir = [...conceptos]
    .filter((c) => !c.color && c.tipo !== 'sobre')
    .sort((a, b) => a.id - b.id)

  porRepartir.forEach((concepto, indice) => {
    asignados.set(concepto.id, PALETAS[AUTOMATICOS[indice % AUTOMATICOS.length]])
  })
}

function deReserva(id: number): Paleta {
  return PALETAS[AUTOMATICOS[id % AUTOMATICOS.length]]
}

/** El color de un concepto. */
export function paletaDe(concepto: Ficha | null | undefined): Paleta {
  if (!concepto) return NEUTRO
  if (concepto.color && PALETAS[concepto.color]) return PALETAS[concepto.color]
  if (concepto.tipo === 'sobre') return COMIDA
  return asignados.get(concepto.id) ?? deReserva(concepto.id)
}

/** Igual, pero cuando solo se tiene el id (una fila de movimiento). */
export function paletaDeId(
  conceptoId: number | null | undefined,
  esSobre = false,
  color?: string | null,
): Paleta {
  if (color && PALETAS[color]) return PALETAS[color]
  if (esSobre) return COMIDA
  if (conceptoId === null || conceptoId === undefined) return NEUTRO
  return asignados.get(conceptoId) ?? deReserva(conceptoId)
}

/** El icono de un concepto: el elegido a mano, o el que le toca por su nombre. */
export function iconoDe(concepto: Ficha | null | undefined): string {
  if (!concepto) return 'etiqueta'
  return concepto.icono || iconoPorNombre(concepto.nombre ?? '')
}
