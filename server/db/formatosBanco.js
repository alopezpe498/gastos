import { bd } from './index.js'

/**
 * Como viene el fichero de cada banco.
 *
 * Se guarda para no tener que señalar las columnas a mano cada mes. El formato
 * de Banc Sabadell viene de fabrica porque es el que se uso para escribir el
 * parser; cualquier otro se aprende la primera vez y queda guardado.
 */

const ahora = () => new Date().toISOString()

function aFormato(f) {
  return {
    id: f.id,
    nombre: f.nombre,
    columnaFecha: f.columna_fecha,
    columnaConcepto: f.columna_concepto,
    columnaImporte: f.columna_importe,
    formatoFecha: f.formato_fecha,
    separadorDecimal: f.separador_decimal,
    filaCabeceraTexto: f.fila_cabecera_texto,
    textoNomina: f.texto_nomina ?? 'NOMINA',
    prefijosALimpiar: leerLista(f.prefijos_a_limpiar),
    porDefecto: !!f.por_defecto,
  }
}

function leerLista(crudo) {
  try {
    const lista = JSON.parse(crudo ?? '[]')
    return Array.isArray(lista) ? lista.map(String) : []
  } catch {
    return []
  }
}

export function listar() {
  return bd
    .prepare('SELECT * FROM formatos_banco ORDER BY por_defecto DESC, id ASC')
    .all()
    .map(aFormato)
}

export function obtener(id) {
  const f = bd.prepare('SELECT * FROM formatos_banco WHERE id = ?').get(id)
  return f ? aFormato(f) : null
}

export function porDefecto() {
  const f = bd
    .prepare('SELECT * FROM formatos_banco ORDER BY por_defecto DESC, id ASC LIMIT 1')
    .get()
  return f ? aFormato(f) : null
}

export function crear(datos) {
  const info = bd
    .prepare(
      `INSERT INTO formatos_banco
         (nombre, columna_fecha, columna_concepto, columna_importe, formato_fecha,
          separador_decimal, fila_cabecera_texto, texto_nomina, prefijos_a_limpiar,
          por_defecto, fecha_creacion)
       VALUES (@nombre, @columnaFecha, @columnaConcepto, @columnaImporte, @formatoFecha,
               @separadorDecimal, @filaCabeceraTexto, @textoNomina, @prefijos,
               @porDefecto, @fecha)`,
    )
    .run({
      nombre: datos.nombre,
      columnaFecha: datos.columnaFecha ?? null,
      columnaConcepto: datos.columnaConcepto ?? null,
      columnaImporte: datos.columnaImporte ?? null,
      formatoFecha: datos.formatoFecha ?? 'dd/mm/aaaa',
      separadorDecimal: datos.separadorDecimal ?? ',',
      filaCabeceraTexto: datos.filaCabeceraTexto ?? 'Importe',
      textoNomina: datos.textoNomina ?? 'NOMINA',
      prefijos: JSON.stringify(datos.prefijosALimpiar ?? []),
      porDefecto: datos.porDefecto ? 1 : 0,
      fecha: ahora(),
    })
  return obtener(info.lastInsertRowid)
}

const CAMPOS = {
  nombre: 'nombre',
  columnaFecha: 'columna_fecha',
  columnaConcepto: 'columna_concepto',
  columnaImporte: 'columna_importe',
  formatoFecha: 'formato_fecha',
  separadorDecimal: 'separador_decimal',
  filaCabeceraTexto: 'fila_cabecera_texto',
  textoNomina: 'texto_nomina',
}

export function actualizar(id, cambios) {
  const trozos = []
  const valores = { id }
  for (const [nombre, columna] of Object.entries(CAMPOS)) {
    if (cambios[nombre] === undefined) continue
    trozos.push(`${columna} = @${nombre}`)
    valores[nombre] = cambios[nombre]
  }
  if (cambios.prefijosALimpiar !== undefined) {
    trozos.push('prefijos_a_limpiar = @prefijos')
    valores.prefijos = JSON.stringify(cambios.prefijosALimpiar ?? [])
  }
  if (trozos.length === 0) return obtener(id)
  bd.prepare(`UPDATE formatos_banco SET ${trozos.join(', ')} WHERE id = @id`).run(valores)
  return obtener(id)
}

/**
 * El formato de Banc Sabadell, que es sobre el que se escribio el parser.
 *
 * Los prefijos son los trozos de ruido que el banco pega delante de la
 * descripcion. Se quitan SOLO para que la linea se lea en pantalla: las reglas
 * se comparan contra la descripcion original, porque si no un "REINTEGRO
 * CAJERO AUTOMATICO 5402XXXX4010" se queda en nada.
 */
export const SABADELL = {
  nombre: 'Banc Sabadell',
  columnaFecha: 'F. Operativa',
  columnaConcepto: 'Concepto',
  columnaImporte: 'Importe',
  formatoFecha: 'dd/mm/aaaa',
  separadorDecimal: ',',
  filaCabeceraTexto: 'Importe',
  // Lo que delata la nomina, que es la que abre el mes y va al ingreso.
  textoNomina: 'NOMINA',
  prefijosALimpiar: [
    // El numero de la tarjeta, en cualquier sitio de la linea.
    '\\b\\d{4}X{4,}\\d{4}\\b',
    '^COMPRA TARJ\\.\\s*',
    '^DEVOLUCION\\s*',
    '^ADEUDO RECIBO\\s*',
    '^TRASPASO\\s*[\\d-]+\\s*',
    // Fechas sueltas al principio: "20.08 TUNELSPAN", "13AUG BVK11V8J".
    '^\\d{2}\\.\\d{2}\\s+',
    '^\\d{2}[A-Z]{3}\\s+',
  ],
  porDefecto: true,
}

export function sembrarFormatos() {
  const hay = bd.prepare('SELECT COUNT(*) AS n FROM formatos_banco').get().n
  if (hay > 0) return false
  crear(SABADELL)
  return true
}
