import { useRef, useState, type ReactNode } from 'react'
import { Icono } from './Icono'
import { BotonPrimario, BotonTexto } from './Basicos'

/**
 * El área de carga de archivos.
 *
 * Borde discontinuo y grande, porque es lo que hay que hacer en esa pantalla:
 * traer el archivo del banco. Se enciende al pasar un archivo por encima; sin
 * eso se arrastra a ciegas y nadie lo intenta dos veces.
 */
export function Dropzone({
  titulo,
  texto,
  textoBoton,
  accept,
  cargando = false,
  disabled = false,
  onArchivo,
  extra,
}: {
  titulo: string
  texto: string
  textoBoton: string
  accept: string
  cargando?: boolean
  disabled?: boolean
  onArchivo: (fichero: File) => void
  /** Un segundo botón, como «Pegar una tabla». */
  extra?: ReactNode
}) {
  const [encima, setEncima] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  return (
    <div
      className={`dropzone${encima ? ' encima' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault()
        setEncima(false)
        const fichero = e.dataTransfer.files?.[0]
        if (fichero && !disabled) onArchivo(fichero)
      }}
    >
      <span className="ico" style={{ background: 'var(--superficie)', color: 'var(--tinta-2)' }}>
        <Icono nombre="subir" size={16} />
      </span>
      <p className="dropzone-titulo">{titulo}</p>
      <p className="muted">{texto}</p>

      <div className="dropzone-botones">
        <BotonPrimario disabled={disabled || cargando} onClick={() => entrada.current?.click()}>
          <Icono nombre="documento" size={15} />
          {cargando ? 'Leyendo…' : textoBoton}
        </BotonPrimario>
        {extra}
      </div>

      <input
        ref={entrada}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const fichero = e.target.files?.[0]
          e.target.value = ''
          if (fichero) onArchivo(fichero)
        }}
      />
    </div>
  )
}

/** El mismo aspecto pero como etiqueta de un input, sin botón propio. */
export function DropzoneSimple({
  titulo,
  texto,
  accept,
  onArchivo,
}: {
  titulo: string
  texto: string
  accept: string
  onArchivo: (fichero: File) => void
}) {
  return (
    <label className="dropzone">
      <span className="ico" style={{ background: 'var(--superficie)', color: 'var(--tinta-2)' }}>
        <Icono nombre="subir" size={16} />
      </span>
      <span className="dropzone-titulo">{titulo}</span>
      <span className="muted">{texto}</span>
      <input
        type="file"
        accept={accept}
        className="solo-lectores"
        onChange={(e) => {
          const fichero = e.target.files?.[0]
          e.target.value = ''
          if (fichero) onArchivo(fichero)
        }}
      />
    </label>
  )
}

export { BotonTexto }
