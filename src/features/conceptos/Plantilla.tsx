import { useCallback, useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type {
  Clasificacion,
  Concepto,
  CriterioImporte,
  EntradaPlantilla,
  LineaPlantilla,
  Plantilla,
} from '../../lib/tipos'
import { BotonIcono, Card, Chip, ErrorLinea, Esqueleto, IconoConcepto, Tile } from '../../components/ui/Basicos'
import { CampoImporte, CampoTexto, SelectorMes, SelectorOpcion } from '../../components/ui/Campos'
import { ConfirmacionDialogo, Dialogo } from '../../components/ui/Dialogo'
import { Asa, Fila } from '../../components/ui/Fila'
import { Celda, Fila as FilaTabla, Tabla } from '../../components/ui/Tabla'
import { useAvisos } from '../../components/ui/Toast'
import { iconoDe, paletaDe } from '../../lib/conceptos'
import { cuantos, euros, redondo } from '../../lib/formato'
import { claveLegible } from './FichaConcepto'
import { ETIQUETAS_CLASIFICACION } from './PantallaConceptos'

/**
 * La plantilla: lo que costará un mes antes de que pase nada.
 *
 * Es la hoja de la que sale cada mes nuevo, y por eso se mira siempre desde un
 * mes concreto: los importes tienen histórico, y la hipoteca de enero no es la
 * de octubre. El selector de arriba manda sobre toda la pantalla — lo que se
 * ve es lo que valdrá ESE mes, y lo que se edita se guarda vigente DESDE ese
 * mes, dejando intacto lo anterior.
 *
 * Por defecto, el mes que viene: el mes en curso ya está generado y cambiar la
 * plantilla no lo mueve solo (para eso está «Regenerar desde la plantilla» en
 * el menú del mes).
 */
/*
 * De dónde sale el importe de cada fijo.
 *
 * Un importe escrito envejece: la luz de enero no es la de julio y el seguro
 * sube todos los años. Con estas dos opciones la plantilla deja de ser una foto
 * y copia lo que costó de verdad, y el número escrito se queda como respaldo
 * para cuando ese mes todavía no existe.
 */
const CRITERIOS: { id: CriterioImporte; nombre: string; ayuda: string }[] = [
  { id: 'importe', nombre: 'Este importe', ayuda: 'El número de al lado, tal cual' },
  { id: 'mes-anterior', nombre: 'Mes anterior', ayuda: 'Lo que costó el mes de antes' },
  { id: 'ano-anterior', nombre: 'Año anterior', ayuda: 'Lo que costó ese mes el año pasado' },
]

/**
 * «septiembre», «octubre de 2025».
 *
 * El año solo cuando no es el del mes que se está mirando: para el criterio
 * «mes anterior» sobra casi siempre, y para «año anterior» hace toda la falta.
 */
function mesCorto(origen: LineaPlantilla['origenImporte'], desde: string): string {
  const texto = origen.deMesLegible ?? origen.deMes ?? ''
  const anioDelMes = desde.slice(0, 4)
  return texto.endsWith(` de ${anioDelMes}`) ? texto.slice(0, -` de ${anioDelMes}`.length) : texto
}

const COLOR_CLASIFICACION: Record<Clasificacion, { color: string; suave: string }> = {
  necesario: { color: 'var(--azul)', suave: 'var(--azul-suave)' },
  prescindible: { color: 'var(--ambar)', suave: 'var(--ambar-suave)' },
  ahorro: { color: 'var(--ok)', suave: 'var(--ok-suave)' },
}

/** Necesario → Prescindible → Ahorro → Necesario. */
function siguienteClasificacion(actual: Clasificacion): Clasificacion {
  const orden: Clasificacion[] = ['necesario', 'prescindible', 'ahorro']
  return orden[(orden.indexOf(actual) + 1) % orden.length]
}

export function PantallaPlantilla({ onCambioGlobal }: { onCambioGlobal: () => void }) {
  const { avisarError } = useAvisos()
  const [desde, setDesde] = useState('')
  const [datos, setDatos] = useState<Plantilla | null>(null)
  const [orden, setOrden] = useState<number[]>([])
  const [error, setError] = useState('')
  const [historial, setHistorial] = useState<LineaPlantilla | null>(null)
  const [arrastrado, setArrastrado] = useState<number | null>(null)
  const [encima, setEncima] = useState<number | null>(null)

  const cargar = useCallback(async (mes: string) => {
    setError('')
    try {
      // El orden es global (los fijos se mezclan con los variables en la lista
      // de conceptos), así que hace falta la lista entera para poder moverlos
      // sin descolocar lo demás.
      const [plantilla, todos] = await Promise.all([
        api<Plantilla>(`/plantilla${mes ? `?desde=${mes}` : ''}`),
        api<Concepto[]>('/conceptos'),
      ])
      setDatos(plantilla)
      setDesde(plantilla.desde)
      setOrden(todos.map((c) => c.id))
    } catch (causa) {
      setError(mensajeDeError(causa))
    }
  }, [])

  useEffect(() => {
    void cargar('')
  }, [cargar])

  const irA = (mes: string) => {
    setDesde(mes)
    setDatos(null)
    void cargar(mes)
  }

  /** Guarda el día y el importe de un fijo vigentes desde el mes elegido. */
  const guardarLinea = async (
    linea: LineaPlantilla,
    cambios: {
      diaPrevisto?: string | null
      importePrevisto?: number
      criterio?: CriterioImporte
    },
  ) => {
    try {
      await api(`/conceptos/${linea.conceptoId}/plantilla`, {
        metodo: 'POST',
        cuerpo: {
          vigenteDesde: desde,
          diaPrevisto: cambios.diaPrevisto ?? linea.diaPrevisto ?? '',
          importePrevisto: cambios.importePrevisto ?? linea.importePrevisto,
          criterio: cambios.criterio ?? linea.criterio,
        },
      })
      await cargar(desde)
      onCambioGlobal()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const cambiarClasificacion = async (linea: LineaPlantilla, clasificacion: Clasificacion) => {
    try {
      await api(`/conceptos/${linea.conceptoId}`, { metodo: 'PATCH', cuerpo: { clasificacion } })
      await cargar(desde)
      onCambioGlobal()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const guardarValor = async (campo: string, valor: number | null) => {
    try {
      await api('/plantilla/valores', { metodo: 'PUT', cuerpo: { desde, [campo]: valor } })
      await cargar(desde)
      onCambioGlobal()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  /** Mueve un fijo dentro del orden global de conceptos. */
  const soltar = async (destinoId: number) => {
    const desdeId = arrastrado
    setArrastrado(null)
    setEncima(null)
    if (desdeId === null || desdeId === destinoId || orden.length === 0) return

    const nuevo = [...orden]
    const i = nuevo.indexOf(desdeId)
    const j = nuevo.indexOf(destinoId)
    if (i < 0 || j < 0) return
    nuevo.splice(j, 0, ...nuevo.splice(i, 1))

    setOrden(nuevo)
    try {
      await api('/conceptos/orden', { metodo: 'PUT', cuerpo: { ids: nuevo } })
      await cargar(desde)
      onCambioGlobal()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
      await cargar(desde)
    }
  }

  if (error) {
    return (
      <div className="pila">
        <ErrorLinea mensaje={error} onReintentar={() => void cargar(desde)} />
      </div>
    )
  }

  if (!datos) {
    return (
      <div className="pila">
        <Esqueleto filas={8} />
      </div>
    )
  }

  const { fijos, valores, resumen } = datos

  return (
    <div className="pila">
      <Card
        titulo="Gastos fijos"
        ayuda={`${cuantos(fijos.length, 'fijo activo', 'fijos activos')}. Al abrir un mes se generan todos pendientes de cobro. El importe es el que pone aquí, salvo que la columna «de dónde sale» diga que se copie de otro mes.`}
        derecha={
          /*
            La vigencia manda sobre toda la tabla, así que vive en su cabecera y
            no en un bloque aparte: lo que se ve y lo que se cambia vale a partir
            de ese mes, y lo anterior se queda como está.
          */
          <span className="fila-campos">
            <span className="muted">Vigente desde</span>
            <SelectorMes valor={desde} onCambiar={irA} etiqueta="Plantilla vigente desde" />
          </span>
        }
      >
        <Tabla
          etiqueta="Gastos fijos de la plantilla"
          columnas={[
            { clave: 'orden', titulo: 'Orden', ancho: 74 },
            { clave: 'concepto', titulo: 'Concepto' },
            { clave: 'dia', titulo: 'Día', ancho: 76 },
            { clave: 'importe', titulo: 'Importe', num: true, ancho: 116 },
            { clave: 'origen', titulo: 'De dónde sale', ancho: 196 },
            { clave: 'clase', titulo: 'Clasificación', ancho: 130 },
            { clave: 'hist', titulo: 'Historial', ancho: 40 },
          ]}
        >
          {fijos.map((linea, indice) => {
            const concepto = { id: linea.conceptoId, nombre: linea.nombre }
            const paleta = paletaDe(concepto)
            return (
              <FilaTabla
                key={linea.conceptoId}
                arrastrando={arrastrado === linea.conceptoId}
                encima={encima === linea.conceptoId}
                draggable
                onDragStart={() => setArrastrado(linea.conceptoId)}
                onDragEnd={() => {
                  setArrastrado(null)
                  setEncima(null)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setEncima(linea.conceptoId)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  void soltar(linea.conceptoId)
                }}
              >
                <Celda>
                  <span className="fila-campos" style={{ gap: 6 }}>
                    <Asa />
                    <span className="muted-3 tabular">{indice + 1}</span>
                  </span>
                </Celda>
                <Celda>
                  <span className="fila-campos" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <IconoConcepto
                      icono={iconoDe(concepto)}
                      color={paleta.color}
                      suave={paleta.suave}
                      size={14}
                    />
                    <span className="celda-concepto">
                      <span className="row-titulo">{linea.nombre}</span>
                      {linea.vigenteDesde ? (
                        <span className="d">
                          vigente desde {claveLegible(linea.vigenteDesde).toLowerCase()}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Celda>
                <Celda>
                  <CampoTexto
                    valor={linea.diaPrevisto ?? ''}
                    etiqueta={`Día previsto de ${linea.nombre}`}
                    placeholder="—"
                    maxLength={20}
                    onGuardar={(dia) => void guardarLinea(linea, { diaPrevisto: dia })}
                  />
                </Celda>
                <Celda num>
                  {/*
                    Con criterio, el importe de este mes no se escribe: sale de
                    otro mes. Se enseña el que se va a usar —que es la pregunta
                    de la columna— y el escrito se edita al lado, como respaldo.
                  */}
                  {linea.criterio === 'importe' ? (
                    <CampoImporte
                      valor={linea.importePrevisto}
                      etiqueta={`Importe previsto de ${linea.nombre}`}
                      onGuardar={(importe) =>
                        void guardarLinea(linea, { importePrevisto: importe ?? 0 })
                      }
                    />
                  ) : (
                    <span className="celda-concepto" style={{ textAlign: 'right' }}>
                      <span className="tabular">{euros(linea.origenImporte.importe)}</span>
                      <span className="d">
                        {linea.origenImporte.hayDato
                          ? `de ${mesCorto(linea.origenImporte, desde)}`
                          : `sin ${mesCorto(linea.origenImporte, desde)}: el respaldo`}
                      </span>
                    </span>
                  )}
                </Celda>
                <Celda>
                  <span className="celda-concepto">
                    <SelectorOpcion
                      valor={linea.criterio}
                      opciones={CRITERIOS}
                      etiqueta={`De dónde sale el importe de ${linea.nombre}`}
                      onElegir={(criterio) => void guardarLinea(linea, { criterio })}
                    />
                    {linea.criterio === 'importe' ? null : (
                      <span className="fila-campos" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <span className="d">respaldo</span>
                        <CampoImporte
                          valor={linea.importePrevisto}
                          etiqueta={`Importe de respaldo de ${linea.nombre}`}
                          estrecho
                          onGuardar={(importe) =>
                            void guardarLinea(linea, { importePrevisto: importe ?? 0 })
                          }
                        />
                      </span>
                    )}
                  </span>
                </Celda>
                <Celda>
                  {/*
                    Tres valores que se pulsan poco: un chip que cicla ocupa lo
                    que ocupa la palabra, y un desplegable ocupaba una caja con
                    flecha para decir lo mismo.
                  */}
                  <Chip
                    color={COLOR_CLASIFICACION[linea.clasificacion].color}
                    suave={COLOR_CLASIFICACION[linea.clasificacion].suave}
                    etiqueta={`Clasificación de ${linea.nombre}: ${ETIQUETAS_CLASIFICACION[linea.clasificacion]}. Pulsa para cambiarla.`}
                    onClick={() =>
                      void cambiarClasificacion(linea, siguienteClasificacion(linea.clasificacion))
                    }
                  >
                    {ETIQUETAS_CLASIFICACION[linea.clasificacion]}
                  </Chip>
                </Celda>
                <Celda>
                  <BotonIcono
                    icono="reloj"
                    etiqueta={`Histórico de ${linea.nombre}`}
                    onClick={() => setHistorial(linea)}
                  />
                </Celda>
              </FilaTabla>
            )
          })}

          <FilaTabla total>
            <Celda />
            <Celda>Total de fijos</Celda>
            <Celda />
            <Celda num>{euros(resumen.totalFijos)}</Celda>
            <Celda />
            <Celda />
            <Celda />
          </FilaTabla>
        </Tabla>
      </Card>

      {/*
        Los dos valores con los que nace un mes, arriba y como cifras: es lo
        primero que se mira al abrir la plantilla.
      */}
      <div className="tiles">
        <Tile
          icono="entrada"
          color="var(--ok)"
          suave="var(--ok-suave)"
          etiqueta="Nómina prevista"
          cifra={valores.ingresoPrevisto === null ? '—' : redondo(valores.ingresoPrevisto)}
          frase={
            valores.ingresoPrevisto === null
              ? 'Sin poner: cada mes hereda la nómina del anterior.'
              : 'El ingreso con el que nace cada mes.'
          }
        >
          <span style={{ width: 130 }}>
            <CampoImporte
              valor={valores.ingresoPrevisto}
              admiteVacio
              visible
              etiqueta="Nómina prevista"
              onGuardar={(v) => void guardarValor('ingresoPrevisto', v)}
            />
          </span>
        </Tile>

        {valores.comida ? (
          <Tile
            icono="comida"
            color="var(--comida)"
            suave="var(--comida-suave)"
            etiqueta={`Presupuesto de ${valores.comida.nombre.toLowerCase()}`}
            cifra={redondo(valores.comida.importePrevisto)}
            frase="El sobre con el que nace cada mes."
          >
            <span style={{ width: 130 }}>
              <CampoImporte
                valor={valores.comida.importePrevisto}
                visible
                etiqueta="Presupuesto de comida por defecto"
                onGuardar={(v) => void guardarValor('presupuestoComida', v ?? 0)}
              />
            </span>
          </Tile>
        ) : null}

        {valores.ahorro ? (
          <Tile
            icono="hucha"
            color="var(--azul)"
            suave="var(--azul-suave)"
            etiqueta={`Objetivo de ${valores.ahorro.nombre.toLowerCase()}`}
            cifra={redondo(valores.ahorro.importePrevisto)}
            frase="Lo que se quiere apartar. No es un gasto: no resta del sobrante."
          >
            <span style={{ width: 130 }}>
              <CampoImporte
                valor={valores.ahorro.importePrevisto}
                visible
                etiqueta="Objetivo de ahorro por defecto"
                onGuardar={(v) => void guardarValor('objetivoAhorro', v ?? 0)}
              />
            </span>
          </Tile>
        ) : null}
      </div>

      <Card titulo="Un mes según la plantilla">
          <div className="row">
            <span>Ingreso previsto</span>
            <span className="amt">
              {resumen.ingreso === null ? '—' : euros(resumen.ingreso)}
            </span>
          </div>
          <div className="row">
            <span>{cuantos(resumen.cuantosFijos, 'gasto fijo', 'gastos fijos')}</span>
            <span className="amt">−{euros(resumen.totalFijos)}</span>
          </div>
          <div className="row">
            <span>Presupuesto de comida</span>
            <span className="amt">−{euros(resumen.presupuestoComida)}</span>
          </div>
          <div className="row total-plantilla">
            <span>Sobrante previsto</span>
            <span className="amt">
              {resumen.sobrante === null ? '—' : euros(resumen.sobrante)}
            </span>
          </div>
          {resumen.objetivoAhorro > 0 ? (
            <p className="muted-3">
              De ese sobrante, el objetivo es apartar {euros(resumen.objetivoAhorro)}.
            </p>
          ) : null}
          {resumen.ingreso === null ? (
            <p className="muted-3">
              Pon la nómina prevista ahí arriba y esto dice lo que debería sobrar cada mes.
            </p>
          ) : null}
      </Card>

      <HistorialPlantilla
        linea={historial}
        onCerrar={() => setHistorial(null)}
        onCambio={() => void cargar(desde)}
      />
    </div>
  )
}

/** El histórico de importes de un concepto, para ver de dónde viene cada uno. */
function HistorialPlantilla({
  linea,
  onCerrar,
  onCambio,
}: {
  linea: LineaPlantilla | null
  onCerrar: () => void
  onCambio: () => void
}) {
  const { avisar, avisarError } = useAvisos()
  const [entradas, setEntradas] = useState<EntradaPlantilla[] | null>(null)
  const [aBorrar, setABorrar] = useState<EntradaPlantilla | null>(null)

  const conceptoId = linea?.conceptoId ?? null

  useEffect(() => {
    if (conceptoId === null) {
      setEntradas(null)
      return
    }
    let vigente = true
    void (async () => {
      try {
        const datos = await api<EntradaPlantilla[]>(`/conceptos/${conceptoId}/plantilla`)
        if (vigente) setEntradas(datos)
      } catch (causa) {
        if (vigente) avisarError(mensajeDeError(causa))
      }
    })()
    return () => {
      vigente = false
    }
  }, [conceptoId, avisarError])

  const borrar = async () => {
    if (!aBorrar || conceptoId === null) return
    const entrada = aBorrar
    setABorrar(null)
    try {
      await api(`/conceptos/${conceptoId}/plantilla/${entrada.id}`, { metodo: 'DELETE' })
      setEntradas(await api<EntradaPlantilla[]>(`/conceptos/${conceptoId}/plantilla`))
      avisar(`Borrado el importe desde ${claveLegible(entrada.vigenteDesde)}.`)
      onCambio()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  if (!linea) return null

  return (
    <Dialogo titulo={`Histórico de ${linea.nombre}`} onCerrar={onCerrar}>
      {aBorrar ? (
        <ConfirmacionDialogo
          frase={`Los meses que salían de ${claveLegible(aBorrar.vigenteDesde)} pasarán a usar el importe anterior.`}
          detalle="Los que ya están abiertos no cambian."
          textoConfirmar="Sí, borrar el importe"
          onConfirmar={() => void borrar()}
          onCancelar={() => setABorrar(null)}
        />
      ) : (
        <>
          <p className="muted">
            Cada importe vale desde su mes hasta que aparece el siguiente. Los meses ya abiertos
            conservan el que tenían.
          </p>

          {entradas === null ? (
            <Esqueleto filas={3} />
          ) : entradas.length === 0 ? (
            <p className="muted-3">Todavía no hay ningún importe guardado.</p>
          ) : (
            entradas.map((entrada, indice) => (
              <Fila
                key={entrada.id}
                titulo={<span className="tabular">{euros(entrada.importePrevisto)}</span>}
                detalle={
                  `desde ${claveLegible(entrada.vigenteDesde)}` +
                  (entrada.diaPrevisto ? ` · día ${entrada.diaPrevisto}` : '') +
                  (indice === 0 ? ' · el más reciente' : '')
                }
                acciones={
                  entradas.length > 1 ? (
                    <BotonIcono
                      icono="papelera"
                      etiqueta={`Borrar el importe desde ${claveLegible(entrada.vigenteDesde)}`}
                      onClick={() => setABorrar(entrada)}
                    />
                  ) : undefined
                }
              />
            ))
          )}
        </>
      )}
    </Dialogo>
  )
}
