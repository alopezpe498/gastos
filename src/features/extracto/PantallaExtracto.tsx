import { useEffect, useRef, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Importacion, Mes, PropuestaExtracto } from '../../lib/tipos'
import { BotonPrimario, BotonTexto, Card, Chip } from '../../components/ui/Basicos'
import { CampoArea } from '../../components/ui/Campos'
import { Dropzone } from '../../components/ui/Dropzone'
import { Fila } from '../../components/ui/Fila'
import { useAvisos } from '../../components/ui/Toast'
import { SelectorDeMes } from '../../components/ui/SelectorDeMes'
import { cuantos, fecha as fechaCorta, NOMBRES_MESES } from '../../lib/formato'
import { RevisionExtracto } from './RevisionExtracto'

/**
 * Importar el extracto del banco.
 *
 * Tres momentos: elegir el mes y el archivo, revisar lo que propone, y aceptar.
 * Nada se guarda hasta el último paso, y una vez guardado se puede deshacer
 * entero desde el historial de abajo.
 */

type Props = {
  meses: Mes[]
  mesPorDefecto?: number | null
  /** Al venir del botón del mes: se abre el selector de archivo sin más. */
  pedirArchivo?: boolean
  onAplicado: () => void
  onVerReglas?: () => void
}

export function PantallaExtracto({
  meses,
  mesPorDefecto,
  pedirArchivo = false,
  onAplicado,
  onVerReglas,
}: Props) {
  const { avisar } = useAvisos()
  const abiertos = meses.filter((m) => m.estado === 'abierto')
  const [mesId, setMesId] = useState<number>(
    mesPorDefecto ?? abiertos[0]?.id ?? meses[0]?.id ?? 0,
  )
  const [cargando, setCargando] = useState(false)
  const [propuesta, setPropuesta] = useState<PropuestaExtracto | null>(null)
  const [pegando, setPegando] = useState(false)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  // Sube al aceptar, deshacer o volver del historial: fuerza a releerlo.
  const [refrescos, setRefrescos] = useState(0)
  const botonArchivo = useRef<HTMLButtonElement>(null)

  const mes = meses.find((m) => m.id === mesId) ?? null
  const cerrado = mes?.estado === 'cerrado'

  /*
   * El desplegable habla de años y meses; aquí se trabaja con ids. Si el mes al
   * que apunta no existe todavía no se cambia nada: importar solo tiene sentido
   * sobre un mes abierto, y abrirlo es una decisión que se toma en Mes.
   */
  const irAlMes = (anio: number, numeroMes: number) => {
    const destino = meses.find((m) => m.anio === anio && m.mes === numeroMes)
    if (destino) setMesId(destino.id)
  }

  /*
   * Al llegar desde el botón del mes, lo único que se quiere es elegir el
   * archivo: el mes ya viene puesto. Se deja el foco en ese botón en vez de
   * abrir el diálogo solo, que los navegadores bloquean si no lo pide un clic.
   */
  useEffect(() => {
    if (pedirArchivo && !cerrado) botonArchivo.current?.focus()
  }, [pedirArchivo, cerrado])

  const enviar = async (cuerpo: Record<string, unknown>) => {
    setCargando(true)
    setError('')
    try {
      const datos = await api<PropuestaExtracto>('/extracto/clasificar', {
        metodo: 'POST',
        cuerpo: { mesId, ...cuerpo },
      })
      if (datos.necesitaAyuda) {
        setError(datos.motivo ?? 'No he reconocido el formato de ese archivo.')
        return
      }
      setPropuesta(datos)
      setPegando(false)
      setTexto('')
    } catch (causa) {
      setError(mensajeDeError(causa))
    } finally {
      setCargando(false)
    }
  }

  const subir = async (fichero: File) => {
    const base64 = await new Promise<string>((resolver, rechazar) => {
      const lector = new FileReader()
      lector.onload = () => resolver(String(lector.result))
      lector.onerror = () => rechazar(new Error('No he podido leer el archivo.'))
      lector.readAsDataURL(fichero)
    })
    await enviar({ archivo: base64, nombreArchivo: fichero.name })
  }

  if (propuesta) {
    return (
      <RevisionExtracto
        propuesta={propuesta}
        nombreMes={mes ? `${NOMBRES_MESES[mes.mes - 1]} ${mes.anio}` : ''}
        onVerHistorial={() => {
          // El historial vive en la pantalla de carga, así que hay que volver.
          // El borrador se tira: no se ha tocado nada todavía.
          void api(`/extracto/${propuesta.importacion.id}`, { metodo: 'DELETE' }).catch(() => {})
          setPropuesta(null)
          setRefrescos((n) => n + 1)
          window.setTimeout(
            () => document.querySelector('[data-historial]')?.scrollIntoView({ behavior: 'smooth' }),
            80,
          )
        }}
        onCancelar={() => {
          void api(`/extracto/${propuesta.importacion.id}`, { metodo: 'DELETE' }).catch(() => {})
          setPropuesta(null)
        }}
        onAplicado={(resumen) => {
          const partes = [
            `${cuantos(resumen.cobrados + resumen.actualizados + resumen.creados, 'fijo')}`,
            `${cuantos(resumen.variables, 'variable')}`,
            `${cuantos(resumen.comida, 'compra')} de comida`,
          ]
          if (resumen.ingreso) partes.push('el ingreso')
          if (resumen.plantillaActualizada > 0) {
            partes.push(`${cuantos(resumen.plantillaActualizada, 'importe')} de la plantilla`)
          }
          avisar(`Importación aplicada: ${partes.join(', ')}.`)
          setPropuesta(null)
          setRefrescos((n) => n + 1)
          onAplicado()
        }}
      />
    )
  }

  return (
    <>
      <Card
        titulo="Extracto del banco"
        ayuda="Sube el archivo del banco y te lo reparte: concilia los fijos, crea los variables y la comida, y te deja solo los que no reconoce. Nada se guarda hasta que lo aceptes, y se puede deshacer entero."
      >
        {/*
          El mes va arriba del todo y con el mismo desplegable que la pantalla
          Mes: es la primera decisión y no puede parecer un detalle.
        */}
        <div className="fila-campos" style={{ marginBottom: 12 }}>
          <span className="card-titulo" style={{ fontSize: 14 }}>
            Mes al que va
          </span>
          {mes ? (
            <SelectorDeMes anio={mes.anio} mes={mes.mes} onIr={irAlMes} />
          ) : (
            <span className="muted">No hay ningún mes abierto todavía</span>
          )}
        </div>

        {cerrado ? (
          <p className="muted" style={{ marginBottom: 12 }}>
            Ese mes está cerrado. Reábrelo desde el menú del mes antes de importar en él.
          </p>
        ) : null}

        <Dropzone
          titulo="Arrastra aquí el archivo del banco"
          texto=".xls, .xlsx o .csv — o si lo prefieres:"
          textoBoton="Elegir archivo"
          accept=".xls,.xlsx,.csv,text/csv"
          cargando={cargando}
          disabled={cerrado}
          onArchivo={(f: File) => void subir(f)}
          extra={
            <BotonTexto icono="nota" disabled={cargando || cerrado} onClick={() => setPegando((p) => !p)}>
              Pegar una tabla
            </BotonTexto>
          }
        />

        {pegando ? (
          <div style={{ marginTop: 12, display: 'grid', gap: 10, justifyItems: 'start' }}>
            <CampoArea
              valor={texto}
              etiqueta="Tabla pegada"
              placeholder="Pega aquí las filas copiadas del banco, con su cabecera."
              filas={8}
              onGuardar={setTexto}
            />
            <BotonPrimario disabled={!texto.trim() || cargando} onClick={() => void enviar({ texto })}>
              Leer lo pegado
            </BotonPrimario>
          </div>
        ) : null}

        {error ? (
          <p className="muted" style={{ marginTop: 12, color: 'var(--comida)' }}>
            {error}
          </p>
        ) : null}

        {onVerReglas ? (
          <p className="muted" style={{ marginTop: 12, textAlign: 'center' }}>
            Lo que reconoce cada movimiento son las reglas.{' '}
            <BotonTexto onClick={onVerReglas}>Ver reglas</BotonTexto>
          </p>
        ) : null}
      </Card>

      <HistorialImportaciones
        mesId={mesId}
        refrescos={refrescos}
        nombreMes={mes ? `${NOMBRES_MESES[mes.mes - 1]} ${mes.anio}` : ''}
        onCambio={() => {
          setRefrescos((n) => n + 1)
          onAplicado()
        }}
      />
    </>
  )
}

/**
 * Lo que ya se importó EN ESTE MES, con el botón de deshacer.
 *
 * Filtrado por el mes elegido arriba: el historial completo, con dos años de
 * importaciones, no ayuda a decidir nada cuando estás subiendo el de agosto.
 */
function HistorialImportaciones({
  mesId,
  refrescos,
  nombreMes,
  onCambio,
}: {
  mesId: number
  /** Cambia al aceptar o deshacer: sin esto el historial se quedaba viejo. */
  refrescos: number
  nombreMes: string
  onCambio: () => void
}) {
  const { avisar, avisarError } = useAvisos()
  const [historial, setHistorial] = useState<Importacion[] | null>(null)
  const [aDeshacer, setADeshacer] = useState<Importacion | null>(null)

  const cargar = async () => {
    try {
      setHistorial(await api<Importacion[]>(`/extracto/historial?mesId=${mesId}`))
    } catch {
      setHistorial([])
    }
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesId, refrescos])

  const deshacer = async () => {
    if (!aDeshacer) return
    const cual = aDeshacer
    setADeshacer(null)
    try {
      const r = await api<{ borrados: number; devueltos: number }>(
        `/extracto/${cual.id}/deshacer`,
        { metodo: 'POST' },
      )
      avisar(
        `Deshecha: ${cuantos(r.borrados, 'apunte')} borrados y ${cuantos(r.devueltos, 'fijo')} de vuelta a pendiente.`,
      )
      await cargar()
      onCambio()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  if (!historial || historial.length === 0) return null

  return (
    <Card titulo={`Importaciones de ${nombreMes || 'este mes'}`}>
      {historial.map((i) =>
        aDeshacer?.id === i.id ? (
          /* La pregunta va en la propia fila: ahí se ve de cuál se trata. */
          <Fila
            key={i.id}
            confirmando
            titulo="¿Deshacer esta importación?"
            importe={
              <span className="fila-campos" style={{ gap: 8, marginLeft: 'auto' }}>
                <BotonPrimario peligro onClick={() => void deshacer()}>
                  Deshacer
                </BotonPrimario>
                <BotonTexto onClick={() => setADeshacer(null)}>Cancelar</BotonTexto>
              </span>
            }
          />
        ) : (
          <Fila
            key={i.id}
            titulo={i.nombreArchivo ?? 'Sin nombre'}
            detalle={
              `${fechaCorta(i.fecha.slice(0, 10))} · ${cuantos(i.conteos.movimientos, 'movimiento')}` +
              (i.estado === 'aceptada'
                ? ` · ${i.conteos.fijos} fijos, ${i.conteos.variables} variables`
                : '')
            }
            centro={i.estado !== 'aceptada' ? <Chip>{i.estado}</Chip> : null}
            importe={
              i.estado === 'aceptada' ? (
                <span style={{ marginLeft: 'auto' }}>
                  <BotonTexto onClick={() => setADeshacer(i)}>Deshacer</BotonTexto>
                </span>
              ) : undefined
            }
          />
        ),
      )}
      <p className="muted-3" style={{ marginTop: 8 }}>
        Deshacer borra los apuntes que creó y devuelve los fijos a pendiente con su importe
        previsto. Las reglas aprendidas se quedan.
      </p>
    </Card>
  )
}
