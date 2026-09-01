import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import * as ticketsBd from '../db/tickets.js'
import * as productosBd from '../db/productos.js'
import * as mesesBd from '../db/meses.js'
import * as configBd from '../db/config.js'
import * as ticketsServicio from '../services/tickets.js'
import * as compra from '../services/analiticaCompra.js'
import { leerTicket } from '../services/iaTicket.js'
import { textoDePdf } from '../services/lecturaPdf.js'
import { ErrorIa } from '../services/ia.js'
import { fallo, ruta, enteroDe, textoDe, importeDe } from '../lib/http.js'
import { CARPETA_TICKETS } from '../db/index.js'
import { NOMBRES_MESES } from '../lib/fechas.js'

export const rutasTickets = express.Router()

const MAX_BYTES = 20 * 1024 * 1024
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp']

function comoBuffer(base64) {
  const limpio = String(base64 ?? '').replace(/^data:[^;]+;base64,/, '')
  return limpio ? Buffer.from(limpio, 'base64') : null
}

const pareceUnPdf = (buffer) => buffer.slice(0, 5).toString('latin1') === '%PDF-'

/**
 * Guarda el archivo original junto a la base de datos, no en el repositorio.
 *
 * Se guarda porque es la unica forma de comprobar una linea seis meses despues:
 * el texto que saco la IA puede estar mal, la foto no.
 */
function guardarArchivo(buffer, extension) {
  fs.mkdirSync(CARPETA_TICKETS, { recursive: true })
  const nombre = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
  fs.writeFileSync(path.join(CARPETA_TICKETS, nombre), buffer)
  return nombre
}

/**
 * Lee un ticket y devuelve la propuesta. NO escribe nada.
 *
 * Igual que el extracto del banco: lo que sale de aqui es un borrador que pasa
 * por la pantalla de revision, y solo /aceptar toca la base de datos.
 */
rutasTickets.post(
  '/',
  ruta(async (req, res) => {
    if (!configBd.iaPublica().configurada) {
      return fallo(res, 400, 'Configura la IA en Ajustes para leer tickets.')
    }

    const mesId = enteroDe(req.body?.mesId)
    const mes = mesId ? mesesBd.obtener(mesId) : null
    if (!mes) return fallo(res, 404, 'Ese mes ya no existe.')
    if (mes.estado !== 'abierto') {
      return fallo(res, 409, `${mes.nombreMes} de ${mes.anio} está cerrado. Reábrelo antes.`)
    }

    let imagen = null
    let textoPlano = ''
    let archivoRuta = null
    let origen = 'portapapeles'

    if (req.body?.pdf) {
      const buffer = comoBuffer(req.body.pdf)
      if (!buffer?.length) return fallo(res, 400, 'El PDF ha llegado vacío.')
      if (buffer.length > MAX_BYTES) return fallo(res, 413, 'El PDF pesa más de 20 MB.')
      if (!pareceUnPdf(buffer)) return fallo(res, 400, 'Ese archivo no es un PDF.')

      const leido = await textoDePdf(buffer)
      textoPlano = leido.texto
      archivoRuta = guardarArchivo(buffer, 'pdf')
      origen = 'pdf'
    }

    if (req.body?.imagen) {
      const tipo = String(req.body?.tipoImagen ?? 'image/jpeg')
      if (!TIPOS_IMAGEN.includes(tipo)) {
        return fallo(res, 400, 'La imagen tiene que ser JPEG, PNG o WEBP.')
      }
      const datos = String(req.body.imagen).replace(/^data:[^;]+;base64,/, '')
      const buffer = Buffer.from(datos, 'base64')
      if (!buffer.length) return fallo(res, 400, 'La imagen ha llegado vacía.')
      if (buffer.length > MAX_BYTES) return fallo(res, 413, 'La imagen pesa más de 20 MB.')

      imagen = { datos, tipo }
      archivoRuta = guardarArchivo(buffer, tipo.split('/')[1])
      origen = 'foto'
    }

    if (typeof req.body?.texto === 'string' && req.body.texto.trim()) {
      textoPlano = [textoPlano, req.body.texto].filter(Boolean).join('\n\n')
    }

    if (!imagen && !textoPlano.trim()) {
      return fallo(res, 400, 'No ha llegado ni una foto, ni un PDF, ni un texto.')
    }

    let lectura
    try {
      lectura = await leerTicket({
        imagen,
        texto: textoPlano.trim() || undefined,
        pista: textoDe(req.body?.pista ?? '', { max: 200 }),
      })
    } catch (causa) {
      if (causa instanceof ErrorIa) return fallo(res, causa.codigo ?? 502, causa.message)
      throw causa
    }

    // Cada linea, con lo que la memoria o la IA proponen para ella.
    const lineas = lectura.lineas.map((linea) => ({
      ...linea,
      ...ticketsServicio.asignarLinea(linea, { tienda: lectura.tienda }),
    }))

    const conVariante = lineas.map((l) => ({
      ...l,
      variante: l.varianteId ? productosBd.obtenerVariante(l.varianteId) : null,
    }))

    return res.json({
      mes: {
        id: mes.id,
        anio: mes.anio,
        mes: mes.mes,
        // El nombre lo pone la ruta, como en /meses: la base guarda numeros.
        nombreMes: NOMBRES_MESES[mes.mes - 1],
      },
      cabecera: {
        tienda: lectura.tienda,
        direccion: lectura.direccion,
        fechaHora: lectura.fechaHora,
        total: lectura.total,
        formaPago: lectura.formaPago,
        ultimos4: lectura.ultimos4,
      },
      lineas: conVariante,
      archivoRuta,
      origen,
      // El apunte de comida que ya esta en el mes y es este mismo ticket.
      coincidencia: ticketsServicio.movimientoQueEncaja({
        mesId: mes.id,
        total: lectura.total,
        fechaHora: lectura.fechaHora,
        tienda: lectura.tienda,
      }),
      cuadre: ticketsServicio.revisarCuadre({ total: lectura.total, lineas }),
      avisos: lectura.avisos,
    })
  }),
)

/** Guarda lo que se haya dejado revisado en la pantalla. */
rutasTickets.post(
  '/aceptar',
  ruta((req, res) => {
    const mesId = enteroDe(req.body?.mesId)
    const mes = mesId ? mesesBd.obtener(mesId) : null
    if (!mes) return fallo(res, 404, 'Ese mes ya no existe.')

    const cabecera = req.body?.cabecera ?? {}
    const total = importeDe(cabecera.total)
    if (total === null) return fallo(res, 400, 'El total del ticket no se entiende.')

    const lineas = Array.isArray(req.body?.lineas) ? req.body.lineas : []
    if (lineas.length === 0) return fallo(res, 400, 'El ticket no tiene ninguna línea.')

    const limpias = []
    for (const linea of lineas) {
      const importe = importeDe(linea?.importe)
      const texto = textoDe(linea?.textoTicket ?? '', { max: 200 })
      if (!texto) return fallo(res, 400, 'Hay una línea sin texto del ticket.')
      if (importe === null) return fallo(res, 400, `El importe de "${texto}" no se entiende.`)
      limpias.push({ ...linea, textoTicket: texto, importe })
    }

    const cuadre = ticketsServicio.revisarCuadre({ total, lineas: limpias })
    if (!cuadre.sePuedeAceptar) {
      return res.status(400).json({
        error: 'El ticket no está listo para guardarse.',
        detalle: cuadre.problemas,
      })
    }

    const guardado = ticketsServicio.aceptar({
      mes,
      cabecera: {
        tienda: textoDe(cabecera.tienda ?? '', { max: 120 }) || null,
        direccion: textoDe(cabecera.direccion ?? '', { max: 200 }) || null,
        fechaHora: textoDe(cabecera.fechaHora ?? '', { max: 20 }) || null,
        total,
        formaPago: textoDe(cabecera.formaPago ?? '', { max: 40 }) || null,
        ultimos4: textoDe(cabecera.ultimos4 ?? '', { max: 4 }) || null,
      },
      lineas: limpias,
      movimientoId: enteroDe(req.body?.movimientoId) || null,
      archivoRuta: textoDe(req.body?.archivoRuta ?? '', { max: 200 }) || null,
      origen: ['foto', 'pdf', 'portapapeles', 'manual'].includes(req.body?.origen)
        ? req.body.origen
        : 'foto',
    })

    return res.status(201).json(guardado)
  }),
)

/*
 * OJO CON EL ORDEN: /aceptar va antes que /:id, y las de abajo tambien. Con
 * /:id delante, Express haria casar /tickets/aceptar con id = "aceptar".
 */

/**
 * El archivo recien subido, todavia sin ticket que lo sostenga.
 *
 * Hace falta durante la revision: el papel se mira ANTES de guardar nada, que
 * es justo cuando hay que comprobar una linea. Solo se sirve por su nombre de
 * archivo, y se corta a `basename` para que nadie pueda pedir una ruta que se
 * salga de la carpeta de tickets.
 */
rutasTickets.get(
  '/archivo/:nombre',
  ruta((req, res) => {
    const nombre = path.basename(String(req.params.nombre ?? ''))
    if (!nombre) return fallo(res, 404, 'Ese archivo no existe.')
    const completa = path.join(CARPETA_TICKETS, nombre)
    if (!fs.existsSync(completa)) return fallo(res, 404, 'Ese archivo ya no está.')
    return res.sendFile(completa)
  }),
)

rutasTickets.get(
  '/',
  ruta((req, res) => {
    const mesId = req.query.mes ? enteroDe(req.query.mes) : null
    return res.json(mesId ? ticketsBd.delMes(mesId) : ticketsBd.listar({}))
  }),
)

rutasTickets.get(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const ticket = id ? ticketsBd.obtener(id) : null
    if (!ticket) return fallo(res, 404, 'Ese ticket ya no existe.')
    const lineas = ticketsBd.lineasDe(id)
    return res.json({
      ...ticket,
      lineas,
      reparto: ticketsServicio.repartoPorCategoria(lineas),
    })
  }),
)

/**
 * Solo lectura, pensado para las otras apps.
 *
 * `listacompra` puede marcar como comprados los articulos de un ticket, y
 * `menusemanal` cruzar ingredientes con productos. Por eso devuelve producto y
 * variante con su unidad, y no los ids internos de las lineas.
 */
rutasTickets.get(
  '/:id/lineas',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const ticket = id ? ticketsBd.obtener(id) : null
    if (!ticket) return fallo(res, 404, 'Ese ticket ya no existe.')

    return res.json({
      ticket: { id: ticket.id, tienda: ticket.tienda, fechaHora: ticket.fechaHora, total: ticket.total },
      lineas: ticketsBd.lineasDe(id).map((l) => ({
        producto: l.producto,
        productoId: l.productoId,
        variante: l.variante,
        marca: l.marca,
        categoria: l.categoria,
        cantidad: l.cantidad,
        unidad: l.unidad,
        importe: l.importe,
        textoTicket: l.textoTicket,
      })),
    })
  }),
)

rutasTickets.delete(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const ticket = id ? ticketsBd.obtener(id) : null
    if (!ticket) return fallo(res, 404, 'Ese ticket ya no existe.')

    /*
     * El movimiento solo se va si lo creo el ticket. Si se adjunto a un apunte
     * que ya estaba —lo normal: lo trajo el extracto—, ese apunte se queda.
     */
    const borrarMovimiento = req.body?.borrarMovimiento === true
    return res.json(ticketsServicio.deshacer(id, { borrarMovimiento }))
  }),
)

// ---------------------------------------------------------------------------
// El archivo original
// ---------------------------------------------------------------------------

rutasTickets.get(
  '/:id/archivo',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const ticket = id ? ticketsBd.obtener(id) : null
    if (!ticket?.archivoRuta) return fallo(res, 404, 'Ese ticket no tiene archivo guardado.')

    // El nombre sale de la base, pero se comprueba igual: nunca se sirve una
    // ruta que se salga de la carpeta de tickets.
    const nombre = path.basename(ticket.archivoRuta)
    const completa = path.join(CARPETA_TICKETS, nombre)
    if (!fs.existsSync(completa)) return fallo(res, 404, 'El archivo ya no está.')
    return res.sendFile(completa)
  }),
)

export { compra }
