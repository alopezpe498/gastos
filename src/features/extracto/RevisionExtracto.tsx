import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type {
  Concepto,
  Conciliacion,
  ContadorExtracto,
  DestinoLinea,
  LineaExtracto,
  PropuestaExtracto,
  ReglaNueva,
  SugerenciaIa,
} from '../../lib/tipos'
import { Confirmar } from '../../components/Basicos'
import { Sheet } from '../../components/Sheet'
import { CampoImporte } from '../../components/Campos'
import { SelectorConcepto } from '../../components/SelectorConcepto'
import { useAvisos } from '../../components/Avisos'
import { euros, escribirImporte, fecha as fechaCorta, leerImporte, cuantos } from '../../lib/formato'

/**
 * Revisión de un extracto antes de aplicarlo.
 *
 * La pantalla entera gira alrededor de un número: **el marcador de arriba tiene
 * que cuadrar**. Los N movimientos del fichero se reparten entre fijos,
 * variables, comida, omitidos, descartados, fuera de mes y duplicados, y no se
 * puede aceptar mientras quede uno sin sitio. Así no se pierde nada por el
 * camino, que es el único miedo real al importar del banco.
 *
 * Lo demás son atajos para llegar rápido a cero pendientes: asignar un concepto
 * clasifica de paso todos los movimientos con la misma descripción, y ofrece
 * recordar la regla para el mes que viene.
 */

const ETIQUETAS_PROCEDENCIA: Record<LineaExtracto['procedencia'], string> = {
  regla: 'regla',
  aprendida: 'aprendida',
  ia: 'IA',
  manual: 'a mano',
  ninguno: '',
}

type Props = {
  propuesta: PropuestaExtracto
  onAplicado: (resumen: { conciliados: number; creados: number; comida: number }) => void
  onCancelar: () => void
}

export function RevisionExtracto({ propuesta, onAplicado, onCancelar }: Props) {
  const { avisar, avisarError } = useAvisos()
  const [lineas, setLineas] = useState<LineaExtracto[]>(propuesta.lineas)
  const [conciliaciones, setConciliaciones] = useState<Conciliacion[]>(propuesta.conciliaciones)
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [reglasNuevas, setReglasNuevas] = useState<ReglaNueva[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [abiertos, setAbiertos] = useState({ sin: true, clasificados: true, fijos: true, resto: false })
  const [confirmando, setConfirmando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [sugerencias, setSugerencias] = useState<Record<number, SugerenciaIa>>({})
  const [pidiendoIa, setPidiendoIa] = useState(false)
  const [avisoIa, setAvisoIa] = useState('')
  const [dividiendo, setDividiendo] = useState<LineaExtracto | null>(null)
  // La fila con el foco, para poder moverse con las flechas sin tocar el ratón.
  const [enfocada, setEnfocada] = useState<number | null>(null)

  const conceptos = propuesta.conceptos
  const importacionId = propuesta.importacion.id

  // ---- el marcador ----
  const cuenta: ContadorExtracto = useMemo(() => {
    const c = {
      total: lineas.length,
      fijos: 0,
      variables: 0,
      comida: 0,
      omitidos: 0,
      descartados: 0,
      fueraDeMes: 0,
      duplicados: 0,
      sinClasificar: 0,
    }
    for (const l of lineas) {
      if (l.destino === 'descartado') c.descartados += 1
      else if (l.destino === 'duplicado') c.duplicados += 1
      else if (l.destino === 'omitido') c.omitidos += 1
      else if (l.fueraDeMes) c.fueraDeMes += 1
      else if (l.destino === 'fijo') c.fijos += 1
      else if (l.destino === 'comida') c.comida += 1
      else if (l.destino === 'variable') c.variables += 1
      else c.sinClasificar += 1
    }
    const suma =
      c.fijos + c.variables + c.comida + c.omitidos + c.descartados + c.fueraDeMes + c.duplicados + c.sinClasificar
    return { ...c, suma, cuadra: suma === c.total }
  }, [lineas])

  // ---- el borrador se guarda solo ----
  const guardado = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearTimeout(guardado.current)
    guardado.current = window.setTimeout(() => {
      void api(`/extracto/${importacionId}/borrador`, {
        metodo: 'PATCH',
        cuerpo: { lineas, conciliaciones },
      }).catch(() => {
        // Que falle el autoguardado no puede molestar en medio de la revisión.
      })
    }, 1200)
    return () => window.clearTimeout(guardado.current)
  }, [lineas, conciliaciones, importacionId])

  const sobre = useMemo(() => conceptos.find((c) => c.tipo === 'sobre') ?? null, [conceptos])

  /** Cambia una línea y, si se pide, todas las que digan lo mismo. */
  const asignar = useCallback(
    (linea: LineaExtracto, conceptoId: number | null, destino?: DestinoLinea) => {
      const concepto = conceptos.find((c) => c.id === conceptoId) ?? null
      const nuevoDestino: DestinoLinea =
        destino ??
        (concepto === null
          ? 'sinClasificar'
          : concepto.tipo === 'sobre'
            ? 'comida'
            : concepto.tipo === 'fijo'
              ? 'fijo'
              : 'variable')

      const iguales = lineas.filter(
        (l) =>
          l.id !== linea.id &&
          l.destino === 'sinClasificar' &&
          l.descripcionLimpia === linea.descripcionLimpia,
      )

      setLineas((actuales) =>
        actuales.map((l) => {
          const esEsta = l.id === linea.id
          const esIgual = iguales.some((i) => i.id === l.id)
          if (!esEsta && !esIgual) return l
          return {
            ...l,
            conceptoId,
            concepto: concepto?.nombre ?? null,
            destino: nuevoDestino,
            procedencia: 'manual',
          }
        }),
      )

      if (iguales.length > 0) {
        avisar(
          `${cuantos(iguales.length + 1, 'movimiento')} como ${concepto?.nombre ?? 'sin clasificar'}.`,
        )
      }
    },
    [conceptos, lineas, avisar],
  )

  const cambiarDestino = (ids: number[], destino: DestinoLinea) => {
    setLineas((actuales) =>
      actuales.map((l) => (ids.includes(l.id) ? { ...l, destino, procedencia: 'manual' } : l)),
    )
  }

  const recordar = (linea: LineaExtracto, texto: string) => {
    if (!linea.conceptoId || !texto.trim()) return
    setReglasNuevas((actuales) => {
      if (actuales.some((r) => r.texto.toLowerCase() === texto.trim().toLowerCase())) return actuales
      return [...actuales, { texto: texto.trim().toUpperCase(), conceptoId: linea.conceptoId }]
    })
    avisar(`Se recordará "${texto.trim().toUpperCase()}" → ${linea.concepto}.`)
  }

  /**
   * Sugerencias de la IA para lo que ninguna regla ha reconocido.
   *
   * Una sola llamada con todos, y solo se aplica cuando se pulsa: la IA propone
   * y quien decide sigue siendo quien mira la pantalla.
   */
  const pedirSugerencias = async () => {
    setPidiendoIa(true)
    setAvisoIa('')
    try {
      const r = await api<{
        sugerencias: Record<number, SugerenciaIa>
        aviso: string | null
        cuantas: number
      }>(`/extracto/${importacionId}/sugerir`, { metodo: 'POST', cuerpo: { lineas } })
      setSugerencias(r.sugerencias ?? {})
      if (r.aviso) setAvisoIa(r.aviso)
      avisar(
        r.cuantas > 0
          ? `La IA propone concepto para ${cuantos(r.cuantas, 'movimiento')}.`
          : 'La IA no ha sabido proponer nada.',
      )
    } catch (causa) {
      setAvisoIa(mensajeDeError(causa))
    } finally {
      setPidiendoIa(false)
    }
  }

  /** Parte un movimiento en varios: la suma tiene que dar el original. */
  const dividir = (linea: LineaExtracto, trozos: { importe: number; conceptoId: number | null }[]) => {
    const signo = linea.importe < 0 ? -1 : 1
    setLineas((actuales) => {
      const resto = actuales.filter((l) => l.id !== linea.id)
      // Ids nuevos por encima de los que hay: el marcador cuenta por linea, y
      // dos lineas no pueden compartir id.
      let siguiente = Math.max(...actuales.map((l) => l.id)) + 1
      const nuevas = trozos.map((t, i) => {
        const concepto = conceptos.find((cc) => cc.id === t.conceptoId) ?? null
        return {
          ...linea,
          id: i === 0 ? linea.id : siguiente++,
          importe: signo * Math.abs(t.importe),
          conceptoId: t.conceptoId,
          concepto: concepto?.nombre ?? null,
          destino: (concepto
            ? concepto.tipo === 'sobre'
              ? 'comida'
              : concepto.tipo === 'fijo'
                ? 'fijo'
                : 'variable'
            : 'sinClasificar') as DestinoLinea,
          procedencia: 'manual' as const,
          descripcionLimpia:
            trozos.length > 1 ? `${linea.descripcionLimpia} (${i + 1}/${trozos.length})` : linea.descripcionLimpia,
          // La huella se mantiene: sigue siendo el mismo apunte del banco, y es
          // lo que impide que vuelva a entrar en la proxima importacion.
        }
      })
      const posicion = actuales.findIndex((l) => l.id === linea.id)
      return [...resto.slice(0, posicion), ...nuevas, ...resto.slice(posicion)]
    })
    setDividiendo(null)
    avisar(`Dividido en ${cuantos(trozos.length, 'apunte')}.`)
  }

  // ---- aplicar ----
  const aplicar = async () => {
    setAplicando(true)
    try {
      const resultado = await api<{ conciliados: number; creados: number; comida: number }>(
        `/extracto/${importacionId}/aceptar`,
        { metodo: 'POST', cuerpo: { lineas, conciliaciones, reglasNuevas } },
      )
      onAplicado(resultado)
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setAplicando(false)
      setConfirmando(false)
    }
  }

  /*
   * Teclado en escritorio: flechas para moverse por lo que queda sin
   * clasificar, D para descartar y C para comida. Apuntar veinte movimientos
   * seguidos con el ratón es lo que hace que uno no lo haga.
   */
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(destino?.tagName)) return
      const pendientes = lineas.filter((l) => l.destino === 'sinClasificar' && !l.fueraDeMes)
      if (pendientes.length === 0) return

      const actual = pendientes.findIndex((l) => l.id === enfocada)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const siguiente =
          e.key === 'ArrowDown'
            ? Math.min(actual + 1, pendientes.length - 1)
            : Math.max(actual - 1, 0)
        setEnfocada(pendientes[actual < 0 ? 0 : siguiente].id)
        return
      }

      const linea = pendientes[actual]
      if (!linea) return
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        cambiarDestino([linea.id], 'descartado')
      } else if ((e.key === 'c' || e.key === 'C') && sobre) {
        e.preventDefault()
        asignar(linea, sobre.id)
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [lineas, enfocada, sobre, asignar])

  const filtrar = (lista: LineaExtracto[]) => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return lista
    return lista.filter(
      (l) =>
        l.descripcionLimpia.toLowerCase().includes(texto) ||
        l.descripcionOriginal.toLowerCase().includes(texto) ||
        String(Math.abs(l.importe)).includes(texto),
    )
  }

  const sinClasificar = filtrar(lineas.filter((l) => l.destino === 'sinClasificar' && !l.fueraDeMes))
  const clasificados = filtrar(
    lineas.filter((l) => ['comida', 'variable'].includes(l.destino) && !l.fueraDeMes),
  ).sort((a, b) => Math.abs(b.importe) - Math.abs(a.importe))
  const fueraDeMes = filtrar(lineas.filter((l) => l.fueraDeMes && l.destino !== 'duplicado'))
  const omitidos = filtrar(lineas.filter((l) => l.destino === 'omitido'))
  const duplicados = filtrar(lineas.filter((l) => l.destino === 'duplicado'))
  const descartados = filtrar(lineas.filter((l) => l.destino === 'descartado'))

  const motivoBloqueo = !cuenta.cuadra
    ? 'Las cuentas no cuadran.'
    : cuenta.sinClasificar > 0
      ? `Quedan ${cuantos(cuenta.sinClasificar, 'movimiento')} sin clasificar.`
      : ''

  return (
    <div className="revision-extracto">
      <div className="marcador">
        <div className="marcador-cifras">
          <strong>{cuenta.total}</strong> movimientos ={' '}
          <Cifra n={cuenta.fijos} que="fijos" />
          <Cifra n={cuenta.comida} que="comida" />
          <Cifra n={cuenta.variables} que="variables" />
          <Cifra n={cuenta.omitidos} que="omitidos" />
          <Cifra n={cuenta.descartados} que="descartados" />
          <Cifra n={cuenta.fueraDeMes} que="fuera de mes" />
          <Cifra n={cuenta.duplicados} que="duplicados" />
          {cuenta.sinClasificar > 0 ? (
            <span className="cifra pendiente">
              <strong>{cuenta.sinClasificar}</strong> sin clasificar
            </span>
          ) : null}
        </div>

        <div className="marcador-acciones">
          <input
            className="campo-linea texto campo-buscar"
            placeholder="Buscar texto o importe"
            aria-label="Buscar en el extracto"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {cuenta.sinClasificar > 0 ? (
            <button
              className="boton boton-secundario"
              disabled={pidiendoIa}
              onClick={() => void pedirSugerencias()}
            >
              {pidiendoIa ? 'Preguntando…' : 'Pedir ayuda a la IA'}
            </button>
          ) : null}
          <button className="boton boton-texto" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            className="boton boton-principal"
            disabled={!!motivoBloqueo || aplicando}
            title={motivoBloqueo}
            onClick={() => setConfirmando(true)}
          >
            {aplicando ? 'Aplicando…' : 'Aceptar'}
          </button>
        </div>
        {motivoBloqueo ? <p className="marcador-aviso">{motivoBloqueo}</p> : null}
        {avisoIa ? <p className="marcador-aviso">{avisoIa}</p> : null}
      </div>

      {seleccion.size > 0 ? (
        <div className="barra-seleccion">
          <span>{cuantos(seleccion.size, 'seleccionado')}</span>
          <SelectorConcepto
            conceptos={conceptos}
            valor={null}
            ariaLabel="Concepto para los seleccionados"
            placeholder="Asignar concepto…"
            onElegir={(conceptoId) => {
              const concepto = conceptos.find((c) => c.id === conceptoId)
              setLineas((actuales) =>
                actuales.map((l) =>
                  seleccion.has(l.id)
                    ? {
                        ...l,
                        conceptoId,
                        concepto: concepto?.nombre ?? null,
                        destino: concepto?.tipo === 'sobre' ? 'comida' : concepto?.tipo === 'fijo' ? 'fijo' : 'variable',
                        procedencia: 'manual',
                      }
                    : l,
                ),
              )
              setSeleccion(new Set())
            }}
          />
          {sobre ? (
            <button
              className="boton boton-secundario boton-compacto"
              onClick={() => {
                setLineas((actuales) =>
                  actuales.map((l) =>
                    seleccion.has(l.id)
                      ? { ...l, conceptoId: sobre.id, concepto: sobre.nombre, destino: 'comida', procedencia: 'manual' }
                      : l,
                  ),
                )
                setSeleccion(new Set())
              }}
            >
              Es comida
            </button>
          ) : null}
          <button
            className="boton boton-secundario boton-compacto"
            onClick={() => {
              cambiarDestino([...seleccion], 'descartado')
              setSeleccion(new Set())
            }}
          >
            Descartar
          </button>
          <button className="boton boton-texto boton-compacto" onClick={() => setSeleccion(new Set())}>
            Quitar selección
          </button>
        </div>
      ) : null}

      <Bloque
        titulo="Sin clasificar"
        cuantos={sinClasificar.length}
        destacado
        abierto={abiertos.sin}
        onAlternar={() => setAbiertos((a) => ({ ...a, sin: !a.sin }))}
        vacio="Ninguno: todo tiene concepto."
      >
        {sinClasificar.map((linea) => (
          <FilaExtracto
            key={linea.id}
            linea={linea}
            conceptos={conceptos}
            sobre={sobre}
            sugerencia={sugerencias[linea.id] ?? null}
            enfocada={enfocada === linea.id}
            seleccionada={seleccion.has(linea.id)}
            onSeleccionar={(marcada) =>
              setSeleccion((s) => {
                const nueva = new Set(s)
                if (marcada) nueva.add(linea.id)
                else nueva.delete(linea.id)
                return nueva
              })
            }
            onAsignar={(conceptoId) => asignar(linea, conceptoId)}
            onDescartar={() => cambiarDestino([linea.id], 'descartado')}
            onRecordar={(texto) => recordar(linea, texto)}
            onDividir={() => setDividiendo(linea)}
          />
        ))}
      </Bloque>

      <Bloque
        titulo="Variables y comida"
        cuantos={clasificados.length}
        abierto={abiertos.clasificados}
        onAlternar={() => setAbiertos((a) => ({ ...a, clasificados: !a.clasificados }))}
        vacio="Nada todavía."
      >
        {clasificados.map((linea) => (
          <FilaExtracto
            key={linea.id}
            linea={linea}
            conceptos={conceptos}
            sobre={sobre}
            sugerencia={sugerencias[linea.id] ?? null}
            enfocada={enfocada === linea.id}
            seleccionada={seleccion.has(linea.id)}
            onSeleccionar={(marcada) =>
              setSeleccion((s) => {
                const nueva = new Set(s)
                if (marcada) nueva.add(linea.id)
                else nueva.delete(linea.id)
                return nueva
              })
            }
            onAsignar={(conceptoId) => asignar(linea, conceptoId)}
            onDescartar={() => cambiarDestino([linea.id], 'descartado')}
            onRecordar={(texto) => recordar(linea, texto)}
            onDividir={() => setDividiendo(linea)}
          />
        ))}
      </Bloque>

      <Bloque
        titulo="Fijos"
        cuantos={conciliaciones.length}
        abierto={abiertos.fijos}
        onAlternar={() => setAbiertos((a) => ({ ...a, fijos: !a.fijos }))}
        vacio="El extracto no trae ningún fijo reconocido."
      >
        <div className="tabla-conciliacion">
          <div className="conciliacion-fila cabecera" aria-hidden="true">
            <span>Concepto</span>
            <span>Previsto</span>
            <span>Real</span>
            <span>Diferencia</span>
            <span>Qué hago</span>
          </div>
          {conciliaciones.map((c) => (
            <FilaConciliacion
              key={c.conceptoId}
              conciliacion={c}
              onCambiar={(accion) =>
                setConciliaciones((actuales) =>
                  actuales.map((x) => (x.conceptoId === c.conceptoId ? { ...x, accion } : x)),
                )
              }
            />
          ))}
        </div>

        {propuesta.fijosSinEncontrar.length > 0 ? (
          <p className="pista">
            Siguen pendientes, el extracto no los menciona:{' '}
            {propuesta.fijosSinEncontrar.map((f) => f.concepto).join(', ')}.
          </p>
        ) : null}
      </Bloque>

      <Bloque
        titulo="Fuera de mes, omitidos y duplicados"
        cuantos={fueraDeMes.length + omitidos.length + duplicados.length + descartados.length}
        abierto={abiertos.resto}
        onAlternar={() => setAbiertos((a) => ({ ...a, resto: !a.resto }))}
        vacio="Nada aquí."
      >
        <SubBloque titulo="Fuera del mes" lineas={fueraDeMes} />
        <SubBloque
          titulo="Ingresos omitidos"
          nota="Solo entra lo que resta. Se pueden rescatar de uno en uno."
          lineas={omitidos}
        />
        <SubBloque titulo="Duplicados" nota="Ya entraron en una importación anterior." lineas={duplicados} />
        <SubBloque
          titulo="Descartados"
          lineas={descartados}
          onRecuperar={(id) => cambiarDestino([id], 'sinClasificar')}
        />
      </Bloque>

      <SheetDividir
        linea={dividiendo}
        conceptos={conceptos}
        onCerrar={() => setDividiendo(null)}
        onDividir={(trozos) => dividiendo && dividir(dividiendo, trozos)}
      />

      <Confirmar
        abierto={confirmando}
        titulo="¿Aplicar la importación?"
        mensaje={
          `Entrarán ${cuantos(cuenta.fijos, 'fijo')} conciliados, ` +
          `${cuantos(cuenta.comida, 'compra')} de comida y ${cuantos(cuenta.variables, 'gasto variable', 'gastos variables')}. ` +
          (reglasNuevas.length > 0 ? `Se recordarán ${cuantos(reglasNuevas.length, 'regla', 'reglas')}. ` : '') +
          'Se puede deshacer entera después.'
        }
        textoConfirmar="Aplicar"
        onConfirmar={() => void aplicar()}
        onCancelar={() => setConfirmando(false)}
      />
    </div>
  )
}

function Cifra({ n, que }: { n: number; que: string }) {
  if (n === 0) return null
  return (
    <span className="cifra">
      <strong>{n}</strong> {que}
    </span>
  )
}

function Bloque({
  titulo,
  cuantos: cuantosHay,
  abierto,
  onAlternar,
  destacado = false,
  vacio,
  children,
}: {
  titulo: string
  cuantos: number
  abierto: boolean
  onAlternar: () => void
  destacado?: boolean
  vacio: string
  children: React.ReactNode
}) {
  return (
    <section className={`bloque-extracto${destacado && cuantosHay > 0 ? ' destacado' : ''}`}>
      <button className="bloque-cabecera" onClick={onAlternar} aria-expanded={abierto}>
        <span className="seccion-titulo">
          {titulo}
          {cuantosHay > 0 ? <span className="bloque-cuenta">{cuantosHay}</span> : null}
        </span>
        <span aria-hidden="true">{abierto ? '−' : '+'}</span>
      </button>
      {abierto ? (
        cuantosHay === 0 ? (
          <p className="pista">{vacio}</p>
        ) : (
          <div className="tarjeta">{children}</div>
        )
      ) : null}
    </section>
  )
}

function FilaExtracto({
  linea,
  conceptos,
  sobre,
  sugerencia,
  enfocada,
  seleccionada,
  onSeleccionar,
  onAsignar,
  onDescartar,
  onRecordar,
  onDividir,
}: {
  linea: LineaExtracto
  conceptos: Concepto[]
  sobre: Concepto | null
  sugerencia: SugerenciaIa | null
  enfocada: boolean
  seleccionada: boolean
  onSeleccionar: (marcada: boolean) => void
  onAsignar: (conceptoId: number | null) => void
  onDescartar: () => void
  onRecordar: (texto: string) => void
  onDividir: () => void
}) {
  const [recordando, setRecordando] = useState(false)
  const [texto, setTexto] = useState('')

  return (
    <div
      className={
        'linea-extracto' + (seleccionada ? ' seleccionada' : '') + (enfocada ? ' enfocada' : '')
      }
    >
      <input
        type="checkbox"
        className="casilla"
        aria-label={`Seleccionar ${linea.descripcionLimpia}`}
        checked={seleccionada}
        onChange={(e) => onSeleccionar(e.target.checked)}
      />

      <span className="linea-fecha">{linea.fecha ? fechaCorta(linea.fecha) : '—'}</span>

      <span className="linea-texto">
        <span className="linea-limpia">{linea.descripcionLimpia}</span>
        <span className="linea-original">{linea.descripcionOriginal}</span>
        {linea.nota ? <span className="linea-nota">{linea.nota}</span> : null}
      </span>

      <span className="linea-importe dinero">{euros(Math.abs(linea.importe))}</span>

      <span className="linea-concepto">
        {sugerencia && !linea.conceptoId ? (
          <button
            className={`sugerencia-ia ${sugerencia.confianza}`}
            title={sugerencia.porque}
            onClick={() => onAsignar(sugerencia.conceptoId)}
          >
            ¿{sugerencia.concepto}?
          </button>
        ) : null}
        <SelectorConcepto
          conceptos={conceptos}
          valor={linea.conceptoId}
          ariaLabel={`Concepto de ${linea.descripcionLimpia}`}
          placeholder="Elegir…"
          onElegir={onAsignar}
        />
        {linea.procedencia !== 'ninguno' && linea.procedencia !== 'manual' ? (
          <span className={`marca-origen ${linea.procedencia}`}>
            {ETIQUETAS_PROCEDENCIA[linea.procedencia]}
          </span>
        ) : null}
      </span>

      <span className="linea-acciones">
        {sobre ? (
          <button
            className="boton boton-texto boton-compacto"
            title="Marcar como comida"
            onClick={() => onAsignar(sobre.id)}
          >
            Comida
          </button>
        ) : null}
        <button className="boton boton-texto boton-compacto" onClick={onDividir}>
          Dividir
        </button>
        <button className="boton boton-texto boton-compacto" onClick={onDescartar}>
          Descartar
        </button>
        {linea.conceptoId ? (
          recordando ? (
            <span className="recordar-fila">
              <input
                className="campo-linea texto"
                aria-label="Texto que recordar"
                value={texto}
                autoFocus
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onRecordar(texto)
                    setRecordando(false)
                  }
                  if (e.key === 'Escape') setRecordando(false)
                }}
              />
              <button
                className="boton boton-secundario boton-compacto"
                onClick={() => {
                  onRecordar(texto)
                  setRecordando(false)
                }}
              >
                Recordar
              </button>
            </span>
          ) : (
            <button
              className="boton boton-texto boton-compacto"
              onClick={() => {
                setTexto(primeraPalabra(linea.descripcionLimpia))
                setRecordando(true)
              }}
            >
              Recordar
            </button>
          )
        ) : null}
      </span>
    </div>
  )
}

/** La primera palabra con sentido: en el banco, el comercio va delante. */
function primeraPalabra(texto: string) {
  const palabras = texto
    .split(/[^A-Za-zÀ-ÿ0-9]+/)
    .filter((p) => p.length >= 4 && !/\d/.test(p))
  return (palabras[0] ?? texto).toUpperCase()
}

function FilaConciliacion({
  conciliacion,
  onCambiar,
}: {
  conciliacion: Conciliacion
  onCambiar: (accion: Conciliacion['accion']) => void
}) {
  const previsto = conciliacion.importePrevisto
  const diferencia = previsto === null || previsto === 0 ? null : conciliacion.importe - previsto
  const desviado = diferencia !== null && previsto ? Math.abs(diferencia / previsto) > 0.1 : false

  return (
    <div className="conciliacion-fila">
      <span className="conciliacion-concepto">
        {conciliacion.concepto}
        {conciliacion.cuantasLineas > 1 ? (
          <span className="linea-nota">{conciliacion.cuantasLineas} líneas sumadas</span>
        ) : null}
        {conciliacion.situacion === 'ya-cobrado' ? (
          <span className="linea-nota aviso">Ya estaba cobrado</span>
        ) : null}
        {conciliacion.situacion === 'no-existe' ? (
          <span className="linea-nota aviso">No está en el mes</span>
        ) : null}
      </span>
      <span className="dinero apagado">{previsto === null ? '—' : euros(previsto)}</span>
      <span className="dinero">{euros(conciliacion.importe)}</span>
      <span className={`dinero${desviado ? ' negativo' : ''}`}>
        {diferencia === null ? '—' : (diferencia > 0 ? '+' : '') + euros(diferencia)}
      </span>
      <select
        className="campo-linea"
        aria-label={`Qué hacer con ${conciliacion.concepto}`}
        value={conciliacion.accion}
        onChange={(e) => onCambiar(e.target.value as Conciliacion['accion'])}
      >
        {conciliacion.situacion === 'no-existe' ? (
          <option value="crear">Crear el fijo en el mes</option>
        ) : (
          <option value="conciliar">Marcar cobrado</option>
        )}
        {conciliacion.situacion === 'ya-cobrado' ? (
          <option value="conciliar">Sustituir el importe</option>
        ) : null}
        <option value="descartar">No tocarlo</option>
      </select>
    </div>
  )
}

function SubBloque({
  titulo,
  nota,
  lineas,
  onRecuperar,
}: {
  titulo: string
  nota?: string
  lineas: LineaExtracto[]
  onRecuperar?: (id: number) => void
}) {
  if (lineas.length === 0) return null
  return (
    <div className="sub-bloque">
      <h4 className="subseccion">
        {titulo} · {lineas.length}
      </h4>
      {nota ? <p className="pista">{nota}</p> : null}
      {lineas.map((l) => (
        <div className="linea-simple" key={l.id}>
          <span className="linea-fecha">{l.fecha ? fechaCorta(l.fecha) : '—'}</span>
          <span className="linea-limpia">{l.descripcionLimpia}</span>
          <span className="dinero">{euros(Math.abs(l.importe))}</span>
          {onRecuperar ? (
            <button className="boton boton-texto boton-compacto" onClick={() => onRecuperar(l.id)}>
              Recuperar
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/**
 * Partir un movimiento en varios conceptos.
 *
 * La suma tiene que dar exactamente el importe original: una compra de 120 € no
 * puede convertirse en 100 € por despiste. Hasta que cuadra, no deja aplicar.
 */
function SheetDividir({
  linea,
  conceptos,
  onCerrar,
  onDividir,
}: {
  linea: LineaExtracto | null
  conceptos: Concepto[]
  onCerrar: () => void
  onDividir: (trozos: { importe: number; conceptoId: number | null }[]) => void
}) {
  const [trozos, setTrozos] = useState<{ importe: string; conceptoId: number | null }[]>([])

  useEffect(() => {
    if (!linea) return
    const total = Math.abs(linea.importe)
    setTrozos([
      { importe: escribirImporte(total), conceptoId: linea.conceptoId },
      { importe: '', conceptoId: null },
    ])
  }, [linea])

  if (!linea) return null

  const total = Math.abs(linea.importe)
  const suma = trozos.reduce((t, x) => t + (leerImporte(x.importe) ?? 0), 0)
  const cuadra = Math.abs(suma - total) < 0.005
  const completos = trozos.every((x) => (leerImporte(x.importe) ?? 0) > 0 && x.conceptoId !== null)

  return (
    <Sheet abierta={!!linea} titulo="Dividir el movimiento" onCerrar={onCerrar}>
      <p className="seccion-pista">
        {linea.descripcionLimpia} · <strong>{euros(total)}</strong>. Los trozos tienen que sumar
        exactamente eso.
      </p>

      {trozos.map((trozo, i) => (
        <div className="fila" key={i}>
          <CampoImporte
            valor={leerImporte(trozo.importe)}
            admiteVacio
            ariaLabel={`Importe del trozo ${i + 1}`}
            onGuardar={(v) =>
              setTrozos((actuales) =>
                actuales.map((x, j) => (j === i ? { ...x, importe: escribirImporte(v) } : x)),
              )
            }
          />
          <SelectorConcepto
            conceptos={conceptos}
            valor={trozo.conceptoId}
            ariaLabel={`Concepto del trozo ${i + 1}`}
            placeholder="Concepto…"
            onElegir={(conceptoId) =>
              setTrozos((actuales) => actuales.map((x, j) => (j === i ? { ...x, conceptoId } : x)))
            }
          />
          {trozos.length > 2 ? (
            <button
              className="boton boton-texto boton-compacto"
              onClick={() => setTrozos((actuales) => actuales.filter((_, j) => j !== i))}
            >
              Quitar
            </button>
          ) : null}
        </div>
      ))}

      <div className="fila-botones">
        <button
          className="boton boton-secundario boton-compacto"
          onClick={() => setTrozos((actuales) => [...actuales, { importe: '', conceptoId: null }])}
        >
          Añadir otro
        </button>
        <span className={`pista${cuadra ? '' : ' descuadre'}`}>
          Suman {euros(suma)} de {euros(total)}
          {cuadra ? ' ✓' : ` · faltan ${euros(total - suma)}`}
        </span>
      </div>

      <button
        className="boton boton-principal boton-ancho"
        disabled={!cuadra || !completos}
        onClick={() =>
          onDividir(
            trozos.map((x) => ({ importe: leerImporte(x.importe) ?? 0, conceptoId: x.conceptoId })),
          )
        }
      >
        Dividir
      </button>
    </Sheet>
  )
}
