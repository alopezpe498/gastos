import express from 'express'
import * as auth from '../lib/auth.js'
import { fallo, ruta } from '../lib/http.js'

export const rutasAuth = express.Router()

/** Indica al cliente si hace falta PIN, antes de pedirlo. */
rutasAuth.get('/estado', (req, res) => {
  res.json({ protegido: auth.PROTEGIDO })
})

rutasAuth.post(
  '/',
  ruta((req, res) => {
    if (!auth.PROTEGIDO) return res.json({ token: 'sin-proteccion', protegido: false })

    const ip = req.ip ?? 'desconocida'
    if (auth.bloqueado(ip)) {
      const minutos = Math.ceil(auth.segundosDeBloqueo(ip) / 60)
      return fallo(res, 429, `Demasiados intentos fallidos. Prueba de nuevo en ${minutos} min.`)
    }

    const { pin } = req.body ?? {}
    if (!auth.pinCorrecto(pin)) {
      auth.anotarFallo(ip)
      const restantes = auth.intentosRestantes(ip)
      return fallo(
        res,
        401,
        restantes > 0
          ? `PIN incorrecto. Te quedan ${restantes} ${restantes === 1 ? 'intento' : 'intentos'}.`
          : 'PIN incorrecto. Has agotado los intentos, espera 15 minutos.',
      )
    }

    auth.limpiarIntentos(ip)
    return res.json({ token: auth.crearToken(), protegido: true })
  }),
)

/** Permite al cliente comprobar que su token guardado sigue siendo valido. */
rutasAuth.get(
  '/comprobar',
  ruta((req, res) => {
    if (!auth.PROTEGIDO) return res.json({ valido: true })
    const cabecera = req.get('authorization') ?? ''
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : ''
    return res.json({ valido: auth.tokenValido(token) })
  }),
)
