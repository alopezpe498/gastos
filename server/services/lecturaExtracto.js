import crypto from 'node:crypto'
import ExcelJS from 'exceljs'
import { normalizar } from '../db/index.js'
import { leerXls, esXlsAntiguo } from './lecturaXls.js'
import { redondear } from '../lib/http.js'

/**
 * Convertir el fichero del banco en una lista de movimientos.
 *
 * Este modulo solo LEE. No decide a que concepto va nada, no toca la base de
 * datos y no sabe que mes es: eso es de clasificacion.js. Aqui solo se responde
 * a "que filas hay, con que fecha, que importe y que texto".
 *
 * ---------------------------------------------------------------------------
 * Como es el fichero de verdad (Banc Sabadell, comprobado)
 * ---------------------------------------------------------------------------
 *
 *   fila 1    Consulta de movimientos
 *   fila 2    29/08/2026 13:17:42
 *   fila 4    Cuenta:  ES63 ...
 *   fila 7    Selección: Desde 29/07/2026 hasta 26/08/2026
 *   fila 9    F. Operativa | Concepto | F. Valor | Importe | Saldo | Ref 1 | Ref 2
 *   fila 10+  26/08/2026 | COMPRA TARJ. 5402XXXXXXXX4010 CONDIS-BARCELONA | ... | -21,14
 *
 * Cuatro cosas que no son evidentes:
 *
 * 1. LA CABECERA NO ESTA EN UNA FILA FIJA. Encima hay un numero variable de
 *    filas de titulo, cuenta y periodo. Se busca la fila que contenga el texto
 *    configurado ("Importe") y esa manda.
 *
 * 2. LAS COLUMNAS SE BUSCAN POR NOMBRE, no por posicion. El banco las mueve
 *    entre exportaciones, pero no les cambia el nombre.
 *
 * 3. HAY DOS FECHAS: la operativa y la de valor. Vale la operativa, que es
 *    cuando se hizo el gasto; la de valor es cuando el banco lo apunta, y puede
 *    caer en el mes siguiente.
 *
 * 4. LA DESCRIPCION VIENE CORTADA a unos 46 caracteres ("WWW.AMAZON-LUXEM",
 *    "MERCADONA BERGA-"). No se puede contar con que este entera.
 */

// ---------------------------------------------------------------------------
// Leer el archivo, sea cual sea
// ---------------------------------------------------------------------------

/** Todas las hojas de un archivo, como matrices de celdas. */
export async function leerArchivo(buffer, nombre = '') {
  const extension = String(nombre).toLowerCase().split('.').pop()

  if (esXlsAntiguo(buffer)) return leerXls(buffer).hojas

  if (extension === 'csv' || pareceTexto(buffer)) {
    return [{ nombre: 'CSV', filas: leerTexto(buffer.toString('utf8')) }]
  }

  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer)
  const hojas = libro.worksheets.map((hoja) => {
    const filas = []
    hoja.eachRow({ includeEmpty: true }, (fila, numero) => {
      const celdas = []
      fila.eachCell({ includeEmpty: true }, (celda, columna) => {
        celdas[columna - 1] = valorDeCelda(celda)
      })
      filas[numero - 1] = celdas
    })
    for (let i = 0; i < filas.length; i += 1) if (!filas[i]) filas[i] = []
    return { nombre: hoja.name, filas }
  })
  if (hojas.length === 0) {
    throw new Error('Ese archivo no tiene ninguna hoja. Prueba a exportarlo otra vez.')
  }
  return hojas
}

function valorDeCelda(celda) {
  const v = celda?.value
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    if ('text' in v) return v.text
    if ('result' in v) return v.result
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    return null
  }
  return v
}

/** Un buffer que no empieza por firma binaria conocida y se lee como texto. */
function pareceTexto(buffer) {
  const cabeza = buffer.subarray(0, 8)
  if (cabeza[0] === 0x50 && cabeza[1] === 0x4b) return false // zip: .xlsx
  if (esXlsAntiguo(buffer)) return false
  // Si hay bytes nulos en el primer kilobyte, es binario.
  return !buffer.subarray(0, 1024).includes(0)
}

/**
 * Texto pegado o CSV. Se detecta el separador mirando cual aparece de forma
 * mas regular en las primeras lineas: el tabulador si se ha copiado de Excel,
 * el punto y coma en los CSV españoles, y la coma en el resto.
 */
export function leerTexto(texto) {
  const lineas = String(texto)
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
  if (lineas.length === 0) return []

  /*
   * Que separador es. NO vale mirar el minimo de las primeras lineas: un
   * extracto empieza con filas de titulo ("Consulta de movimientos") que no
   * llevan ningun separador, y asi el minimo daba cero para todos.
   *
   * Se mira en cuantas lineas aparece cada candidato, y gana el que este en
   * mas; a igualdad, el que aparezca mas veces en total.
   */
  const candidatos = ['\t', ';', ',', '|']
  const muestra = lineas.slice(0, 20)
  let separador = '\t'
  let mejor = { lineas: 0, veces: 0 }
  for (const c of candidatos) {
    const cuentas = muestra.map((l) => l.split(c).length - 1)
    const conEl = cuentas.filter((n) => n > 0).length
    const veces = cuentas.reduce((t, n) => t + n, 0)
    if (conEl > mejor.lineas || (conEl === mejor.lineas && veces > mejor.veces)) {
      mejor = { lineas: conEl, veces }
      separador = c
    }
  }
  if (mejor.lineas === 0) return lineas.map((l) => [l])

  return lineas.map((linea) =>
    partirRespetandoComillas(linea, separador).map((celda) => celda.trim()),
  )
}

function partirRespetandoComillas(linea, separador) {
  const trozos = []
  let actual = ''
  let dentro = false
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i]
    if (c === '"') {
      if (dentro && linea[i + 1] === '"') {
        actual += '"'
        i += 1
      } else dentro = !dentro
    } else if (c === separador && !dentro) {
      trozos.push(actual)
      actual = ''
    } else actual += c
  }
  trozos.push(actual)
  return trozos
}

// ---------------------------------------------------------------------------
// Encontrar la cabecera y las columnas
// ---------------------------------------------------------------------------

/**
 * Busca la fila de cabecera: la primera que contenga el texto que la delata y
 * que tenga al menos tres celdas con texto.
 */
export function buscarCabecera(filas, textoCabecera = 'Importe') {
  const buscado = normalizar(textoCabecera)
  for (let i = 0; i < filas.length; i += 1) {
    const celdas = filas[i] ?? []
    const conTexto = celdas.filter((c) => typeof c === 'string' && c.trim() !== '')
    if (conTexto.length < 3) continue
    if (conTexto.some((c) => normalizar(c) === buscado)) return i
  }
  return -1
}

/** Empareja los nombres de la cabecera con las columnas que hacen falta. */
export function buscarColumnas(cabecera, formato) {
  const nombres = (cabecera ?? []).map((c) => normalizar(c ?? ''))
  const dondeEsta = (buscado, alternativas = []) => {
    if (buscado) {
      const exacta = nombres.indexOf(normalizar(buscado))
      if (exacta >= 0) return exacta
    }
    for (const alternativa of alternativas) {
      const i = nombres.findIndex((n) => n.includes(normalizar(alternativa)))
      if (i >= 0) return i
    }
    return -1
  }

  return {
    // "F. Operativa" antes que "F. Valor": vale cuando se hizo el gasto.
    fecha: dondeEsta(formato?.columnaFecha, ['f. operativa', 'fecha operacion', 'fecha']),
    concepto: dondeEsta(formato?.columnaConcepto, ['concepto', 'descripcion', 'detalle']),
    importe: dondeEsta(formato?.columnaImporte, ['importe', 'cantidad', 'euros']),
    nombres: (cabecera ?? []).map((c) => String(c ?? '').trim()),
  }
}

// ---------------------------------------------------------------------------
// Convertir una celda en fecha y en importe
// ---------------------------------------------------------------------------

const ISO = /^(\d{4})-(\d{2})-(\d{2})/

/** Devuelve 'AAAA-MM-DD', o null si no hay una fecha reconocible. */
export function leerFecha(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(
      valor.getDate(),
    ).padStart(2, '0')}`
  }
  // Excel guarda las fechas como dias desde el 1900. Solo se acepta un rango
  // razonable para no confundir un importe con una fecha.
  if (typeof valor === 'number' && valor > 20000 && valor < 80000) {
    const fecha = new Date(Date.UTC(1899, 11, 30) + valor * 86400000)
    return fecha.toISOString().slice(0, 10)
  }

  const texto = String(valor ?? '').trim()
  if (!texto) return null

  const iso = texto.match(ISO)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const partes = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (!partes) return null
  const dia = Number(partes[1])
  const mes = Number(partes[2])
  let anio = Number(partes[3])
  if (anio < 100) anio += anio < 70 ? 2000 : 1900
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/**
 * Devuelve un numero, o null si la celda no es un importe.
 *
 * Que devuelva null es parte del trabajo: asi se distinguen las filas de
 * movimiento de las de titulo, saldo o pie.
 */
export function leerImporte(valor, separador = ',') {
  if (typeof valor === 'number') return Number.isFinite(valor) ? redondear(valor) : null

  let texto = String(valor ?? '')
    .replace(/[\s€$]/g, '')
    .replace(/ /g, '')
    .trim()
  if (!texto) return null

  // Los negativos entre parentesis: (1.234,56)
  let negativo = false
  if (/^\(.*\)$/.test(texto)) {
    negativo = true
    texto = texto.slice(1, -1)
  }

  const miles = separador === ',' ? '.' : ','
  texto = texto.split(miles).join('').replace(separador, '.')
  if (!/^[+-]?\d+(\.\d+)?$/.test(texto)) return null

  const numero = Number(texto)
  if (!Number.isFinite(numero)) return null
  return redondear(negativo ? -numero : numero)
}

// ---------------------------------------------------------------------------
// Limpiar la descripcion
// ---------------------------------------------------------------------------

/**
 * Quita el ruido del banco para que la linea se lea.
 *
 * OJO: esto es SOLO para enseñarla. Las reglas se comparan siempre contra la
 * original, porque limpiar se lleva por delante justo las palabras que
 * identifican el movimiento.
 */
export function limpiarDescripcion(texto, prefijos = []) {
  let limpio = String(texto ?? '').trim()
  for (const patron of prefijos) {
    try {
      limpio = limpio.replace(new RegExp(patron, 'gi'), ' ').trim()
    } catch {
      // Un patron mal escrito a mano no puede tumbar una importacion entera.
    }
  }
  limpio = limpio.replace(/\s+/g, ' ').replace(/^[-–—.,;:\s]+/, '').trim()
  // Si la limpieza se lo ha comido todo, mejor la original que una linea vacia.
  return limpio || String(texto ?? '').trim()
}

/**
 * La huella de un movimiento: fecha, importe y descripcion original.
 *
 * Es lo que hace que subir dos veces el mismo extracto no duplique nada. No
 * entra el saldo ni las referencias: el banco los cambia entre exportaciones.
 */
export function huellaDe({ fecha, importe, descripcionOriginal }) {
  const semilla = `${fecha}|${redondear(importe).toFixed(2)}|${normalizar(descripcionOriginal)}`
  return crypto.createHash('sha256').update(semilla).digest('hex').slice(0, 32)
}

// ---------------------------------------------------------------------------
// Todo junto
// ---------------------------------------------------------------------------

/**
 * Lee un extracto y devuelve sus movimientos.
 *
 * Si no encuentra la cabecera o las columnas devuelve `necesitaAyuda` con las
 * primeras filas, para que la pantalla deje señalarlas a mano.
 */
export async function leerExtracto({ buffer, texto, nombreArchivo = '', formato }) {
  const hojas = texto ? [{ nombre: 'Pegado', filas: leerTexto(texto) }] : await leerArchivo(buffer, nombreArchivo)

  // La hoja buena es la que tenga cabecera; casi siempre la primera.
  let hoja = null
  let filaCabecera = -1
  for (const candidata of hojas) {
    const donde = buscarCabecera(candidata.filas, formato?.filaCabeceraTexto ?? 'Importe')
    if (donde >= 0) {
      hoja = candidata
      filaCabecera = donde
      break
    }
  }

  if (!hoja) {
    const primera = hojas[0] ?? { filas: [] }
    return {
      necesitaAyuda: true,
      motivo: `No encuentro la fila de cabecera (busco una celda que ponga "${formato?.filaCabeceraTexto ?? 'Importe'}").`,
      hojas: hojas.map((h) => h.nombre),
      primerasFilas: primera.filas.slice(0, 15).map((f) => (f ?? []).map((c) => textoDeCelda(c))),
      movimientos: [],
    }
  }

  const columnas = buscarColumnas(hoja.filas[filaCabecera], formato)
  if (columnas.fecha < 0 || columnas.concepto < 0 || columnas.importe < 0) {
    const faltan = []
    if (columnas.fecha < 0) faltan.push('fecha')
    if (columnas.concepto < 0) faltan.push('concepto')
    if (columnas.importe < 0) faltan.push('importe')
    return {
      necesitaAyuda: true,
      motivo: `He encontrado la cabecera pero no la columna de ${faltan.join(' ni la de ')}.`,
      cabecera: columnas.nombres,
      filaCabecera,
      primerasFilas: hoja.filas
        .slice(filaCabecera, filaCabecera + 15)
        .map((f) => (f ?? []).map((c) => textoDeCelda(c))),
      movimientos: [],
    }
  }

  const separador = formato?.separadorDecimal ?? ','
  const prefijos = formato?.prefijosALimpiar ?? []
  const movimientos = []
  let descartadas = 0

  for (let i = filaCabecera + 1; i < hoja.filas.length; i += 1) {
    const celdas = hoja.filas[i] ?? []
    const importe = leerImporte(celdas[columnas.importe], separador)
    // SOLO son movimientos las filas con importe numerico. Asi se caen solas
    // las de titulo, las de saldo final y las notas del pie.
    if (importe === null) {
      if (celdas.some((c) => c !== null && c !== undefined && String(c).trim() !== '')) {
        descartadas += 1
      }
      continue
    }

    const fecha = leerFecha(celdas[columnas.fecha])
    const descripcionOriginal = String(celdas[columnas.concepto] ?? '').trim()

    movimientos.push({
      linea: i + 1,
      fecha,
      importe,
      descripcionOriginal,
      descripcionLimpia: limpiarDescripcion(descripcionOriginal, prefijos),
      huella: huellaDe({ fecha, importe, descripcionOriginal }),
    })
  }

  return {
    necesitaAyuda: false,
    hoja: hoja.nombre,
    filaCabecera,
    cabecera: columnas.nombres,
    columnas: { fecha: columnas.fecha, concepto: columnas.concepto, importe: columnas.importe },
    // Cuantos habia en el fichero: es la cifra contra la que se valida todo al
    // aceptar, para que no se pierda ni aparezca ningun movimiento por el camino.
    nOrigen: movimientos.length,
    filasDescartadas: descartadas,
    movimientos,
  }
}

function textoDeCelda(celda) {
  if (celda instanceof Date) return celda.toISOString().slice(0, 10)
  return celda === null || celda === undefined ? '' : String(celda)
}
