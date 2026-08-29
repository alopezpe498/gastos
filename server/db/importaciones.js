import { bd } from './index.js'

/**
 * Cada vez que se sube un extracto.
 *
 * Vive en 'borrador' mientras se revisa —y se puede cerrar el navegador y
 * volver manana—, y al aceptarla guarda lo suficiente para deshacerla entera:
 * las huellas de cada linea, con que movimiento se quedo cada una, y cuanto
 * valia el ingreso del mes antes de tocarlo.
 */

const ahora = () => new Date().toISOString()

function aImportacion(i) {
  return {
    id: i.id,
    mesId: i.mes_id,
    fecha: i.fecha,
    nombreArchivo: i.nombre_archivo,
    formatoBancoId: i.formato_banco_id,
    conteos: {
      movimientos: i.n_movimientos,
      fijos: i.n_fijos,
      variables: i.n_variables,
      ingresos: i.n_ingresos,
      descartados: i.n_descartados,
      duplicados: i.n_duplicados,
    },
    estado: i.estado,
    ingresoAnterior: i.ingreso_anterior,
    anio: i.anio ?? null,
    mes: i.mes ?? null,
  }
}

const SELECT = `
  SELECT i.*, m.anio, m.mes
  FROM importaciones i
  JOIN meses m ON m.id = i.mes_id
`

export function listar({ mesId = null, estado = null } = {}) {
  const donde = []
  if (mesId) donde.push('i.mes_id = @mesId')
  if (estado) donde.push('i.estado = @estado')
  return bd
    .prepare(`${SELECT} ${donde.length ? `WHERE ${donde.join(' AND ')}` : ''} ORDER BY i.id DESC`)
    .all({ mesId, estado })
    .map(aImportacion)
}

export function obtener(id) {
  const i = bd.prepare(`${SELECT} WHERE i.id = ?`).get(id)
  return i ? aImportacion(i) : null
}

/** El borrador se guarda aparte: es grande y solo hace falta al retomarlo. */
export function borrador(id) {
  const fila = bd.prepare('SELECT borrador_json FROM importaciones WHERE id = ?').get(id)
  if (!fila?.borrador_json) return null
  try {
    return JSON.parse(fila.borrador_json)
  } catch {
    return null
  }
}

export function crear({ mesId, nombreArchivo, formatoBancoId, nMovimientos }) {
  const info = bd
    .prepare(
      `INSERT INTO importaciones (mes_id, fecha, nombre_archivo, formato_banco_id, n_movimientos, estado)
       VALUES (@mesId, @fecha, @nombre, @formato, @n, 'borrador')`,
    )
    .run({
      mesId,
      fecha: ahora(),
      nombre: nombreArchivo ?? null,
      formato: formatoBancoId ?? null,
      n: nMovimientos ?? 0,
    })
  return obtener(info.lastInsertRowid)
}

export function guardarBorrador(id, datos) {
  bd.prepare('UPDATE importaciones SET borrador_json = ? WHERE id = ?').run(
    JSON.stringify(datos),
    id,
  )
}

export function actualizarConteos(id, conteos) {
  bd.prepare(
    `UPDATE importaciones SET
       n_fijos = @fijos, n_variables = @variables, n_ingresos = @ingresos,
       n_descartados = @descartados, n_duplicados = @duplicados
     WHERE id = @id`,
  ).run({
    id,
    fijos: conteos.fijos ?? 0,
    variables: conteos.variables ?? 0,
    ingresos: conteos.ingresos ?? 0,
    descartados: conteos.descartados ?? 0,
    duplicados: conteos.duplicados ?? 0,
  })
}

export function marcar(id, estado, { ingresoAnterior = undefined } = {}) {
  if (ingresoAnterior === undefined) {
    bd.prepare('UPDATE importaciones SET estado = ? WHERE id = ?').run(estado, id)
  } else {
    bd.prepare('UPDATE importaciones SET estado = ?, ingreso_anterior = ? WHERE id = ?').run(
      estado,
      ingresoAnterior,
      id,
    )
  }
  return obtener(id)
}

export function borrar(id) {
  bd.prepare('DELETE FROM importaciones WHERE id = ?').run(id)
}

// ---------- huellas ----------

export function guardarHuella({
  importacionId,
  hash,
  fecha,
  importe,
  descripcionOriginal,
  descripcionLimpia,
  resultado,
  movimientoId = null,
}) {
  bd.prepare(
    `INSERT INTO huellas_banco
       (importacion_id, hash, fecha, importe, descripcion_original, descripcion_limpia, resultado, movimiento_id)
     VALUES (@importacionId, @hash, @fecha, @importe, @original, @limpia, @resultado, @movimientoId)`,
  ).run({
    importacionId,
    hash,
    fecha: fecha ?? null,
    importe: importe ?? null,
    original: descripcionOriginal ?? '',
    limpia: descripcionLimpia ?? '',
    resultado,
    movimientoId,
  })
}

export function huellasDe(importacionId) {
  return bd
    .prepare('SELECT * FROM huellas_banco WHERE importacion_id = ? ORDER BY id')
    .all(importacionId)
    .map((h) => ({
      id: h.id,
      hash: h.hash,
      fecha: h.fecha,
      importe: h.importe,
      descripcionOriginal: h.descripcion_original,
      descripcionLimpia: h.descripcion_limpia,
      resultado: h.resultado,
      movimientoId: h.movimiento_id,
    }))
}

export function borrarHuellas(importacionId) {
  bd.prepare('DELETE FROM huellas_banco WHERE importacion_id = ?').run(importacionId)
}
