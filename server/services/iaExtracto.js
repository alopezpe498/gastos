import { normalizar } from '../db/index.js'
import * as conceptosBd from '../db/conceptos.js'
import { preguntar, extraerJson, ErrorIa, registrarFallo } from './ia.js'

/**
 * Proponer concepto para los movimientos que ninguna regla ha reconocido.
 *
 * UNA SOLA LLAMADA POR EXTRACTO. Preguntar de uno en uno seria veinte veces mas
 * caro y mas lento, y ademas peor: viendo la lista entera el modelo reconoce
 * patrones ("todos estos -Barcelona con codigo raro son Glovo") que aislados no
 * se ven.
 *
 * Las tres reglas de siempre para todo lo que use IA en esta aplicacion:
 *   1. NO escribe nada. Devuelve sugerencias que pasan por la revision.
 *   2. Los conceptos se validan contra el catalogo real; lo que se invente se
 *      tira. Nunca crea conceptos nuevos.
 *   3. Si falla, no pasa nada: los movimientos se quedan sin clasificar y se
 *      avisa. La importacion sigue funcionando igual.
 */

const SISTEMA = `Eres un ayudante que clasifica movimientos de una cuenta bancaria española en los conceptos de una aplicacion de cuentas familiar.

Recibes una lista numerada de cargos (todos son gastos, con su importe en euros) y un CATALOGO de conceptos. Para cada movimiento dices a que concepto del catalogo pertenece.

Responde SOLO con un objeto JSON, sin texto alrededor:
{
  "sugerencias": [
    {"n": 1, "concepto": "Peaje", "confianza": "alta", "porque": "AUTOPISTAS es un peaje de autopista"},
    {"n": 2, "concepto": null, "confianza": "baja", "porque": "No se que es CADEMAR"}
  ]
}

Reglas:
- "concepto" tiene que estar COPIADO EXACTAMENTE del CATALOGO. Si ninguno encaja, pon null. NO te inventes conceptos nuevos: la aplicacion los descartaria igual.
- "confianza" es "alta" si el nombre del comercio lo deja claro, "media" si es probable, "baja" si estas adivinando.
- "porque" es UNA linea corta, en castellano, diciendo en que te has fijado.
- Las descripciones vienen CORTADAS por el banco a unos 45 caracteres ("WWW.AMAZON-LUXEM", "CARREF VINAROZ-V"): reconoce el comercio aunque el nombre este a medias.
- Muchas acaban con el pueblo detras de un guion ("DRUNI-VINAROS"): el comercio es lo de delante.
- Un codigo sin sentido ("BVK11V8J-Barcelona", "13AUG B7DG2ZYM") suele ser un pago por movil de comida a domicilio o de una tienda pequeña. Si no lo tienes claro, pon null con confianza baja.
- Responde una entrada por cada numero que recibas, sin saltarte ninguno.`

const CONFIANZAS = new Set(['alta', 'media', 'baja'])

/**
 * Pide sugerencias para una lista de lineas sin clasificar.
 *
 * Devuelve un mapa de id de linea -> sugerencia. Si la IA no esta configurada o
 * falla, devuelve un mapa vacio y el motivo, y no lanza: quedarse sin
 * sugerencias no puede tumbar una importacion.
 */
export async function sugerirParaExtracto(lineas, { registrar = console } = {}) {
  if (lineas.length === 0) return { sugerencias: {}, aviso: null }

  const catalogo = conceptosBd.listar({ soloActivos: true }).filter((c) => !c.esObjetivo)
  const porNombre = new Map(catalogo.map((c) => [normalizar(c.nombre), c]))

  const texto = [
    'CATALOGO de conceptos (copia el nombre exacto):',
    catalogo.map((c) => `- ${c.nombre} (${c.tipo})`).join('\n'),
    '',
    'MOVIMIENTOS a clasificar:',
    lineas
      .map((l, i) => `${i + 1}. ${l.descripcionLimpia} — ${Math.abs(l.importe).toFixed(2)} €`)
      .join('\n'),
  ].join('\n')

  let crudo
  try {
    crudo = await preguntar({ sistema: SISTEMA, texto })
  } catch (causa) {
    registrarFallo(registrar, 'extracto', causa)
    return {
      sugerencias: {},
      aviso:
        causa instanceof ErrorIa
          ? causa.message
          : 'La IA no ha podido proponer conceptos. Los movimientos se quedan sin clasificar.',
    }
  }

  let respuesta
  try {
    respuesta = extraerJson(crudo)
  } catch (causa) {
    registrarFallo(registrar, 'extracto', causa)
    return { sugerencias: {}, aviso: 'La IA ha contestado algo que no he sabido leer.' }
  }

  const sugerencias = {}
  let inventados = 0

  for (const cruda of respuesta?.sugerencias ?? []) {
    const indice = Number(cruda?.n) - 1
    const linea = lineas[indice]
    if (!linea) continue
    if (!cruda?.concepto) continue

    // Se valida contra el catalogo real: lo que no exista, fuera.
    const concepto = porNombre.get(normalizar(cruda.concepto))
    if (!concepto) {
      inventados += 1
      continue
    }

    sugerencias[linea.id] = {
      conceptoId: concepto.id,
      concepto: concepto.nombre,
      tipo: concepto.tipo,
      confianza: CONFIANZAS.has(cruda.confianza) ? cruda.confianza : 'baja',
      porque: String(cruda.porque ?? '').slice(0, 160),
    }
  }

  const cuantas = Object.keys(sugerencias).length
  return {
    sugerencias,
    aviso:
      inventados > 0
        ? `La IA ha propuesto ${inventados} conceptos que no existen en tu catálogo y se han descartado.`
        : null,
    cuantas,
  }
}
