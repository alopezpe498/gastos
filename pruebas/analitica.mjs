// Pruebas de las agregaciones de la analítica.
//
// Lo que más se comprueba aquí no son los totales —que son sumas— sino los
// HUECOS: que un mes sin datos valga null y no cero, que las medias no dividan
// entre meses que no existen, y que comparar años incompletos no invente datos.
// Es donde una analítica miente sin que se note.
import { levantar, crearLlamar, crearComprobador, igualEnCentimos } from './entorno.mjs'

const entorno = await levantar('analitica')
const llamar = crearLlamar(entorno)
const { comprobar, estado } = crearComprobador()

/** Abre un mes y le pone ingreso y presupuesto de comida. */
async function abrirMes(anio, mes, { ingreso = 3000, comida = 0 } = {}) {
  const { datos } = await llamar('/meses', { metodo: 'POST', cuerpo: { anio, mes } })
  await llamar(`/meses/${datos.id}`, {
    metodo: 'PATCH',
    cuerpo: { ingreso, presupuestoComida: comida },
  })
  return datos.id
}

/** Deja el mes con un único gasto fijo del importe que se diga, y nada más. */
async function soloUnFijo(mesId, nombreConcepto, importe) {
  const { datos: mes } = await llamar(`/meses/${mesId}`, { metodo: 'PATCH', cuerpo: {} })
  for (const fijo of mes.fijos) {
    if (fijo.concepto === nombreConcepto) {
      await llamar(`/movimientos/${fijo.id}`, { metodo: 'PATCH', cuerpo: { importe } })
    } else {
      await llamar(`/movimientos/${fijo.id}`, { metodo: 'DELETE' })
    }
  }
}

try {
  const { datos: conceptos } = await llamar('/conceptos')
  const id = (nombre) => conceptos.find((c) => c.nombre === nombre).id

  // -------------------------------------------------------------------------
  console.log('\nSin datos')
  // -------------------------------------------------------------------------
  {
    const { datos } = await llamar('/analitica/rango')
    comprobar(datos.primero === null, 'sin meses, el rango viene vacío')
    comprobar(Array.isArray(datos.agrupaciones) && datos.agrupaciones.length >= 6, 'y aun así trae las agrupaciones')

    const serie = await llamar('/analitica/serie?clave=gastos')
    comprobar(serie.estado === 404, 'pedir una serie sin datos responde 404')
  }

  // -------------------------------------------------------------------------
  console.log('\nMontando el histórico de prueba')
  // -------------------------------------------------------------------------
  // 2024: enero, febrero y marzo. 2025: enero y marzo (falta FEBRERO a propósito).
  const meses = {}
  meses['2024-01'] = await abrirMes(2024, 1, { ingreso: 3000, comida: 400 })
  meses['2024-02'] = await abrirMes(2024, 2, { ingreso: 3000, comida: 400 })
  meses['2024-03'] = await abrirMes(2024, 3, { ingreso: 3000, comida: 400 })
  meses['2025-01'] = await abrirMes(2025, 1, { ingreso: 4000, comida: 500 })
  meses['2025-03'] = await abrirMes(2025, 3, { ingreso: 4000, comida: 500 })

  // Cada mes se queda con un único fijo (Hipoteca), para que las cuentas sean
  // predecibles: gastos = hipoteca + variables + comida.
  await soloUnFijo(meses['2024-01'], 'Hipoteca', 600)
  await soloUnFijo(meses['2024-02'], 'Hipoteca', 600)
  await soloUnFijo(meses['2024-03'], 'Hipoteca', 600)
  await soloUnFijo(meses['2025-01'], 'Hipoteca', 700)
  await soloUnFijo(meses['2025-03'], 'Hipoteca', 700)

  // Un variable solo en algunos meses.
  await llamar('/movimientos', {
    metodo: 'POST',
    cuerpo: { mesId: meses['2024-01'], conceptoId: id('Bar'), importe: 100, fechaCobro: '2024-01-10' },
  })
  await llamar('/movimientos', {
    metodo: 'POST',
    cuerpo: { mesId: meses['2024-03'], conceptoId: id('Bar'), importe: 200, fechaCobro: '2024-03-10' },
  })
  await llamar('/movimientos', {
    metodo: 'POST',
    cuerpo: { mesId: meses['2025-01'], conceptoId: id('Bar'), importe: 300, fechaCobro: '2025-01-10' },
  })

  // -------------------------------------------------------------------------
  console.log('\nRango disponible')
  // -------------------------------------------------------------------------
  {
    const { datos } = await llamar('/analitica/rango')
    comprobar(datos.primero === '2024-01', 'el primer mes es enero de 2024')
    comprobar(datos.ultimo === '2025-03', 'el último es marzo de 2025')
    comprobar(datos.anios.join(',') === '2025,2024', 'los años, del más reciente al más antiguo')
  }

  // -------------------------------------------------------------------------
  console.log('\nSerie: los huecos son huecos, no ceros')
  // -------------------------------------------------------------------------
  {
    const { datos } = await llamar(
      `/analitica/serie?clave=concepto:${id('Bar')}&desde=2024-01&hasta=2025-03`,
    )

    comprobar(datos.puntos.length === 15, 'el eje trae los quince meses del rango')

    const porClave = Object.fromEntries(datos.puntos.map((p) => [p.clave, p.valor]))
    comprobar(igualEnCentimos(porClave['2024-01'], 100), 'enero de 2024 vale 100')
    comprobar(porClave['2024-02'] === null, 'febrero de 2024 existe pero sin Bar: null')
    comprobar(porClave['2024-05'] === null, 'un mes que no existe: null')
    comprobar(porClave['2025-02'] === null, 'el mes que falta de 2025: null')
    comprobar(
      datos.puntos.every((p) => p.valor !== 0 || p.valor === null),
      'ningún hueco se ha convertido en cero',
    )

    comprobar(igualEnCentimos(datos.resumen.total, 600), 'el total son 600', String(datos.resumen.total))
    comprobar(datos.resumen.mesesConDatos === 3, 'solo tres meses tienen Bar')
    comprobar(
      igualEnCentimos(datos.resumen.media, 200),
      'la media divide entre los 3 meses con datos, no entre 15',
      String(datos.resumen.media),
    )
    comprobar(datos.resumen.maximo.valor === 300, 'el máximo es 300')
    comprobar(datos.resumen.minimo.valor === 100, 'el mínimo es 100')
  }

  // -------------------------------------------------------------------------
  console.log('\nSerie: superposición de años con meses que faltan')
  // -------------------------------------------------------------------------
  {
    const { datos } = await llamar('/analitica/serie?clave=gastos&desde=2024-01&hasta=2025-12')

    comprobar(datos.porAnio.length === 2, 'dos años')
    const dosMil24 = datos.porAnio.find((a) => a.anio === 2024)
    const dosMil25 = datos.porAnio.find((a) => a.anio === 2025)

    comprobar(dosMil24.valores.length === 12, 'cada año trae doce posiciones')
    comprobar(
      dosMil24.valores.slice(3).every((v) => v === null),
      'de abril en adelante, 2024 va vacío',
    )
    comprobar(dosMil25.valores[1] === null, 'febrero de 2025 queda en blanco, no en cero')
    comprobar(dosMil25.valores[0] !== null && dosMil25.valores[2] !== null, 'enero y marzo sí tienen')
  }

  // -------------------------------------------------------------------------
  console.log('\nSerie: gastos con las reglas de la casa')
  // -------------------------------------------------------------------------
  {
    const { datos } = await llamar('/analitica/serie?clave=gastos&anio=2024')
    const enero = datos.puntos.find((p) => p.clave === '2024-01')
    // 600 de hipoteca + 100 de bar + 400 de presupuesto de comida.
    comprobar(igualEnCentimos(enero.valor, 1100), 'enero: fijo + variable + presupuesto de comida', String(enero.valor))

    const { datos: sobrante } = await llamar('/analitica/serie?clave=sobrante&anio=2024')
    const eneroSobrante = sobrante.puntos.find((p) => p.clave === '2024-01')
    comprobar(igualEnCentimos(eneroSobrante.valor, 1900), 'el sobrante es 3000 - 1100')
  }

  // -------------------------------------------------------------------------
  console.log('\nComparativa entre años')
  // -------------------------------------------------------------------------
  {
    const { datos } = await llamar('/analitica/comparativa?anios=2024,2025')

    comprobar(datos.anios.join(',') === '2024,2025', 'los dos años, en orden')
    comprobar(datos.totales[2024].meses === 3, '2024 tiene tres meses')
    comprobar(datos.totales[2025].meses === 2, '2025 tiene dos')

    // 2024: 3 x (600 + 400) + 100 + 200 = 3300
    comprobar(igualEnCentimos(datos.totales[2024].gastos, 3300), 'gastos de 2024', String(datos.totales[2024].gastos))
    comprobar(igualEnCentimos(datos.totales[2024].ingresos, 9000), 'ingresos de 2024')
    comprobar(igualEnCentimos(datos.totales[2024].sobrante, 5700), 'sobrante de 2024')

    const bar = datos.filas.find((f) => f.nombre === 'Bar')
    comprobar(igualEnCentimos(bar.totales[2024], 300), 'Bar suma 300 en 2024')
    comprobar(igualEnCentimos(bar.totales[2025], 300), 'y 300 en 2025')
    comprobar(igualEnCentimos(bar.variacion, 0), 'sin variación entre los dos')

    const hipoteca = datos.filas.find((f) => f.nombre === 'Hipoteca')
    comprobar(igualEnCentimos(hipoteca.totales[2024], 1800), 'Hipoteca: 3 x 600 en 2024')
    comprobar(igualEnCentimos(hipoteca.totales[2025], 1400), 'y 2 x 700 en 2025')
    comprobar(
      igualEnCentimos(hipoteca.variacion, -22.22),
      'baja un 22 % en total, aunque el recibo haya subido: hay un mes menos',
      String(hipoteca.variacion),
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nComparativa parcial: mismos meses de cada año')
  // -------------------------------------------------------------------------
  {
    const { datos } = await llamar('/analitica/comparativa?anios=2024,2025&hastaMes=3')
    comprobar(datos.parcial === true, 'se marca como parcial')
    comprobar(datos.hastaMes === 3, 'hasta marzo')
    // Con hastaMes=3 los dos años cuentan lo mismo, salvo que a 2025 le falta
    // febrero de verdad.
    comprobar(datos.totales[2024].meses === 3 && datos.totales[2025].meses === 2, 'los meses que existen de cada uno')

    const conEnero = await llamar('/analitica/comparativa?anios=2024,2025&hastaMes=1')
    const soloEnero = conEnero.datos
    comprobar(soloEnero.totales[2024].meses === 1, 'con hastaMes=1 solo cuenta enero de 2024')
    comprobar(soloEnero.totales[2025].meses === 1, 'y enero de 2025')
    // Enero 2024: 600+100+400 = 1100. Enero 2025: 700+300+500 = 1500.
    comprobar(igualEnCentimos(soloEnero.totales[2024].gastos, 1100), 'gastos de enero de 2024')
    comprobar(igualEnCentimos(soloEnero.totales[2025].gastos, 1500), 'gastos de enero de 2025')

    const mesRaro = await llamar('/analitica/comparativa?anios=2024&hastaMes=99')
    comprobar(mesRaro.datos.hastaMes === 12, 'un mes fuera de rango se ignora')
  }

  // -------------------------------------------------------------------------
  console.log('\nReparto')
  // -------------------------------------------------------------------------
  {
    const { datos } = await llamar('/analitica/reparto?desde=2024-01&hasta=2024-12')

    // 1800 de hipoteca + 300 de bar + 1200 de comida = 3300
    comprobar(igualEnCentimos(datos.total, 3300), 'el total del reparto', String(datos.total))

    const porNombre = Object.fromEntries(datos.porConcepto.map((c) => [c.nombre, c]))
    comprobar(igualEnCentimos(porNombre.Hipoteca.importe, 1800), 'la hipoteca suma 1800')
    comprobar(
      igualEnCentimos(porNombre.Comida.importe, 1200),
      'la comida entra por su presupuesto, no por apuntes',
    )
    comprobar(
      igualEnCentimos(porNombre.Hipoteca.porcentaje, 54.55),
      'y su porcentaje sale sobre el total',
      String(porNombre.Hipoteca.porcentaje),
    )

    const bar = datos.ranking.find((r) => r.nombre === 'Bar')
    comprobar(bar.apuntes === 2, 'Bar tiene dos apuntes en 2024')
    comprobar(igualEnCentimos(bar.ticketMedio, 150), 'y un ticket medio de 150')
    comprobar(
      !datos.ranking.some((r) => r.nombre === 'Hipoteca'),
      'el ranking solo trae variables, no fijos',
    )

    comprobar(datos.evolucion.length === 12, 'la evolución cubre los doce meses del rango')
    comprobar(
      datos.evolucion.slice(3).every((e) => e.necesario === null),
      'los meses sin datos van a null en la evolución',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nEstacionalidad')
  // -------------------------------------------------------------------------
  {
    const { datos } = await llamar('/analitica/estacionalidad?desde=2024-01&hasta=2025-12')

    const bar = datos.filas.find((f) => f.nombre === 'Bar')
    comprobar(bar.medias.length === 12, 'doce meses')
    // Enero: 100 (2024) y 300 (2025) -> media 200.
    comprobar(igualEnCentimos(bar.medias[0], 200), 'enero promedia los dos años', String(bar.medias[0]))
    comprobar(bar.medias[1] === null, 'febrero no tiene Bar en ningún año: null')
    comprobar(igualEnCentimos(bar.medias[2], 200), 'marzo solo tiene 2024: su propia media')

    const enero = datos.totalPorMes[0]
    comprobar(enero.anios.length === 2, 'enero aparece en dos años')
    comprobar(datos.totalPorMes[4].media === null, 'mayo no existe: media null, no cero')
  }

  // -------------------------------------------------------------------------
  console.log('\nAhorro')
  // -------------------------------------------------------------------------
  {
    const { datos } = await llamar('/analitica/ahorro?desde=2024-01&hasta=2024-12')

    comprobar(datos.resumen.mesesConDatos === 3, 'tres meses con datos')
    comprobar(datos.resumen.positivos === 3, 'los tres en positivo')
    comprobar(igualEnCentimos(datos.resumen.total, 5700), 'sobrante total del año')
    comprobar(igualEnCentimos(datos.resumen.media, 1900), 'media entre los 3 meses, no entre 12')

    const conDatos = datos.puntos.filter((p) => p.sobrante !== null)
    comprobar(
      igualEnCentimos(conDatos.at(-1).acumulado, 5700),
      'el acumulado del último mes es el total',
    )
    comprobar(
      datos.puntos.filter((p) => p.sobrante === null).every((p) => p.acumulado === null),
      'un mes sin datos no arrastra acumulado',
    )

    const anio2024 = datos.regla.find((r) => r.anio === 2024)
    comprobar(anio2024.meses === 3, 'la regla cuenta tres meses')
    comprobar(igualEnCentimos(anio2024.ingresos, 9000), 'con 9000 de ingresos')
    // Necesario = hipoteca (necesario) + comida = 1800 + 1200 = 3000 -> 33,33 %
    comprobar(
      igualEnCentimos(anio2024.porcentajes.necesario, 33.33),
      'necesario sobre ingresos del año',
      String(anio2024.porcentajes.necesario),
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nRangos relativos')
  // -------------------------------------------------------------------------
  {
    const { datos } = await llamar('/analitica/serie?clave=gastos&ultimos=3')
    comprobar(datos.puntos.length === 3, '"últimos 3 meses" da tres puntos', String(datos.puntos.length))
    comprobar(datos.puntos.at(-1).clave === '2025-03', 'y acaba en el último mes con datos')

    const { datos: anio } = await llamar('/analitica/serie?clave=gastos&anio=2024')
    comprobar(anio.puntos.length === 12, 'un año da doce puntos aunque falten meses')
    comprobar(anio.rango.desde === '2024-01' && anio.rango.hasta === '2024-12', 'de enero a diciembre')
  }

  // -------------------------------------------------------------------------
  console.log('\nContexto de un mes')
  // -------------------------------------------------------------------------
  {
    const { datos } = await llamar(`/analitica/contexto/${meses['2025-01']}`)

    comprobar(datos.anioAnterior !== null, 'encuentra el mismo mes del año anterior')
    comprobar(datos.anioAnterior.clave === '2024-01', 'que es enero de 2024')
    comprobar(igualEnCentimos(datos.anioAnterior.gastos, 1100), 'con sus 1100 de gastos')
    // Enero 2025 gasta 1500 frente a 1100: +36,36 %.
    comprobar(
      igualEnCentimos(datos.anioAnterior.variacionGastos, 36.36),
      'y la variación sale bien',
      String(datos.anioAnterior.variacionGastos),
    )

    const sinAnterior = await llamar(`/analitica/contexto/${meses['2024-01']}`)
    comprobar(
      sinAnterior.datos.anioAnterior === null,
      'el primer mes del histórico no tiene año anterior',
    )

    const inexistente = await llamar('/analitica/contexto/99999')
    comprobar(inexistente.estado === 404, 'un mes que no existe da 404')
  }

  // -------------------------------------------------------------------------
  console.log('\nErrores')
  // -------------------------------------------------------------------------
  {
    const mala = await llamar('/analitica/serie?clave=loquesea')
    comprobar(mala.estado === 400, 'una clave inventada da 400')

    const conceptoMalo = await llamar('/analitica/serie?clave=concepto:99999')
    comprobar(conceptoMalo.estado === 404, 'un concepto que no existe da 404')

    const anioSinDatos = await llamar('/analitica/comparativa?anios=1999')
    comprobar(anioSinDatos.estado === 400, 'comparar un año sin datos da 400')
  }
} finally {
  await entorno.cerrar()
}

console.log(`\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`)
process.exit(estado.fallos === 0 ? 0 : 1)
