import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Estacionalidad as Datos } from '../../lib/tipos'

import { GraficoBarras, MapaCalor } from '../../components/ui/GraficosGrandes'
import { euros, MESES_CORTOS } from '../../lib/formato'
import { ErrorLinea, Esqueleto, Vacio } from '../../components/ui/Basicos'

/**
 * En qué meses se dispara cada cosa.
 *
 * El mapa de calor colorea cada fila contra su propio máximo, no contra el de
 * la tabla: así se ve que los regalos se disparan en diciembre aunque la
 * hipoteca sea diez veces mayor todos los meses. El recuadro ámbar marca el mes
 * en que un concepto se sale de verdad de su media.
 */
export function Estacionalidad({ consulta }: { consulta: string }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [verTodos, setVerTodos] = useState(false)

  useEffect(() => {
    let vigente = true
    setError('')
    setDatos(null)
    api<Datos>(`/analitica/estacionalidad${consulta ? `?${consulta}` : ''}`)
      .then((d) => vigente && setDatos(d))
      .catch((causa) => vigente && setError(mensajeDeError(causa)))
    return () => {
      vigente = false
    }
  }, [consulta])

  if (error) return <ErrorLinea mensaje={error} />
  if (!datos) return <Esqueleto filas={10} />

  if (datos.filas.length === 0) {
    return <Vacio frase="Sin datos en este rango" />
  }

  const conPunta = datos.filas.filter((f) => f.puntaEn)
  const filas = verTodos ? datos.filas : datos.filas.slice(0, 20)
  const mediasDelMes = datos.totalPorMes.map((m) => m.media)

  return (
    <>
      {conPunta.length > 0 ? (
        <>
          <h3 className="seccion-titulo">Lo que se dispara en un mes concreto</h3>
          <p className="seccion-pista">
            Conceptos cuyo peor mes se va más de un 60 % por encima de su propia media.
          </p>
          <div className="tarjeta">
            {conPunta.slice(0, 8).map((fila) => (
              <div className="fila" key={fila.conceptoId}>
                <span className="fila-cuerpo">
                  <span className="fila-titulo">{fila.nombre}</span>
                  <span className="fila-detalle">
                    se dispara en <strong>{fila.puntaEn!.nombre}</strong>: ×{fila.puntaEn!.veces} su
                    media mensual
                  </span>
                </span>
                <span className="dinero">{euros(fila.medias[fila.puntaEn!.mes - 1])}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <h3 className="seccion-titulo">Concepto × mes</h3>
      <p className="seccion-pista">
        La media de cada mes con todos los años del rango. Cada fila se colorea contra su propio
        máximo, así que el color compara un concepto consigo mismo, no con los demás.
      </p>

      <MapaCalor filas={filas} />

      {datos.filas.length > 20 ? (
        <button className="boton boton-secundario" onClick={() => setVerTodos(!verTodos)}>
          {verTodos ? 'Ver solo los 20 mayores' : `Ver los ${datos.filas.length} conceptos`}
        </button>
      ) : null}

      <h3 className="seccion-titulo">Gasto total por mes del año</h3>
      <p className="seccion-pista">
        La media de todos los años del rango. Sirve para saber qué meses conviene tener colchón.
      </p>

      <GraficoBarras
        valores={mediasDelMes}
        etiquetasX={MESES_CORTOS}
        titulo="Gasto medio de cada mes del año"
        alto={240}
        color="serie-1"
      />

      <div className="tarjeta tabla-ranking">
        <div className="ranking-fila cabecera">
          <span>Mes</span>
          <span>Media</span>
          <span className="ranking-anios">Cada año</span>
        </div>
        {datos.totalPorMes.map((mes) => (
          <div className="ranking-fila" key={mes.mes}>
            <span>{mes.nombre}</span>
            <span className="dinero">{euros(mes.media)}</span>
            <span className="ranking-anios">
              {mes.anios.length === 0 ? (
                <span className="resumen-nota">sin datos</span>
              ) : (
                mes.anios.map((a) => (
                  <span className="pildora-anio" key={a.anio}>
                    {a.anio} <strong className="dinero">{euros(a.valor)}</strong>
                  </span>
                ))
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
