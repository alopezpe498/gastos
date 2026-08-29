import type { Concepto, Movimiento } from '../../lib/tipos'
import { CampoImporte, CampoTextoLinea } from '../../components/Campos'
import { CampoFecha } from '../../components/CampoFecha'
import { SelectorConcepto } from '../../components/SelectorConcepto'
import { IconoPapelera } from '../../components/Iconos'
import { EstadoVacio } from '../../components/Basicos'
import { cuantos, euros } from '../../lib/formato'

type Props = {
  variables: Movimiento[]
  conceptos: Concepto[]
  onCambiar: (id: number, cambios: Record<string, unknown>) => Promise<void>
  onBorrar: (movimiento: Movimiento) => void
  /** Mes que se esta viendo ('AAAA-MM'), para completar fechas a medio escribir. */
  mesReferencia: string
}

/**
 * Los gastos variables del mes, del mas reciente al mas antiguo.
 *
 * Todo se corrige en su sitio: el concepto, el importe, la fecha y la
 * descripcion. No hay pantalla de edicion porque no hace falta: una linea de
 * gasto son cuatro datos y caben en una fila.
 */
export function ListaVariables({
  variables,
  conceptos,
  onCambiar,
  onBorrar,
  mesReferencia,
}: Props) {
  const total = variables.reduce((t, v) => t + v.importe, 0)

  return (
    <section className="panel">
      <div className="panel-cabecera">
        <h2 className="seccion-titulo">Variables</h2>
        <span className="panel-nota">
          {cuantos(variables.length, 'apunte')} · <span className="dinero">{euros(total)}</span>
        </span>
      </div>

      {variables.length === 0 ? (
        <EstadoVacio
          icono="—"
          titulo="Ningún gasto todavía"
          texto="Apunta el primero en la línea de arriba."
        />
      ) : (
        <div className="tarjeta lista-variables">
          {variables.map((variable) => (
            <div className="variable-fila" key={variable.id}>
              <CampoFecha
                valor={variable.fechaCobro ?? ''}
                mesReferencia={mesReferencia}
                onGuardar={(iso) => onCambiar(variable.id, { fechaCobro: iso })}
                ariaLabel={`Fecha de ${variable.concepto}`}
                className="variable-fecha"
                compacto
              />

              <span className="variable-concepto">
                <SelectorConcepto
                  conceptos={conceptos}
                  valor={variable.conceptoId}
                  onElegir={(conceptoId) => void onCambiar(variable.id, { conceptoId })}
                  ariaLabel={`Concepto de ${variable.concepto}`}
                />
              </span>

              <span className="variable-descripcion">
                <CampoTextoLinea
                  valor={variable.descripcion}
                  onGuardar={(descripcion) => onCambiar(variable.id, { descripcion })}
                  ariaLabel={`Descripción de ${variable.concepto}`}
                  placeholder="—"
                />
              </span>

              <CampoImporte
                valor={variable.importe}
                onGuardar={(importe) => onCambiar(variable.id, { importe })}
                ariaLabel={`Importe de ${variable.concepto}`}
                className={`variable-importe${variable.importe < 0 ? ' negativo' : ''}`}
              />

              <button
                className="icono-boton variable-borrar"
                aria-label={`Borrar ${variable.concepto} de ${euros(variable.importe)}`}
                onClick={() => onBorrar(variable)}
              >
                <IconoPapelera size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
