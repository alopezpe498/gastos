import { useState } from 'react'
import type { Concepto, Movimiento } from '../../lib/tipos'
import { CampoImporte, CampoTextoLinea } from '../../components/Campos'
import { CampoFecha } from '../../components/CampoFecha'
import { SelectorConcepto } from '../../components/SelectorConcepto'
import { cuantos, euros, NOMBRES_MESES } from '../../lib/formato'

type Props = {
  variables: Movimiento[]
  conceptos: Concepto[]
  onCambiar: (id: number, cambios: Record<string, unknown>) => Promise<void>
  onBorrar: (movimiento: Movimiento) => void
  /** Mes que se está viendo ('AAAA-MM'), para completar fechas a medio escribir. */
  mesReferencia: string
  onImportar?: () => void
}

/**
 * Los movimientos del mes: una lista, no un formulario.
 *
 * Cada apunte es una fila separada por una línea, con el día en el margen, la
 * descripción, el concepto como etiqueta y el importe alineado a la derecha en
 * monoespaciada. Van agrupados por día, del más reciente al más antiguo, como
 * en un extracto.
 *
 * Se edita en su sitio: al pulsar una fila se convierte en campos. No hay
 * pantalla de edición porque un gasto son cuatro datos y caben en una línea.
 */
export function ListaVariables({
  variables,
  conceptos,
  onCambiar,
  onBorrar,
  mesReferencia,
  onImportar,
}: Props) {
  const [editando, setEditando] = useState<number | null>(null)
  const [menu, setMenu] = useState<number | null>(null)

  const total = variables.reduce((t, v) => t + v.importe, 0)

  if (variables.length === 0) {
    return (
      <section className="seccion">
        <div className="seccion-cabecera">
          <h2 className="titulo-seccion">Movimientos</h2>
        </div>
        <div className="vacio">
          <p>Aún no hay apuntes este mes.</p>
          {onImportar ? (
            <button className="boton-texto" onClick={onImportar}>
              Importar el extracto del banco
            </button>
          ) : null}
        </div>
      </section>
    )
  }

  // Del más reciente al más antiguo, agrupados por día.
  const ordenados = [...variables].sort((a, b) =>
    String(b.fechaCobro ?? '').localeCompare(String(a.fechaCobro ?? '')),
  )
  const grupos: { dia: string | null; movimientos: Movimiento[] }[] = []
  for (const m of ordenados) {
    const dia = m.fechaCobro ?? null
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.dia === dia) ultimo.movimientos.push(m)
    else grupos.push({ dia, movimientos: [m] })
  }

  return (
    <section className="seccion">
      <div className="seccion-cabecera">
        <h2 className="titulo-seccion">Movimientos</h2>
        <span className="secundario">
          {cuantos(variables.length, 'apunte')} · <span className="dinero">{euros(total)}</span>
        </span>
      </div>

      <div className="movimientos">
        {grupos.map((grupo) => (
          <div key={grupo.dia ?? 'sin-fecha'}>
            <p className="separador-fecha">
              <span className="fecha">{dia(grupo.dia)}</span>
            </p>

            {grupo.movimientos.map((m) =>
              editando === m.id ? (
                <div className="movimiento editando" key={m.id}>
                  <SelectorConcepto
                    conceptos={conceptos}
                    valor={m.conceptoId}
                    ariaLabel={`Concepto de ${m.concepto}`}
                    onElegir={(conceptoId) => void onCambiar(m.id, { conceptoId })}
                  />
                  <CampoTextoLinea
                    valor={m.descripcion}
                    ariaLabel="Descripción"
                    placeholder="Descripción"
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
                    className="dinero"
                    onGuardar={(importe) => void onCambiar(m.id, { importe })}
                  />
                  <button className="boton-texto boton-pequeno" onClick={() => setEditando(null)}>
                    Listo
                  </button>
                </div>
              ) : (
                <div className="movimiento" key={m.id}>
                  <button
                    className="movimiento-cuerpo"
                    onClick={() => setEditando(m.id)}
                    aria-label={`Editar ${m.concepto}`}
                  >
                    <span className="movimiento-texto">
                      <span className="movimiento-descripcion">
                        {m.descripcion || m.concepto}
                      </span>
                      <span className={`etiqueta${m.tipo === 'sobre' ? ' comida' : ''}`}>
                        {m.concepto}
                      </span>
                    </span>
                    <span className={`dinero movimiento-importe${m.importe < 0 ? ' verde' : ''}`}>
                      {m.importe < 0 ? '−' : ''}
                      {euros(Math.abs(m.importe))}
                    </span>
                  </button>

                  <span className="movimiento-menu">
                    <button
                      className="boton-icono"
                      aria-label={`Más acciones para ${m.concepto}`}
                      onClick={() => setMenu(menu === m.id ? null : m.id)}
                    >
                      ···
                    </button>
                    {menu === m.id ? (
                      <span className="menu-linea">
                        <button
                          onClick={() => {
                            setMenu(null)
                            setEditando(m.id)
                          }}
                        >
                          Editar
                        </button>
                        <button
                          className="boton-peligro"
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
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

/** "12 de agosto", o "Sin fecha" para lo que aún no la tiene. */
function dia(iso: string | null) {
  if (!iso) return 'Sin fecha'
  const [, mes, d] = iso.split('-')
  return `${Number(d)} de ${NOMBRES_MESES[Number(mes) - 1].toLowerCase()}`
}
