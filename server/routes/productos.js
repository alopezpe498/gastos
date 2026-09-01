import express from 'express'
import * as productosBd from '../db/productos.js'
import { fallo, ruta, enteroDe, textoDe } from '../lib/http.js'

/**
 * El catalogo de la compra: categorias, productos, variantes y alias.
 *
 * Nada de aqui borra historial. Fusionar dos productos reapunta las variantes
 * —y con ellas las lineas— al que sobrevive, y mover un producto de categoria
 * no toca ninguna linea: la categoria se saca por relacion cada vez que se
 * pregunta, asi que reordenar el catalogo hoy recalcula tambien el ano pasado.
 */
export const rutasProductos = express.Router()
export const rutasCategoriasProducto = express.Router()

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

rutasCategoriasProducto.get(
  '/',
  ruta((req, res) => {
    const soloActivas = req.query.activas === '1'
    return res.json(productosBd.listarCategorias({ soloActivas }))
  }),
)

rutasCategoriasProducto.post(
  '/',
  ruta((req, res) => {
    const nombre = textoDe(req.body?.nombre ?? '', { max: 60 })
    if (!nombre) return fallo(res, 400, 'La categoría necesita un nombre.')
    if (productosBd.categoriaPorNombre(nombre)) {
      return fallo(res, 400, `Ya hay una categoría que se llama "${nombre}".`)
    }
    return res.status(201).json(productosBd.crearCategoria({ nombre }))
  }),
)

rutasCategoriasProducto.patch(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !productosBd.obtenerCategoria(id)) return fallo(res, 404, 'Esa categoría no existe.')

    const cambios = {}
    if (req.body?.nombre !== undefined) {
      const nombre = textoDe(req.body.nombre, { max: 60 })
      if (!nombre) return fallo(res, 400, 'La categoría necesita un nombre.')
      const otra = productosBd.categoriaPorNombre(nombre)
      if (otra && otra.id !== id) return fallo(res, 400, `Ya hay una categoría "${nombre}".`)
      cambios.nombre = nombre
    }
    if (req.body?.orden !== undefined) cambios.orden = enteroDe(req.body.orden) ?? 0
    if (req.body?.activa !== undefined) cambios.activa = !!req.body.activa

    return res.json(productosBd.actualizarCategoria(id, cambios))
  }),
)

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

rutasProductos.get(
  '/',
  ruta((req, res) => {
    const soloActivos = req.query.activos === '1'
    const categoriaId = req.query.categoria ? enteroDe(req.query.categoria) : null
    const productos = productosBd.listarProductos({ soloActivos, categoriaId })

    // Con `variantes=1` se devuelve el arbol entero: es lo que pinta el catalogo.
    if (req.query.variantes === '1') {
      const todas = productosBd.listarVariantes({})
      return res.json(
        productos.map((p) => ({
          ...p,
          variantes: todas.filter((v) => v.productoId === p.id),
        })),
      )
    }
    return res.json(productos)
  }),
)

rutasProductos.post(
  '/',
  ruta((req, res) => {
    const nombre = textoDe(req.body?.nombre ?? '', { max: 80 })
    const categoriaId = enteroDe(req.body?.categoriaId)
    if (!nombre) return fallo(res, 400, 'El producto necesita un nombre.')
    if (!categoriaId || !productosBd.obtenerCategoria(categoriaId)) {
      return fallo(res, 400, 'Falta la categoría del producto.')
    }
    const repetido = productosBd.productoPorNombre(nombre)
    if (repetido) return fallo(res, 400, `Ya hay un producto que se llama "${nombre}".`)

    return res.status(201).json(productosBd.crearProducto({ nombre, categoriaId }))
  }),
)

/** Funde dos productos duplicados. El que se queda hereda todo el historial. */
rutasProductos.post(
  '/fusionar',
  ruta((req, res) => {
    const seVa = enteroDe(req.body?.seVa)
    const seQueda = enteroDe(req.body?.seQueda)
    if (!seVa || !seQueda) return fallo(res, 400, 'Faltan los dos productos que fusionar.')
    if (seVa === seQueda) return fallo(res, 400, 'Son el mismo producto.')
    if (!productosBd.obtenerProducto(seVa) || !productosBd.obtenerProducto(seQueda)) {
      return fallo(res, 404, 'Alguno de los dos productos ya no existe.')
    }
    return res.json(productosBd.fusionarProductos(seVa, seQueda))
  }),
)

// ---------------------------------------------------------------------------
// Variantes
// ---------------------------------------------------------------------------

rutasProductos.get(
  '/variantes',
  ruta((req, res) => {
    const productoId = req.query.producto ? enteroDe(req.query.producto) : null
    return res.json(productosBd.listarVariantes({ productoId, soloActivas: req.query.activas === '1' }))
  }),
)

rutasProductos.post(
  '/variantes',
  ruta((req, res) => {
    const productoId = enteroDe(req.body?.productoId)
    const nombre = textoDe(req.body?.nombre ?? '', { max: 120 })
    if (!nombre) return fallo(res, 400, 'La variante necesita un nombre.')
    if (!productoId || !productosBd.obtenerProducto(productoId)) {
      return fallo(res, 400, 'Falta el producto al que pertenece.')
    }
    const unidad = ['ud', 'kg', 'l'].includes(req.body?.unidadHabitual)
      ? req.body.unidadHabitual
      : 'ud'

    return res.status(201).json(
      productosBd.crearVariante({
        productoId,
        nombre,
        marca: textoDe(req.body?.marca ?? '', { max: 80 }) || null,
        unidadHabitual: unidad,
      }),
    )
  }),
)

rutasProductos.patch(
  '/variantes/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !productosBd.obtenerVariante(id)) return fallo(res, 404, 'Esa variante no existe.')

    const cambios = {}
    if (req.body?.nombre !== undefined) {
      const nombre = textoDe(req.body.nombre, { max: 120 })
      if (!nombre) return fallo(res, 400, 'La variante necesita un nombre.')
      cambios.nombre = nombre
    }
    if (req.body?.productoId !== undefined) {
      const productoId = enteroDe(req.body.productoId)
      if (!productoId || !productosBd.obtenerProducto(productoId)) {
        return fallo(res, 400, 'Ese producto no existe.')
      }
      cambios.productoId = productoId
    }
    if (req.body?.marca !== undefined) cambios.marca = textoDe(req.body.marca, { max: 80 })
    if (req.body?.unidadHabitual !== undefined) {
      if (!['ud', 'kg', 'l'].includes(req.body.unidadHabitual)) {
        return fallo(res, 400, 'La unidad tiene que ser ud, kg o l.')
      }
      cambios.unidadHabitual = req.body.unidadHabitual
    }
    if (req.body?.activa !== undefined) cambios.activa = !!req.body.activa

    return res.json(productosBd.actualizarVariante(id, cambios))
  }),
)

// ---------------------------------------------------------------------------
// Alias
// ---------------------------------------------------------------------------

rutasProductos.get(
  '/alias',
  ruta((req, res) => {
    const varianteId = req.query.variante ? enteroDe(req.query.variante) : null
    return res.json(productosBd.listarAlias({ varianteId }))
  }),
)

rutasProductos.delete(
  '/alias/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id) return fallo(res, 404, 'Ese alias no existe.')
    productosBd.borrarAlias(id)
    return res.status(204).end()
  }),
)

/*
 * OJO CON EL ORDEN: este va el ultimo. Con /:id delante, Express haria casar
 * /productos/variantes con id = "variantes".
 */
rutasProductos.patch(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !productosBd.obtenerProducto(id)) return fallo(res, 404, 'Ese producto no existe.')

    const cambios = {}
    if (req.body?.nombre !== undefined) {
      const nombre = textoDe(req.body.nombre, { max: 80 })
      if (!nombre) return fallo(res, 400, 'El producto necesita un nombre.')
      const otro = productosBd.productoPorNombre(nombre)
      if (otro && otro.id !== id) return fallo(res, 400, `Ya hay un producto "${nombre}".`)
      cambios.nombre = nombre
    }
    if (req.body?.categoriaId !== undefined) {
      const categoriaId = enteroDe(req.body.categoriaId)
      if (!categoriaId || !productosBd.obtenerCategoria(categoriaId)) {
        return fallo(res, 400, 'Esa categoría no existe.')
      }
      cambios.categoriaId = categoriaId
    }
    if (req.body?.activo !== undefined) cambios.activo = !!req.body.activo
    if (req.body?.idExternoDespensa !== undefined) {
      cambios.idExternoDespensa = textoDe(req.body.idExternoDespensa, { max: 80 }) || null
    }

    return res.json(productosBd.actualizarProducto(id, cambios))
  }),
)
