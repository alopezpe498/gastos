import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type {
  Concepto,
  Conciliacion,
  ContadorExtracto,
  DestinoLinea,
  LineaExtracto,
  PlantillaPropuesta,
  PropuestaExtracto,
  ReglaNueva,
  SugerenciaIa,
} from '../../lib/tipos'
import { BotonPrimario, BotonTexto, Cabecera, Card, Chip, MenuFila } from '../../components/ui/Basicos'
import { CampoImporte, CampoTexto, SelectorConcepto } from '../../components/ui/Campos'
import { ConfirmacionDialogo, Dialogo } from '../../components/ui/Dialogo'
import { Importe } from '../../components/ui/Fila'
import { Icono } from '../../components/ui/Icono'
import { useAvisos } from '../../components/ui/Toast'
import {
  cuantos,
  escribirImporte,
  euros,
  fecha as fechaCorta,
  fechaMuyCorta,
  leerImporte,
} from '../../lib/formato'

/**
 * Revisión de un extracto antes de aplicarlo.
 *
 * La pantalla gira alrededor de un número: **el marcador de arriba tiene que
 * cuadrar**. Los N movimientos del fichero se reparten entre fijos, comida,
 * variables, el ingreso, descartados y duplicados, y no se puede aceptar
 * mientras quede uno sin sitio. Ese es el único miedo real al importar del
 * banco: que algo se pierda por el camino.
 *
 * EL EXTRACTO DEFINE EL MES. No hay filtrado por fechas ni bloque de "fuera de
 * mes": el mes de esta casa va de una nómina a la siguiente, y el fichero se
 * descarga justo entre las dos, así que todo lo que trae pertenece al mes.
 */

const ETIQUETAS_PROCEDENCIA: Record<LineaExtracto['procedencia'], string> = {
  regla: 'regla',
  aprendida: 'aprendida',
  ia: 'IA',
  manual: 'a mano',
  ninguno: '',
}

const ETIQUETAS_ACCION: Record<Conciliacion['accion'], string> = {
  cobrar: 'Se marcará cobrado',
  actualizar: 'Se actualiza el importe',
  crear: 'Se creará en el mes',
  igual: 'Ya estaba igual',
}

type Props = {
  propuesta: PropuestaExtracto
  nombreMes: string
  onAplicado: (resumen: ResultadoAceptar) => void
  onCancelar: () => void
  /** Lleva al historial de importaciones, para poder deshacer la anterior. */
  onVerHistorial?: () => void
}

export type ResultadoAceptar = {
  cobrados: number
  actualizados: number
  creados: number
  comida: number
  variables: number
  plantillaActualizada: number
  ingreso: { antes: number; despues: number } | null
}

export function RevisionExtracto({
  propuesta,
  nombreMes,
  onAplicado,
  onCancelar,
  onVerHistorial,
}: Props) {
  const { avisar, avisarError } = useAvisos()
  const [lineas, setLineas] = useState<LineaExtracto[]>(propuesta.lineas)
  const [conciliaciones] = useState<Conciliacion[]>(propuesta.conciliaciones)
  const [plantilla, setPlantilla] = useState<PlantillaPropuesta[]>(propuesta.plantillaPropuesta ?? [])
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [reglasNuevas, setReglasNuevas] = useState<ReglaNueva[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [abiertos, setAbiertos] = useState({
    sin: true,
    clasificados: true,
    fijos: true,
    // Si el extracto entero es duplicado, el bloque se abre: es lo único que hay.
    resto: propuesta.resumen.duplicados === propuesta.lineas.length,
  })
  const [confirmando, setConfirmando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [sugerencias, setSugerencias] = useState<Record<number, SugerenciaIa>>({})
  const [pidiendoIa, setPidiendoIa] = useState(false)
  const [avisoIa, setAvisoIa] = useState('')
  const [dividiendo, setDividiendo] = useState<LineaExtracto | null>(null)
  const [enfocada, setEnfocada] = useState<number | null>(null)
  // Las que acaban de moverse de bloque: se resaltan dos segundos.
  const [reciennnacidas, setRecien] = useState<Set<number>>(new Set())
  // Para deshacer el último cambio con Ctrl+Z o el enlace de cinco segundos.
  const [ultimo, setUltimo] = useState<{ lineas: LineaExtracto[]; que: string } | null>(null)

  const conceptos = propuesta.conceptos
  const importacionId = propuesta.importacion.id
  const periodo = propuesta.lectura.periodo

  /*
   * El orden del desplegable: primero los más usados en los últimos meses (los
   * manda el servidor), después los que ya se han usado en ESTE extracto, y
   * detrás el resto. Con cincuenta conceptos, esto ahorra la mitad del trabajo.
   */
  const frecuentes = useMemo(() => {
    const usadosAqui = [...new Set(lineas.map((l) => l.conceptoId).filter(Boolean) as number[])]
    return [...new Set([...(propuesta.frecuentes ?? []), ...usadosAqui])]
  }, [propuesta.frecuentes, lineas])

  // ---- el marcador ----
  const cuenta: ContadorExtracto = useMemo(() => {
    const c = {
      total: lineas.length,
      fijos: 0,
      variables: 0,
      comida: 0,
      ingreso: 0,
      descartados: 0,
      duplicados: 0,
      sinClasificar: 0,
    }
    for (const l of lineas) {
      if (l.destino === 'descartado') c.descartados += 1
      else if (l.destino === 'duplicado') c.duplicados += 1
      else if (l.destino === 'ingreso') c.ingreso += 1
      else if (l.destino === 'fijo') c.fijos += 1
      else if (l.destino === 'comida') c.comida += 1
      else if (l.destino === 'variable') c.variables += 1
      else c.sinClasificar += 1
    }
    const suma =
      c.fijos + c.variables + c.comida + c.ingreso + c.descartados + c.duplicados + c.sinClasificar
    return { ...c, suma, cuadra: suma === c.total }
  }, [lineas])

  // ---- el borrador se guarda solo ----
  const guardado = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearTimeout(guardado.current)
    guardado.current = window.setTimeout(() => {
      void api(`/extracto/${importacionId}/borrador`, {
        metodo: 'PATCH',
        cuerpo: { lineas, conciliaciones, plantilla, periodo },
      }).catch(() => {
        // Que falle el autoguardado no puede molestar en medio de la revisión.
      })
    }, 1200)
    return () => window.clearTimeout(guardado.current)
  }, [lineas, conciliaciones, plantilla, periodo, importacionId])

  /** Guarda el estado anterior para poder deshacer, y resalta lo que se mueve. */
  const recordarParaDeshacer = (que: string) => {
    setUltimo({ lineas, que })
    window.setTimeout(() => setUltimo((u) => (u?.que === que ? null : u)), 5000)
  }

  const resaltar = (ids: number[]) => {
    setRecien(new Set(ids))
    window.setTimeout(() => setRecien(new Set()), 2000)
  }

  /** Cambia una línea y, de paso, todas las que digan lo mismo. */
  const asignar = useCallback(
    (linea: LineaExtracto, conceptoId: number | null) => {
      const concepto = conceptos.find((c) => c.id === conceptoId) ?? null
      const destino: DestinoLinea =
        concepto === null
          ? 'sinClasificar'
          : concepto.tipo === 'sobre'
            ? 'comida'
            : concepto.tipo === 'fijo'
              ? 'fijo'
              : 'variable'

      const iguales = lineas.filter(
        (l) =>
          l.id !== linea.id &&
          l.destino === 'sinClasificar' &&
          l.descripcionLimpia === linea.descripcionLimpia,
      )
      const tocadas = [linea.id, ...iguales.map((i) => i.id)]

      recordarParaDeshacer(`${concepto?.nombre ?? 'sin clasificar'}`)
      setLineas((actuales) =>
        actuales.map((l) =>
          tocadas.includes(l.id)
            ? { ...l, conceptoId, concepto: concepto?.nombre ?? null, destino, procedencia: 'manual' }
            : l,
        ),
      )
      resaltar(tocadas)

      if (iguales.length > 0) {
        avisar(`${cuantos(tocadas.length, 'movimiento')} como ${concepto?.nombre ?? '—'}.`)
      }

      // El foco salta al siguiente pendiente: apuntar veinte seguidos sin
      // volver a coger el ratón es la diferencia entre hacerlo y no hacerlo.
      const pendientes = lineas.filter(
        (l) => l.destino === 'sinClasificar' && !tocadas.includes(l.id),
      )
      setEnfocada(pendientes[0]?.id ?? null)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conceptos, lineas, avisar],
  )

  const cambiarDestino = (ids: number[], destino: DestinoLinea, que: string) => {
    recordarParaDeshacer(que)
    setLineas((actuales) =>
      actuales.map((l) => (ids.includes(l.id) ? { ...l, destino, procedencia: 'manual' } : l)),
    )
    resaltar(ids)
  }

  const deshacer = () => {
    if (!ultimo) return
    setLineas(ultimo.lineas)
    setUltimo(null)
    avisar('Deshecho.')
  }

  const recordar = (linea: LineaExtracto, regla: ReglaNueva) => {
    if (!linea.conceptoId || !regla.texto.trim()) return
    setReglasNuevas((actuales) => {
      if (actuales.some((r) => r.texto.toLowerCase() === regla.texto.trim().toLowerCase())) {
        return actuales
      }
      return [...actuales, { ...regla, texto: regla.texto.trim(), conceptoId: linea.conceptoId }]
    })
    avisar(`Se recordará "${regla.texto.trim()}" → ${linea.concepto}.`)
  }

  /**
   * La IA se pide SOLA al abrir la revisión, sobre lo que las reglas no han
   * reconocido. Una sola llamada. El botón queda solo para reintentar.
   */
  const pedirSugerencias = useCallback(
    async (automatico = false) => {
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
        if (!automatico) {
          avisar(
            r.cuantas > 0
              ? `La IA propone concepto para ${cuantos(r.cuantas, 'movimiento')}.`
              : 'La IA no ha sabido proponer nada.',
          )
        }
      } catch (causa) {
        // En automático no se grita: se deja el aviso y ya está.
        setAvisoIa(mensajeDeError(causa))
      } finally {
        setPidiendoIa(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [importacionId],
  )

  const yaPedida = useRef(false)
  useEffect(() => {
    if (yaPedida.current) return
    yaPedida.current = true
    if (propuesta.lineas.some((l) => l.destino === 'sinClasificar')) void pedirSugerencias(true)
  }, [propuesta.lineas, pedirSugerencias])

  /** Parte un movimiento en varios: la suma tiene que dar el original. */
  const dividir = (linea: LineaExtracto, trozos: { importe: number; conceptoId: number | null }[]) => {
    const signo = linea.importe < 0 ? -1 : 1
    recordarParaDeshacer('dividir')
    setLineas((actuales) => {
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
            trozos.length > 1
              ? `${linea.descripcionLimpia} (${i + 1}/${trozos.length})`
              : linea.descripcionLimpia,
        }
      })
      const posicion = actuales.findIndex((l) => l.id === linea.id)
      const resto = actuales.filter((l) => l.id !== linea.id)
      return [...resto.slice(0, posicion), ...nuevas, ...resto.slice(posicion)]
    })
    setDividiendo(null)
    avisar(`Dividido en ${cuantos(trozos.length, 'apunte')}.`)
  }

  // ---- teclado ----
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        deshacer()
        return
      }
      const destino = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(destino?.tagName)) return

      const pendientes = lineas.filter((l) => l.destino === 'sinClasificar')
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
        cambiarDestino([linea.id], 'descartado', 'descartar')
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, enfocada, ultimo])

  // ---- aplicar ----
  const aplicar = async () => {
    setAplicando(true)
    try {
      const resultado = await api<ResultadoAceptar>(`/extracto/${importacionId}/aceptar`, {
        metodo: 'POST',
        cuerpo: { lineas, conciliaciones, reglasNuevas, plantilla, periodo },
      })
      onAplicado(resultado)
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setAplicando(false)
      setConfirmando(false)
    }
  }

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

  const sinClasificar = filtrar(lineas.filter((l) => l.destino === 'sinClasificar'))
  const clasificados = filtrar(
    lineas.filter((l) => ['comida', 'variable'].includes(l.destino)),
  ).sort((a, b) => Math.abs(b.importe) - Math.abs(a.importe))
  const laNomina = lineas.find((l) => l.destino === 'ingreso') ?? null
  const duplicados = filtrar(lineas.filter((l) => l.destino === 'duplicado'))
  // Todo el fichero ya estaba importado: es el caso que dejaba sin salida.
  const todoDuplicado = lineas.length > 0 && cuenta.duplicados === lineas.length
  const descartados = filtrar(lineas.filter((l) => l.destino === 'descartado'))

  const irAlPrimeroPendiente = () => {
    const primero = lineas.find((l) => l.destino === 'sinClasificar')
    if (!primero) return
    setAbiertos((a) => ({ ...a, sin: true }))
    setEnfocada(primero.id)
    document
      .querySelector(`[data-linea="${primero.id}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  const frase =
    cuenta.sinClasificar > 0
      ? `Esto es un borrador. Quedan ${cuenta.sinClasificar} sin clasificar; cuando estén todos, Aceptar los mete en ${nombreMes}.`
      : `Todo clasificado. Aceptar aplica ${cuantos(cuenta.fijos, 'fijo')}, ` +
        `${cuantos(cuenta.variables, 'variable')}, ${cuantos(cuenta.comida, 'compra')} de comida` +
        `${laNomina ? ' y el ingreso' : ''}.`

  return (
    <div className="pila">
      <Cabecera
        titulo={`Revisar ${nombreMes}`}
        subtitulo={
          (periodo?.desde && periodo?.hasta
            ? `Del ${fechaMuyCorta(periodo.desde)} al ${fechaMuyCorta(periodo.hasta)}`
            : '') + (laNomina ? ` · nómina ${euros(Math.abs(laNomina.importe))}` : '')
        }
        acciones={
          <>
            {ultimo ? <BotonTexto onClick={deshacer}>Deshacer «{ultimo.que}»</BotonTexto> : null}
            {cuenta.sinClasificar > 0 ? (
              <BotonTexto icono="chispa" disabled={pidiendoIa} onClick={() => void pedirSugerencias()}>
                {pidiendoIa ? 'Preguntando…' : 'Pedir ayuda a la IA'}
              </BotonTexto>
            ) : null}
            <BotonTexto onClick={onCancelar}>Cancelar</BotonTexto>
            <BotonPrimario
              disabled={cuenta.sinClasificar > 0 || !cuenta.cuadra || aplicando}
              onClick={() => setConfirmando(true)}
            >
              {aplicando ? 'Aplicando…' : 'Aceptar'}
            </BotonPrimario>
          </>
        }
      />

      <Card>
        {/* El conteo, en una línea: es un marcador, no una tabla. */}
        <p className="conteo">
          <b>{cuenta.total}</b> movimientos ={' '}
          <Cifra n={cuenta.fijos} que="fijos" />
          <Cifra n={cuenta.comida} que="comida" />
          <Cifra n={cuenta.variables} que="variables" />
          <Cifra n={cuenta.ingreso} que="ingreso" />
          <Cifra n={cuenta.descartados} que="descartados" />
          <Cifra n={cuenta.duplicados} que="duplicados" />
          {cuenta.sinClasificar > 0 ? (
            <button className="chip conteo-pendiente" onClick={irAlPrimeroPendiente}>
              <b>{cuenta.sinClasificar}</b> sin clasificar · ir al primero
            </button>
          ) : null}
        </p>
        <p className={`muted${cuenta.sinClasificar > 0 ? ' pendiente' : ''}`}>{frase}</p>

        <div className="fila-campos" style={{ marginTop: 12 }}>
          <span style={{ flex: 1, minWidth: 200, maxWidth: 340 }}>
            <CampoTexto
              valor={busqueda}
              visible
              etiqueta="Buscar en el extracto"
              placeholder="Buscar texto o importe"
              onGuardar={setBusqueda}
            />
          </span>
        </div>

        {todoDuplicado ? (
          <p className="aviso-ambar">
            <Icono nombre="aviso" size={16} />
            <span>
              Este extracto ya se importó
              {propuesta.yaImportado
                ? ` en ${propuesta.yaImportado.nombreMes} ${propuesta.yaImportado.anio} el ${fechaCorta(propuesta.yaImportado.fecha.slice(0, 10))}`
                : ''}
              . Si quieres volver a cargarlo, deshaz esa importación desde el historial o fuerza los
              movimientos.
            </span>
            {onVerHistorial ? <BotonTexto onClick={onVerHistorial}>Ir al historial</BotonTexto> : null}
          </p>
        ) : null}
        {avisoIa ? <p className="muted-3">{avisoIa}</p> : null}
        {(propuesta.avisos ?? []).map((a) => (
          <p className="muted-3" key={a}>
            {a}
          </p>
        ))}
      </Card>

      {seleccion.size > 0 ? (
        <div className="barra-seleccion">
          <span>{cuantos(seleccion.size, 'seleccionado')}</span>
          <SelectorConcepto
            conceptos={conceptos}
            valor={null}
            etiqueta="Concepto para los seleccionados"
            placeholder="Asignar concepto…"
            onElegir={(conceptoId) => {
              const concepto = conceptos.find((c) => c.id === conceptoId)
              recordarParaDeshacer('asignar en bloque')
              setLineas((actuales) =>
                actuales.map((l) =>
                  seleccion.has(l.id)
                    ? {
                        ...l,
                        conceptoId,
                        concepto: concepto?.nombre ?? null,
                        destino:
                          concepto?.tipo === 'sobre'
                            ? 'comida'
                            : concepto?.tipo === 'fijo'
                              ? 'fijo'
                              : 'variable',
                        procedencia: 'manual',
                      }
                    : l,
                ),
              )
              resaltar([...seleccion])
              setSeleccion(new Set())
            }}
          />
          <button
            className="boton boton-secundario boton-compacto"
            onClick={() => {
              cambiarDestino([...seleccion], 'descartado', 'descartar en bloque')
              setSeleccion(new Set())
            }}
          >
            Descartar
          </button>
          <button
            className="boton boton-texto boton-compacto"
            onClick={() => setSeleccion(new Set())}
          >
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
            sugerencia={sugerencias[linea.id] ?? null}
            enfocada={enfocada === linea.id}
            recien={reciennnacidas.has(linea.id)}
            seleccionada={seleccion.has(linea.id)}
            descripcionesDelExtracto={lineas.map((l) => l.descripcionOriginal)}
            frecuentes={frecuentes}
            onSeleccionar={(marcada) =>
              setSeleccion((s) => {
                const nueva = new Set(s)
                if (marcada) nueva.add(linea.id)
                else nueva.delete(linea.id)
                return nueva
              })
            }
            onAsignar={(conceptoId) => asignar(linea, conceptoId)}
            onDescartar={() => cambiarDestino([linea.id], 'descartado', 'descartar')}
            onDividir={() => setDividiendo(linea)}
            onRecordar={(regla) => recordar(linea, regla)}
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
            sugerencia={null}
            enfocada={false}
            recien={reciennnacidas.has(linea.id)}
            seleccionada={seleccion.has(linea.id)}
            descripcionesDelExtracto={lineas.map((l) => l.descripcionOriginal)}
            frecuentes={frecuentes}
            onSeleccionar={(marcada) =>
              setSeleccion((s) => {
                const nueva = new Set(s)
                if (marcada) nueva.add(linea.id)
                else nueva.delete(linea.id)
                return nueva
              })
            }
            onAsignar={(conceptoId) => asignar(linea, conceptoId)}
            onDescartar={() => cambiarDestino([linea.id], 'descartado', 'descartar')}
            onDividir={() => setDividiendo(linea)}
            onRecordar={(regla) => recordar(linea, regla)}
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
            <span>Estado</span>
          </div>
          {conciliaciones.map((c) => (
            <FilaConciliacion key={c.conceptoId} conciliacion={c} />
          ))}
        </div>

        {propuesta.fijosSinEncontrar.length > 0 ? (
          <p className="pista">
            Siguen pendientes: {propuesta.fijosSinEncontrar.map((f) => f.concepto).join(', ')}.
          </p>
        ) : null}

        {plantilla.length > 0 ? (
          <>
            <h4 className="subseccion">Actualizar la plantilla con estos importes</h4>
            <p className="pista">
              Desde {plantilla[0]?.vigenteDesde}. Desmarca lo que sea un importe puntual que no se
              va a repetir.
            </p>
            <div className="tarjeta">
              {plantilla.map((p) => (
                <label className="fila" key={p.conceptoId}>
                  <input
                    type="checkbox"
                    className="casilla"
                    checked={p.aplicar}
                    onChange={(e) =>
                      setPlantilla((actuales) =>
                        actuales.map((x) =>
                          x.conceptoId === p.conceptoId ? { ...x, aplicar: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  <span className="fila-cuerpo">
                    <span className="fila-titulo">{p.concepto}</span>
                    <span className="fila-detalle">
                      {euros(p.previsto)} → {euros(p.real)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : null}
      </Bloque>

      <Bloque
        titulo="Duplicados y descartados"
        cuantos={duplicados.length + descartados.length}
        abierto={abiertos.resto}
        onAlternar={() => setAbiertos((a) => ({ ...a, resto: !a.resto }))}
        vacio="Nada aquí."
      >
        <SubBloque
          titulo="Duplicados"
          nota="Ya entraron en una importación aceptada. Se pueden forzar."
          lineas={duplicados}
          textoAccion="Forzar"
          onRecuperar={(id) => cambiarDestino([id], 'sinClasificar', 'forzar duplicado')}
          onTodos={() =>
            cambiarDestino(
              duplicados.map((l) => l.id),
              'sinClasificar',
              'forzar todos los duplicados',
            )
          }
          textoTodos="Forzar todos"
        />
        <SubBloque
          titulo="Descartados"
          lineas={descartados}
          textoAccion="Recuperar"
          onRecuperar={(id) => cambiarDestino([id], 'sinClasificar', 'recuperar')}
        />
      </Bloque>

      <SheetDividir
        linea={dividiendo}
        conceptos={conceptos}
        onCerrar={() => setDividiendo(null)}
        onDividir={(trozos) => dividiendo && dividir(dividiendo, trozos)}
      />

      {confirmando ? (
        <Dialogo titulo="¿Aplicar la importación?" onCerrar={() => setConfirmando(false)}>
          <ConfirmacionDialogo
            frase={
          `Entrarán ${cuantos(cuenta.fijos, 'fijo')}, ${cuantos(cuenta.comida, 'compra')} de comida ` +
          `y ${cuantos(cuenta.variables, 'gasto variable', 'gastos variables')}. ` +
          (laNomina ? `El ingreso pasa a ${euros(Math.abs(laNomina.importe))}. ` : '') +
          (plantilla.filter((p) => p.aplicar).length > 0
            ? `Se actualizarán ${cuantos(plantilla.filter((p) => p.aplicar).length, 'importe')} de la plantilla. `
            : '') +
          (reglasNuevas.length > 0
            ? `Se recordarán ${cuantos(reglasNuevas.length, 'regla', 'reglas')}. `
            : '') +
              'Se puede deshacer entera después.'
            }
            textoConfirmar="Aplicar"
            trabajando={aplicando}
            onConfirmar={() => void aplicar()}
            onCancelar={() => setConfirmando(false)}
          />
        </Dialogo>
      ) : null}
    </div>
  )
}

function Cifra({ n, que }: { n: number; que: string }) {
  if (n === 0) return null
  return (
    <span className="chip">
      <b>{n}</b> {que}
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
  /* El que pide atención (lo que falta por clasificar) va en ámbar. */
  const destaca = destacado && cuantosHay > 0
  return (
    <section className={`card${destaca ? ' pide-atencion' : ''}`}>
      <button className="plegable-cabecera" onClick={onAlternar} aria-expanded={abierto}>
        <span className="card-titulo">
          {titulo}
          {cuantosHay > 0 ? <span className="conteo-burbuja">{cuantosHay}</span> : null}
        </span>
        <span className="muted">
          <Icono nombre={abierto ? 'abajo' : 'chevron'} size={15} />
        </span>
      </button>
      {abierto ? cuantosHay === 0 ? <p className="muted-3">{vacio}</p> : children : null}
    </section>
  )
}

/**
 * Una línea del extracto.
 *
 * Solo lo imprescindible a la vista: casilla, fecha, descripción, importe y el
 * selector. Dividir, descartar y recordar viven en el menú «···», porque son
 * cosas que se hacen de vez en cuando y llenaban la fila de botones.
 */
function FilaExtracto({
  linea,
  conceptos,
  sugerencia,
  enfocada,
  recien,
  seleccionada,
  descripcionesDelExtracto,
  frecuentes,
  onSeleccionar,
  onAsignar,
  onDescartar,
  onDividir,
  onRecordar,
}: {
  linea: LineaExtracto
  conceptos: Concepto[]
  sugerencia: SugerenciaIa | null
  enfocada: boolean
  recien: boolean
  seleccionada: boolean
  descripcionesDelExtracto: string[]
  frecuentes: number[]
  onSeleccionar: (marcada: boolean) => void
  onAsignar: (conceptoId: number | null) => void
  onDescartar: () => void
  onDividir: () => void
  onRecordar: (regla: ReglaNueva) => void
}) {
  const [recordando, setRecordando] = useState(false)

  return (
    <div
      data-linea={linea.id}
      className={
        'linea-extracto' +
        (seleccionada ? ' seleccionada' : '') +
        (enfocada ? ' enfocada' : '') +
        (recien ? ' recien' : '')
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
        <span className="row-titulo">
          {linea.descripcionLimpia}
          {linea.esAbono ? <Chip color="var(--ok)" suave="var(--ok-suave)">abono</Chip> : null}
        </span>
        {/* Debajo, la descripción tal cual la manda el banco: es la que se coteja. */}
        <span className="d">{linea.descripcionOriginal}</span>
        {linea.nota ? <span className="d nota">{linea.nota}</span> : null}
      </span>

      <Importe abono={linea.esAbono}>
        {linea.esAbono ? '−' : ''}
        {euros(Math.abs(linea.importe))}
      </Importe>

      <span className="linea-concepto">
        <SelectorConcepto
          conceptos={conceptos}
          frecuentes={frecuentes}
          valor={linea.conceptoId ?? sugerencia?.conceptoId ?? null}
          etiqueta={`Concepto de ${linea.descripcionLimpia}`}
          placeholder="Elegir…"
          onElegir={onAsignar}
        />
        {!linea.conceptoId && sugerencia ? (
          <Chip
            color="var(--extras)"
            suave="var(--extras-suave)"
            etiqueta={sugerencia.porque}
            onClick={() => onAsignar(sugerencia.conceptoId)}
          >
            IA
          </Chip>
        ) : linea.procedencia !== 'ninguno' && linea.procedencia !== 'manual' ? (
          <Chip>{ETIQUETAS_PROCEDENCIA[linea.procedencia]}</Chip>
        ) : null}
      </span>

      <MenuFila
        etiqueta={`Más acciones para ${linea.descripcionLimpia}`}
        opciones={[
          ...(linea.conceptoId
            ? [{ id: 'recordar', nombre: 'Recordar', icono: 'chispa' as const }]
            : []),
          { id: 'dividir', nombre: 'Dividir', icono: 'dividir' as const },
          { id: 'descartar', nombre: 'Descartar', icono: 'papelera' as const, peligro: true },
        ]}
        onElegir={(id) => {
          if (id === 'recordar') setRecordando(true)
          if (id === 'dividir') onDividir()
          if (id === 'descartar') onDescartar()
        }}
      />

      {recordando ? (
        <SheetRecordar
          linea={linea}
          descripciones={descripcionesDelExtracto}
          onCerrar={() => setRecordando(false)}
          onRecordar={(regla) => {
            onRecordar(regla)
            setRecordando(false)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * Crear la regla que reconocerá esto el mes que viene.
 *
 * El servidor propone el texto, y para las descripciones que no tienen ninguno
 * fijo —los pagos por móvil, con un código distinto cada vez— propone una
 * expresión regular. Antes de crearla se dice **cuántos movimientos de este
 * mismo extracto encajarían**: una regla que solo pilla la línea que tienes
 * delante casi nunca merece la pena.
 */
function SheetRecordar({
  linea,
  descripciones,
  onCerrar,
  onRecordar,
}: {
  linea: LineaExtracto
  descripciones: string[]
  onCerrar: () => void
  onRecordar: (regla: ReglaNueva) => void
}) {
  const [texto, setTexto] = useState('')
  const [coincidencia, setCoincidencia] = useState<ReglaNueva['coincidencia']>('empieza')
  const [explicacion, setExplicacion] = useState('')
  const [encajarian, setEncajarian] = useState<number | null>(null)

  useEffect(() => {
    void api<{
      propuesta: { texto: string; coincidencia: ReglaNueva['coincidencia']; explicacion: string }
      encajarian: number
    }>('/reglas/probar', {
      metodo: 'POST',
      cuerpo: { descripcion: linea.descripcionOriginal, contra: descripciones },
    })
      .then((r) => {
        setTexto(r.propuesta.texto)
        setCoincidencia(r.propuesta.coincidencia)
        setExplicacion(r.propuesta.explicacion)
        setEncajarian(r.encajarian)
      })
      .catch(() => setTexto(''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linea.id])

  const recontar = async (nuevoTexto: string, nuevaCoincidencia: ReglaNueva['coincidencia']) => {
    try {
      const r = await api<{ encajarian: number }>('/reglas/probar', {
        metodo: 'POST',
        cuerpo: { descripcion: nuevoTexto, contra: descripciones },
      })
      setEncajarian(r.encajarian)
    } catch {
      setEncajarian(null)
    }
    void nuevaCoincidencia
  }

  return (
    <Dialogo titulo={`Recordar → ${linea.concepto}`} onCerrar={onCerrar}>
      <p className="seccion-pista">
        Se creará una regla para que el mes que viene esto se clasifique solo.
        {explicacion ? ` Esta descripción es ${explicacion}.` : ''}
      </p>

      <label className="etiqueta-campo" htmlFor="texto-regla">
        Texto que buscar
      </label>
      <input
        id="texto-regla"
        className="campo-linea texto"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => void recontar(texto, coincidencia)}
      />

      <label className="etiqueta-campo" htmlFor="encaje-regla">
        Cómo encaja
      </label>
      <select
        id="encaje-regla"
        className="campo-linea"
        value={coincidencia}
        onChange={(e) => setCoincidencia(e.target.value as ReglaNueva['coincidencia'])}
      >
        <option value="empieza">Empieza palabra</option>
        <option value="exacta">Palabra completa</option>
        <option value="regex">Expresión regular</option>
      </select>

      {encajarian !== null ? (
        <p className={`pista${encajarian <= 1 ? ' descuadre' : ''}`}>
          {encajarian === 0
            ? 'No encajaría con ningún movimiento de este extracto.'
            : encajarian === 1
              ? 'Solo encajaría con este movimiento.'
              : `Encajaría con ${encajarian} movimientos de este extracto.`}
        </p>
      ) : null}

      <button
        className="boton boton-principal boton-ancho"
        disabled={!texto.trim()}
        onClick={() => onRecordar({ texto, conceptoId: linea.conceptoId, coincidencia })}
      >
        Recordar
      </button>
    </Dialogo>
  )
}

/** El bloque de fijos es informativo: lo decide el extracto, no un botón. */
function FilaConciliacion({ conciliacion }: { conciliacion: Conciliacion }) {
  const [abierta, setAbierta] = useState(false)
  const previsto = conciliacion.importePrevisto
  const diferencia = previsto === null ? null : conciliacion.importe - previsto
  const desviado = diferencia !== null && previsto ? Math.abs(diferencia / previsto) > 0.1 : false

  return (
    <>
      <div className="conciliacion-fila">
        <span className="conciliacion-concepto">
          {conciliacion.cuantasLineas > 1 ? (
            <button className="boton boton-texto boton-compacto" onClick={() => setAbierta((a) => !a)}>
              {abierta ? '−' : '+'} {conciliacion.concepto}
            </button>
          ) : (
            conciliacion.concepto
          )}
          {conciliacion.cuantasLineas > 1 ? (
            <span className="linea-nota">{conciliacion.cuantasLineas} líneas sumadas</span>
          ) : null}
        </span>
        <span className="dinero apagado">{previsto === null ? '—' : euros(previsto)}</span>
        <span className="dinero">{euros(conciliacion.importe)}</span>
        <span className={`dinero${desviado ? ' negativo' : ''}`}>
          {diferencia === null ? '—' : (diferencia > 0 ? '+' : '') + euros(diferencia)}
        </span>
        <span className={`estado-fijo ${conciliacion.accion}`}>
          {ETIQUETAS_ACCION[conciliacion.accion]}
        </span>
      </div>

      {abierta
        ? conciliacion.detalleLineas.map((d, i) => (
            <div className="linea-simple detalle-fijo" key={i}>
              <span className="linea-fecha">{d.fecha ? fechaCorta(d.fecha) : '—'}</span>
              <span className="linea-limpia">{d.descripcion}</span>
              <span className="dinero">{euros(d.importe)}</span>
            </div>
          ))
        : null}
    </>
  )
}

function SubBloque({
  titulo,
  nota,
  lineas,
  textoAccion,
  onRecuperar,
  onTodos,
  textoTodos,
}: {
  titulo: string
  nota?: string
  lineas: LineaExtracto[]
  textoAccion: string
  onRecuperar: (id: number) => void
  onTodos?: () => void
  textoTodos?: string
}) {
  if (lineas.length === 0) return null
  return (
    <div className="sub-bloque">
      <h4 className="subseccion">
        {titulo} · {lineas.length}
        {onTodos ? (
          <button className="boton boton-secundario boton-compacto" onClick={onTodos}>
            {textoTodos}
          </button>
        ) : null}
      </h4>
      {nota ? <p className="pista">{nota}</p> : null}
      {lineas.map((l) => (
        <div className="linea-simple" key={l.id}>
          <span className="linea-fecha">{l.fecha ? fechaCorta(l.fecha) : '—'}</span>
          <span className="linea-limpia">{l.descripcionLimpia}</span>
          <span className="dinero">{euros(Math.abs(l.importe))}</span>
          <button className="boton boton-texto boton-compacto" onClick={() => onRecuperar(l.id)}>
            {textoAccion}
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * Partir un movimiento en varios conceptos.
 *
 * La suma tiene que dar exactamente el importe original: una compra de 120 € no
 * puede convertirse en 100 € por despiste.
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
    setTrozos([
      { importe: escribirImporte(Math.abs(linea.importe)), conceptoId: linea.conceptoId },
      { importe: '', conceptoId: null },
    ])
  }, [linea])

  if (!linea) return null

  const total = Math.abs(linea.importe)
  const suma = trozos.reduce((t, x) => t + (leerImporte(x.importe) ?? 0), 0)
  const cuadra = Math.abs(suma - total) < 0.005
  const completos = trozos.every((x) => (leerImporte(x.importe) ?? 0) > 0 && x.conceptoId !== null)

  return (
    <Dialogo titulo="Dividir el movimiento" onCerrar={onCerrar}>
      <p className="seccion-pista">
        {linea.descripcionLimpia} · <strong>{euros(total)}</strong>. Los trozos tienen que sumar
        exactamente eso.
      </p>

      {trozos.map((trozo, i) => (
        <div className="fila" key={i}>
          <CampoImporte
            valor={leerImporte(trozo.importe)}
            admiteVacio
            etiqueta={`Importe del trozo ${i + 1}`}
            onGuardar={(v) =>
              setTrozos((actuales) =>
                actuales.map((x, j) => (j === i ? { ...x, importe: escribirImporte(v) } : x)),
              )
            }
          />
          <SelectorConcepto
            conceptos={conceptos}
            valor={trozo.conceptoId}
            etiqueta={`Concepto del trozo ${i + 1}`}
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
    </Dialogo>
  )
}
