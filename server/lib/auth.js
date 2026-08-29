import crypto from 'node:crypto'
import * as configBd from '../db/config.js'

const APP_PIN = (process.env.APP_PIN ?? '').trim()
export const PROTEGIDO = APP_PIN.length > 0

const DIAS_VALIDEZ = 365
const MAX_INTENTOS = 5
const VENTANA_MS = 15 * 60 * 1000

/**
 * Secreto para firmar los tokens. Se persiste en la base de datos para que los
 * dispositivos ya desbloqueados no tengan que volver a introducir el PIN cada
 * vez que se reinicia el servidor. APP_SECRET lo sobrescribe si se define.
 */
function secreto() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET
  let guardado = configBd.leer('auth_secreto')
  if (!guardado) {
    guardado = crypto.randomBytes(32).toString('hex')
    configBd.escribir('auth_secreto', guardado)
  }
  return guardado
}

const base64url = (buf) => Buffer.from(buf).toString('base64url')

function firmar(datos) {
  return crypto.createHmac('sha256', secreto()).update(datos).digest('base64url')
}

export function crearToken() {
  const carga = base64url(JSON.stringify({ emitido: Date.now() }))
  return `${carga}.${firmar(carga)}`
}

export function tokenValido(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false
  const [carga, firma] = token.split('.')
  if (!carga || !firma) return false

  const esperada = firmar(carga)
  const a = Buffer.from(firma)
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false

  try {
    const { emitido } = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8'))
    return Date.now() - emitido < DIAS_VALIDEZ * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

export function pinCorrecto(pin) {
  const a = Buffer.from(String(pin ?? ''))
  const b = Buffer.from(APP_PIN)
  // Se compara la longitud aparte porque timingSafeEqual exige el mismo tamano.
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Limitador de intentos por IP, en memoria: 5 fallos cada 15 minutos.
const intentos = new Map()

export function intentosRestantes(ip) {
  const registro = intentos.get(ip)
  if (!registro || Date.now() > registro.hasta) return MAX_INTENTOS
  return Math.max(0, MAX_INTENTOS - registro.fallos)
}

export function bloqueado(ip) {
  return intentosRestantes(ip) === 0
}

export function segundosDeBloqueo(ip) {
  const registro = intentos.get(ip)
  if (!registro) return 0
  return Math.max(0, Math.ceil((registro.hasta - Date.now()) / 1000))
}

export function anotarFallo(ip) {
  const ahora = Date.now()
  const registro = intentos.get(ip)
  if (!registro || ahora > registro.hasta) {
    intentos.set(ip, { fallos: 1, hasta: ahora + VENTANA_MS })
  } else {
    registro.fallos += 1
  }
}

export function limpiarIntentos(ip) {
  intentos.delete(ip)
}

// Purga periodica para que el mapa no crezca sin limite.
setInterval(() => {
  const ahora = Date.now()
  for (const [ip, registro] of intentos) if (ahora > registro.hasta) intentos.delete(ip)
}, VENTANA_MS).unref()

/** Middleware: exige Authorization: Bearer <token> salvo que no haya PIN. */
export function exigirAuth(req, res, siguiente) {
  if (!PROTEGIDO) return siguiente()
  const cabecera = req.get('authorization') ?? ''
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : ''
  if (!tokenValido(token)) {
    return res.status(401).json({ error: 'Sesion no valida. Introduce el PIN de nuevo.' })
  }
  return siguiente()
}
