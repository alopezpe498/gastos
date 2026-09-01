import { useCallback, useEffect, useState } from 'react'
import { api, ErrorApi, mensajeDeError } from '../../lib/api'
import type { Concepto, MesCompleto, MesPorAbrir, Movimiento, PanelMes } from '../../lib/tipos'
import { cuantos, euros, hoyIso, NOMBRES_MESES, redondo } from '../../lib/formato'
import { iconoDe, paletaDeId, registrarConceptos } from '../../lib/conceptos'
import { BotonIcono, BotonPrimario, BotonTexto, Card, Check, IconoConcepto, MenuFila, Tile, Vacio } from '../../components/ui/Basicos'
import { CampoImporte, CampoTexto, SelectorConcepto, ValorEditable } from '../../components/ui/Campos'
import { Dialogo } from '../../components/ui/Dialogo'
import {
  Anillos,
  BarraProgreso,
  CifraQueCuenta,
  Leyenda,
  LeyendaItem,
  Puntos,
  SegmentBar,
  Sparkline,
} from '../../components/ui/Graficos'
import { Fila, GrupoFilas, Importe, TramoLista } from '../../components/ui/Fila'
import { Desglose } from '../../components/ui/Desglose'
import { Acciones } from '../../components/ui/Navegacion'
import { SelectorDeMes } from '../../components/ui/SelectorDeMes'
import { useAvisos } from '../../components/ui/Toast'
import { Icono } from '../../components/ui/Icono'
import { AltaRapida } from './AltaRapida'
import { MenuMes } from './MenuMes'
import { Analisis } from './Analisis'

/**
 * La pantalla Mes.
 *
 * Arriba, una sola cifra: lo que te queda. Debajo, tres tiles que responden a
 * las tres preguntas de después —¿cuánto se va solo?, ¿cómo va el sobre?, ¿en
 * qué se me va lo demás?— y abajo las dos listas con las que se trabaja.
 *
 * El análisis vive aquí dentro, plegado: se mira de vez en cuando, no cada día.
 */

type Props = {
  mesElegido: { anio: number; mes: number } | null
  onCambioDeMes: (mes: { anio: number; mes: number } | null) => void
  onImportarExtracto: (mesId: number) => void
  onBloquear: () => void
}

export function PantallaMes({ mesElegido, onCambioDeMes, onImportarExtracto, onBloquear }: Props) {
  const { avisar, avisarError } = useAvisos()
  const [mes, setMes] = useState<MesCompleto | null>(null)
  const [panel, setPanel] = useState<PanelMes | null>(null)
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [porAbrir, setPorAbrir] = useState<(MesPorAbrir & { anio: number; mes: number }) | null>(null)
  const [error, setError] = useState('')
  const [abriendo, setAbriendo] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [pedirApunte, setPedirApunte] = useState(0)
  /** El fijo cuyo desglose está abierto. Solo uno: si no, la lista se dispara. */
  const [fijoAbierto, setFijoAbierto] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    setError('')
    try {
      const catalogo = await api<Concepto[]>('/conceptos?activos=1')
      setConceptos(catalogo)
      registrarConceptos(catalogo)

      // Navegar no crea nada: si el mes no existe, se ofrece abrirlo.
      const datos = mesElegido
        ? await api<MesCompleto>(`/meses/${mesElegido.anio}/${mesElegido.mes}`).catch(async (causa) => {
            if (!(causa instanceof ErrorApi) || causa.estado !== 404) throw causa
            const info = await api<MesPorAbrir>(
              `/meses/por-abrir/${mesElegido.anio}/${mesElegido.mes}`,
            )
            setPorAbrir({ ...info, anio: mesElegido.anio, mes: mesElegido.mes })
            return null
          })
        : await api<MesCompleto | null>('/meses/actual')

      setMes(datos)
      if (datos) {
        setPorAbrir(null)
        setPanel(await api<PanelMes>(`/meses/${datos.id}/panel`))
      }
    } catch (causa) {
      setError(mensajeDeError(causa))
    }
  }, [mesElegido])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const recargar = useCallback(async () => {
    if (!mes) return
    const datos = await api<MesCompleto>(`/meses/${mes.anio}/${mes.mes}`)
    setMes(datos)
    setPanel(await api<PanelMes>(`/meses/${datos.id}/panel`))
  }, [mes])

  const cambiarMes = async (cambios: Record<string, unknown>) => {
    if (!mes) return
    try {
      setMes(await api<MesCompleto>(`/meses/${mes.id}`, { metodo: 'PATCH', cuerpo: cambios }))
      setPanel(await api<PanelMes>(`/meses/${mes.id}/panel`))
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const cambiarMovimiento = async (id: number, cambios: Record<string, unknown>) => {
    try {
      await api(`/movimientos/${id}`, { metodo: 'PATCH', cuerpo: cambios })
      await recargar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const alternarCobro = async (movimientoId: number) => {
    const fijo = panel?.fijos.find((f) => f.movimientoId === movimientoId)
    if (!fijo) return
    await cambiarMovimiento(movimientoId, { fechaCobro: fijo.cobrado ? null : hoyIso() })
  }

  const apuntar = async (datos: { conceptoId: number; importe: number; descripcion: string }) => {
    if (!mes) return
    try {
      await api('/movimientos', {
        metodo: 'POST',
        cuerpo: { mesId: mes.id, ...datos, fechaCobro: hoyIso() },
      })
      await recargar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  /**
   * Borra un apunte y ofrece deshacerlo.
   *
   * No hay papelera en la API, así que deshacer es volver a crearlo con lo que
   * tenía. Pierde el id, que es lo de menos: lo que importa es que el dinero
   * vuelva a estar donde estaba.
   */
  const borrar = async (cual: Movimiento) => {
    try {
      await api(`/movimientos/${cual.id}`, { metodo: 'DELETE' })
      await recargar()
      avisar(`Borrado «${cual.concepto}» de ${euros(Math.abs(cual.importe))}`, {
        deshacer: async () => {
          if (!mes) return
          try {
            await api('/movimientos', {
              metodo: 'POST',
              cuerpo: {
                mesId: mes.id,
                conceptoId: cual.conceptoId,
                importe: cual.importe,
                descripcion: cual.descripcion,
                fechaCobro: cual.fechaCobro,
              },
            })
            await recargar()
            avisar('Vuelve a estar')
          } catch (causa) {
            avisarError(mensajeDeError(causa))
          }
        },
      })
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const abrir = async (anio: number, numeroMes: number) => {
    setAbriendo(true)
    try {
      const nuevo = await api<MesCompleto>('/meses/asegurar', {
        metodo: 'POST',
        cuerpo: { anio, mes: numeroMes },
      })
      avisar(`${nuevo.nombreMes} abierto con ${cuantos(nuevo.fijos.length, 'fijo')}`)
      onCambioDeMes({ anio: nuevo.anio, mes: nuevo.mes })
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setAbriendo(false)
    }
  }

  // ---- estados que no son el mes ----

  if (error) {
    return <Vacio icono="aviso" frase={error} accion="Reintentar" onAccion={() => void cargar()} />
  }

  if (porAbrir) {
    const nombre = NOMBRES_MESES[porAbrir.mes - 1]
    return (
      <Card>
        <div className="vacio">
          <span className="ico">
            <Icono nombre="calendario" size={16} />
          </span>
          <p className="vacio-frase">
            {nombre} de {porAbrir.anio} todavía no está abierto
          </p>
          <p className="muted">
            {porAbrir.intermedios.length > 0
              ? `Al abrirlo se crearán también ${porAbrir.intermedios
                  .map((m) => m.nombre.toLowerCase())
                  .join(', ')}.`
              : 'Al abrirlo se generan los fijos activos, pendientes de cobro.'}
          </p>
          <span style={{ marginTop: 8 }}>
            <BotonPrimario disabled={abriendo} onClick={() => void abrir(porAbrir.anio, porAbrir.mes)}>
              {abriendo ? 'Abriendo…' : 'Abrir este mes'}
            </BotonPrimario>
          </span>
        </div>
      </Card>
    )
  }

  if (!mes || !panel) return <div className="cargando">Un momento…</div>

  // ---- lo que dice el hero ----

  const { diasQueQuedan, dias, diaActual } = panel.periodo
  const cerrado = mes.estado === 'cerrado'
  const terminado = (diasQueQuedan === 0 && diaActual > 0) || cerrado
  const pasado = panel.libre < 0

  /*
   * El ritmo se mide con lo pagado SIN LOS FIJOS, contra los días que llevas.
   *
   * Los fijos no dependen de cómo te portes este mes: llegan cuando llegan, y
   * meterlos hacía que el día que pasa la hipoteca la app te riñera. Lo que dice
   * si vas rápido es lo que decides tú —los variables y la comida— frente a lo
   * que llevas de mes.
   */
  const partePeriodo = dias > 0 ? diaActual / dias : 0
  const parteRitmo = mes.ingreso > 0 ? panel.pagadoSinFijos / mes.ingreso : 0
  /*
   * Y no se juzga nada hasta el segundo día. Con el 0 % del mes transcurrido
   * cualquier gasto «se pasa del ritmo», así que un café el día 1 disparaba un
   * «Cuidado» que no significaba nada.
   */
  const hayRitmo = diaActual >= 2
  const rapido = !pasado && !terminado && hayRitmo && parteRitmo > partePeriodo + 0.08

  const alDia = diasQueQuedan > 0 ? panel.libre / diasQueQuedan : panel.libre
  const nombreMes = mes.nombreMes.toLowerCase()
  // «el 1 de septiembre» y no «el 1 sep.»: va dentro de una frase, no en una
  // tabla, y ahí las abreviaturas cantan.
  const empieza = largo(panel.periodo.desde)

  const frase = terminado
    ? pasado
      ? `Cerraste ${nombreMes} con ${redondo(Math.abs(panel.libre))} de más.`
      : `Cerraste ${nombreMes} con ${redondo(panel.libre)} de sobra.`
    : diaActual === 0
      ? // El periodo aún no ha empezado: no hay nada que juzgar todavía.
        `El mes empieza el ${empieza}.`
      : pasado
        ? `Te has pasado ${redondo(Math.abs(panel.libre))} de lo que entra este mes.`
        : !hayRitmo
          ? 'Acabas de empezar el mes.'
          : rapido
            ? 'Cuidado: llevas gastado más de lo que llevas de mes.'
            : diasQueQuedan === 1
              ? `Vas bien. Te queda ${redondo(panel.libre)} para el último día.`
              : `Vas bien. Con lo que llevas, te sobran ${redondo(alDia)} al día hasta la nómina.`

  /*
   * El anillo de dentro es cuánto de la nómina tiene ya destino, pagado o
   * comprometido. Con solo lo pagado marcaba 0 % el día 1 de un mes cuyos
   * recibos ya estaban decididos, que es justo lo contrario de lo que pasa.
   */
  const parteUsada = mes.ingreso > 0 ? (panel.pagado + panel.comprometido) / mes.ingreso : 0

  const cobrados = panel.fijos.filter((f) => f.cobrado).length
  const excesoComida = panel.comida.gastado > panel.comida.presupuesto && panel.comida.presupuesto > 0
  /*
   * Extras y comida se apuntan igual y venían en la misma lista, así que el
   * total de la cabecera —«12 · 340 €»— no era el de ninguno de los dos: el de
   * extras salía mezclado con la compra del super. Cada uno con su tramo y su
   * suma; los totales de arriba no cambian.
   */
  const extras = mes.variables.filter((m) => m.tipo !== 'sobre')
  const comida = mes.variables.filter((m) => m.tipo === 'sobre')
  const tramos = [
    { clave: 'extras', titulo: 'Extras', color: 'var(--extras)', lista: extras },
    { clave: 'comida', titulo: 'Comida', color: 'var(--comida)', lista: comida },
  ].filter((t) => t.lista.length > 0)

  return (
    <>
      <Acciones>
        <BotonTexto onClick={() => onImportarExtracto(mes.id)}>Importar extracto</BotonTexto>
        <BotonPrimario onClick={() => setPedirApunte((n) => n + 1)}>+ Apuntar</BotonPrimario>
        <button
          className="btn-icono"
          aria-label="Más cosas de este mes"
          onClick={() => setMenuAbierto(true)}
        >
          <Icono nombre="puntos" size={16} />
        </button>
        <button className="btn-icono" aria-label="Bloquear la aplicación" onClick={onBloquear}>
          <Icono nombre="candado" size={16} />
        </button>
      </Acciones>

      {/* ---------- hero ---------- */}
      <div className={`card hero ${pasado ? 'pasado' : rapido ? 'rapido' : ''}`.trim()}>
        <div>
          <div className="hero-mes">
            <SelectorDeMes
              anio={mes.anio}
              mes={mes.mes}
              onIr={(anio, numeroMes) => onCambioDeMes({ anio, mes: numeroMes })}
            />
            <span className="muted" style={{ fontWeight: 500 }}>
              · {corta(panel.periodo.desde)} → {corta(panel.periodo.hasta)}
              {diaActual > 0 && !terminado ? ` · día ${diaActual}` : ''}
            </span>
          </div>

          <div className="muted" style={{ marginTop: 16 }}>
            {pasado ? 'Te has pasado' : terminado ? 'Te sobró' : 'Te queda'}
          </div>
          <div className="big">
            <CifraQueCuenta valor={Math.abs(panel.libre)} formato={(n) => redondo(n)} />
          </div>
          <div className="hero-frase">{frase}</div>

          <SegmentBar
            segmentos={[
              { nombre: 'Pagado', valor: panel.pagado, color: 'var(--tinta)' },
              { nombre: 'Comprometido', valor: panel.comprometido, color: '#C9C9C4' },
              { nombre: 'Libre', valor: Math.max(0, panel.libre), color: 'var(--acento-suave)' },
            ]}
          />
          <Leyenda>
            <LeyendaItem color="var(--tinta)">Pagado {redondo(panel.pagado)}</LeyendaItem>
            <LeyendaItem color="#C9C9C4">Comprometido {redondo(panel.comprometido)}</LeyendaItem>
            <LeyendaItem color="var(--acento-suave)">
              Libre {redondo(Math.max(0, panel.libre))}
            </LeyendaItem>
            <span className="leg-derecha">
              <ValorEditable
                valor={mes.ingreso}
                prefijo="Nómina"
                etiqueta="Nómina del mes"
                onGuardar={(v) => cambiarMes({ ingreso: v ?? 0 })}
              />
              {/*
                El saldo del banco es la única cifra que no sale de los apuntes:
                se anota a mano y sirve para ver si la cuenta cuadra con la
                realidad. Va aquí, junto a la nómina, porque es del mismo orden.
              */}
              <ValorEditable
                valor={mes.resumen.dineroEnCuenta}
                prefijo="Saldo"
                vacio="Anotar el saldo del banco"
                etiqueta="Saldo en cuenta"
                onGuardar={(v) => cambiarMes({ dineroEnCuenta: v })}
              />
            </span>
          </Leyenda>
        </div>

        <Anillos
          partePeriodo={partePeriodo}
          parteGasto={parteUsada}
          centro={`${Math.round(parteUsada * 100)}%`}
          pie={`usado · ${Math.round(partePeriodo * 100)}% del mes`}
        />
      </div>

      {/* ---------- tiles ---------- */}
      <div className="tiles">
        <Tile
          icono="check"
          etiqueta="Fijos"
          cifra={redondo(panel.fijos.reduce((t, f) => t + f.importe, 0))}
          frase={
            panel.pendientes === 0
              ? 'Todos cobrados'
              : `${cobrados} de ${panel.fijos.length} cobrados${
                  panel.siguienteFijo
                    ? ` · el siguiente, ${panel.siguienteFijo.concepto} el día ${panel.siguienteFijo.dia}`
                    : ''
                }`
          }
        >
          <Puntos
            total={panel.fijos.length}
            llenos={cobrados}
            titulo={`${cobrados} de ${panel.fijos.length} cobrados`}
          />
        </Tile>

        <Tile
          icono="comida"
          color="var(--comida)"
          suave="var(--comida-suave)"
          etiqueta="Comida"
          cifra={redondo(panel.comida.gastado)}
          sufijo={
            /*
             * El «/ 500» es el sobre, y es lo que se cambia cuando este mes
             * viene una comunión. Se edita aquí, que es donde se lee: tenerlo
             * solo en la plantilla obligaba a salir de la pantalla para algo
             * que se decide mirando lo que llevas gastado.
             */
            <ValorEditable
              valor={panel.comida.presupuesto}
              prefijo="/"
              vacio="poner sobre"
              etiqueta="Presupuesto de comida de este mes"
              onGuardar={(v) => cambiarMes({ presupuestoComida: v ?? 0 })}
            />
          }
          /* En blanco hasta que se agota el sobre: el coral es para cuando pasa. */
          className={excesoComida ? 'sobre-agotado' : ''}
          frase={
            panel.comida.presupuesto <= 0 ? (
              'Sin sobre puesto: la comida no cuenta contra ningún presupuesto.'
            ) : excesoComida ? (
              `Sobre agotado, ${euros(panel.comida.gastado - panel.comida.presupuesto)} de más`
            ) : (
              `Te quedan ${redondo(panel.comida.presupuesto - panel.comida.gastado)}${
                diasQueQuedan > 1 ? `, unos ${redondo(panel.comida.alDia)} al día` : ''
              }`
            )
          }
        >
          <BarraProgreso
            parte={panel.comida.presupuesto > 0 ? panel.comida.gastado / panel.comida.presupuesto : 0}
            titulo="Sobre de comida"
          />
        </Tile>

        <Tile
          icono="carro"
          color="var(--extras)"
          suave="var(--extras-suave)"
          etiqueta="Extras"
          cifra={redondo(panel.extras.total)}
          frase={fraseExtras(panel)}
        >
          {/* Una línea plana no dice nada: si no hay extras, no se dibuja. */}
          {panel.extras.total > 0 ? (
            <Sparkline
              valores={acumular(panel.puntos.map((p) => p.extras))}
              titulo="Extras acumulados por día"
            />
          ) : null}
        </Tile>
      </div>

      {/* ---------- las dos listas ---------- */}
      <div className="dos-columnas">
        <Card
          titulo="Movimientos"
          derecha={
            <span className="muted">
              {mes.variables.length} · {redondo(mes.variables.reduce((t, v) => t + v.importe, 0))}
            </span>
          }
        >
          <AltaRapida
            conceptos={conceptos}
            onCrear={apuntar}
            pedirApunte={pedirApunte}
            onImportar={() => onImportarExtracto(mes.id)}
          />

          {mes.variables.length === 0 ? (
            <Vacio
              frase="Aún no hay apuntes este mes."
              accion="Importa el extracto del banco"
              onAccion={() => onImportarExtracto(mes.id)}
            />
          ) : (
            tramos.map((tramo) => (
              <div key={tramo.clave}>
                <TramoLista
                  titulo={tramo.titulo}
                  color={tramo.color}
                  derecha={`${tramo.lista.length} · ${redondo(
                    tramo.lista.reduce((t, v) => t + v.importe, 0),
                  )}`}
                />
                {agruparPorDia(tramo.lista).map(([etiqueta, movimientos]) => (
                  <div key={etiqueta}>
                    <GrupoFilas>{etiqueta}</GrupoFilas>
                    {movimientos.map((m) => (
                      <FilaMovimiento
                        key={m.id}
                        movimiento={m}
                        conceptos={conceptos}
                        onCambiar={cambiarMovimiento}
                        onBorrar={borrar}
                        onDuplicar={() =>
                          apuntar({
                            conceptoId: m.conceptoId,
                            importe: m.importe,
                            descripcion: m.descripcion,
                          })
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}
        </Card>

        <Card
          titulo="Fijos"
          derecha={
            <span className="muted">
              {panel.pendientes === 0 ? 'todos cobrados' : `${panel.pendientes} pendientes`}
            </span>
          }
        >
          {panel.fijos.map((f) => (
            <FilaFijo
              key={f.movimientoId}
              fijo={f}
              abierto={fijoAbierto === f.movimientoId}
              onAbrir={() =>
                setFijoAbierto((actual) => (actual === f.movimientoId ? null : f.movimientoId))
              }
              onCobro={() => void alternarCobro(f.movimientoId)}
              onCambiar={(cambio) => cambiarMovimiento(f.movimientoId, cambio)}
            />
          ))}
        </Card>
      </div>

      <Analisis mesId={mes.id} conceptos={conceptos} />

      {menuAbierto ? (
        <MenuMes
          mes={mes}
          onCerrar={() => setMenuAbierto(false)}
          onCambiado={recargar}
          onCambiarValor={cambiarMes}
          onCambiarEstado={async (estado) => {
            await cambiarMes({ estado })
            avisar(estado === 'cerrado' ? 'Mes cerrado' : 'Mes reabierto')
          }}
        />
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Piezas de la pantalla
// ---------------------------------------------------------------------------

/**
 * Un fijo de la lista, que se abre si quieres mirar lo que lleva dentro.
 *
 * La mayoría son una sola cosa y no hay nada que abrir, pero Suscripciones son
 * seis cargos distintos y el mes que viene siete. Cuando hay desglose, el
 * importe deja de escribirse aquí: es la suma de las líneas.
 */
function FilaFijo({
  fijo,
  abierto,
  onAbrir,
  onCobro,
  onCambiar,
}: {
  fijo: PanelMes['fijos'][number]
  abierto: boolean
  onAbrir: () => void
  onCobro: () => void
  onCambiar: (cambios: Record<string, unknown>) => Promise<void>
}) {
  const lineas = fijo.detalle ?? []
  const tiene = lineas.length > 0

  return (
    <>
      <Fila
        izquierda={
          <Check
            marcado={fijo.cobrado}
            tarde={fijo.tarde}
            etiqueta={`${fijo.cobrado ? 'Desmarcar' : 'Marcar como cobrado'} ${fijo.concepto}`}
            onClick={onCobro}
          />
        }
        titulo={fijo.concepto}
        detalle={tiene ? `${detalleFijo(fijo)} · ${cuantos(lineas.length, 'cosa', 'cosas')}` : detalleFijo(fijo)}
        detalleTarde={fijo.tarde}
        importe={
          <span style={{ width: 104, marginLeft: 'auto', display: 'block', textAlign: 'right' }}>
            {tiene ? (
              /* Con desglose el importe es la suma, así que aquí no se escribe. */
              <Importe apagado={!fijo.cobrado}>{euros(fijo.importe)}</Importe>
            ) : (
              <CampoImporte
                valor={fijo.importe}
                etiqueta={`Importe de ${fijo.concepto}`}
                apagado={!fijo.cobrado}
                onGuardar={(v) => void onCambiar({ importe: v })}
              />
            )}
          </span>
        }
        acciones={
          <BotonIcono
            icono={abierto ? 'abajo' : 'chevron'}
            etiqueta={`${abierto ? 'Cerrar' : 'Ver'} el desglose de ${fijo.concepto}`}
            expandido={abierto}
            onClick={onAbrir}
          />
        }
      />
      {abierto ? (
        <Desglose lineas={lineas} onGuardar={(nuevas) => onCambiar({ detalle: nuevas })} />
      ) : null}
    </>
  )
}

function FilaMovimiento({
  movimiento,
  conceptos,
  onCambiar,
  onBorrar,
  onDuplicar,
}: {
  movimiento: Movimiento
  conceptos: Concepto[]
  onCambiar: (id: number, cambios: Record<string, unknown>) => Promise<void>
  onBorrar: (m: Movimiento) => Promise<void>
  onDuplicar: () => void
}) {
  const [borrando, setBorrando] = useState(false)
  const [editando, setEditando] = useState(false)
  const concepto = conceptos.find((c) => c.id === movimiento.conceptoId) ?? null
  const paleta = paletaDeId(movimiento.conceptoId, movimiento.tipo === 'sobre', concepto?.color)

  /*
   * La pregunta va en la propia fila: es donde estás mirando y ahí se ve de
   * cuál se trata, que es justo lo que un diálogo en medio no te dice.
   */
  if (borrando) {
    return (
      <Fila
        confirmando
        titulo={`¿Borrar este apunte de ${euros(Math.abs(movimiento.importe))}?`}
        importe={
          <span className="fila-campos" style={{ gap: 8, marginLeft: 'auto' }}>
            <BotonPrimario
              peligro
              onClick={() => {
                setBorrando(false)
                void onBorrar(movimiento)
              }}
            >
              Borrar
            </BotonPrimario>
            <BotonTexto onClick={() => setBorrando(false)}>Cancelar</BotonTexto>
          </span>
        }
      />
    )
  }

  return (
    <>
      {editando ? (
        <FichaMovimiento
          movimiento={movimiento}
          conceptos={conceptos}
          onCerrar={() => setEditando(false)}
          onCambiar={onCambiar}
        />
      ) : null}
    <Fila
      onAbrir={() => setEditando(true)}
      izquierda={
        <IconoConcepto
          icono={concepto ? iconoDe(concepto) : 'etiqueta'}
          color={paleta.color}
          suave={paleta.suave}
        />
      }
      titulo={movimiento.descripcion || movimiento.concepto}
      detalle={movimiento.descripcion ? movimiento.concepto : undefined}
      importe={
        <Importe abono={movimiento.importe < 0}>
          {movimiento.importe < 0 ? '−' : ''}
          {euros(Math.abs(movimiento.importe))}
        </Importe>
      }
      acciones={
        <MenuFila
          etiqueta={`Más acciones para ${movimiento.concepto}`}
          opciones={[
            { id: 'editar', nombre: 'Editar', icono: 'lapiz' },
          { id: 'duplicar', nombre: 'Duplicar', icono: 'copiar' },
            { id: 'borrar', nombre: 'Borrar', icono: 'papelera', peligro: true },
          ]}
          onElegir={(id) => {
            if (id === 'editar') setEditando(true)
            if (id === 'duplicar') onDuplicar()
            if (id === 'borrar') setBorrando(true)
          }}
        />
      }
    />
    </>
  )
}

/**
 * La ficha de un movimiento: concepto, descripción, fecha e importe.
 *
 * En un diálogo y no en la propia fila porque son cuatro campos y la fila mide
 * lo que mide; meterlos ahí obligaba a encogerlos hasta que no se leían.
 */
function FichaMovimiento({
  movimiento,
  conceptos,
  onCerrar,
  onCambiar,
}: {
  movimiento: Movimiento
  conceptos: Concepto[]
  onCerrar: () => void
  onCambiar: (id: number, cambios: Record<string, unknown>) => Promise<void>
}) {
  return (
    <Dialogo titulo="Editar el apunte" onCerrar={onCerrar}>
      <label className="campo-etiqueta">Concepto</label>
      <SelectorConcepto
        conceptos={conceptos}
        valor={movimiento.conceptoId}
        etiqueta="Concepto del apunte"
        onElegir={(conceptoId) => void onCambiar(movimiento.id, { conceptoId })}
      />

      <label className="campo-etiqueta">Descripción</label>
      <CampoTexto
        valor={movimiento.descripcion}
        visible
        etiqueta="Descripción del apunte"
        placeholder="Lo que fue, si hace falta"
        onGuardar={(descripcion) => void onCambiar(movimiento.id, { descripcion })}
      />

      <div className="fila-campos" style={{ marginTop: 14, alignItems: 'flex-end' }}>
        <span>
          <label className="campo-etiqueta" style={{ marginTop: 0 }}>
            Fecha
          </label>
          <input
            className="campo visible"
            type="date"
            aria-label="Fecha del apunte"
            value={movimiento.fechaCobro ?? ''}
            onChange={(e) => void onCambiar(movimiento.id, { fechaCobro: e.target.value })}
          />
        </span>
        <span style={{ width: 140 }}>
          <label className="campo-etiqueta" style={{ marginTop: 0 }}>
            Importe
          </label>
          <CampoImporte
            valor={movimiento.importe}
            visible
            etiqueta="Importe del apunte"
            onGuardar={(importe) => void onCambiar(movimiento.id, { importe })}
          />
        </span>
      </div>
    </Dialogo>
  )
}

/** «cobrado el 31», «era el día 1», «día 19 · 176 € el mes pasado». */
function detalleFijo(f: PanelMes['fijos'][number]): string {
  const dia = String(f.diaPrevisto ?? '')
    .split(/[^0-9]+/)
    .filter(Boolean)[0]
  if (f.cobrado) return dia ? `cobrado el ${dia}` : 'cobrado'
  if (f.tarde) return `era el día ${dia}`
  const partes: string[] = []
  if (dia) partes.push(`día ${dia}`)
  if (f.importeMesAnterior !== null) partes.push(`${redondo(f.importeMesAnterior)} el mes pasado`)
  return partes.join(' · ')
}

function fraseExtras(panel: PanelMes): string {
  if (panel.extras.total === 0) return 'Todavía no hay extras este mes'
  // Solo se compara si ese mes existe: inventarse una mejora no vale.
  if (panel.extras.anoPasado && panel.extras.anoPasado > 0) {
    const variacion = Math.round(
      ((panel.extras.total - panel.extras.anoPasado) / panel.extras.anoPasado) * 100,
    )
    if (Math.abs(variacion) >= 5) {
      return `Un ${Math.abs(variacion)} % ${variacion < 0 ? 'menos' : 'más'} que el año pasado`
    }
    return 'Casi igual que el año pasado'
  }
  return panel.extras.mayor
    ? `${panel.extras.mayor.concepto} se lleva el ${panel.extras.mayor.porcentaje} %`
    : ''
}

/** «Hoy», «Ayer» y luego la fecha: es como se recuerda un gasto. */
function agruparPorDia(variables: Movimiento[]): [string, Movimiento[]][] {
  const hoy = hoyIso()
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const grupos = new Map<string, Movimiento[]>()

  for (const m of [...variables].sort((a, b) =>
    String(b.fechaCobro ?? '').localeCompare(String(a.fechaCobro ?? '')),
  )) {
    const dia = String(m.fechaCobro ?? '')
    const etiqueta = dia === hoy ? 'Hoy' : dia === ayer ? 'Ayer' : largo(dia)
    grupos.set(etiqueta, [...(grupos.get(etiqueta) ?? []), m])
  }
  return [...grupos.entries()]
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function corta(iso: string | null) {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]}`
}

function largo(iso: string) {
  if (!iso) return 'Sin fecha'
  const [, m, d] = iso.split('-')
  return `${Number(d)} de ${NOMBRES_MESES[Number(m) - 1].toLowerCase()}`
}

/** La sparkline de extras enseña el acumulado: la forma dice si se dispara. */
function acumular(valores: number[]): number[] {
  let suma = 0
  return valores.map((v) => (suma += v))
}
