import ExcelJS from 'exceljs'
import { normalizar } from '../db/index.js'
import { NOMBRES_MESES } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

/**
 * Lectura de las hojas anuales del Excel de cuentas.
 *
 * Este modulo solo LEE: convierte una hoja en una estructura de datos y dice lo
 * que no ha entendido. Quien decide que hacer con eso es importacionExcel.js.
 *
 * ---------------------------------------------------------------------------
 * Como es la hoja de verdad (comprobado sobre Cuentas2022..2026)
 * ---------------------------------------------------------------------------
 *
 *   fila 4    B=Enero  C=Enero  D=Febrero  E=Febrero  ...  X=Diciembre Y=Diciembre
 *   fila 5    A=Telf BCN   C=44   E=44   G=44 ...   Z=total anual  AA=media
 *   ...
 *   fila 19   A=Otros      <- suma de los variables del mes
 *   fila 20   A=Gastos
 *   fila 21   A=Ingresos
 *   fila 22   A=Ahorro     <- saldo del mes, no un concepto
 *   ...
 *   fila 43+  B=Prestamo C=300  D=Prestamo E=355,58  ...  <- detalle de variables
 *
 * Tres cosas que no son evidentes y que se aprenden mirando el archivo:
 *
 * 1. CADA MES OCUPA DOS COLUMNAS y el nombre del mes esta en las dos. El
 *    importe de los fijos va en la SEGUNDA; la PRIMERA solo se usa abajo, en el
 *    detalle de variables, donde el par es (concepto, importe).
 *
 * 2. "Ahorro" APARECE DOS VECES: como concepto fijo (en 2024 lo es) y como fila
 *    de saldo al final. Se distinguen por posicion, no por nombre: el saldo es
 *    el que va detras de "Ingresos".
 *
 * 3. LOS FIJOS CAMBIAN DE UN AÑO A OTRO: 2024 tiene "Piso Vinaros" y no
 *    "Gatos"; 2026 tiene "Gimasio" y no "Ahorro". Por eso el bloque de fijos se
 *    reconoce por posicion (de la cabecera hasta "Otros") y nunca por una lista
 *    fija de nombres.
 */

/** Filas de totales que cierran el bloque de fijos, en su orden del Excel. */
const FILAS_DE_CIERRE = ['otros', 'gastos', 'ingresos', 'ahorro']

const MESES_NORMALIZADOS = NOMBRES_MESES.map((m) => normalizar(m))

/**
 * Saca el valor util de una celda de exceljs.
 *
 * Devuelve { valor, formulaSinCachear }: una formula cuyo resultado no esta
 * guardado en el archivo (pasa en meses todavia sin rellenar) se trata como
 * celda vacia, pero se avisa, porque un 0 silencioso ahi seria un dato falso.
 */
function leerCelda(celda) {
  const bruto = celda?.value
  if (bruto === null || bruto === undefined || bruto === '') {
    return { valor: null, formulaSinCachear: false }
  }
  if (typeof bruto === 'number' || typeof bruto === 'string') return { valor: bruto, formulaSinCachear: false }
  if (typeof bruto === 'object') {
    if ('result' in bruto) {
      const resultado = bruto.result
      // Una formula en error (#DIV/0!) trae { error: '...' } como resultado.
      if (resultado === null || resultado === undefined || typeof resultado === 'object') {
        return { valor: null, formulaSinCachear: true }
      }
      return { valor: resultado, formulaSinCachear: false }
    }
    if ('formula' in bruto || 'sharedFormula' in bruto) {
      return { valor: null, formulaSinCachear: true }
    }
    if ('richText' in bruto) {
      return { valor: bruto.richText.map((t) => t.text).join(''), formulaSinCachear: false }
    }
    if ('text' in bruto) return { valor: bruto.text, formulaSinCachear: false }
  }
  return { valor: null, formulaSinCachear: false }
}

function texto(celda) {
  const { valor } = leerCelda(celda)
  return typeof valor === 'string' ? valor.trim() : valor === null ? '' : String(valor).trim()
}

/**
 * Importe de una celda. Los numeros vienen ya como numeros; el texto puede
 * venir en formato espanol ("1.234,56") si alguna celda se escribio a mano.
 */
function importe(celda) {
  const { valor, formulaSinCachear } = leerCelda(celda)
  if (typeof valor === 'number') {
    return { importe: Number.isFinite(valor) ? redondear(valor) : null, formulaSinCachear }
  }
  if (typeof valor === 'string') {
    const limpio = valor.replace(/[\s €]/g, '')
    if (!limpio) return { importe: null, formulaSinCachear }
    const normalizado =
      limpio.includes(',') && limpio.includes('.')
        ? limpio.split('.').join('').replace(',', '.')
        : limpio.replace(',', '.')
    const n = Number(normalizado)
    return { importe: Number.isFinite(n) ? redondear(n) : null, formulaSinCachear }
  }
  return { importe: null, formulaSinCachear }
}

/** Hojas que parecen anuales, con el año deducido del nombre. */
export async function hojasDelLibro(buffer) {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer)

  return libro.worksheets.map((hoja) => {
    const anio = hoja.name.match(/(20\d{2})/)
    return {
      nombre: hoja.name,
      anio: anio ? Number(anio[1]) : null,
      // Se propone la que empieza por "Cuentas" y trae año en el nombre; el
      // libro tiene cincuenta hojas mas que no son cuentas anuales.
      esCandidata: /^cuentas/i.test(hoja.name.trim()) && !!anio,
    }
  })
}

/**
 * Localiza la fila de meses y, para cada mes, sus dos columnas.
 * Devuelve null si en toda la hoja no hay una fila con nombres de mes.
 */
function localizarCabecera(hoja) {
  const ultimaFila = Math.min(hoja.rowCount, 40)
  const ultimaColumna = Math.min(hoja.columnCount, 80)

  for (let f = 1; f <= ultimaFila; f += 1) {
    const fila = hoja.getRow(f)
    const columnasPorMes = new Map()

    for (let c = 1; c <= ultimaColumna; c += 1) {
      const indice = MESES_NORMALIZADOS.indexOf(normalizar(texto(fila.getCell(c))))
      if (indice === -1) continue
      const columnas = columnasPorMes.get(indice + 1) ?? []
      columnas.push(c)
      columnasPorMes.set(indice + 1, columnas)
    }

    // Con tres meses ya no puede ser casualidad.
    if (columnasPorMes.size >= 3) {
      const meses = [...columnasPorMes.entries()]
        .map(([mes, columnas]) => ({
          mes,
          nombre: NOMBRES_MESES[mes - 1],
          // El importe esta en la segunda columna del par; la primera es la del
          // concepto en el bloque de variables.
          columnaImporte: Math.max(...columnas),
          columnaConcepto: columnas.length > 1 ? Math.min(...columnas) : null,
        }))
        .sort((a, b) => a.mes - b.mes)
      return { fila: f, meses }
    }
  }
  return null
}

/**
 * Lee una hoja anual entera.
 *
 * @returns {{
 *   anio: number|null,
 *   meses: Array,
 *   fijos: Array<{nombre: string, valores: Map<number, number>}>,
 *   totales: {otros: Map, gastos: Map, ingresos: Map},
 *   variables: Map<number, Array<{concepto: string, importe: number}>>,
 *   avisos: string[],
 * }}
 */
export async function leerHoja(buffer, nombreHoja) {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer)

  const hoja = libro.getWorksheet(nombreHoja)
  if (!hoja) throw new ErrorLectura(`La hoja "${nombreHoja}" no existe en el archivo.`)

  const cabecera = localizarCabecera(hoja)
  if (!cabecera) {
    throw new ErrorLectura(
      `En la hoja "${nombreHoja}" no se ha encontrado la fila con los nombres de los meses ` +
        '(Enero, Febrero…). ¿Es una hoja de cuentas anuales?',
    )
  }

  const avisos = []
  const anio = Number(nombreHoja.match(/(20\d{2})/)?.[1]) || null

  const mesSinPar = cabecera.meses.filter((m) => m.columnaConcepto === null)
  if (mesSinPar.length > 0) {
    avisos.push(
      `${mesSinPar.map((m) => m.nombre).join(', ')}: solo ocupan una columna, así que no se ` +
        'puede leer su detalle de gastos variables. Sus fijos sí se importan.',
    )
  }

  // ---------- bloque de fijos ----------

  const fijos = []
  const totales = { otros: new Map(), gastos: new Map(), ingresos: new Map() }
  let filaOtros = null
  let filaFinDelBloque = null

  /**
   * Huecos dejados por formulas sin resultado guardado. No se avisa aqui
   * mismo: una formula en un mes que ademas esta vacio del todo es lo normal en
   * la parte del año que aun no se ha rellenado, y avisar de eso seria ruido.
   * Se guarda donde ha pasado y al final se filtra por los meses con datos.
   */
  const huecos = []

  const valoresDeLaFila = (fila, etiqueta) => {
    const valores = new Map()
    for (const mes of cabecera.meses) {
      const { importe: valor, formulaSinCachear } = importe(fila.getCell(mes.columnaImporte))
      if (valor !== null) valores.set(mes.mes, valor)
      else if (formulaSinCachear) huecos.push({ etiqueta, mes: mes.mes })
    }
    return valores
  }

  for (let f = cabecera.fila + 1; f <= hoja.rowCount; f += 1) {
    const fila = hoja.getRow(f)
    const etiqueta = texto(fila.getCell(1))
    if (!etiqueta) continue

    const clave = normalizar(etiqueta)
    const posicion = FILAS_DE_CIERRE.indexOf(clave)

    if (filaOtros === null && posicion === 0) {
      // Primera "Otros": aqui se acaban los fijos y empiezan los totales.
      filaOtros = f
      totales.otros = valoresDeLaFila(fila, etiqueta)
      continue
    }

    if (filaOtros === null) {
      fijos.push({ nombre: etiqueta, valores: valoresDeLaFila(fila, etiqueta) })
      continue
    }

    // Ya pasado "Otros": solo interesan Gastos, Ingresos y el Ahorro del saldo.
    if (clave === 'gastos' && totales.gastos.size === 0) {
      totales.gastos = valoresDeLaFila(fila, etiqueta)
      continue
    }
    if (clave === 'ingresos' && totales.ingresos.size === 0) {
      totales.ingresos = valoresDeLaFila(fila, etiqueta)
      continue
    }
    if (clave === 'ahorro') {
      // El saldo se recalcula, no se importa. Aqui se cierra el bloque.
      filaFinDelBloque = f
      break
    }
  }

  if (filaOtros === null) {
    throw new ErrorLectura(
      `En la hoja "${nombreHoja}" no se ha encontrado la fila "Otros", que es la que separa los ` +
        'gastos fijos de los totales.',
    )
  }
  if (totales.ingresos.size === 0) {
    avisos.push('No se ha encontrado la fila "Ingresos": los meses se importarán con ingreso 0.')
  }

  // ---------- bloque de detalle de variables ----------

  const variables = new Map()
  const desde = (filaFinDelBloque ?? filaOtros) + 1
  const inicioDetalle = localizarDetalle(hoja, cabecera, desde)

  if (inicioDetalle === null) {
    avisos.push(
      'No se ha encontrado el bloque de detalle de gastos variables. Los meses se importarán ' +
        'solo con sus fijos.',
    )
  } else {
    for (const mes of cabecera.meses) {
      if (mes.columnaConcepto === null) continue
      const apuntes = []
      for (let f = inicioDetalle; f <= hoja.rowCount; f += 1) {
        const fila = hoja.getRow(f)
        const concepto = texto(fila.getCell(mes.columnaConcepto))
        const { importe: valor } = importe(fila.getCell(mes.columnaImporte))
        if (!concepto || valor === null) continue
        apuntes.push({ concepto, importe: valor })
      }
      if (apuntes.length > 0) variables.set(mes.mes, apuntes)
    }
  }

  // Aviso de formulas, ya sabiendo que meses tienen datos de verdad.
  const conDatos = new Set()
  for (const fijo of fijos) for (const mes of fijo.valores.keys()) conDatos.add(mes)
  for (const mes of totales.ingresos.keys()) conDatos.add(mes)
  for (const mes of variables.keys()) conDatos.add(mes)

  const huecosQueImportan = huecos.filter((h) => conDatos.has(h.mes))
  if (huecosQueImportan.length > 0) {
    const nombres = [...new Set(huecosQueImportan.map((h) => NOMBRES_MESES[h.mes - 1]))]
    const filas = [...new Set(huecosQueImportan.map((h) => `"${h.etiqueta}"`))]
    avisos.push(
      `${filas.join(', ')} en ${nombres.join(', ')}: la celda es una fórmula y el archivo no ` +
        'guarda su resultado, así que se importa vacía. Ábrelo en Excel y guárdalo de nuevo si ' +
        'quieres que entre ese importe.',
    )
  }

  return { anio, hoja: nombreHoja, meses: cabecera.meses, fijos, totales, variables, avisos }
}

/**
 * Primera fila del detalle de variables: aquella en la que, para algun mes, la
 * columna del concepto trae texto y la del importe trae un numero. Las filas
 * sueltas que hay entre medias (etiquetas en la columna A, la fila "Total
 * Gastos 70%") no cumplen las dos condiciones a la vez, asi que no confunden.
 */
function localizarDetalle(hoja, cabecera, desde) {
  for (let f = desde; f <= hoja.rowCount; f += 1) {
    const fila = hoja.getRow(f)
    for (const mes of cabecera.meses) {
      if (mes.columnaConcepto === null) continue
      const concepto = texto(fila.getCell(mes.columnaConcepto))
      const { importe: valor } = importe(fila.getCell(mes.columnaImporte))
      if (concepto && valor !== null) return f
    }
  }
  return null
}

/** Error con mensaje pensado para ensenarselo a una persona, no una traza. */
export class ErrorLectura extends Error {
  constructor(mensaje) {
    super(mensaje)
    this.name = 'ErrorLectura'
    this.codigo = 400
  }
}
