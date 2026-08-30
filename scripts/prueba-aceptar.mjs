/**
 * Prueba de extremo a extremo del extracto real, contra la copia de pruebas.
 *
 * Clasifica lo que quede suelto en un concepto cualquiera, acepta, comprueba
 * que el mes cuadra y lo deshace. Es la comprobación de que el rediseño no ha
 * tocado la maquinaria de importar.
 */
import fs from 'node:fs'

const BASE = 'http://127.0.0.1:3099/api'
const pedir = async (ruta, opciones = {}) => {
  const r = await fetch(BASE + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers ?? {}) },
  })
  const cuerpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`${ruta}: ${r.status} ${JSON.stringify(cuerpo)}`)
  return cuerpo
}

const meses = await pedir('/meses')
const agosto = meses.find((m) => m.anio === 2026 && m.mes === 8)
console.log('Agosto antes:', { gastos: agosto.resumen.gastos, ingreso: agosto.ingreso })

// El archivo viaja en base64 dentro del JSON, igual que lo manda la web.
const archivo = fs.readFileSync('importaciones/29082026_0084_0002057312.xls')
const propuesta = await pedir('/extracto/clasificar', {
  method: 'POST',
  body: JSON.stringify({
    mesId: agosto.id,
    archivo: archivo.toString('base64'),
    nombreArchivo: '29082026_0084_0002057312.xls',
  }),
})

console.log('Leído:', propuesta.cuenta ?? propuesta.conteos ?? Object.keys(propuesta))

// Un concepto variable cualquiera para lo que no reconoce: aquí solo se mide
// que la maquinaria funcione, no la calidad de la clasificación.
const conceptos = await pedir('/conceptos?activos=1')
const cajon = conceptos.find((c) => c.tipo === 'variable')

const lineas = propuesta.lineas.map((l) =>
  l.destino === 'sinClasificar'
    ? { ...l, destino: 'variable', conceptoId: cajon.id, procedencia: 'manual' }
    : l,
)

const previa = await pedir(`/extracto/${propuesta.importacion.id}/previsualizar`, {
  method: 'POST',
  body: JSON.stringify({ lineas, conciliaciones: propuesta.conciliaciones ?? [] }),
})
console.log('Validación:', previa.validacion)

const aceptado = await pedir(`/extracto/${propuesta.importacion.id}/aceptar`, {
  method: 'POST',
  body: JSON.stringify({
    lineas,
    conciliaciones: propuesta.conciliaciones ?? [],
    periodo: propuesta.lectura.periodo ?? null,
  }),
})
console.log('Aceptado:', aceptado.resumen ?? aceptado)

const despues = (await pedir('/meses')).find((m) => m.id === agosto.id)
console.log('Agosto después:', {
  gastos: despues.resumen.gastos,
  ingreso: despues.ingreso,
  periodo: [despues.fechaInicio, despues.fechaFin],
})

if (process.env.SIN_DESHACER) {
  console.log('Dejo la importación puesta (SIN_DESHACER).')
  process.exit(0)
}

await pedir(`/extracto/${propuesta.importacion.id}/deshacer`, { method: 'POST' })
const final = (await pedir('/meses')).find((m) => m.id === agosto.id)
console.log('Agosto tras deshacer:', {
  gastos: final.resumen.gastos,
  ingreso: final.ingreso,
  periodo: [final.fechaInicio, final.fechaFin],
})

const igual =
  final.resumen.gastos === agosto.resumen.gastos && final.ingreso === agosto.ingreso
console.log(igual ? 'OK: deshacer ha dejado el mes como estaba.' : 'MAL: el mes no ha vuelto.')
