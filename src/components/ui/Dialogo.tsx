import { useEffect, type ReactNode } from 'react'
import { Icono, type NombreIcono } from './Icono'
import { BotonIcono, BotonPrimario, BotonTexto } from './Basicos'

/**
 * La hoja de acciones: centrada en escritorio, desde abajo en el móvil.
 *
 * La confirmación NO abre otra ventana encima: sustituye la lista dentro de
 * este mismo diálogo. Apilar una ventana sobre la ventana que acabas de abrir
 * para decir una frase es pedirle al usuario que recuerde dónde estaba.
 */

export function Dialogo({
  titulo,
  onCerrar,
  accionIzquierda,
  accionDerecha,
  children,
}: {
  titulo: string
  onCerrar: () => void
  accionIzquierda?: ReactNode
  /** Sustituye a la equis: «Listo», «Guardar». */
  accionDerecha?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', tecla)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = antes
    }
  }, [onCerrar])

  return (
    <>
      <div className="velo" onClick={onCerrar} aria-hidden="true" />
      <div className="dialogo" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="dialogo-cabecera">
          {accionIzquierda}
          <span className="dialogo-titulo">{titulo}</span>
          {accionDerecha ?? <BotonIcono icono="cerrar" etiqueta="Cerrar" onClick={onCerrar} />}
        </div>
        <div className="dialogo-cuerpo">{children}</div>
      </div>
    </>
  )
}

/** Una acción de la lista: qué hace arriba, qué pasa si lo haces debajo. */
export function AccionDialogo({
  icono,
  titulo,
  detalle,
  peligro = false,
  disabled = false,
  onClick,
}: {
  icono: NombreIcono
  titulo: string
  detalle: string
  peligro?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button className={`accion${peligro ? ' peligro' : ''}`} disabled={disabled} onClick={onClick}>
      <span className="ico" style={{ background: peligro ? 'var(--comida-suave)' : 'var(--fondo)' }}>
        <Icono nombre={icono} size={16} />
      </span>
      <span className="accion-cuerpo">
        <span className="accion-titulo">{titulo}</span>
        <span className="accion-detalle">{detalle}</span>
      </span>
    </button>
  )
}

/**
 * La confirmación, en el sitio de la lista.
 *
 * Dice qué se pierde con números concretos: «se borran los 14 apuntes» pesa
 * más que «¿estás seguro?», que es una pregunta que nadie lee.
 */
export function ConfirmacionDialogo({
  frase,
  detalle,
  textoConfirmar,
  trabajando = false,
  onConfirmar,
  onCancelar,
}: {
  frase: string
  detalle?: string
  textoConfirmar: string
  trabajando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}) {
  return (
    <div className="confirmacion">
      <p className="confirmacion-frase">{frase}</p>
      {detalle ? <p className="muted">{detalle}</p> : null}
      <div className="confirmacion-botones">
        <BotonPrimario peligro disabled={trabajando} onClick={onConfirmar}>
          {trabajando ? 'Un momento…' : textoConfirmar}
        </BotonPrimario>
        <BotonTexto disabled={trabajando} onClick={onCancelar}>
          Cancelar
        </BotonTexto>
      </div>
    </div>
  )
}
