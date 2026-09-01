import * as conceptosBd from '../db/conceptos.js'
import * as plantillaBd from '../db/plantilla.js'
import * as movimientosBd from '../db/movimientos.js'
import * as configBd from '../db/config.js'
import { claveMes, mesAnterior, NOMBRES_MESES } from '../lib/fechas.js'
import { redondear } from '../lib/http.js'

/**
 * La plantilla: lo que costara un mes cualquiera antes de que pase nada.
 *
 * Es la hoja de la que sale un mes nuevo. Un fijo con su dia y su importe, el
 * sobre de la comida, el objetivo de ahorro y la nomina prevista. Con eso, abrir
 * un mes es copiar esta hoja y ponerle fecha.
 *
 * Todo se mira SIEMPRE con un mes de referencia ("vigente desde"), porque los
 * importes tienen historico: la hipoteca de enero no es la de octubre. La
 * pantalla elige ese mes —por defecto, el siguiente al de hoy— y esto contesta
 * que dice la plantilla para el.
 */

/*
 * ---------------------------------------------------------------------------
 * De donde sale el importe de un fijo
 * ---------------------------------------------------------------------------
 *
 * Un importe escrito envejece: la luz de enero no es la de julio, y el seguro
 * sube todos los anos. Por eso una linea de la plantilla puede decir, en vez de
 * un numero, "lo que costo el mes pasado" o "lo que costo ese mes el ano
 * pasado". El numero escrito sigue estando y sigue haciendo falta: es el
 * respaldo para cuando el mes de referencia no existe todavia.
 *
 * REGLA: si no hay dato, se usa el importe escrito. Nunca cero. Proponer cero
 * euros de hipoteca porque el mes anterior no esta en la base seria peor que
 * proponer un importe viejo.
 */

export const CRITERIOS = ['importe', 'mes-anterior', 'ano-anterior']

/** El mes de referencia de cada criterio, visto desde el mes que se genera. */
function mesDeReferencia(criterio, anio, mes) {
  if (criterio === 'mes-anterior') return mesAnterior(anio, mes)
  if (criterio === 'ano-anterior') return { anio: anio - 1, mes }
  return null
}

/** "agosto de 2026", para poder decir de donde sale el numero. */
function mesLegible({ anio, mes }) {
  return `${NOMBRES_MESES[mes - 1].toLowerCase()} de ${anio}`
}

/**
 * El importe que le toca a una linea de plantilla en un mes concreto.
 *
 * Devuelve siempre un importe utilizable, y ademas de donde ha salido, para que
 * la pantalla pueda decirlo y no parezca que el numero se lo inventa alguien.
 */
export function resolverImporte(linea, anio, mes) {
  const criterio = CRITERIOS.includes(linea.criterio) ? linea.criterio : 'importe'
  const escrito = redondear(linea.importePrevisto ?? 0)

  const referencia = mesDeReferencia(criterio, anio, mes)
  if (!referencia) {
    return { importe: escrito, criterio, origen: 'importe', deMes: null, hayDato: true }
  }

  const real = movimientosBd.importeEnMes(linea.conceptoId, referencia.anio, referencia.mes)
  return {
    importe: real === null ? escrito : real,
    criterio,
    origen: criterio,
    deMes: claveMes(referencia.anio, referencia.mes),
    deMesLegible: mesLegible(referencia),
    hayDato: real !== null,
  }
}

/**
 * Las lineas de la plantilla que generan movimiento en un mes, ya resueltas.
 *
 * Esta es la puerta unica: abrir un mes, regenerarlo y reiniciarlo pasan por
 * aqui, asi que los tres proponen exactamente lo mismo.
 */
export function lineasParaMes(anio, mes) {
  return plantillaBd.vigentesEn(anio, mes).map((linea) => {
    const resuelto = resolverImporte(linea, anio, mes)
    return {
      ...linea,
      // El importe escrito se conserva aparte: es el respaldo, no lo que se usa.
      importeEscrito: redondear(linea.importePrevisto ?? 0),
      importePrevisto: resuelto.importe,
      origenImporte: resuelto,
    }
  })
}

/** El mes que sigue al de hoy, en 'AAAA-MM'. Es el destino habitual. */
export function mesPorDefecto() {
  const ahora = new Date()
  const anio = ahora.getMonth() === 11 ? ahora.getFullYear() + 1 : ahora.getFullYear()
  const mes = ahora.getMonth() === 11 ? 1 : ahora.getMonth() + 2
  return `${anio}-${String(mes).padStart(2, '0')}`
}

/** Parte 'AAAA-MM' en numeros. Devuelve null si no se entiende. */
export function partirClave(clave) {
  if (!/^\d{4}-\d{2}$/.test(String(clave ?? ''))) return null
  const [anio, mes] = String(clave).split('-').map(Number)
  if (mes < 1 || mes > 12) return null
  return { anio, mes }
}

/** Un concepto de la plantilla, con la entrada que le toca en ese mes. */
function aLinea(concepto, anio, mes) {
  const entrada = plantillaBd.vigenteEn(concepto.id, anio, mes)
  const historico = plantillaBd.historico(concepto.id)
  return {
    conceptoId: concepto.id,
    nombre: concepto.nombre,
    tipo: concepto.tipo,
    orden: concepto.orden,
    clasificacion: concepto.clasificacion,
    esObjetivo: concepto.esObjetivo,
    diaPrevisto: entrada?.diaPrevisto ?? null,
    importePrevisto: entrada?.importePrevisto ?? 0,
    criterio: entrada?.criterio ?? 'importe',
    // Lo que de verdad se usaria en ese mes, y de donde sale.
    origenImporte: resolverImporte(
      {
        conceptoId: concepto.id,
        criterio: entrada?.criterio ?? 'importe',
        importePrevisto: entrada?.importePrevisto ?? 0,
      },
      anio,
      mes,
    ),
    // De cuando viene el importe que se esta viendo. Si no es el mes elegido,
    // es que se arrastra de antes: conviene decirlo, porque el que edite ahi va
    // a crear una entrada nueva, no a corregir esa.
    vigenteDesde: entrada?.vigenteDesde ?? null,
    heredado: !!entrada && entrada.vigenteDesde !== `${anio}-${String(mes).padStart(2, '0')}`,
    versiones: historico.length,
  }
}

/**
 * La plantilla entera vista desde un mes.
 *
 * Los fijos son la tabla. El sobre y el objetivo van aparte, en "valores del
 * mes", porque no son gastos que se apunten: uno es un presupuesto y el otro es
 * una intencion.
 */
export function verDesde(clave) {
  const partido = partirClave(clave)
  if (!partido) return null
  const { anio, mes } = partido

  const activos = conceptosBd.listar({ soloActivos: true })

  const fijos = activos
    .filter((c) => c.tipo === 'fijo' && !c.esObjetivo)
    .map((c) => aLinea(c, anio, mes))

  const sobre = conceptosBd.sobrePrincipal()
  const objetivo = conceptosBd.conceptoObjetivo()

  const comida = sobre && sobre.activo ? aLinea(sobre, anio, mes) : null
  const ahorro = objetivo && objetivo.activo ? aLinea(objetivo, anio, mes) : null

  // El total es el de lo que se usaria de verdad: si tres fijos copian el mes
  // pasado, sumar sus importes escritos daria una prevision que no existe.
  const totalFijos = redondear(fijos.reduce((t, f) => t + f.origenImporte.importe, 0))
  const presupuestoComida = comida ? comida.importePrevisto : 0
  const ingreso = configBd.ingresoPrevisto()

  return {
    desde: clave,
    fijos,
    valores: {
      // null de verdad: "no lo he dicho todavia", que la pantalla distingue de
      // haber puesto un cero.
      ingresoPrevisto: ingreso,
      comida,
      ahorro,
    },
    resumen: {
      cuantosFijos: fijos.length,
      totalFijos,
      presupuestoComida,
      objetivoAhorro: ahorro ? ahorro.importePrevisto : 0,
      ingreso,
      // Lo que quedaria un mes en el que no pasara nada raro: la nomina menos
      // los recibos y menos el sobre de la comida. Sin nomina no hay resta que
      // hacer, y decir "0" seria mentir.
      sobrante: ingreso === null ? null : redondear(ingreso - totalFijos - presupuestoComida),
    },
  }
}
