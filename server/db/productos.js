import { bd, normalizar } from './index.js'

/**
 * El catalogo de la compra: categorias, productos y variantes.
 *
 * Tres niveles porque son tres preguntas distintas, y mezclarlas es justo lo
 * que hace inutil un historial de tickets:
 *
 *   categoria  Carne y charcuteria   ->  en que se va la compra
 *   producto   Pollo                 ->  cuanto gasto en pollo
 *   variante   Pechuga de pollo      ->  que compro exactamente, y a como
 *
 * Lo que NO esta aqui: la marca no es un nivel. Va en un campo de la variante,
 * porque "Petit suisse" es lo mismo sea Nesquik o sea blanco, y solo separandola
 * se puede comparar el precio entre tiendas.
 */

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

function aCategoria(c) {
  return { id: c.id, nombre: c.nombre, orden: c.orden, activa: !!c.activa }
}

export function listarCategorias({ soloActivas = false } = {}) {
  const donde = soloActivas ? 'WHERE activa = 1' : ''
  return bd
    .prepare(`SELECT * FROM categorias_producto ${donde} ORDER BY orden ASC, id ASC`)
    .all()
    .map(aCategoria)
}

export function obtenerCategoria(id) {
  const c = bd.prepare('SELECT * FROM categorias_producto WHERE id = ?').get(id)
  return c ? aCategoria(c) : null
}

export function categoriaPorNombre(nombre) {
  const c = bd
    .prepare('SELECT * FROM categorias_producto WHERE normalizar_sql(nombre) = normalizar_sql(?)')
    .get(nombre)
  return c ? aCategoria(c) : null
}

export function crearCategoria({ nombre, orden = null }) {
  const siguiente =
    orden ??
    (bd.prepare('SELECT MAX(orden) AS m FROM categorias_producto').get().m ?? -1) + 1
  const { lastInsertRowid } = bd
    .prepare('INSERT INTO categorias_producto (nombre, orden, activa) VALUES (?, ?, 1)')
    .run(nombre, siguiente)
  return obtenerCategoria(lastInsertRowid)
}

export function actualizarCategoria(id, cambios) {
  const actual = obtenerCategoria(id)
  if (!actual) return null
  bd.prepare(
    'UPDATE categorias_producto SET nombre = @nombre, orden = @orden, activa = @activa WHERE id = @id',
  ).run({
    id,
    nombre: cambios.nombre ?? actual.nombre,
    orden: cambios.orden ?? actual.orden,
    activa: cambios.activa === undefined ? (actual.activa ? 1 : 0) : cambios.activa ? 1 : 0,
  })
  return obtenerCategoria(id)
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

function aProducto(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    categoriaId: p.categoria_id,
    categoria: p.categoria ?? null,
    activo: !!p.activo,
    idExternoDespensa: p.id_externo_despensa ?? null,
  }
}

const SELECCION_PRODUCTO = `
  SELECT p.*, c.nombre AS categoria
  FROM productos p
  JOIN categorias_producto c ON c.id = p.categoria_id`

export function listarProductos({ soloActivos = false, categoriaId = null } = {}) {
  const filtros = []
  if (soloActivos) filtros.push('p.activo = 1')
  if (categoriaId) filtros.push('p.categoria_id = @categoriaId')
  const donde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''
  return bd
    .prepare(`${SELECCION_PRODUCTO} ${donde} ORDER BY c.orden ASC, p.nombre ASC`)
    .all({ categoriaId })
    .map(aProducto)
}

export function obtenerProducto(id) {
  const p = bd.prepare(`${SELECCION_PRODUCTO} WHERE p.id = ?`).get(id)
  return p ? aProducto(p) : null
}

export function productoPorNombre(nombre) {
  const p = bd
    .prepare(`${SELECCION_PRODUCTO} WHERE normalizar_sql(p.nombre) = normalizar_sql(?)`)
    .get(nombre)
  return p ? aProducto(p) : null
}

export function crearProducto({ nombre, categoriaId }) {
  const { lastInsertRowid } = bd
    .prepare('INSERT INTO productos (nombre, categoria_id) VALUES (?, ?)')
    .run(nombre, categoriaId)
  return obtenerProducto(lastInsertRowid)
}

export function actualizarProducto(id, cambios) {
  const actual = obtenerProducto(id)
  if (!actual) return null
  /*
   * Mover un producto de categoria NO toca sus lineas: la categoria se saca por
   * relacion cada vez que se pregunta. Por eso reordenar el catalogo un martes
   * recalcula tambien el gasto del ano pasado, que es lo que se quiere.
   */
  bd.prepare(
    `UPDATE productos
     SET nombre = @nombre, categoria_id = @categoriaId, activo = @activo,
         id_externo_despensa = @idExterno
     WHERE id = @id`,
  ).run({
    id,
    nombre: cambios.nombre ?? actual.nombre,
    categoriaId: cambios.categoriaId ?? actual.categoriaId,
    activo: cambios.activo === undefined ? (actual.activo ? 1 : 0) : cambios.activo ? 1 : 0,
    idExterno:
      cambios.idExternoDespensa === undefined ? actual.idExternoDespensa : cambios.idExternoDespensa,
  })
  return obtenerProducto(id)
}

// ---------------------------------------------------------------------------
// Variantes
// ---------------------------------------------------------------------------

function aVariante(v) {
  return {
    id: v.id,
    productoId: v.producto_id,
    producto: v.producto ?? null,
    categoriaId: v.categoria_id ?? null,
    categoria: v.categoria ?? null,
    nombre: v.nombre,
    marca: v.marca ?? null,
    unidadHabitual: v.unidad_habitual,
    activa: !!v.activa,
  }
}

const SELECCION_VARIANTE = `
  SELECT v.*, p.nombre AS producto, p.categoria_id, c.nombre AS categoria
  FROM variantes v
  JOIN productos p ON p.id = v.producto_id
  JOIN categorias_producto c ON c.id = p.categoria_id`

export function listarVariantes({ soloActivas = false, productoId = null } = {}) {
  const filtros = []
  if (soloActivas) filtros.push('v.activa = 1')
  if (productoId) filtros.push('v.producto_id = @productoId')
  const donde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''
  return bd
    .prepare(`${SELECCION_VARIANTE} ${donde} ORDER BY p.nombre ASC, v.nombre ASC`)
    .all({ productoId })
    .map(aVariante)
}

export function obtenerVariante(id) {
  const v = bd.prepare(`${SELECCION_VARIANTE} WHERE v.id = ?`).get(id)
  return v ? aVariante(v) : null
}

export function crearVariante({ productoId, nombre, marca = null, unidadHabitual = 'ud' }) {
  const yaEsta = bd
    .prepare(
      `SELECT id FROM variantes
       WHERE producto_id = ? AND normalizar_sql(nombre) = normalizar_sql(?)
         AND IFNULL(normalizar_sql(marca), '') = IFNULL(normalizar_sql(?), '')`,
    )
    .get(productoId, nombre, marca)
  if (yaEsta) return obtenerVariante(yaEsta.id)

  const { lastInsertRowid } = bd
    .prepare(
      'INSERT INTO variantes (producto_id, nombre, marca, unidad_habitual) VALUES (?, ?, ?, ?)',
    )
    .run(productoId, nombre, marca || null, unidadHabitual)
  return obtenerVariante(lastInsertRowid)
}

export function actualizarVariante(id, cambios) {
  const actual = obtenerVariante(id)
  if (!actual) return null
  bd.prepare(
    `UPDATE variantes
     SET producto_id = @productoId, nombre = @nombre, marca = @marca,
         unidad_habitual = @unidad, activa = @activa
     WHERE id = @id`,
  ).run({
    id,
    productoId: cambios.productoId ?? actual.productoId,
    nombre: cambios.nombre ?? actual.nombre,
    marca: cambios.marca === undefined ? actual.marca : cambios.marca || null,
    unidad: cambios.unidadHabitual ?? actual.unidadHabitual,
    activa: cambios.activa === undefined ? (actual.activa ? 1 : 0) : cambios.activa ? 1 : 0,
  })
  return obtenerVariante(id)
}

/**
 * Funde dos productos en uno: las variantes, y con ellas todo el historial, se
 * quedan colgando del que sobrevive.
 *
 * Las lineas de ticket NO se tocan: apuntan a la variante, y la variante es la
 * que cambia de padre. Un historial que se reescribe es un historial en el que
 * ya no se puede confiar.
 */
export const fusionarProductos = bd.transaction((idQueSeVa, idQueSeQueda) => {
  const seVa = obtenerProducto(idQueSeVa)
  const seQueda = obtenerProducto(idQueSeQueda)
  if (!seVa || !seQueda || idQueSeVa === idQueSeQueda) return null

  const variantes = listarVariantes({ productoId: idQueSeVa })
  for (const variante of variantes) {
    /*
     * Si el que se queda ya tiene una variante que se llama igual, las dos son
     * la misma cosa: se reapuntan sus lineas y sus alias, y la duplicada se va.
     */
    const gemela = bd
      .prepare(
        `SELECT id FROM variantes
         WHERE producto_id = ? AND normalizar_sql(nombre) = normalizar_sql(?)
           AND IFNULL(normalizar_sql(marca), '') = IFNULL(normalizar_sql(?), '')`,
      )
      .get(idQueSeQueda, variante.nombre, variante.marca)

    if (gemela) {
      bd.prepare('UPDATE lineas_ticket SET variante_id = ? WHERE variante_id = ?').run(
        gemela.id,
        variante.id,
      )
      bd.prepare('UPDATE OR IGNORE alias_ticket SET variante_id = ? WHERE variante_id = ?').run(
        gemela.id,
        variante.id,
      )
      bd.prepare('DELETE FROM alias_ticket WHERE variante_id = ?').run(variante.id)
      bd.prepare('DELETE FROM variantes WHERE id = ?').run(variante.id)
    } else {
      bd.prepare('UPDATE variantes SET producto_id = ? WHERE id = ?').run(
        idQueSeQueda,
        variante.id,
      )
    }
  }

  bd.prepare('DELETE FROM productos WHERE id = ?').run(idQueSeVa)
  return { seQueda: obtenerProducto(idQueSeQueda), variantesMovidas: variantes.length }
})

// ---------------------------------------------------------------------------
// Alias: como se llama esa cosa en el ticket
// ---------------------------------------------------------------------------

/** Tal cual sale impreso, en mayusculas y sin acentos: asi se compara. */
export function textoDeAlias(texto) {
  return normalizar(texto).toUpperCase()
}

function aAlias(a) {
  return {
    id: a.id,
    textoTicket: a.texto_ticket,
    tienda: a.tienda ?? null,
    varianteId: a.variante_id,
    variante: a.variante ?? null,
    producto: a.producto ?? null,
    vecesVisto: a.veces_visto,
    confirmado: !!a.confirmado_por_usuario,
  }
}

const SELECCION_ALIAS = `
  SELECT a.*, v.nombre AS variante, p.nombre AS producto
  FROM alias_ticket a
  JOIN variantes v ON v.id = a.variante_id
  JOIN productos p ON p.id = v.producto_id`

/**
 * El alias que le toca a un texto de ticket.
 *
 * Gana el de la misma tienda sobre el generico: "PIT" no significa lo mismo en
 * Mercadona que en una carniceria. Y entre dos, gana el confirmado: lo que he
 * dicho yo pesa mas que lo que propuso una vez la IA.
 */
export function aliasDe(texto, tienda = null) {
  const clave = textoDeAlias(texto)
  const candidatos = bd
    .prepare(`${SELECCION_ALIAS} WHERE a.texto_ticket = ?`)
    .all(clave)
    .map(aAlias)
  if (candidatos.length === 0) return null

  const deLaTienda = candidatos.filter(
    (a) => a.tienda && tienda && textoDeAlias(a.tienda) === textoDeAlias(tienda),
  )
  const genericos = candidatos.filter((a) => !a.tienda)
  const porOrden = [
    ...deLaTienda.filter((a) => a.confirmado),
    ...genericos.filter((a) => a.confirmado),
    ...deLaTienda.filter((a) => !a.confirmado),
    ...genericos.filter((a) => !a.confirmado),
  ]
  return porOrden[0] ?? null
}

export function listarAlias({ varianteId = null } = {}) {
  const donde = varianteId ? 'WHERE a.variante_id = @varianteId' : ''
  return bd
    .prepare(`${SELECCION_ALIAS} ${donde} ORDER BY a.veces_visto DESC, a.texto_ticket ASC`)
    .all({ varianteId })
    .map(aAlias)
}

/**
 * Guarda —o refresca— la memoria de un texto.
 *
 * `confirmado` solo lo pone quien pulsa "Recordar". Lo que propone la IA se
 * guarda SIN confirmar a proposito: la siguiente vez sale ya escrito, pero
 * sigue pidiendo un vistazo. Un acierto que nadie ha mirado no debe volverse
 * permanente por su cuenta.
 */
export function guardarAlias({ texto, tienda = null, varianteId, confirmado = false }) {
  const clave = textoDeAlias(texto)
  if (!clave || !varianteId) return null

  const existente = bd
    .prepare('SELECT * FROM alias_ticket WHERE texto_ticket = ? AND IFNULL(tienda, ?) = ?')
    .get(clave, tienda ?? '', tienda ?? '')

  if (existente) {
    bd.prepare(
      `UPDATE alias_ticket
       SET variante_id = @varianteId,
           veces_visto = veces_visto + 1,
           confirmado_por_usuario = MAX(confirmado_por_usuario, @confirmado)
       WHERE id = @id`,
    ).run({ id: existente.id, varianteId, confirmado: confirmado ? 1 : 0 })
    return aAlias(bd.prepare(`${SELECCION_ALIAS} WHERE a.id = ?`).get(existente.id))
  }

  const { lastInsertRowid } = bd
    .prepare(
      `INSERT INTO alias_ticket (texto_ticket, tienda, variante_id, veces_visto, confirmado_por_usuario)
       VALUES (?, ?, ?, 1, ?)`,
    )
    .run(clave, tienda || null, varianteId, confirmado ? 1 : 0)
  return aAlias(bd.prepare(`${SELECCION_ALIAS} WHERE a.id = ?`).get(lastInsertRowid))
}

export function borrarAlias(id) {
  bd.prepare('DELETE FROM alias_ticket WHERE id = ?').run(id)
}
