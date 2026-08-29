import { useEffect, useMemo, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { RangoDisponible, Serie } from '../../lib/tipos'
import { ErrorLinea, EstadoVacio } from '../../components/Basicos'
import { EsqueletoResumen } from '../../components/Esqueleto'
import { GraficoLineas, type Linea } from '../../components/graficos/Graficos'
import { Interruptor } from '../../components/Campos'
import { cuantos, euros, MESES_CORTOS, porcentaje } from '../../lib/formato'
import { Tarjetas, Variacion } from './Piezas'

/**
 * Evolución de un concepto (o de una agrupación) mes a mes.
 *
 * Es la vista que responde a "¿cuánto ha subido la luz?". Por eso lleva
 * siempre la línea de la media del rango: sin ella, una gráfica que sube y baja
 * no dice si el nivel general ha cambiado.
 */
export function Evolucion({
  disponible,
  consulta,
  onAbrirMes,
}: {
  disponible: RangoDisponible
  consulta: string
  onAbrirMes: (anio: number, mes: number) => void
}) {
  const [clave, setClave] = useState('gastos')
  const [serie, setSerie] = useState<Serie | null>(null)
  const [error, setError] = useState('')
  const [superponer, setSuperponer] = useState(false)

  useEffect(() => {
    let vigente = true
    setError('')
    setSerie(null)
    api<Serie>(`/analitica/serie?clave=${encodeURIComponent(clave)}${consulta ? `&${consulta}` : ''}`)
      .then((datos) => vigente && setSerie(datos))
      .catch((causa) => vigente && setError(mensajeDeError(causa)))
    return () => {
      vigente = false
    }
  }, [clave, consulta])

  const lineas = useMemo<Linea[]>(() => {
    if (!serie) return []

    if (superponer) {
      // Una línea por año, todas sobre el eje enero–diciembre.
      return serie.porAnio.map((anio, indice) => ({
        nombre: String(anio.anio),
        valores: anio.valores,
        color: `serie-${(indice % 6) + 1}`,
      }))
    }

    const salida: Linea[] = [
      { nombre: serie.nombre, valores: serie.puntos.map((p) => p.valor), color: 'serie-1' },
    ]

    // La media del rango, como referencia horizontal.
    if (serie.resumen.media !== null) {
      salida.push({
        nombre: 'Media del rango',
        valores: serie.puntos.map(() => serie.resumen.media),
        color: 'media',
        discontinua: true,
      })
    }

    // El previsto solo si el concepto lo tiene: es lo que permite ver desvíos.
    if (serie.puntos.some((p) => p.previsto !== null)) {
      salida.push({
        nombre: 'Previsto',
        valores: serie.puntos.map((p) => p.previsto),
        color: 'previsto',
        discontinua: true,
      })
    }

    return salida
  }, [serie, superponer])

  const etiquetas = useMemo(() => {
    if (!serie) return []
    return superponer
      ? MESES_CORTOS
      : serie.puntos.map((p) => `${MESES_CORTOS[p.mes - 1]} ${String(p.anio).slice(2)}`)
  }, [serie, superponer])

  if (error) return <ErrorLinea mensaje={error} />
  if (!serie) return <EsqueletoResumen />

  const variosAnios = serie.porAnio.length > 1

  return (
    <>
      <div className="fila-campos">
        <label className="solo-lectores" htmlFor="que-mirar">
          Qué mirar
        </label>
        <select
          id="que-mirar"
          className="campo"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        >
          <optgroup label="En conjunto">
            {disponible.agrupaciones.map((a) => (
              <option key={a.clave} value={a.clave}>
                {a.nombre}
              </option>
            ))}
          </optgroup>
          <optgroup label="Conceptos">
            {disponible.conceptos.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.nombre}
                {c.activo === false ? ' (desactivado)' : ''}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {serie.resumen.mesesConDatos === 0 ? (
        <EstadoVacio
          icono="—"
          titulo="Sin datos en este rango"
          texto="No hay ningún apunte de este concepto en las fechas elegidas."
        />
      ) : (
        <>
          <Tarjetas
            tarjetas={[
              { etiqueta: 'Total del rango', valor: euros(serie.resumen.total) },
              {
                etiqueta: 'Media mensual',
                valor: euros(serie.resumen.media),
                nota: cuantos(serie.resumen.mesesConDatos, 'mes', 'meses'),
              },
              serie.resumen.maximo
                ? {
                    etiqueta: 'Mes más alto',
                    valor: euros(serie.resumen.maximo.valor),
                    nota: `${serie.resumen.maximo.nombre} ${serie.resumen.maximo.anio}`,
                  }
                : null,
              serie.comparacion
                ? {
                    etiqueta: 'Periodo anterior',
                    valor: euros(serie.comparacion.total),
                    nota: `${serie.comparacion.desde} a ${serie.comparacion.hasta}`,
                    extra: (
                      <Variacion
                        valor={serie.comparacion.variacion}
                        // Más gasto es peor, salvo en ingresos y sobrante.
                        subirEsBueno={clave === 'ingresos' || clave === 'sobrante'}
                      />
                    ),
                    aviso: serie.comparacion.comparable
                      ? null
                      : `Ojo: aquel periodo tenía ${cuantos(serie.comparacion.mesesConDatos, 'mes', 'meses')} con datos y este ${serie.resumen.mesesConDatos}.`,
                  }
                : null,
            ]}
          />

          {variosAnios ? (
            <div className="fila fila-ajuste">
              <div className="fila-cuerpo">
                <span className="fila-titulo">Superponer los años</span>
                <span className="fila-detalle">
                  Una línea por año sobre el eje enero–diciembre, para comparar el mismo mes.
                </span>
              </div>
              <Interruptor
                activo={superponer}
                onCambiar={setSuperponer}
                ariaLabel="Superponer los años"
              />
            </div>
          ) : null}

          <GraficoLineas
            lineas={lineas}
            etiquetasX={etiquetas}
            titulo={`Evolución de ${serie.nombre} entre ${serie.rango.desde} y ${serie.rango.hasta}`}
            alto={280}
            tooltipExtra={
              superponer
                ? undefined
                : (indice) => {
                    const punto = serie.puntos[indice]
                    if (!punto || punto.valor === null || punto.previsto === null) return null
                    const desvio = punto.valor - punto.previsto
                    return desvio === 0 ? null : `${desvio > 0 ? '+' : ''}${euros(desvio)} sobre lo previsto`
                  }
            }
          />

          <div className="leyenda">
            {lineas.map((linea) => (
              <span key={linea.nombre} className={linea.color}>
                <i className={linea.discontinua ? 'punteada' : ''} />
                {linea.nombre}
              </span>
            ))}
          </div>

          {!superponer ? (
            <p className="pista">
              Pulsa un mes en la tabla de abajo para abrirlo.{' '}
              {serie.resumen.minimo
                ? `El más bajo fue ${serie.resumen.minimo.nombre} de ${serie.resumen.minimo.anio}, con ${euros(serie.resumen.minimo.valor)}.`
                : ''}
            </p>
          ) : null}

          {!superponer ? (
            <div className="tarjeta lista-meses">
              {serie.puntos
                .filter((p) => p.valor !== null)
                .map((punto) => (
                  <button
                    key={punto.clave}
                    className="fila fila-boton"
                    onClick={() => onAbrirMes(punto.anio, punto.mes)}
                  >
                    <span className="fila-cuerpo">
                      <span className="fila-titulo">
                        {punto.nombre} {punto.anio}
                      </span>
                      {punto.previsto !== null ? (
                        <span className="fila-detalle">
                          previsto {euros(punto.previsto)}
                          {punto.valor !== null && punto.previsto !== 0
                            ? ` · ${porcentaje(((punto.valor - punto.previsto) / Math.abs(punto.previsto)) * 100, 0)} de desvío`
                            : ''}
                        </span>
                      ) : null}
                    </span>
                    <span className="dinero">{euros(punto.valor)}</span>
                  </button>
                ))}
            </div>
          ) : null}
        </>
      )}
    </>
  )
}
