import { useCallback, useEffect, useState } from 'react'
import { api, cuandoCaduqueLaSesion, leerToken } from './lib/api'
import { Cargando } from './components/Basicos'
import { ProveedorAvisos } from './components/Avisos'
import {
  IconoAjustes,
  IconoCalendario,
  IconoEtiquetas,
  IconoSubir,
  IconoTabla,
  IconoTendencia,
} from './components/Iconos'
import { PantallaPin } from './features/auth/PantallaPin'
import { PantallaMes } from './features/mes/PantallaMes'
import { PantallaAnual } from './features/anual/PantallaAnual'
import { PantallaAnalitica } from './features/analitica/PantallaAnalitica'
import { PantallaConceptos } from './features/conceptos/PantallaConceptos'
import { PantallaAjustes, type PestanaAjustes } from './features/ajustes/PantallaAjustes'
import { PantallaImportar, type PestanaImportar } from './features/importar/PantallaImportar'
import { BarraSuperior, BarraInferior } from './components/Navegacion'

type Pestana = 'mes' | 'anual' | 'analitica' | 'conceptos' | 'importar' | 'ajustes'
type Sesion = 'comprobando' | 'bloqueada' | 'abierta'

/*
 * Análisis ya no es una sección: vive plegado dentro de Mes. Tenerlo aquí
 * mentía sobre su importancia —se mira de vez en cuando, no cada día— y
 * obligaba a salir del mes para entender el mes.
 */
const PESTANAS = [
  { id: 'mes' as const, nombre: 'Mes', icono: IconoCalendario },
  { id: 'anual' as const, nombre: 'Año', icono: IconoTabla },
  { id: 'analitica' as const, nombre: 'Analítica', icono: IconoTendencia, enMovil: false },
  { id: 'conceptos' as const, nombre: 'Conceptos', icono: IconoEtiquetas },
  { id: 'importar' as const, nombre: 'Importar', icono: IconoSubir },
  { id: 'ajustes' as const, nombre: 'Ajustes', icono: IconoAjustes, enMovil: false },
]

export default function App() {
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
        <BarraSuperior secciones={PESTANAS} activa={pestana} onIr={setPestana} />

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

        <BarraInferior secciones={PESTANAS} activa={pestana} onIr={setPestana} />
      </div>
    </ProveedorAvisos>
  )
}
