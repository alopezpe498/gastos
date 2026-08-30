import { useEffect, useRef, useState } from 'react'
import { NOMBRES_MESES, MESES_CORTOS, hoyIso } from '../lib/formato'
import { IconoAbajo } from './Iconos'

/**
 * Moverse por los meses.
 *
 * El nombre del mes es un botón: lo abres y tienes los doce delante, más las
 * flechas del año. Antes había que ir mes a mes con las flechitas, que para
 * saltar de agosto a enero eran siete clics.
 *
 * Las flechas ‹ › siguen estando —pasar al mes de al lado es lo que más se
 * hace— pero con área de toque de 32 px, que es lo que pide un pulgar.
 *
 * «Ir a hoy» solo aparece cuando no estás en el mes de hoy: un enlace que no
 * hace falta no debería ocupar sitio.
 */

type Props = {
  anio: number
  mes: number
  onIr: (anio: number, mes: number) => void
  /** Cómo de grande sale el nombre. El bloque principal de Mes lo quiere mayor. */
  tamano?: 'normal' | 'grande'
}

export function SelectorDeMes({ anio, mes, onIr, tamano = 'normal' }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [anioVisto, setAnioVisto] = useState(anio)
  const caja = useRef<HTMLDivElement>(null)

  const hoy = hoyIso()
  const anioDeHoy = Number(hoy.slice(0, 4))
  const mesDeHoy = Number(hoy.slice(5, 7))
  const enHoy = anio === anioDeHoy && mes === mesDeHoy

  // Al abrirlo se empieza por el año que se está viendo, no por el último que
  // se hojeó la vez anterior.
  useEffect(() => {
    if (abierto) setAnioVisto(anio)
  }, [abierto, anio])

  // Se cierra al pulsar fuera o con Escape, como cualquier desplegable.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  const saltar = (delta: number) => {
    const n = anio * 12 + (mes - 1) + delta
    onIr(Math.floor(n / 12), (n % 12) + 1)
  }

  return (
    <div className={`selector-de-mes${tamano === 'grande' ? ' grande' : ''}`} ref={caja}>
      <button className="flecha-mes" onClick={() => saltar(-1)} aria-label="Mes anterior">
        ‹
      </button>

      <button
        className="nombre-mes"
        aria-expanded={abierto}
        aria-haspopup="dialog"
        onClick={() => setAbierto((a) => !a)}
      >
        {NOMBRES_MESES[mes - 1]}
        {tamano === 'grande' ? '' : ` ${anio}`}
        <IconoAbajo size={16} />
      </button>

      <button className="flecha-mes" onClick={() => saltar(1)} aria-label="Mes siguiente">
        ›
      </button>

      {!enHoy ? (
        <button className="boton-texto ir-a-hoy" onClick={() => onIr(anioDeHoy, mesDeHoy)}>
          Ir a hoy
        </button>
      ) : null}

      {abierto ? (
        <div className="calendario" role="dialog" aria-label="Elegir mes">
          <div className="calendario-anio">
            <button
              className="flecha-mes"
              onClick={() => setAnioVisto((a) => a - 1)}
              aria-label="Año anterior"
            >
              ‹
            </button>
            <strong>{anioVisto}</strong>
            <button
              className="flecha-mes"
              onClick={() => setAnioVisto((a) => a + 1)}
              aria-label="Año siguiente"
            >
              ›
            </button>
          </div>

          <div className="calendario-meses">
            {MESES_CORTOS.map((nombre, i) => {
              const elegido = anioVisto === anio && i + 1 === mes
              const esHoy = anioVisto === anioDeHoy && i + 1 === mesDeHoy
              return (
                <button
                  key={nombre}
                  className={`calendario-mes${elegido ? ' elegido' : ''}${esHoy ? ' hoy' : ''}`}
                  aria-current={elegido ? 'true' : undefined}
                  onClick={() => {
                    setAbierto(false)
                    onIr(anioVisto, i + 1)
                  }}
                >
                  {nombre}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** El mismo desplegable pero solo con años, para la pantalla Año. */
export function SelectorDeAnio({
  anio,
  anios,
  onIr,
}: {
  anio: number
  anios: number[]
  onIr: (anio: number) => void
}) {
  const hay = new Set(anios)
  const anterior = anio - 1
  const siguiente = anio + 1

  return (
    <div className="selector-de-mes">
      <button
        className="flecha-mes"
        disabled={!hay.has(anterior)}
        onClick={() => onIr(anterior)}
        aria-label="Año anterior"
      >
        ‹
      </button>

      <span className="anios">
        {anios.map((a) => (
          <button
            key={a}
            className={`calendario-mes${a === anio ? ' elegido' : ''}`}
            aria-current={a === anio ? 'true' : undefined}
            onClick={() => onIr(a)}
          >
            {a}
          </button>
        ))}
      </span>

      <button
        className="flecha-mes"
        disabled={!hay.has(siguiente)}
        onClick={() => onIr(siguiente)}
        aria-label="Año siguiente"
      >
        ›
      </button>
    </div>
  )
}
