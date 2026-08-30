import { useEffect } from 'react'
import type { Anual, FilaAnual, TotalesAnioAnterior } from '../../lib/tipos'
import { Sparkline } from '../../components/graficos/Graficos'
import { IconoCerrar, IconoDescargar } from '../../components/Iconos'
import { cuantos, euros, MESES_CORTOS, numero, porcentaje } from '../../lib/formato'

/**
 * Informe imprimible.
 *
 * No es una pantalla más: es una hoja. Se abre encima de todo, sin navegación,
 * y `informe.css` se encarga de que al imprimir salga solo esto, en negro sobre
 * blanco y sin cortar las tablas por la mitad. El PDF lo hace el navegador con
 * su propio diálogo, que es lo que ya sabe hacer bien.
 */

type Props = { onCerrar: () => void; children: React.ReactNode; titulo: string }

function Hoja({ onCerrar, children, titulo }: Props) {
  // Escape cierra, como en el resto de capas de la aplicación.
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alPulsar)
    const desbordeAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alPulsar)
      document.body.style.overflow = desbordeAnterior
    }
  }, [onCerrar])

  return (
    <div className="informe-capa" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="informe-barra">
        <button className="boton boton-secundario" onClick={onCerrar}>
          <IconoCerrar size={18} />
          Cerrar
        </button>
        <span className="informe-pista">
          Se imprime solo la hoja. En el diálogo de impresión, elige «Guardar como PDF».
        </span>
        <button className="boton boton-principal" onClick={() => window.print()}>
          <IconoDescargar size={18} />
          Imprimir o guardar en PDF
        </button>
      </div>

      <article className="informe">{children}</article>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Informe de un año
// ---------------------------------------------------------------------------

export function InformeAnual({
  datos,
  anterior,
  onCerrar,
}: {
  datos: Anual
  anterior: TotalesAnioAnterior | null
  onCerrar: () => void
}) {
  const totalDe = (nombre: string) => datos.filas.find((f) => f.nombre === nombre) ?? null
  const gastos = totalDe('Gastos')
  const ingresos = totalDe('Ingresos')
  const ahorro = totalDe('Ahorro')

  const anteriorDe = (fila: FilaAnual): number | null => {
    if (!anterior) return null
    if (fila.tipo === 'total') {
      const g = anterior.generales
      if (!g) return null
      if (fila.nombre === 'Gastos') return g.gastos
      if (fila.nombre === 'Ingresos') return g.ingresos
      if (fila.nombre === 'Ahorro') return g.sobrante
      return null
    }
    return fila.conceptoId === undefined
      ? null
      : (anterior.totales[`concepto:${fila.conceptoId}`] ?? null)
  }

  return (
    <Hoja onCerrar={onCerrar} titulo={`Informe de ${datos.anio}`}>
      <header className="informe-cabecera">
        <h1>{datos.anio}</h1>
        <p className="informe-subtitulo">
          Informe anual · {cuantos(datos.meses.length, 'mes', 'meses')} con datos · generado el{' '}
          {new Date().toLocaleDateString('es-ES')}
        </p>
      </header>

      <section className="informe-seccion">
        <div className="informe-cifras">
          <Cifra etiqueta="Ingresos del año" valor={euros(ingresos?.total ?? null)} />
          <Cifra etiqueta="Gastos del año" valor={euros(gastos?.total ?? null)} />
          <Cifra
            etiqueta="Sobrante"
            valor={euros(ahorro?.total ?? null)}
            clase={(ahorro?.total ?? 0) < 0 ? 'negativo' : 'positivo'}
          />
          <Cifra
            etiqueta="% de ahorro"
            valor={porcentaje(
              ingresos?.total ? ((ahorro?.total ?? 0) / ingresos.total) * 100 : null,
              1,
            )}
          />
        </div>
      </section>

      <section className="informe-seccion">
        <h2>Concepto por mes</h2>
        {/* La tabla del año tiene trece columnas y no cabe en una hoja: se
            desplaza dentro de su marco en vez de salirse del informe. */}
        <div className="informe-marco">
          <table className="informe-tabla informe-matriz">
          <thead>
            <tr>
              <th>Concepto</th>
              {datos.meses.map((mes) => (
                <th key={mes.numero} className="dinero">
                  {MESES_CORTOS[mes.numero - 1]}
                </th>
              ))}
              <th className="dinero">Total</th>
              <th className="dinero">Media</th>
              {anterior ? <th className="dinero">{anterior.anio}</th> : null}
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((fila) => {
              const previo = anteriorDe(fila)
              return (
                <tr key={`${fila.tipo}-${fila.nombre}`} className={fila.tipo === 'total' ? 'informe-total' : ''}>
                  <td className="informe-concepto">
                    {fila.nombre}
                    <Sparkline valores={fila.valores} titulo={`${fila.nombre} en ${datos.anio}`} ancho={60} alto={14} />
                  </td>
                  {fila.valores.map((valor, i) => (
                    <td key={i} className={`dinero${valor !== null && valor < 0 ? ' negativo' : ''}`}>
                      {numero(valor)}
                    </td>
                  ))}
                  <td className="dinero informe-destacado">{numero(fila.total)}</td>
                  <td className="dinero">{numero(fila.media)}</td>
                  {anterior ? <td className="dinero">{previo === null ? '' : numero(previo)}</td> : null}
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </section>
    </Hoja>
  )
}

function Cifra({ etiqueta, valor, clase = '' }: { etiqueta: string; valor: string; clase?: string }) {
  return (
    <div className="informe-cifra">
      <span className="informe-cifra-etiqueta">{etiqueta}</span>
      <strong className={`dinero ${clase}`}>{valor}</strong>
    </div>
  )
}
