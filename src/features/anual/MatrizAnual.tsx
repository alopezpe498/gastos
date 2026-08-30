import { useState } from 'react'
import type { Anual, FilaAnual } from '../../lib/tipos'
import { Card, IconoConcepto } from '../../components/ui/Basicos'
import { Celda, Fila as FilaTabla, Tabla } from '../../components/ui/Tabla'
import { Sparkline } from '../../components/ui/Graficos'
import { Icono } from '../../components/ui/Icono'
import { iconoDe, paletaDe } from '../../lib/conceptos'
import { MESES_CORTOS, numero, porcentaje } from '../../lib/formato'
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

  const meses = datos.meses

  return (
    <Card>
      <Tabla
        etiqueta={`Gastos de ${datos.anio} por concepto y mes`}
        columnas={[
          { clave: 'concepto', titulo: 'Concepto', ancho: 190 },
          { clave: 'spark', titulo: '', ancho: 78 },
          ...meses.map((m) => ({
            clave: `m${m.numero}`,
            titulo: MESES_CORTOS[m.numero - 1],
            num: true,
          })),
          { clave: 'total', titulo: 'Total', num: true, separa: true },
          { clave: 'media', titulo: 'Media', num: true },
          ...(anterior
            ? [
                { clave: 'ant', titulo: String(anterior.anio), num: true, separa: true },
                { clave: 'delta', titulo: 'Δ', num: true },
              ]
            : []),
        ]}
      >
        {datos.filas.map((fila, indice) => (
          <FilaAnualTabla
            key={`${fila.tipo}-${fila.conceptoId ?? fila.nombre}-${indice}`}
            fila={fila}
            datos={datos}
            anterior={totalAnterior(fila)}
            hayAnterior={!!anterior}
            onAbrirMes={onAbrirMes}
            desplegable={fila.tipo === 'otros'}
            abierto={otrosAbierto}
            onAlternar={() => setOtrosAbierto((a) => !a)}
          />
        ))}

        {otrosAbierto
          ? desgloseOtros.map((fila, indice) => (
              <FilaAnualTabla
                key={`otros-${fila.conceptoId ?? indice}`}
                fila={fila}
                datos={datos}
                anterior={totalAnterior(fila)}
                hayAnterior={!!anterior}
                onAbrirMes={onAbrirMes}
                sangrada
              />
            ))
          : null}
      </Tabla>
    </Card>
  )
}

/** Una fila de la matriz: concepto, sparkline, doce meses y los totales. */
function FilaAnualTabla({
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
  const concepto = fila.conceptoId ? { id: fila.conceptoId, nombre: fila.nombre } : null
  const paleta = paletaDe(concepto)
  const hoy = new Date()
  const mesActual = hoy.getFullYear() === datos.anio ? hoy.getMonth() + 1 : 0

  return (
    <FilaTabla total={fila.tipo === 'total'}>
      <Celda>
        <span className="fila-campos" style={{ gap: 8, flexWrap: 'nowrap' }}>
          {sangrada ? <span style={{ width: 14 }} /> : null}
          {concepto ? (
            <IconoConcepto
              icono={iconoDe(concepto)}
              color={paleta.color}
              suave={paleta.suave}
              size={13}
            />
          ) : null}
          {desplegable ? (
            <button className="btn-text" onClick={onAlternar} aria-expanded={abierto}>
              <Icono nombre={abierto ? 'abajo' : 'chevron'} size={14} />
              {fila.nombre}
            </button>
          ) : (
            <span className="row-titulo">{fila.nombre}</span>
          )}
        </span>
      </Celda>

      <Celda>
        {/* La sparkline resume la fila: se ve la forma sin leer doce cifras. */}
        <Sparkline
          valores={fila.valores.map((v) => v ?? 0)}
          color={paleta.color}
          titulo={`Evolución de ${fila.nombre} durante ${datos.anio}`}
        />
      </Celda>

      {datos.meses.map((mes, indice) => {
        const valor = fila.valores[indice]
        return (
          <Celda key={mes.numero} num apagado={valor === null} destacada={mes.numero === mesActual}>
            {valor === null ? (
              /* Un mes sin datos no es un cero: se deja en blanco. */
              '—'
            ) : (
              <button className="celda-enlace" onClick={() => onAbrirMes(datos.anio, mes.numero)}>
                {numero(valor)}
              </button>
            )}
          </Celda>
        )
      })}

      <Celda num separa>
        {numero(fila.total)}
      </Celda>
      <Celda num apagado>
        {numero(fila.media)}
      </Celda>

      {hayAnterior ? (
        <>
          <Celda num separa apagado>
            {anterior === null ? '' : numero(anterior)}
          </Celda>
          <Celda num>
            {variacion === null ? (
              ''
            ) : (
              <span style={{ color: variacion > 10 ? 'var(--comida)' : variacion < -10 ? 'var(--ok)' : undefined }}>
                {variacion > 0 ? '+' : ''}
                {porcentaje(variacion, 0)}
              </span>
            )}
          </Celda>
        </>
      ) : null}
    </FilaTabla>
  )
}
