import { useEffect, useRef, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Importacion, Mes, PropuestaExtracto } from '../../lib/tipos'
import { Confirmar } from '../../components/Basicos'
import { useAvisos } from '../../components/Avisos'
import { IconoDocumento, IconoPortapapeles } from '../../components/Iconos'
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
  const archivo = useRef<HTMLInputElement>(null)
  const botonArchivo = useRef<HTMLButtonElement>(null)

  const mes = meses.find((m) => m.id === mesId) ?? null
  const cerrado = mes?.estado === 'cerrado'

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

        <div className="tarjeta bloque-carga">
          <label className="etiqueta-campo" htmlFor="mes-extracto">
            Mes al que va
          </label>
          <select
            id="mes-extracto"
            className="campo-linea"
            value={mesId}
            onChange={(e) => setMesId(Number(e.target.value))}
          >
            {meses.map((m) => (
              <option key={m.id} value={m.id}>
                {NOMBRES_MESES[m.mes - 1]} {m.anio}
                {m.estado === 'cerrado' ? ' (cerrado)' : ''}
              </option>
            ))}
          </select>

          {cerrado ? (
            <p className="banda-aviso">
              Ese mes está cerrado. Reábrelo desde el menú del mes antes de importar en él.
            </p>
          ) : null}

          <div className="fila-botones">
            <button
              ref={botonArchivo}
              className="boton boton-principal"
              disabled={cargando || cerrado}
              onClick={() => archivo.current?.click()}
            >
              <IconoDocumento size={18} />
              {cargando ? 'Leyendo…' : 'Elegir archivo'}
            </button>
            <button
              className="boton boton-secundario"
              disabled={cargando || cerrado}
              onClick={() => setPegando((p) => !p)}
            >
              <IconoPortapapeles size={18} />
              Pegar una tabla
            </button>
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

          <p className="pista">Admite .xls, .xlsx y .csv, o una tabla copiada de la web del banco.</p>

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
                className="boton boton-principal"
                disabled={!texto.trim() || cargando}
                onClick={() => void enviar({ texto })}
              >
                Leer lo pegado
              </button>
            </div>
          ) : null}

          {error ? <p className="banda-aviso">{error}</p> : null}

          {onVerReglas ? (
            <p className="pista">
              Lo que reconoce cada movimiento son las reglas.{' '}
              <button className="boton boton-texto boton-compacto" onClick={onVerReglas}>
                Ver reglas
              </button>
            </p>
          ) : null}
        </div>
      </section>

      <HistorialImportaciones mesId={mesId} nombreMes={mes ? `${NOMBRES_MESES[mes.mes - 1]} ${mes.anio}` : ''} onCambio={onAplicado} />
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
  nombreMes,
  onCambio,
}: {
  mesId: number
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
  }, [mesId])

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
    <section className="seccion">
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
