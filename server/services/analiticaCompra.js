import { bd } from '../db/index.js'
import { resolverRango } from './analitica.js'
import { redondear } from '../lib/http.js'

/**
 * En que se va la compra.
 *
 * Todo lo de aqui sale de `lineas_ticket`, nunca de `movimientos`: el mes ya
 * sabe cuanto se ha gastado en comida, y lo que se pregunta ahora es OTRA cosa
 * —en que se reparte ese dinero— que solo esta en el detalle de los tickets.
 *
 * Regla de la casa, otra vez: un rango sin tickets vale `null` o lista vacia,
 * nunca cero. Un cero dice «he mirado y no has gastado nada en pollo»; lo que
 * pasa de verdad es que no hay tickets ese mes.
 */

/** El filtro de meses, compartido por todas las consultas de abajo. */
const DENTRO_DEL_RANGO = `
  JOIN tickets t ON t.id = l.ticket_id
  JOIN movimientos m ON m.id = t.movimiento_id
  JOIN meses s ON s.id = m.mes_id
  WHERE (s.anio * 100 + s.mes) BETWEEN @desde AND @hasta`

function conRango(rango, sql, extra = {}) {
  return bd.prepare(sql).all({ desde: rango.desde, hasta: rango.hasta, ...extra })
}

/** Cuantos tickets hay en el rango. Sin ellos, todo lo demas no significa nada. */
export function cuantosTickets(rango) {
  return bd
    .prepare(
      `SELECT COUNT(*) AS n FROM tickets t
       JOIN movimientos m ON m.id = t.movimiento_id
       JOIN meses s ON s.id = m.mes_id
       WHERE (s.anio * 100 + s.mes) BETWEEN @desde AND @hasta`,
    )
    .get({ desde: rango.desde, hasta: rango.hasta }).n
}

/**
 * El reparto por categoria, que es la puerta de entrada: de aqui se baja a
 * producto y de producto a las compras concretas.
 */
export function reparto({ rango }) {
  const filas = conRango(
    rango,
    `SELECT c.id, c.nombre, SUM(l.importe) AS total, COUNT(*) AS lineas
     FROM lineas_ticket l
     LEFT JOIN variantes v ON v.id = l.variante_id
     LEFT JOIN productos p ON p.id = v.producto_id
     LEFT JOIN categorias_producto c ON c.id = p.categoria_id
     ${DENTRO_DEL_RANGO}
     GROUP BY c.id
     ORDER BY total DESC`,
  )

  const total = redondear(filas.reduce((t, f) => t + (f.total ?? 0), 0))
  return {
    total: filas.length === 0 ? null : total,
    tickets: cuantosTickets(rango),
    categorias: filas.map((f) => ({
      id: f.id,
      nombre: f.nombre ?? 'Sin asignar',
      total: redondear(f.total ?? 0),
      lineas: f.lineas,
      parte: total === 0 ? null : redondear(f.total ?? 0) / total,
    })),
  }
}

/** Los productos de una categoria; sin categoria, los de todo el rango. */
export function productos({ rango, categoriaId = null, limite = 40 }) {
  const filtro = categoriaId ? 'AND p.categoria_id = @categoriaId' : ''
  const filas = conRango(
    rango,
    `SELECT p.id, p.nombre, c.nombre AS categoria,
            SUM(l.importe) AS total, COUNT(*) AS compras,
            SUM(CASE WHEN l.unidad = 'kg' THEN l.cantidad ELSE 0 END) AS kg,
            SUM(CASE WHEN l.unidad = 'ud' THEN l.cantidad ELSE 0 END) AS unidades
     FROM lineas_ticket l
     JOIN variantes v ON v.id = l.variante_id
     JOIN productos p ON p.id = v.producto_id
     JOIN categorias_producto c ON c.id = p.categoria_id
     ${DENTRO_DEL_RANGO} ${filtro}
     GROUP BY p.id
     ORDER BY total DESC
     LIMIT @limite`,
    { categoriaId, limite },
  )

  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    categoria: f.categoria,
    total: redondear(f.total ?? 0),
    compras: f.compras,
    kg: f.kg ? redondear(f.kg) : null,
    unidades: f.unidades ? redondear(f.unidades) : null,
  }))
}

/**
 * Un producto por dentro: sus variantes, cada compra y como ha ido el precio.
 *
 * El precio por unidad es lo unico que permite decir «el aceite ha subido»: el
 * importe total sube tambien si compras mas cantidad, y eso no es lo mismo.
 */
export function producto({ rango, productoId }) {
  const ficha = bd
    .prepare(
      `SELECT p.id, p.nombre, c.nombre AS categoria
       FROM productos p JOIN categorias_producto c ON c.id = p.categoria_id
       WHERE p.id = ?`,
    )
    .get(productoId)
  if (!ficha) return null

  const variantes = conRango(
    rango,
    `SELECT v.id, v.nombre, v.marca, v.unidad_habitual AS unidad,
            SUM(l.importe) AS total, COUNT(*) AS compras,
            SUM(l.cantidad) AS cantidad, AVG(l.precio_unitario) AS precioMedio
     FROM lineas_ticket l
     JOIN variantes v ON v.id = l.variante_id
     ${DENTRO_DEL_RANGO} AND v.producto_id = @productoId
     GROUP BY v.id
     ORDER BY total DESC`,
    { productoId },
  )

  const compras = conRango(
    rango,
    `SELECT l.id, l.texto_ticket AS texto, l.cantidad, l.unidad, l.precio_unitario AS precio,
            l.importe, t.tienda, t.fecha_hora AS fecha, v.nombre AS variante, v.marca
     FROM lineas_ticket l
     JOIN variantes v ON v.id = l.variante_id
     ${DENTRO_DEL_RANGO} AND v.producto_id = @productoId
     ORDER BY t.fecha_hora DESC, l.id DESC
     LIMIT 200`,
    { productoId },
  )

  const total = redondear(variantes.reduce((t, v) => t + (v.total ?? 0), 0))
  return {
    ...ficha,
    total: variantes.length === 0 ? null : total,
    compras: compras.length,
    variantes: variantes.map((v) => ({
      id: v.id,
      nombre: v.nombre,
      marca: v.marca,
      unidad: v.unidad,
      total: redondear(v.total ?? 0),
      compras: v.compras,
      cantidad: redondear(v.cantidad ?? 0),
      precioMedio: v.precioMedio === null ? null : redondear(v.precioMedio),
    })),
    // Cada compra, para dibujar la evolucion del precio por variante y tienda.
    detalle: compras.map((c) => ({
      id: c.id,
      fecha: c.fecha,
      tienda: c.tienda,
      variante: c.variante,
      marca: c.marca,
      texto: c.texto,
      cantidad: c.cantidad,
      unidad: c.unidad,
      precio: c.precio,
      importe: c.importe,
    })),
  }
}

/** Buscar un producto por nombre: «pollo» y lo que sea que haya debajo. */
export function buscar({ rango, texto, limite = 20 }) {
  const patron = `%${String(texto ?? '').trim()}%`
  if (patron.length <= 2) return []
  return conRango(
    rango,
    `SELECT p.id, p.nombre, c.nombre AS categoria, SUM(l.importe) AS total, COUNT(*) AS compras
     FROM lineas_ticket l
     JOIN variantes v ON v.id = l.variante_id
     JOIN productos p ON p.id = v.producto_id
     JOIN categorias_producto c ON c.id = p.categoria_id
     ${DENTRO_DEL_RANGO}
       AND (normalizar_sql(p.nombre) LIKE normalizar_sql(@patron)
            OR normalizar_sql(v.nombre) LIKE normalizar_sql(@patron))
     GROUP BY p.id
     ORDER BY total DESC
     LIMIT @limite`,
    { patron, limite },
  ).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    categoria: f.categoria,
    total: redondear(f.total ?? 0),
    compras: f.compras,
  }))
}

/** Gasto y ticket medio por tienda, y de paso la comparativa de precios. */
export function tiendas({ rango }) {
  const filas = conRango(
    rango,
    `SELECT t.tienda, COUNT(DISTINCT t.id) AS tickets, SUM(l.importe) AS total,
            COUNT(*) AS lineas
     FROM lineas_ticket l
     ${DENTRO_DEL_RANGO}
     GROUP BY t.tienda
     ORDER BY total DESC`,
  )

  return filas.map((f) => ({
    tienda: f.tienda ?? 'Sin nombre',
    tickets: f.tickets,
    total: redondear(f.total ?? 0),
    ticketMedio: f.tickets === 0 ? null : redondear((f.total ?? 0) / f.tickets),
    lineasPorTicket: f.tickets === 0 ? null : Math.round(f.lineas / f.tickets),
  }))
}

/** El mismo producto en tiendas distintas: donde sale mas caro. */
export function comparativaDeTiendas({ rango, productoId }) {
  return conRango(
    rango,
    `SELECT t.tienda, COUNT(*) AS compras, AVG(l.precio_unitario) AS precioMedio,
            MIN(l.precio_unitario) AS minimo, MAX(l.precio_unitario) AS maximo
     FROM lineas_ticket l
     JOIN variantes v ON v.id = l.variante_id
     ${DENTRO_DEL_RANGO} AND v.producto_id = @productoId AND l.precio_unitario IS NOT NULL
     GROUP BY t.tienda
     ORDER BY precioMedio ASC`,
    { productoId },
  ).map((f) => ({
    tienda: f.tienda ?? 'Sin nombre',
    compras: f.compras,
    precioMedio: redondear(f.precioMedio),
    minimo: redondear(f.minimo),
    maximo: redondear(f.maximo),
  }))
}

/** Cuando se compra: dia de la semana, ticket medio, lineas por ticket. */
export function habitos({ rango }) {
  const porDia = conRango(
    rango,
    `SELECT CAST(strftime('%w', substr(t.fecha_hora, 1, 10)) AS INTEGER) AS dia,
            COUNT(DISTINCT t.id) AS tickets, SUM(l.importe) AS total
     FROM lineas_ticket l
     ${DENTRO_DEL_RANGO} AND t.fecha_hora IS NOT NULL
     GROUP BY dia`,
  )

  // strftime('%w') da 0 = domingo; aqui la semana empieza en lunes.
  const NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const orden = [1, 2, 3, 4, 5, 6, 0]

  const resumen = bd
    .prepare(
      `SELECT COUNT(*) AS tickets, AVG(total) AS ticketMedio, AVG(n_lineas) AS lineasMedias
       FROM tickets t
       JOIN movimientos m ON m.id = t.movimiento_id
       JOIN meses s ON s.id = m.mes_id
       WHERE (s.anio * 100 + s.mes) BETWEEN @desde AND @hasta`,
    )
    .get({ desde: rango.desde, hasta: rango.hasta })

  return {
    tickets: resumen.tickets,
    ticketMedio: resumen.tickets === 0 ? null : redondear(resumen.ticketMedio),
    lineasMedias: resumen.tickets === 0 ? null : Math.round(resumen.lineasMedias),
    porDia: orden.map((dia) => {
      const fila = porDia.find((f) => f.dia === dia)
      return {
        dia: NOMBRES[dia],
        tickets: fila?.tickets ?? 0,
        total: fila ? redondear(fila.total) : null,
      }
    }),
  }
}

/**
 * El resumen de un mes, para la linea que va dentro del tile de Comida.
 *
 * Devuelve null si ese mes no tiene tickets: la linea no se pinta, en vez de
 * decir «0 tickets · 0 categorias», que ocupa lo mismo y no dice nada.
 */
export function resumenDelMes(mesId) {
  const tickets = bd
    .prepare(
      `SELECT COUNT(*) AS n FROM tickets t
       JOIN movimientos m ON m.id = t.movimiento_id
       WHERE m.mes_id = ?`,
    )
    .get(mesId).n
  if (tickets === 0) return null

  const filas = bd
    .prepare(
      `SELECT c.nombre, SUM(l.importe) AS total
       FROM lineas_ticket l
       JOIN tickets t ON t.id = l.ticket_id
       JOIN movimientos m ON m.id = t.movimiento_id
       LEFT JOIN variantes v ON v.id = l.variante_id
       LEFT JOIN productos p ON p.id = v.producto_id
       LEFT JOIN categorias_producto c ON c.id = p.categoria_id
       WHERE m.mes_id = ?
       GROUP BY c.id
       ORDER BY total DESC`,
    )
    .all(mesId)

  const total = redondear(filas.reduce((t, f) => t + (f.total ?? 0), 0))
  return {
    tickets,
    total,
    principales: filas.slice(0, 3).map((f) => ({
      categoria: f.nombre ?? 'Sin asignar',
      total: redondear(f.total ?? 0),
      parte: total === 0 ? null : redondear(f.total ?? 0) / total,
    })),
  }
}

export { resolverRango }
