import { useCallback, useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Mes, PropuestaTicket, Ticket } from '../../lib/tipos'
import { BotonPrimario, BotonTexto, Card, ErrorLinea, Vacio } from '../../components/ui/Basicos'
import { CampoArea } from '../../components/ui/Campos'
import { Dropzone } from '../../components/ui/Dropzone'
import { Fila } from '../../components/ui/Fila'
import { SelectorDeMes } from '../../components/ui/SelectorDeMes'
import { useAvisos } from '../../components/ui/Toast'
import { euros, fechaCorta } from '../../lib/formato'
import { RevisionTicket } from './RevisionTicket'

/**
 * Tickets de la compra: la foto entra por aquí.
 *
 * Un ticket del súper es un movimiento del sobre Comida con su total, como
 * siempre; lo que se añade es lo que hay dentro. Por eso esto vive en Importar
 * y no en un sitio aparte: es una forma más de meter datos, no otra aplicación.
 *
 * Nada se guarda al subir el archivo: lo que sale de aquí es una propuesta que
 * pasa por la pantalla de revisión, igual que el extracto del banco.
 */

type Props = {
  meses: Mes[]
  mesInicial?: number | null
  onCambioGlobal: () => void
}

const MAX_MB = 20

/** Lee un archivo a base64, que es como viaja hasta el servidor. */
function comoBase64(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(String(lector.result ?? ''))
    lector.onerror = () => rechazar(new Error('No he podido leer el archivo.'))
    lector.readAsDataURL(archivo)
  })
}

export function SeccionTickets({ meses, mesInicial = null, onCambioGlobal }: Props) {
  const { avisar, avisarError } = useAvisos()
  const [mesId, setMesId] = useState<number | null>(mesInicial ?? meses[0]?.id ?? null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [propuesta, setPropuesta] = useState<PropuestaTicket | null>(null)
  const [historial, setHistorial] = useState<Ticket[] | null>(null)
  const [pegando, setPegando] = useState(false)
  const [texto, setTexto] = useState('')

  const mes = meses.find((m) => m.id === mesId) ?? null
  const cerrado = mes?.estado === 'cerrado'

  /* El desplegable habla de años y meses; aquí se trabaja con ids. */
  const irAlMes = (anio: number, numeroMes: number) => {
    const destino = meses.find((m) => m.anio === anio && m.mes === numeroMes)
    if (destino) setMesId(destino.id)
  }

  const cargarHistorial = useCallback(async () => {
    try {
      setHistorial(await api<Ticket[]>('/tickets'))
    } catch {
      setHistorial([])
    }
  }, [])

  useEffect(() => {
    void cargarHistorial()
  }, [cargarHistorial])

  const subir = async (cuerpo: Record<string, unknown>) => {
    if (!mesId) {
      setError('Elige antes en qué mes va el ticket.')
      return
    }
    setCargando(true)
    setError('')
    try {
      setPropuesta(await api<PropuestaTicket>('/tickets', { metodo: 'POST', cuerpo: { mesId, ...cuerpo } }))
    } catch (causa) {
      setError(mensajeDeError(causa))
    } finally {
      setCargando(false)
    }
  }

  const conArchivo = async (archivo: File) => {
    if (archivo.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo pesa más de ${MAX_MB} MB.`)
      return
    }
    const datos = await comoBase64(archivo)
    const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name)
    await subir(esPdf ? { pdf: datos } : { imagen: datos, tipoImagen: archivo.type || 'image/jpeg' })
  }

  if (propuesta) {
    return (
      <RevisionTicket
        propuesta={propuesta}
        onCancelar={() => setPropuesta(null)}
        onGuardado={(resumen) => {
          setPropuesta(null)
          void cargarHistorial()
          onCambioGlobal()
          avisar(`Ticket guardado · ${resumen.lineas} líneas`, {
            deshacer: async () => {
              try {
                await api(`/tickets/${resumen.ticketId}`, {
                  metodo: 'DELETE',
                  cuerpo: { borrarMovimiento: resumen.movimientoCreado },
                })
                void cargarHistorial()
                onCambioGlobal()
              } catch (causa) {
                avisarError(mensajeDeError(causa))
              }
            },
          })
        }}
      />
    )
  }

  return (
    <div className="pila">
      <Card
        titulo="Ticket de la compra"
        ayuda="La foto del ticket del súper. Se guarda un solo apunte con el total, y debajo, en qué se ha ido."
        derecha={
          <span className="fila-campos">
            <span className="muted">Mes</span>
            {mes ? (
              <SelectorDeMes anio={mes.anio} mes={mes.mes} onIr={irAlMes} />
            ) : (
              <span className="muted">No hay ningún mes abierto</span>
            )}
          </span>
        }
      >
        {cerrado ? (
          <p className="muted" style={{ marginBottom: 12 }}>
            Ese mes está cerrado. Reábrelo desde el menú del mes antes de meterle un ticket.
          </p>
        ) : null}

        <Dropzone
          titulo="Arrastra aquí la foto del ticket"
          texto={`Imagen o PDF, hasta ${MAX_MB} MB — o si lo prefieres:`}
          textoBoton="Elegir archivo"
          accept="image/*,application/pdf"
          cargando={cargando}
          disabled={!mesId || cerrado}
          onArchivo={(f: File) => void conArchivo(f)}
          extra={
            /*
              Algunos tickets llegan como texto: el del súper que se manda por
              correo, o el que se copia de la app de la cadena. Leer ese texto
              sale más exacto que fotografiar la pantalla y gasta mucho menos.
            */
            <BotonTexto
              icono="nota"
              disabled={cargando || cerrado}
              onClick={() => setPegando((p) => !p)}
            >
              Pegar el ticket
            </BotonTexto>
          }
        />

        {pegando ? (
          <div style={{ marginTop: 12, display: 'grid', gap: 10, justifyItems: 'start' }}>
            <CampoArea
              valor={texto}
              etiqueta="Ticket pegado"
              placeholder="Pega aquí las líneas del ticket, con su total."
              filas={8}
              onGuardar={setTexto}
            />
            <BotonPrimario
              disabled={!texto.trim() || cargando}
              onClick={() => void subir({ texto })}
            >
              Leer lo pegado
            </BotonPrimario>
          </div>
        ) : null}
        {error ? <ErrorLinea mensaje={error} /> : null}
      </Card>

      <Card titulo="Tickets guardados" ayuda="Cada uno con las líneas que se le leyeron.">
        {historial === null ? null : historial.length === 0 ? (
          <Vacio frase="Todavía no has guardado ningún ticket." />
        ) : (
          historial.map((t) => (
            <Fila
              key={t.id}
              titulo={t.tienda ?? 'Sin tienda'}
              detalle={`${t.fechaHora ? fechaCorta(t.fechaHora.slice(0, 10)) : 'sin fecha'} · ${t.nLineas} líneas`}
              importe={<span className="amt">{euros(t.total)}</span>}
              acciones={
                <BotonTexto
                  peligro
                  onClick={async () => {
                    try {
                      await api(`/tickets/${t.id}`, { metodo: 'DELETE' })
                      void cargarHistorial()
                      onCambioGlobal()
                      avisar('Ticket borrado')
                    } catch (causa) {
                      avisarError(mensajeDeError(causa))
                    }
                  }}
                >
                  Borrar
                </BotonTexto>
              }
            />
          ))
        )}
      </Card>
    </div>
  )
}
