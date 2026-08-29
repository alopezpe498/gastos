import { useCallback, useEffect, useState } from 'react'
import { api, descargar, mensajeDeError, olvidarToken } from '../../lib/api'
import type { Ajustes, Concepto, ConfigIa, Mes } from '../../lib/tipos'
import { Cabecera, ErrorLinea } from '../../components/Basicos'
import { EsqueletoLista } from '../../components/Esqueleto'
import { useAvisos } from '../../components/Avisos'
import { IconoCandado, IconoDescargar } from '../../components/Iconos'
import { SeccionImportar } from './SeccionImportar'
import { SeccionCalculo } from './SeccionCalculo'
import { SeccionIa } from './SeccionIa'
import { SeccionReglas } from './SeccionReglas'
import { PantallaExtracto } from '../extracto/PantallaExtracto'

type Props = {
  protegido: boolean
  onBloquear: () => void
  onCambioGlobal: () => void
}

export function PantallaAjustes({ protegido, onBloquear, onCambioGlobal }: Props) {
  const { avisar, avisarError } = useAvisos()
  const [ajustes, setAjustes] = useState<Ajustes | null>(null)
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [anios, setAnios] = useState<number[]>([])
  const [meses, setMeses] = useState<Mes[]>([])
  const [configIa, setConfigIa] = useState<ConfigIa | null>(null)
  const [error, setError] = useState('')
  const [descargando, setDescargando] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [config, catalogo, lista, ia, losMeses] = await Promise.all([
        api<Ajustes>('/config'),
        api<Concepto[]>('/conceptos'),
        api<number[]>('/anual'),
        api<ConfigIa>('/config/ia'),
        api<Mes[]>('/meses'),
      ])
      setAjustes(config)
      setConceptos(catalogo)
      setAnios(lista)
      setConfigIa(ia)
      setMeses(losMeses)
    } catch (causa) {
      setError(mensajeDeError(causa))
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const bajar = async (ruta: string, nombre: string, etiqueta: string) => {
    setDescargando(etiqueta)
    try {
      await descargar(ruta, nombre)
      avisar('Descarga preparada.')
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setDescargando('')
    }
  }

  if (error) {
    return (
      <>
        <Cabecera titulo="Ajustes" />
        <div className="limite">
          <ErrorLinea mensaje={error} onReintentar={() => void cargar()} />
        </div>
      </>
    )
  }

  if (!ajustes) {
    return (
      <>
        <Cabecera titulo="Ajustes" />
        <div className="limite">
          <EsqueletoLista filas={6} />
        </div>
      </>
    )
  }

  return (
    <>
      <Cabecera titulo="Ajustes" />

      <div className="limite">
        <SeccionCalculo ajustes={ajustes} conceptos={conceptos} onGuardado={(nuevos) => {
          setAjustes(nuevos)
          // Los porcentajes y el criterio de la comida cambian lo que ensenan
          // el mes, el analisis y la tabla anual: hay que refrescarlo todo.
          onCambioGlobal()
        }} />

        <SeccionIa config={configIa} onCambio={setConfigIa} />

        <SeccionReglas conceptos={conceptos} />

        <PantallaExtracto
          meses={meses}
          onAplicado={() => {
            void cargar()
            onCambioGlobal()
          }}
        />

        <SeccionImportar
          onImportado={() => {
            void cargar()
            onCambioGlobal()
          }}
        />

        {/* ---------- exportar ---------- */}
        <section className="bloque">
          <h3 className="seccion-titulo">Copia de seguridad</h3>
          <p className="seccion-pista">
            El JSON lleva todo: conceptos, plantillas, meses y apuntes. El Excel usa el mismo
            formato que tus hojas de siempre, así que se puede volver a importar aquí.
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

        {/* ---------- PIN ---------- */}
        <section className="bloque">
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
              La aplicación está funcionando <strong>sin PIN</strong>. Define <code>APP_PIN</code>{' '}
              en el servidor para protegerla.
            </p>
          )}
        </section>

        <p className="pie-version">Gastos · fase 1</p>
      </div>
    </>
  )
}
