import { useCallback, useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Analisis, ContextoMes, Mes } from '../../lib/tipos'
import { Cabecera, ErrorLinea, EstadoVacio } from '../../components/Basicos'
import { EsqueletoLista, EsqueletoResumen } from '../../components/Esqueleto'
import { cuantos, euros, porcentaje } from '../../lib/formato'
import { Tarta } from './Tarta'
import { InformeMes } from '../informe/Informe'
import type { MesCompleto } from '../../lib/tipos'

type Props = {
  mesElegido: { anio: number; mes: number } | null
  onCambioDeMes: (mes: { anio: number; mes: number } | null) => void
}

export function PantallaAnalisis({ mesElegido, onCambioDeMes }: Props) {
  const [meses, setMeses] = useState<Mes[]>([])
  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [contexto, setContexto] = useState<ContextoMes | null>(null)
  // El mes completo solo hace falta para el informe (la tabla de fijos con su
  // previsto): no se pide hasta que se abre.
  const [informe, setInforme] = useState<MesCompleto | null>(null)
  const [preparandoInforme, setPreparandoInforme] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const lista = await api<Mes[]>('/meses')
      setMeses(lista)
      if (lista.length === 0) {
        setAnalisis(null)
        return
      }
      const elegido =
        (mesElegido && lista.find((m) => m.anio === mesElegido.anio && m.mes === mesElegido.mes)) ||
        lista.find((m) => m.estado === 'abierto') ||
        lista[0]
      setAnalisis(await api<Analisis>(`/meses/${elegido.id}/analisis`))
      // El contexto recorre el histórico: se pide después para no retrasar la
      // pantalla, y si falla no pasa nada.
      setContexto(null)
      api<ContextoMes>(`/analitica/contexto/${elegido.id}`)
        .then(setContexto)
        .catch(() => undefined)
    } catch (causa) {
      setError(mensajeDeError(causa))
    }
  }, [mesElegido])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const abrirInforme = async () => {
    if (!analisis) return
    setPreparandoInforme(true)
    try {
      setInforme(await api<MesCompleto>(`/meses/${analisis.mes.anio}/${analisis.mes.mes}`))
    } catch (causa) {
      setError(mensajeDeError(causa))
    } finally {
      setPreparandoInforme(false)
    }
  }

  const selector =
    meses.length > 0 && analisis ? (
      <select
        className="selector-mes-cabecera"
        aria-label="Mes que se está analizando"
        value={analisis.mes.id}
        onChange={(e) => {
          const elegido = meses.find((m) => m.id === Number(e.target.value))
          if (elegido) onCambioDeMes({ anio: elegido.anio, mes: elegido.mes })
        }}
      >
        {meses.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nombreMes} {m.anio}
          </option>
        ))}
      </select>
    ) : null

  if (error) {
    return (
      <>
        <Cabecera titulo="Análisis" />
        <div className="limite">
          <ErrorLinea mensaje={error} onReintentar={() => void cargar()} />
        </div>
      </>
    )
  }

  if (meses.length === 0) {
    return (
      <>
        <Cabecera titulo="Análisis" />
        <div className="limite">
          <EstadoVacio
            icono="—"
            titulo="Todavía no hay ningún mes"
            texto="Abre un mes o importa tu Excel y aquí verás en qué se va el dinero."
          />
        </div>
      </>
    )
  }

  if (!analisis) {
    return (
      <>
        <Cabecera titulo="Análisis" acciones={selector} />
        <div className="limite">
          <EsqueletoResumen />
          <EsqueletoLista filas={6} />
        </div>
      </>
    )
  }

  const { resumen, reparto, pesoFijos, regla, ranking } = analisis
  const mayorDelRanking = ranking.reduce((maximo, l) => Math.max(maximo, Math.abs(l.importe)), 0)

  return (
    <>
      <Cabecera
        titulo={`${analisis.mes.nombreMes} ${analisis.mes.anio}`}
        subtitulo="Análisis del mes"
        acciones={
          <div className="cabecera-acciones">
            <button
              className="boton boton-secundario boton-compacto"
              disabled={preparandoInforme}
              onClick={() => void abrirInforme()}
            >
              {preparandoInforme ? 'Preparando…' : 'Informe'}
            </button>
            {selector}
          </div>
        }
        anchaEnEscritorio
      />

      {informe ? (
        <InformeMes
          analisis={analisis}
          contexto={contexto}
          fijos={informe.fijos.map((f) => ({
            concepto: f.concepto,
            diaPrevisto: f.diaPrevisto,
            importePrevisto: f.importePrevisto,
            importe: f.importe,
            cobrado: f.cobrado,
          }))}
          onCerrar={() => setInforme(null)}
        />
      ) : null}

      <div className="limite limite-ancho">
        <div className="analisis-columnas">
          {/* ---------- reparto ---------- */}
          <section className="analisis-panel">
            <h2 className="seccion-titulo">En qué se va</h2>
            <p className="seccion-pista">Porcentajes sobre los ingresos del mes.</p>
            <Tarta trozos={reparto} ingreso={resumen.ingreso} />
          </section>

          {/* ---------- 50/30/20 ---------- */}
          <section className="analisis-panel">
            <h2 className="seccion-titulo">Real frente a ideal</h2>
            <p className="seccion-pista">
              La regla 50/30/20: la mitad para lo necesario, un tercio para lo prescindible y una
              quinta parte al ahorro.
            </p>

            <div className="tarjeta regla">
              {regla.map((bloque) => (
                <div className="regla-fila" key={bloque.nombre}>
                  <span className="regla-nombre">
                    <span
                      className={`semaforo ${bloque.cumple === null ? '' : bloque.cumple ? 'bien' : 'mal'}`}
                      aria-hidden="true"
                    />
                    {bloque.nombre}
                  </span>
                  <span className="dinero regla-importe">{euros(bloque.importe)}</span>
                  <span className="regla-barras">
                    <span className="regla-barra">
                      <span
                        className={`regla-relleno ${bloque.cumple ? 'bien' : 'mal'}`}
                        style={{ width: `${Math.min(100, Math.max(0, bloque.porcentaje ?? 0))}%` }}
                      />
                      {/* La marca del ideal: se ve de un vistazo si el bloque
                          se ha pasado o se ha quedado corto. */}
                      <span className="regla-marca" style={{ left: `${bloque.ideal}%` }} />
                    </span>
                  </span>
                  <span className="regla-cifras">
                    <strong className={bloque.cumple === false ? 'negativo' : 'positivo'}>
                      {porcentaje(bloque.porcentaje)}
                    </strong>
                    <span className="regla-ideal">ideal {bloque.ideal} %</span>
                  </span>
                </div>
              ))}
            </div>
            {resumen.ingreso === 0 ? (
              <p className="pista aviso">
                Sin ingresos apuntados no se pueden calcular los porcentajes.
              </p>
            ) : null}
          </section>

          {/* ---------- peso de los fijos ---------- */}
          <section className="analisis-panel">
            <h2 className="seccion-titulo">Peso de los fijos</h2>
            <p className="seccion-pista">
              Sobre el total de {euros(resumen.fijos)} en gastos fijos.
            </p>

            <div className="tarjeta barras">
              {pesoFijos.map((grupo) => (
                <div className="barra-fila" key={grupo.nombre}>
                  <span className="barra-nombre">{grupo.nombre}</span>
                  <span className="barra-canal">
                    <span
                      className="barra-relleno"
                      style={{ width: `${Math.min(100, Math.max(0, grupo.porcentaje ?? 0))}%` }}
                    />
                  </span>
                  <span className="dinero barra-importe">{euros(grupo.importe)}</span>
                  <span className="barra-porcentaje">{porcentaje(grupo.porcentaje)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ---------- ranking ---------- */}
          <section className="analisis-panel">
            <h2 className="seccion-titulo">Los variables, de mayor a menor</h2>
            {contexto && contexto.posiciones.length > 0 ? (
              <div className="tarjeta posiciones">
                {contexto.posiciones.map((posicion) => (
                  <p className="posicion" key={posicion.conceptoId}>
                    Este es tu <strong>{posicion.puesto}.º mes con más gasto</strong> en{' '}
                    <strong>{posicion.nombre}</strong>, de {posicion.deCuantos} meses con datos.
                  </p>
                ))}
              </div>
            ) : null}
            <p className="seccion-pista">
              {cuantos(ranking.length, 'concepto')} · {euros(resumen.extras)} en total.
            </p>

            {ranking.length === 0 ? (
              <EstadoVacio
                icono="—"
                titulo="Ningún gasto variable"
                texto="Este mes no hay ningún apunte suelto."
              />
            ) : (
              <div className="tarjeta barras">
                {ranking.map((linea) => (
                  <div className="barra-fila" key={linea.conceptoId}>
                    <span className="barra-nombre">
                      {linea.concepto}
                      {linea.cuantos > 1 ? (
                        <span className="barra-nota"> ×{linea.cuantos}</span>
                      ) : null}
                    </span>
                    <span className="barra-canal">
                      <span
                        className={`barra-relleno ${linea.clasificacion}`}
                        style={{
                          width: `${mayorDelRanking ? (Math.abs(linea.importe) / mayorDelRanking) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <span className={`dinero barra-importe${linea.importe < 0 ? ' negativo' : ''}`}>
                      {euros(linea.importe)}
                    </span>
                    <span className="barra-porcentaje">
                      {porcentaje(resumen.extras ? (linea.importe / resumen.extras) * 100 : null)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
