// Lanza todas las suites, cada una en su propio proceso.
//
// Van una detras de otra a proposito: comparten el puerto de pruebas y, ademas,
// una de ellas agota el limitador de intentos del PIN, asi que cada suite
// necesita un servidor recien arrancado.
//
// Ninguna toca server/data/gastos.db: ver la guarda de entorno.mjs.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BD_DESARROLLO } from './entorno.mjs'

const aqui = path.dirname(fileURLToPath(import.meta.url))

const SUITES = [
  { nombre: 'Cálculos', archivo: 'calculos.mjs' },
  { nombre: 'API', archivo: 'api.mjs' },
  { nombre: 'Importación desde Excel', archivo: 'importacion-excel.mjs' },
  { nombre: 'Inteligencia artificial', archivo: 'ia.mjs' },
  { nombre: 'Analitica', archivo: 'analitica.mjs' },
  { nombre: 'Extracto del banco', archivo: 'extracto.mjs' },
]

/** Huella de la base de datos de desarrollo, para probar que no se ha tocado. */
function huella() {
  if (!fs.existsSync(BD_DESARROLLO)) return 'no existe'
  const { size, mtimeMs } = fs.statSync(BD_DESARROLLO)
  return `${size} bytes, modificada ${new Date(mtimeMs).toISOString()}`
}

const antes = huella()
console.log(`Base de datos de desarrollo: ${antes}`)
console.log('(las pruebas usan la suya; esta no debe cambiar)')

let fallos = 0
for (const suite of SUITES) {
  console.log(`\n${'='.repeat(60)}\n  ${suite.nombre}\n${'='.repeat(60)}`)
  const codigo = await new Promise((resolver) => {
    const proceso = spawn(process.execPath, [path.join(aqui, suite.archivo)], {
      stdio: 'inherit',
      cwd: path.resolve(aqui, '..'),
    })
    proceso.on('exit', (codigo) => resolver(codigo ?? 1))
  })
  if (codigo !== 0) fallos += 1
}

const despues = huella()
console.log(`\n${'='.repeat(60)}`)
console.log(`Base de datos de desarrollo: ${despues}`)
if (antes !== despues) {
  console.error('ERROR: las pruebas han tocado la base de datos de desarrollo.')
  process.exit(1)
}
console.log('Intacta.')

// No debe quedar ningun archivo de pruebas suelto.
const carpeta = path.dirname(BD_DESARROLLO)
const sobrantes = fs.existsSync(carpeta)
  ? fs.readdirSync(carpeta).filter((archivo) => archivo.startsWith('test'))
  : []
if (sobrantes.length > 0) {
  console.error(`ERROR: han quedado bases de datos de pruebas sin borrar: ${sobrantes.join(', ')}`)
  process.exit(1)
}

console.log(fallos === 0 ? '\nTODAS LAS SUITES PASAN\n' : `\n${fallos} SUITES CON FALLOS\n`)
process.exit(fallos === 0 ? 0 : 1)
