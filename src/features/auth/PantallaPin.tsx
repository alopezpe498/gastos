import { useCallback, useEffect, useState } from 'react'
import { api, guardarToken, mensajeDeError } from '../../lib/api'
import { Icono } from '../../components/ui/Icono'

const LONGITUD_MAXIMA = 8

type Props = {
  onDesbloqueado: () => void
}

/** Pantalla de desbloqueo con teclado numerico, como la de iOS. */
export function PantallaPin({ onDesbloqueado }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = useCallback(
    async (valor: string) => {
      setEnviando(true)
      setError('')
      try {
        const { token } = await api<{ token: string }>('/auth', {
          metodo: 'POST',
          cuerpo: { pin: valor },
          sinAuth: true,
        })
        guardarToken(token)
        onDesbloqueado()
      } catch (causa) {
        setError(mensajeDeError(causa))
        setPin('')
        if (navigator.vibrate) navigator.vibrate([40, 60, 40])
      } finally {
        setEnviando(false)
      }
    },
    [onDesbloqueado],
  )

  const pulsar = (tecla: string) => {
    if (enviando) return
    setError('')
    if (tecla === 'borrar') {
      setPin((actual) => actual.slice(0, -1))
      return
    }
    setPin((actual) => (actual.length >= LONGITUD_MAXIMA ? actual : actual + tecla))
  }

  // Tambien se puede teclear con un teclado fisico.
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (/^\d$/.test(evento.key)) pulsar(evento.key)
      else if (evento.key === 'Backspace') pulsar('borrar')
      else if (evento.key === 'Enter' && pin.length >= 4) void enviar(pin)
    }
    document.addEventListener('keydown', alPulsar)
    return () => document.removeEventListener('keydown', alPulsar)
  })

  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'borrar']

  return (
    <div className="pin-pantalla">
      <div className="pin-cabecera">
        <div className="pin-icono">
          <Icono nombre="candado" size={30} />
        </div>
        <h1 className="pin-titulo">
          gastos<span>.</span>
        </h1>
        <p className="pin-texto">{error || 'Introduce el PIN de la familia'}</p>
      </div>

      <div className="pin-puntos" aria-label={`${pin.length} digitos introducidos`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={`pin-punto${i < pin.length ? ' lleno' : ''}`} />
        ))}
      </div>

      <div className="pin-teclado">
        {teclas.map((tecla, indice) =>
          tecla === '' ? (
            <span key={`hueco-${indice}`} />
          ) : (
            <button
              key={tecla}
              className="pin-tecla"
              onClick={() => pulsar(tecla)}
              disabled={enviando}
              aria-label={tecla === 'borrar' ? 'Borrar' : tecla}
            >
              {tecla === 'borrar' ? <Icono nombre="cerrar" /> : tecla}
            </button>
          ),
        )}
      </div>

      <div className="pin-pie">
        <button
          className="btn-primary"
          onClick={() => void enviar(pin)}
          disabled={pin.length < 4 || enviando}
        >
          {enviando ? 'Comprobando...' : 'Desbloquear'}
        </button>
      </div>
    </div>
  )
}
