/**
 * Un extracto calcado del de Banc Sabadell, con datos inventados.
 *
 * Reproduce a proposito todo lo que hace dificil el fichero real y que se
 * descubrio mirandolo:
 *
 *   - Siete filas de titulo, cuenta y periodo ANTES de la cabecera.
 *   - Dos columnas de fecha (operativa y valor): vale la primera.
 *   - Fechas como TEXTO "dd/mm/aaaa", no como numero de Excel.
 *   - El prefijo de tarjeta "COMPRA TARJ. 5402XXXXXXXX4010" delante de casi todo.
 *   - Descripciones CORTADAS a la mitad de una palabra ("WWW.AMAZON-LUXEM").
 *   - Fechas sueltas al principio ("20.08 TUNELSPAN", "13AUG BVK11V8J").
 *   - Varias facturas del mismo fijo en el mismo mes (dos de gas y una de agua).
 *   - La nomina del 29/07 abriendo el mes: el mes va de nomina a nomina, no
 *     del 1 al 31, y el extracto la trae al final porque el banco los da del
 *     mas reciente al mas antiguo.
 *   - Abonos que NO son la nomina (una devolucion, un Bizum recibido): entran
 *     como variables en negativo, no se omiten.
 *   - Una fila de saldo al final SIN importe, que no es un movimiento.
 *   - "BAR" dentro de "BARCELONA", que era la trampa que rompia la clasificacion.
 */

export const CABECERA = [
  'F. Operativa',
  'Concepto',
  'F. Valor',
  'Importe',
  'Saldo',
  'Referencia 1',
  'Referencia 2',
]

const TARJ = 'COMPRA TARJ. 5402XXXXXXXX4010 '

/** Las filas tal cual salen del banco, incluida la morralla de arriba. */
export const FILAS = [
  ['Consulta de movimientos'],
  ['29/08/2026 13:17:42'],
  [],
  ['Cuenta: ', 'ES00 0000 0000 0000 0000 0000'],
  ['Divisa: ', 'EUR'],
  ['Titular:', 'NOMBRE*APELLIDO APELLIDO'],
  ['Selección:', 'Desde 29/07/2026 hasta 26/08/2026'],
  [],
  CABECERA,

  // --- agosto: lo que tiene que entrar ---
  ['26/08/2026', `${TARJ}CONDIS-BARCELONA`, '29/08/2026', -21.14, 312.61, '', '5402__4010'],
  ['25/08/2026', `${TARJ}BAR CAFETERIA AYING-BARCELONA`, '28/08/2026', -6.3, 333.75, '', ''],
  ['25/08/2026', `${TARJ}WWW.AMAZON-LUXEM`, '28/08/2026', -379.99, 340.05, '', ''],
  // La trampa: contiene "BAR" pero es un peaje.
  ['25/08/2026', `${TARJ}20.08 TUNELSPAN Barrera Cadi S-BARCELONA`, '25/08/2026', -14.56, 720.04, '', ''],
  // Otra trampa: contiene "BAR" pero es comida.
  ['24/08/2026', `${TARJ}FRUTERIA SAFSAFI-BARCELONA`, '27/08/2026', -9.3, 734.6, '', ''],
  // El banco escribe AUTOPISTAS y la regla es AUTOPISTA.
  ['20/08/2026', `${TARJ}14.08 AUTOPISTAS TERRASSA-CASTELBELL`, '20/08/2026', -9.76, 743.9, '', ''],
  // Tres facturas que van al mismo fijo: se tienen que sumar.
  ['20/08/2026', 'AGUA AIGUES DE BARCELONA SUBMINISTRAMENT D', '20/08/2026', -45.04, 753.66, 'A00000000', ''],
  ['18/08/2026', 'GAS Naturgy Clientes, S.A.U.', '18/08/2026', -71.93, 798.7, 'A00000001', ''],
  ['13/08/2026', 'GAS Naturgy Clientes, S.A.U.', '13/08/2026', -59.46, 870.63, 'A00000001', ''],
  ['17/08/2026', 'ADEUDO RECIBO Basic-Fit Spain S.A.U (BNP)', '17/08/2026', -19.99, 930.09, 'A00000002', ''],
  ['14/08/2026', `${TARJ}OPENAI *CHATGPT SUBSCR-SAN FRANCISCO`, '16/08/2026', -21.03, 950.08, '', ''],
  ['12/08/2026', `${TARJ}MERCADONA BERGA-BERGA`, '15/08/2026', -11.8, 971.11, '', ''],
  // Un codigo opaco: no lo reconoce nadie, va a sin clasificar.
  ['12/08/2026', `${TARJ}13AUG BVK11V8J-Barcelona`, '15/08/2026', -32.68, 982.91, '', ''],
  ['10/08/2026', 'PAGO BIZUM NOMBRE A. B.', '10/08/2026', -190, 1015.59, '', '000000000001'],
  ['03/08/2026', 'REINTEGRO CAJERO AUTOMATICO 5402XXXXXXXX4010 03.08', '03/08/2026', -800, 1205.59, '', ''],

  // --- abonos: el banco ingresa dinero ---
  // Una devolucion que una regla SI reconoce: entra como variable en negativo.
  ['11/08/2026', `DEVOLUCION 5402XXXXXXXX4010 09.08 JustEat-MADRID`, '12/08/2026', 53.69, 1259.28, '', ''],
  // Y uno que no reconoce nadie: va a sin clasificar, con su etiqueta de abono.
  ['21/08/2026', 'ABONO TRANSFERENCIA DE Nombre Apellido', '21/08/2026', 117, 2005.59, '', ''],

  // --- la nomina abre el mes ---
  ['29/07/2026', 'NOMINA DE EMPRESA EJEMPLO SL', '29/07/2026', 3124.21, 1888.59, '', ''],

  // --- del mes anterior por el calendario, pero DEL MES: entran igual ---
  ['31/07/2026', 'PRESTAMOS ADEUDO CUOTA N.0000000000 31/07/26', '31/07/2026', -622.53, -1235.62, '', ''],
  ['30/07/2026', 'ADEUDO RECIBO DIGI SPAIN TELECOM SA', '30/07/2026', -34, -613.09, 'A00000003', ''],
  ['29/07/2026', `${TARJ}NETFLIX.COM-MADRID`, '31/07/2026', -21.99, -579.09, '', ''],

  // --- morralla del final: sin importe, no es un movimiento ---
  [],
  ['Saldo final', '', '', '', 312.61],
  ['Documento sin valor contractual'],
]

/** Lo que tiene que salir de este fichero, para comprobarlo en las pruebas. */
export const ESPERADO = {
  filaCabecera: 8, // base 0
  movimientos: 21,
  gastos: 18,
  // La nomina y dos abonos.
  abonos: 3,
  // El periodo que define el mes: del primer movimiento al ultimo.
  desde: '2026-07-29',
  hasta: '2026-08-26',
  // La suma de todos los importes, con signo. Se calcula del propio fixture:
  // escribirla a mano solo sirve para equivocarse al tocar una fila.
  suma: FILAS.reduce((t, f) => t + (typeof f[3] === 'number' ? f[3] : 0), 0),
}

/** Lo mismo en texto separado por tabuladores, como al copiar de la web. */
export function comoTexto() {
  return FILAS.map((fila) =>
    fila
      .map((celda) =>
        typeof celda === 'number'
          ? String(celda).replace('.', ',')
          : String(celda ?? ''),
      )
      .join('\t'),
  ).join('\n')
}
