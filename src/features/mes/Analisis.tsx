import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { Analisis as DatosAnalisis, Concepto, ContextoMes } from '../../lib/tipos'
import { euros, redondo } from '../../lib/formato'
import { iconoDe, paletaDe } from '../../lib/conceptos'
import { IconoConcepto } from '../../components/ui/Basicos'
import { Fila, Importe } from '../../components/ui/Fila'
import { SegmentBar } from '../../components/ui/Graficos'
import { Icono } from '../../components/ui/Icono'

/**
 * El análisis del mes, aquí dentro y plegado.
 *
 * Antes era una pantalla entera del menú, y eso mentía sobre su importancia: el
 * análisis se mira de vez en cuando, no cada día. Vive donde están los números
 * que explica, y no pide nada hasta que se abre.
 */
export function Analisis({ mesId, conceptos }: { mesId: number; conceptos: Concepto[] }) {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState<DatosAnalisis | null>(null)
  const [contexto, setContexto] = useState<ContextoMes | null>(null)

  useEffect(() => {
    if (!abierto) return
    setDatos(null)
    setContexto(null)
    api<DatosAnalisis>(`/meses/${mesId}/analisis`).then(setDatos).catch(() => undefined)
    api<ContextoMes>(`/analitica/contexto/${mesId}`).then(setContexto).catch(() => undefined)
  }, [abierto, mesId])

  return (
    <div className="card plegable">
      <button
        className="plegable-cabecera"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
      >
        <span className="card-titulo">Ver análisis</span>
        <span className="muted">
          {abierto ? 'Cerrar' : 'En qué se ha ido, y cómo va comparado con otros meses'}
          <Icono nombre={abierto ? 'abajo' : 'chevron'} size={15} />
        </span>
      </button>

      {!abierto ? null : !datos ? (
        <div className="cargando">Un momento…</div>
      ) : (
        <div className="analisis">
          <Reparto datos={datos} conceptos={conceptos} />
          <Regla datos={datos} />
          <Ranking datos={datos} conceptos={conceptos} contexto={contexto} />
        </div>
      )}
    </div>
  )
}

/** La tarta, plana: cada trozo con el color de su concepto. */
function Reparto({ datos, conceptos }: { datos: DatosAnalisis; conceptos: Concepto[] }) {
  const trozos = datos.reparto.filter((t) => t.importe > 0)
  const total = trozos.reduce((s, t) => s + t.importe, 0)
  if (total <= 0) return null

  const radio = 60
  const perimetro = 2 * Math.PI * radio
  let acumulado = 0

  const colorDe = (clave: string, nombre: string) => {
    if (clave === 'comida') return 'var(--comida)'
    const concepto = conceptos.find((c) => c.nombre === nombre)
    return concepto ? paletaDe(concepto).color : 'var(--tinta-3)'
  }

  return (
    <section>
      <h3 className="analisis-titulo">En qué se ha ido</h3>
      <div className="analisis-tarta">
        <svg viewBox="0 0 160 160" width="150" height="150" role="img">
          <title>Reparto del mes</title>
          {trozos.map((t) => {
            const parte = t.importe / total
            const trazo = `${parte * perimetro} ${perimetro}`
            const giro = (acumulado / total) * 360 - 90
            acumulado += t.importe
            return (
              <circle
                key={t.clave}
                cx="80"
                cy="80"
                r={radio}
                fill="none"
                stroke={colorDe(t.clave, t.nombre)}
                strokeWidth="26"
                strokeDasharray={trazo}
                transform={`rotate(${giro} 80 80)`}
              />
            )
          })}
        </svg>
        <div className="analisis-leyenda">
          {trozos.map((t) => (
            <span key={t.clave}>
              <i style={{ background: colorDe(t.clave, t.nombre) }} />
              {t.nombre}
              <b className="tabular">{redondo(t.importe)}</b>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

/** La regla 50/30/20: tres barras con la marca del ideal. */
function Regla({ datos }: { datos: DatosAnalisis }) {
  const COLORES: Record<string, string> = {
    Necesario: 'var(--azul)',
    Prescindible: 'var(--ambar)',
    Ahorro: 'var(--ok)',
  }
  return (
    <section>
      <h3 className="analisis-titulo">Tu regla</h3>
      {datos.regla.map((b) => (
        <div key={b.nombre} className="regla-linea">
          <div className="regla-cabecera">
            <span>{b.nombre}</span>
            <span className="muted tabular">
              {redondo(b.importe)} · {b.porcentaje === null ? '—' : `${Math.round(b.porcentaje)} %`}
            </span>
          </div>
          <div className="regla-barra">
            <SegmentBar
              segmentos={[
                {
                  nombre: b.nombre,
                  valor: Math.max(0, b.porcentaje ?? 0),
                  color: COLORES[b.nombre] ?? 'var(--tinta-2)',
                },
                { nombre: 'resto', valor: Math.max(0, 100 - (b.porcentaje ?? 0)), color: 'var(--linea)' },
              ]}
            />
            {/* La marca del ideal cruza la barra; no la recorta. */}
            <span className="regla-ideal" style={{ left: `${Math.min(100, b.ideal)}%` }} />
          </div>
          <p className="muted-3">Tu ideal es {b.ideal} %</p>
        </div>
      ))}
    </section>
  )
}

function Ranking({
  datos,
  conceptos,
  contexto,
}: {
  datos: DatosAnalisis
  conceptos: Concepto[]
  contexto: ContextoMes | null
}) {
  const puestos = new Map((contexto?.posiciones ?? []).map((p) => [p.conceptoId, p]))
  return (
    <section className="analisis-ancho">
      <h3 className="analisis-titulo">Lo que más pesa</h3>
      {datos.ranking.slice(0, 8).map((l) => {
        const concepto = conceptos.find((c) => c.id === l.conceptoId) ?? null
        const paleta = paletaDe(concepto)
        const puesto = puestos.get(l.conceptoId)
        return (
          <Fila
            key={l.conceptoId}
            izquierda={
              <IconoConcepto
                icono={concepto ? iconoDe(concepto) : 'etiqueta'}
                color={paleta.color}
                suave={paleta.suave}
              />
            }
            titulo={l.concepto}
            detalle={
              (l.cuantos === 1 ? '1 apunte' : `${l.cuantos} apuntes`) +
              (puesto && puesto.puesto <= 3
                ? ` · tu ${puesto.puesto}.º mes más caro de ${puesto.deCuantos}`
                : '')
            }
            importe={<Importe>{euros(l.importe)}</Importe>}
          />
        )
      })}
    </section>
  )
}
