import { bd } from './index.js'
import { ahora } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

/**
 * El ticket y sus lineas.
 *
 * REGLA QUE MANDA: el ticket cuelga de UN movimiento del sobre Comida y no
 * suma nada por su cuenta. Lo que se apunta en el mes es el total del ticket,
 * como siempre; estas lineas solo dicen en que se reparte ese total. Si un dia
 * las lineas crearan movimientos, la compra contaria dos veces.
 */

function aLinea(l) {
  return {
    id: l.id,
    ticketId: l.ticket_id,
    orden: l.orden,
    textoTicket: l.texto_ticket,
    cantidad: l.cantidad,
    unidad: l.unidad,
    precioUnitario: l.precio_unitario,
    importe: l.importe,
    varianteId: l.variante_id,
    variante: l.variante ?? null,
    marca: l.marca ?? null,
    producto: l.producto ?? null,
    productoId: l.producto_id ?? null,
    categoria: l.categoria ?? null,
    categoriaId: l.categoria_id ?? null,
    origenAsignacion: l.origen_asignacion,
    dudosa: !!l.dudosa,
    nota: l.nota ?? null,
  }
}

const SELECCION_LINEA = `
  SELECT l.*, v.nombre AS variante, v.marca, p.id AS producto_id, p.nombre AS producto,
         c.id AS categoria_id, c.nombre AS categoria
  FROM lineas_ticket l
  LEFT JOIN variantes v ON v.id = l.variante_id
  LEFT JOIN productos p ON p.id = v.producto_id
  LEFT JOIN categorias_producto c ON c.id = p.categoria_id`

function aTicket(t) {
  return {
    id: t.id,
    movimientoId: t.movimiento_id,
    tienda: t.tienda,
    direccion: t.direccion,
    fechaHora: t.fecha_hora,
    total: t.total,
    formaPago: t.forma_pago,
    ultimos4: t.ultimos4_tarjeta,
    nLineas: t.n_lineas,
    archivoRuta: t.archivo_ruta,
    origen: t.origen,
    estado: t.estado,
    fechaCreacion: t.fecha_creacion,
  }
}

export function obtener(id) {
  const t = bd.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  return t ? aTicket(t) : null
}

export function porMovimiento(movimientoId) {
  const t = bd.prepare('SELECT * FROM tickets WHERE movimiento_id = ?').get(movimientoId)
  return t ? aTicket(t) : null
}

export function lineasDe(ticketId) {
  return bd
    .prepare(`${SELECCION_LINEA} WHERE l.ticket_id = ? ORDER BY l.orden ASC, l.id ASC`)
    .all(ticketId)
    .map(aLinea)
}

/** Los tickets de un mes, para poder decir «3 tickets» en el tile de comida. */
export function delMes(mesId) {
  return bd
    .prepare(
      `SELECT t.* FROM tickets t
       JOIN movimientos m ON m.id = t.movimiento_id
       WHERE m.mes_id = ?
       ORDER BY t.fecha_hora DESC`,
    )
    .all(mesId)
    .map(aTicket)
}

export function listar({ limite = 50 } = {}) {
  return bd
    .prepare('SELECT * FROM tickets ORDER BY fecha_hora DESC, id DESC LIMIT ?')
    .all(limite)
    .map(aTicket)
}

/** Crea el ticket con sus lineas de una vez: media compra guardada no vale. */
export const crear = bd.transaction(
  ({
    movimientoId,
    tienda = null,
    direccion = null,
    fechaHora = null,
    total = 0,
    formaPago = null,
    ultimos4 = null,
    archivoRuta = null,
    textoExtraido = null,
    origen = 'foto',
    estado = 'revisado',
    lineas = [],
  }) => {
    const { lastInsertRowid } = bd
      .prepare(
        `INSERT INTO tickets
           (movimiento_id, tienda, direccion, fecha_hora, total, forma_pago, ultimos4_tarjeta,
            n_lineas, archivo_ruta, texto_extraido, origen, estado, fecha_creacion)
         VALUES (@movimientoId, @tienda, @direccion, @fechaHora, @total, @formaPago, @ultimos4,
                 @nLineas, @archivoRuta, @textoExtraido, @origen, @estado, @creacion)`,
      )
      .run({
        movimientoId,
        tienda,
        direccion,
        fechaHora,
        total: redondear(total),
        formaPago,
        ultimos4,
        nLineas: lineas.length,
        archivoRuta,
        textoExtraido,
        origen,
        estado,
        creacion: ahora(),
      })

    const insertarLinea = bd.prepare(
      `INSERT INTO lineas_ticket
         (ticket_id, orden, texto_ticket, cantidad, unidad, precio_unitario, importe,
          variante_id, origen_asignacion, dudosa, nota)
       VALUES (@ticketId, @orden, @texto, @cantidad, @unidad, @precio, @importe,
               @varianteId, @origen, @dudosa, @nota)`,
    )

    lineas.forEach((linea, indice) => {
      insertarLinea.run({
        ticketId: lastInsertRowid,
        orden: indice,
        texto: String(linea.textoTicket ?? '').slice(0, 200),
        cantidad: Number(linea.cantidad) || 1,
        unidad: ['ud', 'kg', 'l'].includes(linea.unidad) ? linea.unidad : 'ud',
        precio: linea.precioUnitario === null || linea.precioUnitario === undefined
          ? null
          : redondear(linea.precioUnitario),
        importe: redondear(linea.importe ?? 0),
        varianteId: linea.varianteId ?? null,
        origen: ['alias', 'ia', 'manual', 'ninguno'].includes(linea.origenAsignacion)
          ? linea.origenAsignacion
          : 'ninguno',
        dudosa: linea.dudosa ? 1 : 0,
        nota: linea.nota ?? null,
      })
    })

    return obtener(lastInsertRowid)
  },
)

export function actualizarLinea(id, cambios) {
  const actual = bd.prepare('SELECT * FROM lineas_ticket WHERE id = ?').get(id)
  if (!actual) return null
  bd.prepare(
    `UPDATE lineas_ticket
     SET cantidad = @cantidad, unidad = @unidad, precio_unitario = @precio,
         importe = @importe, variante_id = @varianteId, origen_asignacion = @origen,
         dudosa = @dudosa, nota = @nota
     WHERE id = @id`,
  ).run({
    id,
    cantidad: cambios.cantidad ?? actual.cantidad,
    unidad: cambios.unidad ?? actual.unidad,
    precio: cambios.precioUnitario === undefined ? actual.precio_unitario : cambios.precioUnitario,
    importe: cambios.importe === undefined ? actual.importe : redondear(cambios.importe),
    varianteId: cambios.varianteId === undefined ? actual.variante_id : cambios.varianteId,
    origen: cambios.origenAsignacion ?? actual.origen_asignacion,
    dudosa: cambios.dudosa === undefined ? actual.dudosa : cambios.dudosa ? 1 : 0,
    nota: cambios.nota === undefined ? actual.nota : cambios.nota,
  })
  return bd.prepare(`${SELECCION_LINEA} WHERE l.id = ?`).get(id)
}

/** Borra el ticket y sus lineas. El movimiento NO se toca: se decide fuera. */
export function borrar(id) {
  const ticket = obtener(id)
  if (!ticket) return null
  const lineas = bd.prepare('SELECT COUNT(*) AS n FROM lineas_ticket WHERE ticket_id = ?').get(id).n
  bd.prepare('DELETE FROM tickets WHERE id = ?').run(id)
  return { ...ticket, lineasBorradas: lineas }
}
