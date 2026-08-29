import { useEffect, useMemo, useRef, useState } from 'react'
import type { Concepto } from '../lib/tipos'

/**
 * Desplegable de conceptos con busqueda.
 *
 * Con cincuenta conceptos, un <select> nativo obliga a recorrer la lista entera
 * con la vista. Aqui se escribe y la lista se filtra: "jus" ya deja JustEat
 * arriba. Se maneja entero con el teclado, que es como se apuntan diez gastos
 * seguidos sin soltar las manos.
 *
 * La busqueda ignora acentos y mayusculas: "prestamo" encuentra "Préstamo".
 */

const sinAcentos = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()

type Props = {
  conceptos: Concepto[]
  valor: number | null
  onElegir: (conceptoId: number) => void
  placeholder?: string
  ariaLabel: string
  autoFocus?: boolean
  /** Se llama al pulsar Intro con un concepto ya elegido: apunta y sigue. */
  onConfirmar?: () => void
  /**
   * Ids que van primero cuando no se ha escrito nada: los más usados en los
   * últimos meses y los que ya se han usado en este mismo extracto. Con
   * cincuenta conceptos, el orden alfabético obliga a leerlos todos.
   */
  frecuentes?: number[]
}

export function SelectorConcepto({
  conceptos,
  valor,
  onElegir,
  placeholder = 'Concepto',
  ariaLabel,
  autoFocus = false,
  onConfirmar,
  frecuentes = [],
}: Props) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const contenedor = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)

  const elegido = conceptos.find((c) => c.id === valor) ?? null

  const filtrados = useMemo(() => {
    const busqueda = sinAcentos(texto.trim())
    if (!busqueda) {
      if (frecuentes.length === 0) return conceptos
      /*
       * Sin nada escrito, los frecuentes arriba en su orden, y detras el resto
       * como venga. Al escribir manda lo que se escribe, no la frecuencia.
       */
      const porId = new Map(conceptos.map((c) => [c.id, c]))
      const arriba = frecuentes.map((id) => porId.get(id)).filter(Boolean) as Concepto[]
      const yaEstan = new Set(arriba.map((c) => c.id))
      return [...arriba, ...conceptos.filter((c) => !yaEstan.has(c.id))]
    }
    // Los que empiezan por lo escrito van primero: es lo que se busca al
    // teclear dos letras.
    const empiezan: Concepto[] = []
    const contienen: Concepto[] = []
    for (const concepto of conceptos) {
      const nombre = sinAcentos(concepto.nombre)
      if (nombre.startsWith(busqueda)) empiezan.push(concepto)
      else if (nombre.includes(busqueda)) contienen.push(concepto)
    }
    return [...empiezan, ...contienen]
  }, [conceptos, texto, frecuentes])

  useEffect(() => setResaltado(0), [texto])

  // Se cierra al pulsar fuera.
  useEffect(() => {
    if (!abierto) return
    const alPulsar = (evento: MouseEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', alPulsar)
    return () => document.removeEventListener('mousedown', alPulsar)
  }, [abierto])

  const elegir = (concepto: Concepto) => {
    onElegir(concepto.id)
    setTexto('')
    setAbierto(false)
  }

  return (
    <div className="selector-concepto" ref={contenedor}>
      <input
        ref={campo}
        className="campo"
        role="combobox"
        aria-expanded={abierto}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        placeholder={placeholder}
        // Con el desplegable cerrado se ve el concepto elegido; al abrirlo, lo
        // que se esta escribiendo.
        value={abierto ? texto : (elegido?.nombre ?? '')}
        onFocus={() => {
          setAbierto(true)
          setTexto('')
        }}
        onChange={(e) => {
          setTexto(e.target.value)
          setAbierto(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setAbierto(true)
            setResaltado((n) => Math.min(n + 1, filtrados.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setResaltado((n) => Math.max(n - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (abierto && filtrados[resaltado]) elegir(filtrados[resaltado])
            else if (elegido) onConfirmar?.()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setAbierto(false)
            setTexto('')
          }
        }}
      />

      {abierto ? (
        <ul className="selector-lista" role="listbox" aria-label={ariaLabel}>
          {filtrados.length === 0 ? (
            <li className="selector-vacio">
              No hay ningún concepto que se llame así. Créalo en Conceptos.
            </li>
          ) : (
            filtrados.map((concepto, indice) => (
              <li key={concepto.id}>
                <button
                  role="option"
                  aria-selected={indice === resaltado}
                  className={
                    'selector-opcion' +
                    (indice === resaltado ? ' resaltada' : '') +
                    (concepto.id === valor ? ' elegida' : '')
                  }
                  // onMouseDown y no onClick: el click llega despues del blur
                  // del campo, y para entonces la lista ya se ha cerrado.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    elegir(concepto)
                  }}
                  onMouseEnter={() => setResaltado(indice)}
                >
                  {concepto.nombre}
                  {concepto.tipo === 'sobre' ? <span className="selector-marca">sobre</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
