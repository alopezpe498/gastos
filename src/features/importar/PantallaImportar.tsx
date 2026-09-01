import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Mes } from '../../lib/tipos'
import { Cabecera, ErrorLinea, Esqueleto, Tabs } from '../../components/ui/Basicos'
import { PantallaExtracto } from '../extracto/PantallaExtracto'
import { SeccionImportar } from './SeccionImportar'
import { SeccionTickets } from '../tickets/SeccionTickets'
import { SeccionCopia } from './SeccionCopia'

/**
 * Importar y exportar: todo lo que es una ACCIÓN, no una preferencia.
 *
 * Vivía dentro de Ajustes, mezclado con la configuración, y Ajustes se había
 * convertido en una página interminable donde para llegar a lo de todos los
 * meses —subir el extracto— había que pasar por delante de cosas que se tocan
 * una vez al año.
 */

export type PestanaImportar = 'extracto' | 'tickets' | 'excel' | 'copia'

const PESTANAS: { id: PestanaImportar; nombre: string }[] = [
  { id: 'extracto', nombre: 'Extracto del banco' },
  { id: 'tickets', nombre: 'Tickets' },
  { id: 'excel', nombre: 'Excel histórico' },
  { id: 'copia', nombre: 'Copia de seguridad' },
]

type Props = {
  /** Con qué pestaña se entra. Por defecto, el extracto: es lo de cada mes. */
  pestanaInicial?: PestanaImportar
  /** Mes ya elegido al venir desde la pantalla del mes. */
  mesInicial?: number | null
  /** Si se entra desde el botón del mes, el archivo se pide sin más rodeos. */
  pedirArchivo?: boolean
  onCambioGlobal: () => void
  /*
   * La pestaña la sabe quien está arriba. Guardar un ticket refresca la
   * aplicación entera y esto se vuelve a montar: sin decirlo fuera, se
   * volvería al extracto justo después de guardar, con el aviso de deshacer
   * hablando de algo que ya no se ve.
   */
  onCambiarPestana?: (pestana: PestanaImportar) => void
  onVerReglas: () => void
}

export function PantallaImportar({
  pestanaInicial = 'extracto',
  mesInicial = null,
  pedirArchivo = false,
  onCambioGlobal,
  onCambiarPestana,
  onVerReglas,
}: Props) {
  const [pestana, setPestana] = useState<PestanaImportar>(pestanaInicial)
  const [meses, setMeses] = useState<Mes[] | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      setMeses(await api<Mes[]>('/meses'))
    } catch (causa) {
      setError(mensajeDeError(causa))
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  /*
   * El mes que se propone: EL EN CURSO.
   *
   * Se decide aquí y no en cada pestaña para que el extracto y los tickets
   * propongan lo mismo. Antes cada una cogía «el último abierto», que es el
   * más nuevo de la lista: en septiembre proponía agosto si septiembre aún no
   * estaba abierto, y octubre si alguien se había adelantado a abrirlo.
   *
   * Si el mes de hoy no existe todavía se cae en el más reciente que sí: un
   * mes se abre desde Mes, no importando algo en él.
   */
  const mesPropuesto = useMemo(() => {
    if (mesInicial) return mesInicial
    if (!meses || meses.length === 0) return null
    const hoy = new Date()
    const enCurso = meses.find(
      (m) => m.anio === hoy.getFullYear() && m.mes === hoy.getMonth() + 1,
    )
    const abiertos = meses.filter((m) => m.estado === 'abierto')
    return (enCurso ?? abiertos[0] ?? meses[0]).id
  }, [meses, mesInicial])

  // Al entrar desde el botón del mes, la pestaña y el mes vienen dados.
  useEffect(() => setPestana(pestanaInicial), [pestanaInicial])

  return (
    <>
      <Cabecera
        titulo="Importar"
        debajo={
          <Tabs
            pestanas={PESTANAS}
            activa={pestana}
            onCambiar={(p) => {
              setPestana(p)
              onCambiarPestana?.(p)
            }}
          />
        }
      />

      <div className="pila">
        {error ? <ErrorLinea mensaje={error} onReintentar={() => void cargar()} /> : null}

        {pestana === 'extracto' ? (
          meses === null ? (
            <Esqueleto filas={5} />
          ) : (
            <PantallaExtracto
              meses={meses}
              mesPorDefecto={mesPropuesto}
              pedirArchivo={pedirArchivo}
              onVerReglas={onVerReglas}
              onAplicado={() => {
                void cargar()
                onCambioGlobal()
              }}
            />
          )
        ) : null}

        {pestana === 'tickets' ? (
          <SeccionTickets
            meses={meses ?? []}
            mesInicial={mesPropuesto}
            onCambioGlobal={onCambioGlobal}
          />
        ) : null}

        {pestana === 'excel' ? (
          <SeccionImportar
            onImportado={() => {
              void cargar()
              onCambioGlobal()
            }}
          />
        ) : null}

        {pestana === 'copia' ? <SeccionCopia /> : null}
      </div>
    </>
  )
}
