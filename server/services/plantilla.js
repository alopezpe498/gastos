import * as conceptosBd from '../db/conceptos.js'
import * as plantillaBd from '../db/plantilla.js'
import * as configBd from '../db/config.js'
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

  const totalFijos = redondear(fijos.reduce((t, f) => t + f.importePrevisto, 0))
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
