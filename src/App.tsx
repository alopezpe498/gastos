import { useCallback, useEffect, useState } from 'react'
import { api, cuandoCaduqueLaSesion, leerToken } from './lib/api'
import { ProveedorAvisos } from './components/ui/Toast'
import { PantallaPin } from './features/auth/PantallaPin'
import { PantallaMes } from './features/mes/PantallaMes'
import { PantallaAnual } from './features/anual/PantallaAnual'
import { PantallaAnalitica } from './features/analitica/PantallaAnalitica'
import { PantallaConceptos } from './features/conceptos/PantallaConceptos'
import { PantallaAjustes, type PestanaAjustes } from './features/ajustes/PantallaAjustes'
import { PantallaImportar, type PestanaImportar } from './features/importar/PantallaImportar'
import { Kit } from './components/ui/Kit'
import { Navegacion } from './components/ui/Navegacion'
import { AvisoArranque } from './components/ui/AvisoArranque'
import { Cargando } from './components/ui/Basicos'

type Pestana = 'mes' | 'anual' | 'analitica' | 'conceptos' | 'importar' | 'ajustes'
type Sesion = 'comprobando' | 'bloqueada' | 'abierta'

/*
 * Análisis ya no es una sección: vive plegado dentro de Mes. Tenerlo aquí
 * mentía sobre su importancia —se mira de vez en cuando, no cada día— y
 * obligaba a salir del mes para entender el mes.
 */
const PESTANAS = [
  { id: 'mes' as const, nombre: 'Mes', icono: 'calendario' as const },
  { id: 'anual' as const, nombre: 'Año', icono: 'barras' as const },
  { id: 'analitica' as const, nombre: 'Analítica', icono: 'tendencia' as const },
  { id: 'conceptos' as const, nombre: 'Conceptos', icono: 'lista' as const },
  { id: 'importar' as const, nombre: 'Importar', icono: 'subir' as const },
  { id: 'ajustes' as const, nombre: 'Ajustes', icono: 'ajustes' as const },
]

export default function App() {
  // La página del kit, solo en desarrollo: es la prueba de que la caja está
  // cerrada, no una pantalla de la aplicación.
  if (import.meta.env.DEV && window.location.hash === '#kit') return <Kit />

  const [sesion, setSesion] = useState<Sesion>('comprobando')
  const [protegido, setProtegido] = useState(false)
  const [pestana, setPestana] = useState<Pestana>('mes')
  // Se incrementa cuando cambia algo que afecta a varias pantallas (el
  // catalogo, los ajustes, una importacion) para que todas recarguen.
  const [version, setVersion] = useState(0)
  // Mes al que hay que saltar desde otra pantalla: al pulsar una celda de la
  // vision anual, o al volver de la analitica.
  const [mesElegido, setMesElegido] = useState<{ anio: number; mes: number } | null>(null)
  // Año al que saltar desde la analítica.
  const [anioElegido, setAnioElegido] = useState<number | null>(null)
  /*
   * Con qué pestaña se entra en Importar y en Ajustes, y con qué mes.
   * Sirve para que un botón lleve al sitio exacto: «Importar extracto» del mes
   * abre Importar > Extracto con ese mes puesto, y «Ver reglas» abre Ajustes >
   * Reglas sin tener que buscarlas.
   */
  const [destinoImportar, setDestinoImportar] = useState<{
    pestana: PestanaImportar
    mesId: number | null
    pedirArchivo: boolean
  }>({ pestana: 'extracto', mesId: null, pedirArchivo: false })
  const [pestanaAjustes, setPestanaAjustes] = useState<PestanaAjustes>('general')

  const refrescarTodo = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    cuandoCaduqueLaSesion(() => setSesion('bloqueada'))
  }, [])

  useEffect(() => {
    const comprobar = async () => {
      try {
        const { protegido: hayPin } = await api<{ protegido: boolean }>('/auth/estado', {
          sinAuth: true,
        })
        setProtegido(hayPin)
        if (!hayPin) {
          setSesion('abierta')
          return
        }
        if (!leerToken()) {
          setSesion('bloqueada')
          return
        }
        const { valido } = await api<{ valido: boolean }>('/auth/comprobar')
        setSesion(valido ? 'abierta' : 'bloqueada')
      } catch {
        // Sin respuesta del servidor se pide el PIN: es lo mas seguro.
        setSesion('bloqueada')
      }
    }
    void comprobar()
  }, [])

  const irAlMes = useCallback((anio: number, mes: number) => {
    setMesElegido({ anio, mes })
    setPestana('mes')
  }, [])

  if (sesion === 'comprobando') return <Cargando />

  if (sesion === 'bloqueada') {
    return (
      <ProveedorAvisos>
        <PantallaPin onDesbloqueado={() => setSesion('abierta')} />
      </ProveedorAvisos>
    )
  }

  return (
    <ProveedorAvisos>
      <div className="pagina">
        {/* Si el servidor arrancó con algo a medias, se dice aquí arriba. */}
        <AvisoArranque />
        <Navegacion secciones={PESTANAS} activa={pestana} onIr={setPestana} />

        {pestana === 'mes' ? (
          <PantallaMes
            key={version}
            mesElegido={mesElegido}
            onCambioDeMes={setMesElegido}
            onBloquear={() => setSesion('bloqueada')}
            onImportarExtracto={(mesId) => {
              setDestinoImportar({ pestana: 'extracto', mesId, pedirArchivo: true })
              setPestana('importar')
            }}

            onFotoDeTicket={(mesId) => {
              setDestinoImportar({ pestana: 'tickets', mesId, pedirArchivo: false })
              setPestana('importar')
            }}
          />
        ) : null}
        {pestana === 'anual' ? (
          <PantallaAnual key={version} onAbrirMes={irAlMes} anioElegido={anioElegido} />
        ) : null}
        {pestana === 'analitica' ? (
          <PantallaAnalitica
            key={version}
            onAbrirMes={irAlMes}
            onAbrirAnio={(anio) => {
              setAnioElegido(anio)
              setPestana('anual')
            }}
          />
        ) : null}
        {/*
          Conceptos no lleva key={version}: se recarga sola y es ella la que
          llama a refrescarTodo. Remontarla cerraria la ficha que acabas de
          guardar, y con ella el aviso de los meses que hay que regenerar.
        */}
        {pestana === 'conceptos' ? (
          <PantallaConceptos onCambioGlobal={refrescarTodo} onIrAMes={irAlMes} />
        ) : null}
        {pestana === 'importar' ? (
          <PantallaImportar
            key={version}
            pestanaInicial={destinoImportar.pestana}
            onCambiarPestana={(p) => setDestinoImportar((d) => ({ ...d, pestana: p }))}
            mesInicial={destinoImportar.mesId}
            pedirArchivo={destinoImportar.pedirArchivo}
            onCambioGlobal={refrescarTodo}
            onVerReglas={() => {
              setPestanaAjustes('reglas')
              setPestana('ajustes')
            }}
          />
        ) : null}
        {pestana === 'ajustes' ? (
          <PantallaAjustes
            key={version}
            pestanaInicial={pestanaAjustes}
            protegido={protegido}
            onBloquear={() => setSesion('bloqueada')}
            onCambioGlobal={refrescarTodo}
          />
        ) : null}

      </div>
    </ProveedorAvisos>
  )
}
