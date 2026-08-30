import { useEffect, useMemo, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { RangoDisponible } from '../../lib/tipos'
import { Cabecera, ErrorLinea, Esqueleto, Tabs, Vacio } from '../../components/ui/Basicos'
import { SelectorRango, comoConsulta, nombreDelAmbito, type Ambito } from './SelectorRango'
import { Evolucion } from './Evolucion'
import { Comparativa } from './Comparativa'
import { Reparto } from './Reparto'
import { Ahorro } from './Ahorro'
import { Estacionalidad } from './Estacionalidad'

type Pestana = 'evolucion' | 'comparativa' | 'reparto' | 'ahorro' | 'estacionalidad'

const PESTANAS: { id: Pestana; nombre: string; pista: string }[] = [
  { id: 'evolucion', nombre: 'Evolución', pista: 'Cómo va un concepto mes a mes' },
  { id: 'comparativa', nombre: 'Años', pista: 'Este año frente al anterior' },
  { id: 'reparto', nombre: 'Reparto', pista: 'En qué se va el dinero' },
  { id: 'ahorro', nombre: 'Ahorro', pista: 'Sobrante y 50/30/20' },
  { id: 'estacionalidad', nombre: 'Meses', pista: 'Qué se dispara y cuándo' },
]

/**
 * Analítica del histórico.
 *
 * Un solo rango manda sobre todas las pestañas: cambiarlo arriba cambia las
 * cinco. La comparativa entre años es la excepción, porque ahí lo que se
 * compara son años enteros y tiene su propio selector.
 */
export function PantallaAnalitica({
  onAbrirMes,
  onAbrirAnio,
}: {
  onAbrirMes: (anio: number, mes: number) => void
  onAbrirAnio: (anio: number) => void
}) {
  const [disponible, setDisponible] = useState<RangoDisponible | null>(null)
  const [error, setError] = useState('')
  const [pestana, setPestana] = useState<Pestana>('evolucion')
  const [ambito, setAmbito] = useState<Ambito>({ tipo: 'ultimos', meses: 12 })

  useEffect(() => {
    api<RangoDisponible>('/analitica/rango')
      .then(setDisponible)
      .catch((causa) => setError(mensajeDeError(causa)))
  }, [])

  const consulta = useMemo(() => comoConsulta(ambito), [ambito])

  if (error) {
    return (
      <>
        <Cabecera titulo="Analítica" />
        <div className="pila">
          <ErrorLinea mensaje={error} />
        </div>
      </>
    )
  }

  if (!disponible) {
    return (
      <>
        <Cabecera titulo="Analítica" />
        <div className="pila">
          <Esqueleto filas={8} />
        </div>
      </>
    )
  }

  if (!disponible.primero) {
    return (
      <>
        <Cabecera titulo="Analítica" />
        <div className="pila">
          <Vacio frase="Todavía no hay histórico Abre algún mes o importa tus hojas del Excel, y aquí verás cómo evoluciona todo." />
        </div>
      </>
    )
  }

  const actual = PESTANAS.find((p) => p.id === pestana)!

  return (
    <>
      <Cabecera
        titulo="Analítica"
        subtitulo={`${actual.pista} · ${nombreDelAmbito(ambito)}`}
        debajo={
          <>
            <Tabs pestanas={PESTANAS} activa={pestana} onCambiar={setPestana} />

            {/* La comparativa entre años elige sus propios años. */}
            {pestana === 'comparativa' ? null : (
              <SelectorRango disponible={disponible} ambito={ambito} onCambiar={setAmbito} />
            )}
          </>
        }
      />

      <div className="pila">
        {pestana === 'evolucion' ? (
          <Evolucion disponible={disponible} consulta={consulta} onAbrirMes={onAbrirMes} />
        ) : null}
        {pestana === 'comparativa' ? (
          <Comparativa disponible={disponible} onAbrirAnio={onAbrirAnio} />
        ) : null}
        {pestana === 'reparto' ? <Reparto consulta={consulta} /> : null}
        {pestana === 'ahorro' ? <Ahorro consulta={consulta} onAbrirMes={onAbrirMes} /> : null}
        {pestana === 'estacionalidad' ? <Estacionalidad consulta={consulta} /> : null}
      </div>
    </>
  )
}
