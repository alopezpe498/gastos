import { bd } from '../db/index.js'
import * as mesesBd from '../db/meses.js'
import * as movimientosBd from '../db/movimientos.js'
import * as plantillaBd from '../db/plantilla.js'
import { lineasParaMes } from './plantilla.js'
import * as conceptosBd from '../db/conceptos.js'
import * as configBd from '../db/config.js'
import { mesAnterior, mesSiguiente } from '../lib/fechas.js'

/**
 * Abre un mes: lo crea y genera, como pendientes, un movimiento por cada fijo
 * activo con su importe y su dia previstos.
 *
 * El ingreso y el presupuesto de comida salen de la PLANTILLA (pantalla
 * Conceptos > Plantilla). Solo si la plantilla no dice nada se heredan del mes
 * anterior, que es lo que habia antes de que la plantilla existiera. Todo eso
 * es editable despues; abrir el mes es un punto de partida, no un contrato.
 */
export const abrir = bd.transaction(({ anio, mes }) => {
  const yaExiste = mesesBd.porFecha(anio, mes)
  if (yaExiste) return { mes: yaExiste, creado: false }

  const previo = mesAnterior(anio, mes)
  const anterior = mesesBd.porFecha(previo.anio, previo.mes)

  // El objetivo de ahorro sale de la plantilla del concepto "Ahorro": es lo que
  // me gustaria apartar este mes, no un gasto mas. El presupuesto de comida,
  // de la plantilla del sobre, que es donde vive el "500 al mes" de siempre.
  const objetivo = conceptosBd.conceptoObjetivo()
  const plantillaObjetivo = objetivo ? plantillaBd.vigenteEn(objetivo.id, anio, mes) : null
  const sobre = conceptosBd.sobrePrincipal()
  const plantillaSobre = sobre ? plantillaBd.vigenteEn(sobre.id, anio, mes) : null

  const nuevo = mesesBd.crear({
    anio,
    mes,
    ingreso: configBd.ingresoPrevisto() ?? anterior?.ingreso ?? 0,
    presupuestoComida: plantillaSobre?.importePrevisto ?? anterior?.presupuestoComida ?? 0,
    objetivoAhorro: plantillaObjetivo?.importePrevisto ?? anterior?.objetivoAhorro ?? 0,
    dineroEnCuenta: null,
    estado: 'abierto',
  })

  let generados = 0
  for (const fijo of lineasParaMes(anio, mes)) {
    // El sobre no genera movimiento: su importe es el presupuesto del mes.
    // El objetivo de ahorro tampoco: no es dinero que salga de la cuenta.
    if (fijo.tipo !== 'fijo' || fijo.esObjetivo) continue
    movimientosBd.crear({
      mesId: nuevo.id,
      conceptoId: fijo.conceptoId,
      importe: fijo.importePrevisto,
      importePrevisto: fijo.importePrevisto,
      diaPrevisto: fijo.diaPrevisto,
      fechaCobro: null, // pendiente: todavia no me lo han cobrado
      origen: 'manual',
    })
    generados += 1
  }

  return { mes: mesesBd.obtener(nuevo.id), creado: true, generados }
})

/** Abre el mes que va detras de uno dado. */
export function abrirSiguienteA(mes) {
  return abrir(mesSiguiente(mes.anio, mes.mes))
}

/**
 * Se asegura de que un mes exista, y con el todos los que quedaran por medio.
 *
 * Esta es la puerta por la que entra la aplicacion: no hay que "abrir" un mes a
 * mano. Si hoy es septiembre y el ultimo mes que hay es junio, pedir septiembre
 * crea tambien julio y agosto. Esos meses pasaron y sus recibos se cobraron: lo
 * raro seria que no existieran.
 *
 * Solo se rellena hacia DELANTE, desde el ultimo mes que haya. Ir hacia atras
 * crea unicamente el mes pedido: el pasado se importa del Excel, no se inventa.
 */
const TOPE_RELLENO = 24

export const asegurar = bd.transaction(({ anio, mes }) => {
  const existente = mesesBd.porFecha(anio, mes)
  if (existente) return { mes: existente, creados: [], recortado: false }

  const numero = (a, m) => a * 12 + (m - 1)
  const destino = numero(anio, mes)

  const todos = mesesBd.listar()
  const ultimo = todos.length
    ? todos.reduce((a, b) => (numero(b.anio, b.mes) > numero(a.anio, a.mes) ? b : a))
    : null

  // Los meses que hay que crear, del mas antiguo al pedido.
  const porCrear = []
  if (ultimo && destino > numero(ultimo.anio, ultimo.mes)) {
    let actual = mesSiguiente(ultimo.anio, ultimo.mes)
    while (numero(actual.anio, actual.mes) <= destino) {
      porCrear.push(actual)
      actual = mesSiguiente(actual.anio, actual.mes)
    }
  } else {
    porCrear.push({ anio, mes })
  }

  /*
   * Un tope por si alguien pide un mes de dentro de diez años: crear ciento
   * veinte meses de fijos pendientes de golpe no lo quiere nadie. Se crean los
   * ultimos, que son los que interesan, y se avisa.
   */
  const recortado = porCrear.length > TOPE_RELLENO
  const definitivos = recortado ? porCrear.slice(-TOPE_RELLENO) : porCrear

  const creados = []
  for (const cual of definitivos) {
    const { mes: creado } = abrir(cual)
    creados.push(creado)
  }

  return {
    mes: mesesBd.porFecha(anio, mes),
    // Solo se cuentan los que de verdad se han creado ahora.
    creados: creados.filter((c) => c.anio !== anio || c.mes !== mes),
    recortado,
  }
})

