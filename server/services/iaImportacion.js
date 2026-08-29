import ExcelJS from 'exceljs'
import { normalizar } from '../db/index.js'
import * as conceptosBd from '../db/conceptos.js'
import { preguntar, extraerLista, extraerJson, ErrorIa, registrarFallo } from './ia.js'
import { NOMBRES_MESES } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

/**
 * Lo que la IA aporta a la importacion.
 *
 * Tres reglas que valen para todo este modulo:
 *
 * 1. LA IA NUNCA ESCRIBE EN LA BASE DE DATOS. Todo lo que sale de aqui son
 *    propuestas que pasan por la pantalla de revision.
 * 2. LO QUE PROPONE SE VALIDA CONTRA EL CATALOGO REAL. Un modelo puede
 *    inventarse un concepto que no existe; si el nombre no esta en la lista que
 *    se le paso, la sugerencia se tira.
 * 3. EL PARSER DETERMINISTA MANDA. La IA solo entra donde el parser no llega:
 *    proponer a que concepto va un nombre nuevo, y leer una hoja con un formato
 *    que no reconoce.
 */

/** Tope de caracteres de hoja que se manda al modelo. */
const MAX_TEXTO_HOJA = 60_000

// ---------------------------------------------------------------------------
// 1. Sugerir a que concepto va cada nombre nuevo
// ---------------------------------------------------------------------------

const SISTEMA_SUGERIR = `Eres un ayudante que empareja nombres de gastos domesticos escritos a mano en una hoja de Excel con el catalogo de conceptos de una aplicacion de cuentas.

Recibes dos listas:
- NUEVOS: nombres tal como aparecen escritos en la hoja.
- CATALOGO: los conceptos que existen en la aplicacion.

Para cada nombre de NUEVOS decide si es el MISMO concepto que alguno del CATALOGO escrito de otra forma (abreviado, con una errata, con o sin tildes, en singular o plural) o si de verdad es un concepto distinto.

Responde SOLO con un array JSON, sin texto alrededor, con esta forma:
[{"nombre":"<el nombre exacto de NUEVOS>","concepto":"<el nombre exacto del CATALOGO o null>","confianza":0.0,"motivo":"<seis palabras como mucho>"}]

Reglas:
- "concepto" tiene que ser EXACTAMENTE uno de los del CATALOGO, copiado tal cual. Si no lo es, pon null.
- Si no estas razonablemente seguro, pon null. Equivocarse aqui mezcla gastos de categorias distintas durante años.
- "confianza" va de 0 a 1.
- Un nombre que es claramente otra cosa (un concepto que no existia) lleva null y confianza 0.
- No inventes nombres que no esten en ninguna de las dos listas.`

/**
 * Propone, para cada nombre nuevo, a que concepto existente podria ir.
 * Devuelve solo las sugerencias que apuntan a un concepto que existe de verdad.
 */
export async function sugerirConceptos(nombresNuevos) {
  const nombres = [...new Set(nombresNuevos.map((n) => String(n).trim()).filter(Boolean))]
  if (nombres.length === 0) return []

  const catalogo = conceptosBd.listar()
  const porNombre = new Map(catalogo.map((c) => [normalizar(c.nombre), c]))

  const { texto, truncado } = await preguntar({
    sistema: SISTEMA_SUGERIR,
    texto: [
      'NUEVOS:',
      ...nombres.map((n) => `- ${n}`),
      '',
      'CATALOGO:',
      ...catalogo.map((c) => `- ${c.nombre} (${c.tipo})`),
    ].join('\n'),
  })

  if (truncado) {
    throw new ErrorIa('La respuesta de la IA se ha cortado. Prueba con menos conceptos de golpe.')
  }

  const pedidos = new Set(nombres.map((n) => normalizar(n)))

  return extraerLista(texto)
    .map((cruda) => {
      const nombre = String(cruda?.nombre ?? '').trim()
      // Solo se acepta lo que se preguntó: si el modelo se inventa una fila con
      // un nombre que no estaba en NUEVOS, fuera.
      if (!nombre || !pedidos.has(normalizar(nombre))) return null

      const propuesto = cruda?.concepto ? String(cruda.concepto).trim() : ''
      if (!propuesto) return null

      // Y solo se acepta si apunta a un concepto que existe de verdad.
      const concepto = porNombre.get(normalizar(propuesto))
      if (!concepto) return null

      const confianza = Number(cruda?.confianza)
      return {
        nombreExcel: nombres.find((n) => normalizar(n) === normalizar(nombre)) ?? nombre,
        conceptoId: concepto.id,
        conceptoNombre: concepto.nombre,
        confianza: Number.isFinite(confianza) ? Math.min(1, Math.max(0, confianza)) : 0.5,
        motivo: String(cruda?.motivo ?? '').trim().slice(0, 80),
      }
    })
    .filter(Boolean)
    // Lo dudoso no se ensena: una sugerencia floja cuesta mas de revisar que de
    // hacer a mano.
    .filter((s) => s.confianza >= 0.5)
    .sort((a, b) => b.confianza - a.confianza)
}

// ---------------------------------------------------------------------------
// 2. Plan B: leer una hoja cuyo formato el parser no reconoce
// ---------------------------------------------------------------------------

const SISTEMA_HOJA = `Eres un ayudante que lee hojas de calculo de cuentas domesticas en castellano y las convierte en datos estructurados.

Recibes el volcado de una hoja de Excel (fila, celda y valor). Extrae los gastos e ingresos que encuentres.

Responde SOLO con un objeto JSON, sin texto alrededor:
{
  "anio": 2025,
  "movimientos": [
    {"mes":1,"concepto":"Hipoteca","importe":622.53,"tipo":"fijo"},
    {"mes":1,"concepto":"Amazon","importe":63.99,"tipo":"variable"}
  ],
  "ingresos": [{"mes":1,"importe":3252.15}],
  "notas": ["lo que no hayas sabido interpretar"]
}

Reglas:
- "mes" es un numero del 1 al 12.
- "importe" es un numero, con punto decimal. PUEDE SER NEGATIVO si es una devolucion.
- "tipo" es "fijo" para los recibos que se repiten todos los meses (hipoteca, seguros, comunidad, telefono, colegio) y "variable" para los gastos sueltos (compras, bares, gasolina, regalos).
- NO inventes importes. Si una celda esta vacia o no se entiende, no la incluyas y dilo en "notas".
- NO incluyas filas de totales ni de resumen: "Gastos", "Gastos Fijos", "Gastos Extras", "Otros", "Total", "Suma", "Sobrante", "Ahorro", "Saldo", "Ingresos", "Gastado en Comida", "Queda para comer", "Dinero en Cta", "Quedan", "Pendiente". Solo conceptos reales; los totales se recalculan solos.
- OJO: "Gastos Niñas" SI es un concepto real, no un total. Lo que descarta una fila es que sea una suma de otras, no que empiece por "Gastos".
- Si la hoja trae una fila de saldo o de ahorro calculado, ignorala.
- Si no encuentras ningun movimiento, devuelve "movimientos": [].`

/** Volcado compacto de una hoja: fila, columna y valor, solo lo que tiene algo. */
export async function hojaATexto(buffer, nombreHoja) {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer)
  const hoja = libro.getWorksheet(nombreHoja)
  if (!hoja) throw new ErrorIa(`La hoja "${nombreHoja}" no existe en el archivo.`, 400)

  const lineas = []
  let caracteres = 0

  for (let f = 1; f <= hoja.rowCount; f += 1) {
    const fila = hoja.getRow(f)
    const celdas = []
    for (let c = 1; c <= Math.min(hoja.columnCount, 60); c += 1) {
      let valor = fila.getCell(c).value
      if (valor && typeof valor === 'object') {
        if ('result' in valor) valor = valor.result
        else if ('richText' in valor) valor = valor.richText.map((t) => t.text).join('')
        else if ('text' in valor) valor = valor.text
        else valor = null
      }
      if (valor === null || valor === undefined || valor === '') continue
      if (typeof valor === 'object') continue
      if (typeof valor === 'number') valor = Math.round(valor * 100) / 100
      celdas.push(`${letraDeColumna(c)}=${String(valor).slice(0, 40)}`)
    }
    if (celdas.length === 0) continue

    const linea = `f${f}: ${celdas.join(' | ')}`
    caracteres += linea.length + 1
    if (caracteres > MAX_TEXTO_HOJA) {
      lineas.push('[...la hoja sigue, pero se ha cortado por tamaño...]')
      break
    }
    lineas.push(linea)
  }

  if (lineas.length === 0) throw new ErrorIa(`La hoja "${nombreHoja}" esta vacia.`, 400)
  return lineas.join('\n')
}

function letraDeColumna(numero) {
  let letra = ''
  let n = numero
  while (n > 0) {
    letra = String.fromCharCode(65 + ((n - 1) % 26)) + letra
    n = Math.floor((n - 1) / 26)
  }
  return letra
}

/**
 * Lee una hoja con IA y devuelve una LECTURA con la misma forma que produce el
 * parser determinista, para que vistaPreviaDeLectura() no note la diferencia.
 */
export async function leerHojaConIa(buffer, nombreHoja) {
  const volcado = await hojaATexto(buffer, nombreHoja)
  const anioDelNombre = Number(nombreHoja.match(/(20\d{2})/)?.[1]) || null

  const { texto, truncado } = await preguntar({
    sistema: SISTEMA_HOJA,
    texto: [
      anioDelNombre ? `La hoja se llama "${nombreHoja}", asi que el año es ${anioDelNombre}.` : '',
      'Volcado de la hoja:',
      volcado,
    ]
      .filter(Boolean)
      .join('\n'),
  })

  if (truncado) {
    throw new ErrorIa(
      'La respuesta de la IA se ha cortado: la hoja tiene demasiados datos. Prueba con una hoja de un solo año.',
    )
  }

  const crudo = extraerJson(texto)
  const anio = Number(crudo?.anio) || anioDelNombre
  if (!anio) {
    throw new ErrorIa(
      'No se ha podido deducir de qué año es la hoja. Renombrala como "Cuentas2025" y reintenta.',
      400,
    )
  }

  return construirLectura({ crudo, anio, nombreHoja })
}

/**
 * Convierte lo que devuelve el modelo en la estructura que espera el resto de
 * la importacion. Aqui se filtra todo lo que no tenga sentido: meses fuera de
 * rango, importes que no son numeros, filas de totales que se hayan colado.
 */
function construirLectura({ crudo, anio, nombreHoja }) {
  const avisos = []
  const fijosPorNombre = new Map()
  const variables = new Map()
  const ingresos = new Map()

  /*
   * Nombres que son filas de totales, no conceptos. El prompt ya lo pide, pero
   * un modelo se despista: en la primera prueba contra la hoja real se colo
   * "Gastos Extras", que es un resumen, no un gasto.
   *
   * La lista es la de las filas de resumen que de verdad hay en estas hojas.
   * No vale filtrar por prefijo "Gastos ": "Gastos Niñas" es un concepto real.
   */
  const TOTALES = new Set(
    [
      'gastos',
      'gastos extras',
      'gastos extra',
      'gastos ext',
      'gastos fijos',
      'gastos totales',
      'gastado en comida',
      'queda para comer',
      'otros',
      'total',
      'totales',
      'suma',
      'subtotal',
      'ahorro',
      'ingresos',
      'saldo',
      'sobrante',
      'quedan',
      'pendiente',
      'dinero en cta',
      'dinero en cuenta',
    ].map((n) => normalizar(n)),
  )

  // Y cualquier cosa que empiece por "total": "Total Gastos 70%" y parientes.
  const esTotal = (nombre) => {
    const clave = normalizar(nombre)
    return TOTALES.has(clave) || clave.startsWith('total ')
  }

  // Se cuentan por separado a proposito: que se filtre una fila de totales es
  // lo normal y no hay nada que mirar; que una linea sea ilegible significa que
  // se ha perdido un dato, y eso si conviene saberlo.
  let ilegibles = 0
  let totalesFiltrados = 0

  for (const linea of Array.isArray(crudo?.movimientos) ? crudo.movimientos : []) {
    const mes = Number(linea?.mes)
    const importe = Number(linea?.importe)
    const concepto = String(linea?.concepto ?? '').trim()

    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !concepto || !Number.isFinite(importe)) {
      ilegibles += 1
      continue
    }
    if (esTotal(concepto)) {
      totalesFiltrados += 1
      continue
    }

    if (linea?.tipo === 'fijo') {
      const valores = fijosPorNombre.get(concepto) ?? new Map()
      // Si el modelo repite un fijo en el mismo mes, se suman: es lo mismo que
      // haria la hoja.
      valores.set(mes, redondear((valores.get(mes) ?? 0) + importe))
      fijosPorNombre.set(concepto, valores)
    } else {
      const lista = variables.get(mes) ?? []
      lista.push({ concepto, importe: redondear(importe) })
      variables.set(mes, lista)
    }
  }

  for (const linea of Array.isArray(crudo?.ingresos) ? crudo.ingresos : []) {
    const mes = Number(linea?.mes)
    const importe = Number(linea?.importe)
    if (Number.isInteger(mes) && mes >= 1 && mes <= 12 && Number.isFinite(importe)) {
      ingresos.set(mes, redondear(importe))
    }
  }

  if (ilegibles > 0) {
    avisos.push(
      `${ilegibles} ${ilegibles === 1 ? 'línea venía' : 'líneas venían'} con el mes fuera de rango ` +
        'o el importe ilegible. Se han descartado: mira esa parte de la hoja por si falta algo.',
    )
  }
  if (totalesFiltrados > 0) {
    avisos.push(
      `Se ${totalesFiltrados === 1 ? 'ha' : 'han'} descartado ${totalesFiltrados} ` +
        `${totalesFiltrados === 1 ? 'fila de totales' : 'filas de totales'} ("Gastos", "Otros"…). ` +
        'Es lo esperado: los totales se recalculan aquí.',
    )
  }
  for (const nota of Array.isArray(crudo?.notas) ? crudo.notas.slice(0, 5) : []) {
    const limpia = String(nota ?? '').trim()
    if (limpia) avisos.push(`La IA avisa: ${limpia}`)
  }

  avisos.push(
    'Esta hoja la ha leído la IA, no el lector de hojas anuales. Revisa los importes mes a mes ' +
      'antes de confirmar: aquí no hay una fila "Gastos" con la que contrastar.',
  )

  return {
    anio,
    hoja: nombreHoja,
    origenLectura: 'ia',
    meses: NOMBRES_MESES.map((nombre, indice) => ({
      mes: indice + 1,
      nombre,
      columnaImporte: null,
      columnaConcepto: null,
    })),
    fijos: [...fijosPorNombre.entries()].map(([nombre, valores]) => ({ nombre, valores })),
    // Sin fila "Otros" ni "Gastos" no hay nada con lo que contrastar: se dejan
    // vacias y la vista previa no ensena descuadres inventados.
    totales: { otros: new Map(), gastos: new Map(), ingresos },
    variables,
    avisos,
  }
}

/** Envuelve una llamada de IA dejando el fallo completo en el log. */
export async function conRegistro(etiqueta, tarea) {
  try {
    return await tarea()
  } catch (causa) {
    registrarFallo(console, `[gastos][ia] ${etiqueta}`, causa)
    throw causa
  }
}
