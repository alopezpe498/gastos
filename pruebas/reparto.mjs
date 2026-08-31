// Pruebas de `repartoDelMes`: pagado, comprometido y libre.
//
// Es la función que decide la barra del bloque principal de Mes, y se equivocó
// de la peor manera: un mes recién abierto, sin gastar un euro, decía que
// llevabas 500 € pagados —el sobre entero— y 0 comprometidos. La barra no
// describía nada y «Te queda» mentía por 800 €.
//
// Por eso las tres definiciones están aquí escritas como comprobaciones, con el
// caso exacto que lo destapó: 14 fijos de 1.317 € todos cobrados, comida 0 de
// 500 y ningún extra.
import { repartoDelMes } from '../server/services/calculos.js'
import { crearComprobador, igualEnCentimos } from './entorno.mjs'

const { comprobar, estado } = crearComprobador()

const POR_PRESUPUESTO = { comidaEnTotal: 'presupuesto' }
const POR_GASTADO = { comidaEnTotal: 'gastado' }

/** Un fijo. Sin `fechaCobro` está pendiente, que es como nace. */
const fijo = (importe, cobrado = false) => ({
  tipo: 'fijo',
  importe,
  cobrado,
  esObjetivo: false,
})
const variable = (importe) => ({ tipo: 'variable', importe, cobrado: true, esObjetivo: false })
const comida = (importe) => ({ tipo: 'sobre', importe, cobrado: true, esObjetivo: false })

// ---------------------------------------------------------------------------
console.log('\nEl caso que lo destapó')
// ---------------------------------------------------------------------------
{
  const mes = { ingreso: 3200, presupuestoComida: 500 }
  const movimientos = [fijo(1317, true)]
  const r = repartoDelMes(mes, movimientos, POR_PRESUPUESTO)

  comprobar(igualEnCentimos(r.pagado, 1317), 'pagado son los fijos cobrados', String(r.pagado))
  comprobar(
    igualEnCentimos(r.comprometido, 500),
    'comprometido es el sobre que queda por gastar',
    String(r.comprometido),
  )
  comprobar(igualEnCentimos(r.libre, 1383), 'libre es lo que sobra de verdad', String(r.libre))
  comprobar(
    igualEnCentimos(r.pagado + r.comprometido + r.libre, 3200),
    'y los tres suman la nómina',
  )
}

// ---------------------------------------------------------------------------
console.log('\nUn mes recién abierto no tiene nada pagado')
// ---------------------------------------------------------------------------
{
  const mes = { ingreso: 3200, presupuestoComida: 500 }
  // Como nace un mes: todos los fijos pendientes y ni un apunte.
  const r = repartoDelMes(mes, [fijo(600), fijo(400), fijo(317)], POR_PRESUPUESTO)

  comprobar(igualEnCentimos(r.pagado, 0), 'el día 1 no se ha pagado nada', String(r.pagado))
  comprobar(
    igualEnCentimos(r.comprometido, 1817),
    'todo son fijos pendientes más el sobre entero',
    String(r.comprometido),
  )
  comprobar(igualEnCentimos(r.libre, 1383), 'y libre es el resto', String(r.libre))
}

// ---------------------------------------------------------------------------
console.log('\nLa comida: comprometido es solo lo que queda del sobre')
// ---------------------------------------------------------------------------
{
  const mes = { ingreso: 3000, presupuestoComida: 500 }

  const aMedias = repartoDelMes(mes, [comida(200)], POR_PRESUPUESTO)
  comprobar(igualEnCentimos(aMedias.pagado, 200), 'lo gastado de comida está pagado')
  comprobar(
    igualEnCentimos(aMedias.comprometido, 300),
    'y lo que falta del sobre, comprometido',
    String(aMedias.comprometido),
  )

  const pasado = repartoDelMes(mes, [comida(620)], POR_PRESUPUESTO)
  comprobar(igualEnCentimos(pasado.pagado, 620), 'pasarse del sobre está pagado entero')
  comprobar(
    igualEnCentimos(pasado.comprometido, 0),
    'y no compromete nada más: no se puede deber lo que ya te has gastado',
    String(pasado.comprometido),
  )
  comprobar(igualEnCentimos(pasado.libre, 2380), 'libre baja de verdad al pasarse')
}

// ---------------------------------------------------------------------------
console.log('\nCon el criterio «lo gastado», el sobre no compromete')
// ---------------------------------------------------------------------------
{
  const mes = { ingreso: 3000, presupuestoComida: 500 }
  const r = repartoDelMes(mes, [comida(200), fijo(300)], POR_GASTADO)

  comprobar(igualEnCentimos(r.pagado, 200), 'pagado sigue siendo lo gastado')
  comprobar(
    igualEnCentimos(r.comprometido, 300),
    'comprometido son solo los fijos pendientes',
    String(r.comprometido),
  )
  comprobar(
    igualEnCentimos(r.libre, 2500),
    'y queda libre lo que el sobre ya no reserva',
    String(r.libre),
  )
}

// ---------------------------------------------------------------------------
console.log('\nLos tres estados y el ritmo')
// ---------------------------------------------------------------------------
{
  const mes = { ingreso: 3000, presupuestoComida: 400 }
  const r = repartoDelMes(
    mes,
    [fijo(800, true), fijo(200), variable(150), comida(100)],
    POR_PRESUPUESTO,
  )

  comprobar(igualEnCentimos(r.pagado, 1050), 'pagado = 800 cobrado + 150 + 100', String(r.pagado))
  comprobar(igualEnCentimos(r.comprometido, 500), 'comprometido = 200 + 300 de sobre')
  comprobar(igualEnCentimos(r.libre, 1450), 'libre = 3000 − 1050 − 500')
  comprobar(
    igualEnCentimos(r.pagadoSinFijos, 250),
    'el ritmo se mide sin los fijos: 150 + 100',
    String(r.pagadoSinFijos),
  )
}

// ---------------------------------------------------------------------------
console.log('\nLos casos raros no rompen nada')
// ---------------------------------------------------------------------------
{
  const sinNada = repartoDelMes({ ingreso: 0, presupuestoComida: 0 }, [], POR_PRESUPUESTO)
  comprobar(
    sinNada.pagado === 0 && sinNada.comprometido === 0 && sinNada.libre === 0,
    'un mes vacío y sin nómina vale cero en todo',
  )

  // El objetivo de ahorro no es dinero que salga: no cuenta en ningún lado.
  const conObjetivo = repartoDelMes(
    { ingreso: 2000, presupuestoComida: 0 },
    [{ tipo: 'fijo', importe: 300, cobrado: false, esObjetivo: true }],
    POR_PRESUPUESTO,
  )
  comprobar(
    conObjetivo.comprometido === 0 && conObjetivo.libre === 2000,
    'el objetivo de ahorro no compromete nada: no es un gasto',
  )

  const abono = repartoDelMes(
    { ingreso: 2000, presupuestoComida: 0 },
    [variable(100), variable(-40)],
    POR_PRESUPUESTO,
  )
  comprobar(igualEnCentimos(abono.pagado, 60), 'un abono resta de lo pagado', String(abono.pagado))

  const pasadoDeVueltas = repartoDelMes(
    { ingreso: 1000, presupuestoComida: 0 },
    [variable(1500)],
    POR_PRESUPUESTO,
  )
  comprobar(
    igualEnCentimos(pasadoDeVueltas.libre, -500),
    'gastar más de lo que entra da un libre negativo, no cero',
    String(pasadoDeVueltas.libre),
  )
}

console.log(
  `\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`,
)
process.exit(estado.fallos === 0 ? 0 : 1)
