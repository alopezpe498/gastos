import { bd } from './index.js'
import { ahora, claveMes } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

function aMes(m) {
  return {
    id: m.id,
    anio: m.anio,
    mes: m.mes,
    clave: claveMes(m.anio, m.mes),
    ingreso: m.ingreso,
    dineroEnCuenta: m.dinero_en_cuenta,
    presupuestoComida: m.presupuesto_comida,
    objetivoAhorro: m.objetivo_ahorro,
    notas: m.notas ?? '',
    estado: m.estado,
    fechaApertura: m.fecha_apertura,
  }
}

export function listar() {
  return bd.prepare('SELECT * FROM meses ORDER BY anio DESC, mes DESC').all().map(aMes)
}

export function anios() {
  return bd
    .prepare('SELECT DISTINCT anio FROM meses ORDER BY anio DESC')
    .all()
    .map((f) => f.anio)
}

export function obtener(id) {
  const m = bd.prepare('SELECT * FROM meses WHERE id = ?').get(id)
  return m ? aMes(m) : null
}

export function porFecha(anio, mes) {
  const m = bd.prepare('SELECT * FROM meses WHERE anio = ? AND mes = ?').get(anio, mes)
  return m ? aMes(m) : null
}

export function delAnio(anio) {
  return bd.prepare('SELECT * FROM meses WHERE anio = ? ORDER BY mes ASC').all(anio).map(aMes)
}

/**
 * El mes que ensena la aplicacion al entrar: el de HOY.
 *
 * Antes era "el mas reciente que siguiera abierto", que obligaba a ir cerrando
 * meses para que la aplicacion no se quedara clavada en enero. Ahora el mes en
 * curso es el mes en curso, y punto; si no existe todavia, quien llama se
 * encarga de crearlo.
 */
export function masReciente() {
  const ahora = new Date()
  const deHoy = porFecha(ahora.getFullYear(), ahora.getMonth() + 1)
  if (deHoy) return deHoy

  // Sin el mes de hoy (recien instalado, o mirando una copia antigua), el
  // ultimo que haya es mejor que nada.
  const ultimo = bd.prepare('SELECT * FROM meses ORDER BY anio DESC, mes DESC LIMIT 1').get()
  return ultimo ? aMes(ultimo) : null
}

/** Primer y ultimo mes con datos, para saber por donde se puede navegar. */
export function limites() {
  const fila = bd
    .prepare(
      `SELECT MIN(anio * 100 + mes) AS min, MAX(anio * 100 + mes) AS max FROM meses`,
    )
    .get()
  if (!fila?.min) return null
  const desarmar = (n) => ({ anio: Math.floor(n / 100), mes: n % 100 })
  return { primero: desarmar(fila.min), ultimo: desarmar(fila.max) }
}

export function crear({
  anio,
  mes,
  ingreso = 0,
  dineroEnCuenta = null,
  presupuestoComida = 0,
  objetivoAhorro = 0,
  notas = '',
  estado = 'abierto',
}) {
  const info = bd
    .prepare(
      `INSERT INTO meses
         (anio, mes, ingreso, dinero_en_cuenta, presupuesto_comida, objetivo_ahorro,
          notas, estado, fecha_apertura)
       VALUES (@anio, @mes, @ingreso, @dinero, @comida, @ahorro, @notas, @estado, @fecha)`,
    )
    .run({
      anio,
      mes,
      ingreso: redondear(Number(ingreso) || 0),
      dinero: dineroEnCuenta === null ? null : redondear(Number(dineroEnCuenta) || 0),
      comida: redondear(Number(presupuestoComida) || 0),
      ahorro: redondear(Number(objetivoAhorro) || 0),
      notas,
      estado,
      fecha: ahora(),
    })
  return obtener(info.lastInsertRowid)
}

export function actualizar(id, cambios) {
  const actual = obtener(id)
  if (!actual) return null

  const numero = (nuevo, viejo) => (nuevo === undefined ? viejo : redondear(Number(nuevo) || 0))

  bd.prepare(
    `UPDATE meses SET
       ingreso = @ingreso,
       dinero_en_cuenta = @dinero,
       presupuesto_comida = @comida,
       objetivo_ahorro = @ahorro,
       notas = @notas,
       estado = @estado
     WHERE id = @id`,
  ).run({
    id,
    ingreso: numero(cambios.ingreso, actual.ingreso),
    // Poner null a proposito borra el dato: vuelve a "sin mirar el banco".
    dinero:
      cambios.dineroEnCuenta === undefined
        ? actual.dineroEnCuenta
        : cambios.dineroEnCuenta === null
          ? null
          : redondear(Number(cambios.dineroEnCuenta) || 0),
    comida: numero(cambios.presupuestoComida, actual.presupuestoComida),
    ahorro: numero(cambios.objetivoAhorro, actual.objetivoAhorro),
    notas: cambios.notas === undefined ? actual.notas : String(cambios.notas),
    estado: cambios.estado ?? actual.estado,
  })
  return obtener(id)
}

/** Solo lo usa la reimportacion de un año, al sobrescribir. */
export function borrar(id) {
  bd.prepare('DELETE FROM meses WHERE id = ?').run(id)
}
