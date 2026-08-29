import type { MesCompleto } from '../../lib/tipos'
import { CampoImporte } from '../../components/Campos'
import { euros } from '../../lib/formato'

type Props = {
  mes: MesCompleto
  onCambiar: (cambios: Record<string, unknown>) => Promise<void>
  onVerDetalle?: () => void
}

/**
 * La cabecera del mes: una sola pieza, no cuatro tarjetas.
 *
 * Lo primero que se mira al entrar es una sola cifra grande —lo que queda del
 * mes— y debajo, en una línea, de dónde sale. Las cuatro cifras secundarias van
 * seguidas, separadas por puntos, sin cajas: son un apoyo, no cuatro titulares
 * compitiendo entre sí.
 *
 * Las comparativas con el año pasado y con la media de doce meses NO están
 * aquí: con un solo año importado no significan nada y solo hacían ruido. Viven
 * en Análisis, que es donde se va a comparar.
 */
export function ResumenMes({ mes, onCambiar, onVerDetalle }: Props) {
  const { resumen } = mes
  const queda = resumen.sobrante
  const pasado = queda < 0

  // Lo que sobra tras cuadrar con el banco: si el dinero en cuenta no llega a
  // los fijos que faltan por cobrar, conviene verlo antes de que pase.
  const descuadre =
    resumen.dineroEnCuenta === null
      ? null
      : Math.round((resumen.dineroEnCuenta - resumen.fijosPendientes.importe) * 100) / 100

  const comidaPasada = resumen.comida.gastado > resumen.comida.presupuesto

  return (
    <div className="cabecera-mes">
      <p className={`cabecera-mes-etiqueta${pasado ? ' rojo' : ''}`}>
        {pasado ? 'Te has pasado' : 'Te queda'}
      </p>
      <p className={`protagonista${pasado ? ' rojo' : ''}`}>{euros(Math.abs(queda))}</p>

      <p className="cabecera-mes-cuenta">
        <CampoImporte
          valor={mes.ingreso}
          onGuardar={(valor) => onCambiar({ ingreso: valor })}
          ariaLabel="Ingresos del mes"
          className="dinero campo-en-linea"
        />
        <span className="apagado"> ingresos − </span>
        <button className="boton-texto dinero" onClick={onVerDetalle}>
          {euros(resumen.gastos)}
        </button>
        <span className="apagado"> gastos</span>
      </p>

      <div className="cabecera-mes-secundarias">
        <span>
          <span className="apagado">Fijos </span>
          <span className="dinero">{euros(resumen.fijos)}</span>
        </span>
        <span>
          <span className="apagado">Extras </span>
          <span className="dinero">{euros(resumen.extras)}</span>
        </span>
        <span>
          <span className="apagado">Comida </span>
          <span className={`dinero${comidaPasada ? ' rojo' : ''}`}>
            {euros(resumen.comida.gastado)}
          </span>
          <span className="apagado"> / </span>
          <span className="dinero apagado">{euros(resumen.comida.presupuesto)}</span>
        </span>
        <span>
          <span className="apagado">Ahorro objetivo </span>
          <span className="dinero">{euros(resumen.objetivoAhorro)}</span>
        </span>

        <span className="cabecera-mes-saldo">
          {resumen.dineroEnCuenta === null ? (
            <CampoImporte
              valor={null}
              admiteVacio
              placeholder="Anotar el saldo del banco"
              onGuardar={(valor) => onCambiar({ dineroEnCuenta: valor })}
              ariaLabel="Dinero en cuenta"
              className="campo-en-linea campo-enlace"
            />
          ) : (
            <>
              <span className="apagado">Saldo en cuenta </span>
              <CampoImporte
                valor={resumen.dineroEnCuenta}
                admiteVacio
                onGuardar={(valor) => onCambiar({ dineroEnCuenta: valor })}
                ariaLabel="Dinero en cuenta"
                className="dinero campo-en-linea"
              />
              {descuadre !== null ? (
                <span className={`apagado${descuadre < 0 ? ' rojo' : ''}`}>
                  {' '}
                  ({descuadre < 0 ? '−' : '+'}
                  {euros(Math.abs(descuadre))})
                </span>
              ) : null}
            </>
          )}
        </span>
      </div>
    </div>
  )
}
