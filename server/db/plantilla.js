import { bd } from './index.js'
import { claveMes } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

function aEntrada(e) {
  return {
    id: e.id,
    conceptoId: e.concepto_id,
    diaPrevisto: e.dia_previsto,
    importePrevisto: e.importe_previsto,
    // Nulo en las entradas de siempre: el importe escrito es el que vale.
    criterio: e.criterio || 'importe',
    vigenteDesde: e.vigente_desde,
  }
}

/** Historico completo de un concepto, del mas reciente al mas antiguo. */
export function historico(conceptoId) {
  return bd
    .prepare('SELECT * FROM plantilla_fijos WHERE concepto_id = ? ORDER BY vigente_desde DESC')
    .all(conceptoId)
    .map(aEntrada)
}

/**
 * Entrada que se aplica a un mes: la mas reciente que ya estuviera vigente.
 * Si no hay ninguna (un fijo creado despues), se cae en la mas antigua que
 * exista, que es mejor que dejar el mes sin ese fijo.
 */
export function vigenteEn(conceptoId, anio, mes) {
  const clave = claveMes(anio, mes)
  const e =
    bd
      .prepare(
        `SELECT * FROM plantilla_fijos
         WHERE concepto_id = ? AND vigente_desde <= ?
         ORDER BY vigente_desde DESC LIMIT 1`,
      )
      .get(conceptoId, clave) ??
    bd
      .prepare(
        'SELECT * FROM plantilla_fijos WHERE concepto_id = ? ORDER BY vigente_desde ASC LIMIT 1',
      )
      .get(conceptoId)
  return e ? aEntrada(e) : null
}

/** Las entradas vigentes de todos los fijos activos para un mes. */
export function vigentesEn(anio, mes) {
  const clave = claveMes(anio, mes)
  return bd
    .prepare(
      `SELECT c.id AS concepto_id, c.nombre, c.tipo, c.es_objetivo,
              p.dia_previsto, p.importe_previsto, p.criterio
       FROM conceptos c
       LEFT JOIN plantilla_fijos p ON p.id = (
         SELECT id FROM plantilla_fijos
         WHERE concepto_id = c.id AND vigente_desde <= @clave
         ORDER BY vigente_desde DESC LIMIT 1
       )
       WHERE c.activo = 1 AND c.tipo IN ('fijo', 'sobre')
       ORDER BY c.orden ASC, c.id ASC`,
    )
    .all({ clave })
    .map((f) => ({
      conceptoId: f.concepto_id,
      nombre: f.nombre,
      tipo: f.tipo,
      esObjetivo: !!f.es_objetivo,
      diaPrevisto: f.dia_previsto,
      importePrevisto: f.importe_previsto ?? 0,
      criterio: f.criterio || 'importe',
    }))
}

/**
 * Guarda el previsto de un concepto a partir de un mes. Si ya habia una entrada
 * para ese mismo mes se sustituye, en vez de acumular versiones del mismo dia.
 */
export function guardar(
  conceptoId,
  { diaPrevisto, importePrevisto, vigenteDesde, criterio = 'importe' },
) {
  bd.prepare(
    `INSERT INTO plantilla_fijos (concepto_id, dia_previsto, importe_previsto, criterio, vigente_desde)
     VALUES (@conceptoId, @dia, @importe, @criterio, @desde)
     ON CONFLICT(concepto_id, vigente_desde) DO UPDATE SET
       dia_previsto = excluded.dia_previsto,
       importe_previsto = excluded.importe_previsto,
       criterio = excluded.criterio`,
  ).run({
    conceptoId,
    dia: diaPrevisto === null || diaPrevisto === undefined ? null : String(diaPrevisto).trim(),
    importe: redondear(Number(importePrevisto) || 0),
    criterio: criterio ?? 'importe',
    desde: vigenteDesde,
  })
  return historico(conceptoId)
}

export function borrarEntrada(id) {
  bd.prepare('DELETE FROM plantilla_fijos WHERE id = ?').run(id)
}
