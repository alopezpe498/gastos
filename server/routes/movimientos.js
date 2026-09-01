import express from 'express'
import * as movimientosBd from '../db/movimientos.js'
import * as mesesBd from '../db/meses.js'
import * as conceptosBd from '../db/conceptos.js'
import { fallo, ruta, enteroDe, importeDe, textoDe } from '../lib/http.js'
import { hoy, esFechaIso } from '../lib/fechas.js'

export const rutasMovimientos = express.Router()

rutasMovimientos.post(
  '/',
  ruta((req, res) => {
    const mesId = enteroDe(req.body?.mesId)
    if (!mesId || !mesesBd.obtener(mesId)) return fallo(res, 404, 'Ese mes ya no existe.')

    const conceptoId = enteroDe(req.body?.conceptoId)
    const concepto = conceptoId ? conceptosBd.obtener(conceptoId) : null
    if (!concepto) return fallo(res, 400, 'Elige un concepto para el apunte.')

    const importe = importeDe(req.body?.importe)
    if (importe === null) return fallo(res, 400, 'El importe no se entiende.')

    const fechaCobro = req.body?.fechaCobro ?? hoy()
    if (fechaCobro !== null && !esFechaIso(fechaCobro)) {
      return fallo(res, 400, 'La fecha debe tener el formato AAAA-MM-DD.')
    }

    return res.status(201).json(
      movimientosBd.crear({
        mesId,
        conceptoId,
        importe,
        fechaCobro,
        descripcion: textoDe(req.body?.descripcion ?? '', { max: 200 }),
        origen: 'manual',
      }),
    )
  }),
)

rutasMovimientos.patch(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !movimientosBd.obtener(id)) return fallo(res, 404, 'Ese apunte ya no existe.')

    const cambios = {}

    if (req.body?.conceptoId !== undefined) {
      const conceptoId = enteroDe(req.body.conceptoId)
      if (!conceptoId || !conceptosBd.obtener(conceptoId)) {
        return fallo(res, 400, 'Ese concepto ya no existe.')
      }
      cambios.conceptoId = conceptoId
    }

    if (req.body?.importe !== undefined) {
      const importe = importeDe(req.body.importe)
      if (importe === null) return fallo(res, 400, 'El importe no se entiende.')
      cambios.importe = importe
    }

    if (req.body?.fechaCobro !== undefined) {
      if (req.body.fechaCobro !== null && !esFechaIso(req.body.fechaCobro)) {
        return fallo(res, 400, 'La fecha debe tener el formato AAAA-MM-DD.')
      }
      cambios.fechaCobro = req.body.fechaCobro
    }

    if (req.body?.diaPrevisto !== undefined) {
      cambios.diaPrevisto = textoDe(req.body.diaPrevisto, { max: 20 }) || null
    }

    if (req.body?.descripcion !== undefined) {
      cambios.descripcion = textoDe(req.body.descripcion, { max: 200 })
    }

    /*
     * El desglose de un fijo que agrupa varias cosas.
     *
     * Cuando hay desglose, el importe DEJA DE SER un dato suelto y pasa a ser la
     * suma de las lineas: si no, se pueden guardar unas suscripciones que suman
     * 60 en un movimiento que dice 45, y el mes cuadraria con el numero
     * equivocado. Una sola fuente de verdad.
     */
    if (req.body?.detalle !== undefined) {
      const lista = Array.isArray(req.body.detalle) ? req.body.detalle : []
      if (lista.length > 60) return fallo(res, 400, 'Son demasiadas lineas para un solo apunte.')

      const lineas = []
      for (const linea of lista) {
        const nombre = textoDe(linea?.nombre ?? '', { max: 80 })
        const importe = importeDe(linea?.importe)
        if (!nombre) return fallo(res, 400, 'Cada linea del desglose necesita un nombre.')
        if (importe === null) return fallo(res, 400, `El importe de "${nombre}" no se entiende.`)
        lineas.push({ nombre, importe })
      }

      cambios.detalle = lineas
      // El importe pasa a ser la suma; lo que venga en el cuerpo se ignora.
      if (lineas.length > 0) cambios.importe = movimientosBd.sumaDelDetalle(lineas)
    }

    return res.json(movimientosBd.actualizar(id, cambios))
  }),
)

/** Marcar un fijo como cobrado. Sin fecha, se pone la de hoy. */
rutasMovimientos.post(
  '/:id/cobro',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !movimientosBd.obtener(id)) return fallo(res, 404, 'Ese apunte ya no existe.')

    const fecha = req.body?.fecha ?? hoy()
    if (!esFechaIso(fecha)) return fallo(res, 400, 'La fecha debe tener el formato AAAA-MM-DD.')

    return res.json(movimientosBd.actualizar(id, { fechaCobro: fecha }))
  }),
)

/** Desmarcar: el fijo vuelve a estar pendiente. */
rutasMovimientos.delete(
  '/:id/cobro',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !movimientosBd.obtener(id)) return fallo(res, 404, 'Ese apunte ya no existe.')
    return res.json(movimientosBd.actualizar(id, { fechaCobro: null }))
  }),
)

rutasMovimientos.delete(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !movimientosBd.obtener(id)) return fallo(res, 404, 'Ese apunte ya no existe.')
    movimientosBd.borrar(id)
    return res.status(204).end()
  }),
)
