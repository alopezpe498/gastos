/**
 * Esqueletos de carga.
 *
 * Un girador en medio de la pantalla no dice nada: solo que hay que esperar.
 * Estas piezas dibujan la forma de lo que va a llegar, asi que cuando llegan
 * los datos nada salta de sitio. El brillo que las recorre es deliberadamente
 * lento y de poco contraste; se nota que esta vivo y no molesta.
 */

/** Una barra gris con brillo. El ancho se pasa para que no parezcan iguales. */
const Barra = ({ ancho = '100%', alto = 16 }: { ancho?: string; alto?: number }) => (
  <span className="esqueleto" style={{ width: ancho, height: alto }} />
)

/** Filas de una lista: conceptos, apuntes, meses. */
export function EsqueletoLista({ filas = 6 }: { filas?: number }) {
  const anchos = ['62%', '48%', '72%', '55%', '66%', '44%']
  return (
    <div className="tarjeta esqueleto-lista" aria-hidden="true">
      {Array.from({ length: filas }, (_, i) => (
        <div className="esqueleto-fila-lista" key={i}>
          <Barra ancho={anchos[i % anchos.length]} />
          <Barra ancho="30%" alto={12} />
        </div>
      ))}
    </div>
  )
}

/** El cuadro resumen del mes, con sus cuatro cifras grandes. */
export function EsqueletoResumen() {
  return (
    <div className="resumen-rejilla" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div className="resumen-celda" key={i}>
          <Barra ancho="60%" alto={12} />
          <Barra ancho="80%" alto={28} />
        </div>
      ))}
    </div>
  )
}

/**
 * Aviso accesible de que se esta cargando. Los esqueletos son decorativos
 * (aria-hidden), asi que quien use lector de pantalla necesita esto.
 */
export const AvisoCargando = ({ texto = 'Cargando' }: { texto?: string }) => (
  <span className="solo-lectores" role="status" aria-live="polite">
    {texto}
  </span>
)
