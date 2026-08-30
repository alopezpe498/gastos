import { useEffect, useMemo, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Comparativa as Datos, RangoDisponible } from '../../lib/tipos'

import { GraficoBarrasAgrupadas } from '../../components/ui/GraficosGrandes'
import { euros, NOMBRES_MESES, porcentaje } from '../../lib/formato'
import { Variacion } from './Piezas'
import { ErrorLinea, Esqueleto } from '../../components/ui/Basicos'

type Orden = 'importe' | 'variacion'

/**
 * Comparativa entre años.
 *
 * Lo que se viene a saber aquí es "¿en qué me estoy gastando más que el año
 * pasado?". Por eso lo que se resalta no es el importe sino la VARIACIÓN, y se
 * puede ordenar por ella.
 */
export function Comparativa({
  disponible,
  onAbrirAnio,
}: {
  disponible: RangoDisponible
  onAbrirAnio: (anio: number) => void
}) {
  const [anios, setAnios] = useState<number[]>(() => disponible.anios.slice(0, 2).sort((a, b) => a - b))
  const [hastaMes, setHastaMes] = useState<number | null>(null)
  const [orden, setOrden] = useState<Orden>('importe')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (anios.length === 0) return
    let vigente = true
    setError('')
    setDatos(null)
    const consulta = `anios=${anios.join(',')}${hastaMes ? `&hastaMes=${hastaMes}` : ''}`
    api<Datos>(`/analitica/comparativa?${consulta}`)
      .then((d) => vigente && setDatos(d))
      .catch((causa) => vigente && setError(mensajeDeError(causa)))
    return () => {
      vigente = false
    }
  }, [anios, hastaMes])

  const ultimo = anios.length ? Math.max(...anios) : null

  const filas = useMemo(() => {
    if (!datos) return []
    const copia = [...datos.filas]
    if (orden === 'variacion') {
      // Los que no tienen variación (solo salen en un año) van al final: no se
      // pueden comparar y no deben colarse arriba.
      return copia.sort((a, b) => {
        if (a.variacion === null) return 1
        if (b.variacion === null) return -1
        return b.variacion - a.variacion
      })
    }
    return copia
  }, [datos, orden])

  const alternarAnio = (anio: number) => {
    setAnios((actuales) => {
      if (actuales.includes(anio)) {
        return actuales.length > 1 ? actuales.filter((a) => a !== anio) : actuales
      }
      // Cuatro años ya son demasiadas columnas para leer de un vistazo.
      const nuevos = [...actuales, anio].sort((a, b) => a - b)
      return nuevos.length > 4 ? nuevos.slice(-4) : nuevos
    })
  }

  if (error) return <ErrorLinea mensaje={error} />

  return (
    <>
      <div className="tira-rango" role="group" aria-label="Años a comparar">
        {disponible.anios
          .slice()
          .sort((a, b) => a - b)
          .map((anio) => (
            <button
              key={anio}
              className={`chip${anios.includes(anio) ? ' activo' : ''}`}
              aria-pressed={anios.includes(anio)}
              onClick={() => alternarAnio(anio)}
            >
              {anio}
            </button>
          ))}
      </div>

      <div className="fila-campos">
        <label className="campo-etiqueta" htmlFor="hasta-mes">
          Comparar solo hasta
        </label>
        <select
          id="hasta-mes"
          className="campo"
          value={hastaMes ?? ''}
          onChange={(e) => setHastaMes(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">el año entero</option>
          {NOMBRES_MESES.map((nombre, i) => (
            <option key={nombre} value={i + 1}>
              {nombre}
            </option>
          ))}
        </select>
      </div>

      {datos?.parcial ? (
        <p className="pista">
          Comparando enero–{NOMBRES_MESES[datos.hastaMes - 1].toLowerCase()} de cada año, para que
          un año a medias no parezca más barato de lo que es.
        </p>
      ) : null}

      {!datos ? (
        <Esqueleto filas={8} />
      ) : (
        <>
          {/* ---------- totales ---------- */}
          <div className="tarjeta tabla-comparativa">
            <div className="comparativa-fila cabecera">
              <span>Totales</span>
              {datos.anios.map((anio) => (
                <span key={anio} className="dinero">
                  {anio}
                </span>
              ))}
              <span className="dinero">Δ</span>
            </div>

            {(
              [
                ['Ingresos', 'ingresos', true],
                ['Gastos', 'gastos', false],
                ['Sobrante', 'sobrante', true],
              ] as const
            ).map(([nombre, campo, subirEsBueno]) => {
              const valores: (number | null)[] = datos.anios.map(
                (a) => datos.totales[a]?.[campo] ?? null,
              )
              const ultimoValor = valores.at(-1) ?? null
              const anterior = valores.length > 1 ? (valores.at(-2) ?? null) : null
              const variacion =
                ultimoValor !== null && anterior !== null && anterior !== 0
                  ? ((ultimoValor - anterior) / Math.abs(anterior)) * 100
                  : null
              return (
                <div className="comparativa-fila total" key={campo}>
                  <span>{nombre}</span>
                  {valores.map((valor, i) => (
                    <button
                      key={datos.anios[i]}
                      className={`dinero enlace-celda${valor !== null && valor < 0 ? ' negativo' : ''}`}
                      onClick={() => onAbrirAnio(datos.anios[i])}
                    >
                      {euros(valor)}
                    </button>
                  ))}
                  <span>
                    <Variacion valor={variacion} subirEsBueno={subirEsBueno} />
                  </span>
                </div>
              )
            })}

            <div className="comparativa-fila total">
              <span>% de ahorro</span>
              {datos.anios.map((anio) => (
                <span
                  key={anio}
                  className={`dinero${(datos.totales[anio]?.porcentajeAhorro ?? 0) < 0 ? ' negativo' : ' positivo'}`}
                >
                  {porcentaje(datos.totales[anio]?.porcentajeAhorro ?? null, 1)}
                </span>
              ))}
              <span />
            </div>
          </div>

          {/* ---------- gráfico ---------- */}
          <GraficoBarrasAgrupadas
            categorias={filas.slice(0, 10).map((f) => f.nombre)}
            series={datos.anios.map((anio, i) => ({
              nombre: String(anio),
              valores: filas.slice(0, 10).map((f) => f.totales[anio] ?? null),
              color: `serie-${(i % 6) + 1}`,
            }))}
            titulo={`Los diez conceptos con más gasto, comparados entre ${datos.anios.join(' y ')}`}
            alto={280}
          />
          <div className="leyenda">
            {datos.anios.map((anio, i) => (
              <span key={anio} className={`serie-${(i % 6) + 1}`}>
                <i />
                {anio}
              </span>
            ))}
          </div>

          {/* ---------- tabla por concepto ---------- */}
          <div className="seccion-cabecera">
            <h3 className="seccion-titulo">Por concepto</h3>
            <div className="segmentado pequeno">
              <button
                className={orden === 'importe' ? 'activo' : ''}
                onClick={() => setOrden('importe')}
              >
                Por importe
              </button>
              <button
                className={orden === 'variacion' ? 'activo' : ''}
                onClick={() => setOrden('variacion')}
              >
                Por variación
              </button>
            </div>
          </div>

          <div className="tarjeta tabla-comparativa">
            <div className="comparativa-fila cabecera">
              <span>Concepto</span>
              {datos.anios.map((anio) => (
                <span key={anio} className="dinero">
                  {anio}
                </span>
              ))}
              <span className="dinero">Δ</span>
            </div>

            {filas.map((fila) => (
              <div
                className={
                  'comparativa-fila' +
                  // Rojo lo que sube más de un 10 %, verde lo que baja más de un 10 %.
                  (fila.variacion !== null && fila.variacion > 10 ? ' sube' : '') +
                  (fila.variacion !== null && fila.variacion < -10 ? ' baja' : '')
                }
                key={fila.clave}
              >
                <span className="comparativa-nombre">{fila.nombre}</span>
                {datos.anios.map((anio) => (
                  <span key={anio} className="dinero">
                    {fila.totales[anio] === undefined ? '—' : euros(fila.totales[anio])}
                  </span>
                ))}
                <span className="comparativa-variacion">
                  <Variacion valor={fila.variacion} />
                  {fila.diferencia !== null ? (
                    <span className="resumen-nota dinero">
                      {fila.diferencia > 0 ? '+' : ''}
                      {euros(fila.diferencia)}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>

          <p className="pista">
            En rojo lo que sube más de un 10 % respecto a {ultimo !== null ? ultimo - 1 : 'el año anterior'};
            en verde lo que baja más de un 10 %. Un guion quiere decir que ese año no hubo ningún
            apunte de ese concepto.
          </p>
        </>
      )}
    </>
  )
}
