import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEsEscritorio } from '../lib/tamano'

type Props = {
  abierta: boolean
  titulo: string
  onCerrar: () => void
  /** Accion de la derecha; por defecto "Listo". */
  accionDerecha?: ReactNode
  /** Accion de la izquierda; por defecto nada. */
  accionIzquierda?: ReactNode
  children: ReactNode
}

/**
 * Sheet modal que sube desde abajo, como en iOS. Se cierra con el boton, con el
 * velo, con Escape o deslizando el agarre hacia abajo.
 */
export function Sheet({
  abierta,
  titulo,
  onCerrar,
  accionDerecha,
  accionIzquierda,
  children,
}: Props) {
  // En escritorio la misma sheet se presenta como modal centrado.
  const escritorio = useEsEscritorio()
  const [arrastre, setArrastre] = useState(0)
  const inicioY = useRef<number | null>(null)

  useEffect(() => {
    if (!abierta) return
    const alPulsarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alPulsarTecla)
    // Se bloquea el desplazamiento del fondo mientras la sheet esta abierta.
    const desbordeAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alPulsarTecla)
      document.body.style.overflow = desbordeAnterior
    }
  }, [abierta, onCerrar])

  useEffect(() => {
    if (!abierta) setArrastre(0)
  }, [abierta])

  if (!abierta) return null

  const empezarArrastre = (y: number) => {
    inicioY.current = y
  }
  const moverArrastre = (y: number) => {
    if (inicioY.current === null) return
    setArrastre(Math.max(0, y - inicioY.current))
  }
  const soltarArrastre = () => {
    if (arrastre > 90) onCerrar()
    inicioY.current = null
    setArrastre(0)
  }

  return (
    <>
      <div className="velo" onClick={onCerrar} aria-hidden="true" />
      <div
        className={`sheet${escritorio ? ' sheet-modal' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        style={
          arrastre && !escritorio
            ? { transform: `translateY(${arrastre}px)`, animation: 'none' }
            : undefined
        }
      >
        {/* El agarre para deslizar solo tiene sentido en tactil. */}
        {escritorio ? null : (
          <div
            className="sheet-agarre"
            onTouchStart={(e) => empezarArrastre(e.touches[0].clientY)}
            onTouchMove={(e) => moverArrastre(e.touches[0].clientY)}
            onTouchEnd={soltarArrastre}
          >
            <span />
          </div>
        )}
        <div className="sheet-cabecera">
          <div className="sheet-accion izquierda">{accionIzquierda}</div>
          <h2 className="titulo">{titulo}</h2>
          <div className="sheet-accion derecha">
            {accionDerecha ?? (
              <button className="boton-texto" onClick={onCerrar}>
                Listo
              </button>
            )}
          </div>
        </div>
        <div className="sheet-cuerpo">{children}</div>
      </div>
    </>
  )
}
