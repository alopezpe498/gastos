import { bd } from './index.js'
import * as conceptosBd from './conceptos.js'
import * as reglasBd from './reglas.js'
import * as configBd from './config.js'

/**
 * Reglas iniciales para leer el extracto del banco.
 *
 * EL ORDEN DE ESTA LISTA ES EL ORDEN DE EVALUACION, y es lo que hace que la
 * clasificacion funcione. Tres cosas dependen de el:
 *
 *   1. Los FIJOS van antes que la COMIDA, y la comida antes que los VARIABLES.
 *      Asi "AMAZON PRIME" cae en Netflix etc (fijo) y no en Amazon (variable).
 *   2. Dentro de los fijos, el orden es el de la hoja de siempre.
 *   3. BIZUM va justo antes de los variables y NO clasifica: un Bizum puede ser
 *      cualquier cosa, asi que siempre pasa por revision.
 *
 * ---------------------------------------------------------------------------
 * Lo aprendido con un extracto de verdad (agosto de 2026, 71 movimientos)
 * ---------------------------------------------------------------------------
 *
 * - 'exacta' no es un adorno. Con la busqueda normal, BAR encajaba dentro de
 *   BARCELONA y se llevaba siete movimientos que no tenian nada que ver: el
 *   tunel del Cadi, una fruteria y cuatro pagos de Glovo.
 * - Y lo contrario tambien pasa: el banco escribe AUTOPISTAS, no AUTOPISTA, y
 *   PRESTAMOS, no PRESTAM. Por eso lo normal es 'empieza'.
 * - NO hay reglas de sitios. Una compra en Berga es una compra, no un gasto del
 *   piso de San Juan; del piso solo llegan recibos, y esos traen CERCS o
 *   BERGUEDA.
 */

// Sube este numero al cambiar las reglas de abajo. Al arrancar, las que sigan
// siendo de fabrica se rehacen; las que hayas tocado o creado, no.
const VERSION = 2
const CLAVE_VERSION = 'version_reglas'

// Conceptos que las reglas necesitan y que el catalogo no tenia.
const CONCEPTOS_QUE_FALTAN = [
  { nombre: 'Bloqueado', tipo: 'fijo', clasificacion: 'necesario' },
  { nombre: 'Jesús', tipo: 'variable', clasificacion: 'prescindible' },
  { nombre: 'Invitan Cumple', tipo: 'variable', clasificacion: 'prescindible' },
]

/** ['CUOTA', 'exacta'] cuando la palabra tiene que encajar entera. */
const FIJOS = [
  ['Telf BCN', ['DIGI', 'TELECOM']],
  ['Hipoteca', ['PRESTAM', ['CUOTA', 'exacta']]],
  ['Seguro Casa', ['SEGURO CASA']],
  ['Bloqueado', ['BLOQUEADO']],
  ['Comunidad', ['COMUNIDAD', 'FINCAS CRESPO']],
  ['Gastos Niñas', ['GASTOS NEN', 'ESTUD']],
  ['Santa Lucía', ['SANTA LUCIA']],
  ['Luz/Gas/Agua/IBI', ['NATURGY', 'ENDESA', 'AIGUES', ['AGUA', 'exacta'], ['IBI', 'exacta'], 'VISALIA']],
  // Solo textos de recibos: los sitios (BERGA) clasificaban compras normales.
  ['Piso SJ', ['PISO SJ', 'CERCS', 'BERGUEDA']],
  ['Gatos', ['GATO']],
  // Las gasolineras van al variable Gasolina: repostar es un gasto suelto.
  ['Coche', ['AUTOPISTA']],
  [
    'Netflix etc',
    [
      'NETFLIX',
      'SPOTIFY',
      'AMAZON PRIME',
      'PRIMEVIDEO',
      'DISNEY',
      'HBO',
      'DAZN',
      'OPENAI',
      'CHATGPT',
      'ANTHROPIC',
      'CLAUDE',
      'CURSOR',
      'GOOGLE',
      ['PRIME', 'exacta'],
    ],
  ],
  ['Gimnasio', ['GYM', 'GIMNAS', 'BASIC-FIT', 'FITNESS']],
]

const COMIDA = [
  'MERCADONA',
  'CONDIS',
  'CAPRABO',
  'CARREFOUR',
  'CARREF',
  'LIDL',
  'SPAR',
  'CARNICERIA',
  'CARNS',
  'FRUTERIA',
  'BOLETS',
]

const VARIABLES = [
  ['JustEat', ['JUST EAT', 'JUSTEAT', 'GLOVO']],
  ['Farmacia', ['FARMACIA']],
  ['Amazon', ['AMAZON']],
  ['Taxi', ['TAXI']],
  ['Metro', [['METRO', 'exacta']]],
  ['Lotería/Quinielas', ['LOTERIA', 'QUINIELA', ['ONCE', 'exacta']]],
  ['Restaurante', ['RESTAURANT']],
  ['Bar', [['BAR', 'exacta']]],
  ['Cajero', ['CAJERO', 'REINTEGRO']],
  ['Gasolina', ['REPSOL', 'CEPSA', 'GASOLINERA', 'GASOIL']],
]

/** Deja el catalogo de reglas al dia. Solo toca las que siguen siendo de fabrica. */
export const sembrarReglas = bd.transaction(() => {
  const version = Number(configBd.leer(CLAVE_VERSION, '0')) || 0
  const hay = bd.prepare('SELECT COUNT(*) AS n FROM reglas_clasificacion').get().n
  if (hay > 0 && version >= VERSION) return { creadas: 0, borradas: 0, conceptosCreados: [] }

  const conceptosCreados = []
  for (const nuevo of CONCEPTOS_QUE_FALTAN) {
    if (conceptosBd.buscarPorNombre(nuevo.nombre)) continue
    conceptosBd.crear(nuevo)
    conceptosCreados.push(nuevo.nombre)
  }

  // Fuera las de fabrica que quedan; las tuyas y las aprendidas se quedan.
  const borradas = bd
    .prepare("DELETE FROM reglas_clasificacion WHERE origen = 'seed'")
    .run().changes

  let prioridad = 0
  let creadas = 0

  const anadir = (nombreConcepto, textos, tipo) => {
    // Un concepto que no esta en el catalogo se salta en silencio: las reglas
    // son una ayuda, no pueden impedir que arranque la aplicacion.
    const concepto = nombreConcepto ? conceptosBd.buscarPorNombre(nombreConcepto) : null
    if (nombreConcepto && !concepto) return
    for (const entrada of textos) {
      const [texto, coincidencia = 'empieza'] = Array.isArray(entrada) ? entrada : [entrada]
      reglasBd.crear({
        texto,
        conceptoId: concepto?.id ?? null,
        tipo,
        coincidencia,
        prioridad: (prioridad += 1),
        estado: 'confirmada',
        origen: 'seed',
      })
      creadas += 1
    }
  }

  for (const [nombre, textos] of FIJOS) anadir(nombre, textos, 'fijo')

  const sobre = conceptosBd.sobrePrincipal()
  if (sobre) anadir(sobre.nombre, COMIDA, 'sobre')

  // Sin concepto: reconoce el Bizum para que ninguna regla de abajo se lo
  // quede, pero lo manda a revision.
  anadir(null, ['BIZUM'], 'manual')

  for (const [nombre, textos] of VARIABLES) anadir(nombre, textos, 'variable')

  // Las tuyas se quedan detras de las de fabrica, sin renumerarlas entre si.
  bd.prepare(
    `UPDATE reglas_clasificacion SET prioridad = prioridad + @tope
     WHERE origen <> 'seed' AND prioridad <= @tope`,
  ).run({ tope: prioridad })

  configBd.escribir(CLAVE_VERSION, VERSION)
  return { creadas, borradas, conceptosCreados }
})
