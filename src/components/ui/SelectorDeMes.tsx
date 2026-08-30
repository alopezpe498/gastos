import { useEffect, useRef, useState } from 'react'
import { MESES_CORTOS, NOMBRES_MESES, hoyIso } from '../../lib/formato'
import { Icono } from './Icono'
import { BotonTexto } from './Basicos'

/**
 * Moverse por los meses desde el nombre del mes.
 *
 * El nombre es un botón: lo abres y tienes los doce delante con su año. Antes
 * había que ir de uno en uno con las flechitas, que para saltar de agosto a
 * enero eran siete clics. Las flechas siguen porque pasar al mes de al lado es
 * lo que más se hace, y «Ir a hoy» solo aparece cuando no estás en el de hoy:
 * un enlace que no hace falta no debería ocupar sitio.
 */
export function SelectorDeMes({
  anio,
  mes,
  onIr,
}: {
  anio: number
  mes: number
  onIr: (anio: number, mes: number) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [anioVisto, setAnioVisto] = useState(anio)
  const caja = useRef<HTMLSpanElement>(null)

  const hoy = hoyIso()
  const anioDeHoy = Number(hoy.slice(0, 4))
  const mesDeHoy = Number(hoy.slice(5, 7))
  const enHoy = anio === anioDeHoy && mes === mesDeHoy

  useEffect(() => {
    if (abierto) setAnioVisto(anio)
  }, [abierto, anio])

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
    <span className="selector-mes" ref={caja}>
      <button className="flecha" onClick={() => saltar(-1)} aria-label="Mes anterior">
        ‹
      </button>
      <button
        className="nombre-mes"
        aria-expanded={abierto}
        aria-haspopup="dialog"
        onClick={() => setAbierto((a) => !a)}
      >
        {NOMBRES_MESES[mes - 1]}
        <Icono nombre="abajo" size={14} />
      </button>
      <button className="flecha" onClick={() => saltar(1)} aria-label="Mes siguiente">
        ›
      </button>

      {!enHoy ? <BotonTexto onClick={() => onIr(anioDeHoy, mesDeHoy)}>Ir a hoy</BotonTexto> : null}

      {abierto ? (
        <span className="calendario" role="dialog" aria-label="Elegir mes">
          <span className="calendario-anio">
            <button className="flecha" onClick={() => setAnioVisto((a) => a - 1)} aria-label="Año anterior">
              ‹
            </button>
            <b>{anioVisto}</b>
            <button className="flecha" onClick={() => setAnioVisto((a) => a + 1)} aria-label="Año siguiente">
              ›
            </button>
          </span>
          <span className="calendario-meses">
            {MESES_CORTOS.map((nombre, i) => {
              const elegido = anioVisto === anio && i + 1 === mes
              const esHoy = anioVisto === anioDeHoy && i + 1 === mesDeHoy
              return (
                <button
                  key={nombre}
                  className={`calendario-mes${elegido ? ' on' : ''}${esHoy ? ' hoy' : ''}`}
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
          </span>
        </span>
      ) : null}
    </span>
  )
}
