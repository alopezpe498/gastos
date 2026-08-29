// Pruebas de los calculos, sin servidor ni base de datos.
//
// calculos.js es puro: recibe un mes y sus movimientos y devuelve numeros. Eso
// permite probar aqui los casos raros que en la interfaz costaria montar (un
// mes sin ingresos, un sobrante negativo, una devolucion).
import {
  resumen,
  reglaCincuentaTreintaVeinte,
  repartoPorTipo,
  pesoDeFijos,
  rankingVariables,
  separar,
  matrizAnual,
} from '../server/services/calculos.js'
import { crearComprobador, igualEnCentimos } from './entorno.mjs'

const { comprobar, estado } = crearComprobador()

const AJUSTES = {
  ideales: { necesario: 50, prescindible: 30, ahorro: 20 },
  comidaEnTotal: 'presupuesto',
  gruposFijos: [],
}

let siguienteId = 1
const mov = (props) => ({
  id: siguienteId++,
  mesId: 1,
  conceptoId: props.conceptoId ?? siguienteId,
  concepto: props.concepto ?? 'Concepto',
  tipo: props.tipo ?? 'variable',
  clasificacion: props.clasificacion ?? 'prescindible',
  esObjetivo: props.esObjetivo ?? false,
  importe: props.importe ?? 0,
  importePrevisto: props.importePrevisto ?? null,
  diaPrevisto: props.diaPrevisto ?? null,
  fechaCobro: props.fechaCobro ?? null,
  cobrado: !!props.fechaCobro,
  descripcion: '',
  origen: 'manual',
  ...props,
})

const MES = {
  id: 1,
  anio: 2026,
  mes: 3,
  clave: '2026-03',
  ingreso: 3000,
  dineroEnCuenta: null,
  presupuestoComida: 500,
  objetivoAhorro: 300,
  notas: '',
  estado: 'abierto',
}

// ---------------------------------------------------------------------------
console.log('\nResumen del mes')
// ---------------------------------------------------------------------------
{
  const movimientos = [
    mov({ concepto: 'Hipoteca', tipo: 'fijo', clasificacion: 'necesario', importe: 600, fechaCobro: '2026-03-01' }),
    mov({ concepto: 'Gimnasio', tipo: 'fijo', importe: 20 }), // pendiente
    mov({ concepto: 'Bar', importe: 100 }),
    mov({ concepto: 'Préstamo', clasificacion: 'necesario', importe: -50 }),
    mov({ concepto: 'Comida', tipo: 'sobre', clasificacion: 'necesario', importe: 180 }),
  ]
  const r = resumen(MES, movimientos, AJUSTES)

  comprobar(igualEnCentimos(r.fijos, 620), 'los fijos suman 620', `da ${r.fijos}`)
  comprobar(igualEnCentimos(r.extras, 50), 'los extras restan la devolución (100 - 50)', `da ${r.extras}`)
  comprobar(igualEnCentimos(r.comida.gastado, 180), 'gastado en comida = 180', `da ${r.comida.gastado}`)
  comprobar(igualEnCentimos(r.comida.queda, 320), 'quedan 320 para comer', `da ${r.comida.queda}`)
  comprobar(
    igualEnCentimos(r.gastos, 1170),
    'gastos = fijos + extras + presupuesto de comida (620 + 50 + 500)',
    `da ${r.gastos}`,
  )
  comprobar(igualEnCentimos(r.sobrante, 1830), 'sobrante = 3000 - 1170', `da ${r.sobrante}`)
  comprobar(r.fijosPendientes.cuantos === 1, 'un fijo pendiente')
  comprobar(igualEnCentimos(r.fijosPendientes.importe, 20), 'quedan 20 por cobrar')
  comprobar(igualEnCentimos(r.ahorroReal, r.sobrante), 'el ahorro real es el sobrante')
}

// ---------------------------------------------------------------------------
console.log('\nEl sobre de la comida por lo gastado')
// ---------------------------------------------------------------------------
{
  const movimientos = [mov({ concepto: 'Comida', tipo: 'sobre', clasificacion: 'necesario', importe: 180 })]
  const r = resumen(MES, movimientos, { ...AJUSTES, comidaEnTotal: 'gastado' })
  comprobar(igualEnCentimos(r.gastos, 180), 'con criterio "gastado" solo cuentan los 180', `da ${r.gastos}`)
  comprobar(igualEnCentimos(r.comida.contada, 180), 'la comida contada son 180')
  comprobar(igualEnCentimos(r.sobrante, 2820), 'sobrante = 3000 - 180', `da ${r.sobrante}`)
}

// ---------------------------------------------------------------------------
console.log('\nEl objetivo de ahorro no es un gasto')
// ---------------------------------------------------------------------------
{
  const movimientos = [
    mov({ concepto: 'Hipoteca', tipo: 'fijo', clasificacion: 'necesario', importe: 600 }),
    // Aunque alguien meta un movimiento del concepto objetivo, no debe sumar.
    mov({ concepto: 'Ahorro', tipo: 'fijo', clasificacion: 'ahorro', esObjetivo: true, importe: 500 }),
  ]
  const r = resumen(MES, movimientos, AJUSTES)
  comprobar(igualEnCentimos(r.fijos, 600), 'el objetivo de ahorro no suma en los fijos', `da ${r.fijos}`)
  comprobar(igualEnCentimos(r.objetivoAhorro, 300), 'el objetivo sale del mes, no del movimiento')
}

// ---------------------------------------------------------------------------
console.log('\nRegla 50/30/20')
// ---------------------------------------------------------------------------
{
  const movimientos = [
    mov({ concepto: 'Hipoteca', tipo: 'fijo', clasificacion: 'necesario', importe: 600 }),
    mov({ concepto: 'Netflix', tipo: 'fijo', clasificacion: 'prescindible', importe: 100 }),
    mov({ concepto: 'Bar', clasificacion: 'prescindible', importe: 200 }),
    mov({ concepto: 'Comida', tipo: 'sobre', clasificacion: 'necesario', importe: 180 }),
  ]
  const r = resumen(MES, movimientos, AJUSTES)
  const [necesario, prescindible, ahorro] = reglaCincuentaTreintaVeinte(MES, movimientos, AJUSTES, r)

  comprobar(
    igualEnCentimos(necesario.importe, 1100),
    'necesario = hipoteca + presupuesto de comida (600 + 500)',
    `da ${necesario.importe}`,
  )
  comprobar(igualEnCentimos(prescindible.importe, 300), 'prescindible = 100 + 200', `da ${prescindible.importe}`)
  comprobar(igualEnCentimos(ahorro.importe, r.sobrante), 'el bloque de ahorro es el sobrante')
  comprobar(
    igualEnCentimos(necesario.porcentaje, 36.67),
    'necesario sobre ingresos = 36,67 %',
    `da ${necesario.porcentaje}`,
  )
  comprobar(necesario.cumple === true, 'necesario cumple: 36,67 % está por debajo del 50 ideal')
  comprobar(prescindible.cumple === true, 'prescindible cumple: 10 % por debajo del 30')
  comprobar(ahorro.cumple === true, 'ahorro cumple: 53 % por encima del 20')
  comprobar(igualEnCentimos(necesario.desvio, -13.33), 'el desvío es negativo cuando se gasta de menos')
}

// ---------------------------------------------------------------------------
console.log('\nUn mes sin ingresos no divide por cero')
// ---------------------------------------------------------------------------
{
  const sinIngresos = { ...MES, ingreso: 0, presupuestoComida: 0 }
  const movimientos = [mov({ concepto: 'Bar', importe: 50 })]
  const r = resumen(sinIngresos, movimientos, AJUSTES)
  const bloques = reglaCincuentaTreintaVeinte(sinIngresos, movimientos, AJUSTES, r)

  comprobar(igualEnCentimos(r.sobrante, -50), 'el sobrante es negativo', `da ${r.sobrante}`)
  comprobar(
    bloques.every((b) => b.porcentaje === null && b.cumple === null),
    'sin ingresos los porcentajes son nulos, no infinitos',
  )
  const reparto = repartoPorTipo(sinIngresos, r)
  comprobar(reparto.every((t) => t.porcentaje === null), 'la tarta tampoco calcula porcentajes')
}

// ---------------------------------------------------------------------------
console.log('\nPeso de los fijos y ranking')
// ---------------------------------------------------------------------------
{
  const movimientos = [
    mov({ conceptoId: 10, concepto: 'Hipoteca', tipo: 'fijo', clasificacion: 'necesario', importe: 600 }),
    mov({ conceptoId: 11, concepto: 'Luz', tipo: 'fijo', clasificacion: 'necesario', importe: 100 }),
    mov({ conceptoId: 12, concepto: 'Coche', tipo: 'fijo', clasificacion: 'necesario', importe: 300 }),
    mov({ conceptoId: 20, concepto: 'Bar', importe: 40 }),
    mov({ conceptoId: 20, concepto: 'Bar', importe: 60 }),
    mov({ conceptoId: 21, concepto: 'Amazon', importe: 30 }),
  ]
  const grupos = pesoDeFijos(movimientos, [{ nombre: 'Vivienda', conceptos: [10, 11] }], 1000)
  comprobar(grupos.length === 2, 'sale el grupo pedido y el resto')
  comprobar(igualEnCentimos(grupos[0].importe, 700), 'Vivienda suma 700', `da ${grupos[0].importe}`)
  comprobar(igualEnCentimos(grupos[0].porcentaje, 70), 'Vivienda es el 70 % de los fijos')
  comprobar(igualEnCentimos(grupos[1].importe, 300), 'el resto son 300')

  const ranking = rankingVariables(movimientos)
  comprobar(ranking.length === 2, 'el ranking agrupa por concepto')
  comprobar(ranking[0].concepto === 'Bar' && ranking[0].cuantos === 2, 'Bar va primero, con dos apuntes')
  comprobar(igualEnCentimos(ranking[0].importe, 100), 'Bar suma 100')
}

// ---------------------------------------------------------------------------
console.log('\nOrden de las listas del mes')
// ---------------------------------------------------------------------------
{
  const movimientos = [
    mov({ concepto: 'Hipoteca', tipo: 'fijo', diaPrevisto: '31' }),
    mov({ concepto: 'Comunidad', tipo: 'fijo', diaPrevisto: '1' }),
    mov({ concepto: 'Netflix', tipo: 'fijo', diaPrevisto: '30,13,23' }),
    mov({ concepto: 'Coche', tipo: 'fijo', diaPrevisto: null }),
    mov({ concepto: 'Bar', fechaCobro: '2026-03-05' }),
    mov({ concepto: 'Amazon', fechaCobro: '2026-03-20' }),
  ]
  const { fijos, variables } = separar(movimientos)

  comprobar(
    fijos.map((f) => f.concepto).join(',') === 'Comunidad,Netflix,Hipoteca,Coche',
    'los fijos van por día previsto; el que no tiene día, al final',
    fijos.map((f) => f.concepto).join(','),
  )
  comprobar(
    variables.map((v) => v.concepto).join(',') === 'Amazon,Bar',
    'los variables van del más reciente al más antiguo',
  )
}

// ---------------------------------------------------------------------------
console.log('\nMatriz anual')
// ---------------------------------------------------------------------------
{
  const meses = [
    { id: 1, anio: 2026, mes: 1, ingreso: 3000, presupuestoComida: 400, objetivoAhorro: 0 },
    { id: 2, anio: 2026, mes: 2, ingreso: 3000, presupuestoComida: 400, objetivoAhorro: 0 },
  ]
  const conceptos = [
    { id: 10, nombre: 'Hipoteca', tipo: 'fijo', clasificacion: 'necesario', activo: true, orden: 0, esObjetivo: false },
    { id: 11, nombre: 'Comida', tipo: 'sobre', clasificacion: 'necesario', activo: true, orden: 1, esObjetivo: false },
    { id: 12, nombre: 'Piso viejo', tipo: 'fijo', clasificacion: 'necesario', activo: true, orden: 2, esObjetivo: false },
    { id: 20, nombre: 'Bar', tipo: 'variable', clasificacion: 'prescindible', activo: true, orden: 3, esObjetivo: false },
  ]
  const movimientos = [
    { ...mov({ conceptoId: 10, concepto: 'Hipoteca', tipo: 'fijo', importe: 600 }), numeroMes: 1 },
    { ...mov({ conceptoId: 10, concepto: 'Hipoteca', tipo: 'fijo', importe: 600 }), numeroMes: 2 },
    { ...mov({ conceptoId: 20, concepto: 'Bar', importe: 100 }), numeroMes: 1 },
    { ...mov({ conceptoId: 11, concepto: 'Comida', tipo: 'sobre', importe: 250 }), numeroMes: 1 },
  ]

  const matriz = matrizAnual({ anio: 2026, meses, movimientos, conceptos, ajustes: AJUSTES })
  const buscar = (nombre) => matriz.filas.find((f) => f.nombre === nombre)

  comprobar(matriz.meses.length === 2, 'solo salen los meses que existen')
  comprobar(!buscar('Piso viejo'), 'un fijo sin ningún apunte en el año no pinta fila')
  comprobar(igualEnCentimos(buscar('Hipoteca').total, 1200), 'la hipoteca suma 1200 en el año')
  comprobar(igualEnCentimos(buscar('Hipoteca').media, 600), 'su media mensual es 600')
  comprobar(
    igualEnCentimos(buscar('Comida').valores[0], 400),
    'la comida sale por su presupuesto, no por lo apuntado',
    `da ${buscar('Comida').valores[0]}`,
  )
  comprobar(igualEnCentimos(buscar('Otros').valores[0], 100), '"Otros" agrupa los variables')
  comprobar(buscar('Otros').valores[1] === null, 'un mes sin variables queda en blanco, no en cero')
  comprobar(igualEnCentimos(buscar('Gastos').valores[0], 1100), 'gastos de enero = 600 + 100 + 400')
  comprobar(igualEnCentimos(buscar('Ahorro').valores[0], 1900), 'la fila Ahorro es el sobrante')
  comprobar(
    matriz.detalleVariables['1']?.length === 1,
    'el detalle de variables va por mes',
  )
}

console.log(`\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`)
process.exit(estado.fallos === 0 ? 0 : 1)
