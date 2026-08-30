import type { ReactNode } from 'react'
import { Icono } from './Icono'

/**
 * La fila de lista, con sus cinco variantes.
 *
 * Siempre la misma forma: algo a la izquierda que identifica (icono de
 * concepto, check, asa), un cuerpo con título y subtítulo, y el importe en
 * negrita a la derecha con cifras tabulares. Lo que cambia entre variantes es
 * qué va en la izquierda, no la estructura.
 */

export function Fila({
  izquierda,
  titulo,
  detalle,
  detalleTarde = false,
  importe,
  acciones,
  centro,
  onAbrir,
  confirmando = false,
  arrastrando = false,
  encima = false,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  izquierda?: ReactNode
  titulo: ReactNode
  detalle?: ReactNode
  /** Un fijo pendiente cuyo día ya pasó: el único aviso de la lista. */
  detalleTarde?: boolean
  importe?: ReactNode
  acciones?: ReactNode
  /** Lo que va entre el cuerpo y el importe: un chip, un selector. */
  centro?: ReactNode
  onAbrir?: () => void
  confirmando?: boolean
  arrastrando?: boolean
  encima?: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}) {
  const clases = [
    'row',
    confirmando ? 'confirmando' : '',
    arrastrando ? 'arrastrando' : '',
    encima ? 'encima' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const cuerpo = (
    <>
      <div className="row-titulo">{titulo}</div>
      {detalle ? <div className={`d${detalleTarde ? ' tarde' : ''}`}>{detalle}</div> : null}
    </>
  )

  return (
    <div
      className={clases}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {izquierda}
      {onAbrir ? (
        <button className="row-cuerpo" onClick={onAbrir}>
          {cuerpo}
        </button>
      ) : (
        <div className="row-cuerpo">{cuerpo}</div>
      )}
      {centro}
      {importe}
      {acciones}
    </div>
  )
}

/** El importe de una fila. `apagado` para lo que aún no se ha pagado. */
export function Importe({
  children,
  apagado = false,
  abono = false,
}: {
  children: ReactNode
  apagado?: boolean
  abono?: boolean
}) {
  return (
    <span className={`amt${apagado ? ' apagado' : ''}${abono ? ' abono' : ''}`}>{children}</span>
  )
}

/** El separador de días dentro de una lista: «Hoy», «Ayer», «25 de agosto». */
export function GrupoFilas({ children }: { children: ReactNode }) {
  return <div className="row-grupo">{children}</div>
}

/** El asa de arrastrar, gris hasta que pasas por la fila. */
export function Asa() {
  return (
    <span className="asa" aria-hidden="true">
      <Icono nombre="arrastrar" size={16} />
    </span>
  )
}
