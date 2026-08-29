import { bd } from '../db/index.js'
import * as mesesBd from '../db/meses.js'
import * as movimientosBd from '../db/movimientos.js'
import * as plantillaBd from '../db/plantilla.js'
import * as conceptosBd from '../db/conceptos.js'
import * as importacionesBd from '../db/importaciones.js'
import * as configBd from '../db/config.js'
import { mesAnterior } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

/**
 * Volver a aplicar la plantilla de fijos a un mes que ya existe.
 *
 * Hace falta porque la plantilla cambia: se sube la hipoteca, se da de alta un
 * seguro nuevo, se desactiva el gimnasio. Los meses que ya estaban abiertos se
 * quedaron con la foto de cuando se abrieron, y esto los pone al dia.
 *
 * LA REGLA QUE MANDA SOBRE TODO LO DEMAS: lo que ya ha pasado no se toca.
 *
 *   - Un fijo COBRADO es un hecho: se cobro esa cantidad ese dia. Se deja como
 *     esta, pase lo que pase con la plantilla.
 *   - Un fijo PENDIENTE es una prevision: se actualiza sin remordimiento.
 *   - Un VARIABLE lo ha escrito una persona: no se toca nunca.
 *
 * Por eso esto se puede ejecutar cuantas veces se quiera sin perder nada.
 */

/** El valor que la plantilla propone para el ingreso, la comida y el ahorro. */
function valoresPorDefecto(mes) {
  const sobre = conceptosBd.sobrePrincipal()
  const objetivo = conceptosBd.conceptoObjetivo()

  const delSobre = sobre ? plantillaBd.vigenteEn(sobre.id, mes.anio, mes.mes) : null
  const delObjetivo = objetivo ? plantillaBd.vigenteEn(objetivo.id, mes.anio, mes.mes) : null

  /*
   * El ingreso sale de la nomina prevista de la plantilla. Mientras no se haya
   * puesto ninguna se propone la del mes anterior, que es de donde salia antes
   * de que la plantilla existiera.
   */
  const nomina = configBd.ingresoPrevisto()
  const previo = mesAnterior(mes.anio, mes.mes)
  const anterior = nomina === null ? mesesBd.porFecha(previo.anio, previo.mes) : null

  return {
    ingreso: {
      actual: mes.ingreso,
      propuesto: nomina ?? (anterior ? anterior.ingreso : null),
      origen:
        nomina !== null
          ? 'la nómina prevista de la plantilla'
          : anterior
            ? `la nómina de ${previo.mes}/${previo.anio}`
            : null,
    },
    presupuestoComida: {
      actual: mes.presupuestoComida,
      propuesto: delSobre ? delSobre.importePrevisto : null,
      origen: sobre ? `la plantilla de ${sobre.nombre}` : null,
    },
    objetivoAhorro: {
      actual: mes.objetivoAhorro,
      propuesto: delObjetivo ? delObjetivo.importePrevisto : null,
      origen: objetivo ? `la plantilla de ${objetivo.nombre}` : null,
    },
  }
}

/**
 * Lo que pasaria si se regenerase, sin tocar nada.
 *
 * Se ensena antes de confirmar: regenerar un mes a ciegas y descubrir despues
 * que ha cambiado ocho importes no tiene arreglo comodo.
 */
export function resumenRegeneracion(mesId) {
  const mes = mesesBd.obtener(mesId)
  if (!mes) return null

  const movimientos = movimientosBd.delMes(mesId)
  const fijosDelMes = movimientos.filter((m) => m.tipo === 'fijo' && !m.esObjetivo)
  const variables = movimientos.filter((m) => m.tipo !== 'fijo')

  const porConcepto = new Map()
  for (const fijo of fijosDelMes) {
    // Si por lo que sea hay dos apuntes del mismo fijo, manda el primero y el
    // resto se dejan en paz: son correcciones hechas a mano.
    if (!porConcepto.has(fijo.conceptoId)) porConcepto.set(fijo.conceptoId, fijo)
  }

  const anadir = []
  const actualizar = []
  const ignorar = []

  for (const linea of plantillaBd.vigentesEn(mes.anio, mes.mes)) {
    // Ni el sobre ni el objetivo generan movimiento: van por el mes.
    if (linea.tipo !== 'fijo' || linea.esObjetivo) continue

    const existente = porConcepto.get(linea.conceptoId)

    if (!existente) {
      anadir.push({
        conceptoId: linea.conceptoId,
        nombre: linea.nombre,
        importePrevisto: linea.importePrevisto,
        diaPrevisto: linea.diaPrevisto,
      })
      continue
    }

    if (existente.cobrado) {
      // Solo se menciona si la plantilla dice ahora otra cosa: si coincide, no
      // hay nada que contar.
      if (existente.importePrevisto !== linea.importePrevisto) {
        ignorar.push({
          conceptoId: linea.conceptoId,
          nombre: linea.nombre,
          motivo: 'cobrado',
          importe: existente.importe,
          fechaCobro: existente.fechaCobro,
          importePrevisto: linea.importePrevisto,
        })
      }
      continue
    }

    const cambiaPrevisto = existente.importePrevisto !== linea.importePrevisto
    const cambiaImporte = existente.importe !== linea.importePrevisto
    const cambiaDia = (existente.diaPrevisto ?? null) !== (linea.diaPrevisto ?? null)

    if (cambiaPrevisto || cambiaImporte || cambiaDia) {
      actualizar.push({
        movimientoId: existente.id,
        conceptoId: linea.conceptoId,
        nombre: linea.nombre,
        importeAntes: existente.importe,
        importeDespues: linea.importePrevisto,
        previstoAntes: existente.importePrevisto,
        previstoDespues: linea.importePrevisto,
        diaAntes: existente.diaPrevisto,
        diaDespues: linea.diaPrevisto,
        cambiaImporte,
      })
    }
  }

  /*
   * Un fijo que esta en el mes pero YA NO esta en la plantilla (se desactivo el
   * concepto). No se borra: si estaba cobrado es historia, y si esta pendiente
   * puede que se cobre igual este mes. Solo se avisa.
   */
  const clavesDePlantilla = new Set(
    plantillaBd
      .vigentesEn(mes.anio, mes.mes)
      .filter((l) => l.tipo === 'fijo' && !l.esObjetivo)
      .map((l) => l.conceptoId),
  )
  const sobrantes = [...porConcepto.values()]
    .filter((f) => !clavesDePlantilla.has(f.conceptoId))
    .map((f) => ({
      conceptoId: f.conceptoId,
      nombre: f.concepto,
      motivo: 'fuera de plantilla',
      importe: f.importe,
      cobrado: f.cobrado,
    }))

  return {
    mesId,
    anio: mes.anio,
    mes: mes.mes,
    estado: mes.estado,
    anadir,
    actualizar,
    ignorar: [...ignorar, ...sobrantes],
    // Los variables no se tocan, pero se cuentan para poder decirlo.
    variables: variables.length,
    valores: valoresPorDefecto(mes),
    // Cuantas importaciones aceptadas hay: reiniciar o borrar el mes las
    // deshace, y eso conviene decirlo antes de confirmar.
    importacionesAceptadas: importacionesBd.aceptadasDelMes(mesId),
    // Si no hay nada que hacer, la pantalla lo dice y no ofrece el boton.
    sinCambios: anadir.length === 0 && actualizar.length === 0,
  }
}

/**
 * Aplica lo que resumenRegeneracion() ha anunciado.
 *
 * @param {object} opciones
 * @param {boolean} [opciones.aplicarIngreso]
 * @param {boolean} [opciones.aplicarComida]
 * @param {boolean} [opciones.aplicarAhorro]
 */
export const regenerar = bd.transaction((mesId, opciones = {}) => {
  const resumen = resumenRegeneracion(mesId)
  if (!resumen) return null

  for (const linea of resumen.anadir) {
    movimientosBd.crear({
      mesId,
      conceptoId: linea.conceptoId,
      importe: linea.importePrevisto,
      importePrevisto: linea.importePrevisto,
      diaPrevisto: linea.diaPrevisto,
      // Nace pendiente, como en la apertura del mes.
      fechaCobro: null,
      origen: 'manual',
    })
  }

  for (const linea of resumen.actualizar) {
    // El importe real solo se pisa mientras siga pendiente; el previsto y el
    // dia se actualizan siempre, porque son la referencia, no el hecho.
    movimientosBd.actualizarPrevisto(linea.movimientoId, {
      importePrevisto: linea.previstoDespues,
      diaPrevisto: linea.diaDespues,
      importe: linea.cambiaImporte ? linea.importeDespues : undefined,
    })
  }

  const cambios = {}
  const { valores } = resumen
  if (opciones.aplicarIngreso && valores.ingreso.propuesto !== null) {
    cambios.ingreso = valores.ingreso.propuesto
  }
  if (opciones.aplicarComida && valores.presupuestoComida.propuesto !== null) {
    cambios.presupuestoComida = valores.presupuestoComida.propuesto
  }
  if (opciones.aplicarAhorro && valores.objetivoAhorro.propuesto !== null) {
    cambios.objetivoAhorro = valores.objetivoAhorro.propuesto
  }
  if (Object.keys(cambios).length > 0) mesesBd.actualizar(mesId, cambios)

  return {
    anadidos: resumen.anadir.length,
    actualizados: resumen.actualizar.length,
    intactos: resumen.ignorar.length,
    variables: resumen.variables,
    valoresAplicados: Object.keys(cambios),
  }
})

/**
 * Borra todos los movimientos del mes y lo vuelve a generar desde la plantilla.
 *
 * Esto SI pierde datos, incluidos los variables y los cobros ya marcados. Es la
 * salida para un mes que se ha quedado hecho un lio, no una herramienta de uso
 * diario: por eso la pantalla pide dos confirmaciones y dice cuantos variables
 * se van a llevar por delante.
 *
 * Lo que NO se borra es lo que ha escrito una persona sobre el mes: el ingreso,
 * el dinero en cuenta y las notas. Eso no sale de la plantilla.
 */
export const reiniciar = bd.transaction((mesId) => {
  const mes = mesesBd.obtener(mesId)
  if (!mes) return null

  const movimientos = movimientosBd.delMes(mesId)
  const borrados = movimientos.length
  const variablesBorrados = movimientos.filter((m) => m.tipo !== 'fijo').length

  movimientosBd.borrarDelMes(mesId)

  /*
   * Y las huellas de los extractos que se importaron en este mes se liberan.
   * Sin esto, tras reiniciar el mes el mismo extracto salia entero como
   * duplicado —71 de 71— y no habia forma comoda de volver a cargarlo.
   */
  const importacionesDeshechas = importacionesBd.liberarHuellasDelMes(mesId)

  let generados = 0
  for (const linea of plantillaBd.vigentesEn(mes.anio, mes.mes)) {
    if (linea.tipo !== 'fijo' || linea.esObjetivo) continue
    movimientosBd.crear({
      mesId,
      conceptoId: linea.conceptoId,
      importe: linea.importePrevisto,
      importePrevisto: linea.importePrevisto,
      diaPrevisto: linea.diaPrevisto,
      fechaCobro: null,
      origen: 'manual',
    })
    generados += 1
  }

  // La comida y el ahorro vuelven a su plantilla; el ingreso no se toca.
  const valores = valoresPorDefecto(mesesBd.obtener(mesId))
  const cambios = {}
  if (valores.presupuestoComida.propuesto !== null) {
    cambios.presupuestoComida = valores.presupuestoComida.propuesto
  }
  if (valores.objetivoAhorro.propuesto !== null) {
    cambios.objetivoAhorro = valores.objetivoAhorro.propuesto
  }
  if (Object.keys(cambios).length > 0) mesesBd.actualizar(mesId, cambios)

  return { borrados, variablesBorrados, importacionesDeshechas, generados }
})

/** Cuántos meses abiertos hay: lo usa el aviso al cambiar una plantilla. */
export function mesesAbiertos() {
  return mesesBd
    .listar()
    .filter((m) => m.estado === 'abierto')
    .map((m) => ({ id: m.id, anio: m.anio, mes: m.mes, nombreMes: m.nombreMes ?? null }))
}

/** Redondeo compartido, por si alguien importa este modulo suelto. */
export { redondear }

/**
 * Borra un mes por completo: sus movimientos, sus importaciones y sus huellas.
 *
 * Es el unico sitio de la aplicacion que destruye un mes entero, y por eso la
 * pantalla pide dos confirmaciones. A diferencia de reiniciar, aqui las huellas
 * se BORRAN de verdad, porque el mes al que pertenecian deja de existir.
 */
export const borrarMes = bd.transaction((mesId) => {
  const mes = mesesBd.obtener(mesId)
  if (!mes) return null

  const movimientos = movimientosBd.delMes(mesId).length
  const importaciones = importacionesBd.listar({ mesId })

  // Las huellas cuelgan de la importacion (ON DELETE CASCADE), y los
  // movimientos del mes, pero se cuentan antes para poder decir que se pierde.
  for (const i of importaciones) importacionesBd.borrar(i.id)
  movimientosBd.borrarDelMes(mesId)
  mesesBd.borrar(mesId)

  // El nombre del mes lo pone la ruta; aqui se devuelven los numeros.
  return { movimientos, importaciones: importaciones.length, anio: mes.anio, mes: mes.mes }
})
