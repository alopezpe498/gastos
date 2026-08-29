import express from 'express'
import { bd } from '../db/index.js'
import * as conceptosBd from '../db/conceptos.js'
import * as mesesBd from '../db/meses.js'
import * as analitica from '../services/analitica.js'
import { fallo, ruta, enteroDe } from '../lib/http.js'
import { claveMes } from '../lib/fechas.js'

export const rutasAnalitica = express.Router()

/** Todas las vistas comparten el mismo rango; se resuelve una vez, aquí. */
function rangoDe(req, res) {
  const rango = analitica.resolverRango({
    desde: req.query.desde,
    hasta: req.query.hasta,
    anio: req.query.anio ? Number(req.query.anio) : null,
    ultimos: req.query.ultimos ? Number(req.query.ultimos) : null,
  })
  if (!rango) {
    fallo(res, 404, 'Todavia no hay ningun mes con datos.')
    return null
  }
  return rango
}

const comoClave = (numero) => `${Math.floor(numero / 100)}-${String(numero % 100).padStart(2, '0')}`

/** Qué hay disponible: para montar el selector de rango sin adivinar. */
rutasAnalitica.get(
  '/rango',
  ruta((req, res) => {
    const limites = bd
      .prepare('SELECT MIN(anio * 100 + mes) AS min, MAX(anio * 100 + mes) AS max FROM meses')
      .get()

    // Aunque no haya ni un mes abierto, el catálogo y las agrupaciones existen:
    // la pantalla los necesita para montar su desplegable.
    return res.json({
      primero: limites?.min ? comoClave(limites.min) : null,
      ultimo: limites?.max ? comoClave(limites.max) : null,
      anios: mesesBd.anios(),
      // El desplegable de "qué mirar": las agrupaciones primero y luego el
      // catálogo, que es como se busca.
      agrupaciones: Object.entries(analitica.AGRUPACIONES).map(([clave, nombre]) => ({
        clave,
        nombre,
      })),
      conceptos: conceptosBd.listar().map((c) => ({
        clave: `concepto:${c.id}`,
        id: c.id,
        nombre: c.nombre,
        tipo: c.tipo,
        activo: c.activo,
      })),
    })
  }),
)

rutasAnalitica.get(
  '/serie',
  ruta((req, res) => {
    const rango = rangoDe(req, res)
    if (!rango) return undefined

    const clave = String(req.query.clave ?? 'gastos')
    if (clave.startsWith('concepto:')) {
      const id = enteroDe(clave.slice(9))
      if (!id || !conceptosBd.obtener(id)) return fallo(res, 404, 'Ese concepto ya no existe.')
    } else if (!analitica.AGRUPACIONES[clave]) {
      return fallo(res, 400, `No se sabe qué es "${clave}".`)
    }

    return res.json({
      rango: { desde: comoClave(rango.desde), hasta: comoClave(rango.hasta) },
      ...analitica.serie({ clave, rango }),
    })
  }),
)

rutasAnalitica.get(
  '/comparativa',
  ruta((req, res) => {
    const disponibles = mesesBd.anios()
    if (disponibles.length === 0) return fallo(res, 404, 'Todavia no hay ningun año con datos.')

    const crudos = String(req.query.anios ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
    const pedidos = crudos
      .map((a) => Number(a))
      .filter((a) => Number.isInteger(a) && disponibles.includes(a))

    // Si se han pedido años y ninguno tiene datos, se dice; resolverlo en
    // silencio con otros años enseñaria una comparación que nadie ha pedido.
    if (crudos.length > 0 && pedidos.length === 0) {
      return fallo(
        res,
        400,
        `No hay datos de ${crudos.join(', ')}. Años disponibles: ${disponibles.join(', ')}.`,
      )
    }

    // Sin nada pedido, los dos ultimos años: es la comparacion que se hace.
    const anios = pedidos.length > 0 ? [...new Set(pedidos)].slice(0, 4) : disponibles.slice(0, 2)

    const hastaMes = req.query.hastaMes ? Number(req.query.hastaMes) : null
    return res.json(analitica.comparativa({ anios, hastaMes }))
  }),
)

rutasAnalitica.get(
  '/reparto',
  ruta((req, res) => {
    const rango = rangoDe(req, res)
    if (!rango) return undefined
    return res.json({
      rango: { desde: comoClave(rango.desde), hasta: comoClave(rango.hasta) },
      ...analitica.reparto({ rango }),
    })
  }),
)

rutasAnalitica.get(
  '/estacionalidad',
  ruta((req, res) => {
    const rango = rangoDe(req, res)
    if (!rango) return undefined
    return res.json({
      rango: { desde: comoClave(rango.desde), hasta: comoClave(rango.hasta) },
      ...analitica.estacionalidad({ rango }),
    })
  }),
)

rutasAnalitica.get(
  '/ahorro',
  ruta((req, res) => {
    const rango = rangoDe(req, res)
    if (!rango) return undefined
    return res.json({
      rango: { desde: comoClave(rango.desde), hasta: comoClave(rango.hasta) },
      ...analitica.ahorro({ rango }),
    })
  }),
)

/** Lo que necesitan las pantallas del mes y del análisis para dar contexto. */
rutasAnalitica.get(
  '/contexto/:mesId',
  ruta((req, res) => {
    const mesId = enteroDe(req.params.mesId)
    const contexto = mesId ? analitica.contextoDeMes(mesId) : null
    if (!contexto) return fallo(res, 404, 'Ese mes ya no existe.')
    return res.json(contexto)
  }),
)

/** Total de un año por concepto: lo usa la columna "año anterior" del anual. */
rutasAnalitica.get(
  '/anual/:anio',
  ruta((req, res) => {
    const anio = enteroDe(req.params.anio)
    if (!anio) return fallo(res, 400, 'Ese año no se entiende.')
    if (mesesBd.delAnio(anio).length === 0) {
      return res.json({ anio, totales: {}, meses: 0 })
    }
    const datos = analitica.comparativa({ anios: [anio] })
    return res.json({
      anio,
      meses: datos.totales[anio]?.meses ?? 0,
      totales: Object.fromEntries(datos.filas.map((f) => [f.clave, f.totales[anio] ?? null])),
      generales: datos.totales[anio] ?? null,
      desde: claveMes(anio, 1),
    })
  }),
)
