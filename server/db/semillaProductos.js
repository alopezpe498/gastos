import { bd } from './index.js'

/**
 * Las catorce categorias con las que nace el catalogo de la compra.
 *
 * Son las que se distinguen mirando un ticket del super sin pensarlo: cuando
 * hay que pararse a decidir si algo es "Despensa" o "Conservas", la categoria
 * sobra. Incluyen lo que no es comida —limpieza, higiene, mascotas— porque se
 * compra en el mismo sitio y sale del mismo sobre.
 *
 * Se pueden renombrar, desactivar y ampliar desde la aplicacion: esto es solo
 * el punto de partida para no empezar con una lista vacia.
 */
const CATEGORIAS = [
  'Fruta',
  'Verdura y hortalizas',
  'Carne y charcutería',
  'Pescado y marisco',
  'Lácteos y huevos',
  'Panadería y bollería',
  'Despensa',
  'Congelados',
  'Platos preparados y snacks',
  'Bebidas',
  'Limpieza',
  'Higiene y cuidado personal',
  'Mascotas',
  'Otros',
]

/** El cajon de sastre: es donde va a parar lo que no se quiere decidir hoy. */
export const CATEGORIA_OTROS = 'Otros'
export const PRODUCTO_OTROS = 'Otros'

/**
 * Crea las categorias que falten. Idempotente: se llama en cada arranque y no
 * pisa nada de lo que haya, ni resucita lo que se haya desactivado a mano.
 */
export function sembrarCategorias() {
  const insertar = bd.prepare(
    'INSERT OR IGNORE INTO categorias_producto (nombre, orden, activa) VALUES (?, ?, 1)',
  )
  const enUnaVez = bd.transaction(() => {
    CATEGORIAS.forEach((nombre, indice) => insertar.run(nombre, indice))
  })
  enUnaVez()

  /*
   * Y un producto "Otros" dentro de "Otros", con su variante.
   *
   * Hace falta que exista desde el primer momento: es donde cae el boton "lo
   * que quede, a Otros" de la revision, que es lo que permite guardar un ticket
   * de cuarenta y cinco lineas sin tener que decidirlas todas hoy.
   */
  const categoria = bd
    .prepare('SELECT id FROM categorias_producto WHERE nombre = ?')
    .get(CATEGORIA_OTROS)
  if (!categoria) return

  bd.prepare('INSERT OR IGNORE INTO productos (nombre, categoria_id) VALUES (?, ?)').run(
    PRODUCTO_OTROS,
    categoria.id,
  )
  const producto = bd.prepare('SELECT id FROM productos WHERE nombre = ?').get(PRODUCTO_OTROS)
  if (!producto) return

  bd.prepare(
    "INSERT OR IGNORE INTO variantes (producto_id, nombre, marca, unidad_habitual) VALUES (?, 'Sin clasificar', NULL, 'ud')",
  ).run(producto.id)
}

/** La variante donde cae lo que no se ha querido clasificar. */
export function varianteOtros() {
  return bd
    .prepare(
      `SELECT v.id FROM variantes v
       JOIN productos p ON p.id = v.producto_id
       WHERE p.nombre = ? AND v.nombre = 'Sin clasificar'`,
    )
    .get(PRODUCTO_OTROS)
}
