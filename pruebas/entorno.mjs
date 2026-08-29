// Entorno de las pruebas.
//
// REGLA: las pruebas NUNCA usan la base de datos de desarrollo
// (server/data/gastos.db). Cada suite levanta su propio servidor, en otro
// puerto y con su propio archivo .db, que crea al empezar y borra al terminar.
//
// La funcion protegerRuta() es la red de seguridad: si alguna vez alguien
// apunta una prueba a la base de desarrollo, la ejecucion se para en seco.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
export const RAIZ = path.resolve(aqui, '..')

const CARPETA_DATOS = path.join(RAIZ, 'server', 'data')
/** La base de datos de desarrollo, intocable desde aqui. */
export const BD_DESARROLLO = path.join(CARPETA_DATOS, 'gastos.db')

/** Puerto propio: el 3003 es el del servidor de desarrollo. */
export const PUERTO = Number(process.env.PUERTO_PRUEBAS) || 3098
export const PIN = '1234'

function protegerRuta(ruta) {
  const destino = path.resolve(ruta)
  if (destino === path.resolve(BD_DESARROLLO)) {
    throw new Error(
      'Las pruebas no pueden usar server/data/gastos.db: es la base de datos de desarrollo.',
    )
  }
  if (!path.basename(destino).startsWith('test')) {
    throw new Error(
      `La base de datos de pruebas debe llamarse test*.db, no ${path.basename(destino)}.`,
    )
  }
  return destino
}

/** Borra un .db y sus archivos de WAL, reintentando por si sigue bloqueado. */
async function borrarBd(ruta) {
  for (let intento = 0; intento < 10; intento += 1) {
    let quedan = false
    for (const sufijo of ['', '-wal', '-shm']) {
      const archivo = `${ruta}${sufijo}`
      if (!fs.existsSync(archivo)) continue
      try {
        fs.unlinkSync(archivo)
      } catch {
        quedan = true
      }
    }
    if (!quedan) return
    await new Promise((r) => setTimeout(r, 200))
  }
}

async function esperarRespuesta(base, intentos = 60) {
  for (let i = 0; i < intentos; i += 1) {
    try {
      const respuesta = await fetch(`${base}/auth/estado`)
      if (respuesta.ok) return true
    } catch {
      // todavia no escucha
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

/**
 * Levanta un servidor solo para esta suite.
 * @param {string} nombre   sufijo del archivo: test-<nombre>.db
 * @param {object} entorno  variables extra
 */
export async function levantar(nombre, entorno = {}) {
  const rutaBd = protegerRuta(path.join(CARPETA_DATOS, `test-${nombre}.db`))
  // Restos de una ejecucion anterior que se cortara a medias.
  await borrarBd(rutaBd)

  const proceso = spawn(process.execPath, [path.join(RAIZ, 'server', 'index.js')], {
    cwd: RAIZ,
    env: { ...process.env, ...entorno, GASTOS_DB: rutaBd, PORT: String(PUERTO), APP_PIN: PIN },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const salida = []
  proceso.stdout.on('data', (t) => salida.push(String(t)))
  proceso.stderr.on('data', (t) => salida.push(String(t)))

  const base = `http://127.0.0.1:${PUERTO}/api`
  if (!(await esperarRespuesta(base))) {
    proceso.kill()
    throw new Error(`El servidor de pruebas no ha arrancado.\n${salida.join('')}`)
  }

  // Comprobacion de que de verdad esta usando la base de pruebas.
  if (!salida.join('').includes(path.basename(rutaBd))) {
    proceso.kill()
    throw new Error('El servidor de pruebas no ha abierto la base de datos esperada.')
  }

  const token = await autenticar(base)

  return {
    base,
    rutaBd,
    token,
    salida: () => salida.join(''),
    async cerrar() {
      proceso.kill()
      await new Promise((r) => proceso.once('exit', r))
      await borrarBd(rutaBd)
    },
  }
}

async function autenticar(base) {
  const respuesta = await fetch(`${base}/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: PIN }),
  })
  const datos = await respuesta.json()
  if (!datos.token) throw new Error('No se ha podido autenticar contra el servidor de pruebas.')
  return datos.token
}

/** Cliente HTTP con el token ya puesto, que usan todas las suites. */
export function crearLlamar(entorno) {
  return async function llamar(ruta, { metodo = 'GET', cuerpo, sinAuth = false } = {}) {
    const cabeceras = {}
    if (cuerpo !== undefined) cabeceras['content-type'] = 'application/json'
    if (entorno.token && !sinAuth) cabeceras.authorization = `Bearer ${entorno.token}`
    const respuesta = await fetch(`${entorno.base}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
    const texto = await respuesta.text()
    let datos = null
    try {
      datos = texto ? JSON.parse(texto) : null
    } catch {
      datos = texto
    }
    return { estado: respuesta.status, datos }
  }
}

/** Contador de comprobaciones compartido por las suites. */
export function crearComprobador() {
  const estado = { fallos: 0, total: 0 }
  const comprobar = (condicion, etiqueta, extra = '') => {
    estado.total += 1
    if (condicion) {
      console.log(`  OK   ${etiqueta}`)
    } else {
      estado.fallos += 1
      console.log(`  FALLO ${etiqueta} ${extra}`)
    }
  }
  return { comprobar, estado }
}

/** Compara dos importes con la tolerancia del céntimo. */
export const igualEnCentimos = (a, b) => Math.abs(a - b) < 0.005
