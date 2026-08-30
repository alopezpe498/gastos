import { useCallback, useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Clasificacion, Concepto, EntradaPlantilla, LineaPlantilla, Plantilla } from '../../lib/tipos'
import { Confirmar, ErrorLinea } from '../../components/Basicos'
import { EsqueletoLista } from '../../components/Esqueleto'
import { Sheet } from '../../components/Sheet'
import { useAvisos } from '../../components/Avisos'
import { CampoImporte, CampoTextoLinea, SelectorMes } from '../../components/Campos'
import { IconoArrastrar, IconoPapelera, IconoReloj } from '../../components/Iconos'
import { cuantos, euros } from '../../lib/formato'
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
    cambios: { diaPrevisto?: string | null; importePrevisto?: number },
  ) => {
    try {
      await api(`/conceptos/${linea.conceptoId}/plantilla`, {
        metodo: 'POST',
        cuerpo: {
          vigenteDesde: desde,
          diaPrevisto: cambios.diaPrevisto ?? linea.diaPrevisto ?? '',
          importePrevisto: cambios.importePrevisto ?? linea.importePrevisto,
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
      <div className="limite">
        <ErrorLinea mensaje={error} onReintentar={() => void cargar(desde)} />
      </div>
    )
  }

  if (!datos) {
    return (
      <div className="limite">
        <EsqueletoLista filas={8} />
      </div>
    )
  }

  const { fijos, valores, resumen } = datos

  return (
    <div className="limite">
      <section className="seccion">
        <div className="seccion-cabecera">
          <div>
            <h2 className="seccion-titulo">Gastos fijos</h2>
            <p className="seccion-pista">
              {cuantos(fijos.length, 'fijo activo', 'fijos activos')}. Al abrir un mes se generan
              todos, pendientes de cobro, con este importe.
            </p>
          </div>
        </div>

        <div className="bloque tabla-plantilla">
          {/*
            La vigencia manda sobre toda la tabla, así que vive en su cabecera y
            no en un bloque aparte: lo que se ve y lo que se cambia vale a partir
            de ese mes, y lo anterior se queda como está.
          */}
          <div className="plantilla-cabecera">
            <span className="titulo-bloque">Vigente desde</span>
            <SelectorMes valor={desde} onCambiar={irA} ariaLabel="Plantilla vigente desde" />
            <span className="t12 plantilla-cabecera-nota">
              Lo anterior no se toca: cambiar aquí crea una versión nueva.
            </span>
          </div>

          <div className="plantilla-fila cabecera">
            <span className="plantilla-orden">Orden</span>
            <span>Concepto</span>
            <span>Día</span>
            <span className="plantilla-titulo-importe">Importe</span>
            <span>Clasificación</span>
            <span className="solo-lectores">Histórico</span>
          </div>

          {fijos.map((linea, indice) => (
            <div
              key={linea.conceptoId}
              className={
                'plantilla-fila' +
                (arrastrado === linea.conceptoId ? ' arrastrando' : '') +
                (encima === linea.conceptoId ? ' encima' : '')
              }
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
              {/* El número dice en qué orden salen en el mes; se cambia
                  arrastrando la fila, como en la pestaña de al lado. */}
              <span className="plantilla-orden">
                <span className="agarre" aria-hidden="true">
                  <IconoArrastrar size={16} />
                </span>
                {indice + 1}
              </span>

              <span className="plantilla-concepto">
                <strong>{linea.nombre}</strong>
                {linea.vigenteDesde ? (
                  <span className="plantilla-origen">
                    vigente desde {claveLegible(linea.vigenteDesde).toLowerCase()}
                  </span>
                ) : null}
              </span>

              <CampoTextoLinea
                valor={linea.diaPrevisto ?? ''}
                ariaLabel={`Día previsto de ${linea.nombre}`}
                placeholder="—"
                maxLength={20}
                className="campo plantilla-dia"
                onGuardar={(dia) => void guardarLinea(linea, { diaPrevisto: dia })}
              />

              <CampoImporte
                valor={linea.importePrevisto}
                ariaLabel={`Importe previsto de ${linea.nombre}`}
                className="campo importe"
                onGuardar={(importe) => void guardarLinea(linea, { importePrevisto: importe ?? 0 })}
              />

              {/*
                La clasificación son tres valores y se pulsa poco: un chip que
                cicla ocupa lo que ocupa la palabra, y un desplegable ocupaba una
                caja con flecha para decir lo mismo.
              */}
              <button
                className={`chip chip-clasificacion ${linea.clasificacion}`}
                aria-label={`Clasificación de ${linea.nombre}: ${ETIQUETAS_CLASIFICACION[linea.clasificacion]}. Pulsa para cambiarla.`}
                onClick={() => void cambiarClasificacion(linea, siguienteClasificacion(linea.clasificacion))}
              >
                {ETIQUETAS_CLASIFICACION[linea.clasificacion]}
              </button>

              <button
                className="boton-icono"
                aria-label={`Histórico de ${linea.nombre}`}
                title={`${cuantos(linea.versiones, 'importe')} en el histórico`}
                onClick={() => setHistorial(linea)}
              >
                <IconoReloj size={18} />
              </button>
            </div>
          ))}

          <div className="plantilla-fila total">
            <span className="plantilla-orden" />
            <span className="plantilla-concepto">
              <strong>Total de fijos</strong>
            </span>
            <span />
            <span className="importe">{euros(resumen.totalFijos)}</span>
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="seccion">
        <div className="seccion-cabecera">
          <div>
            <h2 className="seccion-titulo">Valores del mes</h2>
            <p className="seccion-pista">
              Con estos tres se rellena un mes nuevo al abrirlo. Después se pueden cambiar mes a
              mes sin tocar la plantilla.
            </p>
          </div>
        </div>

        <div className="tarjeta">
          <div className="fila">
            <div className="fila-cuerpo">
              <span className="fila-titulo">Nómina prevista</span>
              <span className="fila-detalle">
                {valores.ingresoPrevisto === null
                  ? 'Sin poner: cada mes hereda la nómina del anterior.'
                  : 'El ingreso con el que nace cada mes.'}
              </span>
            </div>
            <CampoImporte
              valor={valores.ingresoPrevisto}
              admiteVacio
              placeholder="—"
              ariaLabel="Nómina prevista"
              onGuardar={(v) => void guardarValor('ingresoPrevisto', v)}
            />
          </div>

          {valores.comida ? (
            <div className="fila">
              <div className="fila-cuerpo">
                <span className="fila-titulo">Presupuesto de {valores.comida.nombre}</span>
                <span className="fila-detalle">El sobre del mes.</span>
              </div>
              <CampoImporte
                valor={valores.comida.importePrevisto}
                ariaLabel="Presupuesto de comida por defecto"
                onGuardar={(v) => void guardarValor('presupuestoComida', v ?? 0)}
              />
            </div>
          ) : null}

          {valores.ahorro ? (
            <div className="fila">
              <div className="fila-cuerpo">
                <span className="fila-titulo">Objetivo de {valores.ahorro.nombre}</span>
                <span className="fila-detalle">
                  Lo que se quiere apartar. No es un gasto: no resta del sobrante.
                </span>
              </div>
              <CampoImporte
                valor={valores.ahorro.importePrevisto}
                ariaLabel="Objetivo de ahorro por defecto"
                onGuardar={(v) => void guardarValor('objetivoAhorro', v ?? 0)}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo">Un mes según la plantilla</h2>
        <div className="tarjeta resumen-plantilla">
          <div className="resumen-linea">
            <span>Ingreso previsto</span>
            <span className="dinero">
              {resumen.ingreso === null ? '—' : euros(resumen.ingreso)}
            </span>
          </div>
          <div className="resumen-linea">
            <span>{cuantos(resumen.cuantosFijos, 'gasto fijo', 'gastos fijos')}</span>
            <span className="dinero negativo">−{euros(resumen.totalFijos)}</span>
          </div>
          <div className="resumen-linea">
            <span>Presupuesto de comida</span>
            <span className="dinero negativo">−{euros(resumen.presupuestoComida)}</span>
          </div>
          <div className="resumen-linea sobrante">
            <span>Sobrante previsto</span>
            <span className={`dinero${(resumen.sobrante ?? 0) < 0 ? ' negativo' : ''}`}>
              {resumen.sobrante === null ? '—' : euros(resumen.sobrante)}
            </span>
          </div>
          {resumen.objetivoAhorro > 0 ? (
            <p className="pista">
              De ese sobrante, el objetivo es apartar {euros(resumen.objetivoAhorro)}.
            </p>
          ) : null}
          {resumen.ingreso === null ? (
            <p className="pista">
              Pon la nómina prevista ahí arriba y esto dice lo que debería sobrar cada mes.
            </p>
          ) : null}
        </div>
      </section>

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

  return (
    <>
      <Sheet
        abierta={!!linea}
        titulo={linea ? `Histórico de ${linea.nombre}` : ''}
        onCerrar={onCerrar}
      >
        <p className="seccion-pista">
          Cada importe vale desde su mes hasta que aparece el siguiente. Los meses ya abiertos
          conservan el que tenían.
        </p>

        {entradas === null ? (
          <EsqueletoLista filas={3} />
        ) : entradas.length === 0 ? (
          <p className="pista">Todavía no hay ningún importe guardado.</p>
        ) : (
          <div className="tarjeta historico">
            {entradas.map((entrada, indice) => (
              <div className="fila" key={entrada.id}>
                <div className="fila-cuerpo">
                  <span className="fila-titulo dinero">{euros(entrada.importePrevisto)}</span>
                  <span className="fila-detalle">
                    desde {claveLegible(entrada.vigenteDesde)}
                    {entrada.diaPrevisto ? ` · día ${entrada.diaPrevisto}` : ''}
                    {indice === 0 ? ' · el más reciente' : ''}
                  </span>
                </div>
                {entradas.length > 1 ? (
                  <button
                    className="icono-boton"
                    aria-label={`Borrar el importe desde ${claveLegible(entrada.vigenteDesde)}`}
                    onClick={() => setABorrar(entrada)}
                  >
                    <IconoPapelera size={18} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <Confirmar
        abierto={!!aBorrar}
        titulo="¿Borrar este importe del histórico?"
        mensaje={
          aBorrar
            ? `Los meses que salían de ${claveLegible(aBorrar.vigenteDesde)} pasarán a usar el importe anterior. Los que ya están abiertos no cambian.`
            : ''
        }
        textoConfirmar="Borrar"
        peligroso
        onConfirmar={() => void borrar()}
        onCancelar={() => setABorrar(null)}
      />
    </>
  )
}
