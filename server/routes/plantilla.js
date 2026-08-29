import express from 'express'
import * as plantillaServicio from '../services/plantilla.js'
import * as plantillaBd from '../db/plantilla.js'
import * as conceptosBd from '../db/conceptos.js'
import * as configBd from '../db/config.js'
import { fallo, ruta, importeDe } from '../lib/http.js'

export const rutasPlantilla = express.Router()

/**
 * La plantilla vista desde un mes.
 *
 * Sin `desde`, el mes que viene: es lo que casi siempre se quiere tocar, porque
 * el mes en curso ya esta generado y cambiarle la plantilla no lo mueve (para
 * eso esta "Regenerar desde la plantilla" en el menu del mes).
 */
rutasPlantilla.get(
  '/',
  ruta((req, res) => {
    const desde = req.query.desde ? String(req.query.desde) : plantillaServicio.mesPorDefecto()
    const datos = plantillaServicio.verDesde(desde)
    if (!datos) return fallo(res, 400, 'Ese mes no se entiende (hace falta AAAA-MM).')
    return res.json(datos)
  }),
)

/**
 * Los valores del mes: la nomina prevista, el presupuesto de comida y el
 * objetivo de ahorro.
 *
 * Los dos ultimos son conceptos y van al historico de la plantilla, con su
 * `desde`, igual que un fijo. La nomina no es un concepto y vive en los
 * ajustes: mandar `null` la borra y vuelve a heredarse del mes anterior.
 */
rutasPlantilla.put(
  '/valores',
  ruta((req, res) => {
    const desde = String(req.body?.desde ?? '')
    const partido = plantillaServicio.partirClave(desde)
    if (!partido) {
      return fallo(res, 400, 'Falta el mes desde el que valen los valores (AAAA-MM).')
    }

    if (req.body?.ingresoPrevisto !== undefined) {
      const crudo = req.body.ingresoPrevisto
      if (crudo === null || String(crudo).trim() === '') {
        configBd.guardarIngresoPrevisto(null)
      } else {
        const importe = importeDe(crudo)
        if (importe === null) return fallo(res, 400, 'La nómina prevista no se entiende.')
        configBd.guardarIngresoPrevisto(importe)
      }
    }

    // Cada uno se guarda contra su propio concepto: si no existe, se ignora en
    // vez de fallar, porque una instalacion puede no tener sobre ni objetivo.
    const porConcepto = [
      ['presupuestoComida', conceptosBd.sobrePrincipal()],
      ['objetivoAhorro', conceptosBd.conceptoObjetivo()],
    ]
    for (const [campo, concepto] of porConcepto) {
      if (req.body?.[campo] === undefined || !concepto) continue
      const importe = importeDe(req.body[campo])
      if (importe === null) {
        return fallo(res, 400, `El importe de "${concepto.nombre}" no se entiende.`)
      }
      // El dia previsto no se toca: se arrastra el que ya tuviera.
      const vigente = plantillaBd.vigenteEn(concepto.id, partido.anio, partido.mes)
      plantillaBd.guardar(concepto.id, {
        diaPrevisto: vigente?.diaPrevisto ?? null,
        importePrevisto: importe,
        vigenteDesde: desde,
      })
    }

    return res.json(plantillaServicio.verDesde(desde))
  }),
)
