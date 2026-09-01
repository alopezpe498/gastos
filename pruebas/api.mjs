// Pruebas de la API: PIN, catálogo, apertura de mes, apuntes y visión anual.
import { levantar, crearLlamar, crearComprobador, igualEnCentimos, PIN } from './entorno.mjs'

const entorno = await levantar('api')
const llamar = crearLlamar(entorno)
const { comprobar, estado } = crearComprobador()

try {
  // -------------------------------------------------------------------------
  console.log('\nPIN')
  // -------------------------------------------------------------------------
  {
    const sinToken = await fetch(`${entorno.base}/conceptos`)
    comprobar(sinToken.status === 401, 'sin token la API responde 401')

    const malo = await llamar('/auth', { metodo: 'POST', cuerpo: { pin: '0000' }, sinAuth: true })
    comprobar(malo.estado === 401, 'un PIN incorrecto no entra')
    comprobar(
      typeof malo.datos?.error === 'string' && malo.datos.error.includes('intento'),
      'el error dice cuántos intentos quedan',
      malo.datos?.error,
    )

    const bueno = await llamar('/auth', { metodo: 'POST', cuerpo: { pin: PIN }, sinAuth: true })
    comprobar(bueno.estado === 200 && !!bueno.datos.token, 'el PIN correcto devuelve token')
  }

  // -------------------------------------------------------------------------
  console.log('\nCatálogo inicial')
  // -------------------------------------------------------------------------
  {
    const { datos: conceptos } = await llamar('/conceptos')
    comprobar(conceptos.length > 40, `la semilla crea el catálogo (${conceptos.length} conceptos)`)

    const comida = conceptos.find((c) => c.nombre === 'Comida')
    comprobar(comida?.tipo === 'sobre', 'Comida es un sobre')

    const ahorro = conceptos.find((c) => c.nombre === 'Ahorro')
    comprobar(ahorro?.esObjetivo === true, 'Ahorro es el objetivo')
    comprobar(ahorro?.clasificacion === 'ahorro', 'Ahorro está clasificado como ahorro')

    const gimnasio = conceptos.find((c) => c.nombre === 'Gimnasio')
    comprobar(gimnasio?.clasificacion === 'prescindible', 'el gimnasio es prescindible')

    const farmacia = conceptos.find((c) => c.nombre === 'Farmacia')
    comprobar(farmacia?.clasificacion === 'necesario', 'la farmacia es necesaria')
  }

  // -------------------------------------------------------------------------
  console.log('\nConceptos')
  // -------------------------------------------------------------------------
  let idPeaje = null
  {
    const repetido = await llamar('/conceptos', {
      metodo: 'POST',
      cuerpo: { nombre: 'peaje', tipo: 'variable', clasificacion: 'necesario' },
    })
    comprobar(repetido.estado === 400, 'no se puede crear un concepto repetido (ni con otra caja)')

    const nuevo = await llamar('/conceptos', {
      metodo: 'POST',
      cuerpo: { nombre: 'Seguro Coche', tipo: 'fijo', clasificacion: 'necesario', diaPrevisto: '5', importePrevisto: '31,50' },
    })
    comprobar(nuevo.estado === 201, 'se crea un fijo nuevo')
    comprobar(
      igualEnCentimos(nuevo.datos.previstoActual.importePrevisto, 31.5),
      'el importe en formato español se lee bien',
      JSON.stringify(nuevo.datos.previstoActual),
    )

    const { datos: conceptos } = await llamar('/conceptos')
    idPeaje = conceptos.find((c) => c.nombre === 'Peaje').id

    const alias = await llamar(`/conceptos/${idPeaje}/alias`, {
      metodo: 'POST',
      cuerpo: { alias: 'Peajes autopista' },
    })
    comprobar(alias.estado === 200 && alias.datos.length === 1, 'se puede añadir un alias')
  }

  // -------------------------------------------------------------------------
  console.log('\nApertura de mes')
  // -------------------------------------------------------------------------
  let mesEnero = null
  {
    const abierto = await llamar('/meses', { metodo: 'POST', cuerpo: { anio: 2027, mes: 1 } })
    comprobar(abierto.estado === 201, 'se abre enero de 2027')
    mesEnero = abierto.datos

    comprobar(mesEnero.generados > 10, `se generan los fijos (${mesEnero.generados})`)
    comprobar(
      mesEnero.fijos.every((f) => !f.cobrado),
      'todos los fijos nacen pendientes de cobro',
    )
    comprobar(
      !mesEnero.fijos.some((f) => f.concepto === 'Comida' || f.concepto === 'Ahorro'),
      'ni el sobre ni el objetivo generan movimiento',
    )
    comprobar(
      igualEnCentimos(mesEnero.presupuestoComida, 500),
      'el presupuesto de comida sale de la plantilla del sobre',
      `da ${mesEnero.presupuestoComida}`,
    )
    comprobar(mesEnero.dineroEnCuenta === null, 'el dinero en cuenta empieza sin rellenar')
    comprobar(
      mesEnero.fijos[0].diaPrevisto !== null,
      'los fijos llevan copiado su día previsto',
    )

    const repetido = await llamar('/meses', { metodo: 'POST', cuerpo: { anio: 2027, mes: 1 } })
    comprobar(repetido.estado === 409, 'abrir dos veces el mismo mes avisa en vez de duplicar')
  }

  // -------------------------------------------------------------------------
  console.log('\nApuntes')
  // -------------------------------------------------------------------------
  {
    await llamar(`/meses/${mesEnero.id}`, { metodo: 'PATCH', cuerpo: { ingreso: 3000 } })

    const apunte = await llamar('/movimientos', {
      metodo: 'POST',
      cuerpo: { mesId: mesEnero.id, conceptoId: idPeaje, importe: '9,48', fechaCobro: '2027-01-15' },
    })
    comprobar(apunte.estado === 201, 'se apunta un gasto variable')
    comprobar(igualEnCentimos(apunte.datos.importe, 9.48), 'el importe en español se guarda bien')

    const negativo = await llamar('/movimientos', {
      metodo: 'POST',
      cuerpo: { mesId: mesEnero.id, conceptoId: idPeaje, importe: -5, fechaCobro: '2027-01-16' },
    })
    comprobar(igualEnCentimos(negativo.datos.importe, -5), 'se admiten importes negativos')

    const malo = await llamar('/movimientos', {
      metodo: 'POST',
      cuerpo: { mesId: mesEnero.id, conceptoId: idPeaje, importe: 'no soy un número' },
    })
    comprobar(malo.estado === 400, 'un importe ilegible se rechaza')

    const { datos: mes } = await llamar('/meses/2027/1')
    comprobar(igualEnCentimos(mes.resumen.extras, 4.48), 'los extras suman 9,48 - 5', `da ${mes.resumen.extras}`)

    // Cobrar y descobrar un fijo.
    const fijo = mes.fijos[0]
    const cobrado = await llamar(`/movimientos/${fijo.id}/cobro`, { metodo: 'POST', cuerpo: {} })
    comprobar(cobrado.datos.cobrado === true, 'se marca un fijo como cobrado')
    comprobar(!!cobrado.datos.fechaCobro, 'al cobrar se pone la fecha de hoy')

    const descobrado = await llamar(`/movimientos/${fijo.id}/cobro`, { metodo: 'DELETE' })
    comprobar(descobrado.datos.cobrado === false, 'se puede volver a dejar pendiente')

    const conFecha = await llamar(`/movimientos/${fijo.id}/cobro`, {
      metodo: 'POST',
      cuerpo: { fecha: '2027-01-31' },
    })
    comprobar(conFecha.datos.fechaCobro === '2027-01-31', 'se puede cobrar con otra fecha')

    const fechaMala = await llamar(`/movimientos/${fijo.id}/cobro`, {
      metodo: 'POST',
      cuerpo: { fecha: '31/01/2027' },
    })
    comprobar(fechaMala.estado === 400, 'una fecha en otro formato se rechaza')
  }

  // -------------------------------------------------------------------------
  console.log('\nEl desglose de un apunte')
  // -------------------------------------------------------------------------
  //
  // Suscripciones son ocho cargos distintos y el extracto ya los trae
  // separados. La regla que se comprueba aqui es una: **el importe es la suma
  // de las lineas**. Si se pudieran guardar unas lineas que suman 60 en un
  // apunte que dice 45, el mes cuadraria con el numero equivocado.
  {
    const { datos: mesDesglose } = await llamar('/meses/2027/1')
    const fijoDesglose = mesDesglose.fijos[0]

    comprobar(
      Array.isArray(fijoDesglose.detalle) && fijoDesglose.detalle.length === 0,
      'un apunte nace sin desglose',
    )

    const conDesglose = await llamar(`/movimientos/${fijoDesglose.id}`, {
      metodo: 'PATCH',
      cuerpo: {
        detalle: [
          { nombre: 'Netflix', importe: 12.99 },
          { nombre: 'Spotify', importe: '10,99' },
        ],
      },
    })
    comprobar(conDesglose.datos.detalle.length === 2, 'se guardan las dos lineas')
    comprobar(
      igualEnCentimos(conDesglose.datos.importe, 23.98),
      'el importe pasa a ser la suma de las lineas',
      `da ${conDesglose.datos.importe}`,
    )
    comprobar(
      igualEnCentimos(conDesglose.datos.detalle[1].importe, 10.99),
      'los importes en espanol tambien valen dentro del desglose',
    )

    // Lo que se mande como importe se ignora: manda el desglose.
    const conAmbos = await llamar(`/movimientos/${fijoDesglose.id}`, {
      metodo: 'PATCH',
      cuerpo: { importe: 500, detalle: [{ nombre: 'Netflix', importe: 12.99 }] },
    })
    comprobar(
      igualEnCentimos(conAmbos.datos.importe, 12.99),
      'con desglose, un importe suelto no puede contradecirlo',
      `da ${conAmbos.datos.importe}`,
    )

    const sinNombre = await llamar(`/movimientos/${fijoDesglose.id}`, {
      metodo: 'PATCH',
      cuerpo: { detalle: [{ nombre: '  ', importe: 5 }] },
    })
    comprobar(sinNombre.estado === 400, 'una linea sin nombre se rechaza')

    const importeMalo = await llamar(`/movimientos/${fijoDesglose.id}`, {
      metodo: 'PATCH',
      cuerpo: { detalle: [{ nombre: 'Netflix', importe: 'dos euros' }] },
    })
    comprobar(importeMalo.estado === 400, 'una linea con un importe ilegible se rechaza')

    const vaciado = await llamar(`/movimientos/${fijoDesglose.id}`, {
      metodo: 'PATCH',
      cuerpo: { detalle: [] },
    })
    comprobar(vaciado.datos.detalle.length === 0, 'se puede quitar el desglose entero')
    comprobar(
      igualEnCentimos(vaciado.datos.importe, 12.99),
      'y el importe se queda donde estaba, no en cero',
      `da ${vaciado.datos.importe}`,
    )

    const suelto = await llamar(`/movimientos/${fijoDesglose.id}`, {
      metodo: 'PATCH',
      cuerpo: { importe: 40 },
    })
    comprobar(
      igualEnCentimos(suelto.datos.importe, 40),
      'sin desglose, el importe vuelve a escribirse a mano',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nAbrir meses')
  // -------------------------------------------------------------------------
  {
    // Abrir un mes que no existe lo crea, con sus fijos pendientes. Navegar a
    // el no: eso lo hace /por-abrir, mas abajo.
    const febrero = await llamar('/meses/asegurar', {
      metodo: 'POST',
      cuerpo: { anio: 2027, mes: 2 },
    })
    comprobar(febrero.estado === 200, 'se puede ir a un mes que no existia')
    comprobar(febrero.datos.mes === 2 && febrero.datos.anio === 2027, 'y es el que se pidio')
    comprobar(febrero.datos.fijos.length > 10, 'con sus fijos generados')
    comprobar(
      igualEnCentimos(febrero.datos.ingreso, 3000),
      'la nomina se hereda del mes anterior',
      `da ${febrero.datos.ingreso}`,
    )
    comprobar(
      febrero.datos.variables.length === 0,
      'los variables NO se heredan: cada mes empieza en blanco',
    )
    comprobar(febrero.datos.creados.length === 0, 'sin huecos que rellenar, no se crea nada mas')

    const otraVez = await llamar('/meses/asegurar', {
      metodo: 'POST',
      cuerpo: { anio: 2027, mes: 2 },
    })
    comprobar(otraVez.estado === 200, 'pedirlo dos veces no falla')
    comprobar(otraVez.datos.id === febrero.datos.id, 'y devuelve el mismo mes, no otro')

    // Saltar hacia delante rellena el hueco: esos meses existieron.
    const junio = await llamar('/meses/asegurar', {
      metodo: 'POST',
      cuerpo: { anio: 2027, mes: 6 },
    })
    comprobar(junio.datos.mes === 6, 'se puede saltar a junio directamente')
    comprobar(
      junio.datos.creados.map((c) => c.mes).join(',') === '3,4,5',
      'y se crean marzo, abril y mayo de paso',
      JSON.stringify(junio.datos.creados.map((c) => c.mes)),
    )

    const { datos: todos } = await llamar('/meses')
    const de2027 = todos
      .filter((m) => m.anio === 2027)
      .map((m) => m.mes)
      .sort((a, b) => a - b)
    comprobar(de2027.join(',') === '1,2,3,4,5,6', 'quedan los seis meses seguidos', de2027.join(','))

    // Hacia atras NO se rellena: el pasado se importa, no se inventa.
    const viejo = await llamar('/meses/asegurar', {
      metodo: 'POST',
      cuerpo: { anio: 2020, mes: 5 },
    })
    comprobar(viejo.datos.anio === 2020, 'se puede crear un mes suelto del pasado')
    comprobar(viejo.datos.creados.length === 0, 'sin arrastrar los siete años intermedios')

    // Diciembre salta de año al rellenar.
    const enero28 = await llamar('/meses/asegurar', {
      metodo: 'POST',
      cuerpo: { anio: 2028, mes: 1 },
    })
    comprobar(enero28.datos.anio === 2028 && enero28.datos.mes === 1, 'se llega a enero de 2028')
    comprobar(
      enero28.datos.creados.some((c) => c.anio === 2027 && c.mes === 12),
      'y diciembre de 2027 se ha creado de paso',
    )

    const malo = await llamar('/meses/asegurar', { metodo: 'POST', cuerpo: { anio: 2027, mes: 13 } })
    comprobar(malo.estado === 400, 'un mes que no existe en el calendario se rechaza')

    const sinMes = await llamar('/meses/asegurar', { metodo: 'POST', cuerpo: {} })
    comprobar(sinMes.estado === 400, 'sin decir que mes, no se crea nada por si acaso')

    const { datos: limites } = await llamar('/meses/limites')
    comprobar(limites.primero.anio === 2020, 'los limites saben cual es el primer mes')
    comprobar(!!limites.hoy.anio, 'y cual es el mes de hoy')
  }

  // -------------------------------------------------------------------------
  console.log('\nNavegar a un mes sin abrirlo')
  // -------------------------------------------------------------------------
  {
    // Se puede mirar un mes que no existe: la pantalla ofrece abrirlo, pero
    // pasar por delante no debe crear nada a espaldas de nadie.
    const antes = (await llamar('/meses')).datos.length

    const futuro = await llamar('/meses/2029/4')
    comprobar(futuro.estado === 404, 'un mes que no existe da 404 al pedirlo')

    const info = await llamar('/meses/por-abrir/2029/4')
    comprobar(info.estado === 200, 'pero se puede preguntar que pasaria al abrirlo')
    comprobar(
      info.datos.intermedios.length > 0,
      'y dice que meses se crearian de paso',
      JSON.stringify(info.datos.intermedios),
    )

    const despues = (await llamar('/meses')).datos.length
    comprobar(antes === despues, 'preguntar no ha creado ningun mes')

    const yaEsta = await llamar('/meses/por-abrir/2027/1')
    comprobar(yaEsta.datos.existe === true, 'de un mes que ya existe dice que existe')
  }

  // -------------------------------------------------------------------------
  console.log('\nRegenerar desde la plantilla')
  // -------------------------------------------------------------------------
  {
    // Un mes recien abierto, con un fijo cobrado y un variable a mano: la
    // regeneracion tiene que respetar los dos.
    const { datos: mes } = await llamar('/meses/asegurar', {
      metodo: 'POST',
      cuerpo: { anio: 2029, mes: 4 },
    })

    const cobrado = mes.fijos[0]
    await llamar(`/movimientos/${cobrado.id}`, {
      metodo: 'PATCH',
      cuerpo: { fechaCobro: '2029-04-03', importe: '99,99' },
    })
    await llamar('/movimientos', {
      metodo: 'POST',
      cuerpo: { mesId: mes.id, conceptoId: idPeaje, importe: '4,20', fechaCobro: '2029-04-05' },
    })

    // Sube un fijo en la plantilla, con efecto desde ese mismo mes.
    const { datos: catalogo } = await llamar('/conceptos?detalle=1')
    const otroFijo = catalogo.find(
      (c) => c.tipo === 'fijo' && c.activo && c.id !== cobrado.conceptoId,
    )
    await llamar(`/conceptos/${otroFijo.id}/plantilla`, {
      metodo: 'POST',
      cuerpo: { vigenteDesde: '2029-04', importePrevisto: '777,77', diaPrevisto: '9' },
    })
    // Y aparece un fijo nuevo que ese mes todavia no tiene.
    const { datos: recienNacido } = await llamar('/conceptos', {
      metodo: 'POST',
      cuerpo: {
        nombre: 'Seguro Bici',
        tipo: 'fijo',
        clasificacion: 'prescindible',
        diaPrevisto: '20',
        importePrevisto: '12,00',
      },
    })

    const previa = await llamar(`/meses/${mes.id}/regeneracion`)
    comprobar(previa.estado === 200, 'se puede ver antes lo que va a cambiar')
    comprobar(
      previa.datos.anadir.some((a) => a.nombre === 'Seguro Bici'),
      'el fijo nuevo aparece en "se anadiran"',
      JSON.stringify(previa.datos.anadir.map((a) => a.nombre)),
    )
    comprobar(
      previa.datos.actualizar.some((a) => a.conceptoId === otroFijo.id),
      'y el que ha cambiado de importe en "se actualizaran"',
    )
    comprobar(
      !previa.datos.actualizar.some((a) => a.conceptoId === cobrado.conceptoId),
      'lo ya cobrado no se propone tocar',
    )
    comprobar(previa.datos.variables === 1, 'y cuenta el gasto variable que hay que respetar')

    const hecho = await llamar(`/meses/${mes.id}/regenerar`, { metodo: 'POST', cuerpo: {} })
    comprobar(hecho.estado === 200, 'se regenera')
    comprobar(hecho.datos.regeneracion.anadidos === 1, 'se ha anadido el fijo que faltaba')
    comprobar(hecho.datos.regeneracion.actualizados >= 1, 'y actualizado el que cambio')

    const { datos: tras } = await llamar('/meses/2029/4')
    const elCobrado = tras.fijos.find((f) => f.id === cobrado.id)
    comprobar(
      igualEnCentimos(elCobrado.importe, 99.99),
      'el fijo ya cobrado sigue con su importe real',
      `da ${elCobrado.importe}`,
    )
    comprobar(tras.variables.length === 1, 'el gasto variable sigue ahi')
    comprobar(
      tras.fijos.some((f) => f.concepto === 'Seguro Bici'),
      'y el fijo nuevo ya esta en el mes',
    )
    const puesto = tras.fijos.find((f) => f.conceptoId === otroFijo.id)
    comprobar(
      igualEnCentimos(puesto.importe, 777.77) && igualEnCentimos(puesto.importePrevisto, 777.77),
      'el que seguia pendiente se ha puesto al dia, previsto e importe',
      JSON.stringify({ i: puesto.importe, p: puesto.importePrevisto }),
    )

    // Regenerar es idempotente: a la segunda no queda nada por hacer.
    const otraVez = await llamar(`/meses/${mes.id}/regeneracion`)
    comprobar(
      otraVez.datos.anadir.length === 0 && otraVez.datos.actualizar.length === 0,
      'volver a mirar no encuentra nada nuevo',
    )

    // Los valores del mes solo se tocan si se piden.
    await llamar(`/meses/${mes.id}`, { metodo: 'PATCH', cuerpo: { presupuestoComida: '123,00' } })
    const sinPedir = await llamar(`/meses/${mes.id}/regenerar`, { metodo: 'POST', cuerpo: {} })
    comprobar(
      igualEnCentimos(sinPedir.datos.presupuestoComida, 123),
      'regenerar no toca el presupuesto de comida si no se pide',
      `da ${sinPedir.datos.presupuestoComida}`,
    )
    const conComida = await llamar(`/meses/${mes.id}/regenerar`, {
      metodo: 'POST',
      cuerpo: { aplicarComida: true },
    })
    comprobar(
      conComida.datos.regeneracion.valoresAplicados.includes('presupuestoComida'),
      'y si se pide, se aplica el de la plantilla',
      JSON.stringify(conComida.datos.regeneracion.valoresAplicados),
    )

    // La lista de meses abiertos es la que avisa en Conceptos.
    const abiertos = await llamar('/meses/abiertos')
    comprobar(abiertos.estado === 200 && abiertos.datos.length > 0, 'se saben los meses abiertos')
    comprobar(
      abiertos.datos.every((m) => !!m.nombreMes),
      'con su nombre, para poder enlazarlos',
    )

    // Y reiniciar, que es el martillo.
    const sinConfirmar = await llamar(`/meses/${mes.id}/reiniciar`, { metodo: 'POST', cuerpo: {} })
    comprobar(sinConfirmar.estado === 400, 'reiniciar sin confirmar no hace nada')

    await llamar(`/meses/${mes.id}`, { metodo: 'PATCH', cuerpo: { notas: 'esto se queda' } })
    const reinicio = await llamar(`/meses/${mes.id}/reiniciar`, {
      metodo: 'POST',
      cuerpo: { confirmar: true },
    })
    comprobar(reinicio.estado === 200, 'confirmando si se reinicia')
    comprobar(reinicio.datos.reinicio.variablesBorrados === 1, 'y se lleva por delante el variable')
    comprobar(reinicio.datos.variables.length === 0, 'el mes queda sin variables')
    comprobar(
      reinicio.datos.fijos.every((f) => !f.cobrado),
      'y todos los fijos vuelven a nacer pendientes',
    )
    comprobar(reinicio.datos.notas === 'esto se queda', 'las notas del mes se conservan')

    // Un mes cerrado no se toca hasta reabrirlo.
    await llamar(`/meses/${mes.id}`, { metodo: 'PATCH', cuerpo: { estado: 'cerrado' } })
    const bloqueado = await llamar(`/meses/${mes.id}/regenerar`, { metodo: 'POST', cuerpo: {} })
    comprobar(bloqueado.estado === 409, 'un mes cerrado no se regenera')
    const bloqueado2 = await llamar(`/meses/${mes.id}/reiniciar`, {
      metodo: 'POST',
      cuerpo: { confirmar: true },
    })
    comprobar(bloqueado2.estado === 409, 'ni se reinicia')
    await llamar(`/meses/${mes.id}`, { metodo: 'PATCH', cuerpo: { estado: 'abierto' } })
    const desbloqueado = await llamar(`/meses/${mes.id}/regenerar`, { metodo: 'POST', cuerpo: {} })
    comprobar(desbloqueado.estado === 200, 'y al reabrirlo vuelve a poder')

    // Limpieza: este concepto es solo de esta prueba y ensucia los demas meses.
    await llamar(`/conceptos/${recienNacido.id}`, { metodo: 'PATCH', cuerpo: { activo: false } })
  }

  // -------------------------------------------------------------------------
  console.log('\nLa plantilla')
  // -------------------------------------------------------------------------
  {
    // La plantilla se mira siempre desde un mes, porque los importes tienen
    // historico. Sin decir cual, el que viene.
    const suelta = await llamar('/plantilla')
    comprobar(suelta.estado === 200, 'la plantilla se puede pedir sin decir el mes')
    comprobar(/^\d{4}-\d{2}$/.test(suelta.datos.desde), 'y contesta desde que mes la esta ensenando')

    const vista = await llamar('/plantilla?desde=2030-06')
    comprobar(vista.datos.desde === '2030-06', 'o desde el que se le diga')
    comprobar(vista.datos.fijos.length > 5, 'lista los fijos activos')
    comprobar(
      vista.datos.fijos.every((f) => f.tipo === 'fijo' && !f.esObjetivo),
      'solo fijos: ni el sobre ni el objetivo van en la tabla',
    )
    comprobar(!!vista.datos.valores.comida, 'el sobre va aparte, en los valores del mes')
    comprobar(!!vista.datos.valores.ahorro, 'y el objetivo de ahorro tambien')

    const sumaMano = vista.datos.fijos.reduce((t, f) => t + f.importePrevisto, 0)
    comprobar(
      igualEnCentimos(vista.datos.resumen.totalFijos, sumaMano),
      'el total de fijos es la suma de la tabla',
      `${vista.datos.resumen.totalFijos} vs ${sumaMano}`,
    )

    const malo = await llamar('/plantilla?desde=2030-13')
    comprobar(malo.estado === 400, 'un mes que no existe en el calendario se rechaza')

    // ---- los valores del mes ----
    const sinNomina = await llamar('/plantilla/valores', {
      metodo: 'PUT',
      cuerpo: { desde: '2030-06', ingresoPrevisto: null },
    })
    comprobar(sinNomina.datos.valores.ingresoPrevisto === null, 'la nomina prevista se puede vaciar')
    comprobar(
      sinNomina.datos.resumen.sobrante === null,
      'y sin nomina no hay sobrante: null, no cero',
      JSON.stringify(sinNomina.datos.resumen.sobrante),
    )

    const conNomina = await llamar('/plantilla/valores', {
      metodo: 'PUT',
      cuerpo: { desde: '2030-06', ingresoPrevisto: '3.220,00', presupuestoComida: '450,00' },
    })
    comprobar(
      igualEnCentimos(conNomina.datos.valores.ingresoPrevisto, 3220),
      'la nomina en formato espanol se lee bien',
      `da ${conNomina.datos.valores.ingresoPrevisto}`,
    )
    comprobar(
      igualEnCentimos(conNomina.datos.valores.comida.importePrevisto, 450),
      'y el presupuesto de comida se guarda contra el sobre',
    )
    comprobar(
      igualEnCentimos(
        conNomina.datos.resumen.sobrante,
        3220 - conNomina.datos.resumen.totalFijos - 450,
      ),
      'el sobrante es la nomina menos los fijos y menos la comida',
      JSON.stringify(conNomina.datos.resumen),
    )

    const sinMes = await llamar('/plantilla/valores', {
      metodo: 'PUT',
      cuerpo: { ingresoPrevisto: '1000' },
    })
    comprobar(sinMes.estado === 400, 'sin decir desde cuando, no se guarda nada')

    // ---- el historico se conserva ----
    const unFijo = vista.datos.fijos[0]
    const antes = unFijo.importePrevisto
    await llamar(`/conceptos/${unFijo.conceptoId}/plantilla`, {
      metodo: 'POST',
      cuerpo: { vigenteDesde: '2030-06', importePrevisto: '123,45', diaPrevisto: '7' },
    })

    const junio = await llamar('/plantilla?desde=2030-06')
    const enJunio = junio.datos.fijos.find((f) => f.conceptoId === unFijo.conceptoId)
    comprobar(igualEnCentimos(enJunio.importePrevisto, 123.45), 'el importe nuevo vale desde junio')
    comprobar(enJunio.heredado === false, 'y la linea dice que es de ese mismo mes')
    comprobar(enJunio.versiones >= 2, 'sin borrar el anterior: hay dos versiones')

    const mayo = await llamar('/plantilla?desde=2030-05')
    const enMayo = mayo.datos.fijos.find((f) => f.conceptoId === unFijo.conceptoId)
    comprobar(
      igualEnCentimos(enMayo.importePrevisto, antes),
      'el mes anterior sigue con el importe de siempre',
      `da ${enMayo.importePrevisto}, esperaba ${antes}`,
    )
    comprobar(enMayo.heredado === true, 'y se ve que lo arrastra de antes')
  }

  // -------------------------------------------------------------------------
  console.log('\nDe donde sale el importe de un fijo')
  // -------------------------------------------------------------------------
  //
  // Un importe escrito envejece: la luz de enero no es la de julio. Una linea
  // de la plantilla puede decir, en vez de un numero, de que mes copiarlo. El
  // numero escrito se queda como respaldo, y esa es la regla que se comprueba
  // aqui: si no hay dato, se usa el respaldo. Nunca cero.
  {
    const { datos: junio2027 } = await llamar('/meses/2027/6')
    const fijoJunio = junio2027.fijos[1]
    await llamar(`/movimientos/${fijoJunio.id}`, {
      metodo: 'PATCH',
      cuerpo: { importe: 321.5 },
    })

    const conceptoId = fijoJunio.conceptoId
    const ponerCriterio = (criterio, desde = '2027-07') =>
      llamar(`/conceptos/${conceptoId}/plantilla`, {
        metodo: 'POST',
        cuerpo: { vigenteDesde: desde, importePrevisto: 999, diaPrevisto: '5', criterio },
      })

    const porDefecto = await llamar('/plantilla?desde=2027-07')
    const antes = porDefecto.datos.fijos.find((f) => f.conceptoId === conceptoId)
    comprobar(antes.criterio === 'importe', 'una linea de siempre usa su importe escrito')

    await ponerCriterio('mes-anterior')
    const conCriterio = await llamar('/plantilla?desde=2027-07')
    const linea = conCriterio.datos.fijos.find((f) => f.conceptoId === conceptoId)
    comprobar(linea.criterio === 'mes-anterior', 'el criterio se guarda')
    comprobar(
      igualEnCentimos(linea.importePrevisto, 999),
      'el importe escrito sigue estando: es el respaldo',
    )
    comprobar(
      igualEnCentimos(linea.origenImporte.importe, 321.5),
      'pero lo que se usara es lo que costo el mes anterior',
      `da ${linea.origenImporte.importe}`,
    )
    comprobar(linea.origenImporte.deMes === '2027-06', 'y dice de que mes lo copia')
    comprobar(linea.origenImporte.hayDato === true, 'porque ese mes existe y lo tiene')

    // El total de la tabla es el de lo que se usaria, no el de los escritos.
    const suma = conCriterio.datos.fijos.reduce((t, f) => t + f.origenImporte.importe, 0)
    comprobar(
      igualEnCentimos(conCriterio.datos.resumen.totalFijos, suma),
      'el total de fijos suma lo que se usaria de verdad',
    )

    // Abrir el mes lo aplica. Si otra prueba ya lo abrio, se borra: abrir es
    // idempotente y devolveria el mes viejo sin volver a mirar la plantilla.
    const yaEstaba = await llamar('/meses/2027/7')
    if (yaEstaba.estado === 200) {
      await llamar(`/meses/${yaEstaba.datos.id}`, { metodo: 'DELETE', cuerpo: { confirmar: true } })
    }
    const julio = await llamar('/meses/asegurar', { metodo: 'POST', cuerpo: { anio: 2027, mes: 7 } })
    const enJulio = julio.datos.fijos.find((f) => f.conceptoId === conceptoId)
    comprobar(
      igualEnCentimos(enJulio.importe, 321.5),
      'y el mes nace con el importe copiado, no con el escrito',
      `da ${enJulio.importe}`,
    )
    comprobar(!enJulio.cobrado, 'pendiente, como cualquier fijo recien generado')

    // El ano anterior de julio de 2027 es julio de 2026, que no existe.
    await ponerCriterio('ano-anterior')
    const sinDato = await llamar('/plantilla?desde=2027-07')
    const caida = sinDato.datos.fijos.find((f) => f.conceptoId === conceptoId)
    comprobar(caida.origenImporte.deMes === '2026-07', 'el ano anterior mira el mismo mes del ano pasado')
    comprobar(caida.origenImporte.hayDato === false, 'ese mes no existe')
    comprobar(
      igualEnCentimos(caida.origenImporte.importe, 999),
      'asi que se usa el respaldo, no cero',
      `da ${caida.origenImporte.importe}`,
    )

    // Y reiniciar el mes propone lo mismo que abrirlo: misma funcion.
    await ponerCriterio('mes-anterior')
    const { datos: mesJulio } = await llamar('/meses/2027/7')
    await llamar(`/movimientos/${mesJulio.fijos.find((f) => f.conceptoId === conceptoId).id}`, {
      metodo: 'PATCH',
      cuerpo: { importe: 1 },
    })
    const reiniciado = await llamar(`/meses/${mesJulio.id}/reiniciar`, {
      metodo: 'POST',
      cuerpo: { confirmar: true },
    })
    const trasReiniciar = reiniciado.datos.fijos.find((f) => f.conceptoId === conceptoId)
    comprobar(
      igualEnCentimos(trasReiniciar.importe, 321.5),
      'reiniciar el mes vuelve a copiar el mes anterior',
      `da ${trasReiniciar.importe}`,
    )

    const inventado = await llamar(`/conceptos/${conceptoId}/plantilla`, {
      metodo: 'POST',
      cuerpo: { vigenteDesde: '2027-07', importePrevisto: 10, criterio: 'lo-que-sea' },
    })
    comprobar(inventado.estado === 400, 'un criterio inventado se rechaza')

    // Se deja como estaba: las pruebas de despues cuentan con la plantilla normal.
    await ponerCriterio('importe')
  }

  // -------------------------------------------------------------------------
  console.log('\nAbrir el mes siguiente sale de la plantilla')
  // -------------------------------------------------------------------------
  {
    // La plantilla que se acaba de dejar puesta (nomina 3220, comida 450) tiene
    // que ser exactamente lo que aparezca al abrir un mes nuevo.
    const { datos: mayo } = await llamar('/meses/asegurar', {
      metodo: 'POST',
      cuerpo: { anio: 2030, mes: 5 },
    })
    // El mes de partida se deja con otros valores a proposito: si el mes nuevo
    // los copiara de el en vez de la plantilla, se notaria aqui.
    await llamar(`/meses/${mayo.id}`, {
      metodo: 'PATCH',
      cuerpo: { ingreso: '9.999,00', presupuestoComida: '999,00' },
    })

    const junio = await llamar(`/meses/${mayo.id}/siguiente`, { metodo: 'POST' })
    comprobar(junio.estado === 201, 'se abre el mes siguiente')
    comprobar(junio.datos.mes === 6 && junio.datos.anio === 2030, 'y es junio de 2030')
    comprobar(
      igualEnCentimos(junio.datos.ingreso, 3220),
      'el ingreso sale de la nomina prevista, no del mes anterior',
      `da ${junio.datos.ingreso}`,
    )
    comprobar(
      igualEnCentimos(junio.datos.presupuestoComida, 450),
      'y el presupuesto de comida, de la plantilla del sobre',
      `da ${junio.datos.presupuestoComida}`,
    )
    comprobar(
      junio.datos.fijos.every((f) => !f.cobrado),
      'todos los fijos nacen pendientes',
    )

    const { datos: plantillaJunio } = await llamar('/plantilla?desde=2030-06')
    comprobar(
      junio.datos.fijos.length === plantillaJunio.fijos.length,
      'hay un fijo por cada linea de la plantilla',
      `${junio.datos.fijos.length} vs ${plantillaJunio.fijos.length}`,
    )
    comprobar(
      plantillaJunio.fijos.every((linea) => {
        const suyo = junio.datos.fijos.find((f) => f.conceptoId === linea.conceptoId)
        return suyo && igualEnCentimos(suyo.importePrevisto, linea.importePrevisto)
      }),
      'y cada uno con el importe previsto vigente para ese mes',
    )

    const otraVez = await llamar(`/meses/${mayo.id}/siguiente`, { metodo: 'POST' })
    comprobar(otraVez.estado === 409, 'si el mes siguiente ya existe, avisa en vez de callarse')
    comprobar(
      /ya estaba abierto/.test(otraVez.datos.error ?? ''),
      'con un mensaje que se entiende',
      otraVez.datos.error,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nEstado del mes')
  // -------------------------------------------------------------------------
  {
    const cerrado = await llamar(`/meses/${mesEnero.id}`, {
      metodo: 'PATCH',
      cuerpo: { estado: 'cerrado' },
    })
    // Cerrar no congela los apuntes: se siguen pudiendo editar a mano. Lo que
    // bloquea es regenerar y reiniciar, que reescriben el mes en bloque.
    comprobar(cerrado.datos.estado === 'cerrado', 'un mes se puede marcar como cerrado')

    const editado = await llamar(`/meses/${mesEnero.id}`, {
      metodo: 'PATCH',
      cuerpo: { notas: 'sigue editable' },
    })
    comprobar(editado.datos.notas === 'sigue editable', 'y se sigue pudiendo editar igual')

    const invalido = await llamar(`/meses/${mesEnero.id}`, {
      metodo: 'PATCH',
      cuerpo: { estado: 'archivado' },
    })
    comprobar(invalido.estado === 400, 'un estado inventado se rechaza')
  }

  // -------------------------------------------------------------------------
  console.log('\nBorrado de conceptos')
  // -------------------------------------------------------------------------
  {
    const conHistoria = await llamar(`/conceptos/${idPeaje}`, { metodo: 'DELETE' })
    comprobar(conHistoria.estado === 409, 'un concepto con apuntes no se puede borrar')
    comprobar(
      conHistoria.datos.error.includes('Desactivalo') || conHistoria.datos.error.includes('esactí'),
      'el error propone desactivarlo',
      conHistoria.datos.error,
    )

    const { datos: conceptos } = await llamar('/conceptos')
    const virgen = conceptos.find((c) => c.nombre === 'Viajes')
    const borrado = await llamar(`/conceptos/${virgen.id}`, { metodo: 'DELETE' })
    comprobar(borrado.estado === 204, 'un concepto sin apuntes sí se borra')
  }

  // -------------------------------------------------------------------------
  console.log('\nVisión anual')
  // -------------------------------------------------------------------------
  {
    const { datos: anios } = await llamar('/anual')
    comprobar(anios.includes(2027) && anios.includes(2028), 'los años con datos salen ordenados')

    const { datos: anual } = await llamar('/anual/2027')
    // Cuantos hay depende de lo que hayan creado los bloques de arriba: lo que
    // se comprueba es que salgan TODOS los que existen, no un numero fijo.
    const { datos: todosLosMeses } = await llamar('/meses')
    const cuantosDe2027 = todosLosMeses.filter((m) => m.anio === 2027).length
    comprobar(
      anual.meses.length === cuantosDe2027,
      `la tabla anual trae los ${cuantosDe2027} meses de 2027 que existen`,
      `da ${anual.meses.length}`,
    )
    const otros = anual.filas.find((f) => f.nombre === 'Otros')
    comprobar(!!otros, 'hay fila "Otros"')
    comprobar(
      ['Gastos', 'Ingresos', 'Ahorro'].every((n) => anual.filas.some((f) => f.nombre === n)),
      'están las tres filas de totales',
    )

    const vacio = await llamar('/anual/1999')
    comprobar(vacio.estado === 404, 'un año sin datos responde 404')
  }

  // -------------------------------------------------------------------------
  console.log('\nAjustes y exportación')
  // -------------------------------------------------------------------------
  {
    const guardado = await llamar('/config', {
      metodo: 'PUT',
      cuerpo: { comidaEnTotal: 'gastado', ideales: { necesario: 55 } },
    })
    comprobar(guardado.datos.comidaEnTotal === 'gastado', 'se guarda el criterio de la comida')
    comprobar(guardado.datos.ideales.necesario === 55, 'se guardan los porcentajes ideales')

    const malo = await llamar('/config', { metodo: 'PUT', cuerpo: { ideales: { ahorro: 300 } } })
    comprobar(malo.estado === 400, 'un porcentaje fuera de rango se rechaza')

    const criterio = await llamar('/config', { metodo: 'PUT', cuerpo: { comidaEnTotal: 'lo que sea' } })
    comprobar(criterio.estado === 400, 'un criterio de comida inventado se rechaza')

    await llamar('/config', { metodo: 'PUT', cuerpo: { comidaEnTotal: 'presupuesto' } })

    const json = await fetch(`${entorno.base}/exportar/json`, {
      headers: { authorization: `Bearer ${entorno.token}` },
    })
    const copia = await json.json()
    comprobar(json.status === 200, 'la exportación a JSON responde')
    const { datos: mesesDeLaApi } = await llamar('/meses')
    comprobar(
      copia.conceptos.length > 40 && copia.meses.length === mesesDeLaApi.length,
      `el JSON lleva todo (${copia.meses.length} meses y ${copia.conceptos.length} conceptos)`,
    )

    const excel = await fetch(`${entorno.base}/exportar/excel?anio=2027`, {
      headers: { authorization: `Bearer ${entorno.token}` },
    })
    const buffer = Buffer.from(await excel.arrayBuffer())
    comprobar(excel.status === 200 && buffer.length > 5000, `la exportación a Excel devuelve un archivo (${buffer.length} bytes)`)
    comprobar(
      (excel.headers.get('content-disposition') ?? '').includes('Cuentas2027.xlsx'),
      'el archivo se llama como la hoja del año',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nColor de un concepto')
  // -------------------------------------------------------------------------
  {
    const { datos: todos } = await llamar('/conceptos')
    const cualquiera = todos.find((c) => c.tipo === 'variable')

    comprobar(cualquiera.color === null, 'un concepto nace sin color propio')

    const puesto = await llamar(`/conceptos/${cualquiera.id}`, {
      metodo: 'PATCH',
      cuerpo: { color: 'azul' },
    })
    comprobar(puesto.datos?.color === 'azul', 'se le puede poner uno a mano')

    const malo = await llamar(`/conceptos/${cualquiera.id}`, {
      metodo: 'PATCH',
      cuerpo: { color: 'morado' },
    })
    comprobar(malo.estado === 400, 'un color que no existe se rechaza')
    comprobar((malo.datos?.error ?? '').includes('morado'), 'y el error dice cual era')

    const quitado = await llamar(`/conceptos/${cualquiera.id}`, {
      metodo: 'PATCH',
      cuerpo: { color: null },
    })
    comprobar(quitado.datos?.color === null, 'y se puede volver al automatico')

    const otro = await llamar(`/conceptos/${cualquiera.id}`, {
      metodo: 'PATCH',
      cuerpo: { nombre: cualquiera.nombre },
    })
    comprobar(otro.datos?.color === null, 'tocar otra cosa no le inventa un color')

    comprobar(cualquiera.icono === null, 'y tampoco nace con icono propio')
    const conIcono = await llamar(`/conceptos/${cualquiera.id}`, {
      metodo: 'PATCH',
      cuerpo: { icono: 'coche' },
    })
    comprobar(conIcono.datos?.icono === 'coche', 'el icono se elige igual que el color')
    const iconoMalo = await llamar(`/conceptos/${cualquiera.id}`, {
      metodo: 'PATCH',
      cuerpo: { icono: 'dinosaurio' },
    })
    comprobar(iconoMalo.estado === 400, 'un icono que no existe se rechaza')
  }

  // -------------------------------------------------------------------------
  console.log('\nErrores')
  // -------------------------------------------------------------------------
  {
    const inexistente = await llamar('/meses/99999/analisis')
    comprobar(inexistente.estado === 404, 'el análisis de un mes que no existe da 404')

    const rutaMala = await llamar('/no-existe')
    comprobar(rutaMala.estado === 404, 'una ruta desconocida da 404')
    comprobar(typeof rutaMala.datos?.error === 'string', 'y el error viene en castellano')
  }
} finally {
  await entorno.cerrar()
}

console.log(`\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`)
process.exit(estado.fallos === 0 ? 0 : 1)
