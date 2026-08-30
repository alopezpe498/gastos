import { useEffect, useRef, useState } from 'react'
import { euros, leerImporte, NOMBRES_MESES, redondo } from '../../lib/formato'
import { iconoDe, paletaDe } from '../../lib/conceptos'
import { Icono } from './Icono'
import { IconoConcepto } from './Basicos'

/**
 * Campos que se editan escribiendo encima y guardan solos.
 *
 * El contrato de toda la aplicación: no hay botones de guardar. Un campo se
 * guarda al salir de él o al pulsar Intro, y Escape deshace y devuelve lo que
 * había. En reposo es texto; al pulsarlo, campo.
 */

// ---------------------------------------------------------------------------
// InlineField: importe
// ---------------------------------------------------------------------------

type PropsImporte = {
  valor: number | null
  onGuardar: (valor: number | null) => void | Promise<void>
  /** Un campo que admite quedarse vacío devuelve null (el saldo del banco). */
  admiteVacio?: boolean
  etiqueta: string
  disabled?: boolean
  /** Con `visible` se dibuja como campo siempre: es un formulario, no una lista. */
  visible?: boolean
  estrecho?: boolean
  apagado?: boolean
}

export function CampoImporte({
  valor,
  onGuardar,
  admiteVacio = false,
  etiqueta,
  disabled = false,
  visible = false,
  estrecho = false,
  apagado = false,
}: PropsImporte) {
  const [enFoco, setEnFoco] = useState(false)
  const [borrador, setBorrador] = useState('')
  const campo = useRef<HTMLInputElement>(null)

  /*
   * En reposo se ve el importe entero, con su símbolo: es dinero, no un número
   * suelto. Al entrar se cambia por el número pelado, que es lo que se puede
   * escribir sin pelearse con el formato.
   */
  useEffect(() => {
    if (!enFoco) setBorrador(valor === null ? '' : euros(valor))
  }, [valor, enFoco])

  const confirmar = async () => {
    setEnFoco(false)
    const leido = leerImporte(borrador)
    if (leido === null) {
      if (admiteVacio && borrador.trim() === '') {
        if (valor !== null) await onGuardar(null)
        return
      }
      // Lo que no se entiende no se guarda: se devuelve lo que había.
      setBorrador(valor === null ? '' : euros(valor))
      return
    }
    if (leido !== valor) await onGuardar(leido)
  }

  return (
    <input
      ref={campo}
      className={`campo dinero${visible ? ' visible' : ''}${estrecho ? ' estrecho' : ''}`}
      style={apagado ? { color: 'var(--tinta-3)' } : undefined}
      aria-label={etiqueta}
      inputMode="decimal"
      disabled={disabled}
      placeholder={admiteVacio ? '—' : '0,00'}
      value={borrador}
      onFocus={() => {
        setEnFoco(true)
        setBorrador(valor === null ? '' : String(valor).replace('.', ','))
      }}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={() => void confirmar()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setBorrador(valor === null ? '' : euros(valor))
          setEnFoco(false)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// InlineField: texto
// ---------------------------------------------------------------------------

export function CampoTexto({
  valor,
  onGuardar,
  etiqueta,
  placeholder,
  maxLength = 120,
  visible = false,
  disabled = false,
  autoFoco = false,
}: {
  valor: string
  onGuardar: (valor: string) => void | Promise<void>
  etiqueta: string
  placeholder?: string
  maxLength?: number
  visible?: boolean
  disabled?: boolean
  autoFoco?: boolean
}) {
  const [enFoco, setEnFoco] = useState(false)
  const [borrador, setBorrador] = useState(valor)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!enFoco) setBorrador(valor)
  }, [valor, enFoco])

  useEffect(() => {
    if (autoFoco) campo.current?.select()
  }, [autoFoco])

  return (
    <input
      ref={campo}
      className={`campo${visible ? ' visible' : ''}`}
      aria-label={etiqueta}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      value={borrador}
      onFocus={() => setEnFoco(true)}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={() => {
        setEnFoco(false)
        if (borrador !== valor) void onGuardar(borrador.trim())
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setBorrador(valor)
          setEnFoco(false)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

export function CampoArea({
  valor,
  onGuardar,
  etiqueta,
  placeholder,
  filas = 6,
}: {
  valor: string
  onGuardar: (valor: string) => void | Promise<void>
  etiqueta: string
  placeholder?: string
  filas?: number
}) {
  const [borrador, setBorrador] = useState(valor)
  useEffect(() => setBorrador(valor), [valor])
  return (
    <textarea
      className="campo visible"
      aria-label={etiqueta}
      placeholder={placeholder}
      rows={filas}
      value={borrador}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={() => borrador !== valor && void onGuardar(borrador)}
    />
  )
}

// ---------------------------------------------------------------------------
// InlineField: un valor que se convierte en campo al pulsarlo
// ---------------------------------------------------------------------------

/**
 * El valor se lee como texto y se edita al pulsarlo.
 *
 * Es la variante para los sitios donde el número forma parte de una frase —la
 * nómina dentro del hero, el sobre dentro de su tile— y dibujar una caja sería
 * meter un formulario en medio de algo que se está leyendo.
 */
export function ValorEditable({
  valor,
  onGuardar,
  etiqueta,
  prefijo,
  vacio,
}: {
  valor: number | null
  onGuardar: (valor: number | null) => void | Promise<void>
  etiqueta: string
  /** Lo que va delante del número: «Nómina», «Sobre de». */
  prefijo?: string
  /** Qué poner cuando no hay valor: «0 €» no dice nada. */
  vacio?: string
}) {
  const [editando, setEditando] = useState(false)

  if (editando) {
    return (
      <span className="fila-campos" style={{ gap: 6 }}>
        {prefijo ? <span>{prefijo}</span> : null}
        <span style={{ width: 110 }}>
          <CampoImporte
            valor={valor}
            admiteVacio
            etiqueta={etiqueta}
            onGuardar={async (nuevo) => {
              setEditando(false)
              await onGuardar(nuevo)
            }}
          />
        </span>
      </span>
    )
  }

  return (
    <button className={`inline-valor${!valor && vacio ? ' vacio' : ''}`} onClick={() => setEditando(true)}>
      {!valor && vacio ? (
        vacio
      ) : (
        <>
          {prefijo ? `${prefijo} ` : ''}
          <b className="tabular">{redondo(valor)}</b>
        </>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// SearchSelect: el selector de concepto
// ---------------------------------------------------------------------------

type ConceptoSimple = {
  id: number
  nombre: string
  tipo?: string
  color?: string | null
  icono?: string | null
}

export function SelectorConcepto({
  conceptos,
  valor,
  onElegir,
  etiqueta,
  placeholder = 'Elegir…',
  frecuentes = [],
}: {
  conceptos: ConceptoSimple[]
  valor: number | null
  onElegir: (id: number) => void
  etiqueta: string
  placeholder?: string
  /** Los que más se usan en este mes, arriba del todo. */
  frecuentes?: number[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [busca, setBusca] = useState('')
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const elegido = conceptos.find((c) => c.id === valor) ?? null

  const filtrados = conceptos
    .filter((c) => c.nombre.toLowerCase().includes(busca.trim().toLowerCase()))
    // Los frecuentes primero: en la revisión de un extracto son casi siempre
    // los mismos cinco, y bajarlos hasta la ele es hacerte buscar cada vez.
    .sort((a, b) => {
      const ia = frecuentes.indexOf(a.id)
      const ib = frecuentes.indexOf(b.id)
      if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      return 0
    })

  return (
    <div className="buscador" ref={caja}>
      {abierto ? (
        <input
          className="campo visible"
          autoFocus
          aria-label={etiqueta}
          placeholder="Buscar…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAbierto(false)
            if (e.key === 'Enter' && filtrados[0]) {
              onElegir(filtrados[0].id)
              setAbierto(false)
              setBusca('')
            }
          }}
        />
      ) : (
        <button
          className="campo visible"
          style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}
          aria-label={etiqueta}
          aria-expanded={false}
          onClick={() => {
            setAbierto(true)
            setBusca('')
          }}
        >
          {elegido ? (
            <>
              <IconoConcepto
                icono={iconoDe(elegido)}
                color={paletaDe(elegido).color}
                suave={paletaDe(elegido).suave}
                size={14}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{elegido.nombre}</span>
            </>
          ) : (
            <span style={{ color: 'var(--tinta-3)' }}>{placeholder}</span>
          )}
          <span style={{ marginLeft: 'auto', color: 'var(--tinta-3)' }}>
            <Icono nombre="abajo" size={14} />
          </span>
        </button>
      )}

      {abierto ? (
        <div className="buscador-lista" role="listbox">
          {filtrados.length === 0 ? (
            <p className="buscador-vacio">Ningún concepto se llama así.</p>
          ) : (
            filtrados.map((c) => (
              <button
                key={c.id}
                role="option"
                aria-selected={c.id === valor}
                className={c.id === valor ? 'destacada' : undefined}
                onClick={() => {
                  onElegir(c.id)
                  setAbierto(false)
                  setBusca('')
                }}
              >
                <IconoConcepto
                  icono={iconoDe(c)}
                  color={paletaDe(c).color}
                  suave={paletaDe(c).suave}
                  size={14}
                />
                {c.nombre}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Selector de mes
// ---------------------------------------------------------------------------

/** Un desplegable de mes y año, para «vigente desde» y el mes de una importación. */
export function SelectorMes({
  valor,
  onCambiar,
  etiqueta,
}: {
  valor: string
  onCambiar: (clave: string) => void
  etiqueta: string
}) {
  const [anio, mes] = valor.split('-')
  const actual = new Date().getFullYear()
  const anios: number[] = []
  for (let a = actual - 4; a <= actual + 2; a += 1) anios.push(a)
  if (!anios.includes(Number(anio))) anios.push(Number(anio))
  anios.sort((a, b) => a - b)

  return (
    <span className="fila-campos" style={{ gap: 6 }}>
      <select
        className="campo visible"
        style={{ width: 'auto' }}
        aria-label={`${etiqueta}: mes`}
        value={mes}
        onChange={(e) => onCambiar(`${anio}-${e.target.value}`)}
      >
        {NOMBRES_MESES.map((nombre, i) => (
          <option key={nombre} value={String(i + 1).padStart(2, '0')}>
            {nombre}
          </option>
        ))}
      </select>
      <select
        className="campo visible"
        style={{ width: 'auto' }}
        aria-label={`${etiqueta}: año`}
        value={anio}
        onChange={(e) => onCambiar(`${e.target.value}-${mes}`)}
      >
        {anios.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </span>
  )
}
