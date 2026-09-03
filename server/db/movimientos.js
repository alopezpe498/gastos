import { bd } from './index.js'
import { ahora } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

/**
 * El desglose guardado, siempre como lista.
 *
 * Se lee a la defensiva: es JSON en una columna de texto, y si alguna vez llega
 * roto vale mas quedarse sin desglose que tirar la pantalla entera.
 */
function leerDetalle(texto) {
  if (!texto) return []
  try {
    const lista = JSON.parse(texto)
    if (!Array.isArray(lista)) return []
    return lista
      .filter((l) => l && typeof l.nombre === 'string')
      .map((l) => ({
        nombre: l.nombre,
        importe: redondear(Number(l.importe) || 0),
        /*
         * De que importacion del banco salio esta linea, si salio de alguna.
         * Es lo que permite que un segundo extracto SUME sus cargos en vez de
         * pisar los que ya habia, y que deshacerlo se lleve solo los suyos.
         * Nulo en las lineas escritas a mano.
         */
        importacionId: Number.isFinite(Number(l.importacionId))
          ? Number(l.importacionId)
          : null,
      }))
  } catch {
    return []
  }
}

/** Lo que se guarda: null si no hay lineas, para no llenar la tabla de «[]». */
function escribirDetalle(lista) {
  if (!Array.isArray(lista) || lista.length === 0) return null
  const limpias = lista
    .filter((l) => l && String(l.nombre ?? '').trim())
    .map((l) => ({
      nombre: String(l.nombre).trim().slice(0, 80),
      importe: redondear(Number(l.importe) || 0),
      importacionId: Number.isFinite(Number(l.importacionId)) ? Number(l.importacionId) : null,
    }))
  return limpias.length > 0 ? JSON.stringify(limpias) : null
}

/** La suma de las lineas: es el importe del movimiento cuando hay desglose. */
export function sumaDelDetalle(lista) {
  return redondear((lista ?? []).reduce((t, l) => t + (Number(l.importe) || 0), 0))
}

function aMovimiento(m) {
  return {
    id: m.id,
    mesId: m.mes_id,
    conceptoId: m.concepto_id,
    concepto: m.concepto,
    tipo: m.tipo,
    clasificacion: m.clasificacion,
    esObjetivo: !!m.es_objetivo,
    importe: m.importe,
    importePrevisto: m.importe_previsto,
    diaPrevisto: m.dia_previsto,
    fechaCobro: m.fecha_cobro,
    // Las lineas de un fijo que agrupa varias cosas. [] si no tiene.
    detalle: leerDetalle(m.detalle),
    cobrado: !!m.fecha_cobro,
    descripcion: m.descripcion ?? '',
    // La descripcion tal cual la escribio el banco, y que importacion lo cobro.
    descripcionOriginal: m.descripcion_original ?? null,
    importacionId: m.importacion_id ?? null,
    origen: m.origen,
  }
}

// Los movimientos casi nunca interesan solos: siempre se quieren con el nombre
// y el tipo de su concepto, asi que la union va en la propia consulta base.
const SELECCION = `
  SELECT m.*, c.nombre AS concepto, c.tipo, c.clasificacion, c.es_objetivo
  FROM movimientos m
  JOIN conceptos c ON c.id = m.concepto_id
`

export function obtener(id) {
  const m = bd.prepare(`${SELECCION} WHERE m.id = ?`).get(id)
  return m ? aMovimiento(m) : null
}

/**
 * Lo que costo un concepto en un mes del calendario. `null` si no hay dato.
 *
 * `null` y `0` no son lo mismo, y aqui menos que en ningun sitio: quien
 * pregunta esto es la plantilla, para copiar el importe del mes pasado. Si ese
 * mes no existe o el concepto no aparece en el, hay que caerse al importe
 * escrito, no proponer cero euros de hipoteca.
 *
 * Se suman todos los apuntes del concepto: un fijo que se cobra en dos veces
 * costo la suma de las dos.
 */
export function importeEnMes(conceptoId, anio, mes) {
  const fila = bd
    .prepare(
      `SELECT SUM(m.importe) AS total, COUNT(*) AS cuantos
       FROM movimientos m
       JOIN meses s ON s.id = m.mes_id
       WHERE m.concepto_id = ? AND s.anio = ? AND s.mes = ?`,
    )
    .get(conceptoId, anio, mes)
  if (!fila || fila.cuantos === 0) return null
  return redondear(fila.total ?? 0)
}

/** Todos los del mes, fijos primero por dia previsto y variables por fecha. */
export function delMes(mesId) {
  return bd.prepare(`${SELECCION} WHERE m.mes_id = ? ORDER BY m.id ASC`).all(mesId).map(aMovimiento)
}

export function delAnio(anio) {
  return bd
    .prepare(
      `${SELECCION}
       JOIN meses s ON s.id = m.mes_id
       WHERE s.anio = ?
       ORDER BY s.mes ASC, m.id ASC`,
    )
    .all(anio)
    .map((m) => aMovimiento(m))
}

/** Con el numero de mes al lado: lo necesita la matriz de la vision anual. */
export function delAnioConMes(anio) {
  return bd
    .prepare(
      `SELECT m.*, c.nombre AS concepto, c.tipo, c.clasificacion, c.es_objetivo, s.mes AS numero_mes
       FROM movimientos m
       JOIN conceptos c ON c.id = m.concepto_id
       JOIN meses s ON s.id = m.mes_id
       WHERE s.anio = ?
       ORDER BY s.mes ASC, m.id ASC`,
    )
    .all(anio)
    .map((m) => ({ ...aMovimiento(m), numeroMes: m.numero_mes }))
}

export function crear({
  mesId,
  conceptoId,
  importe = 0,
  importePrevisto = null,
  diaPrevisto = null,
  fechaCobro = null,
  descripcion = '',
  detalle = null,
  origen = 'manual',
}) {
  const sello = ahora()
  const info = bd
    .prepare(
      `INSERT INTO movimientos
         (mes_id, concepto_id, importe, importe_previsto, dia_previsto, fecha_cobro,
          descripcion, detalle, origen, fecha_creacion, fecha_modificacion)
       VALUES (@mesId, @conceptoId, @importe, @previsto, @dia, @cobro, @descripcion, @detalle,
               @origen, @sello, @sello)`,
    )
    .run({
      mesId,
      conceptoId,
      importe: redondear(Number(importe) || 0),
      previsto: importePrevisto === null ? null : redondear(Number(importePrevisto) || 0),
      dia: diaPrevisto === null ? null : String(diaPrevisto),
      cobro: fechaCobro,
      descripcion: String(descripcion ?? ''),
      detalle: escribirDetalle(detalle),
      origen,
      sello,
    })
  return obtener(info.lastInsertRowid)
}

export function actualizar(id, cambios) {
  const actual = obtener(id)
  if (!actual) return null

  /*
   * CON DESGLOSE, EL IMPORTE ES LA SUMA. Aqui, y no solo en quien llama.
   *
   * La regla estaba escrita en la ruta PATCH y en el guardado de un ticket,
   * pero no aqui, y bastaba un camino que no pasara por ellas para dejar un
   * apunte de 3,99 € con un desglose que sumaba 146,88 €. Un numero que
   * contradice a su propio detalle es peor que no tener detalle: parece bueno.
   *
   * Ponerla en el sitio por donde pasan todos los cambios cierra la puerta, y
   * ademas repara solo lo que ya se hubiera torcido: en cuanto algo toca ese
   * apunte, el importe vuelve a ser lo que suman sus lineas.
   */
  const detalleFinal = cambios.detalle === undefined ? actual.detalle : cambios.detalle
  const conDesglose = Array.isArray(detalleFinal) && detalleFinal.length > 0

  bd.prepare(
    `UPDATE movimientos SET
       concepto_id = @conceptoId,
       importe = @importe,
       dia_previsto = @dia,
       fecha_cobro = @cobro,
       descripcion = @descripcion,
       detalle = @detalle,
       fecha_modificacion = @sello
     WHERE id = @id`,
  ).run({
    id,
    conceptoId: cambios.conceptoId ?? actual.conceptoId,
    importe: conDesglose
      ? sumaDelDetalle(detalleFinal)
      : cambios.importe === undefined
        ? actual.importe
        : redondear(Number(cambios.importe) || 0),
    dia: cambios.diaPrevisto === undefined ? actual.diaPrevisto : cambios.diaPrevisto,
    // null explicito = desmarcar el cobro y volver a pendiente.
    cobro: cambios.fechaCobro === undefined ? actual.fechaCobro : cambios.fechaCobro,
    descripcion:
      cambios.descripcion === undefined ? actual.descripcion : String(cambios.descripcion),
    detalle:
      cambios.detalle === undefined ? escribirDetalle(actual.detalle) : escribirDetalle(cambios.detalle),
    sello: ahora(),
  })
  return obtener(id)
}

export function borrar(id) {
  bd.prepare('DELETE FROM movimientos WHERE id = ?').run(id)
}

export function borrarDelMes(mesId) {
  bd.prepare('DELETE FROM movimientos WHERE mes_id = ?').run(mesId)
}

export const crearVarios = bd.transaction((movimientos) => {
  for (const movimiento of movimientos) crear(movimiento)
  return movimientos.length
})

/**
 * Actualiza el previsto de un fijo al regenerar el mes desde la plantilla.
 *
 * Es distinto de actualizar(): aqui se toca `importe_previsto`, que actualizar()
 * no deja cambiar a proposito (nadie edita el previsto desde la pantalla del
 * mes: se edita en la plantilla del concepto). El `importe` real solo se pisa si
 * quien llama lo pide, y solo lo pide cuando el fijo sigue pendiente.
 */
export function actualizarPrevisto(id, { importePrevisto, diaPrevisto, importe }) {
  const actual = obtener(id)
  if (!actual) return null

  bd.prepare(
    `UPDATE movimientos SET
       importe_previsto = @previsto,
       dia_previsto = @dia,
       importe = @importe,
       fecha_modificacion = @sello
     WHERE id = @id`,
  ).run({
    id,
    previsto: importePrevisto === undefined ? actual.importePrevisto : redondear(Number(importePrevisto) || 0),
    dia: diaPrevisto === undefined ? actual.diaPrevisto : diaPrevisto,
    importe: importe === undefined ? actual.importe : redondear(Number(importe) || 0),
    sello: ahora(),
  })
  return obtener(id)
}
