import { useState } from 'react'
import type { LineaDetalle } from '../../lib/tipos'
import { euros } from '../../lib/formato'
import { BotonIcono, BotonTexto } from './Basicos'
import { CampoImporte, CampoTexto } from './Campos'

/**
 * Lo que hay dentro de un apunte que agrupa varias cosas.
 *
 * Suscripciones son cuarenta euros al mes que en realidad son Netflix, Spotify
 * y tres cosas más. Guardar solo el total hace que dentro de seis meses no
 * sepas qué has dejado de pagar, así que aquí se guarda línea a línea.
 *
 * La regla del componente: **el importe del apunte es la suma**. No hay un
 * total que se escriba aparte, porque entonces podría no cuadrar con sus
 * líneas y la fila mentiría. Por eso al añadir la primera línea el importe
 * deja de escribirse a mano.
 */
export function Desglose({
  lineas,
  onGuardar,
  disabled = false,
}: {
  lineas: LineaDetalle[]
  /** Recibe la lista entera ya cambiada: la fila de arriba se recalcula sola. */
  onGuardar: (lineas: LineaDetalle[]) => void | Promise<void>
  disabled?: boolean
}) {
  const [anadiendo, setAnadiendo] = useState(false)
  const [nombre, setNombre] = useState('')

  const cambiar = (indice: number, cambio: Partial<LineaDetalle>) =>
    onGuardar(lineas.map((l, i) => (i === indice ? { ...l, ...cambio } : l)))

  const quitar = (indice: number) => onGuardar(lineas.filter((_, i) => i !== indice))

  const anadir = (texto: string) => {
    const limpio = texto.trim()
    setNombre('')
    setAnadiendo(false)
    if (limpio) void onGuardar([...lineas, { nombre: limpio, importe: 0 }])
  }

  return (
    <div className="desglose">
      {lineas.length === 0 && !anadiendo ? (
        <p className="desglose-vacio">
          Sin desglose. Añade lo que agrupa este apunte y el importe pasará a ser la suma.
        </p>
      ) : null}

      {lineas.map((linea, indice) => (
        <div className="desglose-linea" key={`${linea.nombre}-${indice}`}>
          <span className="desglose-nombre">
            <CampoTexto
              valor={linea.nombre}
              etiqueta={`Nombre de ${linea.nombre}`}
              maxLength={80}
              disabled={disabled}
              onGuardar={(v) => {
                const limpio = v.trim()
                if (limpio && limpio !== linea.nombre) void cambiar(indice, { nombre: limpio })
              }}
            />
          </span>
          <span className="desglose-importe">
            <CampoImporte
              valor={linea.importe}
              etiqueta={`Importe de ${linea.nombre}`}
              estrecho
              disabled={disabled}
              onGuardar={(v) => void cambiar(indice, { importe: v ?? 0 })}
            />
          </span>
          <BotonIcono
            icono="cerrar"
            etiqueta={`Quitar ${linea.nombre}`}
            size={15}
            disabled={disabled}
            onClick={() => void quitar(indice)}
          />
        </div>
      ))}

      <div className="desglose-pie">
        {anadiendo ? (
          <span className="desglose-nuevo">
            <CampoTexto
              valor={nombre}
              etiqueta="Nombre de la cosa nueva"
              placeholder="Netflix"
              maxLength={80}
              visible
              autoFoco
              onGuardar={anadir}
            />
          </span>
        ) : (
          <BotonTexto icono="mas" onClick={() => setAnadiendo(true)} disabled={disabled}>
            Añadir
          </BotonTexto>
        )}

        {lineas.length > 0 ? (
          <span className="desglose-suma">
            {/* Al céntimo, no redondeado: está justo debajo del importe de la fila. */}
            {lineas.length} · {euros(lineas.reduce((t, l) => t + l.importe, 0))}
          </span>
        ) : null}
      </div>
    </div>
  )
}
