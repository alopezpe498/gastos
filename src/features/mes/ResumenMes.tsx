import type { ContextoMes, MesCompleto } from '../../lib/tipos'
import { CampoImporte } from '../../components/Campos'
import { Variacion } from '../analitica/Piezas'
import { euros, porcentaje } from '../../lib/formato'

type Props = {
  mes: MesCompleto
  contexto: ContextoMes | null
  onCambiar: (cambios: Record<string, unknown>) => Promise<void>
}

/**
 * El cuadro resumen del mes, que es lo primero que se mira al entrar.
 *
 * Cuatro cifras arriba (ingresos, gastos, sobrante y dinero en cuenta) y el
 * desglose debajo. Solo dos son editables, y son justo las dos que se copian a
 * mano cada mes: la nomina y lo que dice el banco. El resto son consecuencia de
 * los apuntes y no se tocan aqui.
 */
export function ResumenMes({ mes, contexto, onCambiar }: Props) {
  const { resumen } = mes
  const sobranteNegativo = resumen.sobrante < 0

  // Lo que sobra tras cuadrar con el banco: si el dinero en cuenta no llega a
  // los fijos que faltan por cobrar, conviene verlo antes de que pase.
  const descuadre =
    resumen.dineroEnCuenta === null
      ? null
      : Math.round((resumen.dineroEnCuenta - resumen.fijosPendientes.importe) * 100) / 100

  return (
    <div className="resumen">
      <div className="resumen-rejilla">
        <div className="resumen-celda">
          <span className="resumen-etiqueta">Ingresos</span>
          <CampoImporte
            valor={mes.ingreso}
            onGuardar={(valor) => onCambiar({ ingreso: valor })}
            ariaLabel="Ingresos del mes"
            className="dinero-titular resumen-cifra"
          />
        </div>

        <div className="resumen-celda">
          <span className="resumen-etiqueta">Gastos</span>
          <span className="dinero-titular resumen-cifra">{euros(resumen.gastos)}</span>
          <Comparaciones
            variacionAnterior={contexto?.anioAnterior?.variacionGastos ?? null}
            variacionMedia={contexto?.mediaDoceMeses?.variacionGastos ?? null}
            subirEsBueno={false}
          />
        </div>

        <div className="resumen-celda">
          <span className="resumen-etiqueta">Sobrante</span>
          <span
            className={`dinero-titular resumen-cifra ${sobranteNegativo ? 'negativo' : 'positivo'}`}
          >
            {euros(resumen.sobrante)}
          </span>
          <span className="resumen-nota">
            {porcentaje(mes.ingreso ? (resumen.sobrante / mes.ingreso) * 100 : null)} de los
            ingresos
          </span>
          <Comparaciones
            variacionAnterior={contexto?.anioAnterior?.variacionSobrante ?? null}
            variacionMedia={contexto?.mediaDoceMeses?.variacionSobrante ?? null}
            subirEsBueno
          />
        </div>

        <div className="resumen-celda">
          <span className="resumen-etiqueta">Dinero en cuenta</span>
          <CampoImporte
            valor={mes.dineroEnCuenta}
            onGuardar={(valor) => onCambiar({ dineroEnCuenta: valor })}
            admiteVacio
            placeholder="Sin mirar"
            ariaLabel="Dinero en cuenta"
            className="dinero-titular resumen-cifra"
          />
          {descuadre !== null && resumen.fijosPendientes.cuantos > 0 ? (
            <span className={`resumen-nota ${descuadre < 0 ? 'negativo' : ''}`}>
              {descuadre < 0 ? 'faltan ' : 'quedan '}
              {euros(Math.abs(descuadre))} tras los fijos pendientes
            </span>
          ) : null}
        </div>
      </div>

      <div className="desglose">
        <Trozo etiqueta="Fijos" importe={resumen.fijos} />
        <Trozo etiqueta="Extras" importe={resumen.extras} />
        <Trozo
          etiqueta="Comida"
          importe={resumen.comida.contada}
          nota={resumen.comida.criterio === 'presupuesto' ? 'presupuesto' : 'gastado'}
        />
        <Trozo etiqueta="Ahorro" importe={resumen.objetivoAhorro} nota="objetivo" />
      </div>
    </div>
  )
}

/**
 * Las dos comparaciones que dan contexto a una cifra del mes: contra el mismo
 * mes del año pasado y contra la media del último año. Sin ellas, «3.317 € de
 * gastos» no dice si es mucho o poco.
 */
function Comparaciones({
  variacionAnterior,
  variacionMedia,
  subirEsBueno,
}: {
  variacionAnterior: number | null
  variacionMedia: number | null
  subirEsBueno: boolean
}) {
  if (variacionAnterior === null && variacionMedia === null) return null

  return (
    <span className="comparaciones">
      {variacionAnterior !== null ? (
        <span className="comparacion" title="Frente al mismo mes del año pasado">
          <Variacion valor={variacionAnterior} subirEsBueno={subirEsBueno} />
          <span className="comparacion-nota">año pasado</span>
        </span>
      ) : null}
      {variacionMedia !== null ? (
        <span className="comparacion" title="Frente a la media de los últimos doce meses">
          <Variacion valor={variacionMedia} subirEsBueno={subirEsBueno} />
          <span className="comparacion-nota">media 12 m</span>
        </span>
      ) : null}
    </span>
  )
}

function Trozo({
  etiqueta,
  importe,
  nota,
}: {
  etiqueta: string
  importe: number
  nota?: string
}) {
  return (
    <div className="desglose-trozo">
      <span className="desglose-etiqueta">
        {etiqueta}
        {nota ? <span className="desglose-nota"> · {nota}</span> : null}
      </span>
      <span className={`dinero desglose-cifra${importe === 0 ? ' cero' : ''}`}>
        {euros(importe)}
      </span>
    </div>
  )
}
