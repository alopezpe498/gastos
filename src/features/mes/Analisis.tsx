import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { Analisis as DatosAnalisis, Concepto, ContextoMes } from '../../lib/tipos'
import { euros, redondo } from '../../lib/formato'
import { paletaDe, paletaDeId } from '../../lib/colores'

/**
 * El análisis del mes, aquí dentro y plegado.
 *
 * Antes era una pantalla entera del menú, y eso mentía sobre su importancia:
 * el análisis se mira de vez en cuando, no cada día. Vive donde están los
 * números que explica, y se abre solo cuando se quiere.
 */

export function Analisis({ mesId, conceptos }: { mesId: number; conceptos: Concepto[] }) {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState<DatosAnalisis | null>(null)
  const [contexto, setContexto] = useState<ContextoMes | null>(null)

  // No se pide nada hasta que se abre: es la mitad de la gracia de plegarlo.
  useEffect(() => {
    if (!abierto) return
    setDatos(null)
    setContexto(null)
    api<DatosAnalisis>(`/meses/${mesId}/analisis`).then(setDatos).catch(() => undefined)
    api<ContextoMes>(`/analitica/contexto/${mesId}`).then(setContexto).catch(() => undefined)
  }, [abierto, mesId])

  return (
    <div className="bloque plegable">
      <button
        className="plegable-cabecera"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
      >
        <span className="titulo-bloque">Análisis del mes</span>
        <span className="t12">
          {abierto ? 'Cerrar' : 'En qué se ha ido, y cómo va comparado con otros meses'}
          <span className="plegable-flecha">{abierto ? '−' : '+'}</span>
        </span>
      </button>

      {!abierto ? null : !datos ? (
        <div className="cargando">Un momento…</div>
      ) : (
        <div className="analisis">
          <Reparto datos={datos} />
          <Regla datos={datos} />
          <Ranking datos={datos} conceptos={conceptos} contexto={contexto} />
          <Comparacion contexto={contexto} />
        </div>
      )}
    </div>
  )
}

/** En qué se ha ido: barras, no tarta. Una barra se compara de un vistazo. */
function Reparto({ datos }: { datos: DatosAnalisis }) {
  const trozos = datos.reparto.filter((t) => t.importe > 0)
  const total = trozos.reduce((s, t) => s + t.importe, 0) || 1

  return (
    <section>
      <h3 className="titulo-seccion">En qué se ha ido</h3>
      {trozos.map((t, i) => (
        <div className="barra-fila" key={t.clave}>
          <span className="barra-nombre">{t.nombre}</span>
          <span className="barra-canal">
            <span
              style={{
                width: `${(t.importe / total) * 100}%`,
                background: paletaDeId(i, t.clave === 'comida').color,
              }}
            />
          </span>
          <span className="importe">{redondo(t.importe)}</span>
          <span className="t12 barra-pct">{Math.round((t.importe / total) * 100)} %</span>
        </div>
      ))}
    </section>
  )
}

/** La regla 50/30/20 de la casa, con los ideales que haya puestos en Ajustes. */
function Regla({ datos }: { datos: DatosAnalisis }) {
  return (
    <section>
      <h3 className="titulo-seccion">Tu regla</h3>
      {datos.regla.map((b) => (
        <div className="barra-fila" key={b.nombre}>
          <span className="barra-nombre">{b.nombre}</span>
          <span className="barra-canal">
            <span
              style={{
                width: `${Math.min(100, b.porcentaje ?? 0)}%`,
                background: b.cumple === false ? 'var(--coral)' : 'var(--lima-tinta)',
              }}
            />
            <span className="barra-ideal" style={{ left: `${Math.min(100, b.ideal)}%` }} />
          </span>
          <span className="importe">{redondo(b.importe)}</span>
          <span className="t12 barra-pct">
            {b.porcentaje === null ? '—' : `${Math.round(b.porcentaje)} %`}
          </span>
        </div>
      ))}
      <p className="t12">La marca de cada barra es tu ideal: {datos.regla.map((b) => `${b.nombre.toLowerCase()} ${b.ideal} %`).join(', ')}.</p>
    </section>
  )
}

/** Los conceptos que más pesan, con su puesto histórico si se sabe. */
function Ranking({
  datos,
  conceptos,
  contexto,
}: {
  datos: DatosAnalisis
  conceptos: Concepto[]
  contexto: ContextoMes | null
}) {
  const lista = datos.ranking.slice(0, 8)
  const puestos = new Map((contexto?.posiciones ?? []).map((p) => [p.conceptoId, p]))

  return (
    <section>
      <h3 className="titulo-seccion">Lo que más pesa</h3>
      {lista.map((l) => {
        const concepto = conceptos.find((c) => c.id === l.conceptoId) ?? null
        const paleta = paletaDe(concepto)
        const puesto = puestos.get(l.conceptoId)
        return (
          <div className="fila" key={l.conceptoId}>
            <span className="punto" style={{ background: paleta.color }} />
            <span className="fila-texto">
              {l.concepto}
              {puesto && puesto.puesto <= 3 ? (
                <span className="fila-tarde">
                  {' '}
                  tu {puesto.puesto}.º mes más caro de {puesto.deCuantos}
                </span>
              ) : null}
            </span>
            <span className="t12">{l.cuantos === 1 ? '1 apunte' : `${l.cuantos} apuntes`}</span>
            <span className="importe">{euros(l.importe)}</span>
          </div>
        )
      })}
    </section>
  )
}

/** Contra el año pasado y contra los últimos doce meses. Sin datos, no se inventa. */
function Comparacion({ contexto }: { contexto: ContextoMes | null }) {
  if (!contexto) return null
  const { anioAnterior, mediaDoceMeses } = contexto
  if (!anioAnterior && !mediaDoceMeses) return null

  const frase = (variacion: number | null, que: string) => {
    if (variacion === null) return `Sin datos suficientes para comparar con ${que}`
    const signo = variacion > 0 ? 'más' : 'menos'
    return `Has gastado un ${Math.abs(Math.round(variacion))} % ${signo} que ${que}`
  }

  return (
    <section>
      <h3 className="titulo-seccion">Comparado</h3>
      {anioAnterior ? (
        <p className="comparacion">
          {frase(anioAnterior.variacionGastos, 'el año pasado por estas fechas')} ·{' '}
          {redondo(anioAnterior.gastos)}
        </p>
      ) : null}
      {mediaDoceMeses ? (
        <p className="comparacion">
          {frase(mediaDoceMeses.variacionGastos, 'tu media de los últimos doce meses')} ·{' '}
          {mediaDoceMeses.gastos === null ? '—' : redondo(mediaDoceMeses.gastos)}
        </p>
      ) : null}
    </section>
  )
}
