import { bd } from './index.js'
import { ahora } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

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
    cobrado: !!m.fecha_cobro,
    descripcion: m.descripcion ?? '',
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
  origen = 'manual',
}) {
  const sello = ahora()
  const info = bd
    .prepare(
      `INSERT INTO movimientos
         (mes_id, concepto_id, importe, importe_previsto, dia_previsto, fecha_cobro,
          descripcion, origen, fecha_creacion, fecha_modificacion)
       VALUES (@mesId, @conceptoId, @importe, @previsto, @dia, @cobro, @descripcion, @origen,
               @sello, @sello)`,
    )
    .run({
      mesId,
      conceptoId,
      importe: redondear(Number(importe) || 0),
      previsto: importePrevisto === null ? null : redondear(Number(importePrevisto) || 0),
      dia: diaPrevisto === null ? null : String(diaPrevisto),
      cobro: fechaCobro,
      descripcion: String(descripcion ?? ''),
      origen,
      sello,
    })
  return obtener(info.lastInsertRowid)
}

export function actualizar(id, cambios) {
  const actual = obtener(id)
  if (!actual) return null

  bd.prepare(
    `UPDATE movimientos SET
       concepto_id = @conceptoId,
       importe = @importe,
       dia_previsto = @dia,
       fecha_cobro = @cobro,
       descripcion = @descripcion,
       fecha_modificacion = @sello
     WHERE id = @id`,
  ).run({
    id,
    conceptoId: cambios.conceptoId ?? actual.conceptoId,
    importe: cambios.importe === undefined ? actual.importe : redondear(Number(cambios.importe) || 0),
    dia: cambios.diaPrevisto === undefined ? actual.diaPrevisto : cambios.diaPrevisto,
    // null explicito = desmarcar el cobro y volver a pendiente.
    cobro: cambios.fechaCobro === undefined ? actual.fechaCobro : cambios.fechaCobro,
    descripcion:
      cambios.descripcion === undefined ? actual.descripcion : String(cambios.descripcion),
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
