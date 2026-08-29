// Pruebas de todo lo que usa IA, contra un proveedor simulado.
//
// No se prueba que el modelo acierte —eso no se puede probar— sino que la
// aplicacion se defiende de lo que devuelva: conceptos inventados, filas de
// totales, importes ilegibles, respuestas cortadas y errores del proveedor.
import { levantar, crearLlamar, crearComprobador, igualEnCentimos } from './entorno.mjs'
import { levantarIaFalsa } from './mock-ia.mjs'
import { libroDeEjemplo } from './fixtures/hojaEjemplo.mjs'
import { facturaDeEjemplo, TOTAL_FACTURA } from './fixtures/facturaEjemplo.mjs'

const { comprobar, estado } = crearComprobador()

/** Levanta la app apuntando a una IA simulada que contesta lo que se le diga. */
async function conIa(opciones, prueba) {
  const ia = await levantarIaFalsa(opciones)
  const entorno = await levantar('ia', { OPENAI_BASE_URL: ia.base })
  const llamar = crearLlamar(entorno)
  await llamar('/config/ia', {
    metodo: 'PUT',
    cuerpo: { proveedor: 'openai', modelo: 'gpt-4o-mini', clave: 'clave-de-prueba' },
  })
  try {
    await prueba({ llamar, ia, entorno })
  } finally {
    await entorno.cerrar()
    await ia.cerrar()
  }
}

// ---------------------------------------------------------------------------
console.log('\nConfiguración')
// ---------------------------------------------------------------------------
await conIa({ responder: () => 'OK' }, async ({ llamar }) => {
  const { datos } = await llamar('/config/ia')
  comprobar(datos.configurada === true, 'la clave queda guardada')
  comprobar(
    !datos.claveEnmascarada.includes('de-prueba') && datos.claveEnmascarada.includes('*'),
    'la clave sale enmascarada, nunca entera',
    datos.claveEnmascarada,
  )
  comprobar(datos.proveedor === 'openai' && datos.modelo === 'gpt-4o-mini', 'proveedor y modelo')

  // Reenviar la enmascarada no debe destruir la buena.
  await llamar('/config/ia', { metodo: 'PUT', cuerpo: { clave: datos.claveEnmascarada } })
  const { datos: despues } = await llamar('/config/ia')
  comprobar(despues.configurada === true, 'reenviar la clave enmascarada no la borra')

  const prueba = await llamar('/config/ia/probar', { metodo: 'POST' })
  comprobar(prueba.datos.ok === true, 'la prueba de conexión responde que sí')

  const borrada = await llamar('/config/ia/clave', { metodo: 'DELETE' })
  comprobar(borrada.datos.configurada === false, 'se puede borrar la clave')
})

// ---------------------------------------------------------------------------
console.log('\nSin IA configurada, todo lo demás sigue funcionando')
// ---------------------------------------------------------------------------
{
  const entorno = await levantar('ia-sin')
  const llamar = crearLlamar(entorno)
  try {
    const { datos } = await llamar('/config/ia')
    comprobar(datos.configurada === false, 'sin clave, la IA consta como no configurada')

    const sugerir = await llamar('/importar/excel/sugerir', {
      metodo: 'POST',
      cuerpo: { nuevos: ['Amazn'] },
    })
    comprobar(sugerir.estado === 400, 'pedir sugerencias sin IA responde 400')

    const captura = await llamar('/importar/captura', {
      metodo: 'POST',
      cuerpo: { mesId: 1, texto: 'Bar 20' },
    })
    comprobar(captura.estado === 400, 'la captura sin IA responde 400')

    const archivo = (await libroDeEjemplo()).toString('base64')
    const previa = await llamar('/importar/excel/vista-previa', {
      metodo: 'POST',
      cuerpo: { archivo, hoja: 'Cuentas2023' },
    })
    comprobar(previa.estado === 200, 'la importación normal sigue funcionando sin IA')
    comprobar(previa.datos.hayIa === false, 'y la pantalla sabe que no hay IA')
  } finally {
    await entorno.cerrar()
  }
}

// ---------------------------------------------------------------------------
console.log('\nSugerencias de concepto')
// ---------------------------------------------------------------------------
await conIa(
  {
    responder: () =>
      // Envuelto en markdown a proposito: los modelos lo hacen constantemente.
      '```json\n' +
      JSON.stringify([
        { nombre: 'Amazn', concepto: 'Amazon', confianza: 0.9, motivo: 'errata' },
        { nombre: 'Gimasio', concepto: 'Gimnasio', confianza: 0.85, motivo: 'errata' },
        // Un concepto que NO existe en el catalogo: hay que tirarlo.
        { nombre: 'Cosa rara', concepto: 'Criptomonedas', confianza: 0.99, motivo: 'inventado' },
        // Un nombre que no se pregunto: hay que tirarlo.
        { nombre: 'No preguntado', concepto: 'Bar', confianza: 0.99, motivo: 'colado' },
        // Confianza baja: no se ensena.
        { nombre: 'Dudoso', concepto: 'Bar', confianza: 0.2, motivo: 'ni idea' },
      ]) +
      '\n```',
  },
  async ({ llamar, ia }) => {
    const { datos } = await llamar('/importar/excel/sugerir', {
      metodo: 'POST',
      cuerpo: { nuevos: ['Amazn', 'Gimasio', 'Cosa rara', 'Dudoso'] },
    })

    const porNombre = Object.fromEntries(datos.sugerencias.map((s) => [s.nombreExcel, s]))
    comprobar(datos.sugerencias.length === 2, 'solo pasan las dos sugerencias válidas', JSON.stringify(datos.sugerencias.map((s) => s.nombreExcel)))
    comprobar(porNombre.Amazn?.conceptoNombre === 'Amazon', 'Amazn → Amazon')
    comprobar(porNombre.Gimasio?.conceptoNombre === 'Gimnasio', 'Gimasio → Gimnasio')
    comprobar(!porNombre['Cosa rara'], 'un concepto inventado por la IA se descarta')
    comprobar(!porNombre['No preguntado'], 'un nombre que no se preguntó se descarta')
    comprobar(!porNombre.Dudoso, 'una sugerencia con poca confianza no se enseña')

    comprobar(
      ia.ultimoTextoDeUsuario().includes('CATALOGO'),
      'al modelo se le manda el catálogo real',
    )
  },
)

// ---------------------------------------------------------------------------
console.log('\nLeer una hoja con IA (plan B)')
// ---------------------------------------------------------------------------
await conIa(
  {
    responder: () => ({
      anio: 2023,
      movimientos: [
        { mes: 1, concepto: 'Hipoteca', importe: 622.53, tipo: 'fijo' },
        { mes: 1, concepto: 'Amazon', importe: 63.99, tipo: 'variable' },
        { mes: 1, concepto: 'Préstamo', importe: -100, tipo: 'variable' },
        // Basura que hay que filtrar.
        { mes: 1, concepto: 'Gastos Extras', importe: 999, tipo: 'variable' },
        { mes: 1, concepto: 'Total Gastos 70%', importe: 888, tipo: 'variable' },
        { mes: 13, concepto: 'Bar', importe: 10, tipo: 'variable' },
        { mes: 1, concepto: 'Bar', importe: 'no es un número', tipo: 'variable' },
        // Un concepto real que empieza por "Gastos": NO se filtra.
        { mes: 1, concepto: 'Gastos Niñas', importe: 250, tipo: 'fijo' },
      ],
      ingresos: [{ mes: 1, importe: 3000 }],
      notas: ['la columna de marzo estaba borrosa'],
    }),
  },
  async ({ llamar }) => {
    const archivo = (await libroDeEjemplo()).toString('base64')
    const { estado: codigo, datos } = await llamar('/importar/excel/hoja-libre', {
      metodo: 'POST',
      cuerpo: { archivo, hoja: 'Notas' },
    })

    comprobar(codigo === 200, 'una hoja que el parser rechaza sí la lee la IA')
    comprobar(!!datos.sesionId, 'devuelve un identificador de sesión')
    comprobar(datos.leidaPorIa === true, 'y queda marcada como leída por IA')
    comprobar(datos.meses.length === 1, 'solo entra el mes con datos')

    const nombres = [...datos.fijos, ...datos.variables].map((c) => c.nombreExcel)
    comprobar(!nombres.includes('Gastos Extras'), 'se filtra la fila de totales "Gastos Extras"')
    comprobar(!nombres.includes('Total Gastos 70%'), 'se filtra "Total Gastos 70%"')
    comprobar(nombres.includes('Gastos Niñas'), '"Gastos Niñas" SÍ se conserva: es un concepto')
    comprobar(
      datos.avisos.some((a) => a.includes('2 líneas venían')),
      'avisa aparte de las 2 líneas ilegibles (mes 13 e importe no numérico)',
      JSON.stringify(datos.avisos),
    )
    comprobar(
      datos.avisos.some((a) => a.includes('2 filas de totales')),
      'y aparte de las 2 filas de totales, que es lo esperado',
    )
    comprobar(
      datos.avisos.some((a) => a.includes('borrosa')),
      'traslada la nota de la IA',
    )
    comprobar(
      datos.avisos.some((a) => a.includes('la ha leído la IA')),
      'y avisa de que esto no lo ha leído el parser',
    )

    const enero = datos.meses[0]
    comprobar(igualEnCentimos(enero.ingreso, 3000), 'el ingreso llega')
    comprobar(enero.descuadre === null, 'sin fila "Otros" no se inventa un descuadre')

    // Confirmar con la sesión: se importa lo que se enseñó.
    const hecho = await llamar('/importar/excel/confirmar', {
      metodo: 'POST',
      cuerpo: { sesionId: datos.sesionId },
    })
    comprobar(hecho.estado === 200 && hecho.datos.meses === 1, 'se importa desde la sesión')

    const repetido = await llamar('/importar/excel/confirmar', {
      metodo: 'POST',
      cuerpo: { sesionId: datos.sesionId },
    })
    comprobar(repetido.estado === 410, 'la sesión se gasta: no se puede importar dos veces')

    const { datos: mes } = await llamar('/meses/2023/1')
    comprobar(
      mes.variables.some((m) => igualEnCentimos(m.importe, -100)),
      'la devolución entra en negativo',
    )
    comprobar(
      !mes.fijos.some((f) => f.concepto === 'Gastos Extras'),
      'y la fila de totales no ha entrado como gasto',
    )
  },
)

// ---------------------------------------------------------------------------
console.log('\nCaptura: texto pegado')
// ---------------------------------------------------------------------------
await conIa(
  {
    responder: () => ({
      tipo: 'lista',
      movimientos: [
        { concepto: 'Amazon', importe: 63.99, fecha: null, tipo: 'variable', cobrado: true },
        { concepto: 'Farmacia', importe: 4.72, fecha: '2027-01-14', tipo: 'variable' },
        // Fecha de otro mes: hay que descartarla, no el apunte.
        { concepto: 'Bar', importe: 12, fecha: '2025-03-02', tipo: 'variable' },
        // Concepto que no existe: llega marcado como nuevo, no se inventa el id.
        { concepto: 'Trampolín Park', importe: 30, tipo: 'variable' },
        // Total: fuera.
        { concepto: 'TOTAL', importe: 110.71, tipo: 'variable' },
      ],
      notas: [],
    }),
  },
  async ({ llamar, ia }) => {
    const abierto = await llamar('/meses', { metodo: 'POST', cuerpo: { anio: 2027, mes: 1 } })
    const mesId = abierto.datos.id

    const { datos } = await llamar('/importar/captura', {
      metodo: 'POST',
      cuerpo: { mesId, texto: 'Amazon 63,99 y farmacia 4,72' },
    })

    comprobar(datos.tipo === 'lista', 'se detecta como lista')
    comprobar(datos.movimientos.length === 4, 'la fila TOTAL se descarta', String(datos.movimientos.length))

    const porConcepto = Object.fromEntries(datos.movimientos.map((m) => [m.concepto, m]))
    comprobar(porConcepto.Amazon?.conceptoId !== null, 'Amazon se empareja con el catálogo')
    comprobar(porConcepto.Farmacia?.fecha === '2027-01-14', 'una fecha del mes se conserva')
    comprobar(porConcepto.Bar?.fecha === null, 'una fecha de otro mes se descarta')
    comprobar(porConcepto['Trampolín Park']?.nuevo === true, 'un concepto desconocido va marcado')
    comprobar(porConcepto['Trampolín Park']?.conceptoId === null, 'y sin id inventado')
    comprobar(datos.ingreso === null, 'una lista no toca el ingreso del mes')

    comprobar(
      ia.ultimoTextoDeUsuario().includes('Enero de 2027'),
      'al modelo se le dice a qué mes se apunta',
    )

    // Guardar solo lo que tiene concepto.
    const guardables = datos.movimientos.filter((m) => m.conceptoId !== null)
    const guardado = await llamar('/importar/captura/aplicar', {
      metodo: 'POST',
      cuerpo: { mesId, origen: 'portapapeles', movimientos: guardables },
    })
    comprobar(guardado.estado === 201 && guardado.datos.creados === 3, 'se guardan los tres')

    const { datos: mes } = await llamar('/meses/2027/1')
    comprobar(
      mes.variables.filter((m) => m.origen === 'portapapeles').length === 3,
      'y quedan con origen "portapapeles"',
    )

    const sinNada = await llamar('/importar/captura/aplicar', {
      metodo: 'POST',
      cuerpo: { mesId, movimientos: [{ conceptoId: 999999, importe: 5 }] },
    })
    comprobar(sinNada.estado === 400, 'un concepto que no existe no crea nada')
  },
)

// ---------------------------------------------------------------------------
console.log('\nCaptura: ticket con foto')
// ---------------------------------------------------------------------------
await conIa(
  {
    responder: () => ({
      tipo: 'ticket',
      comercio: 'Mercadona',
      total: 39.92,
      movimientos: [
        { concepto: 'Comida', importe: 6.54, tipo: 'sobre' },
        { concepto: 'Comida', importe: 22.38, tipo: 'sobre' },
        { concepto: 'Limpieza', importe: 11.45, tipo: 'variable' },
      ],
    }),
  },
  async ({ llamar, ia }) => {
    const abierto = await llamar('/meses', { metodo: 'POST', cuerpo: { anio: 2027, mes: 2 } })
    const mesId = abierto.datos.id

    // Un PNG de 1x1: lo que importa es que viaje como imagen, no su contenido.
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

    const { datos } = await llamar('/importar/captura', {
      metodo: 'POST',
      cuerpo: { mesId, imagen: png, tipoImagen: 'image/png' },
    })

    comprobar(ia.ultimaLlevabaImagen(), 'la imagen llega al modelo como imagen')
    comprobar(datos.tipo === 'ticket', 'se detecta como ticket')
    comprobar(datos.movimientos.length === 1, 'se propone UN solo apunte')
    comprobar(datos.movimientos[0].concepto === 'Comida', 'y va al sobre de la comida')
    comprobar(igualEnCentimos(datos.movimientos[0].importe, 39.92), 'con el total del ticket')
    comprobar(datos.movimientos[0].descripcion === 'Mercadona', 'con el comercio de descripción')
    comprobar(datos.desglose.length === 3, 'el desglose queda disponible aparte')
    comprobar(
      datos.avisos.some((a) => a.includes('no cuadra')),
      'avisa de que las líneas no suman el total',
      JSON.stringify(datos.avisos),
    )

    const malTipo = await llamar('/importar/captura', {
      metodo: 'POST',
      cuerpo: { mesId, imagen: png, tipoImagen: 'image/gif' },
    })
    comprobar(malTipo.estado === 400, 'un formato de imagen no admitido se rechaza')
  },
)

// ---------------------------------------------------------------------------
console.log('\nCaptura: factura en PDF')
// ---------------------------------------------------------------------------
await conIa(
  {
    responder: () => ({
      tipo: 'factura',
      comercio: 'Colegio Santa Maria',
      total: TOTAL_FACTURA,
      movimientos: [
        { concepto: 'Gastos Niñas', importe: 142, tipo: 'fijo' },
        { concepto: 'Gastos Niñas', importe: 24, tipo: 'fijo' },
        { concepto: 'Gastos Niñas', importe: -12, tipo: 'fijo' },
      ],
    }),
  },
  async ({ llamar, ia }) => {
    const abierto = await llamar('/meses', { metodo: 'POST', cuerpo: { anio: 2027, mes: 3 } })
    const mesId = abierto.datos.id

    const { estado: codigo, datos } = await llamar('/importar/captura', {
      metodo: 'POST',
      cuerpo: { mesId, pdf: facturaDeEjemplo().toString('base64') },
    })

    comprobar(codigo === 200, 'un PDF con texto se lee')
    comprobar(!ia.ultimaLlevabaImagen(), 'y viaja como TEXTO, no como imagen')

    const mandado = ia.ultimoTextoDeUsuario()
    comprobar(mandado.includes('TOTAL A PAGAR'), 'el texto extraído llega al modelo')
    comprobar(
      mandado.includes('Comedor escolar mayo 20 142,00'),
      'y conserva las columnas de la tabla en una sola línea',
    )
    comprobar(mandado.includes('TEXTO EXTRAIDO DE UN PDF'), 'se le dice que viene de un PDF')

    comprobar(datos.tipo === 'factura', 'se detecta como factura')
    comprobar(datos.movimientos.length === 1, 'se propone UN solo apunte, no las líneas internas')
    comprobar(
      igualEnCentimos(datos.movimientos[0].importe, TOTAL_FACTURA),
      'con el total a pagar',
      String(datos.movimientos[0].importe),
    )
    comprobar(datos.desglose.length === 3, 'el desglose queda por si se quiere')

    const noEsPdf = await llamar('/importar/captura', {
      metodo: 'POST',
      cuerpo: { mesId, pdf: Buffer.from('esto no es un pdf').toString('base64') },
    })
    comprobar(noEsPdf.estado === 400, 'un archivo que no es PDF se rechaza')

    // Un PDF válido pero sin capa de texto: es lo que pasa con un escaneo.
    const vaciado = facturaDeEjemplo()
      .toString('latin1')
      .replace(/\(([^)]*)\) Tj/g, '() Tj')
    const escaneado = await llamar('/importar/captura', {
      metodo: 'POST',
      cuerpo: { mesId, pdf: Buffer.from(vaciado, 'latin1').toString('base64') },
    })
    comprobar(escaneado.estado === 400, 'un PDF sin capa de texto se rechaza')
    comprobar(
      String(escaneado.datos.error).includes('foto'),
      'y propone mandar una foto en su lugar',
      escaneado.datos.error,
    )
  },
)

// ---------------------------------------------------------------------------
console.log('\nCuando la IA falla')
// ---------------------------------------------------------------------------
await conIa({ responder: () => 'esto no es JSON ni de lejos' }, async ({ llamar }) => {
  const { estado: codigo, datos } = await llamar('/importar/excel/sugerir', {
    metodo: 'POST',
    cuerpo: { nuevos: ['Amazn'] },
  })
  comprobar(codigo >= 400, 'una respuesta que no es JSON da error')
  comprobar(
    typeof datos.error === 'string' && datos.error.length > 10,
    'y el error está en castellano',
    datos.error,
  )
})

await conIa(
  { responder: () => ({ movimientos: [] }), motivoFin: 'length' },
  async ({ llamar }) => {
    const { estado: codigo, datos } = await llamar('/importar/excel/sugerir', {
      metodo: 'POST',
      cuerpo: { nuevos: ['Amazn'] },
    })
    comprobar(codigo >= 400, 'una respuesta cortada por longitud da error')
    comprobar(datos.error.includes('cortado'), 'y lo dice claramente', datos.error)
  },
)

await conIa({ responder: () => '', estado: 401 }, async ({ llamar }) => {
  const prueba = await llamar('/config/ia/probar', { metodo: 'POST' })
  comprobar(prueba.estado === 200, 'la prueba de conexión responde 200 aunque falle')
  comprobar(prueba.datos.ok === false, 'con ok:false')
  comprobar(
    prueba.datos.mensaje.toLowerCase().includes('clave'),
    'y dice que el problema es la clave',
    prueba.datos.mensaje,
  )
})

await conIa({ responder: () => '', estado: 429 }, async ({ llamar }) => {
  const { datos } = await llamar('/config/ia/probar', { metodo: 'POST' })
  comprobar(datos.ok === false && datos.mensaje.includes('limite'), 'un 429 se traduce a "límite"', datos.mensaje)
})

console.log(`\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`)
process.exit(estado.fallos === 0 ? 0 : 1)
