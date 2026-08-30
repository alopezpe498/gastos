import { useEffect, useRef, useState } from 'react'
import { escribirImporte, euros, leerImporte, NOMBRES_MESES } from '../lib/formato'

/**
 * Campos que se editan escribiendo encima y guardan solos.
 *
 * El contrato de toda la aplicacion: no hay botones de guardar. Un campo se
 * guarda al salir de el o al pulsar Intro, y Escape deshace y devuelve el valor
 * que habia. Mientras no tiene el foco, ensena el valor ya formateado
 * ("1.234,56 €"); al entrar, el numero pelado, que es lo que se puede editar.
 */

type PropsImporte = {
  valor: number | null
  onGuardar: (valor: number | null) => void | Promise<void>
  /** Un campo que admite quedarse vacio devuelve null (el dinero en cuenta). */
  admiteVacio?: boolean
  className?: string
  ariaLabel: string
  disabled?: boolean
  placeholder?: string
  /** Para los campos que aparecen al pulsar un valor: el cursor ya va dentro. */
  autoFoco?: boolean
}

export function CampoImporte({
  valor,
  onGuardar,
  admiteVacio = false,
  className = '',
  ariaLabel,
  disabled = false,
  placeholder = '0,00',
  autoFoco = false,
}: PropsImporte) {
  const [enFoco, setEnFoco] = useState(false)
  const [borrador, setBorrador] = useState('')
  const [guardado, setGuardado] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  // El campo ha salido porque se ha pulsado el valor: sería absurdo pedir un
  // segundo clic para poder escribir.
  useEffect(() => {
    if (autoFoco) campo.current?.select()
  }, [autoFoco])

  // Si el valor cambia desde fuera (otro dispositivo, recarga) y no se esta
  // editando, el campo lo recoge; si se esta editando, no se pisa lo escrito.
  useEffect(() => {
    if (!enFoco) setBorrador(escribirImporte(valor))
  }, [valor, enFoco])

  const confirmar = async () => {
    setEnFoco(false)
    const leido = leerImporte(borrador)

    if (leido === null) {
      if (admiteVacio && borrador.trim() === '') {
        if (valor !== null) {
          await onGuardar(null)
          avisarGuardado()
        }
        return
      }
      // Lo que no se entiende no se guarda: se devuelve lo que habia.
      setBorrador(escribirImporte(valor))
      return
    }

    if (leido === valor) return
    await onGuardar(leido)
    avisarGuardado()
  }

  const avisarGuardado = () => {
    setGuardado(true)
    setTimeout(() => setGuardado(false), 260)
  }

  return (
    <input
      ref={campo}
      className={`campo-linea dinero${guardado ? ' guardando' : ''} ${className}`}
      inputMode="decimal"
      aria-label={ariaLabel}
      disabled={disabled}
      placeholder={placeholder}
      value={enFoco ? borrador : valor === null ? '' : euros(valor)}
      onFocus={() => {
        setEnFoco(true)
        setBorrador(escribirImporte(valor))
        // Seleccionar todo al entrar: casi siempre se viene a reemplazar, no a
        // corregir un digito.
        requestAnimationFrame(() => campo.current?.select())
      }}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={() => void confirmar()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          campo.current?.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setBorrador(escribirImporte(valor))
          setEnFoco(false)
          campo.current?.blur()
        }
      }}
    />
  )
}

type PropsTexto = {
  valor: string
  onGuardar: (valor: string) => void | Promise<void>
  className?: string
  ariaLabel: string
  placeholder?: string
  maxLength?: number
}

/** La misma idea para el texto: descripciones, dias previstos, notas cortas. */
export function CampoTextoLinea({
  valor,
  onGuardar,
  className = '',
  ariaLabel,
  placeholder,
  maxLength = 200,
}: PropsTexto) {
  const [borrador, setBorrador] = useState(valor)
  const [enFoco, setEnFoco] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!enFoco) setBorrador(valor)
  }, [valor, enFoco])

  return (
    <input
      ref={campo}
      className={`campo-linea texto ${className}`}
      aria-label={ariaLabel}
      placeholder={placeholder}
      maxLength={maxLength}
      value={borrador}
      onFocus={() => setEnFoco(true)}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={() => {
        setEnFoco(false)
        if (borrador !== valor) void onGuardar(borrador)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          campo.current?.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setBorrador(valor)
          setEnFoco(false)
          campo.current?.blur()
        }
      }}
    />
  )
}

/** Interruptor de iOS. Es un boton, no una casilla: se pulsa, no se marca. */
export function Interruptor({
  activo,
  onCambiar,
  ariaLabel,
}: {
  activo: boolean
  onCambiar: (valor: boolean) => void
  ariaLabel: string
}) {
  return (
    <button
      className={`interruptor${activo ? ' activo' : ''}`}
      role="switch"
      aria-checked={activo}
      aria-label={ariaLabel}
      onClick={() => onCambiar(!activo)}
    >
      <span />
    </button>
  )
}

/**
 * Selector de mes en castellano.
 *
 * El <input type="month"> nativo escribe los meses en el idioma del navegador,
 * no en el de la aplicacion: en un Chrome en ingles aparecia "September 2026"
 * en medio de una pantalla en castellano. Dos desplegables propios cuestan
 * cuatro lineas y siempre dicen "Septiembre".
 *
 * El valor entra y sale en formato 'AAAA-MM', igual que el nativo.
 */
export function SelectorMes({
  valor,
  onCambiar,
  aniosAtras = 4,
  aniosAdelante = 2,
  ariaLabel = 'Mes',
}: {
  valor: string
  onCambiar: (valor: string) => void
  aniosAtras?: number
  aniosAdelante?: number
  ariaLabel?: string
}) {
  const [anio, mes] = valor.split('-')
  const actual = new Date().getFullYear()
  const anios: number[] = []
  for (let a = actual - aniosAtras; a <= actual + aniosAdelante; a += 1) anios.push(a)
  // Un año fuera del rango (una plantilla antigua) tiene que seguir eligiendose.
  if (!anios.includes(Number(anio))) anios.push(Number(anio))
  anios.sort((a, b) => a - b)

  return (
    <div className="selector-mes">
      <select
        aria-label={`${ariaLabel}: mes`}
        value={mes}
        onChange={(e) => onCambiar(`${anio}-${e.target.value}`)}
      >
        {NOMBRES_MESES.map((nombre, indice) => (
          <option key={nombre} value={String(indice + 1).padStart(2, '0')}>
            {nombre}
          </option>
        ))}
      </select>
      <select
        aria-label={`${ariaLabel}: año`}
        value={anio}
        onChange={(e) => onCambiar(`${e.target.value}-${mes}`)}
      >
        {anios.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  )
}
