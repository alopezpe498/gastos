import { useEffect, useRef, useState } from 'react'
import { fecha as formatearFecha, fechaCorta } from '../lib/formato'
import { IconoCalendario } from './Iconos'

/**
 * Campo de fecha en castellano.
 *
 * El <input type="date"> nativo escribe la fecha en el idioma y el formato del
 * navegador: en un Chrome en ingles sale "08/28/2026" en una aplicacion que
 * promete dd/mm/aaaa. Aqui se escribe a mano, en dd/mm/aaaa, y el calendario
 * nativo queda detras de un boton para quien lo prefiera (sobre todo en movil).
 *
 * Al teclear se admite lo que de verdad escribe una persona apuntando gastos:
 *
 *   "14"          -> el dia 14 del mes en el que se esta trabajando
 *   "14/8"        -> el 14 de agosto de ese mismo año
 *   "14/8/26"     -> 2026
 *   "14-8-2026"   -> tambien, con guiones
 *
 * El valor entra y sale en ISO (AAAA-MM-DD), que es lo que habla la API.
 */

type Props = {
  valor: string
  onGuardar: (iso: string) => void | Promise<void>
  /** Mes de referencia ('AAAA-MM') para completar lo que no se escriba. */
  mesReferencia: string
  ariaLabel: string
  className?: string
  /**
   * En una lista de un solo mes, repetir el año en sesenta filas es ruido: en
   * reposo se ensena "25 ago" y al entrar a editar, la fecha entera.
   */
  compacto?: boolean
}

/** Interpreta lo escrito. Devuelve null si no hay una fecha real detras. */
export function leerFecha(texto: string, mesReferencia: string): string | null {
  const limpio = texto.trim()
  if (!limpio) return null

  const partes = limpio.split(/[/\-.\s]+/).filter(Boolean)
  if (partes.length === 0 || partes.length > 3) return null
  if (partes.some((p) => !/^\d{1,4}$/.test(p))) return null

  const [anioRef, mesRef] = mesReferencia.split('-').map(Number)

  const dia = Number(partes[0])
  const mes = partes.length >= 2 ? Number(partes[1]) : mesRef
  let anio = partes.length === 3 ? Number(partes[2]) : anioRef
  // "26" es 2026, no el año 26.
  if (anio < 100) anio += 2000

  if (mes < 1 || mes > 12) return null
  const ultimoDia = new Date(anio, mes, 0).getDate()
  if (dia < 1 || dia > ultimoDia) return null

  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function CampoFecha({
  valor,
  onGuardar,
  mesReferencia,
  ariaLabel,
  className = '',
  compacto = false,
}: Props) {
  const [enFoco, setEnFoco] = useState(false)
  const [borrador, setBorrador] = useState('')
  const campo = useRef<HTMLInputElement>(null)
  const nativo = useRef<HTMLInputElement>(null)

  const enReposo = compacto ? fechaCorta(valor) : formatearFecha(valor)

  useEffect(() => {
    if (!enFoco) setBorrador(formatearFecha(valor))
  }, [valor, enFoco])

  const confirmar = () => {
    setEnFoco(false)
    const leida = leerFecha(borrador, mesReferencia)
    if (leida === null) {
      // Lo que no se entiende no se guarda: se devuelve lo que habia.
      setBorrador(formatearFecha(valor))
      return
    }
    if (leida !== valor) void onGuardar(leida)
  }

  return (
    <span className={`campo-fecha ${className}`}>
      <input
        ref={campo}
        className="campo-linea texto"
        aria-label={ariaLabel}
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        value={enFoco ? borrador : enReposo}
        onFocus={() => {
          setEnFoco(true)
          setBorrador(formatearFecha(valor))
          requestAnimationFrame(() => campo.current?.select())
        }}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            campo.current?.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setBorrador(formatearFecha(valor))
            setEnFoco(false)
            campo.current?.blur()
          }
        }}
      />

      {/* El calendario del sistema, detras de un boton. El input nativo esta
          ahi solo para abrirlo: nunca se ve, asi que su idioma da igual. */}
      <button
        type="button"
        className="campo-fecha-boton"
        aria-label={`${ariaLabel}: abrir el calendario`}
        onClick={() => {
          const elemento = nativo.current
          if (!elemento) return
          // showPicker existe en Chrome y Safari recientes; donde no, el foco
          // sobre el input nativo ya despliega el calendario.
          if (typeof elemento.showPicker === 'function') elemento.showPicker()
          else elemento.focus()
        }}
      >
        <IconoCalendario size={16} />
      </button>

      <input
        ref={nativo}
        type="date"
        className="campo-fecha-nativo"
        tabIndex={-1}
        aria-hidden="true"
        value={valor}
        onChange={(e) => {
          if (e.target.value) void onGuardar(e.target.value)
        }}
      />
    </span>
  )
}
