import express from 'express'
import * as conceptosBd from '../db/conceptos.js'
import * as plantillaBd from '../db/plantilla.js'
import { fallo, ruta, enteroDe, textoDe, importeDe } from '../lib/http.js'
import { claveMes } from '../lib/fechas.js'

export const rutasConceptos = express.Router()

const TIPOS = new Set(conceptosBd.TIPOS)
const CLASIFICACIONES = new Set(conceptosBd.CLASIFICACIONES)

/** Un concepto con su previsto actual y sus alias: lo que pinta la pantalla. */
function conDetalle(concepto) {
  const historico = plantillaBd.historico(concepto.id)
  return {
    ...concepto,
    plantilla: historico,
    previstoActual: historico[0] ?? null,
    alias: conceptosBd.alias(concepto.id),
    movimientos: conceptosBd.cuentaMovimientos(concepto.id),
  }
}

rutasConceptos.get(
  '/',
  ruta((req, res) => {
    const tipo = req.query.tipo ? String(req.query.tipo) : null
    if (tipo && !TIPOS.has(tipo)) return fallo(res, 400, `No existe el tipo "${tipo}".`)
    const lista = conceptosBd.listar({ soloActivos: req.query.activos === '1', tipo })
    // El detalle solo se monta si lo piden: la lista para un desplegable no lo
    // necesita y seria una consulta por concepto para nada.
    return res.json(req.query.detalle === '1' ? lista.map(conDetalle) : lista)
  }),
)

rutasConceptos.post(
  '/',
  ruta((req, res) => {
    const nombre = textoDe(req.body?.nombre ?? '', { max: 60 })
    if (!nombre) return fallo(res, 400, 'El concepto necesita un nombre.')
    if (conceptosBd.buscarPorNombre(nombre)) {
      return fallo(res, 400, `Ya existe un concepto llamado "${nombre}".`)
    }

    const tipo = req.body?.tipo ?? 'variable'
    if (!TIPOS.has(tipo)) return fallo(res, 400, `No existe el tipo "${tipo}".`)

    const clasificacion = req.body?.clasificacion ?? 'prescindible'
    if (!CLASIFICACIONES.has(clasificacion)) {
      return fallo(res, 400, `No existe la clasificacion "${clasificacion}".`)
    }

    const concepto = conceptosBd.crear({ nombre, tipo, clasificacion })

    // Un fijo sin previsto no sirve de nada al abrir el mes siguiente, asi que
    // se le crea la entrada de plantilla desde el primer momento.
    if (tipo === 'fijo' || tipo === 'sobre') {
      const ahora = new Date()
      plantillaBd.guardar(concepto.id, {
        diaPrevisto: textoDe(req.body?.diaPrevisto ?? '', { max: 20 }) || null,
        importePrevisto: importeDe(req.body?.importePrevisto) ?? 0,
        vigenteDesde: req.body?.vigenteDesde ?? claveMes(ahora.getFullYear(), ahora.getMonth() + 1),
      })
    }

    return res.status(201).json(conDetalle(concepto))
  }),
)

rutasConceptos.put(
  '/orden',
  ruta((req, res) => {
    const { ids } = req.body ?? {}
    if (!Array.isArray(ids)) return fallo(res, 400, 'Faltan los conceptos a reordenar.')
    return res.json(conceptosBd.reordenar(ids.map(Number).filter(Boolean)))
  }),
)

rutasConceptos.patch(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const actual = id ? conceptosBd.obtener(id) : null
    if (!actual) return fallo(res, 404, 'Ese concepto ya no existe.')

    const cambios = {}

    if (req.body?.nombre !== undefined) {
      const nombre = textoDe(req.body.nombre, { max: 60 })
      if (!nombre) return fallo(res, 400, 'El concepto necesita un nombre.')
      const otro = conceptosBd.buscarPorNombre(nombre)
      if (otro && otro.id !== id) {
        return fallo(res, 400, `Ya existe un concepto llamado "${nombre}".`)
      }
      cambios.nombre = nombre
    }

    if (req.body?.tipo !== undefined) {
      if (!TIPOS.has(req.body.tipo)) return fallo(res, 400, `No existe el tipo "${req.body.tipo}".`)
      cambios.tipo = req.body.tipo
    }

    if (req.body?.clasificacion !== undefined) {
      if (!CLASIFICACIONES.has(req.body.clasificacion)) {
        return fallo(res, 400, `No existe la clasificacion "${req.body.clasificacion}".`)
      }
      cambios.clasificacion = req.body.clasificacion
    }

    if (req.body?.activo !== undefined) cambios.activo = !!req.body.activo
    if (req.body?.esObjetivo !== undefined) cambios.esObjetivo = !!req.body.esObjetivo

    return res.json(conDetalle(conceptosBd.actualizar(id, cambios)))
  }),
)

rutasConceptos.delete(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const concepto = id ? conceptosBd.obtener(id) : null
    if (!concepto) return fallo(res, 404, 'Ese concepto ya no existe.')

    // Borrar un concepto con historia se llevaria por delante meses cerrados.
    // En ese caso se desactiva: deja de ofrecerse, pero el pasado no cambia.
    const cuantos = conceptosBd.cuentaMovimientos(id)
    if (cuantos > 0) {
      return fallo(
        res,
        409,
        `"${concepto.nombre}" tiene ${cuantos} ${cuantos === 1 ? 'apunte' : 'apuntes'}. ` +
          'Desactivalo en vez de borrarlo para no tocar los meses ya cerrados.',
      )
    }

    conceptosBd.borrar(id)
    return res.status(204).end()
  }),
)

// ---------- plantilla de un fijo ----------

rutasConceptos.get(
  '/:id/plantilla',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !conceptosBd.obtener(id)) return fallo(res, 404, 'Ese concepto ya no existe.')
    return res.json(plantillaBd.historico(id))
  }),
)

rutasConceptos.post(
  '/:id/plantilla',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const concepto = id ? conceptosBd.obtener(id) : null
    if (!concepto) return fallo(res, 404, 'Ese concepto ya no existe.')
    if (concepto.tipo === 'variable') {
      return fallo(res, 400, 'Los conceptos variables no tienen importe previsto.')
    }

    const vigenteDesde = String(req.body?.vigenteDesde ?? '')
    if (!/^\d{4}-\d{2}$/.test(vigenteDesde)) {
      return fallo(res, 400, 'Falta el mes desde el que vale el nuevo importe (AAAA-MM).')
    }

    const importe = importeDe(req.body?.importePrevisto)
    if (importe === null) return fallo(res, 400, 'El importe previsto no se entiende.')

    return res.json(
      plantillaBd.guardar(id, {
        diaPrevisto: textoDe(req.body?.diaPrevisto ?? '', { max: 20 }) || null,
        importePrevisto: importe,
        vigenteDesde,
      }),
    )
  }),
)

rutasConceptos.delete(
  '/:id/plantilla/:entradaId',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const entradaId = enteroDe(req.params.entradaId)
    if (!id || !entradaId) return fallo(res, 404, 'Esa entrada ya no existe.')

    const historico = plantillaBd.historico(id)
    if (historico.length <= 1) {
      return fallo(res, 400, 'Un fijo necesita al menos un importe previsto.')
    }
    if (!historico.some((e) => e.id === entradaId)) {
      return fallo(res, 404, 'Esa entrada ya no existe.')
    }

    plantillaBd.borrarEntrada(entradaId)
    return res.json(plantillaBd.historico(id))
  }),
)

// ---------- alias ----------

rutasConceptos.post(
  '/:id/alias',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !conceptosBd.obtener(id)) return fallo(res, 404, 'Ese concepto ya no existe.')
    const texto = textoDe(req.body?.alias ?? '', { max: 60 })
    if (!texto) return fallo(res, 400, 'El alias no puede estar vacio.')
    return res.json(conceptosBd.anadirAlias(id, texto))
  }),
)

rutasConceptos.delete(
  '/:id/alias/:aliasId',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const aliasId = enteroDe(req.params.aliasId)
    if (!id || !aliasId) return fallo(res, 404, 'Ese alias ya no existe.')
    conceptosBd.borrarAlias(aliasId)
    return res.json(conceptosBd.alias(id))
  }),
)
