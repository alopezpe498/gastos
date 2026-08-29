import { IconoAdelante, IconoAtras } from '../../components/Iconos'
import { NOMBRES_MESES } from '../../lib/formato'

export type Limites = {
  primero: { anio: number; mes: number } | null
  ultimo: { anio: number; mes: number } | null
  hoy: { anio: number; mes: number }
}

type Props = {
  anio: number
  mes: number
  limites: Limites | null
  onIr: (anio: number, mes: number) => void
}

const numero = (anio: number, mes: number) => anio * 12 + (mes - 1)
const desarmar = (n: number) => ({ anio: Math.floor(n / 12), mes: (n % 12) + 1 })

/**
 * Navegación entre meses.
 *
 * Se puede ir a CUALQUIER mes: a los que tienen datos —incluidos los importados
 * del Excel— y también hacia delante, a meses que aún no se han abierto. Navegar
 * no crea nada: si el mes no existe, la pantalla lo dice y ofrece abrirlo.
 *
 * El rango llega un año por delante de hoy, que es de sobra para preparar lo que
 * viene, y hacia atrás hasta donde llegue el histórico (o un año, si no hay).
 */
export function NavegacionMes({ anio, mes, limites, onIr }: Props) {
  const actual = numero(anio, mes)

  const hoy = limites ? numero(limites.hoy.anio, limites.hoy.mes) : actual

  // Hacia atrás, hasta el primer mes con datos (o un año, si no hay nada).
  // Hacia delante, un año por encima de hoy. El mes que se esté viendo siempre
  // cabe dentro, para no dejar a nadie encerrado fuera del rango.
  const primero = Math.min(
    limites?.primero ? numero(limites.primero.anio, limites.primero.mes) : hoy - 12,
    actual,
  )
  const ultimo = Math.max(hoy + 12, actual)

  const anterior = actual > primero ? desarmar(actual - 1) : null
  const siguiente = actual < ultimo ? desarmar(actual + 1) : null

  // Los años que se ofrecen en el desplegable.
  const anios: number[] = []
  for (let a = Math.floor(primero / 12); a <= Math.floor(ultimo / 12); a += 1) anios.push(a)

  /** Un mes solo se ofrece si cae dentro del rango navegable de su año. */
  const mesPermitido = (candidato: number, delAnio: number) => {
    const n = numero(delAnio, candidato)
    return n >= primero && n <= ultimo
  }

  return (
    <div className="navegacion-mes">
      <button
        className="icono-boton"
        disabled={!anterior}
        aria-label={
          anterior
            ? `Ir a ${NOMBRES_MESES[anterior.mes - 1]} de ${anterior.anio}`
            : 'No hay nada anterior'
        }
        onClick={() => anterior && onIr(anterior.anio, anterior.mes)}
      >
        <IconoAtras size={20} />
      </button>

      <div className="selector-mes">
        <select
          aria-label="Mes"
          value={mes}
          onChange={(e) => onIr(anio, Number(e.target.value))}
        >
          {NOMBRES_MESES.map((nombre, i) => (
            <option key={nombre} value={i + 1} disabled={!mesPermitido(i + 1, anio)}>
              {nombre}
            </option>
          ))}
        </select>

        <select
          aria-label="Año"
          value={anio}
          onChange={(e) => {
            const nuevoAnio = Number(e.target.value)
            // Al cambiar de año, el mes puede caerse fuera del rango: se lleva
            // al más cercano que sí valga.
            const destino = Math.min(Math.max(numero(nuevoAnio, mes), primero), ultimo)
            const { anio: a, mes: m } = desarmar(destino)
            onIr(a, m)
          }}
        >
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <button
        className="icono-boton"
        disabled={!siguiente}
        aria-label={
          siguiente
            ? `Ir a ${NOMBRES_MESES[siguiente.mes - 1]} de ${siguiente.anio}`
            : 'No se puede ir más allá del mes que viene'
        }
        onClick={() => siguiente && onIr(siguiente.anio, siguiente.mes)}
      >
        <IconoAdelante size={20} />
      </button>

      {/* Volver a hoy de un salto, cuando uno se ha ido lejos mirando. */}
      {limites && actual !== numero(limites.hoy.anio, limites.hoy.mes) ? (
        <button
          className="boton boton-texto boton-compacto"
          onClick={() => onIr(limites.hoy.anio, limites.hoy.mes)}
        >
          Ir a hoy
        </button>
      ) : null}
    </div>
  )
}
