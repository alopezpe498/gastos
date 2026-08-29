import { useState } from 'react'
import type { Anual, FilaAnual } from '../../lib/tipos'
import { IconoAbajo, IconoChevron } from '../../components/Iconos'
import { Sparkline } from '../../components/graficos/Graficos'
import { euros, MESES_CORTOS, numero, porcentaje } from '../../lib/formato'
import type { TotalesAnioAnterior } from '../../lib/tipos'

type Props = {
  datos: Anual
  desgloseOtros: FilaAnual[]
  anterior: TotalesAnioAnterior | null
  onAbrirMes: (anio: number, mes: number) => void
}

/**
 * La matriz concepto x mes en escritorio.
 *
 * Se monta con CSS grid y no con <table> por una razon concreta: la primera
 * columna tiene que quedarse fija al desplazar horizontalmente, y con grid y
 * position:sticky eso son dos lineas de CSS.
 *
 * Cada celda es un boton que lleva a su mes: mirando la tabla anual, lo que
 * apetece al ver una cifra rara es ir a ese mes a ver que paso.
 */
export function MatrizAnual({ datos, desgloseOtros, anterior, onAbrirMes }: Props) {
  const [otrosAbierto, setOtrosAbierto] = useState(false)
  const columnas = datos.meses.length

  /**
   * El total del mismo concepto el año pasado. Las filas de totales (Gastos,
   * Ingresos, Ahorro) no son conceptos: salen de los generales.
   */
  const totalAnterior = (fila: FilaAnual): number | null => {
    if (!anterior) return null
    if (fila.tipo === 'total') {
      const g = anterior.generales
      if (!g) return null
      if (fila.nombre === 'Gastos') return g.gastos
      if (fila.nombre === 'Ingresos') return g.ingresos
      if (fila.nombre === 'Ahorro') return g.sobrante
      return null
    }
    if (fila.conceptoId === undefined) return null
    return anterior.totales[`concepto:${fila.conceptoId}`] ?? null
  }

  return (
    <div className="anual-marco">
      <div
        className="anual"
        style={{
          gridTemplateColumns: `180px 104px repeat(${columnas}, minmax(78px, 1fr)) 104px 92px${
            anterior ? ' 104px 74px' : ''
          }`,
        }}
        role="table"
        aria-label={`Gastos de ${datos.anio} por concepto y mes`}
      >
        {/* ---------- cabecera ---------- */}
        <div className="anual-celda anual-cabecera anual-primera">Concepto</div>
        <div className="anual-celda anual-cabecera">Año</div>
        {datos.meses.map((mes) => (
          <div className="anual-celda anual-cabecera" key={mes.numero}>
            {MESES_CORTOS[mes.numero - 1]}
          </div>
        ))}
        <div className="anual-celda anual-cabecera">Total</div>
        <div className="anual-celda anual-cabecera">Media</div>
        {anterior ? (
          <>
            <div className="anual-celda anual-cabecera">{anterior.anio}</div>
            <div className="anual-celda anual-cabecera">Δ</div>
          </>
        ) : null}

        {/* ---------- filas ---------- */}
        {datos.filas.map((fila) => (
          <Fila
            key={`${fila.tipo}-${fila.nombre}`}
            fila={fila}
            datos={datos}
            anterior={totalAnterior(fila)}
            hayAnterior={!!anterior}
            onAbrirMes={onAbrirMes}
            desplegable={fila.tipo === 'otros'}
            abierto={fila.tipo === 'otros' && otrosAbierto}
            onAlternar={() => setOtrosAbierto((v) => !v)}
          />
        ))}

        {/* ---------- desglose de "Otros" ---------- */}
        {otrosAbierto
          ? desgloseOtros.map((fila) => (
              <Fila
                key={`detalle-${fila.nombre}`}
                fila={fila}
                datos={datos}
                anterior={null}
                hayAnterior={!!anterior}
                onAbrirMes={onAbrirMes}
                sangrada
              />
            ))
          : null}
      </div>
    </div>
  )
}

function Fila({
  fila,
  datos,
  anterior,
  hayAnterior,
  onAbrirMes,
  desplegable = false,
  abierto = false,
  onAlternar,
  sangrada = false,
}: {
  fila: FilaAnual
  datos: Anual
  anterior: number | null
  hayAnterior: boolean
  onAbrirMes: (anio: number, mes: number) => void
  desplegable?: boolean
  abierto?: boolean
  onAlternar?: () => void
  sangrada?: boolean
}) {
  const variacion =
    anterior !== null && anterior !== 0 ? ((fila.total - anterior) / Math.abs(anterior)) * 100 : null
  const clase =
    'anual-fila' +
    (fila.tipo === 'total' ? ' total' : '') +
    (fila.tipo === 'otros' && !sangrada ? ' otros' : '') +
    (sangrada ? ' sangrada' : '')

  return (
    <>
      <div className={`anual-celda anual-primera ${clase}`}>
        {desplegable ? (
          <button className="anual-desplegar" onClick={onAlternar} aria-expanded={abierto}>
            {abierto ? <IconoAbajo size={16} /> : <IconoChevron size={16} />}
            {fila.nombre}
          </button>
        ) : (
          fila.nombre
        )}
      </div>

      {/* La sparkline resume la fila entera: se ve la forma sin leer doce cifras. */}
      <div className={`anual-celda anual-spark ${clase}`}>
        <Sparkline
          valores={fila.valores}
          titulo={`Evolución de ${fila.nombre} durante ${datos.anio}`}
        />
      </div>

      {datos.meses.map((mes, indice) => {
        const valor = fila.valores[indice]
        return (
          <button
            key={mes.numero}
            className={`anual-celda anual-valor ${clase}${valor === null ? ' vacia' : ''}${
              valor !== null && valor < 0 ? ' negativo' : ''
            }`}
            // Los meses en blanco no llevan a ninguna parte: no hay nada que ver.
            disabled={valor === null}
            aria-label={`${fila.nombre}, ${mes.nombre}: ${valor === null ? 'sin datos' : euros(valor)}`}
            onClick={() => onAbrirMes(datos.anio, mes.numero)}
          >
            {numero(valor)}
          </button>
        )
      })}

      <div className={`anual-celda anual-valor anual-total ${clase}`}>{numero(fila.total)}</div>
      <div className={`anual-celda anual-valor anual-media ${clase}`}>{numero(fila.media)}</div>

      {hayAnterior ? (
        <>
          <div className={`anual-celda anual-valor anual-anterior ${clase}`}>
            {anterior === null ? '' : numero(anterior)}
          </div>
          <div
            className={
              `anual-celda anual-valor anual-delta ${clase}` +
              (variacion === null ? '' : variacion > 10 ? ' sube' : variacion < -10 ? ' baja' : '')
            }
          >
            {variacion === null ? '' : `${variacion > 0 ? '+' : ''}${porcentaje(variacion, 0)}`}
          </div>
        </>
      ) : null}
    </>
  )
}
