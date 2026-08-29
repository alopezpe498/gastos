// Copia de seguridad con fecha de la base de datos.
//
//   npm run copia-bd
//
// Usa el .backup de SQLite a traves de better-sqlite3, asi que se puede hacer
// con el servidor en marcha: no hace falta pararlo ni cerrar la aplicacion.
// Las copias quedan en server/data/copias/, que tambien esta fuera de git.
//
// En el servidor esto es lo que llama el cron diario (ver el README).
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { BD_DESARROLLO } from './entorno.mjs'

/** Cuantas copias se guardan. Las mas viejas se van borrando solas. */
const COPIAS_QUE_SE_GUARDAN = Number(process.env.COPIAS_A_GUARDAR) || 30

const origen = process.env.GASTOS_DB ? path.resolve(process.env.GASTOS_DB) : BD_DESARROLLO

if (!fs.existsSync(origen)) {
  console.error(`No hay ninguna base de datos en ${origen}.`)
  process.exit(1)
}

const carpeta = path.join(path.dirname(origen), 'copias')
fs.mkdirSync(carpeta, { recursive: true })

const ahora = new Date()
const sello = [
  ahora.getFullYear(),
  String(ahora.getMonth() + 1).padStart(2, '0'),
  String(ahora.getDate()).padStart(2, '0'),
  '-',
  String(ahora.getHours()).padStart(2, '0'),
  String(ahora.getMinutes()).padStart(2, '0'),
].join('')

const destino = path.join(carpeta, `gastos-${sello}.db`)

const bd = new Database(origen, { readonly: true })
await bd.backup(destino)
bd.close()

const { size } = fs.statSync(destino)
console.log(`Copia hecha: ${destino} (${Math.round(size / 1024)} KB)`)

// Rotacion: se quedan las mas recientes y se borran las demas.
const copias = fs
  .readdirSync(carpeta)
  .filter((archivo) => /^gastos-\d{8}-\d{4}\.db$/.test(archivo))
  .sort()
  .reverse()

for (const vieja of copias.slice(COPIAS_QUE_SE_GUARDAN)) {
  fs.unlinkSync(path.join(carpeta, vieja))
  console.log(`Copia antigua borrada: ${vieja}`)
}
