// Pruebas del detalle de la compra: leer un ticket, cuadrarlo y explotarlo.
//
// Contra la IA SIMULADA, como el resto del modulo: lo que se prueba no es que
// un modelo acierte, sino que la tuberia entera —prompt, validacion, asignacion,
// cuadre, guardado y agregaciones— haga lo que dice. Un modelo contesta hoy una
// cosa y manana otra; estas comprobaciones tienen que valer siempre.
//
// El ticket de ejemplo esta en catalan, con lineas por peso, marcas metidas en
// el nombre y un descuento negativo, porque es lo que trae uno de verdad.
import { levantar, crearLlamar, crearComprobador, igualEnCentimos } from './entorno.mjs'
import { levantarIaFalsa } from './mock-ia.mjs'
import { comoRespuestaDeIa, comoTexto, ESPERADO, TOTAL } from './fixtures/ticketEjemplo.mjs'

const ia = await levantarIaFalsa({ responder: () => comoRespuestaDeIa() })
const entorno = await levantar('tickets', { OPENAI_BASE_URL: ia.base })
const llamar = crearLlamar(entorno)
const { comprobar, estado } = crearComprobador()

/** El mes con el que se trabaja: octubre, que es el que se esta probando. */
const ANIO = 2026
const MES = 10

try {
  await llamar('/config/ia', {
    metodo: 'PUT',
    cuerpo: { proveedor: 'openai', clave: 'sk-de-mentira', modelo: 'gpt-4o-mini' },
  })
  const { datos: mes } = await llamar('/meses/asegurar', {
    metodo: 'POST',
    cuerpo: { anio: ANIO, mes: MES },
  })

  // -------------------------------------------------------------------------
  console.log('\nEl catalogo nace con sus categorias')
  // -------------------------------------------------------------------------
  {
    const { datos: categorias } = await llamar('/categorias-producto')
    comprobar(categorias.length === 14, 'catorce categorias de semilla', String(categorias.length))
    comprobar(
      categorias.some((c) => c.nombre === 'Carne y charcutería'),
      'con las de comida',
    )
    comprobar(
      categorias.some((c) => c.nombre === 'Limpieza') &&
        categorias.some((c) => c.nombre === 'Mascotas'),
      'y con lo que se compra en el super sin ser comida',
    )

    const { datos: productos } = await llamar('/productos')
    comprobar(
      productos.some((p) => p.nombre === 'Otros'),
      'y existe «Otros» desde el primer momento: es donde cae lo que no se decide hoy',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nLeer el ticket')
  // -------------------------------------------------------------------------
  let propuesta = null
  {
    const r = await llamar('/tickets', {
      metodo: 'POST',
      cuerpo: { mesId: mes.id, texto: comoTexto() },
    })
    comprobar(r.estado === 200, 'se lee el ticket', JSON.stringify(r.datos?.error ?? ''))
    propuesta = r.datos

    comprobar(propuesta.lineas.length === ESPERADO.lineas, `salen las ${ESPERADO.lineas} lineas`, String(propuesta.lineas.length))
    comprobar(igualEnCentimos(propuesta.cabecera.total, TOTAL), 'con el total del ticket')
    comprobar(propuesta.cabecera.tienda === ESPERADO.tienda, 'y la tienda')
    comprobar(propuesta.cabecera.ultimos4 === '4010', 'y los cuatro ultimos de la tarjeta')
    comprobar(
      igualEnCentimos(propuesta.cuadre.suma, TOTAL),
      'las lineas suman el total',
      `da ${propuesta.cuadre.suma}`,
    )
    comprobar(propuesta.cuadre.cuadra, 'asi que cuadra')

    const porPeso = propuesta.lineas.find((l) => l.textoTicket === 'COLIFLOR')
    comprobar(porPeso?.unidad === 'kg', 'una linea por peso guarda su unidad')
    comprobar(igualEnCentimos(porPeso?.cantidad, 1.252), 'y su cantidad con los tres decimales')
    comprobar(igualEnCentimos(porPeso?.precioUnitario, 2.5), 'y el precio por kilo')

    const descuento = propuesta.lineas.find((l) => l.textoTicket === 'DTE. XEC CREUAT')
    comprobar(descuento?.importe < 0, 'un descuento es una linea en negativo, no una resta')

    // Nada de esto ha tocado la base todavia.
    const { datos: sinNada } = await llamar(`/meses/${ANIO}/${MES}`)
    comprobar(sinNada.variables.length === 0, 'leer el ticket NO escribe nada')
  }

  // -------------------------------------------------------------------------
  console.log('\nLa IA propone, pero no decide')
  // -------------------------------------------------------------------------
  {
    const conPropuesta = propuesta.lineas.filter((l) => l.origenAsignacion === 'ia')
    comprobar(conPropuesta.length > 0, 'la IA propone producto y categoria', String(conPropuesta.length))
    comprobar(
      conPropuesta.every((l) => l.varianteId === null),
      'pero ninguna linea queda asignada sola',
    )
    comprobar(
      conPropuesta.every((l) => l.dudosa),
      'todas quedan marcadas para revisar',
    )
    comprobar(
      !propuesta.cuadre.sePuedeAceptar && propuesta.cuadre.sinAsignar === ESPERADO.lineas,
      'y por eso todavia no se puede aceptar',
      JSON.stringify(propuesta.cuadre.problemas),
    )

    const marca = propuesta.lineas.find((l) => l.textoTicket === 'PETIT NESQUICK')
    comprobar(marca?.propuesta?.marca === 'Nesquik', 'la marca va en su campo, fuera del nombre')
    comprobar(marca?.propuesta?.variante === 'Petit suisse', 'y la variante va sin marca')

    const catalan = propuesta.lineas.find((l) => l.textoTicket === 'PIT 2 U.')
    comprobar(catalan?.propuesta?.producto === 'Pollo', 'el catalan se normaliza a castellano')
    comprobar(
      catalan?.propuesta?.categoriaId !== null,
      'y la categoria se valida contra el catalogo de verdad',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nNo se guarda un ticket que no cuadra')
  // -------------------------------------------------------------------------
  {
    const conVariante = (lineas) => lineas.map((l) => ({ ...l, varianteId: 1 }))

    const descuadrado = await llamar('/tickets/aceptar', {
      metodo: 'POST',
      cuerpo: {
        mesId: mes.id,
        cabecera: { ...propuesta.cabecera, total: TOTAL + 10 },
        lineas: conVariante(propuesta.lineas),
      },
    })
    comprobar(descuadrado.estado === 400, 'con las lineas sin cuadrar, no se acepta')
    comprobar(
      (descuadrado.datos?.detalle ?? []).some((d) => d.includes('faltan')),
      'y el error dice cuanto falta',
      JSON.stringify(descuadrado.datos?.detalle),
    )

    const sinAsignar = await llamar('/tickets/aceptar', {
      metodo: 'POST',
      cuerpo: { mesId: mes.id, cabecera: propuesta.cabecera, lineas: propuesta.lineas },
    })
    comprobar(sinAsignar.estado === 400, 'con lineas sin asignar, tampoco')
    comprobar(
      (sinAsignar.datos?.detalle ?? []).some((d) => d.includes('sin asignar')),
      'y lo dice por su nombre',
      JSON.stringify(sinAsignar.datos?.detalle),
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nGuardar el ticket entero')
  // -------------------------------------------------------------------------
  let ticketId = null
  {
    /*
     * Se aceptan las propuestas de la IA tal cual, que es lo que hace la
     * pantalla cuando se revisan y se dan por buenas: cada linea manda el
     * nombre del producto y de la variante, y el servidor los crea.
     */
    const lineas = propuesta.lineas.map((l) => ({
      ...l,
      varianteNueva: l.propuesta?.variante ?? 'Sin clasificar',
      productoNuevo: l.propuesta?.producto ?? 'Otros',
      categoriaId: l.propuesta?.categoriaId ?? null,
      marca: l.propuesta?.marca ?? null,
      // Solo una se manda a recordar: la memoria la escribe una persona.
      recordar: l.textoTicket === 'PIT 2 U.',
    }))

    const r = await llamar('/tickets/aceptar', {
      metodo: 'POST',
      cuerpo: {
        mesId: mes.id,
        cabecera: propuesta.cabecera,
        lineas,
        origen: 'portapapeles',
      },
    })
    comprobar(r.estado === 201, 'se guarda', JSON.stringify(r.datos?.detalle ?? r.datos?.error ?? ''))
    ticketId = r.datos.ticketId

    comprobar(r.datos.lineas === ESPERADO.lineas, `con sus ${ESPERADO.lineas} lineas`)
    comprobar(r.datos.movimientoCreado === true, 'y crea el apunte de comida')
    comprobar(r.datos.alias === 1, 'y un solo alias: el que se marco para recordar')

    const { datos: delMes } = await llamar(`/meses/${ANIO}/${MES}`)
    const comida = delMes.variables.filter((m) => m.tipo === 'sobre')
    comprobar(comida.length === 1, 'UN movimiento por ticket, no cuarenta y cinco', String(comida.length))
    comprobar(
      igualEnCentimos(comida[0]?.importe, TOTAL),
      'con el total del ticket',
      `da ${comida[0]?.importe}`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nEl ticket guardado se puede mirar por dentro')
  // -------------------------------------------------------------------------
  {
    const { datos: ticket } = await llamar(`/tickets/${ticketId}`)
    comprobar(ticket.lineas.length === ESPERADO.lineas, 'estan todas las lineas')
    comprobar(
      ticket.lineas.every((l) => l.variante && l.producto && l.categoria),
      'cada una con su variante, su producto y su categoria',
    )

    const suma = ticket.lineas.reduce((t, l) => t + l.importe, 0)
    comprobar(igualEnCentimos(suma, TOTAL), 'y siguen sumando el total', String(suma))

    const carne = ticket.reparto.find((r) => r.categoria === 'Carne y charcutería')
    comprobar(carne && carne.importe > 20, 'el reparto por categoria sale del propio ticket', JSON.stringify(carne))

    // El endpoint de solo lectura para las otras apps.
    const { datos: paraFuera } = await llamar(`/tickets/${ticketId}/lineas`)
    comprobar(paraFuera.lineas.length === ESPERADO.lineas, 'el endpoint de solo lectura las devuelve')
    comprobar(
      paraFuera.lineas.every((l) => 'producto' in l && 'cantidad' in l && 'unidad' in l),
      'con producto, cantidad y unidad, que es lo que necesita la lista de la compra',
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nLa memoria: la segunda vez no hace falta la IA')
  // -------------------------------------------------------------------------
  {
    const segunda = await llamar('/tickets', {
      metodo: 'POST',
      cuerpo: { mesId: mes.id, texto: comoTexto() },
    })
    const pit = segunda.datos.lineas.find((l) => l.textoTicket === 'PIT 2 U.')
    comprobar(pit?.origenAsignacion === 'alias', 'el texto que se recordo ya viene asignado')
    comprobar(pit?.varianteId !== null, 'y con su variante puesta')
    comprobar(pit?.dudosa === false, 'sin pedir que se revise: lo dije yo')

    const otra = segunda.datos.lineas.find((l) => l.textoTicket === 'CUIXA DESOSSADO')
    comprobar(otra?.origenAsignacion === 'ia', 'lo que no se recordo sigue viniendo de la IA')
    comprobar(otra?.dudosa === true, 'y sigue pidiendo un vistazo')
  }

  // -------------------------------------------------------------------------
  console.log('\nSe adjunta al apunte que ya estaba, en vez de duplicarlo')
  // -------------------------------------------------------------------------
  {
    /*
     * El caso de verdad: el extracto del banco ya creo el apunte de MERCADONA
     * dias antes, y ahora llega la foto del ticket. Sin esto, la compra
     * quedaria apuntada dos veces.
     */
    const { datos: conceptos } = await llamar('/conceptos')
    const sobre = conceptos.find((c) => c.tipo === 'sobre')
    const { datos: yaEstaba } = await llamar('/movimientos', {
      metodo: 'POST',
      cuerpo: {
        mesId: mes.id,
        conceptoId: sobre.id,
        importe: 88.4,
        descripcion: 'MERCADONA',
        fechaCobro: `${ANIO}-${MES}-16`,
      },
    })

    const respuesta = comoRespuestaDeIa()
    respuesta.total = 88.4
    respuesta.lineas = [
      { ...respuesta.lineas[0], importe: 88.4, precioUnitario: 44.2, cantidad: 2 },
    ]
    ia.cambiarRespuesta(() => respuesta)

    const r = await llamar('/tickets', {
      metodo: 'POST',
      cuerpo: { mesId: mes.id, texto: 'da igual: contesta el simulador' },
    })
    comprobar(!!r.datos.coincidencia, 'encuentra el apunte que ya estaba')
    comprobar(
      r.datos.coincidencia?.movimiento?.id === yaEstaba.id,
      'y es justo ese',
      JSON.stringify(r.datos.coincidencia?.movimiento?.id),
    )

    const antes = (await llamar(`/meses/${ANIO}/${MES}`)).datos.variables.length
    const guardado = await llamar('/tickets/aceptar', {
      metodo: 'POST',
      cuerpo: {
        mesId: mes.id,
        movimientoId: yaEstaba.id,
        cabecera: r.datos.cabecera,
        lineas: r.datos.lineas.map((l) => ({
          ...l,
          varianteNueva: l.propuesta?.variante,
          productoNuevo: l.propuesta?.producto,
          categoriaId: l.propuesta?.categoriaId,
        })),
      },
    })
    comprobar(guardado.datos.movimientoCreado === false, 'al aceptar NO crea otro apunte')

    const despues = (await llamar(`/meses/${ANIO}/${MES}`)).datos.variables.length
    comprobar(despues === antes, 'el mes sigue teniendo los mismos apuntes', `${antes} → ${despues}`)

    // Y deshacerlo deja el apunte del banco donde estaba.
    const borrado = await llamar(`/tickets/${guardado.datos.ticketId}`, { metodo: 'DELETE' })
    comprobar(borrado.estado === 200, 'el ticket se puede deshacer')
    const trasDeshacer = (await llamar(`/meses/${ANIO}/${MES}`)).datos.variables.length
    comprobar(
      trasDeshacer === antes,
      'y el apunte que trajo el banco se queda: no es nuestro para borrarlo',
      `${trasDeshacer}`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nEn que se va la compra')
  // -------------------------------------------------------------------------
  {
    const { datos: reparto } = await llamar(`/analitica/compra/reparto?desde=${ANIO}-${MES}&hasta=${ANIO}-${MES}`)
    comprobar(reparto.tickets >= 1, 'hay tickets en el rango', String(reparto.tickets))
    comprobar(reparto.categorias.length > 5, 'y el gasto se reparte por categoria', String(reparto.categorias.length))

    const carne = reparto.categorias.find((c) => c.nombre === 'Carne y charcutería')
    comprobar(carne && carne.total > 20, 'la carne es de lo que mas pesa', JSON.stringify(carne))
    comprobar(
      carne.parte > 0 && carne.parte < 1,
      'y se sabe que parte del total es',
      String(carne.parte),
    )

    const { datos: productos } = await llamar(
      `/analitica/compra/productos?desde=${ANIO}-${MES}&hasta=${ANIO}-${MES}`,
    )
    const pollo = productos.find((p) => p.nombre === 'Pollo')
    comprobar(!!pollo, 'se puede preguntar cuanto se gasta en pollo')
    comprobar(igualEnCentimos(pollo.total, 12.8), 'y suma sus dos variantes', String(pollo.total))

    const { datos: ficha } = await llamar(
      `/analitica/compra/producto/${pollo.id}?desde=${ANIO}-${MES}&hasta=${ANIO}-${MES}`,
    )
    comprobar(ficha.variantes.length === 2, 'la ficha enseña sus variantes', String(ficha.variantes.length))
    comprobar(ficha.detalle.length >= 2, 'y cada compra, con su precio y su tienda')
    comprobar(
      ficha.detalle.every((d) => d.tienda === ESPERADO.tienda),
      'sabiendo de que tienda salio cada una',
    )

    const { datos: busqueda } = await llamar(
      `/analitica/compra/buscar?q=pollo&desde=${ANIO}-${MES}&hasta=${ANIO}-${MES}`,
    )
    comprobar(busqueda.length >= 1, 'y se busca escribiendo «pollo»', String(busqueda.length))

    const { datos: tiendas } = await llamar(
      `/analitica/compra/tiendas?desde=${ANIO}-${MES}&hasta=${ANIO}-${MES}`,
    )
    comprobar(tiendas[0]?.tienda === ESPERADO.tienda, 'las tiendas, con su ticket medio')
    comprobar(tiendas[0]?.ticketMedio > 0, 'que es el gasto entre los tickets')

    const { datos: mesResumen } = await llamar(`/analitica/compra/mes/${mes.id}`)
    comprobar(mesResumen.tickets >= 1, 'y el resumen del mes, para el tile de Comida')
    comprobar(
      mesResumen.principales.length === 3,
      'con sus tres categorias principales',
      JSON.stringify(mesResumen.principales.map((p) => p.categoria)),
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nFusionar dos productos no pierde historial')
  // -------------------------------------------------------------------------
  {
    const { datos: productos } = await llamar('/productos')
    const pollo = productos.find((p) => p.nombre === 'Pollo')
    const cerdo = productos.find((p) => p.nombre === 'Cerdo')

    const { datos: antes } = await llamar(
      `/analitica/compra/producto/${pollo.id}?desde=${ANIO}-${MES}&hasta=${ANIO}-${MES}`,
    )
    const { datos: delOtro } = await llamar(
      `/analitica/compra/producto/${cerdo.id}?desde=${ANIO}-${MES}&hasta=${ANIO}-${MES}`,
    )

    const r = await llamar('/productos/fusionar', {
      metodo: 'POST',
      cuerpo: { seVa: cerdo.id, seQueda: pollo.id },
    })
    comprobar(r.estado === 200, 'se fusionan dos productos')

    const { datos: despues } = await llamar(
      `/analitica/compra/producto/${pollo.id}?desde=${ANIO}-${MES}&hasta=${ANIO}-${MES}`,
    )
    comprobar(
      igualEnCentimos(despues.total, antes.total + delOtro.total),
      'y el que se queda hereda el gasto de los dos',
      `${antes.total} + ${delOtro.total} = ${despues.total}`,
    )

    const { estado: codigo } = await llamar(
      `/analitica/compra/producto/${cerdo.id}?desde=${ANIO}-${MES}&hasta=${ANIO}-${MES}`,
    )
    comprobar(codigo === 404, 'el duplicado desaparece')
  }

  // -------------------------------------------------------------------------
  console.log('\nMover un producto de categoria recalcula el pasado')
  // -------------------------------------------------------------------------
  {
    const { datos: productos } = await llamar('/productos')
    const { datos: categorias } = await llamar('/categorias-producto')
    const pollo = productos.find((p) => p.nombre === 'Pollo')
    const otros = categorias.find((c) => c.nombre === 'Otros')

    const { datos: antes } = await llamar(
      `/analitica/compra/reparto?desde=${ANIO}-${MES}&hasta=${ANIO}-${MES}`,
    )
    const carneAntes = antes.categorias.find((c) => c.nombre === 'Carne y charcutería')?.total ?? 0

    await llamar(`/productos/${pollo.id}`, { metodo: 'PATCH', cuerpo: { categoriaId: otros.id } })

    const { datos: despues } = await llamar(
      `/analitica/compra/reparto?desde=${ANIO}-${MES}&hasta=${ANIO}-${MES}`,
    )
    const carneDespues = despues.categorias.find((c) => c.nombre === 'Carne y charcutería')?.total ?? 0
    comprobar(
      carneDespues < carneAntes,
      'cambiar la categoria de hoy cambia tambien lo de antes: no se toca ninguna linea',
      `${carneAntes} → ${carneDespues}`,
    )
  }

  // -------------------------------------------------------------------------
  console.log('\nDeshacer del todo')
  // -------------------------------------------------------------------------
  {
    const antes = (await llamar(`/meses/${ANIO}/${MES}`)).datos.variables.length
    const r = await llamar(`/tickets/${ticketId}`, {
      metodo: 'DELETE',
      cuerpo: { borrarMovimiento: true },
    })
    comprobar(r.datos.lineas === ESPERADO.lineas, 'se van las lineas', String(r.datos.lineas))
    comprobar(r.datos.movimientoBorrado === true, 'y el apunte que creo el ticket')

    const despues = (await llamar(`/meses/${ANIO}/${MES}`)).datos.variables.length
    comprobar(despues === antes - 1, 'el mes se queda como estaba', `${antes} → ${despues}`)

    const { estado: codigo } = await llamar(`/tickets/${ticketId}`)
    comprobar(codigo === 404, 'y el ticket ya no existe')
  }
} finally {
  await entorno.cerrar()
  await ia.cerrar()
}

console.log(
  `\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`,
)
process.exit(estado.fallos === 0 ? 0 : 1)
