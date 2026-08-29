import express from 'express'
import crypto from 'node:crypto'
import { fallo, ruta } from '../lib/http.js'
import { hojasDelLibro } from '../services/lecturaExcel.js'
import {
  confirmar,
  confirmarLectura,
  vistaPrevia,
  vistaPreviaDeLectura,
  ErrorLectura,
} from '../services/importacionExcel.js'
import { conRegistro, leerHojaConIa, sugerirConceptos } from '../services/iaImportacion.js'
import { aplicarCaptura, leerCaptura } from '../services/iaCaptura.js'
import { pareceUnPdf, textoDePdf } from '../services/lecturaPdf.js'
import * as configBd from '../db/config.js'
import * as mesesBd from '../db/meses.js'
import { enteroDe } from '../lib/http.js'

export const rutasImportar = express.Router()

/**
 * El archivo llega en base64 dentro del JSON. Es el mismo camino que usan las
 * otras apps de la casa y evita meter multipart solo para esto.
 */
function leerArchivo(req) {
  const base64 = req.body?.archivo
  if (typeof base64 !== 'string' || !base64) {
    throw new ErrorLectura('No ha llegado ningún archivo.')
  }
  // Se admite tanto el base64 pelado como el data: URL que da el navegador.
  const limpio = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const buffer = Buffer.from(limpio, 'base64')
  if (buffer.length === 0) throw new ErrorLectura('El archivo ha llegado vacío.')
  return buffer
}

/**
 * Lecturas hechas por IA, guardadas entre la vista previa y la confirmacion.
 *
 * El parser es determinista y se puede repetir: pedirle dos veces la misma hoja
 * da lo mismo. La IA no, asi que lo que se ensena en la vista previa tiene que
 * ser EXACTAMENTE lo que se guarde despues. De ahi esta memoria corta.
 */
const VIDA_SESION_MS = 30 * 60 * 1000
const sesiones = new Map()

function limpiarCaducadas() {
  const ahora = Date.now()
  for (const [id, sesion] of sesiones) {
    if (ahora - sesion.creada > VIDA_SESION_MS) sesiones.delete(id)
  }
}
setInterval(limpiarCaducadas, 5 * 60 * 1000).unref()

function guardarSesion(lectura) {
  limpiarCaducadas()
  const id = crypto.randomUUID()
  sesiones.set(id, { creada: Date.now(), lectura })
  return id
}

/** Hojas del libro, con la marca de cuáles parecen cuentas anuales. */
rutasImportar.post(
  '/excel/hojas',
  ruta(async (req, res) => {
    const buffer = leerArchivo(req)
    let hojas
    try {
      hojas = await hojasDelLibro(buffer)
    } catch {
      return fallo(res, 400, 'No se ha podido abrir el archivo. ¿Es un .xlsx?')
    }
    // La pantalla necesita saber si puede ofrecer el plan B con IA.
    return res.json({ hojas, hayIa: configBd.iaPublica().configurada })
  }),
)

rutasImportar.post(
  '/excel/vista-previa',
  ruta(async (req, res) => {
    const buffer = leerArchivo(req)
    const hoja = String(req.body?.hoja ?? '')
    if (!hoja) return fallo(res, 400, 'Elige la hoja que quieres importar.')
    return res.json({ ...(await vistaPrevia(buffer, hoja)), hayIa: configBd.iaPublica().configurada })
  }),
)

/**
 * Plan B: la hoja no tiene el formato de las anuales y la lee la IA.
 *
 * Devuelve la MISMA forma que la vista previa normal, mas un sesionId: lo que
 * se confirme despues sale de esta lectura y no de una segunda llamada a la IA.
 */
rutasImportar.post(
  '/excel/hoja-libre',
  ruta(async (req, res) => {
    const buffer = leerArchivo(req)
    const hoja = String(req.body?.hoja ?? '')
    if (!hoja) return fallo(res, 400, 'Elige la hoja que quieres importar.')

    const lectura = await conRegistro(`hoja libre "${hoja}"`, () => leerHojaConIa(buffer, hoja))
    const previa = vistaPreviaDeLectura(lectura)
    return res.json({ ...previa, sesionId: guardarSesion(lectura), leidaPorIa: true, hayIa: true })
  }),
)

/** Sugerencias de mapeo para los conceptos que no existen todavía. */
rutasImportar.post(
  '/excel/sugerir',
  ruta(async (req, res) => {
    const nuevos = Array.isArray(req.body?.nuevos) ? req.body.nuevos : []
    if (nuevos.length === 0) return res.json({ sugerencias: [] })
    if (!configBd.iaPublica().configurada) {
      return fallo(res, 400, 'Configura la IA en Ajustes para pedir sugerencias.')
    }
    // Un tope por si alguien manda una hoja con doscientos conceptos nuevos.
    const sugerencias = await conRegistro('sugerir conceptos', () =>
      sugerirConceptos(nuevos.slice(0, 120)),
    )
    return res.json({ sugerencias })
  }),
)

rutasImportar.post(
  '/excel/confirmar',
  ruta(async (req, res) => {
    const mapeos = req.body?.mapeos ?? {}
    if (typeof mapeos !== 'object' || Array.isArray(mapeos)) {
      return fallo(res, 400, 'Los mapeos de conceptos no se han entendido.')
    }
    const opciones = {
      mapeos,
      sobrescribir: !!req.body?.sobrescribir,
      crearAjustes: !!req.body?.crearAjustes,
    }

    // Rama de IA: se importa la lectura que se enseñó, no una nueva.
    const sesionId = req.body?.sesionId
    if (sesionId) {
      const sesion = sesiones.get(String(sesionId))
      if (!sesion) {
        return fallo(
          res,
          410,
          'La vista previa ha caducado. Vuelve a subir el archivo y a leerlo con IA.',
        )
      }
      const resumen = confirmarLectura(sesion.lectura, opciones)
      sesiones.delete(String(sesionId))
      return res.json(resumen)
    }

    const buffer = leerArchivo(req)
    const hoja = String(req.body?.hoja ?? '')
    if (!hoja) return fallo(res, 400, 'Elige la hoja que quieres importar.')
    return res.json(await confirmar(buffer, hoja, opciones))
  }),
)

// ---------------------------------------------------------------------------
// Capturas: una foto, una imagen pegada o un texto suelto
// ---------------------------------------------------------------------------

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp']
/** Deja sitio de sobra para una foto comprimida y no llega al limite de Express. */
const MAX_BYTES_IMAGEN = 8 * 1024 * 1024
const MAX_BYTES_PDF = 12 * 1024 * 1024
const MAX_TEXTO = 40_000

/** Descodifica un base64 (con o sin data: URL) a Buffer. */
function comoBuffer(base64) {
  const limpio = String(base64 ?? '').replace(/^data:[^;]+;base64,/, '')
  return limpio ? Buffer.from(limpio, 'base64') : null
}

rutasImportar.post(
  '/captura',
  ruta(async (req, res) => {
    if (!configBd.iaPublica().configurada) {
      return fallo(res, 400, 'Configura la IA en Ajustes para leer fotos y textos pegados.')
    }

    const mesId = enteroDe(req.body?.mesId)
    const mes = mesId ? mesesBd.obtener(mesId) : null
    if (!mes) return fallo(res, 404, 'Ese mes ya no existe.')

    /*
     * Un PDF (la factura del comedor, la de la luz) se convierte aqui en texto
     * y sigue por la misma rama que un texto pegado. Se hace en el servidor y
     * no en el navegador porque el texto es lo unico que hace falta: mandar la
     * pagina como imagen costaria diez veces mas y leeria peor.
     */
    let textoDelPdf = ''
    let avisoPdf = null
    if (req.body?.pdf) {
      const buffer = comoBuffer(req.body.pdf)
      if (!buffer || buffer.length === 0) return fallo(res, 400, 'El PDF ha llegado vacio.')
      if (buffer.length > MAX_BYTES_PDF) {
        return fallo(res, 413, 'El PDF pesa demasiado. Manda solo las paginas de la factura.')
      }
      if (!pareceUnPdf(buffer)) return fallo(res, 400, 'Ese archivo no es un PDF.')

      const leido = await conRegistro('leer pdf', () => textoDePdf(buffer))
      textoDelPdf = leido.texto
      if (leido.paginas > leido.leidas) {
        avisoPdf = `El PDF tiene ${leido.paginas} páginas y se han leído las ${leido.leidas} primeras.`
      }
    }

    let imagen = null
    if (req.body?.imagen) {
      const tipo = String(req.body?.tipoImagen ?? 'image/jpeg')
      if (!TIPOS_IMAGEN.includes(tipo)) {
        return fallo(res, 400, 'La imagen tiene que ser JPEG, PNG o WEBP.')
      }
      const datos = String(req.body.imagen).replace(/^data:[^;]+;base64,/, '')
      const bytes = Math.round((datos.length * 3) / 4)
      if (bytes === 0) return fallo(res, 400, 'La imagen ha llegado vacia.')
      if (bytes > MAX_BYTES_IMAGEN) {
        return fallo(res, 413, 'La imagen pesa demasiado. Hazle una foto de menos resolucion.')
      }
      imagen = { datos, tipo }
    }

    const pegado = typeof req.body?.texto === 'string' ? req.body.texto : ''
    const texto = [textoDelPdf, pegado].filter(Boolean).join('\n\n').slice(0, MAX_TEXTO)

    if (!imagen && !texto.trim()) {
      return fallo(res, 400, 'No has pegado ni una imagen, ni un texto, ni un PDF.')
    }

    const lectura = await conRegistro('captura', () =>
      leerCaptura({
        imagen,
        texto: texto.trim() || undefined,
        mesReferencia: { anio: mes.anio, mes: mes.mes },
        pista: typeof req.body?.pista === 'string' ? req.body.pista.slice(0, 200) : '',
        // Una factura no es un ticket de supermercado: conviene decirselo.
        esPdf: !!textoDelPdf,
      }),
    )

    if (avisoPdf) lectura.avisos.unshift(avisoPdf)

    return res.json({ ...lectura, mes: { id: mes.id, anio: mes.anio, mes: mes.mes, clave: mes.clave } })
  }),
)

/** Guarda lo que se haya dejado marcado en la pantalla de revision. */
rutasImportar.post(
  '/captura/aplicar',
  ruta((req, res) => {
    const mesId = enteroDe(req.body?.mesId)
    const mes = mesId ? mesesBd.obtener(mesId) : null
    if (!mes) return fallo(res, 404, 'Ese mes ya no existe.')

    const lineas = Array.isArray(req.body?.movimientos) ? req.body.movimientos : []
    if (lineas.length === 0) return fallo(res, 400, 'No hay ninguna linea que guardar.')

    const origen = req.body?.origen === 'foto' ? 'foto' : 'portapapeles'
    const creados = aplicarCaptura({ mes, lineas, origen })

    if (creados.length === 0) {
      return fallo(res, 400, 'Ninguna linea tenia un concepto valido. Revisalas y reintenta.')
    }
    return res.status(201).json({ creados: creados.length, movimientos: creados })
  }),
)
