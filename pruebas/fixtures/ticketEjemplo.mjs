/**
 * Un ticket de Mercadona en catalan, con datos inventados.
 *
 * Calcado del de verdad en todo lo que hace dificil leerlo, que es lo que se
 * descubre mirando uno:
 *
 *   - Esta en CATALAN y con las abreviaturas de la cadena: "PIT 2 U." es
 *     pechuga de pollo, "CUIXA DESOSSADO" es muslo deshuesado, "F. TALLS
 *     CREMOS" es queso en lonchas, "LLET SENCERA S/LACT" es leche entera sin
 *     lactosa.
 *   - Lineas POR PESO ("COLIFLOR 1,252 kg 2,50 EUR/kg 3,13") y lineas por
 *     UNIDADES con precio a la vista ("2 LLET 1,03 2,06").
 *   - Marcas metidas dentro del nombre: "PETIT NESQUICK" es un petit suisse de
 *     Nesquik, "VITROCLEAN" es un limpiador de vitroceramica.
 *   - Cosas que NO son comida pero salen del mismo sobre: lejia, champu, comida
 *     para gatos.
 *   - Un DESCUENTO con importe negativo, que no se resta de otra linea.
 *   - Lineas de total, IVA y tarjeta al final, que NO son movimientos.
 *
 * Las 45 lineas suman 105,00 €, que es lo que dice el total: ese es justo el
 * cuadre que la revision no deja saltarse.
 */

const TICKET = [
  // [texto impreso, cantidad, unidad, precio unitario, importe, variante, producto, categoria, marca]
  ['PIT 2 U.', 2, 'ud', 3.45, 6.9, 'Pechuga de pollo', 'Pollo', 'Carne y charcutería', null],
  ['CUIXA DESOSSADO', 1, 'kg', 5.9, 5.9, 'Muslo deshuesado', 'Pollo', 'Carne y charcutería', null],
  ['CARN PICADA MIXTA', 0.512, 'kg', 8.5, 4.35, 'Carne picada mixta', 'Carne picada', 'Carne y charcutería', null],
  ['LLOM ADOBAT', 0.38, 'kg', 9.95, 3.78, 'Lomo adobado', 'Cerdo', 'Carne y charcutería', null],
  ['F. TALLS CREMOS', 1, 'ud', 2.35, 2.35, 'Queso en lonchas cremoso', 'Queso', 'Lácteos y huevos', null],
  ['PERNIL DOLC TALLS', 1, 'ud', 2.6, 2.6, 'Jamón cocido en lonchas', 'Embutido', 'Carne y charcutería', null],
  ['XORIC EXTRA', 1, 'ud', 2.15, 2.15, 'Chorizo', 'Embutido', 'Carne y charcutería', null],
  ['BACO SALMO', 2, 'ud', 3.2, 6.4, 'Lomo de salmón', 'Salmón', 'Pescado y marisco', null],
  ['LLUC ROSSA', 0.64, 'kg', 7.9, 5.06, 'Merluza', 'Merluza', 'Pescado y marisco', null],
  ['GAMBA CUITA', 0.3, 'kg', 9.5, 2.85, 'Gamba cocida', 'Gamba', 'Pescado y marisco', null],
  ['LLET SENCERA S/LACT', 6, 'ud', 1.03, 6.18, 'Leche entera sin lactosa', 'Leche', 'Lácteos y huevos', null],
  ['PETIT NESQUICK', 1, 'ud', 2.45, 2.45, 'Petit suisse', 'Yogur y postres lácteos', 'Lácteos y huevos', 'Nesquik'],
  ['IOGURT NATURAL 8U', 1, 'ud', 1.55, 1.55, 'Yogur natural', 'Yogur y postres lácteos', 'Lácteos y huevos', null],
  ['OUS L 12U', 1, 'ud', 2.75, 2.75, 'Huevos', 'Huevos', 'Lácteos y huevos', null],
  ['MANTEGA', 1, 'ud', 2.1, 2.1, 'Mantequilla', 'Mantequilla', 'Lácteos y huevos', null],
  ['COLIFLOR', 1.252, 'kg', 2.5, 3.13, 'Coliflor', 'Coliflor', 'Verdura y hortalizas', null],
  ['TOMAQUET AMANIR', 0.86, 'kg', 2.2, 1.89, 'Tomate para ensalada', 'Tomate', 'Verdura y hortalizas', null],
  ['CEBA', 1.04, 'kg', 1.35, 1.4, 'Cebolla', 'Cebolla', 'Verdura y hortalizas', null],
  ['PATATA', 2.5, 'kg', 1.1, 2.75, 'Patata', 'Patata', 'Verdura y hortalizas', null],
  ['PASTANAGA', 0.5, 'kg', 1.2, 0.6, 'Zanahoria', 'Zanahoria', 'Verdura y hortalizas', null],
  ['ENCIAM', 1, 'ud', 1.15, 1.15, 'Lechuga', 'Lechuga', 'Verdura y hortalizas', null],
  ['CARBASSO', 0.72, 'kg', 1.85, 1.33, 'Calabacín', 'Calabacín', 'Verdura y hortalizas', null],
  ['PEBROT VERMELL', 0.44, 'kg', 3.1, 1.36, 'Pimiento rojo', 'Pimiento', 'Verdura y hortalizas', null],
  ['PLATAN', 1.18, 'kg', 1.75, 2.07, 'Plátano', 'Plátano', 'Fruta', null],
  ['POMA GOLDEN', 1.35, 'kg', 1.95, 2.63, 'Manzana golden', 'Manzana', 'Fruta', null],
  ['MADUIXA 500G', 1, 'ud', 2.5, 2.5, 'Fresa', 'Fresa', 'Fruta', null],
  ['TARONJA SUC', 2.2, 'kg', 1.25, 2.75, 'Naranja de zumo', 'Naranja', 'Fruta', null],
  ['PA DE PAGES', 1, 'ud', 1.4, 1.4, 'Pan de payés', 'Pan', 'Panadería y bollería', null],
  ['CROISSANTS 4U', 1, 'ud', 1.85, 1.85, 'Croissant', 'Bollería', 'Panadería y bollería', null],
  ['OLI OLIVA VERGE 1L', 1, 'ud', 8.95, 8.95, 'Aceite de oliva virgen extra', 'Aceite', 'Despensa', null],
  ['ARROS RODO 1KG', 1, 'ud', 1.35, 1.35, 'Arroz redondo', 'Arroz', 'Despensa', null],
  ['PASTA MACARRONS', 2, 'ud', 0.95, 1.9, 'Macarrones', 'Pasta', 'Despensa', null],
  ['TOMAQUET FREGIT', 2, 'ud', 1.1, 2.2, 'Tomate frito', 'Conservas', 'Despensa', null],
  ['TONYINA CLARA 3U', 1, 'ud', 2.4, 2.4, 'Atún en aceite', 'Conservas', 'Despensa', null],
  ['SAL FINA', 1, 'ud', 0.45, 0.45, 'Sal', 'Especias y condimentos', 'Despensa', null],
  ['PESOLS CONGELATS', 1, 'ud', 1.65, 1.65, 'Guisantes congelados', 'Verdura congelada', 'Congelados', null],
  ['PIZZA 4 FORMATGES', 1, 'ud', 2.9, 2.9, 'Pizza cuatro quesos', 'Pizza', 'Platos preparados y snacks', null],
  ['PATATES XIPS', 1, 'ud', 1.45, 1.45, 'Patatas fritas de bolsa', 'Aperitivos', 'Platos preparados y snacks', null],
  ['AIGUA 6X1,5L', 1, 'ud', 1.8, 1.8, 'Agua mineral', 'Agua', 'Bebidas', null],
  ['CERVESA 6U', 1, 'ud', 3.45, 3.45, 'Cerveza', 'Cerveza', 'Bebidas', null],
  ['VITROCLEAN', 1, 'ud', 2.65, 2.65, 'Limpiador vitrocerámica', 'Limpiador', 'Limpieza', 'Vitroclean'],
  ['LLEIXIU 2L', 1, 'ud', 1.2, 1.2, 'Lejía', 'Lejía', 'Limpieza', null],
  ['XAMPU 400ML', 1, 'ud', 2.95, 2.95, 'Champú', 'Champú', 'Higiene y cuidado personal', null],
  ['MENJAR GAT 12U', 1, 'ud', 4.8, 4.8, 'Comida húmeda para gato', 'Comida para gato', 'Mascotas', null],
  /*
   * El descuento del cheque cruzado: importe NEGATIVO, y no se resta de ninguna
   * otra linea. Es lo que hace que 124,28 de compra se queden en 105,00 de cargo,
   * y por eso es justo la linea que rompe cualquier cuadre hecho a ojo.
   */
  ['DTE. XEC CREUAT', 1, 'ud', -19.28, -19.28, 'Descuento', 'Descuentos', 'Otros', null],
]

export const TOTAL = 105.0

/** Lo que el modelo tendria que devolver leyendo este ticket. */
export function comoRespuestaDeIa() {
  return {
    tienda: 'Mercadona',
    direccion: 'C/ Rambla Guipuscoa 76, Barcelona',
    fechaHora: '2026-10-15T19:12',
    total: TOTAL,
    formaPago: 'tarjeta',
    ultimos4: '4010',
    lineas: TICKET.map(([texto, cantidad, unidad, precio, importe, variante, producto, categoria, marca]) => ({
      textoTicket: texto,
      cantidad,
      unidad,
      precioUnitario: precio,
      importe,
      variante,
      producto,
      categoria,
      marca,
      confianza: 'alta',
    })),
    notas: [],
  }
}

/** El ticket tal cual sale impreso, para mandarlo como texto pegado. */
export function comoTexto() {
  const lineas = TICKET.map(([texto, cantidad, unidad, precio, importe]) =>
    unidad === 'kg'
      ? `${texto}  ${cantidad.toFixed(3).replace('.', ',')} kg  ${precio.toFixed(2).replace('.', ',')} EUR/kg  ${importe.toFixed(2).replace('.', ',')}`
      : `${cantidad} ${texto}  ${precio.toFixed(2).replace('.', ',')}  ${importe.toFixed(2).replace('.', ',')}`,
  )
  return [
    'MERCADONA, S.A.',
    'C/ RAMBLA GUIPUSCOA 76, BARCELONA',
    'TELEFON: 900500103',
    '15/10/2026 19:12  OP: 1234567',
    'Descripcio    P. Unit  Import',
    ...lineas,
    `TOTAL (€)  ${TOTAL.toFixed(2).replace('.', ',')}`,
    'TARGETA BANCARIA  ****4010',
    'IVA  TOTAL',
    'Gracies per la seva visita',
  ].join('\n')
}

export const ESPERADO = {
  lineas: TICKET.length,
  total: TOTAL,
  // La suma se calcula del propio fixture: escribirla a mano solo sirve para
  // equivocarse al tocar una linea.
  suma: Math.round(TICKET.reduce((t, f) => t + f[4], 0) * 100) / 100,
  tienda: 'Mercadona',
  fecha: '2026-10-15',
  categoriasPrincipales: ['Carne y charcutería', 'Verdura y hortalizas', 'Pescado y marisco'],
}
