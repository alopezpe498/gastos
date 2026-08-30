import { useCallback, useEffect, useState } from 'react'
import { api, mensajeDeError, olvidarToken } from '../../lib/api'
import type { Ajustes, Concepto, ConfigIa } from '../../lib/tipos'
import { Cabecera, ErrorLinea } from '../../components/Basicos'
import { EsqueletoLista } from '../../components/Esqueleto'
import { IconoCandado } from '../../components/Iconos'
import { SeccionCalculo } from './SeccionCalculo'
import { SeccionIa } from './SeccionIa'
import { SeccionReglas } from './SeccionReglas'
import { SeccionFormatoBanco } from './SeccionFormatoBanco'

/**
 * Ajustes: SOLO lo que se configura.
 *
 * Todo lo que era una acción —importar el extracto, el Excel, las copias— se ha
 * ido a la pantalla Importar. Aquí queda lo que se toca una vez y se olvida, y
 * por eso va en pestañas: son cuatro asuntos que no tienen nada que ver entre
 * sí y no hay motivo para leerlos todos seguidos.
 */

export type PestanaAjustes = 'general' | 'ia' | 'reglas' | 'formato'

const PESTANAS: { id: PestanaAjustes; nombre: string }[] = [
  { id: 'general', nombre: 'General' },
  { id: 'ia', nombre: 'Inteligencia artificial' },
  { id: 'reglas', nombre: 'Reglas de clasificación' },
  { id: 'formato', nombre: 'Formato del banco' },
]

type Props = {
  protegido: boolean
  onBloquear: () => void
  onCambioGlobal: () => void
  /** Con qué pestaña se entra: «Ver reglas» llega directo a las reglas. */
  pestanaInicial?: PestanaAjustes
}

export function PantallaAjustes({
  protegido,
  onBloquear,
  onCambioGlobal,
  pestanaInicial = 'general',
}: Props) {
  const [pestana, setPestana] = useState<PestanaAjustes>(pestanaInicial)
  const [ajustes, setAjustes] = useState<Ajustes | null>(null)
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [configIa, setConfigIa] = useState<ConfigIa | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [config, catalogo, ia] = await Promise.all([
        api<Ajustes>('/config'),
        api<Concepto[]>('/conceptos'),
        api<ConfigIa>('/config/ia'),
      ])
      setAjustes(config)
      setConceptos(catalogo)
      setConfigIa(ia)
    } catch (causa) {
      setError(mensajeDeError(causa))
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => setPestana(pestanaInicial), [pestanaInicial])

  const pestanas = (
    <div className="pestanas">
      {PESTANAS.map((p) => (
        <button
          key={p.id}
          className={pestana === p.id ? 'activo' : ''}
          onClick={() => setPestana(p.id)}
        >
          {p.nombre}
        </button>
      ))}
    </div>
  )

  if (error) {
    return (
      <>
        <Cabecera titulo="Ajustes" debajo={pestanas} />
        <div className="limite">
          <ErrorLinea mensaje={error} onReintentar={() => void cargar()} />
        </div>
      </>
    )
  }

  if (!ajustes) {
    return (
      <>
        <Cabecera titulo="Ajustes" debajo={pestanas} />
        <div className="limite">
          <EsqueletoLista filas={6} />
        </div>
      </>
    )
  }

  return (
    <>
      <Cabecera titulo="Ajustes" debajo={pestanas} />

      <div className="limite">
        {/*
          En dos columnas, como los bloques de Mes: son cuatro cosas pequeñas y
          en una sola columna la página se hacía interminable.
        */}
        {pestana === 'general' ? (
          <div className="rejilla-ajustes">
            <SeccionCalculo
              ajustes={ajustes}
              conceptos={conceptos}
              onGuardado={(nuevos) => {
                setAjustes(nuevos)
                // Los porcentajes y el criterio de la comida cambian lo que
                // enseñan el mes, el análisis y la tabla anual.
                onCambioGlobal()
              }}
            />

            <section className="seccion tarjeta">
              <h3 className="seccion-titulo">PIN de la familia</h3>
              {protegido ? (
                <>
                  <p className="seccion-pista">
                    La aplicación pide el PIN al entrar. Se cambia en el servidor, en la variable{' '}
                    <code>APP_PIN</code> de <code>ecosystem.config.cjs</code>.
                  </p>
                  <button
                    className="boton boton-secundario"
                    onClick={() => {
                      olvidarToken()
                      onBloquear()
                    }}
                  >
                    <IconoCandado size={18} />
                    Bloquear ahora
                  </button>
                </>
              ) : (
                <p className="pista aviso">
                  La aplicación está funcionando <strong>sin PIN</strong>. Define{' '}
                  <code>APP_PIN</code> en el servidor para protegerla.
                </p>
              )}
            </section>
          </div>
        ) : null}

        {pestana === 'ia' ? <SeccionIa config={configIa} onCambio={setConfigIa} /> : null}

        {pestana === 'reglas' ? <SeccionReglas conceptos={conceptos} /> : null}

        {pestana === 'formato' ? <SeccionFormatoBanco /> : null}

        <p className="pie-version">Gastos · fase 3</p>
      </div>
    </>
  )
}
