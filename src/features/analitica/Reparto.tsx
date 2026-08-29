import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Reparto as Datos } from '../../lib/tipos'
import { ErrorLinea, EstadoVacio } from '../../components/Basicos'
import { EsqueletoLista } from '../../components/Esqueleto'
import { GraficoAreaApilada } from '../../components/graficos/Graficos'
import { cuantos, euros, MESES_CORTOS, porcentaje } from '../../lib/formato'
import { BarraFila, Tarjetas } from './Piezas'

/**
 * En qué se va el dinero en el rango.
 *
 * Tres preguntas, en este orden: en qué conceptos, en qué tipo de gasto
 * (necesario / prescindible), y si esa proporción está cambiando con el tiempo.
 */
export function Reparto({ consulta }: { consulta: string }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    setError('')
    setDatos(null)
    api<Datos>(`/analitica/reparto${consulta ? `?${consulta}` : ''}`)
      .then((d) => vigente && setDatos(d))
      .catch((causa) => vigente && setError(mensajeDeError(causa)))
    return () => {
      vigente = false
    }
  }, [consulta])

  if (error) return <ErrorLinea mensaje={error} />
  if (!datos) return <EsqueletoLista filas={10} />

  if (datos.total === 0) {
    return (
      <EstadoVacio
        icono="—"
        titulo="Sin gastos en este rango"
        texto="Prueba con otro periodo."
      />
    )
  }

  const mayor = datos.porConcepto[0]?.importe ?? 1
  const totalClasificacion = datos.porClasificacion.reduce(
    (t, c) => t + Math.max(0, c.importe),
    0,
  )

  return (
    <>
      {/* ---------- por concepto ---------- */}
      <h3 className="seccion-titulo">Por concepto</h3>
      <p className="seccion-pista">
        Los quince mayores del rango, sobre un total de {euros(datos.total)}.
      </p>

      <div className="tarjeta barras">
        {datos.porConcepto.map((linea, indice) => (
          <BarraFila
            key={linea.conceptoId}
            nombre={linea.nombre}
            importe={euros(linea.importe)}
            proporcion={linea.importe / mayor}
            porcentajeTexto={porcentaje(linea.porcentaje, 1)}
            color={`serie-${(indice % 6) + 1}`}
          />
        ))}
        {datos.resto ? (
          <BarraFila
            nombre="Resto"
            nota={`(${cuantos(datos.resto.cuantos, 'concepto')})`}
            importe={euros(datos.resto.importe)}
            proporcion={datos.resto.importe / mayor}
            porcentajeTexto={porcentaje(datos.resto.porcentaje, 1)}
            color="media"
          />
        ) : null}
      </div>

      {/* ---------- por clasificación ---------- */}
      <h3 className="seccion-titulo">Necesario, prescindible y ahorro</h3>
      <p className="seccion-pista">
        La misma clasificación que usa la regla 50/30/20, sumada en todo el rango.
      </p>

      <Tarjetas
        tarjetas={datos.porClasificacion.map((bloque) => ({
          etiqueta: bloque.nombre,
          valor: euros(bloque.importe),
          nota:
            totalClasificacion > 0 && bloque.importe > 0
              ? `${porcentaje((bloque.importe / totalClasificacion) * 100, 0)} del total`
              : undefined,
        }))}
      />

      <h4 className="subseccion">Cómo cambia esa proporción</h4>
      <GraficoAreaApilada
        etiquetasX={datos.evolucion.map((e) => `${MESES_CORTOS[e.mes - 1]} ${String(e.anio).slice(2)}`)}
        series={[
          {
            nombre: 'Necesario',
            valores: datos.evolucion.map((e) => e.necesario),
            color: 'necesario',
          },
          {
            nombre: 'Prescindible',
            valores: datos.evolucion.map((e) => e.prescindible),
            color: 'prescindible',
          },
          { nombre: 'Ahorro', valores: datos.evolucion.map((e) => e.ahorro), color: 'ahorro' },
        ]}
        titulo="Reparto mensual entre gasto necesario, prescindible y ahorro"
        alto={220}
      />
      <div className="leyenda">
        <span className="necesario">
          <i />
          Necesario
        </span>
        <span className="prescindible">
          <i />
          Prescindible
        </span>
        <span className="ahorro">
          <i />
          Ahorro
        </span>
      </div>
      <p className="pista">
        Al ir al 100 % lo que se ve es la proporción, no el importe. Los meses con ahorro negativo
        aparecen sin esa franja: un sobrante en rojo no se puede apilar.
      </p>

      {/* ---------- ranking de variables ---------- */}
      <h3 className="seccion-titulo">Los variables, uno a uno</h3>
      <p className="seccion-pista">
        Con cuántos apuntes y cuánto sale de media cada uno: sirve para ver si algo cuesta caro por
        muchos gastos pequeños o por pocos grandes.
      </p>

      <div className="tarjeta tabla-ranking">
        <div className="ranking-fila cabecera">
          <span>Concepto</span>
          <span>Total</span>
          <span>Apuntes</span>
          <span>Ticket medio</span>
        </div>
        {datos.ranking.map((linea) => (
          <div className="ranking-fila" key={linea.conceptoId}>
            <span className="ranking-nombre">
              {linea.nombre}
              <span className={`etiqueta-mini ${linea.clasificacion}`}>
                {linea.clasificacion === 'necesario' ? 'necesario' : 'prescindible'}
              </span>
            </span>
            <span className="dinero">{euros(linea.importe)}</span>
            <span className="dinero">{linea.apuntes}</span>
            <span className="dinero">{euros(linea.ticketMedio ?? null)}</span>
          </div>
        ))}
      </div>
    </>
  )
}
