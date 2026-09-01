import { useCallback, useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Mes, PropuestaTicket, Ticket } from '../../lib/tipos'
import { BotonPrimario, BotonTexto, Card, ErrorLinea, Vacio } from '../../components/ui/Basicos'
import { CampoArea, CampoFecha, CampoTexto } from '../../components/ui/Campos'
import { Dropzone } from '../../components/ui/Dropzone'
import { Fila } from '../../components/ui/Fila'
import { SelectorDeMes } from '../../components/ui/SelectorDeMes'
import { useAvisos } from '../../components/ui/Toast'
import { euros, fechaCorta, hoyIso } from '../../lib/formato'
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
  const [aMano, setAMano] = useState(false)
  const [tienda, setTienda] = useState('')
  const [fecha, setFecha] = useState(hoyIso())

  /*
   * La fecha que se propone: hoy si hoy cae en el mes elegido, y si no el día 1
   * de ese mes. Poner «1 de septiembre» en un ticket de octubre confunde al que
   * lo escribe y descoloca la comparación con el apunte del banco.
   */
  /*
   * El calendario no deja salirse del mes al que va el ticket: apuntarlo en
   * octubre con fecha de marzo descoloca la comparación con el apunte del
   * banco y no hay forma de darse cuenta después.
   */
  const primerDiaDelMes = (elegido: Mes) =>
    `${elegido.anio}-${String(elegido.mes).padStart(2, '0')}-01`

  const ultimoDiaDelMes = (elegido: Mes) => {
    const dias = new Date(elegido.anio, elegido.mes, 0).getDate()
    return `${elegido.anio}-${String(elegido.mes).padStart(2, '0')}-${dias}`
  }

  const fechaDentroDelMes = (elegido: Mes | null) => {
    if (!elegido) return hoyIso()
    const hoy = hoyIso()
    const clave = `${elegido.anio}-${String(elegido.mes).padStart(2, '0')}`
    return hoy.startsWith(clave) ? hoy : `${clave}-01`
  }
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

  /**
   * Arranca la revisión con un ticket en blanco.
   *
   * No pasa por el servidor porque no hay nada que leer: es la misma pantalla
   * de siempre, con cero líneas y el total a cero. Se escriben las cosas y el
   * total sale de sumarlas, que es justo lo que se sabe cuando se ha perdido
   * el papel: lo que compraste, no el número de abajo.
   */
  const empezarAMano = () => {
    if (!mes) return
    setPropuesta({
      mes: { id: mes.id, anio: mes.anio, mes: mes.mes, nombreMes: mes.nombreMes ?? '' },
      cabecera: {
        tienda: tienda.trim(),
        direccion: null,
        fechaHora: fecha,
        total: 0,
        formaPago: null,
        ultimos4: null,
      },
      lineas: [],
      archivoRuta: null,
      origen: 'manual',
      coincidencia: null,
      cuadre: { suma: 0, diferencia: 0, cuadra: true, sinAsignar: 0, problemas: [], sePuedeAceptar: false },
      avisos: [],
    })
    setAMano(false)
    setTienda('')
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
        ayuda="Con la foto, con el texto pegado o escribiéndolo a mano. Se guarda un solo apunte con el total, y debajo, en qué se ha ido."
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

        {/*
          Esto vive FUERA del recuadro de arrastrar a propósito. Dentro está lo
          que se hace cuando se TIENE el ticket; esto es para cuando no se tiene,
          y metido ahí dentro no lo encontraba nadie.
        */}
        <p className="sin-ticket">
          <span className="muted">¿Se perdió el ticket?</span>
          <BotonTexto
            icono="lapiz"
            disabled={cargando || cerrado}
            onClick={() => {
              setFecha(fechaDentroDelMes(mes))
              setAMano((a) => !a)
            }}
          >
            Apunta la compra a mano
          </BotonTexto>
        </p>

        {aMano ? (
          <div style={{ marginTop: 12, display: 'grid', gap: 10, justifyItems: 'start' }}>
            <div className="fila-campos">
              <span style={{ width: 220 }}>
                <CampoTexto
                  valor={tienda}
                  etiqueta="Dónde se compró"
                  placeholder="Dónde: Mercadona, la frutería…"
                  visible
                  onGuardar={setTienda}
                />
              </span>
              <span style={{ width: 170 }}>
                {/*
                  Con calendario y escrita como se escribe aquí. Antes era un
                  campo de texto pidiendo «AAAA-MM-DD», que es hacer de
                  traductor para algo que el navegador ya sabe hacer.
                */}
                <CampoFecha
                  valor={fecha}
                  etiqueta="Fecha de la compra"
                  minimo={mes ? primerDiaDelMes(mes) : undefined}
                  maximo={mes ? ultimoDiaDelMes(mes) : undefined}
                  onGuardar={setFecha}
                />
              </span>
            </div>
            <BotonPrimario disabled={!tienda.trim() || !mes} onClick={empezarAMano}>
              Escribir la compra
            </BotonPrimario>
            <p className="muted-3">
              Se apuntan las cosas una a una y el total sale de sumarlas.
            </p>
          </div>
        ) : null}

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
