import { useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Clasificacion, ConceptoDetalle, MesAbierto, Tipo } from '../../lib/tipos'
import { Sheet } from '../../components/Sheet'
import { useAvisos } from '../../components/Avisos'
import { Interruptor, SelectorMes } from '../../components/Campos'
import { IconoAviso, IconoPapelera } from '../../components/Iconos'
import { cuantos, euros, escribirImporte, leerImporte, NOMBRES_MESES } from '../../lib/formato'
import { ETIQUETAS_CLASIFICACION } from './PantallaConceptos'

type Props = {
  concepto: ConceptoDetalle | null
  onCerrar: () => void
  onCambio: () => Promise<void> | void
  onBorrar: (concepto: ConceptoDetalle) => void
  /** Llevar a un mes para regenerarlo tras tocar la plantilla. */
  onIrAMes: (anio: number, mes: number) => void
}

const TIPOS: { valor: Tipo; texto: string }[] = [
  { valor: 'fijo', texto: 'Fijo' },
  { valor: 'variable', texto: 'Variable' },
  { valor: 'sobre', texto: 'Sobre' },
]

const CLASIFICACIONES: Clasificacion[] = ['necesario', 'prescindible', 'ahorro']

/** Mes siguiente al actual: es desde cuando suele valer un importe nuevo. */
function mesSiguienteClave(): string {
  const ahora = new Date()
  const mes = ahora.getMonth() + 2
  const anio = mes > 12 ? ahora.getFullYear() + 1 : ahora.getFullYear()
  return `${anio}-${String(mes > 12 ? 1 : mes).padStart(2, '0')}`
}

function claveLegible(clave: string): string {
  const [anio, mes] = clave.split('-')
  return `${NOMBRES_MESES[Number(mes) - 1]} de ${anio}`
}

export function FichaConcepto({ concepto, onCerrar, onCambio, onBorrar, onIrAMes }: Props) {
  const { avisarError } = useAvisos()
  const [guardando, setGuardando] = useState(false)

  if (!concepto) return null

  const cambiar = async (cambios: Record<string, unknown>) => {
    setGuardando(true)
    try {
      await api(`/conceptos/${concepto.id}`, { metodo: 'PATCH', cuerpo: cambios })
      await onCambio()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Sheet abierta titulo={concepto.nombre} onCerrar={onCerrar}>
      <label className="campo-etiqueta" htmlFor="nombre-concepto">
        Nombre
      </label>
      <input
        id="nombre-concepto"
        className="campo"
        defaultValue={concepto.nombre}
        maxLength={60}
        onBlur={(e) => {
          const nombre = e.target.value.trim()
          if (nombre && nombre !== concepto.nombre) void cambiar({ nombre })
        }}
      />

      <p className="campo-etiqueta">Tipo</p>
      <div className="segmentado">
        {TIPOS.map(({ valor, texto }) => (
          <button
            key={valor}
            className={concepto.tipo === valor ? 'activo' : ''}
            onClick={() => valor !== concepto.tipo && void cambiar({ tipo: valor })}
          >
            {texto}
          </button>
        ))}
      </div>
      {concepto.tipo === 'variable' && concepto.movimientos > 0 ? (
        <p className="pista">
          Cambiarlo a fijo no toca los apuntes que ya tiene: seguirán ahí, pero contarán como
          gasto fijo en todos los meses.
        </p>
      ) : null}

      <p className="campo-etiqueta">Clasificación (regla 50/30/20)</p>
      <div className="segmentado">
        {CLASIFICACIONES.map((valor) => (
          <button
            key={valor}
            className={concepto.clasificacion === valor ? 'activo' : ''}
            onClick={() =>
              valor !== concepto.clasificacion && void cambiar({ clasificacion: valor })
            }
          >
            {ETIQUETAS_CLASIFICACION[valor]}
          </button>
        ))}
      </div>

      <div className="fila fila-ajuste">
        <div className="fila-cuerpo">
          <span className="fila-titulo">Activo</span>
          <span className="fila-detalle">
            Un concepto desactivado deja de ofrecerse, pero no toca el pasado.
          </span>
        </div>
        <Interruptor
          activo={concepto.activo}
          onCambiar={(activo) => void cambiar({ activo })}
          ariaLabel="Concepto activo"
        />
      </div>

      {concepto.tipo !== 'variable' ? (
        <EditorPlantilla concepto={concepto} onCambio={onCambio} onIrAMes={onIrAMes} />
      ) : null}

      <EditorAlias concepto={concepto} onCambio={onCambio} />

      <div className="acciones-pie">
        {concepto.movimientos > 0 ? (
          <p className="pista">
            Tiene {concepto.movimientos} {concepto.movimientos === 1 ? 'apunte' : 'apuntes'}. Para
            dejar de usarlo, desactívalo: borrarlo cambiaría meses ya cerrados.
          </p>
        ) : (
          <button className="boton boton-texto peligro" onClick={() => onBorrar(concepto)}>
            <IconoPapelera size={18} />
            Borrar concepto
          </button>
        )}
      </div>

      {guardando ? <span className="solo-lectores">Guardando</span> : null}
    </Sheet>
  )
}

/**
 * Historico de importes previstos. Cambiar el importe no reescribe el pasado:
 * crea una entrada nueva vigente desde el mes que se elija, que por defecto es
 * el siguiente. Asi los meses ya abiertos conservan lo que costaba entonces.
 */
function EditorPlantilla({
  concepto,
  onCambio,
  onIrAMes,
}: {
  concepto: ConceptoDetalle
  onCambio: () => Promise<void> | void
  onIrAMes: (anio: number, mes: number) => void
}) {
  const { avisar, avisarError } = useAvisos()
  /*
   * Cambiar la plantilla no toca los meses que ya estan abiertos: se quedaron
   * con la foto de cuando se abrieron. Si no se dice, uno sube la hipoteca y da
   * por hecho que el mes en curso ya lo refleja, y no es asi.
   */
  const [mesesAbiertos, setMesesAbiertos] = useState<MesAbierto[] | null>(null)
  const vigente = concepto.previstoActual
  const [dia, setDia] = useState(vigente?.diaPrevisto ?? '')
  const [importe, setImporte] = useState(escribirImporte(vigente?.importePrevisto ?? 0))
  const [desde, setDesde] = useState(mesSiguienteClave())
  const [enviando, setEnviando] = useState(false)

  const guardar = async () => {
    const leido = leerImporte(importe)
    if (leido === null) {
      avisarError('El importe previsto no se entiende.')
      return
    }
    setEnviando(true)
    try {
      await api(`/conceptos/${concepto.id}/plantilla`, {
        metodo: 'POST',
        cuerpo: { diaPrevisto: dia, importePrevisto: leido, vigenteDesde: desde },
      })
      avisar(`Previsto actualizado desde ${claveLegible(desde)}.`)
      await onCambio()
      try {
        setMesesAbiertos(await api<MesAbierto[]>('/meses/abiertos'))
      } catch {
        // Si no se puede saber, se calla: el guardado ha ido bien igual.
      }
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setEnviando(false)
    }
  }

  const borrarEntrada = async (id: number) => {
    try {
      await api(`/conceptos/${concepto.id}/plantilla/${id}`, { metodo: 'DELETE' })
      await onCambio()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  return (
    <section className="bloque">
      <h3 className="seccion-titulo">Previsto</h3>
      <p className="seccion-pista">
        {concepto.tipo === 'sobre'
          ? 'El presupuesto que se copia al abrir un mes nuevo.'
          : 'El día y el importe con los que se genera este fijo al abrir un mes.'}
      </p>

      <div className="rejilla-previsto">
        {concepto.tipo === 'fijo' ? (
          <div>
            <label className="campo-etiqueta" htmlFor="dia-previsto">
              Día
            </label>
            <input
              id="dia-previsto"
              className="campo"
              value={dia}
              maxLength={20}
              placeholder="1"
              onChange={(e) => setDia(e.target.value)}
            />
            <p className="pista">Admite varios: «30,13,23».</p>
          </div>
        ) : null}

        <div>
          <label className="campo-etiqueta" htmlFor="importe-previsto">
            Importe
          </label>
          <input
            id="importe-previsto"
            className="campo dinero"
            inputMode="decimal"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
          />
        </div>

        <div>
          <p className="campo-etiqueta">Desde</p>
          <SelectorMes valor={desde} onCambiar={setDesde} ariaLabel="Vigente desde" />
        </div>
      </div>

      <button
        className="boton boton-principal boton-ancho"
        onClick={() => void guardar()}
        disabled={enviando}
      >
        {enviando ? 'Guardando…' : `Guardar desde ${claveLegible(desde)}`}
      </button>

      {mesesAbiertos && mesesAbiertos.length > 0 ? (
        <div className="banda-aviso">
          <IconoAviso size={18} />
          <span>
            Hay {cuantos(mesesAbiertos.length, 'mes abierto', 'meses abiertos')} que siguen con el
            importe anterior. Para ponerlos al día, entra en cada uno y usa{' '}
            <strong>Regenerar desde la plantilla</strong>.
            <span className="banda-meses">
              {mesesAbiertos.slice(0, 6).map((m) => (
                <button
                  key={m.id}
                  className="chip"
                  onClick={() => onIrAMes(m.anio, m.mes)}
                >
                  {m.nombreMes} {m.anio}
                </button>
              ))}
            </span>
          </span>
        </div>
      ) : null}

      {concepto.plantilla.length > 0 ? (
        <div className="tarjeta historico">
          {concepto.plantilla.map((entrada, indice) => (
            <div className="fila" key={entrada.id}>
              <div className="fila-cuerpo">
                <span className="fila-titulo dinero">{euros(entrada.importePrevisto)}</span>
                <span className="fila-detalle">
                  desde {claveLegible(entrada.vigenteDesde)}
                  {entrada.diaPrevisto ? ` · día ${entrada.diaPrevisto}` : ''}
                  {indice === 0 ? ' · en vigor' : ''}
                </span>
              </div>
              {concepto.plantilla.length > 1 ? (
                <button
                  className="icono-boton"
                  aria-label={`Borrar el importe desde ${claveLegible(entrada.vigenteDesde)}`}
                  onClick={() => void borrarEntrada(entrada.id)}
                >
                  <IconoPapelera size={18} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

/**
 * Alias: las otras grafias con las que este concepto aparece en el Excel. Es lo
 * que hace que reimportar un año no vuelva a crear "Gimasio" al lado de
 * "Gimnasio".
 */
function EditorAlias({
  concepto,
  onCambio,
}: {
  concepto: ConceptoDetalle
  onCambio: () => Promise<void> | void
}) {
  const { avisarError } = useAvisos()
  const [nuevo, setNuevo] = useState('')

  const anadir = async () => {
    const texto = nuevo.trim()
    if (!texto) return
    try {
      await api(`/conceptos/${concepto.id}/alias`, { metodo: 'POST', cuerpo: { alias: texto } })
      setNuevo('')
      await onCambio()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const quitar = async (id: number) => {
    try {
      await api(`/conceptos/${concepto.id}/alias/${id}`, { metodo: 'DELETE' })
      await onCambio()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  return (
    <section className="bloque">
      <h3 className="seccion-titulo">Otros nombres</h3>
      <p className="seccion-pista">
        Cómo aparece escrito en el Excel. Al importar, estos nombres se reconocen como este mismo
        concepto en vez de crear uno nuevo.
      </p>

      {concepto.alias.length > 0 ? (
        <div className="etiquetas-fila">
          {concepto.alias.map((alias) => (
            <span className="etiqueta" key={alias.id}>
              {alias.alias}
              <button
                className="etiqueta-quitar"
                aria-label={`Quitar "${alias.alias}"`}
                onClick={() => void quitar(alias.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="fila-campos">
        <input
          className="campo"
          value={nuevo}
          maxLength={60}
          placeholder="Gimasio"
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void anadir()
          }}
        />
        <button className="boton boton-secundario" onClick={() => void anadir()} disabled={!nuevo.trim()}>
          Añadir
        </button>
      </div>
    </section>
  )
}

/** Se exporta para que el resto de pantallas escriban los meses igual. */
export { claveLegible }
