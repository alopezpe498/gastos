import ExcelJS from 'exceljs'
import { bd } from '../db/index.js'
import * as conceptosBd from '../db/conceptos.js'
import * as mesesBd from '../db/meses.js'
import * as movimientosBd from '../db/movimientos.js'
import * as configBd from '../db/config.js'
import * as plantillaBd from '../db/plantilla.js'
import { matrizAnual } from './calculos.js'
import { NOMBRES_MESES } from '../lib/fechas.js'

/**
 * Copia completa en JSON.
 *
 * Es la copia de seguridad "de la aplicacion": lleva todo lo que hace falta
 * para reconstruirla, incluidas las tablas que la fase 1 no usa todavia.
 */
export function aJson() {
  const conceptos = conceptosBd.listar().map((concepto) => ({
    ...concepto,
    alias: conceptosBd.alias(concepto.id).map((a) => a.alias),
    plantilla: plantillaBd.historico(concepto.id),
  }))

  const meses = mesesBd.listar().map((mes) => ({
    ...mes,
    movimientos: movimientosBd.delMes(mes.id).map((m) => ({
      conceptoId: m.conceptoId,
      concepto: m.concepto,
      importe: m.importe,
      importePrevisto: m.importePrevisto,
      diaPrevisto: m.diaPrevisto,
      fechaCobro: m.fechaCobro,
      descripcion: m.descripcion,
      origen: m.origen,
    })),
  }))

  return {
    aplicacion: 'gastos',
    version: 1,
    exportado: new Date().toISOString(),
    ajustes: configBd.ajustes(),
    conceptos,
    meses,
    reglasClasificacion: bd.prepare('SELECT * FROM reglas_clasificacion').all(),
  }
}

/**
 * Exportacion a Excel con el mismo formato que la hoja de siempre, para poder
 * seguir usando Excel si hace falta.
 *
 * Se respeta hasta el detalle de las dos columnas por mes (la primera para el
 * concepto del detalle de variables, la segunda para el importe), porque es lo
 * que hace que la hoja se pueda volver a importar aqui sin tocar nada.
 */
export async function aExcel(anios) {
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Gastos'
  libro.created = new Date()

  const ajustes = configBd.ajustes()
  const conceptos = conceptosBd.listar()

  for (const anio of anios) {
    const meses = mesesBd.delAnio(anio)
    if (meses.length === 0) continue

    const matriz = matrizAnual({
      anio,
      meses,
      movimientos: movimientosBd.delAnioConMes(anio),
      conceptos,
      ajustes,
    })

    const hoja = libro.addWorksheet(`Cuentas${anio}`)

    // Columna A para los nombres; luego dos columnas por mes, siempre las doce,
    // aunque el año este a medias: asi la hoja se lee igual todos los años.
    const columnaImporte = (mes) => 3 + (mes - 1) * 2
    const columnaConcepto = (mes) => 2 + (mes - 1) * 2

    hoja.getColumn(1).width = 22
    for (let mes = 1; mes <= 12; mes += 1) {
      hoja.getColumn(columnaConcepto(mes)).width = 18
      hoja.getColumn(columnaImporte(mes)).width = 11
    }

    // ---------- cabecera ----------
    const FILA_CABECERA = 4
    const cabecera = hoja.getRow(FILA_CABECERA)
    for (let mes = 1; mes <= 12; mes += 1) {
      cabecera.getCell(columnaConcepto(mes)).value = NOMBRES_MESES[mes - 1]
      cabecera.getCell(columnaImporte(mes)).value = NOMBRES_MESES[mes - 1]
    }
    cabecera.font = { bold: true }

    // ---------- bloque de conceptos y totales ----------
    const numerosDeMes = matriz.meses.map((m) => m.numero)
    let fila = FILA_CABECERA + 1

    for (const linea of matriz.filas) {
      const actual = hoja.getRow(fila)
      actual.getCell(1).value = linea.nombre
      numerosDeMes.forEach((mes, indice) => {
        const valor = linea.valores[indice]
        if (valor !== null) actual.getCell(columnaImporte(mes)).value = valor
      })
      // Total anual y media, en las dos columnas de detras de diciembre.
      actual.getCell(columnaImporte(12) + 1).value = linea.total
      actual.getCell(columnaImporte(12) + 2).value = linea.media
      if (linea.tipo === 'total') actual.font = { bold: true }
      fila += 1
    }

    // ---------- detalle de variables ----------
    const primeraDelDetalle = fila + 2
    for (const [mes, apuntes] of Object.entries(matriz.detalleVariables)) {
      apuntes.forEach((apunte, indice) => {
        const suya = hoja.getRow(primeraDelDetalle + indice)
        suya.getCell(columnaConcepto(Number(mes))).value = apunte.concepto
        suya.getCell(columnaImporte(Number(mes))).value = apunte.importe
      })
    }

    // Formato de moneda espanol en todas las columnas de importe.
    for (let mes = 1; mes <= 12; mes += 1) {
      hoja.getColumn(columnaImporte(mes)).numFmt = '#,##0.00'
    }
    hoja.getColumn(columnaImporte(12) + 1).numFmt = '#,##0.00'
    hoja.getColumn(columnaImporte(12) + 2).numFmt = '#,##0.00'
  }

  if (libro.worksheets.length === 0) libro.addWorksheet('Sin datos')

  return Buffer.from(await libro.xlsx.writeBuffer())
}
