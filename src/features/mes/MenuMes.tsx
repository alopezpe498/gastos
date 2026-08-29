import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { MesCompleto, ResumenRegeneracion } from '../../lib/tipos'
import { Sheet } from '../../components/Sheet'
import { Confirmar } from '../../components/Basicos'
import { Interruptor } from '../../components/Campos'
import { useAvisos } from '../../components/Avisos'
import { IconoAviso, IconoCandado, IconoPapelera, IconoRepetir } from '../../components/Iconos'
import { cuantos, euros } from '../../lib/formato'

type Props = {
  mes: MesCompleto
  abierto: boolean
  onCerrar: () => void
  onCambiado: () => Promise<void> | void
  onCambiarEstado: (estado: 'abierto' | 'cerrado') => Promise<void>
}

type Vista = 'menu' | 'regenerar'

/**
 * Las acciones del mes que no son del día a día.
 *
 * Viven en un menú aparte y no en la cabecera porque son cosas que se hacen
 * cuando algo ha cambiado (la plantilla) o cuando algo ha salido mal (reiniciar),
 * no todos los días.
 */
export function MenuMes({ mes, abierto, onCerrar, onCambiado, onCambiarEstado }: Props) {
  const { avisar, avisarError } = useAvisos()
  const [vista, setVista] = useState<Vista>('menu')
  const [resumen, setResumen] = useState<ResumenRegeneracion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  // Qué valores por defecto se aplican junto con la regeneración.
  const [aplicarIngreso, setAplicarIngreso] = useState(false)
  const [aplicarComida, setAplicarComida] = useState(false)
  const [aplicarAhorro, setAplicarAhorro] = useState(false)

  // El reinicio pide dos confirmaciones: la primera avisa, la segunda ejecuta.
  const [avisoReinicio, setAvisoReinicio] = useState(false)
  const [confirmaReinicio, setConfirmaReinicio] = useState(false)

  const cerrado = mes.estado === 'cerrado'

  useEffect(() => {
    if (!abierto) {
      setVista('menu')
      setResumen(null)
    }
  }, [abierto])

  const verRegeneracion = async () => {
    setCargando(true)
    setVista('regenerar')
    try {
      const datos = await api<ResumenRegeneracion>(`/meses/${mes.id}/regeneracion`)
      setResumen(datos)
      /*
       * Los tres empiezan apagados. El presupuesto de comida se ajusta a mano a
       * menudo ("este mes viene una comunion"), y venir a actualizar los fijos
       * no puede llevarselo por delante sin que lo hayas pedido.
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
      const { regeneracion } = await api<{ regeneracion: ResultadoRegeneracion }>(
        `/meses/${mes.id}/regenerar`,
        { metodo: 'POST', cuerpo: { aplicarIngreso, aplicarComida, aplicarAhorro } },
      )
      // El participio concuerda: "1 fijo añadido", "2 fijos añadidos".
      const partes = []
      if (regeneracion.anadidos) {
        partes.push(`${cuantos(regeneracion.anadidos, 'fijo')} ${regeneracion.anadidos === 1 ? 'añadido' : 'añadidos'}`)
      }
      if (regeneracion.actualizados) {
        partes.push(
          `${cuantos(regeneracion.actualizados, 'fijo')} ${regeneracion.actualizados === 1 ? 'actualizado' : 'actualizados'}`,
        )
      }
      const NOMBRES_VALORES: Record<string, string> = {
        ingreso: 'los ingresos',
        presupuestoComida: 'el presupuesto de comida',
        objetivoAhorro: 'el objetivo de ahorro',
      }
      const valores = (regeneracion.valoresAplicados ?? []).map((v) => NOMBRES_VALORES[v] ?? v)
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
    setConfirmaReinicio(false)
    setTrabajando(true)
    try {
      const { reinicio } = await api<{ reinicio: ResultadoReinicio }>(
        `/meses/${mes.id}/reiniciar`,
        { metodo: 'POST', cuerpo: { confirmar: true } },
      )
      avisar(
        `Mes reiniciado: ${cuantos(reinicio.generados, 'fijo')} desde la plantilla` +
          (reinicio.variablesBorrados
            ? `, ${cuantos(reinicio.variablesBorrados, 'variable')} ${reinicio.variablesBorrados === 1 ? 'borrado' : 'borrados'}`
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

  if (!abierto) return null

  // ---------- vista de regeneración ----------

  if (vista === 'regenerar') {
    const nada = resumen?.sinCambios ?? false
    return (
      <Sheet
        abierta
        titulo="Regenerar desde la plantilla"
        onCerrar={onCerrar}
        accionIzquierda={
          <button className="boton-texto" onClick={() => setVista('menu')}>
            Atrás
          </button>
        }
        accionDerecha={
          <button
            className="boton-texto"
            disabled={cargando || trabajando || !resumen}
            onClick={() => void regenerar()}
          >
            {trabajando ? 'Aplicando…' : 'Aplicar'}
          </button>
        }
      >
        {cargando || !resumen ? (
          <p className="pista">Mirando qué habría que cambiar…</p>
        ) : (
          <>
            {nada ? (
              <p className="banda-aviso bien">
                <IconoAviso size={18} />
                <span>
                  Este mes ya está al día con la plantilla. Puedes aplicar igualmente los valores
                  por defecto de abajo, si quieres.
                </span>
              </p>
            ) : null}

            <BloqueCambios
              titulo="Se añadirán"
              vacio="Ningún fijo nuevo."
              lineas={resumen.anadir.map((a) => ({
                clave: `a-${a.conceptoId}`,
                nombre: a.nombre,
                detalle: `${a.diaPrevisto ? `día ${a.diaPrevisto} · ` : ''}${euros(a.importePrevisto)}, pendiente`,
              }))}
            />

            <BloqueCambios
              titulo="Se actualizarán"
              vacio="Ningún fijo cambia de importe."
              lineas={resumen.actualizar.map((a) => ({
                clave: `u-${a.movimientoId}`,
                nombre: a.nombre,
                detalle: a.cambiaImporte
                  ? `${euros(a.importeAntes)} → ${euros(a.importeDespues)}`
                  : `solo el previsto: ${euros(a.previstoAntes)} → ${euros(a.previstoDespues)}`,
              }))}
            />

            <BloqueCambios
              titulo="Se quedan como están"
              vacio={null}
              lineas={resumen.ignorar.map((i, indice) => ({
                clave: `i-${i.conceptoId}-${indice}`,
                nombre: i.nombre,
                detalle:
                  i.motivo === 'cobrado'
                    ? `ya cobrado (${euros(i.importe)}): lo que pasó no se toca`
                    : 'ya no está en la plantilla, pero sigue en el mes',
              }))}
            />

            {resumen.variables > 0 ? (
              <p className="pista">
                Los {cuantos(resumen.variables, 'gasto variable', 'gastos variables')} del mes no se
                tocan nunca.
              </p>
            ) : null}

            <h4 className="subseccion">Valores del mes</h4>
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
          </>
        )}
      </Sheet>
    )
  }

  // ---------- menú ----------

  return (
    <>
      <Sheet abierta titulo={`${mes.nombreMes} ${mes.anio}`} onCerrar={onCerrar}>
        {cerrado ? (
          <p className="banda-aviso">
            <IconoAviso size={18} />
            <span>
              Este mes está cerrado. Regenerarlo o reiniciarlo cambiaría cuentas que ya diste por
              buenas, así que hay que reabrirlo antes.
            </span>
          </p>
        ) : null}

        <div className="tarjeta">
          <button
            className="fila fila-boton"
            disabled={cerrado}
            onClick={() => void verRegeneracion()}
          >
            <IconoRepetir size={20} />
            <span className="fila-cuerpo">
              <span className="fila-titulo">Regenerar desde la plantilla</span>
              <span className="fila-detalle">
                Añade los fijos que falten y actualiza los que sigan pendientes. No toca lo ya
                cobrado ni los gastos variables.
              </span>
            </span>
          </button>

          <button
            className="fila fila-boton"
            disabled={cerrado}
            onClick={() => setAvisoReinicio(true)}
          >
            <IconoPapelera size={20} />
            <span className="fila-cuerpo">
              <span className="fila-titulo">Reiniciar el mes</span>
              <span className="fila-detalle">
                Borra todos los apuntes y lo genera de nuevo. Se pierden los cobros ya marcados
                {mes.variables.length > 0
                  ? ` y ${cuantos(mes.variables.length, 'gasto variable', 'gastos variables')}`
                  : ''}
                .
              </span>
            </span>
          </button>

          <button
            className="fila fila-boton"
            onClick={() => void onCambiarEstado(cerrado ? 'abierto' : 'cerrado')}
          >
            <IconoCandado size={20} />
            <span className="fila-cuerpo">
              <span className="fila-titulo">{cerrado ? 'Reabrir el mes' : 'Cerrar el mes'}</span>
              <span className="fila-detalle">
                {cerrado
                  ? 'Vuelve a permitir regenerarlo y reiniciarlo.'
                  : 'Lo deja como está: se puede seguir editando a mano, pero no regenerar ni reiniciar.'}
              </span>
            </span>
          </button>
        </div>
      </Sheet>

      {/* Primera confirmación: avisa de lo que se pierde. */}
      <Confirmar
        abierto={avisoReinicio}
        titulo={`¿Reiniciar ${mes.nombreMes.toLowerCase()}?`}
        mensaje={
          mes.variables.length > 0
            ? `Se ${mes.variables.length === 1 ? 'borrará' : 'borrarán'} ${cuantos(mes.variables.length, 'gasto variable', 'gastos variables')} y todos los cobros marcados. El ingreso, el dinero en cuenta y las notas se conservan.`
            : 'Se borrarán todos los fijos y se generarán de nuevo. Este mes no tiene gastos variables que perder.'
        }
        textoConfirmar="Continuar"
        peligroso={mes.variables.length > 0}
        onConfirmar={() => {
          setAvisoReinicio(false)
          setConfirmaReinicio(true)
        }}
        onCancelar={() => setAvisoReinicio(false)}
      />

      {/* Segunda: la que ejecuta. */}
      <Confirmar
        abierto={confirmaReinicio}
        titulo="Esto no se puede deshacer"
        mensaje={`${cuantos(mes.fijos.length + mes.variables.length, 'apunte')} de ${mes.nombreMes.toLowerCase()} se van a borrar y se generarán ${cuantos(mes.fijos.length, 'fijo')} desde la plantilla.`}
        textoConfirmar="Reiniciar el mes"
        peligroso
        onConfirmar={() => void reiniciar()}
        onCancelar={() => setConfirmaReinicio(false)}
      />
    </>
  )
}

type ResultadoRegeneracion = {
  anadidos: number
  actualizados: number
  intactos: number
  variables: number
  valoresAplicados: string[]
}

type ResultadoReinicio = { borrados: number; variablesBorrados: number; generados: number }

function BloqueCambios({
  titulo,
  vacio,
  lineas,
}: {
  titulo: string
  vacio: string | null
  lineas: { clave: string; nombre: string; detalle: string }[]
}) {
  if (lineas.length === 0) {
    return vacio ? (
      <>
        <h4 className="subseccion">{titulo}</h4>
        <p className="pista">{vacio}</p>
      </>
    ) : null
  }

  return (
    <>
      <h4 className="subseccion">
        {titulo} · {lineas.length}
      </h4>
      <div className="tarjeta">
        {lineas.map((linea) => (
          <div className="fila" key={linea.clave}>
            <span className="fila-cuerpo">
              <span className="fila-titulo">{linea.nombre}</span>
              <span className="fila-detalle dinero">{linea.detalle}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function ValorPorDefecto({
  nombre,
  valor,
  activo,
  onCambiar,
}: {
  nombre: string
  valor: { actual: number; propuesto: number | null; origen: string | null }
  activo: boolean
  onCambiar: (valor: boolean) => void
}) {
  // Sin valor propuesto, o si ya coincide, no hay nada que ofrecer.
  if (valor.propuesto === null || valor.propuesto === valor.actual) {
    return (
      <div className="fila">
        <span className="fila-cuerpo">
          <span className="fila-titulo">{nombre}</span>
          <span className="fila-detalle dinero">
            {euros(valor.actual)} · ya coincide con {valor.origen ?? 'lo que hay'}
          </span>
        </span>
      </div>
    )
  }

  return (
    <div className="fila fila-ajuste">
      <div className="fila-cuerpo">
        <span className="fila-titulo">{nombre}</span>
        <span className="fila-detalle dinero">
          {euros(valor.actual)} → {euros(valor.propuesto)}
          {valor.origen ? `, según ${valor.origen}` : ''}
        </span>
      </div>
      <Interruptor activo={activo} onCambiar={onCambiar} ariaLabel={`Actualizar ${nombre}`} />
    </div>
  )
}
