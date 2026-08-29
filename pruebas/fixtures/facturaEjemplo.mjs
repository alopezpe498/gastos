// Genera un PDF mínimo con capa de texto, sin dependencias.
//
// Sirve para probar la extracción de texto de verdad, que es lo que hace la
// aplicación con las facturas que llegan por correo. Un PDF real de una
// gestoría es igual por dentro: texto colocado con coordenadas.

const LINEAS = [
  'COLEGIO SANTA MARIA - SERVICIO DE COMEDOR',
  'CIF B-12345678   C/ Escuelas 8, Barcelona',
  '',
  'FACTURA N. 2026/0612',
  'Fecha de emision: 05/06/2026',
  'Periodo facturado: mayo de 2026',
  'Alumna: Nuria L.',
  '',
  'Concepto                        Unidades   Importe',
  'Comedor escolar mayo                  20    142,00',
  'Servicio de acogida manana             8     24,00',
  'Descuento hermanos                          -12,00',
  '',
  'Base imponible                              154,00',
  'IVA (0%)                                      0,00',
  'TOTAL A PAGAR                               154,00',
  '',
  'Cargo en cuenta ES12 **** 4321 el dia 10/06/2026',
]

const escapar = (texto) => texto.replace(/[()\\]/g, (c) => '\\' + c)

const contenido =
  'BT /F1 11 Tf 40 780 Td 14 TL\n' +
  LINEAS.map((l) => `(${escapar(l)}) Tj T*`).join('\n') +
  '\nET'

const objetos = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
  `<< /Length ${Buffer.byteLength(contenido)} >>\nstream\n${contenido}\nendstream`,
]

let pdf = '%PDF-1.4\n'
const posiciones = []
for (const [i, cuerpo] of objetos.entries()) {
  posiciones.push(Buffer.byteLength(pdf, 'latin1'))
  pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`
}
const inicioTabla = Buffer.byteLength(pdf, 'latin1')
pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
for (const p of posiciones) pdf += `${String(p).padStart(10, '0')} 00000 n \n`
pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioTabla}\n%%EOF`

export function facturaDeEjemplo() {
  return Buffer.from(pdf, 'latin1')
}

/** Lo que la aplicación debería acabar guardando de esa factura. */
export const TOTAL_FACTURA = 154
