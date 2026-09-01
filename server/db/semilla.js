import { bd } from './index.js'
import * as conceptosBd from './conceptos.js'
import * as plantillaBd from './plantilla.js'

/**
 * Catalogo inicial, calcado del Excel que sustituye esta aplicacion. El orden
 * es el de sus filas, para que la vision anual se lea igual que la hoja.
 *
 * Los alias son las grafias con las que el concepto aparece escrito en el Excel
 * ("Gimasio", "Netflix etcc"): sin ellos la importacion daria de alta un
 * concepto nuevo cada vez. Las tildes no necesitan alias, porque la
 * normalizacion ya las quita.
 */
const FIJOS = [
  { nombre: 'Telf BCN', clasificacion: 'necesario', dia: '11', importe: 33 },
  { nombre: 'Hipoteca', clasificacion: 'necesario', dia: '31', importe: 622.53 },
  { nombre: 'Seguro Casa', clasificacion: 'necesario', dia: '1', importe: 28.45 },
  { nombre: 'Seguro Vida', clasificacion: 'necesario', dia: '1', importe: 21.87 },
  { nombre: 'Comunidad', clasificacion: 'necesario', dia: '1', importe: 119 },
  { nombre: 'Gastos Niñas', clasificacion: 'necesario', dia: '1', importe: 0 },
  { nombre: 'Santa Lucía', clasificacion: 'necesario', dia: '10', importe: 23.39 },
  { nombre: 'Comida', tipo: 'sobre', clasificacion: 'necesario', dia: '1', importe: 500 },
  {
    nombre: 'Luz/Gas/Agua/IBI',
    clasificacion: 'necesario',
    dia: '19',
    importe: 0,
    alias: ['Luz,Gas,Agua,IBI'],
  },
  { nombre: 'Piso SJ', clasificacion: 'necesario', dia: '1', importe: 0 },
  { nombre: 'Gatos', clasificacion: 'necesario', dia: '1', importe: 30 },
  { nombre: 'Coche', clasificacion: 'necesario', dia: '1', importe: 0 },
  {
    nombre: 'Suscripciones',
    clasificacion: 'prescindible',
    dia: '30,13,23',
    importe: 0,
    // Como se llamaba en el Excel, para que el historico siga cayendo aqui.
    alias: ['Netflix etc', 'Netflix etcc'],
  },
  { nombre: 'Gimnasio', clasificacion: 'prescindible', dia: '1', importe: 19.99, alias: ['Gimasio'] },
  { nombre: 'Ahorro', clasificacion: 'ahorro', dia: null, importe: 0, esObjetivo: true },
]

/** Variables: prescindibles salvo los que no son opcionales de verdad. */
const NECESARIOS = new Set([
  'Farmacia',
  'Gasolina',
  'Peaje',
  'Metro',
  'Taxi',
  'Material Infor',
  'Inglés Nur',
  'Deuda',
  'Préstamo',
])

const VARIABLES = [
  'Peaje',
  'JustEat',
  'Amazon',
  'Farmacia',
  'Bar',
  'Gasolina',
  'Restaurante',
  'Regalos',
  'Viajes',
  'Ropa',
  'Taxi',
  'Préstamo',
  'Bote',
  'Cumple',
  'Reyes',
  'Lotería/Quinielas',
  'Vino',
  'Limpieza',
  'Cine',
  'Metro',
  'Cajero',
  'Silvia',
  'Material Infor',
  'Paga Nur',
  'Paga Mar',
  'Regalo Nur',
  'Regalo Mar',
  'Inglés Nur',
  'Fiesta',
  'Finde SJ',
  'Finde Vinaros',
  'Limpiar Coche',
  'Semana Santa',
  'Deuda',
  'Extras',
  'Anticipo',
]

/**
 * Se siembra una sola vez, cuando el catalogo esta vacio. Si mas adelante se
 * borra un concepto a proposito, no vuelve a aparecer solo al reiniciar.
 */
export const sembrar = bd.transaction(() => {
  const vacio = bd.prepare('SELECT COUNT(*) AS n FROM conceptos').get().n === 0
  if (!vacio) return false

  let orden = 0
  const vigenteDesde = `${new Date().getFullYear()}-01`

  for (const fijo of FIJOS) {
    const concepto = conceptosBd.crear({
      nombre: fijo.nombre,
      tipo: fijo.tipo ?? 'fijo',
      clasificacion: fijo.clasificacion,
      orden: orden++,
      esObjetivo: fijo.esObjetivo ?? false,
    })
    plantillaBd.guardar(concepto.id, {
      diaPrevisto: fijo.dia,
      importePrevisto: fijo.importe,
      vigenteDesde,
    })
    for (const alias of fijo.alias ?? []) conceptosBd.anadirAlias(concepto.id, alias)
  }

  for (const nombre of VARIABLES) {
    conceptosBd.crear({
      nombre,
      tipo: 'variable',
      clasificacion: NECESARIOS.has(nombre) ? 'necesario' : 'prescindible',
      orden: orden++,
    })
  }

  return true
})
