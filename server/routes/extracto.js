import express from 'express'
import * as mesesBd from '../db/meses.js'
import * as formatosBd from '../db/formatosBanco.js'
import * as importacionesBd from '../db/importaciones.js'
import * as conceptosBd from '../db/conceptos.js'
import { leerExtracto } from '../services/lecturaExtracto.js'
import {
  clasificar,
  huellasAceptadas,
  contar,
  conceptosFrecuentes,
} from '../services/clasificacionExtracto.js'
import { aceptar, deshacer, validar, previsualizar, ErrorAplicacion } from '../services/aplicarExtracto.js'
import { sugerirParaExtracto } from '../services/iaExtracto.js'
import * as configBd from '../db/config.js'
import { fallo, ruta, enteroDe, textoDe } from '../lib/http.js'

export const rutasExtracto = express.Router()

/** El archivo llega en base64 dentro del JSON, como en el resto de la casa. */
function bufferDe(req) {
  const base64 = req.body?.archivo
  if (typeof base64 !== 'string' || !base64) return null
  const limpio = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const buffer = Buffer.from(limpio, 'base64')
  return buffer.length > 0 ? buffer : null
}

function mesDe(req) {
  const id = enteroDe(req.body?.mesId)
  return id ? mesesBd.obtener(id) : null
}

/*
 * OJO CON EL ORDEN: /historial y /leer van antes que /:id. Con /:id delante,
 * Express haria casar /extracto/historial con id = "historial".
 */

/** El formato que se va a usar, y los que hay guardados. */
rutasExtracto.get(
  '/formatos',
  ruta((req, res) => res.json({ formatos: formatosBd.listar(), porDefecto: formatosBd.porDefecto() })),
)

rutasExtracto.patch(
  '/formatos/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !formatosBd.obtener(id)) return fallo(res, 404, 'Ese formato ya no existe.')
    const cambios = {}
    for (const campo of [
      'nombre',
      'columnaFecha',
      'columnaConcepto',
      'columnaImporte',
      'formatoFecha',
      'filaCabeceraTexto',
      'textoNomina',
    ]) {
      if (req.body?.[campo] !== undefined) cambios[campo] = textoDe(req.body[campo], { max: 60 })
    }
    if (req.body?.separadorDecimal === ',' || req.body?.separadorDecimal === '.') {
      cambios.separadorDecimal = req.body.separadorDecimal
    }
    if (Array.isArray(req.body?.prefijosALimpiar)) {
      cambios.prefijosALimpiar = req.body.prefijosALimpiar.map(String).filter(Boolean)
    }
    return res.json(formatosBd.actualizar(id, cambios))
  }),
)

/** El historial, para deshacer o mirar que entro. */
rutasExtracto.get(
  '/historial',
  ruta((req, res) => {
    const mesId = enteroDe(req.query.mesId)
    return res.json(importacionesBd.listar({ mesId: mesId || null }))
  }),
)

/**
 * Lee el archivo y lo enseña, SIN clasificar y sin guardar nada.
 *
 * Sirve para el "Probar con un archivo" de la pantalla de formatos y para
 * enseñar las primeras filas cuando no se reconoce la cabecera.
 */
rutasExtracto.post(
  '/leer',
  ruta(async (req, res) => {
    const buffer = bufferDe(req)
    const texto = typeof req.body?.texto === 'string' ? req.body.texto : null
    if (!buffer && !texto) return fallo(res, 400, 'No ha llegado ningún archivo ni texto.')

    const formato = req.body?.formatoId
      ? formatosBd.obtener(enteroDe(req.body.formatoId))
      : formatosBd.porDefecto()

    try {
      const leido = await leerExtracto({
        buffer,
        texto,
        nombreArchivo: textoDe(req.body?.nombreArchivo ?? '', { max: 200 }),
        formato,
      })
      return res.json({ ...leido, formato })
    } catch (causa) {
      return fallo(res, 400, causa.message || 'No he podido leer ese archivo.')
    }
  }),
)

/**
 * Lee, clasifica y crea la importacion en borrador.
 *
 * Nada de esto toca el mes: la propuesta se devuelve para revisarla, y solo
 * /aceptar escribe.
 */
rutasExtracto.post(
  '/clasificar',
  ruta(async (req, res) => {
    const mes = mesDe(req)
    if (!mes) return fallo(res, 404, 'Ese mes no existe.')
    if (mes.estado !== 'abierto') {
      return fallo(
        res,
        409,
        `${mes.nombreMes} de ${mes.anio} está cerrado. Reábrelo antes de importar en él.`,
      )
    }

    const buffer = bufferDe(req)
    const texto = typeof req.body?.texto === 'string' ? req.body.texto : null
    if (!buffer && !texto) return fallo(res, 400, 'No ha llegado ningún archivo ni texto.')

    const formato = req.body?.formatoId
      ? formatosBd.obtener(enteroDe(req.body.formatoId))
      : formatosBd.porDefecto()
    const nombreArchivo = textoDe(req.body?.nombreArchivo ?? '', { max: 200 })

    let leido
    try {
      leido = await leerExtracto({ buffer, texto, nombreArchivo, formato })
    } catch (causa) {
      return fallo(res, 400, causa.message || 'No he podido leer ese archivo.')
    }
    if (leido.necesitaAyuda) return res.status(200).json({ ...leido, formato })
    if (leido.movimientos.length === 0) {
      return fallo(res, 400, 'He leído el archivo pero no he encontrado ningún movimiento.')
    }

    const propuesta = clasificar({
      movimientos: leido.movimientos,
      mes,
      huellasUsadas: huellasAceptadas(),
      formato,
    })

    /*
     * El extracto define el mes: se espera que empiece por la nomina. Si no,
     * se avisa, pero no se bloquea: puede ser un extracto partido, o un mes en
     * el que la nomina llego antes.
     */
    const avisos = []
    if (leido.nominas.length === 0) {
      avisos.push(
        'El extracto no empieza por la nómina; comprueba que es el mes correcto.',
      )
    } else if (!leido.nominas.some((n) => n.abreElMes)) {
      avisos.push(
        'La nómina no es el primer movimiento del extracto; comprueba que es el mes correcto.',
      )
    }
    if (leido.nominas.length > 1) {
      avisos.push(
        `Hay ${leido.nominas.length} nóminas en el archivo. Elige cuál es la de este mes.`,
      )
    }

    const importacion = importacionesBd.crear({
      mesId: mes.id,
      nombreArchivo,
      formatoBancoId: formato?.id ?? null,
      nMovimientos: leido.nOrigen,
    })
    importacionesBd.guardarBorrador(importacion.id, {
      lineas: propuesta.lineas,
      conciliaciones: propuesta.conciliaciones,
      plantillaPropuesta: propuesta.plantillaPropuesta,
      periodo: leido.periodo,
      nOrigen: leido.nOrigen,
    })

    return res.status(201).json({
      importacion,
      formato,
      lectura: {
        hoja: leido.hoja,
        filaCabecera: leido.filaCabecera,
        cabecera: leido.cabecera,
        nOrigen: leido.nOrigen,
        filasDescartadas: leido.filasDescartadas,
        // El periodo que cubre: es lo que define el mes.
        periodo: leido.periodo,
        nominas: leido.nominas,
      },
      avisos,
      ...propuesta,
      conceptos: conceptosBd.listar({ soloActivos: true }),
      // Los que van arriba del desplegable, para no leer cincuenta nombres.
      frecuentes: conceptosFrecuentes(mes),
    })
  }),
)

/**
 * Le pide a la IA un concepto para los que ninguna regla ha reconocido.
 *
 * Va aparte de /clasificar a proposito: la parte determinista tiene que estar
 * en pantalla enseguida, y la IA puede tardar. Si falla, la revision sigue
 * funcionando igual y solo se pierde la ayuda.
 */
rutasExtracto.post(
  '/:id/sugerir',
  ruta(async (req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !importacionesBd.obtener(id)) return fallo(res, 404, 'Esa importación ya no existe.')
    if (!configBd.iaCompleta().clave) {
      return fallo(res, 400, 'No hay ninguna IA configurada. Puedes ponerla en Ajustes.')
    }

    const lineas = Array.isArray(req.body?.lineas) ? req.body.lineas : []
    const sinClasificar = lineas
      .filter((l) => l?.destino === 'sinClasificar')
      // Un tope por si algun dia llega un extracto enorme: una sola llamada,
      // pero tampoco de doscientas lineas.
      .slice(0, 80)
    if (sinClasificar.length === 0) return res.json({ sugerencias: {}, aviso: null, cuantas: 0 })

    return res.json(await sugerirParaExtracto(sinClasificar))
  }),
)

/** Retomar una revision a medias. */
rutasExtracto.get(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const importacion = id ? importacionesBd.obtener(id) : null
    if (!importacion) return fallo(res, 404, 'Esa importación ya no existe.')
    return res.json({
      importacion,
      borrador: importacionesBd.borrador(id),
      huellas: importacion.estado === 'aceptada' ? importacionesBd.huellasDe(id) : [],
      conceptos: conceptosBd.listar({ soloActivos: true }),
    })
  }),
)

/** El estado de la revision se guarda solo, para poder cerrar y volver. */
rutasExtracto.patch(
  '/:id/borrador',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const importacion = id ? importacionesBd.obtener(id) : null
    if (!importacion) return fallo(res, 404, 'Esa importación ya no existe.')
    if (importacion.estado !== 'borrador') {
      return fallo(res, 409, 'Esa importación ya no es un borrador.')
    }
    if (!Array.isArray(req.body?.lineas)) return fallo(res, 400, 'Falta el estado de la revisión.')

    importacionesBd.guardarBorrador(id, {
      lineas: req.body.lineas,
      conciliaciones: req.body.conciliaciones ?? [],
      plantillaPropuesta: req.body.plantilla ?? [],
      periodo: req.body.periodo ?? null,
      nOrigen: importacion.conteos.movimientos,
    })
    return res.json({ guardado: true, cuenta: contar(req.body.lineas) })
  }),
)

/** Lo que va a pasar, antes de confirmar. */
rutasExtracto.post(
  '/:id/previsualizar',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !importacionesBd.obtener(id)) return fallo(res, 404, 'Esa importación ya no existe.')
    const lineas = Array.isArray(req.body?.lineas) ? req.body.lineas : []
    const conciliaciones = Array.isArray(req.body?.conciliaciones) ? req.body.conciliaciones : []
    try {
      return res.json({
        ...previsualizar({ importacionId: id, lineas, conciliaciones }),
        validacion: validar({ lineas, nOrigen: importacionesBd.obtener(id).conteos.movimientos }),
      })
    } catch (causa) {
      if (causa instanceof ErrorAplicacion) return fallo(res, 400, causa.message)
      throw causa
    }
  }),
)

rutasExtracto.post(
  '/:id/aceptar',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !importacionesBd.obtener(id)) return fallo(res, 404, 'Esa importación ya no existe.')
    if (!Array.isArray(req.body?.lineas)) return fallo(res, 400, 'Falta la revisión que aceptar.')

    try {
      const resultado = aceptar({
        importacionId: id,
        lineas: req.body.lineas,
        conciliaciones: req.body.conciliaciones ?? [],
        reglasNuevas: req.body.reglasNuevas ?? [],
        plantilla: req.body.plantilla ?? [],
        periodo: req.body.periodo ?? null,
      })
      return res.json(resultado)
    } catch (causa) {
      if (causa instanceof ErrorAplicacion) {
        return res.status(400).json({ error: causa.message, detalle: causa.detalle })
      }
      throw causa
    }
  }),
)

rutasExtracto.post(
  '/:id/deshacer',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !importacionesBd.obtener(id)) return fallo(res, 404, 'Esa importación ya no existe.')
    try {
      return res.json(deshacer(id))
    } catch (causa) {
      if (causa instanceof ErrorAplicacion) return fallo(res, 400, causa.message)
      throw causa
    }
  }),
)

/** Un borrador que ya no interesa. Solo borradores: lo aceptado se deshace. */
rutasExtracto.delete(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const importacion = id ? importacionesBd.obtener(id) : null
    if (!importacion) return fallo(res, 404, 'Esa importación ya no existe.')
    if (importacion.estado === 'aceptada') {
      return fallo(res, 409, 'Esa importación está aplicada. Deshazla en vez de borrarla.')
    }
    importacionesBd.borrar(id)
    return res.status(204).end()
  }),
)
