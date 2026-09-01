import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { MesCompleto, OrigenImporte, ResumenRegeneracion, ValorPlantilla } from '../../lib/tipos'
import { cuantos, euros } from '../../lib/formato'
import { BotonTexto, Chip, Interruptor } from '../../components/ui/Basicos'
import { CampoImporte } from '../../components/ui/Campos'
import { AccionDialogo, ConfirmacionDialogo, Dialogo } from '../../components/ui/Dialogo'
import { Fila } from '../../components/ui/Fila'
import { useAvisos } from '../../components/ui/Toast'

/**
 * Las acciones del mes que no son del día a día.
 *
 * Viven en un diálogo aparte porque son cosas que se hacen cuando algo ha
 * cambiado (la plantilla) o cuando algo ha salido mal (reiniciar), no todos los
 * días. La confirmación no abre otra ventana encima: sustituye la lista aquí
 * mismo, y dice con números qué se pierde.
 */

type Props = {
  mes: MesCompleto
  /** Para cambiar los valores propios del mes desde aquí. */
  onCambiarValor: (cambios: Record<string, unknown>) => Promise<void>
  onCerrar: () => void
  onCambiado: () => Promise<void> | void
  onCambiarEstado: (estado: 'abierto' | 'cerrado') => Promise<void>
}

type ResultadoReinicio = {
  generados: number
  variablesBorrados: number
  importacionesDeshechas: number
}

type Vista = 'menu' | 'regenerar' | 'reiniciar' | 'borrar'

export function MenuMes({ mes, onCerrar, onCambiado, onCambiarEstado, onCambiarValor }: Props) {
  const { avisar, avisarError } = useAvisos()
  const [vista, setVista] = useState<Vista>('menu')
  const [resumen, setResumen] = useState<ResumenRegeneracion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [importaciones, setImportaciones] = useState(0)

  // Qué valores por defecto se aplican junto con la regeneración.
  const [aplicarIngreso, setAplicarIngreso] = useState(false)
  const [aplicarComida, setAplicarComida] = useState(false)
  const [aplicarAhorro, setAplicarAhorro] = useState(false)

  const cerrado = mes.estado === 'cerrado'

  // Cuántas importaciones aceptadas tiene: se deshacen al reiniciar o borrar.
  useEffect(() => {
    api<ResumenRegeneracion>(`/meses/${mes.id}/regeneracion`)
      .then((d) => setImportaciones(d.importacionesAceptadas ?? 0))
      .catch(() => setImportaciones(0))
  }, [mes.id])

  const verRegeneracion = async () => {
    setCargando(true)
    setVista('regenerar')
    try {
      setResumen(await api<ResumenRegeneracion>(`/meses/${mes.id}/regeneracion`))
      /*
       * Los tres empiezan apagados. El presupuesto de comida se ajusta a mano a
       * menudo («este mes viene una comunión»), y venir a actualizar los fijos
       * no puede llevárselo por delante sin que lo hayas pedido.
       */
      setAplicarIngreso(false)
      setAplicarComida(false)
      setAplicarAhorro(false)
    } catch (causa) {
      avisarError(mensajeDeError(causa))
      setVista('menu')
    } finally {
      setCargando(false)
    }
  }

  const regenerar = async () => {
    setTrabajando(true)
    try {
      const { regeneracion } = await api<{
        regeneracion: {
          anadidos: number
          actualizados: number
          valoresAplicados?: string[]
        }
      }>(`/meses/${mes.id}/regenerar`, {
        metodo: 'POST',
        cuerpo: { aplicarIngreso, aplicarComida, aplicarAhorro },
      })
      // El participio concuerda: «1 fijo añadido», «2 fijos añadidos».
      const partes: string[] = []
      if (regeneracion.anadidos) {
        partes.push(
          `${cuantos(regeneracion.anadidos, 'fijo')} ${regeneracion.anadidos === 1 ? 'añadido' : 'añadidos'}`,
        )
      }
      if (regeneracion.actualizados) {
        partes.push(
          `${cuantos(regeneracion.actualizados, 'fijo')} ${regeneracion.actualizados === 1 ? 'actualizado' : 'actualizados'}`,
        )
      }
      const NOMBRES: Record<string, string> = {
        ingreso: 'los ingresos',
        presupuestoComida: 'el presupuesto de comida',
        objetivoAhorro: 'el objetivo de ahorro',
      }
      const valores = (regeneracion.valoresAplicados ?? []).map((v) => NOMBRES[v] ?? v)
      if (valores.length) partes.push(`actualizado ${valores.join(' y ')}`)
      avisar(partes.length ? `Mes regenerado: ${partes.join(' y ')}.` : 'No había nada que cambiar.')
      await onCambiado()
      onCerrar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setTrabajando(false)
    }
  }

  const reiniciar = async () => {
    setTrabajando(true)
    try {
      const { reinicio } = await api<{ reinicio: ResultadoReinicio }>(`/meses/${mes.id}/reiniciar`, {
        metodo: 'POST',
        cuerpo: { confirmar: true },
      })
      avisar(
        `Mes reiniciado: ${cuantos(reinicio.generados, 'fijo')} desde la plantilla` +
          (reinicio.variablesBorrados
            ? `, ${cuantos(reinicio.variablesBorrados, 'variable')} ${reinicio.variablesBorrados === 1 ? 'borrado' : 'borrados'}`
            : '') +
          (reinicio.importacionesDeshechas
            ? `, ${cuantos(reinicio.importacionesDeshechas, 'importación', 'importaciones')} deshechas`
            : ''),
      )
      await onCambiado()
      onCerrar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setTrabajando(false)
    }
  }

  const borrar = async () => {
    setTrabajando(true)
    try {
      const r = await api<{ movimientos: number; nombreMes: string }>(`/meses/${mes.id}`, {
        metodo: 'DELETE',
        cuerpo: { confirmar: true },
      })
      avisar(`${r.nombreMes} borrado: ${cuantos(r.movimientos, 'apunte')}.`)
      await onCambiado()
      onCerrar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setTrabajando(false)
    }
  }

  const apuntes = mes.fijos.length + mes.variables.length
  const conImportaciones =
    importaciones > 0
      ? `, y se ${importaciones === 1 ? 'deshace' : 'deshacen'} ${cuantos(importaciones, 'importación', 'importaciones')} del extracto`
      : ''

  // ---------- confirmaciones ----------

  if (vista === 'reiniciar' || vista === 'borrar') {
    const esBorrar = vista === 'borrar'
    return (
      <Dialogo
        titulo={esBorrar ? '¿Borrar el mes?' : '¿Reiniciar el mes?'}
        onCerrar={onCerrar}
        accionIzquierda={<BotonTexto onClick={() => setVista('menu')}>Atrás</BotonTexto>}
      >
        <ConfirmacionDialogo
          frase={
            esBorrar
              ? `${mes.nombreMes} de ${mes.anio} deja de existir, con sus ${cuantos(apuntes, 'apunte')}${conImportaciones}.`
              : `Se borran los ${cuantos(apuntes, 'apunte')} de ${mes.nombreMes.toLowerCase()} y se generan de nuevo ${cuantos(mes.fijos.length, 'fijo')} desde la plantilla${conImportaciones}.`
          }
          detalle={
            (esBorrar
              ? 'Tendrás que volver a abrirlo desde la plantilla. Si solo quieres empezar de cero, usa «Reiniciar el mes».'
              : 'El ingreso, el dinero en cuenta y las notas se conservan.') +
            ' No se puede deshacer.'
          }
          textoConfirmar={esBorrar ? 'Sí, borrar el mes' : 'Sí, reiniciar el mes'}
          trabajando={trabajando}
          onConfirmar={() => void (esBorrar ? borrar() : reiniciar())}
          onCancelar={() => setVista('menu')}
        />
      </Dialogo>
    )
  }

  // ---------- vista de regeneración ----------

  if (vista === 'regenerar') {
    return (
      <Dialogo
        titulo="Regenerar desde la plantilla"
        onCerrar={onCerrar}
        accionIzquierda={<BotonTexto onClick={() => setVista('menu')}>Atrás</BotonTexto>}
      >
        {cargando || !resumen ? (
          <p className="muted">Mirando qué habría que cambiar…</p>
        ) : (
          <>
            {resumen.sinCambios ? (
              <p className="muted" style={{ marginBottom: 10 }}>
                Este mes ya está al día con la plantilla. Puedes aplicar igualmente los valores por
                defecto de abajo, si quieres.
              </p>
            ) : null}

            <Bloque titulo="Se añadirán" vacio="Ningún fijo nuevo.">
              {resumen.anadir.map((a) => (
                <Fila
                  key={`a-${a.conceptoId}`}
                  titulo={a.nombre}
                  detalle={`${a.diaPrevisto ? `día ${a.diaPrevisto} · ` : ''}${euros(a.importePrevisto)}, pendiente${deDonde(a.origenImporte)}`}
                />
              ))}
            </Bloque>

            <Bloque titulo="Se actualizarán" vacio="Ningún fijo cambia de importe.">
              {resumen.actualizar.map((a) => (
                <Fila
                  key={`u-${a.movimientoId}`}
                  titulo={a.nombre}
                  detalle={
                    a.cambiaImporte
                      ? `${euros(a.importeAntes)} → ${euros(a.importeDespues)}${deDonde(a.origenImporte)}`
                      : `solo el previsto: ${euros(a.previstoAntes)} → ${euros(a.previstoDespues)}`
                  }
                />
              ))}
            </Bloque>

            <h3 className="card-titulo" style={{ marginTop: 18, fontSize: 14 }}>
              Valores del mes
            </h3>
            <ValorPorDefecto
              nombre="Ingresos"
              valor={resumen.valores.ingreso}
              activo={aplicarIngreso}
              onCambiar={setAplicarIngreso}
            />
            <ValorPorDefecto
              nombre="Presupuesto de comida"
              valor={resumen.valores.presupuestoComida}
              activo={aplicarComida}
              onCambiar={setAplicarComida}
            />
            <ValorPorDefecto
              nombre="Objetivo de ahorro"
              valor={resumen.valores.objetivoAhorro}
              activo={aplicarAhorro}
              onCambiar={setAplicarAhorro}
            />

            <div className="confirmacion-botones">
              <button
                className="btn-primary"
                disabled={trabajando}
                onClick={() => void regenerar()}
              >
                {trabajando ? 'Aplicando…' : 'Aplicar'}
              </button>
              <BotonTexto onClick={() => setVista('menu')}>Cancelar</BotonTexto>
            </div>
          </>
        )}
      </Dialogo>
    )
  }

  // ---------- el menú ----------

  return (
    <Dialogo titulo={`${mes.nombreMes} ${mes.anio}`} onCerrar={onCerrar}>
      {cerrado ? (
        <p className="muted" style={{ marginBottom: 10 }}>
          Este mes está cerrado. Regenerarlo o reiniciarlo cambiaría cuentas que ya diste por
          buenas, así que esas dos están apagadas.
        </p>
      ) : null}

      <AccionDialogo
        icono="repetir"
        titulo="Regenerar desde la plantilla"
        detalle="Añade los fijos que falten y actualiza los que sigan pendientes. No toca lo ya cobrado ni los gastos variables."
        disabled={cerrado}
        onClick={() => void verRegeneracion()}
      />
      <AccionDialogo
        icono="papelera"
        titulo="Reiniciar el mes"
        detalle={`Borra todos los apuntes y lo genera de nuevo. Se pierden los cobros ya marcados${
          mes.variables.length > 0
            ? ` y ${cuantos(mes.variables.length, 'gasto variable', 'gastos variables')}`
            : ''
        }.`}
        disabled={cerrado}
        onClick={() => setVista('reiniciar')}
      />
      <AccionDialogo
        icono="papelera"
        titulo="Borrar el mes"
        detalle="Se va entero: apuntes, importaciones y el propio mes. No se puede deshacer."
        peligro
        onClick={() => setVista('borrar')}
      />
      {/*
        Los números propios de este mes. La nómina y el sobre se cambian donde
        se leen —en el hero y en su tile— pero el objetivo de ahorro no tiene
        sitio en la pantalla, así que vive aquí, con lo demás del mes.
      */}
      <h3 className="card-titulo" style={{ marginTop: 18, fontSize: 14 }}>
        Valores de este mes
      </h3>
      <Fila
        titulo="Objetivo de ahorro"
        detalle="Lo que se quiere apartar. No es un gasto: no resta del sobrante."
        importe={
          <span style={{ width: 130, marginLeft: 'auto' }}>
            <CampoImporte
              valor={mes.objetivoAhorro}
              visible
              etiqueta="Objetivo de ahorro de este mes"
              onGuardar={(v) => void onCambiarValor({ objetivoAhorro: v ?? 0 })}
            />
          </span>
        }
      />

      <h3 className="card-titulo" style={{ marginTop: 18, fontSize: 14 }}>
        Acciones
      </h3>

      <AccionDialogo
        icono="candado"
        titulo={cerrado ? 'Reabrir el mes' : 'Cerrar el mes'}
        detalle={
          cerrado
            ? 'Vuelve a permitir regenerarlo y reiniciarlo.'
            : 'Lo deja como está: se puede seguir editando a mano, pero no regenerar ni reiniciar.'
        }
        onClick={() => void onCambiarEstado(cerrado ? 'abierto' : 'cerrado')}
      />
    </Dialogo>
  )
}

/**
 * « · copiado de septiembre», cuando el importe no sale de la plantilla.
 *
 * Un fijo que copia otro mes cambia de valor sin que nadie toque nada, así que
 * al regenerar conviene decir de dónde ha salido el número nuevo.
 */
function deDonde(origen: OrigenImporte | undefined): string {
  if (!origen || origen.criterio === 'importe') return ''
  if (!origen.hayDato) return ' · sin dato, el respaldo'
  return ` · copiado de ${origen.deMesLegible ?? origen.deMes}`
}

function Bloque({
  titulo,
  vacio,
  children,
}: {
  titulo: string
  vacio: string
  children: React.ReactNode
}) {
  const hay = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <div style={{ marginTop: 14 }}>
      <h3 className="card-titulo" style={{ fontSize: 14 }}>
        {titulo}
      </h3>
      {hay ? children : <p className="muted-3">{vacio}</p>}
    </div>
  )
}

/**
 * Un valor por defecto de la plantilla, con su interruptor de aplicar.
 *
 * Se dice lo que hay ahora y lo que propone la plantilla: sin las dos cifras,
 * encender el interruptor es firmar a ciegas.
 */
function ValorPorDefecto({
  nombre,
  valor,
  activo,
  onCambiar,
}: {
  nombre: string
  valor: ValorPlantilla
  activo: boolean
  onCambiar: (valor: boolean) => void
}) {
  const cambia = valor.propuesto !== null && valor.propuesto !== valor.actual
  return (
    <Fila
      titulo={nombre}
      detalle={
        valor.propuesto === null
          ? 'la plantilla no dice nada'
          : cambia
            ? `${euros(valor.actual)} → ${euros(valor.propuesto)}`
            : `ya vale ${euros(valor.actual)}`
      }
      centro={cambia ? null : <Chip>sin cambio</Chip>}
      importe={
        <Interruptor
          activo={activo}
          etiqueta={`Aplicar ${nombre.toLowerCase()}`}
          onCambiar={onCambiar}
        />
      }
    />
  )
}
