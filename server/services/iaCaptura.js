import { normalizar } from '../db/index.js'
import * as conceptosBd from '../db/conceptos.js'
import * as movimientosBd from '../db/movimientos.js'
import { preguntar, extraerJson, ErrorIa } from './ia.js'
import { claveMes, diasDelMes, esFechaIso, NOMBRES_MESES } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

/**
 * Leer gastos de una foto, de una captura o de un texto pegado.
 *
 * Un solo prompt para los tres casos, y es el modelo quien dice cual es. Tener
 * tres prompts obligaria a clasificar antes lo que ha llegado, que es
 * exactamente el problema que se le esta pidiendo resolver a el.
 *
 * Como en el resto del modulo de IA: esto NO escribe nada. Devuelve propuestas
 * que pasan por la pantalla de revision, y los conceptos se validan contra el
 * catalogo real antes de salir de aqui.
 */

const SISTEMA = `Eres un ayudante que lee gastos domesticos y los convierte en apuntes de una aplicacion de cuentas familiar en castellano.

Lo que recibes puede ser una de estas tres cosas. Averigua cual es y dilo en "tipo":

- "ticket": la foto o el escaneo de un ticket de compra.
- "factura": una factura o un recibo (del comedor del colegio, de la luz, del gimnasio), normalmente sacada de un PDF. Suele traer un periodo, un concepto y un total.
- "hoja": la captura de pantalla de una hoja de calculo de cuentas (filas de concepto e importe, quiza con una columna de si esta cobrado, el ingreso del mes y el dinero en cuenta).
- "lista": texto suelto. Una tabla copiada de un Excel, una lista "concepto importe" por lineas, o una frase como "Amazon 63,99 y farmacia 4,72".

Responde SOLO con un objeto JSON, sin texto alrededor:
{
  "tipo": "factura",
  "comercio": "Mercadona",
  "total": 63.99,
  "movimientos": [
    {"concepto":"Amazon","importe":63.99,"fecha":"2026-08-14","descripcion":"","tipo":"variable","cobrado":true}
  ],
  "ingreso": null,
  "dineroEnCuenta": null,
  "notas": []
}

Reglas:
- "concepto" tiene que salir del CATALOGO que se te da, copiado EXACTAMENTE. Solo si de verdad no encaja ninguno, escribe uno nuevo y sera revisado a mano.
- "importe" es un numero con punto decimal. Los importes vienen en euros y en formato espanol: "1.234,56" son mil doscientos treinta y cuatro con cincuenta y seis. PUEDE SER NEGATIVO si es una devolucion o un abono.
- "fecha" en formato AAAA-MM-DD, o null si no aparece. No te la inventes.
- "tipo" es "fijo" (recibos que se repiten: hipoteca, seguros, comunidad, telefono), "variable" (gastos sueltos) o "sobre" (la compra de comida).
- "cobrado" es true si consta como pagado o cobrado, false si consta como pendiente, null si no se dice. OJO con las columnas de una sola letra: en estas hojas "S" quiere decir SI (ya cobrado, true) y "N" quiere decir NO (pendiente, false). Tambien valen "Si"/"No", una equis, o una casilla marcada.
- "ingreso" y "dineroEnCuenta" SOLO cuando sean una captura de una hoja del mes y aparezcan de verdad. Si no, null.
- NO incluyas filas de totales, sumas ni saldos: "Total", "Gastos", "Otros", "Suma", "Subtotal", "Sobrante", "Ahorro", "Base imponible", "IVA".
- Si es un TICKET de supermercado o de alimentacion, ademas de "total" pon en "movimientos" UNA LINEA POR PRODUCTO que consigas leer. La aplicacion decide luego si guarda el total o el desglose.
- Si es una FACTURA, pon el importe TOTAL A PAGAR en "total" y en "movimientos" una sola linea con el concepto que corresponda del CATALOGO. No desgloses las lineas internas de la factura (base, IVA, descuentos, consumos parciales): lo que se apunta es lo que se paga.
- En una factura, "fecha" es la fecha de emision o de cargo, no el periodo facturado.
- Si algo no se lee bien, no lo inventes: dejalo fuera y dilo en "notas".`

const TOTALES = new Set(
  [
    'total',
    'total a pagar',
    'subtotal',
    'suma',
    'gastos',
    'otros',
    'sobrante',
    'ahorro',
    'saldo',
    'base imponible',
    'iva',
    'importe',
    'a pagar',
    'entrega',
    'cambio',
    'efectivo',
    'tarjeta',
  ].map((n) => normalizar(n)),
)

/**
 * @param {object} entrada
 * @param {{datos: string, tipo: string}} [entrada.imagen]
 * @param {string} [entrada.texto]
 * @param {{anio: number, mes: number}} entrada.mesReferencia mes al que se apunta
 * @param {string} [entrada.pista] lo que el usuario diga que es, si lo dice
 */
export async function leerCaptura({ imagen, texto, mesReferencia, pista, esPdf = false }) {
  if (!imagen && !texto) throw new ErrorIa('No ha llegado ni imagen ni texto que leer.', 400)

  const catalogo = conceptosBd.listar({ soloActivos: true })
  const porNombre = new Map(catalogo.map((c) => [normalizar(c.nombre), c]))
  const alias = new Map()
  for (const concepto of catalogo) {
    for (const a of conceptosBd.alias(concepto.id)) alias.set(normalizar(a.alias), concepto)
  }

  const mesTexto = `${NOMBRES_MESES[mesReferencia.mes - 1]} de ${mesReferencia.anio}`
  const contexto = [
    `El mes al que se van a apuntar estos gastos es ${mesTexto}. Si un gasto no trae fecha, dejala en null.`,
    esPdf
      ? 'Lo que viene es el TEXTO EXTRAIDO DE UN PDF, casi seguro una factura o un recibo. Los saltos de linea son los de la pagina.'
      : '',
    pista ? `El usuario dice: ${pista}` : '',
    '',
    'CATALOGO de conceptos (usa estos nombres, copiados tal cual):',
    ...catalogo.map((c) => `- ${c.nombre} (${c.tipo})`),
    '',
    texto ? 'CONTENIDO:' : 'La imagen adjunta es lo que hay que leer.',
    texto ? texto.slice(0, 40_000) : '',
  ]
    .filter(Boolean)
    .join('\n')

  const { texto: respuesta, truncado } = await preguntar({
    sistema: SISTEMA,
    texto: contexto,
    imagen,
  })

  if (truncado) {
    throw new ErrorIa(
      'La respuesta de la IA se ha cortado: hay demasiadas líneas. Prueba con una foto de menos contenido.',
    )
  }

  return normalizarCaptura({
    crudo: extraerJson(respuesta),
    mesReferencia,
    porNombre,
    alias,
  })
}

/** Valida y limpia lo que ha devuelto el modelo. Nada sale de aqui sin pasar. */
function normalizarCaptura({ crudo, mesReferencia, porNombre, alias }) {
  const avisos = []
  const tipo = ['ticket', 'factura', 'hoja', 'lista'].includes(crudo?.tipo) ? crudo.tipo : 'lista'
  const clave = claveMes(mesReferencia.anio, mesReferencia.mes)
  const ultimoDia = diasDelMes(mesReferencia.anio, mesReferencia.mes)

  let descartados = 0

  const movimientos = (Array.isArray(crudo?.movimientos) ? crudo.movimientos : [])
    .map((linea) => {
      const nombre = String(linea?.concepto ?? '').trim()
      const importe = Number(linea?.importe)

      if (!nombre || !Number.isFinite(importe) || TOTALES.has(normalizar(nombre))) {
        descartados += 1
        return null
      }

      // El concepto se busca en el catalogo y en los alias; si no esta, se
      // propone como nuevo y la pantalla de revision lo marcara.
      const existente = porNombre.get(normalizar(nombre)) ?? alias.get(normalizar(nombre)) ?? null

      return {
        concepto: existente?.nombre ?? nombre,
        conceptoId: existente?.id ?? null,
        // Un concepto que no existe hay que decidirlo a mano antes de guardar.
        nuevo: !existente,
        importe: redondear(importe),
        fecha: fechaValida(linea?.fecha, clave, ultimoDia),
        descripcion: String(linea?.descripcion ?? '').trim().slice(0, 200),
        tipo: existente?.tipo ?? (linea?.tipo === 'fijo' ? 'fijo' : 'variable'),
        cobrado: typeof linea?.cobrado === 'boolean' ? linea.cobrado : null,
      }
    })
    .filter(Boolean)

  if (descartados > 0) {
    avisos.push(
      `Se han descartado ${descartados} ${descartados === 1 ? 'línea' : 'líneas'}: eran totales o ` +
        'no tenían un importe legible.',
    )
  }
  for (const nota of Array.isArray(crudo?.notas) ? crudo.notas.slice(0, 4) : []) {
    const limpia = String(nota ?? '').trim()
    if (limpia) avisos.push(`La IA avisa: ${limpia}`)
  }

  const total = Number(crudo?.total)
  const sumaLineas = redondear(movimientos.reduce((t, m) => t + m.importe, 0))

  /*
   * Un ticket de la compra se propone como UN SOLO apunte del sobre Comida con
   * el total. Meter cuarenta lineas de supermercado en el historial no dice
   * nada que no diga el total, y ensucia el ranking de conceptos para siempre.
   * El desglose se guarda aparte por si se quiere abrir.
   */
  let propuesta = movimientos
  let desglose = []

  if (tipo === 'factura' && movimientos.length > 0) {
    const importeFactura = Number.isFinite(total) && total !== 0 ? redondear(total) : sumaLineas
    const principal = movimientos.reduce((a, b) => (Math.abs(b.importe) > Math.abs(a.importe) ? b : a))
    const comercio = String(crudo?.comercio ?? '').trim().slice(0, 60)

    desglose = movimientos.length > 1 ? movimientos : []
    propuesta = [{ ...principal, importe: importeFactura, descripcion: principal.descripcion || comercio }]

    if (desglose.length > 0 && Math.abs(sumaLineas - importeFactura) > 0.02) {
      avisos.push(
        `La factura suma ${importeFactura} € en total. Se propone ese importe en una sola línea; ` +
          'si quieres las líneas por separado, desglósala.',
      )
    }
  }

  if (tipo === 'ticket') {
    const sobre = conceptosBd.sobrePrincipal()
    const importeTicket = Number.isFinite(total) && total !== 0 ? redondear(total) : sumaLineas
    const fecha = movimientos.find((m) => m.fecha)?.fecha ?? null
    const comercio = String(crudo?.comercio ?? '').trim().slice(0, 60)

    if (sobre && importeTicket !== 0) {
      desglose = movimientos
      propuesta = [
        {
          concepto: sobre.nombre,
          conceptoId: sobre.id,
          nuevo: false,
          importe: importeTicket,
          fecha,
          descripcion: comercio,
          tipo: 'sobre',
          cobrado: true,
        },
      ]

      if (desglose.length > 0 && Math.abs(sumaLineas - importeTicket) > 0.02) {
        avisos.push(
          `El total del ticket (${importeTicket} €) no cuadra con la suma de sus líneas ` +
            `(${sumaLineas} €). Se propone el total, que es el que suele estar bien leído.`,
        )
      }
    }
  }

  return {
    tipo,
    comercio: String(crudo?.comercio ?? '').trim().slice(0, 60) || null,
    movimientos: propuesta,
    desglose,
    // Solo tienen sentido en una captura de la hoja del mes.
    ingreso: tipo === 'hoja' ? numeroONull(crudo?.ingreso) : null,
    dineroEnCuenta: tipo === 'hoja' ? numeroONull(crudo?.dineroEnCuenta) : null,
    avisos,
  }
}

function numeroONull(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? redondear(n) : null
}

/**
 * Una fecha solo se acepta si es real y cae dentro del mes al que se apunta.
 * Un modelo se inventa el año con facilidad, y un apunte de agosto fechado en
 * marzo se pierde de vista para siempre.
 */
function fechaValida(valor, claveDelMes, ultimoDia) {
  if (!esFechaIso(valor)) return null
  if (!valor.startsWith(claveDelMes)) return null
  const dia = Number(valor.slice(8, 10))
  return dia >= 1 && dia <= ultimoDia ? valor : null
}

/**
 * Guarda los movimientos revisados. Lo que llega aqui ya lo ha mirado una
 * persona: se valida la forma, no el criterio.
 */
export function aplicarCaptura({ mes, lineas, origen }) {
  const creados = []

  for (const linea of lineas) {
    const conceptoId = Number(linea?.conceptoId)
    const concepto = Number.isInteger(conceptoId) ? conceptosBd.obtener(conceptoId) : null
    if (!concepto) continue

    const importe = Number(linea?.importe)
    if (!Number.isFinite(importe)) continue

    const fecha = esFechaIso(linea?.fecha) ? linea.fecha : `${mes.clave}-01`

    creados.push(
      movimientosBd.crear({
        mesId: mes.id,
        conceptoId: concepto.id,
        importe: redondear(importe),
        // Un apunte suelto no tiene "previsto": eso es cosa de los fijos que
        // genera la apertura del mes.
        fechaCobro: linea?.cobrado === false ? null : fecha,
        descripcion: String(linea?.descripcion ?? '').slice(0, 200),
        origen,
      }),
    )
  }

  return creados
}
