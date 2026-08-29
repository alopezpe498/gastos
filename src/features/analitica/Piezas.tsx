import type { ReactNode } from 'react'
import { IconoAbajo, IconoArriba } from '../../components/Iconos'
import { porcentaje } from '../../lib/formato'

/** Piezas pequeñas que comparten todas las vistas de la analítica. */

export type Tarjeta = {
  etiqueta: string
  valor: string
  nota?: string
  extra?: ReactNode
  aviso?: string | null
} | null

export function Tarjetas({ tarjetas }: { tarjetas: Tarjeta[] }) {
  const utiles = tarjetas.filter((t): t is NonNullable<Tarjeta> => t !== null)
  if (utiles.length === 0) return null

  return (
    <div className="tarjetas-dato">
      {utiles.map((tarjeta) => (
        <div className="tarjeta-dato" key={tarjeta.etiqueta}>
          <span className="resumen-etiqueta">{tarjeta.etiqueta}</span>
          <span className="dinero-titular tarjeta-dato-cifra">{tarjeta.valor}</span>
          {tarjeta.extra}
          {tarjeta.nota ? <span className="resumen-nota">{tarjeta.nota}</span> : null}
          {tarjeta.aviso ? <span className="resumen-nota aviso">{tarjeta.aviso}</span> : null}
        </div>
      ))}
    </div>
  )
}

/**
 * Una variación en porcentaje, con su flecha.
 *
 * El color no depende del signo sino de si es buena noticia: gastar un 10 %
 * más es malo, ingresar un 10 % más es bueno. De ahí `subirEsBueno`.
 */
export function Variacion({
  valor,
  subirEsBueno = false,
  sufijo = '',
}: {
  valor: number | null
  subirEsBueno?: boolean
  sufijo?: string
}) {
  if (valor === null) return <span className="variacion neutra">—</span>

  const sube = valor > 0
  const bien = sube === subirEsBueno
  // Un cambio de menos del 1 % no es una tendencia, es ruido.
  const relevante = Math.abs(valor) >= 1

  return (
    <span className={`variacion${relevante ? (bien ? ' bien' : ' mal') : ' neutra'}`}>
      {relevante ? (
        sube ? (
          <IconoArriba size={13} />
        ) : (
          <IconoAbajo size={13} />
        )
      ) : null}
      {sube ? '+' : ''}
      {porcentaje(valor, Math.abs(valor) < 10 ? 1 : 0)}
      {sufijo}
    </span>
  )
}

/** Barra horizontal de una lista ordenada por importe. */
export function BarraFila({
  nombre,
  nota,
  importe,
  proporcion,
  porcentajeTexto,
  color = 'serie-1',
}: {
  nombre: string
  nota?: string
  importe: string
  proporcion: number
  porcentajeTexto?: string
  color?: string
}) {
  return (
    <div className="barra-fila">
      <span className="barra-nombre">
        {nombre}
        {nota ? <span className="barra-nota"> {nota}</span> : null}
      </span>
      <span className="barra-canal">
        <span
          className={`barra-relleno ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, proporcion * 100))}%` }}
        />
      </span>
      <span className="dinero barra-importe">{importe}</span>
      {porcentajeTexto ? <span className="barra-porcentaje">{porcentajeTexto}</span> : null}
    </div>
  )
}
