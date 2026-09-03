import { useEffect, useRef, useState } from 'react'
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

  /*
   * La lista con la que se trabaja, aquí dentro.
   *
   * Cada cambio manda al servidor la lista ENTERA, así que construirla a
   * partir de lo que había cuando se pintó la pantalla es una carrera: se
   * cambia el importe de una línea, se añade otra antes de que llegue la
   * respuesta, y la segunda petición viaja con la foto vieja y borra a la
   * primera. En local no se nota porque el servidor contesta en dos
   * milisegundos; contra el servidor de verdad, se come una línea.
   *
   * Por eso lo último vive en una `ref`: cada operación se calcula sobre lo
   * último que se sabe, no sobre lo último que se pintó.
   */
  const [locales, setLocales] = useState<LineaDetalle[]>(lineas)
  const ultimas = useRef<LineaDetalle[]>(lineas)
  const enVuelo = useRef(0)
  const cola = useRef<Promise<unknown>>(Promise.resolve())

  /*
   * Cuando el servidor manda algo nuevo se adopta, salvo que haya algo
   * guardándose: en ese momento el servidor todavía no sabe lo que acabamos
   * de hacer, y hacerle caso desharía el cambio a medio camino.
   */
  const firma = JSON.stringify(lineas)
  useEffect(() => {
    if (enVuelo.current > 0) return
    ultimas.current = lineas
    setLocales(lineas)
    // La firma basta: es el contenido, no la identidad del array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma])

  /** Aplica un cambio sobre lo último, lo pinta y lo guarda. */
  const aplicar = (transformar: (actuales: LineaDetalle[]) => LineaDetalle[]) => {
    const nuevas = transformar(ultimas.current)
    ultimas.current = nuevas
    setLocales(nuevas)
    /*
     * En fila de uno en uno. Si dos cambios salen a la vez, el que llegue el
     * ultimo manda —y por la red no siempre llega el ultimo que salio—, asi que
     * cada uno espera a que el anterior conteste.
     */
    enVuelo.current += 1
    cola.current = cola.current
      .catch(() => undefined)
      .then(() => onGuardar(nuevas))
      .finally(() => {
        enVuelo.current -= 1
      })
  }

  const cambiar = (indice: number, cambio: Partial<LineaDetalle>) =>
    aplicar((actuales) => actuales.map((l, i) => (i === indice ? { ...l, ...cambio } : l)))

  const quitar = (indice: number) => aplicar((actuales) => actuales.filter((_, i) => i !== indice))

  const anadir = (texto: string) => {
    const limpio = texto.trim()
    setNombre('')
    setAnadiendo(false)
    if (limpio) aplicar((actuales) => [...actuales, { nombre: limpio, importe: 0 }])
  }

  return (
    <div className="desglose">
      {locales.length === 0 && !anadiendo ? (
        <p className="desglose-vacio">
          Sin desglose. Añade lo que agrupa este apunte y el importe pasará a ser la suma.
        </p>
      ) : null}

      {locales.map((linea, indice) => (
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

        {locales.length > 0 ? (
          <span className="desglose-suma">
            {/* Al céntimo, no redondeado: está justo debajo del importe de la fila. */}
            {locales.length} · {euros(locales.reduce((t, l) => t + l.importe, 0))}
          </span>
        ) : null}
      </div>
    </div>
  )
}
