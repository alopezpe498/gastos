/**
 * Lector de .xls antiguos (BIFF8), que es lo que exporta el banco.
 *
 * Por que hay codigo propio aqui en vez de una libreria:
 *
 *   - exceljs, que ya usamos para el Excel de cuentas, NO lee .xls. Y lo peor
 *     es como no lo lee: acepta el fichero, no lanza ningun error y devuelve
 *     cero hojas. Un fallo silencioso.
 *   - La libreria estandar para .xls (SheetJS) esta retirada de npm y la ultima
 *     version publicada alli arrastra vulnerabilidades conocidas.
 *
 * Un .xls es un OLE Compound File (un sistema de ficheros en miniatura dentro
 * del archivo) con un stream llamado "Workbook" dentro, y ese stream es una
 * lista de registros BIFF. Aqui se leen las dos capas, y solo los registros que
 * hacen falta para sacar valores: no se interpretan formulas, ni estilos, ni
 * graficos.
 *
 * Si el fichero no es un BIFF8 se avisa claramente y se pide un .xlsx o un .csv,
 * que es mucho mejor que devolver una hoja vacia.
 */

// ---------------------------------------------------------------------------
// Capa 1: OLE Compound File
// ---------------------------------------------------------------------------

const FIRMA_OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
const LIBRE = 0xffffffff
const FIN_CADENA = 0xfffffffe

export function esXlsAntiguo(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 8 && buffer.subarray(0, 8).equals(FIRMA_OLE)
}

function sacarStreamDelLibro(buffer) {
  const tamSector = 1 << buffer.readUInt16LE(0x1e)
  const tamMini = 1 << buffer.readUInt16LE(0x20)
  const donde = (sector) => (sector + 1) * tamSector

  // La FAT dice, para cada sector, cual es el siguiente. Sus primeros 109
  // sectores estan listados en la cabecera; si hay mas, siguen en la DIFAT.
  const sectoresFat = []
  for (let i = 0; i < 109; i += 1) {
    const s = buffer.readUInt32LE(0x4c + i * 4)
    if (s === LIBRE) break
    sectoresFat.push(s)
  }
  let difat = buffer.readUInt32LE(0x44)
  const cuantasDifat = buffer.readUInt32LE(0x48)
  for (let i = 0; i < cuantasDifat && difat !== LIBRE; i += 1) {
    const base = donde(difat)
    const porSector = tamSector / 4 - 1
    for (let j = 0; j < porSector; j += 1) {
      const s = buffer.readUInt32LE(base + j * 4)
      if (s !== LIBRE) sectoresFat.push(s)
    }
    difat = buffer.readUInt32LE(base + porSector * 4)
  }

  const fat = []
  for (const s of sectoresFat) {
    const base = donde(s)
    if (base + tamSector > buffer.length) break
    for (let j = 0; j < tamSector / 4; j += 1) fat.push(buffer.readUInt32LE(base + j * 4))
  }

  /** Sigue la cadena de sectores de un stream y los pega. */
  const seguir = (inicio, tam) => {
    const trozos = []
    let s = inicio
    let leido = 0
    // El tope de vueltas evita quedarse dando vueltas si la FAT viene corrupta.
    for (let vueltas = 0; s !== FIN_CADENA && s !== LIBRE && leido < tam; vueltas += 1) {
      if (vueltas > fat.length + 1) break
      const base = donde(s)
      if (base >= buffer.length) break
      trozos.push(buffer.subarray(base, base + tamSector))
      leido += tamSector
      s = fat[s]
      if (s === undefined) break
    }
    return Buffer.concat(trozos).subarray(0, tam)
  }

  // El directorio: una entrada de 128 bytes por stream.
  const directorio = seguir(buffer.readUInt32LE(0x30), 1 << 22)
  const entradas = []
  for (let o = 0; o + 128 <= directorio.length; o += 128) {
    const largoNombre = directorio.readUInt16LE(o + 64)
    if (largoNombre === 0 || largoNombre > 64) continue
    entradas.push({
      nombre: directorio.subarray(o, o + largoNombre - 2).toString('utf16le'),
      tipo: directorio.readUInt8(o + 66),
      inicio: directorio.readUInt32LE(o + 116),
      tam: directorio.readUInt32LE(o + 120),
    })
  }

  const libro = entradas.find((e) => /^(Workbook|Book)$/i.test(e.nombre))
  if (!libro) return null

  // Los streams de menos de 4 KB no viven en sectores propios, sino dentro del
  // stream de la raiz, troceados mucho mas fino (la mini-FAT).
  if (libro.tam >= 4096) return seguir(libro.inicio, libro.tam)

  const raiz = entradas.find((e) => e.tipo === 5)
  if (!raiz) return null
  const miniFatCrudo = seguir(buffer.readUInt32LE(0x3c), 1 << 22)
  const miniFat = []
  for (let j = 0; j + 4 <= miniFatCrudo.length; j += 4) miniFat.push(miniFatCrudo.readUInt32LE(j))
  const contenedor = seguir(raiz.inicio, raiz.tam)
  const trozos = []
  let s = libro.inicio
  while (s !== FIN_CADENA && s !== LIBRE && trozos.length * tamMini < libro.tam) {
    trozos.push(contenedor.subarray(s * tamMini, (s + 1) * tamMini))
    s = miniFat[s]
    if (s === undefined) break
  }
  return Buffer.concat(trozos).subarray(0, libro.tam)
}

// ---------------------------------------------------------------------------
// Capa 2: registros BIFF
// ---------------------------------------------------------------------------

const BOF = 0x0009
const EOF_REG = 0x000a
const BOUNDSHEET = 0x0085
const SST = 0x00fc
const CONTINUE = 0x003c
const LABELSST = 0x00fd
const LABEL = 0x0204
const NUMBER = 0x0203
const RK = 0x027e
const MULRK = 0x00bd
const FORMULA = 0x0006
const STRING = 0x0207

function trocearRegistros(flujo) {
  const registros = []
  let o = 0
  while (o + 4 <= flujo.length) {
    const id = flujo.readUInt16LE(o)
    const largo = flujo.readUInt16LE(o + 2)
    if (o + 4 + largo > flujo.length) break
    registros.push({ id, datos: flujo.subarray(o + 4, o + 4 + largo), inicio: o })
    o += 4 + largo
  }
  return registros
}

/**
 * La tabla de cadenas compartidas. Es la parte espinosa del formato: una cadena
 * puede partirse entre un registro y su CONTINUE, y al cruzar la frontera el
 * primer byte del CONTINUE vuelve a decir si el trozo que sigue va en un byte
 * por caracter o en dos.
 */
function leerSst(registros, indice) {
  const trozos = [registros[indice].datos]
  for (let j = indice + 1; j < registros.length && registros[j].id === CONTINUE; j += 1) {
    trozos.push(registros[j].datos)
  }

  const cadenas = []
  let trozo = 0
  let datos = trozos[0]
  let p = 0

  const pasarAlSiguiente = () => {
    trozo += 1
    datos = trozos[trozo]
    p = 0
    return datos !== undefined
  }
  const asegurar = (n) => {
    while (datos && p + n > datos.length) if (!pasarAlSiguiente()) return false
    return !!datos
  }

  if (!asegurar(8)) return cadenas
  p += 4 // total de cadenas contando repeticiones: no hace falta
  const cuantas = datos.readUInt32LE(p)
  p += 4

  for (let k = 0; k < cuantas; k += 1) {
    if (!asegurar(3)) break
    const largo = datos.readUInt16LE(p)
    p += 2
    let banderas = datos.readUInt8(p)
    p += 1
    let ancho = banderas & 0x01 ? 2 : 1

    // Formato enriquecido y datos asiaticos: se cuentan para saltarlos luego.
    let sobrante = 0
    if (banderas & 0x08) {
      if (!asegurar(2)) break
      sobrante += datos.readUInt16LE(p) * 4
      p += 2
    }
    if (banderas & 0x04) {
      if (!asegurar(4)) break
      sobrante += datos.readUInt32LE(p)
      p += 4
    }

    let texto = ''
    let leidos = 0
    while (leidos < largo) {
      if (p >= datos.length) {
        if (!pasarAlSiguiente()) break
        banderas = datos.readUInt8(p)
        p += 1
        ancho = banderas & 0x01 ? 2 : 1
        continue
      }
      const caben = Math.min(largo - leidos, Math.floor((datos.length - p) / ancho))
      if (caben <= 0) {
        if (!pasarAlSiguiente()) break
        banderas = datos.readUInt8(p)
        p += 1
        ancho = banderas & 0x01 ? 2 : 1
        continue
      }
      texto +=
        ancho === 2
          ? datos.subarray(p, p + caben * 2).toString('utf16le')
          : datos.subarray(p, p + caben).toString('latin1')
      p += caben * ancho
      leidos += caben
    }

    while (sobrante > 0) {
      if (p >= datos.length && !pasarAlSiguiente()) break
      const salta = Math.min(sobrante, datos.length - p)
      p += salta
      sobrante -= salta
    }
    cadenas.push(texto)
  }
  return cadenas
}

/** Un RK guarda un numero apretado en 32 bits, con dos trucos de bits. */
function valorRk(crudo) {
  let v
  if (crudo & 0x02) {
    v = crudo >> 2 // entero
  } else {
    const b = Buffer.alloc(8)
    b.writeInt32LE((crudo & 0xfffffffc) >>> 0, 4) // los 30 bits altos de un double
    v = b.readDoubleLE(0)
  }
  return crudo & 0x01 ? v / 100 : v
}

/**
 * Lee un .xls y devuelve sus hojas como matrices de celdas.
 *
 * Cada celda es un numero, una cadena o null. No se convierten fechas: en las
 * exportaciones del banco vienen ya como texto "dd/mm/aaaa", y adivinar cuando
 * un numero es una fecha requiere interpretar los formatos, que es justo la
 * complejidad que este modulo evita.
 */
export function leerXls(buffer) {
  if (!esXlsAntiguo(buffer)) {
    throw new Error('Ese archivo no es un Excel antiguo (.xls). Prueba a exportarlo como .xlsx o .csv.')
  }
  const flujo = sacarStreamDelLibro(buffer)
  if (!flujo || flujo.length === 0) {
    throw new Error('El .xls esta vacio o dañado. Prueba a exportarlo otra vez, como .xlsx o .csv.')
  }

  const registros = trocearRegistros(flujo)

  let cadenas = []
  const hojas = []
  for (let i = 0; i < registros.length; i += 1) {
    const { id, datos } = registros[i]
    if (id === SST) {
      cadenas = leerSst(registros, i)
    } else if (id === BOUNDSHEET && datos.length >= 8) {
      const largo = datos.readUInt8(6)
      const utf16 = (datos.readUInt8(7) & 0x01) === 1
      hojas.push({
        nombre: utf16
          ? datos.subarray(8, 8 + largo * 2).toString('utf16le')
          : datos.subarray(8, 8 + largo).toString('latin1'),
        // Desplazamiento del BOF de esta hoja dentro del stream.
        inicio: datos.readUInt32LE(0),
        filas: [],
      })
    }
  }
  if (hojas.length === 0) {
    throw new Error('El .xls no declara ninguna hoja. Prueba a exportarlo como .xlsx o .csv.')
  }

  // A que hoja pertenece cada registro: los BOF de hoja marcan las fronteras.
  const fronteras = hojas
    .map((h, indice) => ({ indice, inicio: h.inicio }))
    .sort((a, b) => a.inicio - b.inicio)

  const deQuienEs = (posicion) => {
    let cual = -1
    for (const f of fronteras) {
      if (posicion >= f.inicio) cual = f.indice
      else break
    }
    return cual
  }

  const poner = (hoja, fila, columna, valor) => {
    if (hoja < 0 || !hojas[hoja]) return
    const filas = hojas[hoja].filas
    while (filas.length <= fila) filas.push([])
    const celdas = filas[fila]
    while (celdas.length <= columna) celdas.push(null)
    celdas[columna] = valor
  }

  for (const { id, datos, inicio } of registros) {
    if (id === BOF || id === EOF_REG) continue
    const hoja = deQuienEs(inicio)

    if (id === LABELSST && datos.length >= 10) {
      poner(hoja, datos.readUInt16LE(0), datos.readUInt16LE(2), cadenas[datos.readUInt32LE(6)] ?? '')
    } else if (id === LABEL && datos.length >= 8) {
      const largo = datos.readUInt16LE(6)
      const utf16 = datos.length > 8 && (datos.readUInt8(8) & 0x01) === 1
      poner(
        hoja,
        datos.readUInt16LE(0),
        datos.readUInt16LE(2),
        utf16
          ? datos.subarray(9, 9 + largo * 2).toString('utf16le')
          : datos.subarray(9, 9 + largo).toString('latin1'),
      )
    } else if (id === NUMBER && datos.length >= 14) {
      poner(hoja, datos.readUInt16LE(0), datos.readUInt16LE(2), datos.readDoubleLE(6))
    } else if (id === RK && datos.length >= 10) {
      poner(hoja, datos.readUInt16LE(0), datos.readUInt16LE(2), valorRk(datos.readInt32LE(6)))
    } else if (id === MULRK && datos.length >= 6) {
      const fila = datos.readUInt16LE(0)
      const primera = datos.readUInt16LE(2)
      for (let i = 0; 4 + i * 6 + 6 <= datos.length - 2; i += 1) {
        poner(hoja, fila, primera + i, valorRk(datos.readInt32LE(4 + i * 6 + 2)))
      }
    } else if (id === FORMULA && datos.length >= 14) {
      // El resultado de una formula es un double, salvo que los dos ultimos
      // bytes sean 0xFFFF: entonces es texto (y llega en el STRING siguiente),
      // un booleano o un error. Aqui solo interesan los numeros.
      if (datos.readUInt16LE(12) !== 0xffff) {
        poner(hoja, datos.readUInt16LE(0), datos.readUInt16LE(2), datos.readDoubleLE(6))
      }
    } else if (id === STRING) {
      // Resultado de texto de la formula anterior. El extracto no trae, asi que
      // no se enlaza con su celda: se ignora a proposito.
    }
  }

  return { hojas: hojas.map(({ nombre, filas }) => ({ nombre, filas })) }
}
