import { useEffect, useRef, useState } from 'react'
import type { Concepto, Movimiento, PanelMes } from '../../lib/tipos'
import { SelectorConcepto } from '../../components/SelectorConcepto'
import { CampoImporte, CampoTextoLinea } from '../../components/Campos'
import { CampoFecha } from '../../components/CampoFecha'
import { euros } from '../../lib/formato'
import { paletaDeId } from '../../lib/colores'

/**
 * Las dos listas de la parte de abajo: movimientos y fijos.
 *
 * Las dos son filas separadas por una línea de 1 px, nunca tarjetas apiladas.
 * Fecha corta a la izquierda, descripción, la etiqueta del concepto con su
 * punto de color, y el importe en negrita a la derecha con cifras tabulares.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function fechaCorta(iso: string | null) {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]}`
}

/** La etiqueta de un concepto: siempre el mismo color para el mismo concepto. */
export function Etiqueta({
  conceptoId,
  nombre,
  esSobre = false,
  color,
}: {
  conceptoId: number | null
  nombre: string
  esSobre?: boolean
  /** El elegido a mano en Conceptos, si lo hay. */
  color?: string | null
}) {
  const paleta = paletaDeId(conceptoId, esSobre, color)
  return (
    <span className="chip" style={{ background: paleta.suave, color: paleta.texto }}>
      <span className="punto" style={{ background: paleta.color }} />
      {nombre}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

type PropsMovimientos = {
  variables: Movimiento[]
  conceptos: Concepto[]
  mesReferencia: string
  onCambiar: (id: number, cambios: Record<string, unknown>) => Promise<void>
  onBorrar: (movimiento: Movimiento) => void
  onCrear: (datos: { conceptoId: number; importe: number; descripcion: string }) => Promise<void>
  onImportar: () => void
  /** Sube cuando se pulsa «+ Apuntar» arriba: pone el foco en la línea. */
  pedirApunte?: number
}

export function ListaMovimientos({
  variables,
  conceptos,
  mesReferencia,
  onCambiar,
  onBorrar,
  onCrear,
  onImportar,
  pedirApunte,
}: PropsMovimientos) {
  const [editando, setEditando] = useState<number | null>(null)
  const [menu, setMenu] = useState<number | null>(null)

  // Los movimientos traen el id del concepto pero no su color: se busca aquí
  // una vez, y no una por fila.
  const colores = new Map(conceptos.map((c) => [c.id, c.color]))

  const total = variables.reduce((t, v) => t + v.importe, 0)
  const ordenados = [...variables].sort((a, b) =>
    String(b.fechaCobro ?? '').localeCompare(String(a.fechaCobro ?? '')),
  )

  return (
    <div className="bloque">
      <div className="bloque-cabecera">
        <span className="titulo-bloque">Movimientos</span>
        <span className="t12">
          {variables.length} · {euros(total)}
        </span>
      </div>

      <AltaRapida conceptos={conceptos} onCrear={onCrear} pedirApunte={pedirApunte} />

      {ordenados.length === 0 ? (
        <div className="vacio">
          <p>Aún no hay apuntes este mes.</p>
          <button className="boton-texto" onClick={onImportar}>
            Importa el extracto del banco
          </button>
        </div>
      ) : (
        ordenados.map((m) =>
          editando === m.id ? (
            <div className="fila" key={m.id}>
              <SelectorConcepto
                conceptos={conceptos}
                valor={m.conceptoId}
                ariaLabel="Concepto"
                onElegir={(conceptoId) => void onCambiar(m.id, { conceptoId })}
              />
              <CampoTextoLinea
                valor={m.descripcion}
                ariaLabel="Descripción"
                placeholder="Descripción"
                className="campo"
                onGuardar={(descripcion) => void onCambiar(m.id, { descripcion })}
              />
              <CampoFecha
                valor={m.fechaCobro ?? ''}
                mesReferencia={mesReferencia}
                ariaLabel="Fecha"
                onGuardar={(fechaCobro) => void onCambiar(m.id, { fechaCobro })}
              />
              <CampoImporte
                valor={m.importe}
                ariaLabel="Importe"
                className="campo importe"
                onGuardar={(importe) => void onCambiar(m.id, { importe })}
              />
              <button className="boton-texto" onClick={() => setEditando(null)}>
                Listo
              </button>
            </div>
          ) : (
            <div className="fila" key={m.id}>
              <span className="fila-fecha">{fechaCorta(m.fechaCobro)}</span>
              <button
                className="fila-texto"
                onClick={() => setEditando(m.id)}
                aria-label={`Editar ${m.concepto}`}
              >
                {m.descripcion || m.concepto}
              </button>
              <Etiqueta
                conceptoId={m.conceptoId}
                nombre={m.concepto}
                esSobre={m.tipo === 'sobre'}
                color={colores.get(m.conceptoId)}
              />
              <span className={`importe${m.importe < 0 ? ' abono' : ''}`}>
                {m.importe < 0 ? '−' : ''}
                {euros(Math.abs(m.importe))}
              </span>
              <span style={{ position: 'relative' }}>
                <button
                  className="boton-icono"
                  aria-label={`Más acciones para ${m.concepto}`}
                  onClick={() => setMenu(menu === m.id ? null : m.id)}
                >
                  ···
                </button>
                {menu === m.id ? (
                  <span className="menu">
                    <button
                      onClick={() => {
                        setMenu(null)
                        setEditando(m.id)
                      }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => {
                        setMenu(null)
                        void onCrear({
                          conceptoId: m.conceptoId,
                          importe: m.importe,
                          descripcion: m.descripcion,
                        })
                      }}
                    >
                      Duplicar
                    </button>
                    <button
                      onClick={() => {
                        setMenu(null)
                        onBorrar(m)
                      }}
                    >
                      Borrar
                    </button>
                  </span>
                ) : null}
              </span>
            </div>
          ),
        )
      )}
    </div>
  )
}

/**
 * El alta rápida: una línea que entiende texto libre.
 *
 * «peaje 9,76» rellena concepto e importe sin abrir nada. El parser es
 * deliberadamente tonto —el último número es el importe, el resto es el
 * concepto— porque acertar el 90 % de las veces sin pensar vale más que
 * acertar el 100 % con un formulario delante.
 */
function AltaRapida({
  conceptos,
  onCrear,
  pedirApunte,
}: {
  conceptos: Concepto[]
  onCrear: (datos: { conceptoId: number; importe: number; descripcion: string }) => Promise<void>
  pedirApunte?: number
}) {
  const linea = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState('')
  const [abierta, setAbierta] = useState(false)
  const [conceptoId, setConceptoId] = useState<number | null>(null)
  const [importe, setImporte] = useState<number | null>(null)

  // El botón de arriba no abre nada: trae aquí el cursor, que es lo que hace
  // falta. El formulario sigue apareciendo solo cuando se empieza a escribir.
  useEffect(() => {
    if (pedirApunte) linea.current?.focus()
  }, [pedirApunte])

  /** Lee "peaje 9,76": el último número es el importe, el resto el concepto. */
  const interpretar = (entrada: string) => {
    const numeros = entrada.match(/-?[\d.]+,?\d*/g)
    const ultimo = numeros?.[numeros.length - 1]
    const valor = ultimo ? Number(ultimo.replace(/\./g, '').replace(',', '.')) : null
    const resto = ultimo ? entrada.replace(ultimo, '').trim() : entrada.trim()

    if (valor !== null && Number.isFinite(valor)) setImporte(valor)
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
    await onCrear({ conceptoId, importe, descripcion: '' })
    setTexto('')
    setImporte(null)
    setConceptoId(null)
    setAbierta(false)
  }

  return (
    <div className="alta">
      <div className="alta-linea">
        <input
          ref={linea}
          value={texto}
          placeholder='Apunta algo… "peaje 9,76" o pega el ticket'
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
      </div>

      {abierta ? (
        <div className="alta-desplegada">
          <SelectorConcepto
            conceptos={conceptos}
            valor={conceptoId}
            ariaLabel="Concepto"
            placeholder="Concepto"
            onElegir={setConceptoId}
          />
          <CampoImporte
            valor={importe}
            admiteVacio
            ariaLabel="Importe"
            className="campo importe"
            onGuardar={setImporte}
          />
          <button
            className="boton boton-negro"
            disabled={!conceptoId || importe === null}
            onClick={() => void apuntar()}
          >
            Apuntar
          </button>
          <button className="boton-texto" onClick={() => setAbierta(false)}>
            Cancelar
          </button>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fijos
// ---------------------------------------------------------------------------

export function ListaFijos({
  panel,
  onAlternarCobro,
  onCambiarImporte,
}: {
  panel: PanelMes
  onAlternarCobro: (movimientoId: number) => Promise<void>
  onCambiarImporte: (movimientoId: number, importe: number | null) => Promise<void>
}) {
  return (
    <div className="bloque">
      <div className="bloque-cabecera">
        <span className="titulo-bloque">Fijos</span>
        <span className="t12">
          {panel.pendientes === 0 ? 'todos cobrados' : `${panel.pendientes} pendientes`}
        </span>
      </div>

      {panel.fijos.map((f) => (
        <div className="fila" key={f.movimientoId}>
          <button
            className={`check${f.cobrado ? ' cobrado' : ''}${f.tarde ? ' tarde' : ''}`}
            aria-label={`${f.cobrado ? 'Desmarcar' : 'Marcar como cobrado'} ${f.concepto}`}
            aria-pressed={f.cobrado}
            onClick={() => void onAlternarCobro(f.movimientoId)}
          >
            ✓
          </button>
          <span className="fila-texto">
            {f.concepto}
            {f.tarde ? (
              <span className="fila-tarde"> día {primerDia(f.diaPrevisto)}, aún no</span>
            ) : null}
          </span>
          <CampoImporte
            valor={f.importe}
            ariaLabel={`Importe de ${f.concepto}`}
            className={`campo importe${f.cobrado ? '' : ' apagado'}`}
            onGuardar={(importe) => void onCambiarImporte(f.movimientoId, importe)}
          />
        </div>
      ))}
    </div>
  )
}

function primerDia(diaPrevisto: string | null) {
  return String(diaPrevisto ?? '').split(/[^0-9]+/).filter(Boolean)[0] ?? '?'
}
