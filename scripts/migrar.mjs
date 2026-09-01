/**
 * Las migraciones, a mano.
 *
 *   npm run migrar             las aplica
 *   npm run migrar -- --estado dice cuáles están hechas y cuáles faltan
 *
 * Al arrancar el servidor se aplican solas, así que esto es para mirar qué hay
 * o para adelantarse a un despliegue. Igual que allí: nada de esto lanza. Si
 * una migración falla, se dice y se sigue con las demás.
 */
import { bd, RUTA_BD, CARPETA_DATOS } from '../server/db/index.js'
import { aplicarMigraciones, estadoDeMigraciones } from '../server/db/migraciones.js'

const soloEstado = process.argv.includes('--estado')

console.log(`Base de datos: ${RUTA_BD}\n`)

if (soloEstado) {
  const filas = estadoDeMigraciones(bd)
  if (filas.length === 0) console.log('No hay ninguna migración registrada.')
  for (const f of filas) {
    const marca = f.pendiente ? 'PENDIENTE' : f.aplicada ? 'hecha    ' : 'no hace falta'
    const cuando = f.fecha ? ` · ${f.fecha.slice(0, 19).replace('T', ' ')}` : ''
    console.log(`  ${marca}  ${f.nombre}${cuando}`)
    console.log(`             ${f.descripcion}${f.tocaDatos ? ' (toca datos: hace copia antes)' : ''}`)
  }
  process.exit(0)
}

const r = aplicarMigraciones(bd, {
  rutaBd: RUTA_BD,
  carpetaDatos: CARPETA_DATOS,
  registrar: (linea) => console.log(linea),
})

console.log('')
if (r.aplicadas.length === 0) console.log('No había ninguna pendiente.')
for (const nombre of r.aplicadas) console.log(`  aplicada  ${nombre}`)
for (const fallo of r.fallidas) console.log(`  FALLÓ     ${fallo.nombre}: ${fallo.error}`)

// Aunque algo falle se sale con 0: esto no debe tumbar un despliegue. Lo que
// falla se reintenta en el siguiente arranque y se ve en la pantalla.
console.log(
  r.fallidas.length > 0
    ? `\n${r.fallidas.length} sin poder aplicar. La aplicación arranca igual; revísalo.`
    : '\nTodo al día.',
)
