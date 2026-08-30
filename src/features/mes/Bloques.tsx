import { useState } from 'react'
import type { MesCompleto, PanelMes } from '../../lib/tipos'
import { euros, redondo } from '../../lib/formato'
import { CampoImporte } from '../../components/Campos'
import { SelectorDeMes } from '../../components/SelectorDeMes'

/**
 * Los cuatro bloques de la cabecera de Mes.
 *
 * Cada uno dice una cifra grande y una frase corta en segunda persona. La
 * frase no es decoración: es lo que convierte un número en algo que entiendes
 * sin pensar. «2.772 €» no dice nada; «Amazon se lleva el 64 %» sí.
 */

// ---------------------------------------------------------------------------
// El bloque principal
// ---------------------------------------------------------------------------

type PropsPrincipal = {
  mes: MesCompleto
  panel: PanelMes
  onIr: (anio: number, mes: number) => void
  onCambiarSaldo: (valor: number | null) => Promise<void>
  onCambiarIngreso: (valor: number) => Promise<void>
}

/**
 * Lo que queda del mes, y si vas bien o mal.
 *
 * Es la única alarma de la pantalla: lima si vas bien, ámbar si el ritmo es
 * alto pero aún queda, coral si ya te has pasado. En ningún otro sitio hay
 * rojos sueltos.
 */
export function BloquePrincipal({
  mes,
  panel,
  onIr,
  onCambiarSaldo,
  onCambiarIngreso,
}: PropsPrincipal) {
  const queda = mes.resumen.sobrante
  const { diasQueQuedan, dias, diaActual } = panel.periodo

  // El ritmo: qué parte del mes ha pasado, contra qué parte del dinero se ha ido.
  const partePeriodo = dias > 0 ? diaActual / dias : 0
  const parteGasto = mes.ingreso > 0 ? mes.resumen.gastos / mes.ingreso : 0
  const pasado = queda < 0
  const rapido = !pasado && parteGasto > partePeriodo + 0.05

  const estado = pasado ? 'pasado' : rapido ? 'rapido' : ''

  /*
   * La frase. Cambia de tiempo verbal cuando el periodo se acaba: un mes
   * terminado no admite consejos («te sobran X al día» sobre cero días es una
   * división por cero disfrazada de recomendación). Y en un mes cerrado los
   * fijos que faltaran ya no van a llegar, así que no se nombran.
   */
  const terminado = diasQueQuedan === 0 && diaActual > 0
  const alDia = diasQueQuedan > 0 ? queda / diasQueQuedan : queda
  const fijosPendientes = mes.resumen.fijosPendientes.importe
  const nombre = mes.nombreMes.toLowerCase()
  const frase = terminado
    ? pasado
      ? `Cerraste ${nombre} con ${redondo(Math.abs(queda))} de más`
      : `Cerraste ${nombre} con ${redondo(queda)} de sobra`
    : pasado
      ? `Te has pasado ${redondo(Math.abs(queda))}` +
        (fijosPendientes > 0 ? `; los fijos que faltan suman ${redondo(fijosPendientes)}` : '')
      : rapido
        ? 'Cuidado: a este ritmo te quedas sin nada antes de la nómina'
        : diasQueQuedan === 1
          // Un solo día no es un ritmo: repartirlo «al día» no dice nada.
          ? `Vas bien: te queda ${redondo(queda)} para el último día`
          : `Vas bien: te sobran ${redondo(alDia)} al día hasta la nómina`

  const descuadre =
    mes.resumen.dineroEnCuenta === null
      ? null
      : Math.round((mes.resumen.dineroEnCuenta - fijosPendientes) * 100) / 100

  return (
    <div className={`bloque principal ${estado}`}>
      <div>
        <div className="principal-cabecera">
          <SelectorDeMes anio={mes.anio} mes={mes.mes} onIr={onIr} tamano="grande" />
          <span className="principal-periodo">
            {corta(panel.periodo.desde)} → {corta(panel.periodo.hasta)}
            {diaActual > 0 ? ` · día ${diaActual} de ${dias}` : ''}
          </span>
        </div>

        <div className="cifra-grande">{redondo(Math.abs(queda))}</div>
        <div className="principal-frase">{frase}</div>
      </div>

      <div className="principal-pie">
        <div className="principal-cifras">
          <span>Gastado {redondo(mes.resumen.gastos)}</span>
          <ValorAlVuelo
            etiqueta="Nómina"
            valor={mes.ingreso}
            ariaLabel="Nómina del mes"
            onCambiar={(valor) => onCambiarIngreso(valor ?? 0)}
          />
        </div>
        <div className="principal-barra">
          <div
            className="principal-relleno"
            style={{ width: `${Math.min(100, Math.max(0, parteGasto * 100))}%` }}
          />
          {diaActual > 0 && diaActual < dias ? (
            <div className="principal-hoy" style={{ left: `${partePeriodo * 100}%` }} />
          ) : null}
        </div>
        {/* En un mes terminado no hay «hoy», así que la marca no está y la
            explicación sobraría. */}
        {terminado ? null : (
          <div className="principal-nota">La marca es hoy: si la barra la pasa, vas rápido</div>
        )}

        <Saldo
          saldo={mes.resumen.dineroEnCuenta}
          descuadre={descuadre}
          onCambiar={onCambiarSaldo}
        />
      </div>
    </div>
  )
}

/**
 * Un número del mes que se cambia donde se lee.
 *
 * Es la regla de la casa: en reposo un valor es texto; al pulsarlo se convierte
 * en campo. Vale igual dentro del bloque de color (donde hereda su tinta) que
 * en uno blanco, y evita tener que ir a buscar un formulario en otra pantalla
 * para cambiar la nómina de este mes.
 */
export function ValorAlVuelo({
  etiqueta,
  valor,
  ariaLabel,
  sufijo,
  vacio,
  onCambiar,
}: {
  etiqueta: string
  valor: number | null
  ariaLabel: string
  /** Lo que va detrás del número, si hace falta («del sobre»). */
  sufijo?: string
  /** Qué poner cuando no hay valor. «Objetivo de 0 €» no dice nada. */
  vacio?: string
  onCambiar: (valor: number | null) => Promise<void>
}) {
  const [editando, setEditando] = useState(false)

  if (!editando) {
    return (
      <button className="valor-al-vuelo" onClick={() => setEditando(true)}>
        {vacio && !valor ? (
          vacio
        ) : (
          <>
            {etiqueta} <strong>{redondo(valor)}</strong>
            {sufijo ? ` ${sufijo}` : ''}
          </>
        )}
      </button>
    )
  }

  return (
    <span className="valor-al-vuelo editando">
      {etiqueta}
      <CampoImporte
        valor={valor}
        admiteVacio
        autoFoco
        ariaLabel={ariaLabel}
        className="campo importe campo-en-color"
        onGuardar={async (nuevo) => {
          setEditando(false)
          await onCambiar(nuevo)
        }}
      />
    </span>
  )
}

/**
 * El saldo del banco: texto hasta que lo tocas.
 *
 * Nada de ventanas del navegador para pedir un número. En esta app un valor es
 * texto en reposo y se convierte en campo al pulsarlo, y el saldo no es una
 * excepción por estar dentro del bloque de color.
 */
function Saldo({
  saldo,
  descuadre,
  onCambiar,
}: {
  saldo: number | null
  descuadre: number | null
  onCambiar: (valor: number | null) => Promise<void>
}) {
  const [editando, setEditando] = useState(false)

  if (editando || saldo !== null) {
    return (
      <div className="principal-saldo">
        <span>Saldo en cuenta</span>
        <CampoImporte
          valor={saldo}
          admiteVacio
          ariaLabel="Saldo en cuenta"
          className="campo importe campo-en-color"
          onGuardar={async (valor) => {
            setEditando(false)
            await onCambiar(valor)
          }}
        />
        {descuadre !== null ? (
          <span>
            · {descuadre < 0 ? '−' : '+'}
            {redondo(Math.abs(descuadre))}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="principal-saldo">
      <button className="boton-texto" onClick={() => setEditando(true)}>
        Anotar el saldo del banco
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Los bloques secundarios
// ---------------------------------------------------------------------------

/** Un punto por recibo; se rellenan al cobrar. Máximo 20: más no se leen. */
export function BloqueFijos({ panel }: { panel: PanelMes }) {
  const total = panel.fijos.reduce((t, f) => t + f.importe, 0)
  const cobrados = panel.fijos.filter((f) => f.cobrado).length
  const puntos = panel.fijos.slice(0, 20)

  return (
    <div className="bloque">
      <div className="t12">Fijos</div>
      <div className="cifra">{redondo(total)}</div>
      <div className="puntos">
        {puntos.map((f) => (
          <span
            key={f.movimientoId}
            className="punto"
            style={{ background: f.cobrado ? 'var(--tinta)' : 'var(--hueco)' }}
            title={`${f.concepto} · ${euros(f.importe)}`}
          />
        ))}
      </div>
      <div className="t12">
        {cobrados} de {panel.fijos.length} cobrados
        {panel.nombresPendientes.length > 0
          ? ` · ${panel.nombresPendientes.join(' y ')} aún no`
          : ''}
      </div>
    </div>
  )
}

export function BloqueComida({
  mes,
  onCambiarPresupuesto,
}: {
  mes: MesCompleto
  onCambiarPresupuesto: (valor: number) => Promise<void>
}) {
  const { presupuesto, gastado } = mes.resumen.comida
  const exceso = Math.max(0, gastado - presupuesto)
  const total = Math.max(presupuesto, gastado, 1)

  return (
    <div className="bloque bloque-comida">
      <div className="t12">Comida</div>
      <div className="cifra">{redondo(gastado)}</div>
      <div className="barra-sobre">
        <span style={{ width: `${(Math.min(gastado, presupuesto) / total) * 100}%` }} />
        <span
          style={{ width: `${(exceso / total) * 100}%`, background: 'var(--coral-tinta)' }}
        />
      </div>
      <div className="t12" style={{ marginTop: 6 }}>
        {exceso > 0
          ? `Sobre agotado, +${euros(exceso)} de más`
          : presupuesto > 0
            ? `Te quedan ${redondo(presupuesto - gastado)} del sobre`
            : 'Sin presupuesto puesto'}
      </div>

      <ValorAlVuelo
        etiqueta="Sobre de"
        valor={presupuesto}
        ariaLabel="Presupuesto de comida del mes"
        vacio="Poner un presupuesto"
        onCambiar={(valor) => onCambiarPresupuesto(valor ?? 0)}
      />
    </div>
  )
}

/**
 * Una barrita por día del periodo.
 *
 * El viewBox se mide en días, no en píxeles: así una barra ocupa siempre lo
 * mismo tenga el mes 28 días o 31, y no hay que calcular anchos a mano. Las
 * que pasan del doble de la media van en lavanda intensa, que es la forma de
 * ver «ese día se fue de madre» sin leer una cifra.
 */
export function BloqueExtras({ panel }: { panel: PanelMes }) {
  const dias = panel.puntos
  const conGasto = dias.filter((d) => d.extras > 0)
  const media = conGasto.length > 0 ? panel.extras.total / conGasto.length : 0
  const maximo = Math.max(...dias.map((d) => d.extras), 1)

  // Un día = una unidad de ancho. La barra ocupa el 62 % y deja el resto de aire.
  const alto = 34
  const ancho = Math.max(dias.length, 1)

  return (
    <div className="bloque">
      <div className="t12">Extras</div>
      <div className="cifra">{redondo(panel.extras.total)}</div>

      <svg
        className="extras-grafico"
        viewBox={`0 0 ${ancho} ${alto}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={
          conGasto.length === 0
            ? 'Todavía no hay extras este mes'
            : `Extras por día: ${conGasto.length} días con gasto, el mayor de ${euros(maximo)}`
        }
      >
        {dias.map((d, i) => {
          if (d.extras <= 0) return null
          // Mínimo de 2 px para que un día con 3 € siga viéndose.
          const altura = Math.max(2, (d.extras / maximo) * alto)
          return (
            <rect
              key={d.dia}
              x={i + 0.19}
              y={alto - altura}
              width={0.62}
              height={altura}
              fill={d.extras > media * 2 ? 'var(--lavanda)' : 'var(--lavanda-suave)'}
            />
          )
        })}
      </svg>

      <div className="t12">
        {panel.extras.mayor
          ? `${panel.extras.mayor.concepto} se lleva el ${panel.extras.mayor.porcentaje} %`
          : 'Todavía no hay extras este mes'}
      </div>
    </div>
  )
}

/**
 * El ahorro real del mes, contra el objetivo de la plantilla.
 *
 * El objetivo sale del concepto marcado como `esObjetivo` —es lo que dice la
 * plantilla que se quiere apartar— y no de un número suelto en Ajustes. Si el
 * ahorro sale negativo el bloque se vuelve coral: no es un matiz, es que ese
 * mes has vivido de lo ahorrado.
 */
export function BloqueAhorro({
  mes,
  onCambiarObjetivo,
}: {
  mes: MesCompleto
  onCambiarObjetivo: (valor: number) => Promise<void>
}) {
  const queda = mes.resumen.sobrante
  const porcentaje = mes.ingreso > 0 ? Math.round((queda / mes.ingreso) * 100) : 0
  const objetivo =
    mes.ingreso > 0 && mes.objetivoAhorro > 0
      ? Math.round((mes.objetivoAhorro / mes.ingreso) * 100)
      : null

  const enRojo = queda < 0

  return (
    <div className={`bloque bloque-ahorro${enRojo ? ' sin-ahorro' : ''}`}>
      <div className="t12">Ahorro real</div>
      <div className="cifra">{porcentaje} %</div>
      {objetivo === null ? null : (
        <div className="t12">
          {enRojo
            ? 'Este mes no ahorras'
            : porcentaje >= objetivo
              ? `Objetivo ${objetivo} % · lo vas a cumplir`
              : `Objetivo ${objetivo} % · te faltan ${objetivo - porcentaje} puntos`}
        </div>
      )}

      <ValorAlVuelo
        etiqueta="Objetivo de"
        valor={mes.objetivoAhorro}
        ariaLabel="Objetivo de ahorro del mes"
        vacio="Ponerte un objetivo"
        onCambiar={(valor) => onCambiarObjetivo(valor ?? 0)}
      />
    </div>
  )
}

/** "29 jul", que es como se lee un periodo. */
function corta(iso: string | null) {
  if (!iso) return '—'
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${meses[Number(m) - 1]}`
}
