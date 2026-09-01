import { useState } from 'react'
import type { RangoDisponible } from '../../lib/tipos'
import { NOMBRES_MESES } from '../../lib/formato'
import { SelectorMes } from '../../components/ui/Campos'

export type Ambito =
  | { tipo: 'mes'; anio: number; mes: number }
  | { tipo: 'anio'; anio: number }
  | { tipo: 'ultimos'; meses: number }
  | { tipo: 'todo' }
  | { tipo: 'libre'; desde: string; hasta: string }

/** El ámbito, traducido a los parámetros que espera la API. */
export function comoConsulta(ambito: Ambito): string {
  switch (ambito.tipo) {
    case 'mes': {
      // Un solo mes es un rango de un mes: la API ya sabe hacer eso.
      const clave = `${ambito.anio}-${String(ambito.mes).padStart(2, '0')}`
      return `desde=${clave}&hasta=${clave}`
    }
    case 'anio':
      return `anio=${ambito.anio}`
    case 'ultimos':
      return `ultimos=${ambito.meses}`
    case 'libre':
      return `desde=${ambito.desde}&hasta=${ambito.hasta}`
    case 'todo':
    default:
      return ''
  }
}

export function nombreDelAmbito(ambito: Ambito): string {
  switch (ambito.tipo) {
    case 'mes':
      return `${NOMBRES_MESES[ambito.mes - 1]} ${ambito.anio}`
    case 'anio':
      return String(ambito.anio)
    case 'ultimos':
      return `Últimos ${ambito.meses} meses`
    case 'libre':
      return 'Rango libre'
    case 'todo':
    default:
      return 'Todo el histórico'
  }
}

/**
 * El rango que comparten todas las vistas de la analítica.
 *
 * Vive en la cabecera y manda sobre todo lo de debajo: cambiarlo aquí cambia
 * las cinco pestañas a la vez, que es lo que se espera cuando uno se pregunta
 * "y esto, en los dos últimos años, ¿cómo va?".
 */
export function SelectorRango({
  disponible,
  ambito,
  onCambiar,
}: {
  disponible: RangoDisponible
  ambito: Ambito
  onCambiar: (ambito: Ambito) => void
}) {
  const [libreAbierto, setLibreAbierto] = useState(ambito.tipo === 'libre')

  /*
   * El mes en curso va primero porque es la pregunta de casi todos los días
   * —«¿cómo voy este mes?»— y era justo la que no se podía hacer sin abrir el
   * rango libre y elegir el mismo mes dos veces.
   */
  const hoy = new Date()
  const opciones: { etiqueta: string; ambito: Ambito }[] = [
    { etiqueta: 'Este mes', ambito: { tipo: 'mes', anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 } },
    { etiqueta: '12 meses', ambito: { tipo: 'ultimos', meses: 12 } },
    { etiqueta: '24 meses', ambito: { tipo: 'ultimos', meses: 24 } },
    ...disponible.anios.map((anio) => ({ etiqueta: String(anio), ambito: { tipo: 'anio' as const, anio } })),
    { etiqueta: 'Todo', ambito: { tipo: 'todo' } },
  ]

  const igual = (a: Ambito, b: Ambito) => JSON.stringify(a) === JSON.stringify(b)

  return (
    <div className="selector-rango">
      <div className="tira-rango" role="group" aria-label="Rango de fechas">
        {opciones.map((opcion) => (
          <button
            key={opcion.etiqueta}
            className={`chip${igual(ambito, opcion.ambito) ? ' activo' : ''}`}
            aria-pressed={igual(ambito, opcion.ambito)}
            onClick={() => {
              setLibreAbierto(false)
              onCambiar(opcion.ambito)
            }}
          >
            {opcion.etiqueta}
          </button>
        ))}
        <button
          className={`chip${ambito.tipo === 'libre' ? ' activo' : ''}`}
          aria-pressed={ambito.tipo === 'libre'}
          aria-expanded={libreAbierto}
          onClick={() => {
            const nuevo = !libreAbierto
            setLibreAbierto(nuevo)
            if (nuevo && ambito.tipo !== 'libre') {
              onCambiar({
                tipo: 'libre',
                desde: disponible.primero ?? '2024-01',
                hasta: disponible.ultimo ?? '2024-12',
              })
            }
          }}
        >
          Otro…
        </button>
      </div>

      {libreAbierto && ambito.tipo === 'libre' ? (
        <div className="rango-libre">
          <label className="campo-etiqueta">Desde</label>
          <SelectorMes
            valor={ambito.desde}
            onCambiar={(desde) => onCambiar({ ...ambito, desde })}
            etiqueta="Desde"
                      />
          <label className="campo-etiqueta">Hasta</label>
          <SelectorMes
            valor={ambito.hasta}
            onCambiar={(hasta) => onCambiar({ ...ambito, hasta })}
            etiqueta="Hasta"
                      />
        </div>
      ) : null}
    </div>
  )
}
