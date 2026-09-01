import { bd } from '../db/index.js'
import * as productosBd from '../db/productos.js'
import * as ticketsBd from '../db/tickets.js'
import * as movimientosBd from '../db/movimientos.js'
import * as conceptosBd from '../db/conceptos.js'
import { redondear } from '../lib/http.js'
import { varianteOtros } from '../db/semillaProductos.js'

/**
 * El ticket de la compra: asignar, cuadrar y guardar.
 *
 * Tres reglas gobiernan todo este modulo:
 *
 *   1. UN ticket es UN movimiento del sobre Comida, con su total. Las lineas
 *      cuelgan de el y no suman: si sumaran, la compra contaria dos veces.
 *   2. Las lineas TIENEN que cuadrar con el total. Un ticket que no cuadra no
 *      se guarda, porque un detalle que no suma lo que pone abajo no sirve para
 *      responder ninguna de las preguntas que se le van a hacer despues.
 *   3. La memoria solo la escribe una persona. La IA propone; el alias se
 *      confirma cuando alguien pulsa «Recordar», nunca solo.
 */

/** Lo que se admite de descuadre entre las lineas y el total, por redondeos. */
export const TOLERANCIA = 0.05

// ---------------------------------------------------------------------------
// Asignar una linea
// ---------------------------------------------------------------------------

/**
 * De donde sale la variante de cada linea, parando en la primera que resuelva:
 *
 *   alias confirmado  ->  lo dije yo alguna vez. No se vuelve a preguntar.
 *   alias sin confirmar -> lo propuso la IA otro dia. Sale escrito, pero se mira.
 *   IA                ->  lo propone ahora. Sale escrito, y se mira.
 *   nada              ->  a mano.
 *
 * Lo importante es que las tres ultimas dejan la linea marcada para revision.
 * Solo un alias confirmado da una linea por buena sin que nadie la mire.
 */
export function asignarLinea(linea, { tienda = null } = {}) {
  const alias = productosBd.aliasDe(linea.textoTicket, tienda)

  if (alias) {
    return {
      varianteId: alias.varianteId,
      origenAsignacion: 'alias',
      // Un alias sin confirmar es una propuesta, no una decision.
      dudosa: !alias.confirmado,
    }
  }

  const propuesta = linea.propuesta ?? null
  if (propuesta?.variante && propuesta?.producto) {
    return {
      varianteId: null,
      origenAsignacion: 'ia',
      dudosa: true,
      propuesta,
    }
  }

  return { varianteId: null, origenAsignacion: 'ninguno', dudosa: true }
}

// ---------------------------------------------------------------------------
// El cuadre
// ---------------------------------------------------------------------------

/** Con variante puesta, o con un nombre nuevo escrito: las dos valen. */
export function estaAsignada(linea) {
  if (linea.varianteId) return true
  return !!(String(linea.varianteNueva ?? "").trim() && String(linea.productoNuevo ?? "").trim())
}

/**
 * Si las lineas suman el total, y que falta para poder aceptar.
 *
 * Se devuelve todo junto porque la pantalla tiene que poder decir POR QUE no
 * deja aceptar: «faltan 0,95 €» y «quedan 4 sin asignar» son dos problemas
 * distintos con dos arreglos distintos.
 */
export function revisarCuadre({ total, lineas }) {
  const suma = redondear(lineas.reduce((t, l) => t + (Number(l.importe) || 0), 0))
  const diferencia = redondear(redondear(total) - suma)
  const cuadra = Math.abs(diferencia) <= TOLERANCIA
  /*
   * Una linea esta asignada tanto si apunta a una variante que ya existe como
   * si trae un nombre nuevo escrito en la revision: las dos son una decision
   * tomada. Mirar solo el id daria por «sin asignar» justo las lineas que
   * acaban de clasificarse a mano, que es lo contrario de lo que pasa.
   */
  const sinAsignar = lineas.filter((l) => !estaAsignada(l)).length

  const problemas = []
  if (!cuadra) {
    problemas.push(
      diferencia > 0
        ? `Las líneas suman ${suma.toFixed(2)} y el ticket dice ${redondear(total).toFixed(2)}: faltan ${Math.abs(diferencia).toFixed(2)} €.`
        : `Las líneas suman ${suma.toFixed(2)} y el ticket dice ${redondear(total).toFixed(2)}: sobran ${Math.abs(diferencia).toFixed(2)} €.`,
    )
  }
  if (sinAsignar > 0) {
    problemas.push(`Quedan ${sinAsignar} líneas sin asignar.`)
  }

  return { suma, diferencia, cuadra, sinAsignar, problemas, sePuedeAceptar: problemas.length === 0 }
}

// ---------------------------------------------------------------------------
// Encontrar el movimiento que ya existe
// ---------------------------------------------------------------------------

/** Los dias que puede bailar la fecha del ticket respecto a la del cargo. */
const MARGEN_DIAS = 1

function diferenciaEnDias(a, b) {
  if (!a || !b) return null
  const uno = Date.parse(`${a.slice(0, 10)}T00:00:00Z`)
  const otro = Date.parse(`${b.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(uno) || !Number.isFinite(otro)) return null
  return Math.abs(uno - otro) / 86400000
}

/**
 * El apunte de comida que ya esta en el mes y es este mismo ticket.
 *
 * Existe porque el orden normal de las cosas es: llega el extracto del banco y
 * crea el apunte de MERCADONA, y dias despues aparece la foto del ticket. Si no
 * se buscara, la compra quedaria apuntada dos veces.
 *
 * Se compara por importe y fecha, que es lo unico fiable: el importe al centimo
 * y la fecha con un dia de margen, porque el banco carga cuando le parece.
 */
export function movimientoQueEncaja({ mesId, total, fechaHora, tienda = null }) {
  const sobre = conceptosBd.sobrePrincipal()
  if (!sobre) return null

  const candidatos = movimientosBd
    .delMes(mesId)
    .filter((m) => m.conceptoId === sobre.id)
    .filter((m) => Math.abs(m.importe - redondear(total)) < 0.005)

  if (candidatos.length === 0) return null

  const conFecha = candidatos
    .map((m) => ({ movimiento: m, dias: diferenciaEnDias(m.fechaCobro, fechaHora) }))
    .filter((c) => c.dias === null || c.dias <= MARGEN_DIAS)
    .sort((a, b) => (a.dias ?? 99) - (b.dias ?? 99))

  const elegido = conFecha[0] ?? null
  if (!elegido) return null

  return {
    movimiento: elegido.movimiento,
    porQue:
      elegido.dias === 0
        ? `mismo importe y misma fecha`
        : `mismo importe, ${elegido.dias} día de diferencia`,
    tienda,
  }
}

// ---------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------

/**
 * Crea o resuelve la variante de una linea que llega de la pantalla.
 *
 * La revision puede mandar una variante que ya existe (`varianteId`) o uno de
 * los nombres nuevos que se han escrito ahi mismo. Crear el producto y la
 * categoria sobre la marcha es lo que evita tener que salir a otra pantalla en
 * mitad de un ticket de cuarenta y cinco lineas.
 */
function resolverVariante(linea) {
  if (linea.varianteId) return Number(linea.varianteId)

  const nombreVariante = String(linea.varianteNueva ?? '').trim()
  const nombreProducto = String(linea.productoNuevo ?? '').trim()
  if (!nombreVariante || !nombreProducto) return null

  let producto = productosBd.productoPorNombre(nombreProducto)
  if (!producto) {
    const categoria =
      (linea.categoriaId ? productosBd.obtenerCategoria(Number(linea.categoriaId)) : null) ??
      productosBd.categoriaPorNombre('Otros')
    if (!categoria) return null
    producto = productosBd.crearProducto({ nombre: nombreProducto, categoriaId: categoria.id })
  }

  const variante = productosBd.crearVariante({
    productoId: producto.id,
    nombre: nombreVariante,
    marca: linea.marca ?? null,
    unidadHabitual: ['ud', 'kg', 'l'].includes(linea.unidad) ? linea.unidad : 'ud',
  })
  return variante?.id ?? null
}

/**
 * Guarda el ticket: el movimiento (o el que ya estaba), las lineas y los alias.
 *
 * Todo en una transaccion. Un ticket a medias —el movimiento creado y las
 * lineas no— seria peor que no haberlo importado: el mes cuadraria y el detalle
 * mentiria.
 */
export const aceptar = bd.transaction(
  ({ mes, cabecera, lineas, movimientoId = null, archivoRuta = null, textoExtraido = null, origen = 'foto' }) => {
    const sobre = conceptosBd.sobrePrincipal()
    if (!sobre) throw new Error('No hay un sobre de comida en el catálogo.')

    // 1. Las variantes: las que ya existen, y las que se han escrito ahora.
    const resueltas = lineas.map((linea) => ({ ...linea, varianteId: resolverVariante(linea) }))

    // 2. El movimiento: el que ya estaba, o uno nuevo con el total.
    let movimiento = movimientoId ? movimientosBd.obtener(movimientoId) : null
    let creado = false
    if (!movimiento) {
      movimiento = movimientosBd.crear({
        mesId: mes.id,
        conceptoId: sobre.id,
        importe: redondear(cabecera.total),
        fechaCobro: cabecera.fechaHora ? cabecera.fechaHora.slice(0, 10) : null,
        descripcion: cabecera.tienda ?? '',
        origen: origen === 'pdf' ? 'foto' : origen,
      })
      creado = true
    }

    // 3. El ticket con sus lineas.
    const ticket = ticketsBd.crear({
      movimientoId: movimiento.id,
      tienda: cabecera.tienda ?? null,
      direccion: cabecera.direccion ?? null,
      fechaHora: cabecera.fechaHora ?? null,
      total: cabecera.total,
      formaPago: cabecera.formaPago ?? null,
      ultimos4: cabecera.ultimos4 ?? null,
      archivoRuta,
      textoExtraido,
      origen,
      lineas: resueltas,
    })

    /*
     * 4. La memoria, SOLO de lo que se ha marcado para recordar.
     *
     * Se guarda con la tienda del ticket: "PIT" no significa lo mismo en
     * Mercadona que en una carniceria. Y confirmado, porque llegar aqui con
     * `recordar` puesto quiere decir que alguien lo ha mirado y ha dicho que si.
     */
    let alias = 0
    for (const linea of resueltas) {
      if (!linea.recordar || !linea.varianteId) continue
      productosBd.guardarAlias({
        texto: linea.textoTicket,
        tienda: cabecera.tienda ?? null,
        varianteId: linea.varianteId,
        confirmado: true,
      })
      alias += 1
    }

    return {
      ticketId: ticket.id,
      movimientoId: movimiento.id,
      movimientoCreado: creado,
      lineas: resueltas.length,
      alias,
    }
  },
)

/**
 * Deshacer: se va el ticket, sus lineas y —solo si lo creo el— el movimiento.
 *
 * Si el ticket se adjunto a un apunte que ya existia, ese apunte se queda: lo
 * trajo el extracto del banco y no es nuestro para borrarlo.
 */
export const deshacer = bd.transaction((ticketId, { borrarMovimiento = false } = {}) => {
  const ticket = ticketsBd.obtener(ticketId)
  if (!ticket) return null

  const borrado = ticketsBd.borrar(ticketId)
  if (borrarMovimiento) movimientosBd.borrar(ticket.movimientoId)

  return {
    ticketId,
    lineas: borrado.lineasBorradas,
    movimientoBorrado: borrarMovimiento,
  }
})

/** La variante «Otros / Sin clasificar», para el botón que resuelve el resto. */
export function varianteDeOtros() {
  return varianteOtros()
}

/** El reparto por categoría de un ticket, para el bloque en vivo de la revisión. */
export function repartoPorCategoria(lineas) {
  const porCategoria = new Map()
  for (const linea of lineas) {
    const clave = linea.categoria ?? 'Sin asignar'
    porCategoria.set(clave, redondear((porCategoria.get(clave) ?? 0) + (linea.importe ?? 0)))
  }
  const total = redondear([...porCategoria.values()].reduce((t, v) => t + v, 0))
  return [...porCategoria.entries()]
    .map(([categoria, importe]) => ({
      categoria,
      importe,
      // Sin total no hay porcentaje: cero seria mentir, y dividir, reventar.
      parte: total === 0 ? null : importe / total,
    }))
    .sort((a, b) => b.importe - a.importe)
}
