import express from 'express'
import * as mesesBd from '../db/meses.js'
import * as movimientosBd from '../db/movimientos.js'
import * as conceptosBd from '../db/conceptos.js'
import * as configBd from '../db/config.js'
import * as calculos from '../services/calculos.js'
import { abrir, abrirSiguienteA, asegurar } from '../services/aperturaMes.js'
import {
  mesesAbiertos,
  regenerar,
  reiniciar,
  borrarMes,
  resumenRegeneracion,
} from '../services/regenerarMes.js'
import { fallo, ruta, enteroDe, importeDe, textoDe } from '../lib/http.js'
import { mesSiguiente, NOMBRES_MESES } from '../lib/fechas.js'

export const rutasMeses = express.Router()

/** El mes entero tal como lo pinta la pantalla principal. */
function montarMes(mes) {
  const ajustes = configBd.ajustes()
  const movimientos = movimientosBd.delMes(mes.id)
  const { fijos, variables } = calculos.separar(movimientos)
  return {
    ...mes,
    nombreMes: NOMBRES_MESES[mes.mes - 1],
    resumen: calculos.resumen(mes, movimientos, ajustes),
    fijos,
    variables,
  }
}

rutasMeses.get(
  '/',
  ruta((req, res) => {
    const ajustes = configBd.ajustes()
    const lista = mesesBd.listar().map((mes) => ({
      ...mes,
      nombreMes: NOMBRES_MESES[mes.mes - 1],
      resumen: calculos.resumen(mes, movimientosBd.delMes(mes.id), ajustes),
    }))
    return res.json(lista)
  }),
)

/** El mes que la aplicacion abre al entrar: el de hoy. */
rutasMeses.get(
  '/actual',
  ruta((req, res) => {
    const mes = mesesBd.masReciente()
    if (!mes) return res.json(null)
    return res.json(montarMes(mes))
  }),
)

/**
 * Abre un mes: lo crea con sus fijos pendientes y lo devuelve montado.
 *
 * Es el boton "Abrir este mes". Si el mes pedido va por delante del ultimo que
 * hay, se crean tambien los que quedaban por medio: si estamos en septiembre y
 * lo ultimo es junio, julio y agosto tambien existieron y sus recibos se
 * cobraron. Se dice cuales en `creados`.
 *
 * Es idempotente: llamarlo sobre un mes que ya existe no duplica nada.
 */
rutasMeses.post(
  '/asegurar',
  ruta((req, res) => {
    const anio = enteroDe(req.body?.anio)
    const numero = enteroDe(req.body?.mes)
    if (!anio || !numero || numero > 12 || anio < 2000 || anio > 2999) {
      return fallo(res, 400, 'Ese mes no se entiende.')
    }

    const resultado = asegurar({ anio, mes: numero })

    return res.json({
      ...montarMes(resultado.mes),
      // Los que se han creado de paso, para poder decirlo en la pantalla.
      creados: resultado.creados.map((c) => ({
        anio: c.anio,
        mes: c.mes,
        nombre: NOMBRES_MESES[c.mes - 1],
      })),
      recortado: resultado.recortado,
    })
  }),
)

/**
 * Que meses habria que crear para llegar hasta uno dado. Lo usa el boton
 * "Abrir este mes" para decir de antemano lo que va a pasar.
 */
rutasMeses.get(
  '/por-abrir/:anio/:mes',
  ruta((req, res) => {
    const anio = enteroDe(req.params.anio)
    const numero = enteroDe(req.params.mes)
    if (!anio || !numero || numero > 12) return fallo(res, 400, 'Ese mes no se entiende.')

    if (mesesBd.porFecha(anio, numero)) return res.json({ existe: true, intermedios: [] })

    const limites = mesesBd.limites()
    const comoNumero = (a, m) => a * 12 + (m - 1)
    const intermedios = []

    if (limites && comoNumero(anio, numero) > comoNumero(limites.ultimo.anio, limites.ultimo.mes)) {
      let actual = mesSiguiente(limites.ultimo.anio, limites.ultimo.mes)
      while (comoNumero(actual.anio, actual.mes) < comoNumero(anio, numero)) {
        intermedios.push({ ...actual, nombre: NOMBRES_MESES[actual.mes - 1] })
        actual = mesSiguiente(actual.anio, actual.mes)
      }
    }

    return res.json({ existe: false, intermedios: intermedios.slice(0, 24) })
  }),
)

/** Los meses abiertos: lo usa el aviso al cambiar una plantilla. */
rutasMeses.get(
  '/abiertos',
  ruta((req, res) =>
    res.json(
      mesesAbiertos().map((m) => ({ ...m, nombreMes: NOMBRES_MESES[m.mes - 1] })),
    ),
  ),
)

/** Hasta donde se puede navegar sin inventarse historia. */
rutasMeses.get(
  '/limites',
  ruta((req, res) => {
    const ahora = new Date()
    return res.json({
      ...(mesesBd.limites() ?? { primero: null, ultimo: null }),
      // Se deja llegar hasta el mes que viene: preparar el siguiente es
      // legitimo, pero abrir 2030 por darle a la flecha no.
      hoy: { anio: ahora.getFullYear(), mes: ahora.getMonth() + 1 },
    })
  }),
)

/*
 * OJO CON EL ORDEN: esta ruta va antes que "/:anio/:mes" a proposito. Express
 * casa por orden de declaracion, asi que con "/:anio/:mes" delante, una llamada
 * a /meses/17/analisis encajaria ahi con mes = "analisis" y devolveria un 404.
 */
rutasMeses.get(
  '/:id/analisis',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const mes = id ? mesesBd.obtener(id) : null
    if (!mes) return fallo(res, 404, 'Ese mes ya no existe.')

    const ajustes = configBd.ajustes()
    const movimientos = movimientosBd.delMes(mes.id)
    const resumen = calculos.resumen(mes, movimientos, ajustes)

    // Si nadie ha configurado los grupos, se usan los tres grandes de siempre.
    const grupos = ajustes.gruposFijos.length ? ajustes.gruposFijos : gruposPorDefecto()

    return res.json({
      mes: { ...mes, nombreMes: NOMBRES_MESES[mes.mes - 1] },
      resumen,
      reparto: calculos.repartoPorTipo(mes, resumen),
      pesoFijos: calculos.pesoDeFijos(movimientos, grupos, resumen.fijos),
      regla: calculos.reglaCincuentaTreintaVeinte(mes, movimientos, ajustes, resumen),
      ranking: calculos.rankingVariables(movimientos),
    })
  }),
)

/** Lo que cambiaria al regenerar, sin tocar nada. */
rutasMeses.get(
  '/:id/regeneracion',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const resumen = id ? resumenRegeneracion(id) : null
    if (!resumen) return fallo(res, 404, 'Ese mes ya no existe.')
    return res.json(resumen)
  }),
)

rutasMeses.get(
  '/:anio/:mes',
  ruta((req, res) => {
    const anio = enteroDe(req.params.anio)
    const numero = enteroDe(req.params.mes)
    if (!anio || !numero || numero > 12) return fallo(res, 404, 'Ese mes no existe.')
    const mes = mesesBd.porFecha(anio, numero)
    if (!mes) return fallo(res, 404, 'Ese mes todavia no esta abierto.')
    return res.json(montarMes(mes))
  }),
)

rutasMeses.post(
  '/',
  ruta((req, res) => {
    const anio = enteroDe(req.body?.anio)
    const numero = enteroDe(req.body?.mes)
    if (!anio || !numero || numero > 12) return fallo(res, 400, 'Falta el mes que hay que abrir.')

    const { mes, creado, generados } = abrir({ anio, mes: numero })
    if (!creado) {
      return fallo(
        res,
        409,
        `${NOMBRES_MESES[numero - 1]} de ${anio} ya estaba abierto: se abrio el ` +
          `${new Date(mes.fechaApertura).toLocaleDateString('es-ES')}.`,
      )
    }
    return res.status(201).json({ ...montarMes(mes), generados })
  }),
)

/** Atajo: abre el mes que va detras de este. */
rutasMeses.post(
  '/:id/siguiente',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const actual = id ? mesesBd.obtener(id) : null
    if (!actual) return fallo(res, 404, 'Ese mes ya no existe.')

    const { mes, creado, generados } = abrirSiguienteA(actual)
    if (!creado) {
      const siguiente = mesSiguiente(actual.anio, actual.mes)
      return fallo(
        res,
        409,
        `${NOMBRES_MESES[siguiente.mes - 1]} de ${siguiente.anio} ya estaba abierto.`,
      )
    }
    return res.status(201).json({ ...montarMes(mes), generados })
  }),
)

// ---------------------------------------------------------------------------
// Regenerar y reiniciar
// ---------------------------------------------------------------------------

/**
 * Un mes cerrado esta congelado a proposito: regenerarlo o reiniciarlo
 * cambiaria cuentas que ya se dieron por buenas. Hay que reabrirlo antes.
 */
function exigirAbierto(res, mes) {
  if (mes.estado !== 'abierto') {
    fallo(
      res,
      409,
      `${NOMBRES_MESES[mes.mes - 1]} de ${mes.anio} esta cerrado. Reabrelo antes de tocarlo.`,
    )
    return false
  }
  return true
}

rutasMeses.post(
  '/:id/regenerar',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const mes = id ? mesesBd.obtener(id) : null
    if (!mes) return fallo(res, 404, 'Ese mes ya no existe.')
    if (!exigirAbierto(res, mes)) return undefined

    const resultado = regenerar(id, {
      aplicarIngreso: !!req.body?.aplicarIngreso,
      aplicarComida: !!req.body?.aplicarComida,
      aplicarAhorro: !!req.body?.aplicarAhorro,
    })
    return res.json({ ...montarMes(mesesBd.obtener(id)), regeneracion: resultado })
  }),
)

rutasMeses.post(
  '/:id/reiniciar',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const mes = id ? mesesBd.obtener(id) : null
    if (!mes) return fallo(res, 404, 'Ese mes ya no existe.')
    if (!exigirAbierto(res, mes)) return undefined

    // Una segunda llave, ademas de la doble confirmacion de la pantalla: esto
    // borra datos y no debe poder dispararse por una llamada suelta.
    if (req.body?.confirmar !== true) {
      return fallo(res, 400, 'Falta confirmar el reinicio del mes.')
    }

    const resultado = reiniciar(id)
    return res.json({ ...montarMes(mesesBd.obtener(id)), reinicio: resultado })
  }),
)

/**
 * Borra un mes entero. Exige confirmar, como reiniciar: no hay vuelta atras.
 *
 * Se permite aunque este cerrado: borrar un mes cerrado es justo lo que se
 * quiere cuando se ha importado en el sitio equivocado.
 */
rutasMeses.delete(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    const mes = id ? mesesBd.obtener(id) : null
    if (!mes) return fallo(res, 404, 'Ese mes ya no existe.')
    if (req.body?.confirmar !== true) {
      return fallo(res, 400, 'Borrar un mes entero hay que confirmarlo.')
    }
    const r = borrarMes(id)
    return res.json({ ...r, nombreMes: NOMBRES_MESES[r.mes - 1] })
  }),
)

rutasMeses.patch(
  '/:id',
  ruta((req, res) => {
    const id = enteroDe(req.params.id)
    if (!id || !mesesBd.obtener(id)) return fallo(res, 404, 'Ese mes ya no existe.')

    const cambios = {}
    const numero = (campo) => {
      const valor = importeDe(req.body[campo])
      if (valor === null) return `El valor de ${campo} no se entiende.`
      cambios[campo] = valor
      return null
    }

    for (const campo of ['ingreso', 'presupuestoComida', 'objetivoAhorro']) {
      if (req.body?.[campo] !== undefined) {
        const error = numero(campo)
        if (error) return fallo(res, 400, error)
      }
    }

    if (req.body?.dineroEnCuenta !== undefined) {
      // Vaciar el campo lo deja en null: "todavia no he mirado el banco".
      if (req.body.dineroEnCuenta === null || req.body.dineroEnCuenta === '') {
        cambios.dineroEnCuenta = null
      } else {
        const valor = importeDe(req.body.dineroEnCuenta)
        if (valor === null) return fallo(res, 400, 'El dinero en cuenta no se entiende.')
        cambios.dineroEnCuenta = valor
      }
    }

    if (req.body?.notas !== undefined) cambios.notas = textoDe(req.body.notas, { max: 4000 })

    if (req.body?.estado !== undefined) {
      if (req.body.estado !== 'abierto' && req.body.estado !== 'cerrado') {
        return fallo(res, 400, 'Un mes solo puede estar abierto o cerrado.')
      }
      cambios.estado = req.body.estado
    }

    return res.json(montarMes(mesesBd.actualizar(id, cambios)))
  }),
)

/**
 * Los tres grandes del Excel: la hipoteca, los suministros con los seguros, y
 * las niñas. Se resuelven por nombre porque los ids cambian de instalacion a
 * instalacion; en cuanto se tocan en Ajustes, mandan los grupos guardados.
 */
function gruposPorDefecto() {
  const buscar = (nombres) =>
    nombres.map((n) => conceptosBd.buscarPorNombre(n)?.id).filter((id) => id !== undefined)

  return [
    { nombre: 'Hipoteca', conceptos: buscar(['Hipoteca']) },
    {
      nombre: 'Luz, agua, gas y seguros',
      conceptos: buscar(['Luz/Gas/Agua/IBI', 'Seguro Casa', 'Seguro Vida', 'Comunidad']),
    },
    { nombre: 'Niñas', conceptos: buscar(['Gastos Niñas']) },
  ]
}
