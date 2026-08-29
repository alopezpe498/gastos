import ExcelJS from 'exceljs'

/**
 * Genera un libro con el MISMO formato que las hojas anuales de verdad, con
 * todas sus rarezas puestas a proposito:
 *
 *   - cada mes ocupa dos columnas y el importe va en la segunda
 *   - "Ahorro" aparece dos veces: como concepto fijo y como fila de saldo
 *   - hay una fila de etiquetas sueltas entre el bloque de totales y el detalle
 *   - un importe negativo (una devolucion)
 *   - una formula sin resultado cacheado, como las de los meses aun sin rellenar
 *   - un mes en el que la fila "Otros" NO cuadra con la suma de sus apuntes
 *   - un nombre mal escrito ("Gimasio") que en la aplicacion tiene alias
 *
 * Si alguna de estas cosas deja de estar cubierta, el parser puede romperse con
 * el archivo real sin que ninguna prueba se entere.
 */

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/** Columna del importe del mes N (1..12): C, E, G… */
export const columnaImporte = (mes) => 3 + (mes - 1) * 2
/** Columna del concepto del mes N, la de su izquierda: B, D, F… */
export const columnaConcepto = (mes) => 2 + (mes - 1) * 2

export const FILA_CABECERA = 4

/**
 * Datos del año de ejemplo. Solo tres meses con datos, para que las pruebas
 * puedan comprobar que los meses vacios no se importan.
 */
export const EJEMPLO = {
  anio: 2023,
  fijos: [
    { nombre: 'Telf BCN', valores: { 1: 44, 2: 44, 3: 44 } },
    { nombre: 'Hipoteca', valores: { 1: 622.53, 2: 622.53, 3: 622.53 } },
    // Un cero es un dato: ese mes no lo cobraron. Y en marzo la celda es una
    // formula sin resultado guardado, que no es lo mismo que un cero.
    { nombre: 'Seguro Vida', valores: { 1: 0, 2: 21.87 }, formulaEn: [3] },
    { nombre: 'Comida', valores: { 1: 400, 2: 450, 3: 500 } },
    { nombre: 'Luz,Gas,Agua,IBI', valores: { 1: 94.51, 2: 178.64, 3: 108.85 } },
    { nombre: 'Gimasio', valores: { 1: 19.99, 2: 19.99, 3: 19.99 } },
    // El ahorro como concepto fijo: en la hoja es un gasto mas, aqui no.
    { nombre: 'Ahorro', valores: { 1: 500, 2: 500, 3: 0 } },
  ],
  variables: {
    1: [
      ['JustEat', 42.75],
      ['Amazon', 199.89],
      ['Bar', 24],
      // Una devolucion.
      ['Préstamo', -100],
    ],
    2: [
      ['Gasolina', 71.49],
      ['Farmacia', 9.42],
    ],
    // Marzo tiene un unico apunte, pero la fila "Otros" dice 250: 100 de
    // descuadre que la importacion tiene que detectar y ofrecer ajustar.
    3: [['Taxi', 150]],
  },
  otros: { 1: 166.64, 2: 80.91, 3: 250 },
  ingresos: { 1: 3252.15, 2: 3243.71, 3: 3314 },
}

/** Suma de la fila "Gastos" tal como la calcularia la hoja: TODO incluido. */
function gastosDeLaHoja(mes) {
  const fijos = EJEMPLO.fijos.reduce((total, f) => total + (f.valores[mes] ?? 0), 0)
  return Math.round((fijos + EJEMPLO.otros[mes]) * 100) / 100
}

/**
 * @param {object} opciones
 * @param {boolean} opciones.conFormulaSinCachear  añade una formula sin
 *        resultado guardado, como las de los meses que aun no se han rellenado.
 * @returns {Promise<Buffer>}
 */
export async function libroDeEjemplo({ conFormulaSinCachear = true } = {}) {
  const libro = new ExcelJS.Workbook()

  // Una hoja que no son cuentas, para comprobar que no se ofrece como candidata.
  libro.addWorksheet('Notas').getCell('A1').value = 'Esto no es una hoja de cuentas'

  const hoja = libro.addWorksheet(`Cuentas${EJEMPLO.anio}`)

  // Cabecera: el nombre del mes en las DOS columnas del par.
  const cabecera = hoja.getRow(FILA_CABECERA)
  for (let mes = 1; mes <= 12; mes += 1) {
    cabecera.getCell(columnaConcepto(mes)).value = MESES[mes - 1]
    cabecera.getCell(columnaImporte(mes)).value = MESES[mes - 1]
  }

  let fila = FILA_CABECERA + 1

  for (const fijo of EJEMPLO.fijos) {
    const actual = hoja.getRow(fila)
    actual.getCell(1).value = fijo.nombre
    for (const [mes, valor] of Object.entries(fijo.valores)) {
      actual.getCell(columnaImporte(Number(mes))).value = valor
    }
    for (const mes of fijo.formulaEn ?? []) {
      actual.getCell(columnaImporte(mes)).value = { formula: `SUM(${columnaImporte(mes)}1:1)` }
    }
    fila += 1
  }

  const totales = [
    ['Otros', EJEMPLO.otros],
    ['Gastos', Object.fromEntries([1, 2, 3].map((m) => [m, gastosDeLaHoja(m)]))],
    ['Ingresos', EJEMPLO.ingresos],
    // El saldo: se ignora al importar, pero tiene que cerrar el bloque.
    ['Ahorro', Object.fromEntries([1, 2, 3].map((m) => [m, EJEMPLO.ingresos[m] - gastosDeLaHoja(m)]))],
  ]

  for (const [nombre, valores] of totales) {
    const actual = hoja.getRow(fila)
    actual.getCell(1).value = nombre
    for (const [mes, valor] of Object.entries(valores)) {
      actual.getCell(columnaImporte(Number(mes))).value = Math.round(valor * 100) / 100
    }
    if (nombre === 'Otros' && conFormulaSinCachear) {
      // Abril: formula sin resultado guardado. El parser tiene que tratarla
      // como celda vacia y avisar, no como un cero.
      actual.getCell(columnaImporte(4)).value = { formula: 'SUM(H10:H30)' }
    }
    fila += 1
  }

  // Etiquetas sueltas en la columna A, como las de la hoja real ("Colegio Nur",
  // "Comida Sem 1"…). No deben confundirse con conceptos ni con el detalle.
  fila += 1
  for (const suelta of ['Colegio Nur', 'Comida Sem 1', 'Total Gastos 70%']) {
    hoja.getRow(fila).getCell(1).value = suelta
    fila += 1
  }

  // Detalle de variables: pares (concepto, importe) bajo cada mes.
  const primeraDelDetalle = fila + 1
  for (const [mes, apuntes] of Object.entries(EJEMPLO.variables)) {
    apuntes.forEach(([concepto, importe], indice) => {
      const suya = hoja.getRow(primeraDelDetalle + indice)
      suya.getCell(columnaConcepto(Number(mes))).value = concepto
      suya.getCell(columnaImporte(Number(mes))).value = importe
    })
  }

  return Buffer.from(await libro.xlsx.writeBuffer())
}

/** Lo que la aplicacion deberia calcular como gastos de un mes del ejemplo. */
export function gastosEsperados(mes) {
  const fijos = EJEMPLO.fijos
    .filter((f) => f.nombre !== 'Comida' && f.nombre !== 'Ahorro')
    .reduce((total, f) => total + (f.valores[mes] ?? 0), 0)
  const comida = EJEMPLO.fijos.find((f) => f.nombre === 'Comida').valores[mes]
  const variables = EJEMPLO.variables[mes].reduce((total, [, importe]) => total + importe, 0)
  return Math.round((fijos + comida + variables) * 100) / 100
}
