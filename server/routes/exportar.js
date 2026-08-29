import express from 'express'
import * as mesesBd from '../db/meses.js'
import { aExcel, aJson } from '../services/exportacion.js'
import { fallo, ruta } from '../lib/http.js'
import { aIso } from '../lib/fechas.js'

export const rutasExportar = express.Router()

rutasExportar.get(
  '/json',
  ruta((req, res) => {
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('content-disposition', `attachment; filename="gastos-${aIso(new Date())}.json"`)
    return res.send(JSON.stringify(aJson(), null, 2))
  }),
)

rutasExportar.get(
  '/excel',
  ruta(async (req, res) => {
    // Sin año se exportan todos, cada uno en su hoja, como en el libro original.
    const pedido = req.query.anio ? Number(req.query.anio) : null
    const anios = pedido ? [pedido] : mesesBd.anios()

    if (anios.length === 0) return fallo(res, 404, 'Todavia no hay ningun mes que exportar.')
    if (pedido && mesesBd.delAnio(pedido).length === 0) {
      return fallo(res, 404, `No hay ningun mes de ${pedido}.`)
    }

    // De mas antiguo a mas reciente, que es como estan en el libro de siempre.
    const buffer = await aExcel([...anios].sort((a, b) => a - b))
    const nombre = pedido ? `Cuentas${pedido}.xlsx` : `gastos-${aIso(new Date())}.xlsx`

    res.setHeader(
      'content-type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    res.setHeader('content-disposition', `attachment; filename="${nombre}"`)
    return res.send(buffer)
  }),
)
