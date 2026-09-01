import * as productosBd from '../db/productos.js'
import { preguntar, extraerJson, ErrorIa } from './ia.js'
import { esFechaIso } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

/**
 * Leer un ticket del super: cabecera, lineas y una propuesta por linea.
 *
 * Una sola llamada. Partirlo en dos —primero el texto, luego clasificar— costaba
 * el doble y leia peor: para saber que es "PIT 2 U." ayuda ver que la linea de
 * al lado es "CUIXA DESOSSADO" y que arriba pone Mercadona.
 *
 * Como todo el modulo de IA: esto NO escribe nada. Devuelve una propuesta que
 * pasa por la pantalla de revision, y los productos se validan contra el
 * catalogo real antes de salir de aqui.
 */

const SISTEMA = `Eres un ayudante que lee tickets de supermercado y de tiendas de alimentacion para una aplicacion de cuentas familiar en castellano.

Devuelve SOLO un objeto JSON, sin texto alrededor:
{
  "tienda": "Mercadona",
  "direccion": "C/ Rambla Guipuscoa 76, Barcelona",
  "fechaHora": "2026-08-29T19:12",
  "total": 105.00,
  "formaPago": "tarjeta",
  "ultimos4": "4010",
  "lineas": [
    {
      "textoTicket": "PIT 2 U.",
      "cantidad": 2,
      "unidad": "ud",
      "precioUnitario": 3.45,
      "importe": 6.90,
      "variante": "Pechuga de pollo",
      "producto": "Pollo",
      "categoria": "Carne y charcuteria",
      "marca": null,
      "confianza": "alta"
    }
  ],
  "notas": []
}

COMO SE LEEN LAS LINEAS
- "textoTicket" es lo que pone impreso, TAL CUAL, sin traducir ni arreglar. Es lo que se guarda para reconocerlo la proxima vez.
- Linea por peso ("COLIFLOR 1,252 kg 2,50 EUR/kg 3,13"): cantidad 1.252, unidad "kg", precioUnitario 2.50, importe 3.13.
- Linea por unidades con precio a la vista ("2 LLET 1,03 2,06"): cantidad 2, unidad "ud", precioUnitario 1.03, importe 2.06.
- Si solo hay importe: cantidad 1, unidad "ud", precioUnitario igual al importe.
- Los DESCUENTOS y las DEVOLUCIONES son lineas con importe NEGATIVO. No los descuentes de otra linea.
- Los importes son numeros con punto decimal. En el ticket vienen en formato espanol: "1.234,56" son mil doscientos treinta y cuatro con cincuenta y seis.
- NO incluyas lineas de total, subtotal, IVA, base imponible, ahorro, puntos ni tarjeta de fidelidad.
- La suma de los importes de las lineas tiene que dar el total del ticket. Si no te cuadra, dilo en "notas" y no te inventes una linea para cuadrarlo.

COMO SE NORMALIZA
- El ticket puede venir en CATALAN o en castellano, y con abreviaturas de la cadena. Traduce SIEMPRE a castellano. Ejemplos de Mercadona: "PIT 2 U." es pechuga de pollo (2 unidades); "CUIXA DESOSSADO" es muslo deshuesado; "F. TALLS CREMOS" es queso en lonchas cremoso; "LLET SENCERA" es leche entera; "OU" son huevos; "MAduixa" es fresa.
- "producto" y "variante" van SIN MARCA, en castellano y en singular generico.
  - "producto" es lo generico: "Pollo", "Leche", "Champu", "Lejia".
  - "variante" es lo concreto: "Pechuga de pollo", "Leche entera sin lactosa", "Limpiador vitroceramica".
- La MARCA va en su campo, nunca dentro del nombre. "PETIT NESQUICK" -> variante "Petit suisse", producto "Yogur y postres lacteos", marca "Nesquik". "VITROCLEAN" -> variante "Limpiador vitroceramica", producto "Limpiador", categoria "Limpieza", marca "Vitroclean".
- Lo que se compra en el super aunque no sea comida (limpieza, higiene, mascotas) TAMBIEN se clasifica: es parte de la compra.

EL CATALOGO
- Se te dan las CATEGORIAS y los PRODUCTOS que ya existen. Usalos copiados EXACTAMENTE siempre que encajen: es lo que permite sumar "cuanto gasto en pollo" a lo largo de los anos.
- Solo si de verdad no encaja ninguno, propon uno nuevo. La categoria SIEMPRE tiene que ser una de las de la lista.
- "confianza" es "alta" cuando el texto es claro y el producto existe en el catalogo, "media" cuando has tenido que interpretar la abreviatura, y "baja" cuando estas adivinando. Se usa para decidir que se revisa primero, asi que se sincero.`

/** Lo que se le enseña del catalogo, para que reutilice en vez de inventar. */
function catalogoParaElPrompt() {
  const categorias = productosBd.listarCategorias({ soloActivas: true })
  const productos = productosBd.listarProductos({ soloActivos: true })

  /*
   * Los productos van agrupados por categoria y no en una lista suelta: asi el
   * modelo ve a que categoria pertenece cada uno sin tener que adivinarlo, y de
   * paso el prompt ocupa menos.
   */
  const porCategoria = categorias.map((c) => {
    const suyos = productos.filter((p) => p.categoriaId === c.id).map((p) => p.nombre)
    return `${c.nombre}: ${suyos.length > 0 ? suyos.join(', ') : '(todavia ninguno)'}`
  })

  return `CATEGORIAS Y PRODUCTOS QUE YA EXISTEN\n${porCategoria.join('\n')}`
}

const UNIDADES = new Set(['ud', 'kg', 'l'])
const CONFIANZAS = new Set(['alta', 'media', 'baja'])

function numero(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

function texto(valor, max = 120) {
  const limpio = String(valor ?? '').trim()
  return limpio ? limpio.slice(0, max) : null
}

/**
 * Limpia lo que ha contestado el modelo.
 *
 * Todo lo que llega de fuera se comprueba: una unidad inventada, un importe que
 * no es un numero o una categoria que no existe pasarian a la base de datos si
 * no. La linea no se tira por eso —el texto y el importe suelen estar bien—,
 * simplemente se queda sin propuesta.
 */
function limpiarLineas(crudas, categorias) {
  const nombresDeCategoria = new Map(
    categorias.map((c) => [c.nombre.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase(), c]),
  )

  return (Array.isArray(crudas) ? crudas : [])
    .map((linea, indice) => {
      const textoTicket = texto(linea?.textoTicket, 200)
      const importe = numero(linea?.importe)
      if (!textoTicket || importe === null) return null

      const cantidad = numero(linea?.cantidad)
      const unidad = UNIDADES.has(linea?.unidad) ? linea.unidad : 'ud'
      const precio = numero(linea?.precioUnitario)

      const categoriaCruda = texto(linea?.categoria)
      const categoria = categoriaCruda
        ? nombresDeCategoria.get(
            categoriaCruda.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase(),
          ) ?? null
        : null

      return {
        orden: indice,
        textoTicket,
        cantidad: cantidad && cantidad > 0 ? cantidad : 1,
        unidad,
        precioUnitario: precio === null ? redondear(importe) : redondear(precio),
        importe: redondear(importe),
        propuesta: {
          variante: texto(linea?.variante, 120),
          producto: texto(linea?.producto, 120),
          marca: texto(linea?.marca, 80),
          categoriaId: categoria?.id ?? null,
          categoria: categoria?.nombre ?? null,
          confianza: CONFIANZAS.has(linea?.confianza) ? linea.confianza : 'baja',
        },
      }
    })
    .filter(Boolean)
}

/** La fecha del ticket, en ISO, o null si no se lee. No se inventa. */
function fechaDe(valor) {
  const crudo = texto(valor, 40)
  if (!crudo) return null
  const soloFecha = crudo.slice(0, 10)
  return esFechaIso(soloFecha) ? crudo.slice(0, 16) : null
}

/**
 * Lee un ticket. Devuelve la cabecera y las lineas con su propuesta, sin tocar
 * la base de datos.
 */
export async function leerTicket({ imagen, texto: textoPlano, pista = '' }) {
  const partes = [catalogoParaElPrompt()]
  if (pista) partes.push(`PISTA DE QUIEN LO SUBE: ${pista}`)
  if (textoPlano) partes.push(`TEXTO DEL TICKET:\n${textoPlano}`)

  const { texto: respuesta, truncado } = await preguntar({
    sistema: SISTEMA,
    texto: partes.join('\n\n'),
    imagen,
  })

  /*
   * Una respuesta cortada es peor que ninguna: llegarian treinta lineas de las
   * cuarenta y cinco, sumarian menos que el total, y el cuadre diria que falta
   * dinero sin que nadie pudiera saber por que.
   */
  if (truncado) {
    throw new ErrorIa(
      'La respuesta de la IA se ha cortado: el ticket tiene demasiadas líneas. Prueba a fotografiarlo en dos trozos.',
      502,
    )
  }

  const datos = extraerJson(respuesta)
  if (!datos || typeof datos !== 'object') {
    throw new ErrorIa('La IA no ha devuelto un ticket que se pueda leer.', 502)
  }

  const categorias = productosBd.listarCategorias({ soloActivas: true })
  const lineas = limpiarLineas(datos.lineas, categorias)
  const total = numero(datos.total)
  const sumaLineas = redondear(lineas.reduce((t, l) => t + l.importe, 0))

  return {
    tienda: texto(datos.tienda, 120),
    direccion: texto(datos.direccion, 200),
    fechaHora: fechaDe(datos.fechaHora),
    // Sin total legible, manda la suma de las lineas: es lo unico comprobable.
    total: total === null ? sumaLineas : redondear(total),
    formaPago: texto(datos.formaPago, 40),
    ultimos4: (texto(datos.ultimos4, 8) ?? '').replace(/\D/g, '').slice(-4) || null,
    lineas,
    avisos: Array.isArray(datos.notas) ? datos.notas.map((n) => texto(n, 200)).filter(Boolean) : [],
  }
}
