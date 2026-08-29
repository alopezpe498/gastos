import express from 'express'
import * as mesesBd from '../db/meses.js'
import * as movimientosBd from '../db/movimientos.js'
import * as conceptosBd from '../db/conceptos.js'
import * as configBd from '../db/config.js'
import { matrizAnual } from '../services/calculos.js'
import { fallo, ruta, enteroDe } from '../lib/http.js'

export const rutasAnual = express.Router()

/** Años con datos, para el selector. */
rutasAnual.get(
  '/',
  ruta((req, res) => res.json(mesesBd.anios())),
)

rutasAnual.get(
  '/:anio',
  ruta((req, res) => {
    const anio = enteroDe(req.params.anio)
    if (!anio) return fallo(res, 400, 'Ese año no se entiende.')

    const meses = mesesBd.delAnio(anio)
    if (meses.length === 0) return fallo(res, 404, `No hay ningun mes abierto de ${anio}.`)

    return res.json(
      matrizAnual({
        anio,
        meses,
        movimientos: movimientosBd.delAnioConMes(anio),
        conceptos: conceptosBd.listar(),
        ajustes: configBd.ajustes(),
      }),
    )
  }),
)
