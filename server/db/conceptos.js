import { bd, normalizar } from './index.js'
import { ahora } from '../lib/fechas.js'

export const TIPOS = ['fijo', 'variable', 'sobre']
export const CLASIFICACIONES = ['necesario', 'prescindible', 'ahorro']

/*
 * Los colores que se pueden elegir a mano. Son los mismos que reparte sola la
 * aplicacion: aqui no se inventan tintas nuevas, solo se cambia cual toca.
 */
export const COLORES = ['extras', 'ok', 'ambar', 'azul', 'rosa', 'comida', 'neutro']

/*
 * Los iconos que se pueden elegir a mano. La lista tiene que coincidir con la
 * de `src/components/ui/Icono.tsx`: si aqui se acepta uno que alli no existe,
 * el concepto se queda sin dibujo.
 */
export const ICONOS = [
  'casa',
  'comida',
  'bar',
  'rayo',
  'antena',
  'pantalla',
  'coche',
  'flecha',
  'avion',
  'pesa',
  'cruz',
  'mochila',
  'huella',
  'carro',
  'hucha',
  'entrada',
  'escudo',
  'edificio',
  'trebol',
  'billete',
  'etiqueta',
]

function aConcepto(c) {
  return {
    id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    clasificacion: c.clasificacion,
    activo: !!c.activo,
    orden: c.orden,
    esObjetivo: !!c.es_objetivo,
    // null = el que le toque por su id. Solo se guarda si se cambia a mano.
    color: c.color ?? null,
    // null = el que le toque por su nombre.
    icono: c.icono ?? null,
  }
}

export function listar({ soloActivos = false, tipo = null } = {}) {
  const condiciones = []
  if (soloActivos) condiciones.push('activo = 1')
  if (tipo) condiciones.push('tipo = @tipo')
  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''
  return bd
    .prepare(`SELECT * FROM conceptos ${donde} ORDER BY orden ASC, id ASC`)
    .all({ tipo })
    .map(aConcepto)
}

export function obtener(id) {
  const c = bd.prepare('SELECT * FROM conceptos WHERE id = ?').get(id)
  return c ? aConcepto(c) : null
}

/** Busca por nombre exacto (normalizado) o por cualquiera de sus alias. */
export function buscarPorNombre(nombre) {
  const clave = normalizar(nombre)
  if (!clave) return null
  const directo = bd.prepare('SELECT * FROM conceptos WHERE nombre_normalizado = ?').get(clave)
  if (directo) return aConcepto(directo)
  const porAlias = bd
    .prepare(
      `SELECT c.* FROM conceptos c
       JOIN conceptos_alias a ON a.concepto_id = c.id
       WHERE a.alias_normalizado = ?`,
    )
    .get(clave)
  return porAlias ? aConcepto(porAlias) : null
}

/** El sobre de la comida. En la fase 1 solo hay uno, pero el diseno admite mas. */
export function sobrePrincipal() {
  const c = bd
    .prepare(`SELECT * FROM conceptos WHERE tipo = 'sobre' ORDER BY orden ASC, id ASC LIMIT 1`)
    .get()
  return c ? aConcepto(c) : null
}

/** El concepto marcado como objetivo de ahorro. */
export function conceptoObjetivo() {
  const c = bd.prepare('SELECT * FROM conceptos WHERE es_objetivo = 1 LIMIT 1').get()
  return c ? aConcepto(c) : null
}

export function crear({
  nombre,
  tipo,
  clasificacion,
  orden = null,
  esObjetivo = false,
  activo = true,
}) {
  const siguiente =
    orden ?? bd.prepare('SELECT COALESCE(MAX(orden), -1) + 1 AS o FROM conceptos').get().o
  const info = bd
    .prepare(
      `INSERT INTO conceptos
         (nombre, nombre_normalizado, tipo, clasificacion, activo, orden, es_objetivo, fecha_creacion)
       VALUES (@nombre, @normalizado, @tipo, @clasificacion, @activo, @orden, @esObjetivo, @fecha)`,
    )
    .run({
      nombre: nombre.trim(),
      normalizado: normalizar(nombre),
      tipo,
      clasificacion,
      activo: activo ? 1 : 0,
      orden: siguiente,
      esObjetivo: esObjetivo ? 1 : 0,
      fecha: ahora(),
    })
  return obtener(info.lastInsertRowid)
}

export function actualizar(id, cambios) {
  const actual = obtener(id)
  if (!actual) return null

  // Solo puede haber un objetivo de ahorro: al marcar uno, se desmarca el resto.
  if (cambios.esObjetivo === true) {
    bd.prepare('UPDATE conceptos SET es_objetivo = 0 WHERE id != ?').run(id)
  }

  const nombre = cambios.nombre !== undefined ? String(cambios.nombre).trim() : actual.nombre
  bd.prepare(
    `UPDATE conceptos SET
       nombre = @nombre,
       nombre_normalizado = @normalizado,
       tipo = @tipo,
       clasificacion = @clasificacion,
       activo = @activo,
       es_objetivo = @esObjetivo,
       color = @color,
       icono = @icono
     WHERE id = @id`,
  ).run({
    id,
    nombre,
    normalizado: normalizar(nombre),
    tipo: cambios.tipo ?? actual.tipo,
    clasificacion: cambios.clasificacion ?? actual.clasificacion,
    activo: (cambios.activo ?? actual.activo) ? 1 : 0,
    esObjetivo: (cambios.esObjetivo ?? actual.esObjetivo) ? 1 : 0,
    color: cambios.color === undefined ? actual.color : cambios.color || null,
    icono: cambios.icono === undefined ? actual.icono : cambios.icono || null,
  })
  return obtener(id)
}

export const reordenar = bd.transaction((ids) => {
  const actualizar = bd.prepare('UPDATE conceptos SET orden = ? WHERE id = ?')
  ids.forEach((id, indice) => actualizar.run(indice, id))
  return listar()
})

export function cuentaMovimientos(id) {
  return bd.prepare('SELECT COUNT(*) AS n FROM movimientos WHERE concepto_id = ?').get(id).n
}

/** Solo se borra de verdad lo que no tiene historia; lo demas se desactiva. */
export function borrar(id) {
  bd.prepare('DELETE FROM conceptos WHERE id = ?').run(id)
}

// ---------- alias ----------

export function alias(conceptoId) {
  return bd
    .prepare('SELECT id, alias FROM conceptos_alias WHERE concepto_id = ? ORDER BY alias')
    .all(conceptoId)
}

export function anadirAlias(conceptoId, texto) {
  const normalizado = normalizar(texto)
  if (!normalizado) return null
  // Si el alias ya apunta a otro concepto, se reasigna: gana la ultima decision.
  bd.prepare('DELETE FROM conceptos_alias WHERE alias_normalizado = ?').run(normalizado)
  bd.prepare(
    'INSERT INTO conceptos_alias (concepto_id, alias, alias_normalizado) VALUES (?, ?, ?)',
  ).run(conceptoId, String(texto).trim(), normalizado)
  return alias(conceptoId)
}

export function borrarAlias(aliasId) {
  bd.prepare('DELETE FROM conceptos_alias WHERE id = ?').run(aliasId)
}
