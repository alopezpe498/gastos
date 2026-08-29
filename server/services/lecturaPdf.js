import { ErrorIa } from './ia.js'

/**
 * Lectura de PDF.
 *
 * Las facturas que llegan por correo (la de la comida del colegio, la de la
 * luz, la del gimnasio) son PDF DIGITALES: llevan una capa de texto de verdad.
 * Sacar ese texto y mandarlo a la IA como texto es mejor que convertir la
 * pagina en imagen y pedirle que la lea:
 *
 *   - los importes salen exactos, sin errores de lectura,
 *   - gasta muchisimos menos tokens que una imagen,
 *   - y funciona igual con cualquier proveedor, tenga vision o no.
 *
 * Un PDF escaneado (una foto metida dentro de un PDF) no tiene capa de texto.
 * Ese caso se detecta y se dice que hay que mandar una foto, que es lo que la
 * rama de imagen ya sabe hacer.
 */

/** pdf.js se carga solo cuando de verdad llega un PDF: pesa lo suyo. */
let cargaPdfjs = null
async function pdfjs() {
  if (!cargaPdfjs) {
    cargaPdfjs = import('pdfjs-dist/legacy/build/pdf.mjs').catch((causa) => {
      cargaPdfjs = null
      throw new ErrorIa('No se ha podido cargar el lector de PDF en el servidor.', 500, { causa })
    })
  }
  return cargaPdfjs
}

/** Paginas que se leen como mucho: una factura no tiene cuarenta. */
const MAX_PAGINAS = 10
const MIN_CARACTERES = 40

/**
 * Extrae el texto de un PDF, pagina a pagina.
 *
 * @param {Buffer} buffer
 * @returns {Promise<{texto: string, paginas: number, leidas: number}>}
 */
export async function textoDePdf(buffer) {
  const { getDocument } = await pdfjs()

  let tarea
  let documento
  try {
    tarea = getDocument({
      data: new Uint8Array(buffer),
      // Una factura no necesita fuentes ni mapas de caracteres externos, y sin
      // esto pdf.js intenta ir a buscarlos al disco y avisa por consola.
      useSystemFonts: false,
      isEvalSupported: false,
      // El servidor no pinta nada: solo se quiere el texto.
      disableFontFace: true,
    })
    documento = await tarea.promise
  } catch (causa) {
    throw new ErrorIa(
      'No se ha podido abrir el PDF. Puede estar protegido con contraseña o dañado.',
      400,
      { causa },
    )
  }

  const paginas = documento.numPages
  const leidas = Math.min(paginas, MAX_PAGINAS)
  const trozos = []

  for (let numero = 1; numero <= leidas; numero += 1) {
    const pagina = await documento.getPage(numero)
    const contenido = await pagina.getTextContent()

    /*
     * pdf.js devuelve fragmentos sueltos con su posicion. Se agrupan por linea
     * usando la coordenada vertical: sin esto, una tabla de factura llega como
     * una ristra de palabras y el modelo no sabe que importe va con que
     * concepto.
     */
    const lineas = new Map()
    for (const elemento of contenido.items) {
      if (typeof elemento.str !== 'string' || !elemento.str.trim()) continue
      // transform[5] es la Y del fragmento. Se redondea para que los que estan
      // a la misma altura caigan en el mismo grupo.
      const y = Math.round((elemento.transform?.[5] ?? 0) / 3)
      const x = elemento.transform?.[4] ?? 0
      const linea = lineas.get(y) ?? []
      linea.push({ x, texto: elemento.str })
      lineas.set(y, linea)
    }

    const texto = [...lineas.entries()]
      // De arriba abajo: en PDF la Y crece hacia arriba.
      .sort((a, b) => b[0] - a[0])
      .map(([, partes]) =>
        partes
          .sort((a, b) => a.x - b.x)
          .map((p) => p.texto)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean)
      .join('\n')

    if (texto) trozos.push(leidas > 1 ? `--- página ${numero} ---\n${texto}` : texto)

    // Liberar la pagina: un PDF grande se come la memoria si no.
    pagina.cleanup()
  }

  // Hay que soltar las dos cosas: el documento libera sus páginas y la tarea
  // de carga cierra el worker. Sin lo segundo, cada PDF deja un worker vivo.
  await documento.cleanup()
  await tarea.destroy()

  const texto = trozos.join('\n\n')

  if (texto.replace(/\s/g, '').length < MIN_CARACTERES) {
    throw new ErrorIa(
      'Este PDF no lleva texto: parece un escaneo o una foto metida en un PDF. ' +
        'Hazle una foto a la factura y súbela como imagen, que sí se puede leer.',
      400,
    )
  }

  return { texto, paginas, leidas }
}

/** Los primeros bytes de un PDF son siempre "%PDF". */
export function pareceUnPdf(buffer) {
  return buffer.length > 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF'
}
