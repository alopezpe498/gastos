import express from 'express'
import * as configBd from '../db/config.js'
import { PROTEGIDO } from '../lib/auth.js'
import { fallo, ruta, textoDe } from '../lib/http.js'
import { preguntar, registrarFallo } from '../services/ia.js'

export const rutasConfig = express.Router()

rutasConfig.get(
  '/',
  ruta((req, res) => res.json({ ...configBd.ajustes(), protegido: PROTEGIDO })),
)

rutasConfig.put(
  '/',
  ruta((req, res) => {
    const { ideales, comidaEnTotal, gruposFijos } = req.body ?? {}

    if (ideales) {
      for (const [clave, valor] of Object.entries(ideales)) {
        const n = Number(valor)
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return fallo(res, 400, `El porcentaje de "${clave}" tiene que estar entre 0 y 100.`)
        }
      }
    }

    if (comidaEnTotal !== undefined && comidaEnTotal !== 'presupuesto' && comidaEnTotal !== 'gastado') {
      return fallo(res, 400, 'La comida solo puede contar por presupuesto o por lo gastado.')
    }

    if (gruposFijos !== undefined && !Array.isArray(gruposFijos)) {
      return fallo(res, 400, 'Los grupos de fijos tienen que ser una lista.')
    }

    return res.json({
      ...configBd.guardarAjustes({ ideales, comidaEnTotal, gruposFijos }),
      protegido: PROTEGIDO,
    })
  }),
)

// ---------- Inteligencia artificial ----------

const PROVEEDORES = ['anthropic', 'openai']

/** Nunca devuelve la clave completa: solo la enmascarada. */
rutasConfig.get(
  '/ia',
  ruta((req, res) => res.json(configBd.iaPublica())),
)

rutasConfig.put(
  '/ia',
  ruta((req, res) => {
    const { proveedor, modelo, clave } = req.body ?? {}
    if (proveedor !== undefined && !PROVEEDORES.includes(proveedor)) {
      return fallo(res, 400, 'Proveedor no valido. Elige Anthropic u OpenAI.')
    }
    // Si el cliente reenvia la clave enmascarada tal cual, se ignora para no
    // machacar la buena con asteriscos.
    const claveLimpia = typeof clave === 'string' && clave.includes('*') ? undefined : clave
    return res.json(
      configBd.guardarIa({
        proveedor,
        modelo: modelo !== undefined ? textoDe(modelo, { max: 80 }) : undefined,
        clave: claveLimpia,
      }),
    )
  }),
)

rutasConfig.delete(
  '/ia/clave',
  ruta((req, res) => res.json(configBd.olvidarClaveIa())),
)

/**
 * Prueba de conexion: una llamada de verdad, la mas barata posible.
 *
 * Se hace contra el proveedor y el modelo guardados, porque lo que interesa
 * saber no es si la clave existe sino si esa combinacion concreta funciona: una
 * clave buena con un modelo mal escrito falla igual.
 */
rutasConfig.post(
  '/ia/probar',
  ruta(async (req, res) => {
    const { proveedor, modelo, configurada } = configBd.iaPublica()
    if (!configurada) return fallo(res, 400, 'Todavia no has guardado ninguna clave de API.')

    try {
      const { texto } = await preguntar({
        sistema: 'Responde unicamente con la palabra OK, sin nada mas.',
        texto: 'Prueba de conexion.',
      })
      return res.json({
        ok: true,
        proveedor,
        modelo,
        mensaje: `Conectado con ${proveedor} usando ${modelo}.`,
        respuesta: String(texto ?? '').trim().slice(0, 40),
      })
    } catch (causa) {
      registrarFallo(console, '[gastos][ia] prueba de conexion', causa)
      // Un fallo de la prueba no es un error del servidor: es informacion. Se
      // responde 200 con ok:false para que la pantalla lo pinte en su sitio.
      return res.json({
        ok: false,
        proveedor,
        modelo,
        mensaje: causa?.message ?? 'No se ha podido conectar con la IA.',
      })
    }
  }),
)
