import type { MesCompleto, PanelMes } from '../../lib/tipos'
import { euros, redondo } from '../../lib/formato'

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
  onMesAnterior: () => void
  onMesSiguiente: () => void
  onCambiarSaldo: (valor: number | null) => Promise<void>
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
  onMesAnterior,
  onMesSiguiente,
  onCambiarSaldo,
}: PropsPrincipal) {
  const queda = mes.resumen.sobrante
  const { diasQueQuedan, dias, diaActual } = panel.periodo

  // El ritmo: qué parte del mes ha pasado, contra qué parte del dinero se ha ido.
  const partePeriodo = dias > 0 ? diaActual / dias : 0
  const parteGasto = mes.ingreso > 0 ? mes.resumen.gastos / mes.ingreso : 0
  const pasado = queda < 0
  const rapido = !pasado && parteGasto > partePeriodo + 0.05

  const estado = pasado ? 'pasado' : rapido ? 'rapido' : ''

  // La frase. Se calcula con lo que queda y los días que faltan.
  const alDia = diasQueQuedan > 0 ? queda / diasQueQuedan : queda
  const fijosPendientes = mes.resumen.fijosPendientes.importe
  const frase = pasado
    ? `Te has pasado ${redondo(Math.abs(queda))}` +
      (fijosPendientes > 0 ? `; los fijos que faltan suman ${redondo(fijosPendientes)}` : '')
    : rapido
      ? `Cuidado: a este ritmo te quedas sin nada antes de la nómina`
      : diasQueQuedan > 0
        ? `Vas bien: te sobran ${redondo(alDia)} al día hasta la nómina`
        : `Mes cerrado: te han sobrado ${redondo(queda)}`

  const descuadre =
    mes.resumen.dineroEnCuenta === null
      ? null
      : Math.round((mes.resumen.dineroEnCuenta - fijosPendientes) * 100) / 100

  return (
    <div className={`bloque principal ${estado}`}>
      <div>
        <div className="principal-cabecera">
          <span className="principal-mes">
            <button className="boton-icono" onClick={onMesAnterior} aria-label="Mes anterior">
              ‹
            </button>
            {mes.nombreMes}
            <button className="boton-icono" onClick={onMesSiguiente} aria-label="Mes siguiente">
              ›
            </button>
          </span>
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
          <span>Nómina {redondo(mes.ingreso)}</span>
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
        <div className="principal-nota">La marca es hoy: si la barra la pasa, vas rápido</div>

        <div className="principal-saldo">
          {mes.resumen.dineroEnCuenta === null ? (
            <button
              className="boton-texto"
              onClick={() => {
                const valor = window.prompt('Saldo del banco')
                if (valor === null) return
                const n = Number(valor.replace(/\./g, '').replace(',', '.'))
                if (Number.isFinite(n)) void onCambiarSaldo(n)
              }}
            >
              Anotar el saldo del banco
            </button>
          ) : (
            <>
              Saldo en cuenta {redondo(mes.resumen.dineroEnCuenta)}
              {descuadre !== null ? ` · ${descuadre < 0 ? '−' : '+'}${redondo(Math.abs(descuadre))}` : ''}
            </>
          )}
        </div>
      </div>
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

export function BloqueComida({ mes }: { mes: MesCompleto }) {
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
    </div>
  )
}

/** Barritas por día. Las que pasan del doble de la media, en lavanda intensa. */
export function BloqueExtras({ panel }: { panel: PanelMes }) {
  const dias = panel.puntos
  const conGasto = dias.filter((d) => d.extras > 0)
  const media = conGasto.length > 0 ? panel.extras.total / conGasto.length : 0
  const maximo = Math.max(...dias.map((d) => d.extras), 1)

  const ancho = 160
  const alto = 34
  const paso = dias.length > 0 ? ancho / dias.length : 0
  const grosor = Math.max(2, Math.min(8, paso - 4))

  return (
    <div className="bloque">
      <div className="t12">Extras</div>
      <div className="cifra">{redondo(panel.extras.total)}</div>
      <svg viewBox={`0 0 ${ancho} ${alto}`} width="100%" height={alto} role="img">
        <title>Extras por día</title>
        {dias.map((d, i) => {
          const altura = d.extras > 0 ? Math.max(2, (d.extras / maximo) * alto) : 0
          if (altura === 0) return null
          return (
            <rect
              key={d.dia}
              x={i * paso}
              y={alto - altura}
              width={grosor}
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

export function BloqueAhorro({ mes }: { mes: MesCompleto }) {
  const queda = mes.resumen.sobrante
  const porcentaje = mes.ingreso > 0 ? Math.round((queda / mes.ingreso) * 100) : 0
  const objetivo =
    mes.ingreso > 0 && mes.objetivoAhorro > 0
      ? Math.round((mes.objetivoAhorro / mes.ingreso) * 100)
      : null

  return (
    <div className="bloque bloque-ahorro">
      <div className="t12">Ahorro real</div>
      <div className="cifra">{porcentaje} %</div>
      <div className="t12">
        {objetivo === null
          ? 'Sin objetivo puesto'
          : porcentaje >= objetivo
            ? `Objetivo ${objetivo} % · lo vas a cumplir`
            : `Objetivo ${objetivo} % · te faltan ${objetivo - porcentaje} puntos`}
      </div>
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
