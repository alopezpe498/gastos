import type { ResumenMes } from '../../lib/tipos'
import { CampoImporte } from '../../components/Campos'
import { euros } from '../../lib/formato'

type Props = {
  resumen: ResumenMes
  onCambiarPresupuesto: (valor: number | null) => Promise<void>
}

/**
 * El sobre de la comida: una sola barra fina.
 *
 * Antes era un panel con su título, su campo y su barra gorda, y ocupaba tanto
 * como el resumen del mes entero para decir una cosa. Ahora es una línea: la
 * etiqueta, la barra y las dos cifras.
 *
 * Cuando se pasa NO se pinta la barra entera de rojo por veintinueve céntimos:
 * la parte del presupuesto sigue en sello y el exceso se dibuja a continuación
 * en rojo, proporcional. Así se ve de un vistazo si te has pasado por poco o
 * por mucho.
 */
export function BarraComida({ resumen, onCambiarPresupuesto }: Props) {
  const { presupuesto, gastado } = resumen.comida
  const exceso = Math.max(0, gastado - presupuesto)
  const pasado = exceso > 0

  // Los dos tramos, sobre el total que hay que dibujar.
  const total = Math.max(presupuesto, gastado, 1)
  const anchoDentro = (Math.min(gastado, presupuesto) / total) * 100
  const anchoExceso = (exceso / total) * 100

  return (
    <div className="sobre">
      <span className="sobre-etiqueta">Comida</span>

      <div
        className="sobre-barra"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={presupuesto}
        aria-valuenow={gastado}
        aria-label={`Comida: ${euros(gastado)} de ${euros(presupuesto)}`}
      >
        <div className="sobre-dentro" style={{ width: `${anchoDentro}%` }} />
        {pasado ? <div className="sobre-exceso" style={{ width: `${anchoExceso}%` }} /> : null}
      </div>

      <span className="sobre-cifras">
        {pasado ? (
          <span className="rojo">
            Pasado <span className="dinero">{euros(exceso)}</span>
          </span>
        ) : (
          <span className="dinero">{euros(gastado)}</span>
        )}
        <span className="apagado"> / </span>
      </span>

      {/* El presupuesto se edita escribiendo encima, como todo lo demás. */}
      <CampoImporte
        valor={presupuesto}
        onGuardar={onCambiarPresupuesto}
        ariaLabel="Presupuesto de comida"
        className="dinero sobre-presupuesto"
      />
    </div>
  )
}
