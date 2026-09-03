import { useEffect, useRef, useState } from 'react'
import type { Concepto } from '../../lib/tipos'
import { BotonPrimario, BotonTexto } from '../../components/ui/Basicos'
import { CampoImporte, SelectorConcepto } from '../../components/ui/Campos'
import { Icono } from '../../components/ui/Icono'

/**
 * La línea de apuntar, que entiende texto libre.
 *
 * «peaje 9,76» rellena concepto e importe sin abrir nada. El intérprete es
 * deliberadamente tonto —el último número es el importe, el resto el concepto—
 * porque acertar el 90 % de las veces sin pensar vale más que acertar el 100 %
 * con un formulario delante.
 */
export function AltaRapida({
  conceptos,
  onCrear,
  pedirApunte,
  onImportar,
  onFotoDeTicket,
}: {
  conceptos: Concepto[]
  onCrear: (datos: { conceptoId: number; importe: number; descripcion: string }) => Promise<void>
  /** Sube cuando se pulsa «+ Apuntar» arriba: trae el cursor aquí. */
  pedirApunte?: number
  onImportar: () => void
  /** La foto de un ticket: lleva a Importar > Tickets con el mes puesto. */
  onFotoDeTicket?: () => void
}) {
  const linea = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState('')
  const [abierta, setAbierta] = useState(false)
  const [conceptoId, setConceptoId] = useState<number | null>(null)
  const [importe, setImporte] = useState<number | null>(null)
  /*
   * Lo que se escribio quitando el numero: «disney 9,99» deja «disney».
   *
   * Si el concepto es un fijo, el apunte no crea una fila nueva —se suma al
   * fijo que ya esta— y esto es lo que le pone nombre a su linea del desglose.
   * Cuando lo escrito es el propio concepto no aporta nada y se tira.
   */
  const [nota, setNota] = useState('')

  useEffect(() => {
    if (pedirApunte) {
      setAbierta(true)
      linea.current?.focus()
    }
  }, [pedirApunte])

  /** Lee «peaje 9,76»: el último número es el importe, el resto el concepto. */
  const interpretar = (entrada: string) => {
    const numeros = entrada.match(/-?[\d.]+,?\d*/g)
    const ultimo = numeros?.[numeros.length - 1]
    const valor = ultimo ? Number(ultimo.replace(/\./g, '').replace(',', '.')) : null
    const resto = ultimo ? entrada.replace(ultimo, '').trim() : entrada.trim()

    if (valor !== null && Number.isFinite(valor)) setImporte(valor)
    setNota(resto)
    if (resto) {
      const buscado = resto.toLowerCase()
      const encontrado =
        conceptos.find((c) => c.nombre.toLowerCase() === buscado) ??
        conceptos.find((c) => c.nombre.toLowerCase().startsWith(buscado)) ??
        conceptos.find((c) => c.nombre.toLowerCase().includes(buscado))
      if (encontrado) setConceptoId(encontrado.id)
    }
  }

  const apuntar = async () => {
    if (!conceptoId || importe === null) return
    const elegido = conceptos.find((c) => c.id === conceptoId)
    const distinta = nota.toLowerCase() !== (elegido?.nombre ?? '').toLowerCase()
    await onCrear({ conceptoId, importe, descripcion: distinta ? nota : '' })
    setTexto('')
    setNota('')
    setImporte(null)
    setConceptoId(null)
    setAbierta(false)
  }

  return (
    <div className="alta">
      <div className="alta-linea">
        <Icono nombre="mas" size={16} />
        <input
          ref={linea}
          value={texto}
          placeholder={'Apunta algo… "peaje 9,76"'}
          aria-label="Apuntar un gasto"
          onFocus={() => setAbierta(true)}
          onChange={(e) => {
            setTexto(e.target.value)
            interpretar(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void apuntar()
            if (e.key === 'Escape') setAbierta(false)
          }}
        />
        {/*
          Dos puertas, y las dos aqui porque es donde se apunta: el extracto del
          banco una vez al mes, y la foto del ticket cada vez que se vuelve de la
          compra. La camara va primero: es la que se usa mas veces.
        */}
        {onFotoDeTicket ? (
          <button
            className="btn-icono"
            aria-label="Foto de un ticket de la compra"
            onClick={onFotoDeTicket}
          >
            <Icono nombre="camara" size={16} />
          </button>
        ) : null}
        <button className="btn-icono" aria-label="Importar el extracto del banco" onClick={onImportar}>
          <Icono nombre="nota" size={16} />
        </button>
      </div>

      {abierta ? (
        <div className="alta-desplegada">
          <SelectorConcepto
            conceptos={conceptos}
            valor={conceptoId}
            onElegir={setConceptoId}
            etiqueta="Concepto"
          />
          <span style={{ width: 120 }}>
            <CampoImporte valor={importe} admiteVacio visible etiqueta="Importe" onGuardar={setImporte} />
          </span>
          <BotonPrimario disabled={!conceptoId || importe === null} onClick={() => void apuntar()}>
            Apuntar
          </BotonPrimario>
          <BotonTexto onClick={() => setAbierta(false)}>Cancelar</BotonTexto>
          {/*
            Un botón apagado sin decir por qué es un callejón sin salida: si
            escribes «mercadona 12,30» y no hay un concepto que se llame así,
            hay que decir que falta elegirlo, no dejarte pulsando.
          */}
          {!conceptoId || importe === null ? (
            <span className="muted-3">
              {!conceptoId && importe === null
                ? 'Falta el concepto y el importe'
                : !conceptoId
                  ? 'Falta elegir el concepto'
                  : 'Falta el importe'}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
