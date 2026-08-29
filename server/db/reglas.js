import { bd, normalizar } from './index.js'

/**
 * Reglas de clasificacion del extracto bancario.
 *
 * Una regla dice "si la descripcion limpia contiene este texto, es esto". Se
 * evaluan en orden de `prioridad` y se para en la primera que encaje, asi que
 * el orden ES la regla: 'PRIME' tiene que mirarse antes que 'AMAZON', y los
 * fijos antes que la comida y que los variables.
 *
 * La comparacion va siempre sobre texto normalizado (sin acentos, sin
 * mayusculas, sin espacios de sobra), por las dos partes.
 */

const ahora = () => new Date().toISOString()

function aRegla(r) {
  return {
    id: r.id,
    texto: r.texto,
    conceptoId: r.concepto_id,
    concepto: r.concepto ?? null,
    conceptoTipo: r.concepto_tipo ?? null,
    tipo: r.tipo,
    coincidencia: r.coincidencia,
    prioridad: r.prioridad,
    estado: r.estado,
    activa: !!r.activa,
    vecesAplicada: r.veces_aplicada,
    ultimaAplicacion: r.ultima_aplicacion,
    origen: r.origen,
  }
}

const SELECT = `
  SELECT r.*, c.nombre AS concepto, c.tipo AS concepto_tipo
  FROM reglas_clasificacion r
  LEFT JOIN conceptos c ON c.id = r.concepto_id
`

/** Todas, en orden de evaluacion. */
export function listar({ soloActivas = false, estado = null } = {}) {
  const donde = []
  if (soloActivas) donde.push('r.activa = 1')
  if (estado) donde.push('r.estado = @estado')
  return bd
    .prepare(
      `${SELECT} ${donde.length ? `WHERE ${donde.join(' AND ')}` : ''}
       ORDER BY r.prioridad ASC, r.id ASC`,
    )
    .all({ estado })
    .map(aRegla)
}

export function obtener(id) {
  const r = bd.prepare(`${SELECT} WHERE r.id = ?`).get(id)
  return r ? aRegla(r) : null
}

/** Una regla con el mismo texto ya existe: no se duplica, se reutiliza. */
export function buscarPorTexto(texto) {
  const r = bd.prepare(`${SELECT} WHERE r.texto_normalizado = ?`).get(normalizar(texto))
  return r ? aRegla(r) : null
}

export function crear({
  texto,
  conceptoId = null,
  tipo,
  coincidencia = 'empieza',
  prioridad = null,
  estado = 'confirmada',
  activa = true,
  origen = 'usuario',
}) {
  // Sin prioridad dicha, al final de su bloque: una regla nueva nunca debe
  // colarse por delante de las que ya funcionaban.
  const suPrioridad =
    prioridad ??
    bd.prepare('SELECT COALESCE(MAX(prioridad), 0) + 1 AS p FROM reglas_clasificacion').get().p

  const info = bd
    .prepare(
      `INSERT INTO reglas_clasificacion
         (texto, texto_normalizado, concepto_id, tipo, coincidencia, prioridad, estado, activa, origen, fecha_creacion)
       VALUES (@texto, @normalizado, @conceptoId, @tipo, @coincidencia, @prioridad, @estado, @activa, @origen, @fecha)`,
    )
    .run({
      texto: String(texto).trim(),
      normalizado: normalizar(texto),
      conceptoId,
      tipo,
      coincidencia,
      prioridad: suPrioridad,
      estado,
      activa: activa ? 1 : 0,
      origen,
      fecha: ahora(),
    })
  return obtener(info.lastInsertRowid)
}

const CAMPOS = {
  texto: 'texto',
  conceptoId: 'concepto_id',
  tipo: 'tipo',
  coincidencia: 'coincidencia',
  prioridad: 'prioridad',
  estado: 'estado',
  activa: 'activa',
}

/**
 * Al tocar una regla que venia de fabrica, pasa a ser tuya.
 *
 * No es un detalle: las reglas del seed se rehacen cuando cambia su version, y
 * sin esto una correccion a mano se perderia en la siguiente actualizacion.
 */
export function actualizar(id, cambios) {
  const trozos = []
  const valores = { id }
  const actual = obtener(id)
  if (actual?.origen === 'seed') trozos.push("origen = 'usuario'")
  for (const [nombre, columna] of Object.entries(CAMPOS)) {
    if (cambios[nombre] === undefined) continue
    trozos.push(`${columna} = @${nombre}`)
    valores[nombre] = nombre === 'activa' ? (cambios[nombre] ? 1 : 0) : cambios[nombre]
  }
  // El texto normalizado va pegado al texto: no se pueden separar.
  if (cambios.texto !== undefined) {
    trozos.push('texto_normalizado = @normalizado')
    valores.normalizado = normalizar(cambios.texto)
    valores.texto = String(cambios.texto).trim()
  }
  if (trozos.length === 0) return obtener(id)

  bd.prepare(`UPDATE reglas_clasificacion SET ${trozos.join(', ')} WHERE id = @id`).run(valores)
  return obtener(id)
}

export function borrar(id) {
  bd.prepare('DELETE FROM reglas_clasificacion WHERE id = ?').run(id)
}

/** Reordena por la lista entera de ids, como el catalogo de conceptos. */
export const reordenar = bd.transaction((ids) => {
  const poner = bd.prepare('UPDATE reglas_clasificacion SET prioridad = ? WHERE id = ?')
  ids.forEach((id, indice) => poner.run(indice + 1, id))
  return listar()
})

/** Al aplicarse de verdad (solo al aceptar la importacion, no al previsualizar). */
export const anotarUso = bd.transaction((conteos) => {
  const sumar = bd.prepare(
    `UPDATE reglas_clasificacion
     SET veces_aplicada = veces_aplicada + @veces, ultima_aplicacion = @fecha
     WHERE id = @id`,
  )
  const fecha = ahora()
  for (const [id, veces] of Object.entries(conteos)) {
    sumar.run({ id: Number(id), veces, fecha })
  }
})
