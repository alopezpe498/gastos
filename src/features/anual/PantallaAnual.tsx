import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Anual, FilaAnual, TotalesAnioAnterior } from '../../lib/tipos'
import { Cabecera, ErrorLinea, EstadoVacio } from '../../components/Basicos'
import { EsqueletoLista } from '../../components/Esqueleto'
import { useEsEscritorio } from '../../lib/tamano'
import { MatrizAnual } from './MatrizAnual'
import { VistaConcepto } from './VistaConcepto'
import { InformeAnual } from '../informe/Informe'
import { SelectorDeAnio } from '../../components/SelectorDeMes'

type Props = {
  onAbrirMes: (anio: number, mes: number) => void
  /** Año al que abrir directamente, cuando se llega desde la analítica. */
  anioElegido?: number | null
}

/**
 * La hoja anual del Excel, tal cual: conceptos en las filas, meses en las
 * columnas, y al final el total del año y la media mensual.
 *
 * En escritorio se ve entera, con la primera columna fija al desplazar. En
 * movil una tabla de doce columnas no se lee, asi que se elige un concepto y se
 * ven sus doce meses en vertical.
 */
export function PantallaAnual({ onAbrirMes, anioElegido = null }: Props) {
  const escritorio = useEsEscritorio()
  const [anios, setAnios] = useState<number[] | null>(null)
  const [anio, setAnio] = useState<number | null>(null)
  const [datos, setDatos] = useState<Anual | null>(null)
  // Los totales del año anterior, para la columna de comparación. Se piden
  // aparte: si ese año no existe, la tabla se dibuja igual sin esa columna.
  const [anterior, setAnterior] = useState<TotalesAnioAnterior | null>(null)
  const [error, setError] = useState('')
  const [informeAbierto, setInformeAbierto] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      try {
        const lista = await api<number[]>('/anual')
        setAnios(lista)
        setAnio((actual) => actual ?? anioElegido ?? lista[0] ?? null)
      } catch (causa) {
        setError(mensajeDeError(causa))
      }
    }
    void cargar()
  }, [anioElegido])

  const cargarAnio = useCallback(async (elegido: number) => {
    setError('')
    setDatos(null)
    setAnterior(null)
    try {
      setDatos(await api<Anual>(`/anual/${elegido}`))
    } catch (causa) {
      setError(mensajeDeError(causa))
      return
    }
    try {
      const previo = await api<TotalesAnioAnterior>(`/analitica/anual/${elegido - 1}`)
      setAnterior(previo.meses > 0 ? previo : null)
    } catch {
      // Sin año anterior la tabla se queda como estaba: no es un error.
    }
  }, [])

  useEffect(() => {
    if (anio !== null) void cargarAnio(anio)
  }, [anio, cargarAnio])

  /**
   * El desglose de "Otros" por concepto variable. La API devuelve los apuntes
   * sueltos de cada mes; aqui se cruzan en la misma forma que el resto de la
   * tabla para que la fila desplegada se lea igual que las de arriba.
   */
  const desgloseOtros = useMemo<FilaAnual[]>(() => {
    if (!datos) return []
    const meses = datos.meses.map((m) => m.numero)
    const porConcepto = new Map<string, Map<number, number>>()

    for (const [mes, apuntes] of Object.entries(datos.detalleVariables)) {
      for (const apunte of apuntes) {
        const celdas = porConcepto.get(apunte.concepto) ?? new Map<number, number>()
        const numero = Number(mes)
        celdas.set(numero, Math.round(((celdas.get(numero) ?? 0) + apunte.importe) * 100) / 100)
        porConcepto.set(apunte.concepto, celdas)
      }
    }

    return [...porConcepto.entries()]
      .map(([nombre, celdas]) => {
        const valores = meses.map((m) => celdas.get(m) ?? null)
        const total =
          Math.round(valores.filter((v) => v !== null).reduce((t, v) => t + (v ?? 0), 0) * 100) / 100
        return {
          nombre,
          tipo: 'otros' as const,
          valores,
          total,
          media: meses.length ? Math.round((total / meses.length) * 100) / 100 : 0,
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [datos])

  /*
   * Los años que hay son pocos y caben todos a la vista: se pulsa el que sea,
   * sin desplegar nada. Las flechas están para el teclado y para el pulgar.
   */
  const selector =
    anios && anios.length > 0 && anio ? (
      <SelectorDeAnio anio={anio} anios={anios} onIr={setAnio} />
    ) : null

  if (error) {
    return (
      <>
        <Cabecera titulo="Año" acciones={selector} />
        <div className="limite">
          <ErrorLinea mensaje={error} onReintentar={() => anio && void cargarAnio(anio)} />
        </div>
      </>
    )
  }

  if (anios && anios.length === 0) {
    return (
      <>
        <Cabecera titulo="Año" />
        <div className="limite">
          <EstadoVacio
            icono="—"
            titulo="Todavía no hay ningún año"
            texto="Abre un mes o importa una hoja del Excel y aquí verás la tabla del año entero."
          />
        </div>
      </>
    )
  }

  return (
    <>
      <Cabecera
        titulo={anio ? String(anio) : 'Año'}
        acciones={
          <div className="cabecera-acciones">
            <button
              className="boton boton-secundario boton-compacto"
              disabled={!datos}
              onClick={() => setInformeAbierto(true)}
            >
              Informe
            </button>
            {selector}
          </div>
        }
        anchaEnEscritorio
      />

      {informeAbierto && datos ? (
        <InformeAnual datos={datos} anterior={anterior} onCerrar={() => setInformeAbierto(false)} />
      ) : null}

      <div className="limite limite-ancho">
        {!datos ? (
          <EsqueletoLista filas={10} />
        ) : escritorio ? (
          <MatrizAnual
            datos={datos}
            desgloseOtros={desgloseOtros}
            anterior={anterior}
            onAbrirMes={onAbrirMes}
          />
        ) : (
          <VistaConcepto datos={datos} desgloseOtros={desgloseOtros} onAbrirMes={onAbrirMes} />
        )}
      </div>
    </>
  )
}
