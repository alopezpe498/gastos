import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { ConfigIa, PruebaIa } from '../../lib/tipos'
import { useAvisos } from '../../components/Avisos'
import { IconoAviso, IconoChispa, IconoComprobado } from '../../components/Iconos'

const MODELOS_SUGERIDOS: Record<ConfigIa['proveedor'], string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
}

type Props = {
  config: ConfigIa | null
  onCambio: (config: ConfigIa) => void
}

/**
 * Configuración de la IA.
 *
 * La clave vive solo en el servidor: aquí nunca se ve entera, solo enmascarada.
 * Todo lo que la usa (sugerir conceptos al importar, leer una foto, leer un
 * texto pegado) es opcional: sin clave, la aplicación funciona igual, solo que
 * sin sugerencias.
 */
export function SeccionIa({ config, onCambio }: Props) {
  const { avisar, avisarError } = useAvisos()
  const [proveedor, setProveedor] = useState<ConfigIa['proveedor']>('anthropic')
  const [modelo, setModelo] = useState('')
  const [clave, setClave] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [probando, setProbando] = useState(false)
  const [prueba, setPrueba] = useState<PruebaIa | null>(null)

  useEffect(() => {
    if (!config) return
    setProveedor(config.proveedor)
    setModelo(config.modelo)
    setClave('')
  }, [config])

  const cambiarProveedor = (nuevo: ConfigIa['proveedor']) => {
    setProveedor(nuevo)
    setPrueba(null)
    // Al cambiar de proveedor se propone su modelo habitual, salvo que haya uno
    // escrito a mano que no sea el sugerido del otro.
    if (!modelo || modelo === MODELOS_SUGERIDOS.anthropic || modelo === MODELOS_SUGERIDOS.openai) {
      setModelo(MODELOS_SUGERIDOS[nuevo])
    }
  }

  const guardar = async () => {
    setGuardando(true)
    setPrueba(null)
    try {
      const actualizada = await api<ConfigIa>('/config/ia', {
        metodo: 'PUT',
        // La clave solo se manda si se ha escrito una nueva.
        cuerpo: { proveedor, modelo, ...(clave.trim() ? { clave: clave.trim() } : {}) },
      })
      onCambio(actualizada)
      setClave('')
      avisar('Configuración de IA guardada.')
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setGuardando(false)
    }
  }

  const probar = async () => {
    setProbando(true)
    setPrueba(null)
    try {
      setPrueba(await api<PruebaIa>('/config/ia/probar', { metodo: 'POST' }))
    } catch (causa) {
      setPrueba({ ok: false, proveedor, modelo, mensaje: mensajeDeError(causa) })
    } finally {
      setProbando(false)
    }
  }

  const olvidar = async () => {
    try {
      onCambio(await api<ConfigIa>('/config/ia/clave', { metodo: 'DELETE' }))
      setPrueba(null)
      avisar('Clave borrada del servidor.')
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  return (
    <section className="bloque">
      <h3 className="seccion-titulo">Inteligencia artificial</h3>
      <p className="seccion-pista">
        Opcional. Sirve para proponer a qué concepto va cada línea al importar, y para leer una
        foto de un ticket o una captura pegada. Sin clave, todo lo demás funciona igual.
      </p>

      <p className="campo-etiqueta">Proveedor</p>
      <div className="segmentado">
        <button
          className={proveedor === 'anthropic' ? 'activo' : ''}
          onClick={() => cambiarProveedor('anthropic')}
        >
          Anthropic
        </button>
        <button
          className={proveedor === 'openai' ? 'activo' : ''}
          onClick={() => cambiarProveedor('openai')}
        >
          OpenAI
        </button>
      </div>

      <label className="campo-etiqueta" htmlFor="ia-modelo">
        Modelo
      </label>
      <input
        id="ia-modelo"
        className="campo"
        value={modelo}
        onChange={(e) => setModelo(e.target.value)}
        placeholder={MODELOS_SUGERIDOS[proveedor]}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <label className="campo-etiqueta" htmlFor="ia-clave">
        Clave de API
      </label>
      <input
        id="ia-clave"
        className="campo"
        value={clave}
        onChange={(e) => setClave(e.target.value)}
        placeholder={config?.configurada ? config.claveEnmascarada : 'Pega aquí tu clave'}
        type="password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <p className="pista">
        {config?.configurada
          ? 'Ya hay una clave guardada. Déjalo en blanco para conservarla.'
          : 'La clave se guarda en el servidor y nunca se envía al navegador.'}
      </p>

      <div className="fila-campos">
        <button
          className="boton boton-principal"
          onClick={() => void guardar()}
          disabled={guardando}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          className="boton boton-secundario"
          onClick={() => void probar()}
          disabled={probando || !config?.configurada}
        >
          <IconoChispa size={18} />
          {probando ? 'Probando…' : 'Probar conexión'}
        </button>
      </div>

      {prueba ? (
        <p className={`banda-aviso${prueba.ok ? ' bien' : ''}`} role="status">
          {prueba.ok ? <IconoComprobado size={18} /> : <IconoAviso size={18} />}
          <span>{prueba.mensaje}</span>
        </p>
      ) : null}

      {config?.configurada ? (
        <button className="boton boton-texto peligro" onClick={() => void olvidar()}>
          Borrar la clave guardada
        </button>
      ) : null}

      <p className="pista">Esta configuración la comparten todos los dispositivos.</p>
    </section>
  )
}
