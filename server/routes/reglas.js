import express from 'express'
import * as reglasBd from '../db/reglas.js'
import * as conceptosBd from '../db/conceptos.js'
import { probar, proponerTexto, cuantosEncajan, olvidarCache } from '../services/reglas.js'
import { fallo, ruta, enteroDe, textoDe } from '../lib/http.js'

export const rutasReglas = express.Router()

const TIPOS = new Set(['fijo', 'sobre', 'variable', 'manual'])
const COINCIDENCIAS = new Set(['empieza', 'exacta', 'regex'])
const ESTADOS = new Set(['confirmada', 'propuesta'])

/**
 * Comprueba lo que llega y lo deja listo para guardar. Devuelve un mensaje de
 * error, o null si todo esta bien.
 */
function revisar(cuerpo, { exigirTexto = true } = {}) {
  const limpio = {}

  if (cuerpo.texto !== undefined || exigirTexto) {
    const texto = textoDe(cuerpo.texto ?? '', { max: 60 })
    if (!texto) return { error: 'La regla necesita un texto que buscar.' }
    if (texto.length < 2) return { error: 'Un texto de una sola letra encajaria en casi todo.' }
    limpio.texto = texto
  }

  if (cuerpo.conceptoId !== undefined) {
    // null a proposito: la regla reconoce el movimiento y lo manda a revision.
    if (cuerpo.conceptoId === null || cuerpo.conceptoId === '') {
      limpio.conceptoId = null
    } else {
      const id = enteroDe(cuerpo.conceptoId)
      const concepto = id ? conceptosBd.obtener(id) : null
      if (!concepto) return { error: 'Ese concepto ya no existe.' }
      limpio.conceptoId = id
    }
  }

  if (cuerpo.tipo !== undefined) {
    if (!TIPOS.has(cuerpo.tipo)) return { error: `No existe el tipo "${cuerpo.tipo}".` }
    limpio.tipo = cuerpo.tipo
  }
  if (cuerpo.coincidencia !== undefined) {
    if (!COINCIDENCIAS.has(cuerpo.coincidencia)) {
      return { error: 'La coincidencia solo puede ser "empieza", "exacta" o "regex".' }
    }
    // Una expresion regular mal escrita se rechaza aqui y no al importar.
    if (cuerpo.coincidencia === 'regex') {
      try {
        new RegExp(String(cuerpo.texto ?? ''))
      } catch {
        return { error: 'Esa expresión regular no se entiende.' }
      }
    }
    limpio.coincidencia = cuerpo.coincidencia
  }
  if (cuerpo.estado !== undefined) {
    if (!ESTADOS.has(cuerpo.estado)) return { error: `No existe el estado "${cuerpo.estado}".` }
    limpio.estado = cuerpo.estado
  }
  if (cuerpo.activa !== undefined) limpio.activa = !!cuerpo.activa

  return { limpio }
}

rutasReglas.get(
  '/',
  ruta((req, res) =>
    res.json(
      reglasBd.listar({
        soloActivas: req.query.activas === '1',
        estado: req.query.estado ? String(req.query.estado) : null,
      }),
    ),
  ),
)

/*
 * OJO CON EL ORDEN: /probar, /orden, /exportar e /importar van antes que
 * /:id. Con /:id delante, Express haria casar /reglas/probar con id = "probar".
 */

/** Pega una descripcion del banco y di que regla gana, y cuales se han mirado. */
rutasReglas.post(
  '/probar',
  ruta((req, res) => {
    const descripcion = textoDe(req.body?.descripcion ?? '', { max: 300 })
    if (!descripcion) return fallo(res, 400, 'Pega una descripción para probarla.')

    const propuesta = proponerTexto(descripcion)
    /*
     * Cuantas descripciones encajarian con la regla propuesta. El cliente manda
     * las del extracto que esta revisando: una regla que solo pilla la linea
     * que tienes delante quiza no merezca la pena, y una que pilla ocho si.
     */
    const contra = Array.isArray(req.body?.contra) ? req.body.contra.map(String) : []
    return res.json({
      ...probar(descripcion),
      propuesta,
      encajarian: propuesta.texto ? cuantosEncajan(propuesta, contra) : 0,
    })
  }),
)

rutasReglas.put(
  '/orden',
  ruta((req, res) => {
    const { ids } = req.body ?? {}
    if (!Array.isArray(ids)) return fallo(res, 400, 'Faltan las reglas a reordenar.')
    olvidarCache()
    return res.json(reglasBd.reordenar(ids.map(Number).filter(Boolean)))
  }),
)

/** Copia de seguridad de las reglas, para llevarlas de una maquina a otra. */
rutasReglas.get(
  '/exportar',
  ruta((req, res) => {
    const reglas = reglasBd.listar().map((r) => ({
      texto: r.texto,
      concepto: r.concepto,
      tipo: r.tipo,
      coincidencia: r.coincidencia,
      estado: r.estado,
      activa: r.activa,
      origen: r.origen,
    }))
    res.setHeader('Content-Disposition', 'attachment; filename="reglas-gastos.json"')
    return res.json({ version: 1, fecha: new Date().toISOString(), reglas })
  }),
)

/**
 * Carga reglas de un JSON. Los conceptos se buscan POR NOMBRE, no por id: los
 * ids de otra instalacion no significan nada aqui.
 */
rutasReglas.post(
  '/importar',
  ruta((req, res) => {
    const entrada = Array.isArray(req.body?.reglas) ? req.body.reglas : null
    if (!entrada) return fallo(res, 400, 'El archivo no trae ninguna regla.')

    const anadidas = []
    const repetidas = []
    const sinConcepto = []

    for (const cruda of entrada) {
      const texto = textoDe(cruda?.texto ?? '', { max: 60 })
      if (!texto || texto.length < 2) continue
      if (reglasBd.buscarPorTexto(texto)) {
        repetidas.push(texto)
        continue
      }
      const concepto = cruda?.concepto ? conceptosBd.buscarPorNombre(cruda.concepto) : null
      if (cruda?.concepto && !concepto) {
        sinConcepto.push(`${texto} → ${cruda.concepto}`)
        continue
      }
      reglasBd.crear({
        texto,
        conceptoId: concepto?.id ?? null,
        tipo: TIPOS.has(cruda?.tipo) ? cruda.tipo : (concepto?.tipo ?? 'variable'),
        coincidencia: COINCIDENCIAS.has(cruda?.coincidencia) ? cruda.coincidencia : 'empieza',
        estado: ESTADOS.has(cruda?.estado) ? cruda.estado : 'confirmada',
        activa: cruda?.activa !== false,
        origen: 'usuario',
      })
      anadidas.push(texto)
    }

    olvidarCache()
    return res.json({ anadidas, repetidas, sinConcepto, reglas: reglasBd.listar() })
  }),
)

rutasReglas.post(
  '/',
  ruta((req, res) => {
    const { error, limpio } = revisar(req.body ?? {})
    if (error) return fallo(res, 400, error)
    if (reglasBd.buscarPorTexto(limpio.texto)) {
      return fallo(res, 400, `Ya hay una regla para "${limpio.texto}".`)
    }
    // Sin concepto solo tiene sentido si la regla es de las que mandan a
    // revision; si no, seria una regla que no hace nada.
    const tipo = limpio.tipo ?? (limpio.conceptoId ? 'variable' : 'manual')
    olvidarCache()
    return res.status(201).json(reglasBd.crear({ ...limpio, tipo }))
  }),
)

rutasReglas.patch(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const actual = id ? reglasBd.obtener(id) : null
    if (!actual) return fallo(res, 404, 'Esa regla ya no existe.')

    const { error, limpio } = revisar(req.body ?? {}, { exigirTexto: false })
    if (error) return fallo(res, 400, error)

    if (limpio.texto && limpio.texto !== actual.texto) {
      const otra = reglasBd.buscarPorTexto(limpio.texto)
      if (otra && otra.id !== id) return fallo(res, 400, `Ya hay una regla para "${limpio.texto}".`)
    }

    olvidarCache()
    return res.json(reglasBd.actualizar(id, limpio))
  }),
)

rutasReglas.delete(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !reglasBd.obtener(id)) return fallo(res, 404, 'Esa regla ya no existe.')
    reglasBd.borrar(id)
    olvidarCache()
    return res.status(204).end()
  }),
)
