import { useEffect, type ReactNode } from 'react'
import { IconoCerrar } from './Iconos'

export const Cargando = ({ texto }: { texto?: string }) => (
  <div className="cargando">
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="girador" />
      {texto ? <span className="cargando-texto">{texto}</span> : null}
    </div>
  </div>
)

/**
 * Un error debe decir que ha pasado y ofrecer la salida. Si quien lo usa pasa
 * onReintentar, el aviso trae su boton; si no, se queda en el mensaje.
 */
export const ErrorLinea = ({
  mensaje,
  onReintentar,
}: {
  mensaje: string
  onReintentar?: () => void
}) => (
  <div className="error-linea" role="alert">
    <span>{mensaje}</span>
    {onReintentar ? (
      <button className="error-reintentar" onClick={onReintentar}>
        Reintentar
      </button>
    ) : null}
  </div>
)

type EstadoVacioProps = {
  icono: string
  titulo: string
  texto: string
  accion?: ReactNode
}

/** Un estado vacio debe invitar a empezar, no dar la sensacion de error. */
export const EstadoVacio = ({ icono, titulo, texto, accion }: EstadoVacioProps) => (
  <div className="vacio">
    <div className="vacio-icono" aria-hidden="true">
      {icono}
    </div>
    <p className="vacio-titulo">{titulo}</p>
    <p className="vacio-texto">{texto}</p>
    {accion ? <div style={{ marginTop: 12 }}>{accion}</div> : null}
  </div>
)

type ConfirmarProps = {
  abierto: boolean
  titulo: string
  mensaje: string
  textoConfirmar?: string
  peligroso?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

/** Dialogo de confirmacion centrado, estilo alerta de iOS. */
export function Confirmar({
  abierto,
  titulo,
  mensaje,
  // Sin texto propio se cae en 'Aceptar', que no dice nada: quien use este
  // dialogo deberia pasar el verbo de lo que va a pasar.
  textoConfirmar = 'Aceptar',
  peligroso = false,
  onConfirmar,
  onCancelar,
}: ConfirmarProps) {
  useEffect(() => {
    if (!abierto) return
    const alPulsarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCancelar()
    }
    document.addEventListener('keydown', alPulsarTecla)
    return () => document.removeEventListener('keydown', alPulsarTecla)
  }, [abierto, onCancelar])

  if (!abierto) return null
  return (
    <>
      <div className="velo" onClick={onCancelar} aria-hidden="true" />
      <div className="alerta" role="alertdialog" aria-modal="true" aria-label={titulo}>
        <div className="alerta-texto">
          <p className="alerta-titulo">{titulo}</p>
          <p className="alerta-mensaje">{mensaje}</p>
        </div>
        <div className="alerta-botones">
          <button className="alerta-boton" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            className={`alerta-boton principal${peligroso ? ' peligro' : ''}`}
            onClick={onConfirmar}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </>
  )
}

type PreguntaOpcion = { id: string; texto: string; peligroso?: boolean }

type PreguntarProps = {
  abierto: boolean
  titulo: string
  mensaje: string
  opciones: PreguntaOpcion[]
  onElegir: (id: string) => void
  onCancelar: () => void
}

/** Variante con varias opciones (por ejemplo combinar o reemplazar). */
export function Preguntar({
  abierto,
  titulo,
  mensaje,
  opciones,
  onElegir,
  onCancelar,
}: PreguntarProps) {
  if (!abierto) return null
  return (
    <>
      <div className="velo" onClick={onCancelar} aria-hidden="true" />
      <div className="alerta" role="alertdialog" aria-modal="true" aria-label={titulo}>
        <div className="alerta-texto">
          <p className="alerta-titulo">{titulo}</p>
          <p className="alerta-mensaje">{mensaje}</p>
        </div>
        <div className="alerta-botones vertical">
          {opciones.map((opcion) => (
            <button
              key={opcion.id}
              className={`alerta-boton principal${opcion.peligroso ? ' peligro' : ''}`}
              onClick={() => onElegir(opcion.id)}
            >
              {opcion.texto}
            </button>
          ))}
          <button className="alerta-boton" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      </div>
    </>
  )
}

/** Cabecera de pantalla, con titulo grande y acciones opcionales. */
export const Cabecera = ({
  titulo,
  subtitulo,
  acciones,
  debajo,
  anchaEnEscritorio = false,
}: {
  titulo: string
  subtitulo?: string
  acciones?: ReactNode
  debajo?: ReactNode
  /** La parrilla usa un ancho mayor que el resto de pantallas. */
  anchaEnEscritorio?: boolean
}) => (
  <header className="cabecera">
    <div className={`limite${anchaEnEscritorio ? ' limite-ancho' : ''}`}>
      <div className="cabecera-fila">
        <div style={{ minWidth: 0 }}>
          <h1 className="titulo-grande">{titulo}</h1>
          {subtitulo ? <p className="subtitulo">{subtitulo}</p> : null}
        </div>
        {acciones ? <div className="cabecera-acciones">{acciones}</div> : null}
      </div>
      {debajo}
    </div>
  </header>
)

export const BotonCerrarSheet = ({ onClick }: { onClick: () => void }) => (
  <button className="icono-boton" onClick={onClick} aria-label="Cerrar">
    <IconoCerrar size={20} />
  </button>
)
