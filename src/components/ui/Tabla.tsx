import type { ReactNode } from 'react'

/**
 * La tabla de datos: la matriz del año y las tablas de Ajustes.
 *
 * Cabecera de 12 en gris, filas separadas por `--linea`, cifras tabulares a la
 * derecha y **sin bandas alternas**: las bandas ayudan cuando no puedes fijar
 * la primera columna, y aquí sí puedes. La primera columna se queda quieta al
 * desplazar de lado, que es lo que hace legible una tabla de trece columnas.
 */

export type Columna = {
  clave: string
  titulo: ReactNode
  /** Las cifras van a la derecha y con ancho fijo por dígito. */
  num?: boolean
  /** Una línea más fuerte a la izquierda, para separar totales de meses. */
  separa?: boolean
  ancho?: number
}

export function Tabla({
  columnas,
  children,
  etiqueta,
}: {
  columnas: Columna[]
  children: ReactNode
  etiqueta: string
}) {
  return (
    <div className="tabla-marco">
      <table className="tabla">
        <caption className="solo-lectores">{etiqueta}</caption>
        <thead>
          <tr>
            {columnas.map((c) => (
              <th
                key={c.clave}
                scope="col"
                className={`${c.num ? 'num' : ''}${c.separa ? ' separa' : ''}`.trim() || undefined}
                style={c.ancho ? { width: c.ancho } : undefined}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Fila({
  children,
  destacada = false,
  total = false,
  arrastrando = false,
  encima = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  draggable,
}: {
  children: ReactNode
  destacada?: boolean
  total?: boolean
  arrastrando?: boolean
  encima?: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}) {
  const clases = [
    destacada ? 'destacada' : '',
    total ? 'total' : '',
    arrastrando ? 'arrastrando' : '',
    encima ? 'encima' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <tr
      className={clases || undefined}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
    </tr>
  )
}

export function Celda({
  children,
  num = false,
  separa = false,
  apagado = false,
  destacada = false,
  colSpan,
}: {
  children?: ReactNode
  num?: boolean
  separa?: boolean
  apagado?: boolean
  destacada?: boolean
  colSpan?: number
}) {
  const clases = [num ? 'num' : '', separa ? 'separa' : '', apagado ? 'apagado' : '', destacada ? 'mes-actual' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <td className={clases || undefined} colSpan={colSpan}>
      {children}
    </td>
  )
}
