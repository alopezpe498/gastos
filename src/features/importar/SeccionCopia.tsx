import { useEffect, useState } from 'react'
import { api, descargar, mensajeDeError } from '../../lib/api'
import { useAvisos } from '../../components/Avisos'
import { IconoDescargar } from '../../components/Iconos'

/**
 * Copia de seguridad.
 *
 * Está en Importar y no en Ajustes porque es una acción, no una preferencia:
 * se pulsa y pasa algo. En Ajustes solo vive lo que se configura una vez.
 */
export function SeccionCopia() {
  const { avisarError } = useAvisos()
  const [anios, setAnios] = useState<number[]>([])
  const [descargando, setDescargando] = useState('')

  useEffect(() => {
    void api<number[]>('/anual')
      .then(setAnios)
      .catch(() => setAnios([]))
  }, [])

  const bajar = async (ruta: string, nombre: string, etiqueta: string) => {
    setDescargando(etiqueta)
    try {
      await descargar(ruta, nombre)
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setDescargando('')
    }
  }

  return (
    <section className="seccion">
      <h3 className="seccion-titulo">Copia de seguridad</h3>
      <p className="seccion-pista">
        El JSON lleva todo: conceptos, plantillas, meses y apuntes. El Excel usa el mismo formato
        que tus hojas de siempre, así que se puede volver a importar aquí.
      </p>

      <div className="tarjeta">
        <button
          className="fila fila-boton"
          disabled={descargando !== ''}
          onClick={() => void bajar('/exportar/json', 'gastos.json', 'json')}
        >
          <span className="fila-cuerpo">
            <span className="fila-titulo">
              {descargando === 'json' ? 'Preparando…' : 'Descargar todo en JSON'}
            </span>
            <span className="fila-detalle">La copia completa de la base de datos.</span>
          </span>
          <IconoDescargar size={20} />
        </button>

        <button
          className="fila fila-boton"
          disabled={descargando !== '' || anios.length === 0}
          onClick={() => void bajar('/exportar/excel', 'gastos.xlsx', 'excel')}
        >
          <span className="fila-cuerpo">
            <span className="fila-titulo">
              {descargando === 'excel' ? 'Preparando…' : 'Descargar en Excel'}
            </span>
            <span className="fila-detalle">
              {anios.length === 0
                ? 'Todavía no hay ningún año que exportar.'
                : `Una hoja por año: ${anios.slice().sort().join(', ')}.`}
            </span>
          </span>
          <IconoDescargar size={20} />
        </button>
      </div>
    </section>
  )
}
