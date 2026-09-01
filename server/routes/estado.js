import express from 'express'
import { bd, avisosDeArranque } from '../db/index.js'
import { estadoDeMigraciones } from '../db/migraciones.js'
import { ruta } from '../lib/http.js'

/**
 * Como ha arrancado la aplicacion.
 *
 * Existe porque el servidor ya no se niega a levantar cuando algo del esquema
 * va mal: arranca y sigue funcionando, pero eso solo sirve si en algun sitio se
 * dice qué se ha quedado sin hacer. Aqui está ese sitio, y la pantalla lo pinta
 * como una banda arriba.
 */
export const rutasEstado = express.Router()

rutasEstado.get(
  '/',
  ruta((_req, res) =>
    res.json({
      avisos: avisosDeArranque,
      migraciones: estadoDeMigraciones(bd),
    }),
  ),
)
