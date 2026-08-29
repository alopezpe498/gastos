import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Clasificacion, Tipo } from '../../lib/tipos'
import { Sheet } from '../../components/Sheet'
import { useAvisos } from '../../components/Avisos'
import { leerImporte } from '../../lib/formato'
import { ETIQUETAS_CLASIFICACION } from './PantallaConceptos'

type Props = {
  /** El tipo con el que se abre; null significa cerrada. */
  tipo: Tipo | null
  onCerrar: () => void
  onCreado: (nombre: string) => Promise<void> | void
}

const TITULOS: Record<Tipo, string> = {
  fijo: 'Nuevo gasto fijo',
  variable: 'Nuevo gasto variable',
  sobre: 'Nuevo sobre',
}

const CLASIFICACIONES: Clasificacion[] = ['necesario', 'prescindible', 'ahorro']

export function SheetNuevoConcepto({ tipo, onCerrar, onCreado }: Props) {
  const { avisarError } = useAvisos()
  const [nombre, setNombre] = useState('')
  const [clasificacion, setClasificacion] = useState<Clasificacion>('prescindible')
  const [dia, setDia] = useState('1')
  const [importe, setImporte] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Cada vez que se abre, el formulario empieza limpio y con la clasificacion
  // que casi siempre acierta para ese tipo.
  useEffect(() => {
    if (!tipo) return
    setNombre('')
    setClasificacion(tipo === 'variable' ? 'prescindible' : 'necesario')
    setDia('1')
    setImporte('')
  }, [tipo])

  if (!tipo) return null

  const crear = async () => {
    const limpio = nombre.trim()
    if (!limpio) return

    setEnviando(true)
    try {
      await api('/conceptos', {
        metodo: 'POST',
        cuerpo: {
          nombre: limpio,
          tipo,
          clasificacion,
          diaPrevisto: tipo === 'fijo' ? dia : null,
          importePrevisto: leerImporte(importe) ?? 0,
        },
      })
      await onCreado(limpio)
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Sheet
      abierta
      titulo={TITULOS[tipo]}
      onCerrar={onCerrar}
      accionDerecha={
        <button className="boton-texto" onClick={() => void crear()} disabled={!nombre.trim() || enviando}>
          {enviando ? 'Creando…' : 'Crear'}
        </button>
      }
    >
      <label className="campo-etiqueta" htmlFor="nuevo-nombre">
        Nombre
      </label>
      <input
        id="nuevo-nombre"
        className="campo"
        autoFocus
        maxLength={60}
        value={nombre}
        placeholder={tipo === 'variable' ? 'Farmacia' : 'Seguro Coche'}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && nombre.trim()) void crear()
        }}
      />

      <p className="campo-etiqueta">Clasificación (regla 50/30/20)</p>
      <div className="segmentado">
        {CLASIFICACIONES.map((valor) => (
          <button
            key={valor}
            className={clasificacion === valor ? 'activo' : ''}
            onClick={() => setClasificacion(valor)}
          >
            {ETIQUETAS_CLASIFICACION[valor]}
          </button>
        ))}
      </div>

      {tipo !== 'variable' ? (
        <div className="rejilla-previsto">
          {tipo === 'fijo' ? (
            <div>
              <label className="campo-etiqueta" htmlFor="nuevo-dia">
                Día previsto
              </label>
              <input
                id="nuevo-dia"
                className="campo"
                value={dia}
                maxLength={20}
                onChange={(e) => setDia(e.target.value)}
              />
            </div>
          ) : null}

          <div>
            <label className="campo-etiqueta" htmlFor="nuevo-importe">
              {tipo === 'sobre' ? 'Presupuesto' : 'Importe previsto'}
            </label>
            <input
              id="nuevo-importe"
              className="campo dinero"
              inputMode="decimal"
              value={importe}
              placeholder="0,00"
              onChange={(e) => setImporte(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      <p className="pista">
        {tipo === 'variable'
          ? 'Los variables se apuntan a mano cada vez; no necesitan importe previsto.'
          : 'Se puede cambiar después, y el cambio valdrá desde el mes que elijas.'}
      </p>
    </Sheet>
  )
}
