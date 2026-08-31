import { bd, normalizar } from '../db/index.js'
import * as conceptosBd from '../db/conceptos.js'
import * as plantillaBd from '../db/plantilla.js'
import * as mesesBd from '../db/meses.js'
import * as movimientosBd from '../db/movimientos.js'
import { leerHoja, ErrorLectura } from './lecturaExcel.js'
import { claveMes, fechaDelDiaPrevisto, NOMBRES_MESES } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

export { ErrorLectura }

/** Concepto que recoge la diferencia cuando el Excel no cuadra consigo mismo. */
const CONCEPTO_AJUSTE = 'Ajuste importación'

/**
 * Una fecha de cobro solo vale si ya ha pasado; si no, el apunte queda pendiente.
 *
 * Nada puede estar cobrado en el futuro. Es la regla que faltaba: la hoja anual
 * trae los doce meses y los que aun no han llegado son una prevision.
 */
function siYaPaso(fecha) {
  return fecha <= hoy() ? fecha : null
}

const hoy = () => new Date().toISOString().slice(0, 10)

/** Si el mes todavia no ha empezado, lo que trae la hoja es una prevision. */
function mesYaEmpezado(anio, mes) {
  return `${claveMes(anio, mes)}-01` <= hoy()
}

/**
 * Importacion de una hoja anual.
 *
 * Dos pasos a proposito: primero se ensena lo que se va a hacer (vistaPrevia) y
 * solo despues se hace (confirmar). Importar cinco años de cuentas a ciegas y
 * descubrir luego que "Gimasio" ha creado un concepto nuevo al lado de
 * "Gimnasio" seria un desastre dificil de deshacer.
 */

/** Un mes tiene datos si trae algun fijo, algun variable o un ingreso. */
function mesesConDatos(lectura) {
  const conDatos = new Set()
  for (const fijo of lectura.fijos) for (const mes of fijo.valores.keys()) conDatos.add(mes)
  for (const mes of lectura.totales.ingresos.keys()) conDatos.add(mes)
  for (const mes of lectura.variables.keys()) conDatos.add(mes)
  return [...conDatos].sort((a, b) => a - b)
}

/** Suma de los variables de un mes, que es lo que el Excel llama "Otros". */
function sumaVariables(lectura, mes) {
  const apuntes = lectura.variables.get(mes) ?? []
  return redondear(apuntes.reduce((total, a) => total + a.importe, 0))
}

/**
 * Une los nombres que aparecen en la hoja con los conceptos que ya existen.
 * El sobre de la comida se reconoce por nombre, igual que el resto.
 */
function emparejar(nombres, tipoSugerido) {
  const vistos = new Map()
  for (const { nombre, apuntes, total, meses } of nombres) {
    const clave = normalizar(nombre)
    const anterior = vistos.get(clave)
    if (anterior) {
      anterior.apuntes += apuntes
      anterior.total = redondear(anterior.total + total)
      anterior.meses += meses
      continue
    }
    const existente = conceptosBd.buscarPorNombre(nombre)
    vistos.set(clave, {
      nombreExcel: nombre,
      apuntes,
      total,
      meses,
      tipoSugerido,
      conceptoId: existente?.id ?? null,
      conceptoNombre: existente?.nombre ?? null,
      // Se marca cuando el Excel lo escribe distinto a como se llama aqui: es
      // el caso que conviene mirar ("Gimasio" -> "Gimnasio").
      porAlias: existente ? normalizar(existente.nombre) !== clave : false,
      nuevo: !existente,
    })
  }
  return [...vistos.values()].sort((a, b) => b.total - a.total)
}

export async function vistaPrevia(buffer, nombreHoja) {
  return vistaPreviaDeLectura(await leerHoja(buffer, nombreHoja))
}

/**
 * La vista previa a partir de una lectura ya hecha.
 *
 * Se separa de vistaPrevia() para que la rama de IA —que construye la lectura
 * leyendo la hoja con un modelo en vez de con el parser— reutilice exactamente
 * el mismo emparejado de conceptos, los mismos avisos y la misma pantalla.
 */
export function vistaPreviaDeLectura(lectura) {
  const nombreHoja = lectura.hoja
  const anio = lectura.anio
  if (!anio) {
    throw new ErrorLectura(
      `No se ha podido deducir el año del nombre de la hoja ("${nombreHoja}"). ` +
        'Las hojas anuales se llaman "Cuentas2025" y similares.',
    )
  }

  const meses = mesesConDatos(lectura)

  // ---------- conceptos ----------

  const fijos = emparejar(
    lectura.fijos.map((fijo) => ({
      nombre: fijo.nombre,
      apuntes: fijo.valores.size,
      meses: fijo.valores.size,
      total: redondear([...fijo.valores.values()].reduce((t, v) => t + v, 0)),
    })),
    'fijo',
  )

  const porNombreVariable = new Map()
  for (const [mes, apuntes] of lectura.variables) {
    for (const apunte of apuntes) {
      const clave = normalizar(apunte.concepto)
      const actual = porNombreVariable.get(clave) ?? {
        nombre: apunte.concepto,
        apuntes: 0,
        total: 0,
        meses: new Set(),
      }
      actual.apuntes += 1
      actual.total = redondear(actual.total + apunte.importe)
      actual.meses.add(mes)
      porNombreVariable.set(clave, actual)
    }
  }
  const variables = emparejar(
    [...porNombreVariable.values()].map((v) => ({ ...v, meses: v.meses.size })),
    'variable',
  )

  // ---------- mes a mes ----------

  const objetivo = conceptosBd.conceptoObjetivo()
  const sobre = conceptosBd.sobrePrincipal()
  const claveSobre = sobre ? normalizar(sobre.nombre) : null
  const claveObjetivo = objetivo ? normalizar(objetivo.nombre) : null

  const comidaFija = lectura.fijos.find((f) => normalizar(f.nombre) === claveSobre)
  const filaObjetivo = claveObjetivo
    ? lectura.fijos.find((f) => normalizar(f.nombre) === claveObjetivo)
    : null

  const detalle = meses.map((mes) => {
    const otrosCalculado = sumaVariables(lectura, mes)
    const otrosExcel = lectura.totales.otros.get(mes) ?? null
    const comida = comidaFija?.valores.get(mes) ?? 0

    // Los fijos que de verdad son gasto: ni el sobre de la comida ni el
    // objetivo de ahorro cuentan como recibo.
    const fijosDelMes = redondear(
      lectura.fijos
        .filter((f) => {
          const clave = normalizar(f.nombre)
          return clave !== claveSobre && clave !== claveObjetivo
        })
        .reduce((total, f) => total + (f.valores.get(mes) ?? 0), 0),
    )

    const gastosExcel = lectura.totales.gastos.get(mes) ?? null
    const gastosCalculado = redondear(fijosDelMes + otrosCalculado + comida)

    return {
      mes,
      nombre: NOMBRES_MESES[mes - 1],
      ingreso: lectura.totales.ingresos.get(mes) ?? 0,
      comida,
      objetivoAhorro: filaObjetivo?.valores.get(mes) ?? 0,
      variables: (lectura.variables.get(mes) ?? []).length,
      otrosExcel,
      otrosCalculado,
      // Si la fila "Otros" no cuadra con la suma de los apuntes, el Excel se
      // contradice a si mismo y hay que decidir a quien creer.
      descuadre: otrosExcel === null ? null : redondear(otrosExcel - otrosCalculado),
      gastosExcel,
      gastosCalculado,
      diferenciaGastos: gastosExcel === null ? null : redondear(gastosCalculado - gastosExcel),
    }
  })

  const avisos = [...lectura.avisos]

  // La hoja suma el ahorro dentro de "Gastos"; la aplicacion no, porque el
  // ahorro es un objetivo y no un recibo. La diferencia es exactamente esa, y
  // conviene decirlo antes de que parezca un fallo de la importacion.
  const conAhorro = detalle.filter((m) => m.objetivoAhorro !== 0)
  if (conAhorro.length > 0) {
    avisos.push(
      `La hoja incluye "${objetivo?.nombre ?? 'Ahorro'}" dentro de la fila "Gastos" en ` +
        `${conAhorro.length} ${conAhorro.length === 1 ? 'mes' : 'meses'}. Aquí el ahorro es un ` +
        'objetivo, no un gasto, así que el total calculado sale más bajo en esa misma cantidad. ' +
        'El importe se guarda como objetivo de ahorro del mes.',
    )
  }

  // Un nombre que sale en el detalle de variables y que aqui ya es un concepto
  // fijo. El Excel lo suma en "Otros"; la aplicacion lo pone en su concepto, que
  // es donde de verdad va. El total del mes no cambia, pero las dos filas si, y
  // eso descoloca si no se avisa.
  const clavesFijasDelExcel = new Set(fijos.map((f) => normalizar(f.nombreExcel)))
  const colisiones = variables.filter((v) => {
    if (clavesFijasDelExcel.has(normalizar(v.nombreExcel))) return true
    const concepto = v.conceptoId ? conceptosBd.obtener(v.conceptoId) : null
    return concepto?.tipo === 'fijo'
  })
  if (colisiones.length > 0) {
    avisos.push(
      `${colisiones.map((c) => `"${c.nombreExcel}"`).join(', ')} ` +
        `${colisiones.length === 1 ? 'aparece' : 'aparecen'} en el detalle de gastos variables, ` +
        `pero ${colisiones.length === 1 ? 'es' : 'son'} un gasto fijo. Ese importe se sumará a su ` +
        'concepto en vez de a la fila "Otros": el total del mes es el mismo, pero las dos filas ' +
        'no saldrán igual que en la hoja.',
    )
  }

  const otrasDiferencias = detalle.filter(
    (m) => m.diferenciaGastos !== null && redondear(m.diferenciaGastos + m.objetivoAhorro) !== 0,
  )
  if (otrasDiferencias.length > 0) {
    avisos.push(
      `${otrasDiferencias.map((m) => m.nombre).join(', ')}: el total calculado no coincide con la ` +
        'fila "Gastos" de la hoja. Revísalos en la tabla de abajo antes de confirmar.',
    )
  }

  const yaExisten = mesesBd.delAnio(anio)

  return {
    hoja: nombreHoja,
    anio,
    meses: detalle,
    fijos,
    variables,
    // Se dice aparte porque es lo unico que no se puede deshacer con un botón.
    yaImportado: yaExisten.length > 0,
    mesesExistentes: yaExisten.map((m) => m.mes),
    objetivoAhorro: objetivo?.nombre ?? null,
    sobre: sobre?.nombre ?? null,
    claveObjetivo,
    avisos,
  }
}

/**
 * Ejecuta la importacion. Todo en una transaccion: o entra el año entero o no
 * entra nada, para no dejar medio 2024 dentro si algo falla a mitad.
 *
 * @param mapeos  { "<nombre del Excel>": conceptoId }  Lo que no venga en el
 *                mapa se crea como concepto nuevo.
 */
export async function confirmar(buffer, nombreHoja, opciones = {}) {
  return confirmarLectura(await leerHoja(buffer, nombreHoja), opciones)
}

/** La importacion a partir de una lectura ya hecha (parser o IA). */
export function confirmarLectura(lectura, opciones = {}) {
  const { mapeos = {}, sobrescribir = false, crearAjustes = false } = opciones
  const anio = lectura.anio
  if (!anio) throw new ErrorLectura('No se ha podido deducir el año de la hoja.')

  const existentes = mesesBd.delAnio(anio)
  if (existentes.length > 0 && !sobrescribir) {
    throw new ErrorLectura(
      `Ya hay ${existentes.length} ${existentes.length === 1 ? 'mes' : 'meses'} de ${anio} en la ` +
        'aplicación. Marca "sobrescribir" si quieres reemplazarlos.',
    )
  }

  return ejecutar({ lectura, anio, mapeos, sobrescribir, crearAjustes })
}

const ejecutar = bd.transaction(({ lectura, anio, mapeos, sobrescribir, crearAjustes }) => {
  const resumen = {
    anio,
    meses: 0,
    fijos: 0,
    variables: 0,
    conceptosCreados: [],
    aliasCreados: [],
    ajustes: [],
  }

  if (sobrescribir) {
    // ON DELETE CASCADE se lleva por delante los movimientos de esos meses.
    for (const mes of mesesBd.delAnio(anio)) mesesBd.borrar(mes.id)
  }

  const objetivo = conceptosBd.conceptoObjetivo()
  const sobre = conceptosBd.sobrePrincipal()
  const claveSobre = sobre ? normalizar(sobre.nombre) : null

  /**
   * Del nombre del Excel al concepto de la aplicacion. Si se ha elegido un
   * concepto a mano y el nombre no coincide, se guarda como alias: la proxima
   * importacion ya no volvera a preguntar.
   */
  const cache = new Map()
  const resolver = (nombreExcel, tipo) => {
    const clave = normalizar(nombreExcel)
    if (cache.has(clave)) return cache.get(clave)

    let concepto = null
    const elegido = mapeos[nombreExcel] ?? mapeos[clave]

    if (elegido) {
      concepto = conceptosBd.obtener(Number(elegido))
      if (concepto && normalizar(concepto.nombre) !== clave) {
        conceptosBd.anadirAlias(concepto.id, nombreExcel)
        resumen.aliasCreados.push(`${nombreExcel} → ${concepto.nombre}`)
      }
    }

    if (!concepto) concepto = conceptosBd.buscarPorNombre(nombreExcel)

    if (!concepto) {
      concepto = conceptosBd.crear({
        nombre: nombreExcel,
        tipo,
        // Lo que llega del Excel se clasifica como prescindible: es la opcion
        // conservadora, porque inflar "necesario" maquilla el 50/30/20.
        clasificacion: 'prescindible',
      })
      if (tipo === 'fijo') {
        plantillaBd.guardar(concepto.id, {
          diaPrevisto: null,
          importePrevisto: 0,
          vigenteDesde: claveMes(anio, 1),
        })
      }
      resumen.conceptosCreados.push(concepto.nombre)
    }

    cache.set(clave, concepto)
    return concepto
  }

  const conDatos = mesesConDatos(lectura)

  for (const numeroMes of conDatos) {
    const comidaFija = lectura.fijos.find((f) => normalizar(f.nombre) === claveSobre)
    const presupuestoComida = comidaFija?.valores.get(numeroMes) ?? 0

    const filaObjetivo = objetivo
      ? lectura.fijos.find((f) => normalizar(f.nombre) === normalizar(objetivo.nombre))
      : null

    const mes = mesesBd.crear({
      anio,
      mes: numeroMes,
      ingreso: lectura.totales.ingresos.get(numeroMes) ?? 0,
      presupuestoComida,
      objetivoAhorro: filaObjetivo?.valores.get(numeroMes) ?? 0,
      // El Excel no trae el dinero en cuenta: se queda sin rellenar en vez de
      // inventarse un cero.
      dineroEnCuenta: null,
      // Lo importado es historia: nace cerrado.
      estado: 'cerrado',
    })
    resumen.meses += 1

    // ---------- fijos ----------
    for (const fijo of lectura.fijos) {
      const clave = normalizar(fijo.nombre)
      if (clave === claveSobre) continue // la comida es el sobre, no un recibo
      if (objetivo && clave === normalizar(objetivo.nombre)) continue // el ahorro es objetivo

      const valor = fijo.valores.get(numeroMes)
      if (valor === undefined) continue

      const concepto = resolver(fijo.nombre, 'fijo')
      const plantilla = plantillaBd.vigenteEn(concepto.id, anio, numeroMes)

      movimientosBd.crear({
        mesId: mes.id,
        conceptoId: concepto.id,
        importe: valor,
        importePrevisto: plantilla?.importePrevisto ?? null,
        diaPrevisto: plantilla?.diaPrevisto ?? null,
        /*
         * Lo del Excel ya esta cobrado: se fecha en su dia previsto y, si no lo
         * tiene, el dia 1. PERO solo si ese dia ya ha pasado.
         *
         * La hoja trae el año entero, con los importes de los meses que aun no
         * han llegado; son una prevision, no un cobro. Fecharlos igual dejaba
         * septiembre con sus catorce fijos «cobrados» antes de empezar, y con
         * ellos fuera de lo comprometido: la pantalla decia que te quedaba
         * mucho mas dinero del que te quedaba.
         */
        fechaCobro: siYaPaso(fechaDelDiaPrevisto(anio, numeroMes, plantilla?.diaPrevisto)),
        origen: 'excel',
      })
      resumen.fijos += 1
    }

    /*
     * Un mes que aun no ha empezado no tiene gastos: lo que la hoja trae de el
     * son los importes previstos de los fijos, y esos ya se han creado arriba
     * como pendientes. Crear ademas sus variables y su comida diria que te has
     * gastado en septiembre un dinero que aun no has tocado.
     */
    const empezado = mesYaEmpezado(anio, numeroMes)

    // ---------- variables ----------
    const apuntes = empezado ? lectura.variables.get(numeroMes) ?? [] : []
    // El Excel no guarda la fecha de cada gasto variable, solo el mes. Se
    // fechan el dia 1: asi cuentan como cobrados y no como pendientes, que es
    // lo que son en un mes ya cerrado.
    const fechaDelMes = `${claveMes(anio, numeroMes)}-01`

    let hayComidaDetallada = false
    for (const apunte of apuntes) {
      const concepto = resolver(apunte.concepto, 'variable')
      if (concepto.tipo === 'sobre') hayComidaDetallada = true
      movimientosBd.crear({
        mesId: mes.id,
        conceptoId: concepto.id,
        importe: apunte.importe,
        fechaCobro: fechaDelMes,
        origen: 'excel',
      })
      resumen.variables += 1
    }

    // Si la comida del mes es un importe unico y no hay apuntes de comida, se
    // guarda ademas como un movimiento del sobre: sin el, "gastado en comida"
    // saldria a cero y el sobre pareceria intacto.
    if (empezado && sobre && presupuestoComida !== 0 && !hayComidaDetallada) {
      movimientosBd.crear({
        mesId: mes.id,
        conceptoId: sobre.id,
        importe: presupuestoComida,
        fechaCobro: fechaDelMes,
        descripcion: 'Total del mes según el Excel',
        origen: 'excel',
      })
    }

    // ---------- descuadre ----------
    const otrosExcel = empezado ? lectura.totales.otros.get(numeroMes) : undefined
    if (otrosExcel !== undefined) {
      const diferencia = redondear(otrosExcel - sumaVariables(lectura, numeroMes))
      if (diferencia !== 0) {
        resumen.ajustes.push({ mes: numeroMes, diferencia, aplicado: crearAjustes })
        if (crearAjustes) {
          const ajuste = resolver(CONCEPTO_AJUSTE, 'variable')
          movimientosBd.crear({
            mesId: mes.id,
            conceptoId: ajuste.id,
            importe: diferencia,
            fechaCobro: fechaDelMes,
            descripcion: `Diferencia con la fila "Otros" de ${lectura.hoja}`,
            origen: 'excel',
          })
          resumen.variables += 1
        }
      }
    }
  }

  return resumen
})
