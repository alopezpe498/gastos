import { useRef, useState } from 'react'
import type { Concepto } from '../../lib/tipos'
import { SelectorConcepto } from '../../components/SelectorConcepto'
import { hoyIso, leerImporte } from '../../lib/formato'
import { CampoFecha } from '../../components/CampoFecha'
import { IconoMas } from '../../components/Iconos'

type Props = {
  conceptos: Concepto[]
  onApuntar: (datos: {
    conceptoId: number
    importe: number
    fechaCobro: string
    descripcion: string
  }) => Promise<void>
  /** Fecha propuesta: el ultimo dia del mes que se esta viendo, o hoy. */
  fechaPorDefecto: string
}

/**
 * Alta de un gasto variable en una sola linea.
 *
 * Esta es la accion que mas se repite en todo el mes, asi que esta pensada para
 * hacerse seguida y sin raton: concepto, importe, Intro. Tras apuntar, el foco
 * vuelve al concepto y la fecha se mantiene, porque lo normal es meter cuatro
 * tickets del mismo dia uno detras de otro.
 */
export function AltaRapida({ conceptos, onApuntar, fechaPorDefecto }: Props) {
  const [conceptoId, setConceptoId] = useState<number | null>(null)
  const [importe, setImporte] = useState('')
  const [fecha, setFecha] = useState(fechaPorDefecto || hoyIso())
  const [descripcion, setDescripcion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const campoImporte = useRef<HTMLInputElement>(null)
  const contenedor = useRef<HTMLFormElement>(null)

  const apuntar = async () => {
    if (!conceptoId) {
      setError('Elige un concepto.')
      return
    }
    const leido = leerImporte(importe)
    if (leido === null) {
      setError('Escribe un importe.')
      return
    }

    setError('')
    setEnviando(true)
    try {
      await onApuntar({ conceptoId, importe: leido, fechaCobro: fecha, descripcion })
      // El concepto se mantiene: lo mas comun es repetir (tres cafes, dos
      // Amazon). Lo que se limpia es el importe y la descripcion.
      setImporte('')
      setDescripcion('')
      contenedor.current?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form
      ref={contenedor}
      className="alta-rapida"
      onSubmit={(e) => {
        e.preventDefault()
        void apuntar()
      }}
    >
      <div className="alta-campos">
        <SelectorConcepto
          conceptos={conceptos}
          valor={conceptoId}
          onElegir={(id) => {
            setConceptoId(id)
            setError('')
            // Elegido el concepto, lo siguiente es el importe: se lleva el foco
            // solo para no tener que tabular.
            requestAnimationFrame(() => campoImporte.current?.focus())
          }}
          ariaLabel="Concepto del gasto"
          placeholder="Concepto"
        />

        <input
          ref={campoImporte}
          className="campo dinero alta-importe"
          inputMode="decimal"
          aria-label="Importe"
          placeholder="0,00"
          value={importe}
          onChange={(e) => {
            setImporte(e.target.value)
            setError('')
          }}
        />

        <CampoFecha
          valor={fecha}
          mesReferencia={fechaPorDefecto.slice(0, 7)}
          onGuardar={setFecha}
          ariaLabel="Fecha"
          className="alta-fecha"
        />

        <input
          className="campo alta-descripcion"
          aria-label="Descripción (opcional)"
          placeholder="Descripción (opcional)"
          maxLength={200}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />

        <button
          className="boton boton-principal alta-boton"
          type="submit"
          disabled={enviando}
          aria-label="Apuntar el gasto"
        >
          <IconoMas size={18} />
          Apuntar
        </button>
      </div>

      {error ? (
        <p className="pista aviso" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
