import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Ahorro as Datos } from '../../lib/tipos'
import { GraficoBarras } from '../../components/ui/GraficosGrandes'
import { cuantos, euros, MESES_CORTOS, porcentaje } from '../../lib/formato'
import { Tarjetas } from './Piezas'
import { ErrorLinea, Esqueleto, Vacio } from '../../components/ui/Basicos'

/**
 * Tendencia del ahorro.
 *
 * El sobrante mes a mes en barras (verde arriba, rojo abajo) con el acumulado
 * encima: las barras dicen cómo fue cada mes y la línea dice si, en conjunto,
 * se está subiendo o bajando. Debajo, el 50/30/20 agregado por año.
 */
export function Ahorro({ consulta, onAbrirMes }: { consulta: string; onAbrirMes: (anio: number, mes: number) => void }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    setError('')
    setDatos(null)
    api<Datos>(`/analitica/ahorro${consulta ? `?${consulta}` : ''}`)
      .then((d) => vigente && setDatos(d))
      .catch((causa) => vigente && setError(mensajeDeError(causa)))
    return () => {
      vigente = false
    }
  }, [consulta])

  if (error) return <ErrorLinea mensaje={error} />
  if (!datos) return <Esqueleto />

  if (datos.resumen.mesesConDatos === 0) {
    return <Vacio frase="Sin datos en este rango" />
  }

  const { resumen } = datos

  return (
    <>
      <Tarjetas
        tarjetas={[
          {
            etiqueta: 'Sobrante acumulado',
            valor: euros(resumen.total),
            nota: cuantos(resumen.mesesConDatos, 'mes', 'meses'),
          },
          { etiqueta: 'Media mensual', valor: euros(resumen.media) },
          {
            etiqueta: 'Meses en positivo',
            valor: `${resumen.positivos} de ${resumen.mesesConDatos}`,
            nota: `${resumen.negativos} en negativo`,
          },
          resumen.mejor
            ? {
                etiqueta: 'Mejor mes',
                valor: euros(resumen.mejor.sobrante),
                nota: `${resumen.mejor.nombre} ${resumen.mejor.anio}`,
              }
            : null,
          resumen.peor
            ? {
                etiqueta: 'Peor mes',
                valor: euros(resumen.peor.sobrante),
                nota: `${resumen.peor.nombre} ${resumen.peor.anio}`,
              }
            : null,
        ]}
      />

      <GraficoBarras
        valores={datos.puntos.map((p) => p.sobrante)}
        etiquetasX={datos.puntos.map((p) => `${MESES_CORTOS[p.mes - 1]} ${String(p.anio).slice(2)}`)}
        titulo="Sobrante de cada mes, con el acumulado del rango"
        alto={280}
        porSigno
        lineaExtra={{
          nombre: 'Acumulado',
          valores: datos.puntos.map((p) => p.acumulado),
          color: 'serie-3',
        }}
        onPulsar={(indice) => {
          const punto = datos.puntos[indice]
          if (punto?.sobrante !== null) onAbrirMes(punto.anio, punto.mes)
        }}
      />
      <div className="leyenda">
        <span className="serie-3">
          <i />
          Acumulado del rango
        </span>
        <span className="pista">Pulsa una barra para abrir ese mes.</span>
      </div>

      {/* ---------- 50/30/20 por año ---------- */}
      <h3 className="seccion-titulo">Real frente a ideal, por año</h3>
      <p className="seccion-pista">
        La misma regla que en el análisis del mes, pero sumando el año entero.
      </p>

      <div className="tarjeta tabla-regla">
        <div className="regla-anual cabecera">
          <span>Año</span>
          <span>Necesario</span>
          <span>Prescindible</span>
          <span>Ahorro</span>
        </div>

        {datos.regla.map((anio) => (
          <div className="regla-anual" key={anio.anio}>
            <span className="regla-anual-anio">
              {anio.anio}
              <span className="resumen-nota">{cuantos(anio.meses, 'mes', 'meses')}</span>
            </span>

            {(['necesario', 'prescindible', 'ahorro'] as const).map((clave) => {
              const real = anio.porcentajes[clave]
              const ideal = anio.ideales[clave]
              // Gastar menos del ideal es bueno; ahorrar más, también.
              const cumple =
                real === null ? null : clave === 'ahorro' ? real >= ideal : real <= ideal
              return (
                <span className="regla-anual-celda" key={clave}>
                  <span
                    className={`semaforo ${cumple === null ? '' : cumple ? 'bien' : 'mal'}`}
                    aria-hidden="true"
                  />
                  <strong className={cumple === false ? 'negativo' : 'positivo'}>
                    {porcentaje(real, 1)}
                  </strong>
                  <span className="resumen-nota">
                    ideal {ideal} % · {euros(anio[clave])}
                  </span>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}
