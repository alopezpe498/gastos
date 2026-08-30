import { useState } from 'react'
import type { Anual, FilaAnual } from '../../lib/tipos'
import { euros, NOMBRES_MESES } from '../../lib/formato'
import { Icono } from '../../components/ui/Icono'

type Props = {
  datos: Anual
  desgloseOtros: FilaAnual[]
  onAbrirMes: (anio: number, mes: number) => void
}

/**
 * La vision anual en movil.
 *
 * Una tabla de doce columnas en una pantalla de telefono no se lee: o se
 * encoge hasta ser ilegible o se convierte en un desplazamiento a ciegas. Aqui
 * se invierte: primero se elige un concepto y luego se ven sus doce meses en
 * vertical, que es la pregunta que uno se hace de verdad ("¿cuanto he pagado de
 * luz este año?").
 */
export function VistaConcepto({ datos, desgloseOtros, onAbrirMes }: Props) {
  const [elegida, setElegida] = useState<string | null>(null)

  const todas = [...datos.filas, ...desgloseOtros]
  const fila = todas.find((f) => f.nombre === elegida) ?? null

  if (!fila) {
    return (
      <div className="tarjeta">
        {todas.map((f) => (
          <button
            key={`${f.tipo}-${f.nombre}`}
            className={`fila fila-boton${f.tipo === 'total' ? ' destacada' : ''}`}
            onClick={() => setElegida(f.nombre)}
          >
            <span className="fila-cuerpo">
              <span className="fila-titulo">{f.nombre}</span>
              <span className="fila-detalle dinero">
                {euros(f.total)} · media {euros(f.media)}
              </span>
            </span>
            <Icono nombre="chevron" size={18} />
          </button>
        ))}
      </div>
    )
  }

  return (
    <>
      <button className="boton boton-texto" onClick={() => setElegida(null)}>
        ← Todos los conceptos
      </button>

      <h2 className="titulo">{fila.nombre}</h2>
      <p className="seccion-pista dinero">
        Total {euros(fila.total)} · media mensual {euros(fila.media)}
      </p>

      <div className="tarjeta">
        {datos.meses.map((mes, indice) => {
          const valor = fila.valores[indice]
          return (
            <button
              key={mes.numero}
              className="fila fila-boton"
              disabled={valor === null}
              onClick={() => onAbrirMes(datos.anio, mes.numero)}
            >
              <span className="fila-cuerpo">
                <span className="fila-titulo">{NOMBRES_MESES[mes.numero - 1]}</span>
              </span>
              <span className={`dinero${valor === null ? ' cero' : valor < 0 ? ' negativo' : ''}`}>
                {valor === null ? '—' : euros(valor)}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}
