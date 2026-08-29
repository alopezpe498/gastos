// Unico punto del sistema que habla con los proveedores de IA. El navegador
// nunca llama a Anthropic ni a OpenAI: siempre pasa por aqui, para que la clave
// no salga del servidor ni aparezca en los logs.
//
// La interfaz es una sola funcion, preguntar(), y el proveedor se elige en
// Ajustes: lo que hay por debajo (SDK de Anthropic o HTTP contra OpenAI) no lo
// ve nadie mas.
import Anthropic from '@anthropic-ai/sdk'
import * as configBd from '../db/config.js'

const TIEMPO_LIMITE_MS = 90_000

// Techo de tokens de respuesta, por proveedor. El limite de salida depende del
// modelo y OpenAI contesta 400 al instante si te pasas (gpt-4o-mini admite
// 16.384), asi que pedir "de sobra" no es gratis: tumba la llamada entera.
// Con lotes de pocas decenas de valores una respuesta ronda los 2-3K tokens,
// de modo que este margen sobra en ambos proveedores.
const MAX_TOKENS = { anthropic: 32_000, openai: 16_000 }
const MAX_TOKENS_POR_DEFECTO = 16_000

export class ErrorIa extends Error {
  /**
   * @param {string} mensaje texto en espanol, apto para ensenar al usuario
   * @param {number} codigo codigo HTTP con el que responder
   * @param {object} [extra]
   * @param {Error} [extra.causa] error original, para poder sacar su traza
   * @param {string} [extra.detalle] resumen tecnico: solo para el log
   */
  constructor(mensaje, codigo = 502, { causa = null, detalle = '' } = {}) {
    super(mensaje)
    this.name = 'ErrorIa'
    this.codigo = codigo
    this.causa = causa
    this.detalle = detalle
  }
}

/** Recorta un cuerpo de respuesta para que no inunde el log. */
function recortar(texto, limite = 600) {
  const plano = String(texto ?? '').replace(/\s+/g, ' ').trim()
  return plano.length > limite ? `${plano.slice(0, limite)}...` : plano
}

/**
 * Resumen tecnico de un fallo: tipo, mensaje y, si el proveedor llego a
 * responder, su codigo HTTP y su cuerpo. Va solo al log del servidor; nunca
 * viaja al navegador y nunca incluye la clave de API.
 */
export function detalleTecnico(error) {
  if (!error) return 'sin detalle'
  if (error instanceof ErrorIa) {
    const dentro = error.causa && error.causa !== error ? detalleTecnico(error.causa) : ''
    return [error.detalle, dentro].filter(Boolean).join(' | ') || error.message
  }
  const partes = [`${error.name || 'Error'}: ${error.message}`]
  if (error.status !== undefined) partes.push(`HTTP ${error.status}`)
  const cuerpo = error.error ?? error.body ?? null
  if (cuerpo) partes.push(`cuerpo: ${recortar(JSON.stringify(cuerpo))}`)
  if (error.cause) partes.push(`causa: ${error.cause.message ?? error.cause}`)
  return partes.join(' | ')
}

/**
 * Deja en el log TODO lo que se sabe de un fallo de IA: el mensaje amigable,
 * el detalle tecnico (codigo y cuerpo del proveedor si los hubo) y la traza.
 * Sin esto, un 400 del proveedor se queda en "no ha podido procesarlo" y no
 * hay por donde empezar a mirar.
 */
export function registrarFallo(registrar, prefijo, causa) {
  const original = causa instanceof ErrorIa && causa.causa ? causa.causa : causa
  registrar.error(`${prefijo}: ${causa?.message ?? causa}`)
  registrar.error(`${prefijo}   detalle: ${detalleTecnico(causa)}`)
  if (original?.stack) registrar.error(`${prefijo}   traza: ${original.stack}`)
}

const CLAVE_INVALIDA = 'La clave de API no es valida o no tiene permisos. Revisala en Ajustes.'
const MODELO_INVALIDO = 'Ese modelo no existe para tu cuenta. Prueba con otro en Ajustes.'
const LIMITE = 'Has llegado al limite de uso de la IA. Espera un momento y reintenta.'
const CAIDO = 'El servicio de IA esta dando problemas ahora mismo. Reintenta en un rato.'
const SIN_RED = 'No hay conexion con el servicio de IA. Comprueba la red del servidor.'
const LENTO = 'La IA ha tardado demasiado en responder. Prueba con menos contenido de golpe.'

/** Traduce un error del SDK de Anthropic a un mensaje entendible en espanol. */
function traducirAnthropic(error) {
  // El error original viaja dentro: el mensaje que ve el usuario es corto, pero
  // el log tiene que poder ensenar el codigo, el cuerpo y la traza completos.
  const extra = { causa: error, detalle: detalleTecnico(error) }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ErrorIa(CLAVE_INVALIDA, 400, extra)
  }
  if (error instanceof Anthropic.NotFoundError) return new ErrorIa(MODELO_INVALIDO, 400, extra)
  if (error instanceof Anthropic.RateLimitError) return new ErrorIa(LIMITE, 429, extra)
  if (error instanceof Anthropic.BadRequestError) {
    // El 400 mas habitual aqui es un nombre de modelo mal escrito.
    return new ErrorIa(/model/i.test(error.message) ? MODELO_INVALIDO : CAIDO, 400, extra)
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ErrorIa(LENTO, 504, extra)
  if (error instanceof Anthropic.APIConnectionError) return new ErrorIa(SIN_RED, 503, extra)
  if (error instanceof Anthropic.APIError) return new ErrorIa(CAIDO, 502, extra)
  return new ErrorIa(CAIDO, 502, extra)
}

/** Misma traduccion para la rama OpenAI, que se llama por HTTP. */
function traducirHttp(estado, detalle) {
  const extra = { detalle: `HTTP ${estado} | cuerpo: ${recortar(detalle)}` }
  if (estado === 401 || estado === 403) return new ErrorIa(CLAVE_INVALIDA, 400, extra)
  if (estado === 404 || (/model/i.test(detalle) && /not.*(found|exist)/i.test(detalle))) {
    return new ErrorIa(MODELO_INVALIDO, 400, extra)
  }
  if (estado === 429) return new ErrorIa(LIMITE, 429, extra)
  if (estado >= 500) return new ErrorIa(CAIDO, 502, extra)
  return new ErrorIa(
    'La IA no ha podido procesar el contenido. Reintenta o revisa el archivo.',
    502,
    extra,
  )
}

/**
 * Llama al proveedor configurado.
 * @param {object} peticion
 * @param {string} peticion.sistema instrucciones del sistema
 * @param {string} [peticion.texto] contenido a analizar
 * @param {{datos: string, tipo: string}} [peticion.imagen] imagen en base64
 * @returns {Promise<{texto: string, truncado: boolean}>} lo que devolvio el
 *   modelo y si se corto por llegar al limite de tokens
 */
export async function preguntar({ sistema, texto, imagen }) {
  const { proveedor, clave, modelo } = configBd.iaCompleta()
  if (!clave) {
    throw new ErrorIa('Todavia no has configurado la IA. Ve a Ajustes > Inteligencia artificial.', 400)
  }
  return proveedor === 'openai'
    ? preguntarOpenai({ clave, modelo, sistema, texto, imagen })
    : preguntarAnthropic({ clave, modelo, sistema, texto, imagen })
}

async function preguntarAnthropic({ clave, modelo, sistema, texto, imagen }) {
  const cliente = new Anthropic({
    apiKey: clave,
    timeout: TIEMPO_LIMITE_MS,
    maxRetries: 2,
    // Permite apuntar a una pasarela propia; en las pruebas, a un servidor falso.
    ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
  })
  const contenido = []
  if (imagen) {
    contenido.push({
      type: 'image',
      source: { type: 'base64', media_type: imagen.tipo, data: imagen.datos },
    })
  }
  if (texto) contenido.push({ type: 'text', text: texto })

  let respuesta
  try {
    respuesta = await cliente.messages.create({
      model: modelo,
      max_tokens: MAX_TOKENS.anthropic,
      system: sistema,
      messages: [{ role: 'user', content: contenido }],
    })
  } catch (error) {
    throw traducirAnthropic(error)
  }

  if (respuesta.stop_reason === 'refusal') {
    throw new ErrorIa('La IA ha rechazado procesar ese contenido. Revisa el archivo.', 400)
  }
  return {
    texto: respuesta.content
      .filter((bloque) => bloque.type === 'text')
      .map((bloque) => bloque.text)
      .join(''),
    // Si la respuesta se corta por longitud, el JSON llega incompleto: quien
    // llama tiene que enterarse y no dar por buena media lista.
    truncado: respuesta.stop_reason === 'max_tokens',
  }
}

/**
 * OpenAI dice en el propio 400 cual es el maximo de salida del modelo, y si el
 * parametro ha cambiado de nombre. Hacerle caso evita mantener aqui una tabla
 * de limites por modelo que envejece cada vez que sacan uno nuevo.
 */
function ajustarLimite(cuerpo, limite, campo) {
  const maximo = /supports at most (\d+) completion tokens/i.exec(cuerpo)
  if (maximo) {
    const valor = Number(maximo[1])
    if (Number.isFinite(valor) && valor > 0 && valor < limite) return { limite: valor, campo }
  }
  // Los modelos de razonamiento rechazan max_tokens y piden el nombre nuevo.
  if (campo === 'max_tokens' && /max_completion_tokens/i.test(cuerpo)) {
    return { limite, campo: 'max_completion_tokens' }
  }
  return null
}

async function enviarOpenai({ clave, modelo, sistema, contenido, limite, campo }) {
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), TIEMPO_LIMITE_MS)
  try {
    // Igual que ANTHROPIC_BASE_URL: permite apuntar a una pasarela propia y,
    // en las pruebas, a un servidor falso que valide lo que enviamos.
    const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com'
    return await fetch(base + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        model: modelo,
        [campo]: limite,
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: contenido },
        ],
      }),
      signal: control.signal,
    })
  } catch (causa) {
    const abortado = causa?.name === 'AbortError'
    throw new ErrorIa(abortado ? LENTO : SIN_RED, abortado ? 504 : 503, {
      causa,
      detalle: detalleTecnico(causa),
    })
  } finally {
    clearTimeout(temporizador)
  }
}

async function preguntarOpenai({ clave, modelo, sistema, texto, imagen }) {
  const contenido = []
  if (texto) contenido.push({ type: 'text', text: texto })
  if (imagen) {
    contenido.push({
      type: 'image_url',
      image_url: { url: `data:${imagen.tipo};base64,${imagen.datos}` },
    })
  }

  let limite = MAX_TOKENS.openai ?? MAX_TOKENS_POR_DEFECTO
  let campo = 'max_tokens'

  // Un solo reintento: el que sirve para aceptar la correccion del proveedor.
  for (let intento = 1; intento <= 2; intento += 1) {
    const respuesta = await enviarOpenai({ clave, modelo, sistema, contenido, limite, campo })
    if (respuesta.ok) {
      const datos = await respuesta.json()
      const eleccion = datos.choices?.[0]
      return {
        texto: eleccion?.message?.content ?? '',
        truncado: eleccion?.finish_reason === 'length',
      }
    }

    const cuerpo = await respuesta.text()
    const ajuste = intento === 1 && respuesta.status === 400 ? ajustarLimite(cuerpo, limite, campo) : null
    if (!ajuste) throw traducirHttp(respuesta.status, cuerpo)
    limite = ajuste.limite
    campo = ajuste.campo
  }
  // Inalcanzable: el bucle sale por return o por throw.
  throw new ErrorIa(CAIDO)
}

/**
 * Extrae el JSON de la respuesta del modelo, tolerando que venga envuelto en
 * texto explicativo o en un bloque de codigo markdown.
 *
 * Se admiten las dos formas que usa la aplicacion: un array suelto (la lista de
 * movimientos de un ticket) y un objeto (la captura de un mes, que ademas trae
 * el ingreso y el dinero en cuenta). Quien llama sabe cual espera.
 */
export function extraerJson(crudo) {
  const texto = String(crudo ?? '').trim()
  if (!texto) throw new ErrorIa('La IA ha devuelto una respuesta vacia. Reintenta.')

  const sinMarcadores = texto
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()

  const intentos = [sinMarcadores]
  // Si el modelo ha escrito algo antes o despues, se recorta por el primer
  // delimitador que abra y el ultimo que cierre.
  for (const [abre, cierra] of [
    ['{', '}'],
    ['[', ']'],
  ]) {
    const inicio = sinMarcadores.indexOf(abre)
    const fin = sinMarcadores.lastIndexOf(cierra)
    if (inicio !== -1 && fin > inicio) intentos.push(sinMarcadores.slice(inicio, fin + 1))
  }

  for (const intento of intentos) {
    try {
      const valor = JSON.parse(intento)
      if (valor && (Array.isArray(valor) || typeof valor === 'object')) return valor
    } catch {
      // se prueba el siguiente intento
    }
  }
  throw new ErrorIa('No se ha entendido la respuesta de la IA. Reintenta.')
}

/** Igual, pero exigiendo un array: lo que esperan las listas de movimientos. */
export function extraerLista(crudo) {
  const valor = extraerJson(crudo)
  if (Array.isArray(valor)) return valor
  // Un modelo devuelve a veces { movimientos: [...] } en vez del array pelado.
  for (const clave of ['movimientos', 'lineas', 'apuntes', 'resultado']) {
    if (Array.isArray(valor?.[clave])) return valor[clave]
  }
  throw new ErrorIa('No se ha entendido la respuesta de la IA. Reintenta.')
}
