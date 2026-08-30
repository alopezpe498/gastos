import { useEffect, useRef, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Importacion, Mes, PropuestaExtracto } from '../../lib/tipos'
import { Confirmar } from '../../components/Basicos'
import { useAvisos } from '../../components/Avisos'
import { SelectorDeMes } from '../../components/SelectorDeMes'
import { IconoSubir, IconoDocumento, IconoPortapapeles } from '../../components/Iconos'
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
  // Se enciende mientras hay un archivo encima: sin esto la zona no dice que
  // acepta lo que estás arrastrando, y arrastrar a ciegas no lo hace nadie.
  const [arrastrando, setArrastrando] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)
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
      <section className="seccion">
        <div className="seccion-cabecera">
          <div>
            <h3 className="seccion-titulo">Extracto del banco</h3>
            <p className="seccion-pista">
              Sube el archivo del banco y te lo reparte: concilia los fijos, crea los variables y la
              comida, y te deja solo los que no reconoce. Nada se guarda hasta que lo aceptes, y se
              puede deshacer entero.
            </p>
          </div>
        </div>

        <div
          className={`bloque zona-archivo${arrastrando ? ' encima' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            if (!cerrado) setArrastrando(true)
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastrando(false)
            const fichero = e.dataTransfer.files?.[0]
            if (fichero && !cerrado) void subir(fichero)
          }}
        >
          {/*
            El mes va arriba del todo y con el mismo desplegable que la pantalla
            Mes: es la primera decisión y no puede parecer un detalle de un
            formulario. Si el mes elegido no está abierto, se dice aquí.
          */}
          <div className="zona-mes">
            <span className="titulo-bloque">Mes al que va</span>
            {mes ? (
              <SelectorDeMes anio={mes.anio} mes={mes.mes} onIr={irAlMes} />
            ) : (
              <span className="t12">No hay ningún mes abierto todavía</span>
            )}
          </div>

          {cerrado ? (
            <p className="banda-aviso">
              Ese mes está cerrado. Reábrelo desde el menú del mes antes de importar en él.
            </p>
          ) : null}

          <div className="zona-archivo-caja">
            <IconoSubir size={26} className="zona-archivo-icono" />
            <p className="zona-archivo-titulo">Arrastra aquí el archivo del banco</p>
            <p className="zona-archivo-texto">.xls, .xlsx o .csv — o si lo prefieres:</p>

            <div className="fila-botones">
              <button
                ref={botonArchivo}
                className="boton boton-negro"
                disabled={cargando || cerrado}
                onClick={() => archivo.current?.click()}
              >
                <IconoDocumento size={16} />
                {cargando ? 'Leyendo…' : 'Elegir archivo'}
              </button>
              <button
                className="boton"
                disabled={cargando || cerrado}
                onClick={() => setPegando((p) => !p)}
              >
                <IconoPortapapeles size={16} />
                Pegar una tabla
              </button>
            </div>

            <input
              ref={archivo}
              type="file"
              accept=".xls,.xlsx,.csv,text/csv"
              hidden
              onChange={(e) => {
                const fichero = e.target.files?.[0]
                e.target.value = ''
                if (fichero) void subir(fichero)
              }}
            />
          </div>

          {pegando ? (
            <div className="zona-pegado">
              <textarea
                className="campo-texto"
                rows={8}
                placeholder="Pega aquí las filas copiadas del banco, con su cabecera."
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <button
                className="boton boton-negro"
                disabled={!texto.trim() || cargando}
                onClick={() => void enviar({ texto })}
              >
                Leer lo pegado
              </button>
            </div>
          ) : null}

          {error ? <p className="banda-aviso alerta">{error}</p> : null}

          {onVerReglas ? (
            <p className="pista zona-archivo-pie">
              Lo que reconoce cada movimiento son las reglas.{' '}
              <button className="boton-texto" onClick={onVerReglas}>
                Ver reglas
              </button>
            </p>
          ) : null}
        </div>
      </section>

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
    <section className="seccion" data-historial>
      <h3 className="seccion-titulo">
        Importaciones de {nombreMes || 'este mes'}
      </h3>
      <div className="tarjeta">
        {historial.map((i) => (
          <div className="fila" key={i.id}>
            <div className="fila-cuerpo">
              <span className="fila-titulo">
                {i.nombreArchivo ?? 'Sin nombre'}
                {i.estado !== 'aceptada' ? (
                  <span className="etiqueta-mini">{i.estado}</span>
                ) : null}
              </span>
              <span className="fila-detalle">
                {fechaCorta(i.fecha.slice(0, 10))} · {cuantos(i.conteos.movimientos, 'movimiento')}
                {i.estado === 'aceptada'
                  ? ` · ${i.conteos.fijos} fijos, ${i.conteos.variables} variables`
                  : ''}
              </span>
            </div>
            {i.estado === 'aceptada' ? (
              <button className="boton boton-secundario boton-compacto" onClick={() => setADeshacer(i)}>
                Deshacer
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <Confirmar
        abierto={!!aDeshacer}
        titulo="¿Deshacer esta importación?"
        mensaje="Se borran los apuntes que creó y los fijos vuelven a pendiente con su importe previsto. Las reglas aprendidas se quedan."
        textoConfirmar="Deshacer"
        peligroso
        onConfirmar={() => void deshacer()}
        onCancelar={() => setADeshacer(null)}
      />
    </section>
  )
}
