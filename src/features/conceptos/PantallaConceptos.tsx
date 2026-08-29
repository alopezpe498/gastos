import { useCallback, useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Clasificacion, ConceptoDetalle, Tipo } from '../../lib/tipos'
import { Cabecera, Confirmar, ErrorLinea, EstadoVacio } from '../../components/Basicos'
import { EsqueletoLista } from '../../components/Esqueleto'
import { useAvisos } from '../../components/Avisos'
import { IconoArrastrar, IconoMas } from '../../components/Iconos'
import { cuantos, euros } from '../../lib/formato'
import { FichaConcepto } from './FichaConcepto'
import { SheetNuevoConcepto } from './SheetNuevoConcepto'
import { PantallaPlantilla } from './Plantilla'

type Props = {
  onCambioGlobal: () => void
  /** Para poder saltar a un mes y regenerarlo tras cambiar una plantilla. */
  onIrAMes: (anio: number, mes: number) => void
}

const GRUPOS: { tipo: Tipo; titulo: string; pista: string }[] = [
  {
    tipo: 'fijo',
    titulo: 'Gastos fijos',
    pista: 'Se repiten cada mes. Al abrir un mes se generan solos, pendientes de cobro.',
  },
  {
    tipo: 'sobre',
    titulo: 'Sobres',
    pista: 'Un presupuesto mensual del que se va tirando, como la comida.',
  },
  {
    tipo: 'variable',
    titulo: 'Gastos variables',
    pista: 'Apuntes sueltos. Se eligen de esta lista al anotar un gasto.',
  },
]

export const ETIQUETAS_CLASIFICACION: Record<Clasificacion, string> = {
  necesario: 'Necesario',
  prescindible: 'Prescindible',
  ahorro: 'Ahorro',
}

export function PantallaConceptos({ onCambioGlobal, onIrAMes }: Props) {
  const { avisar, avisarError } = useAvisos()
  const [conceptos, setConceptos] = useState<ConceptoDetalle[] | null>(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState<number | null>(null)
  const [creando, setCreando] = useState<Tipo | null>(null)
  const [aBorrar, setABorrar] = useState<ConceptoDetalle | null>(null)
  const [arrastrado, setArrastrado] = useState<number | null>(null)
  const [encima, setEncima] = useState<number | null>(null)
  /*
   * Dos vistas del mismo catalogo. "Conceptos" es el que manda: da de alta,
   * clasifica y ordena. "Plantilla" es la hoja de la que sale cada mes, y
   * ensena solo los fijos activos con lo que van a costar.
   */
  const [vista, setVista] = useState<'conceptos' | 'plantilla'>('conceptos')

  const cargar = useCallback(async () => {
    setError('')
    try {
      setConceptos(await api<ConceptoDetalle[]>('/conceptos?detalle=1'))
    } catch (causa) {
      setError(mensajeDeError(causa))
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const recargar = async () => {
    await cargar()
    onCambioGlobal()
  }

  const borrar = async () => {
    if (!aBorrar) return
    const concepto = aBorrar
    setABorrar(null)
    try {
      await api(`/conceptos/${concepto.id}`, { metodo: 'DELETE' })
      avisar(`"${concepto.nombre}" borrado.`)
      await recargar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  /**
   * Reordenar arrastrando. El orden es global, asi que al soltar se manda la
   * lista entera: mover un fijo por encima de otro no puede alterar el orden
   * relativo de los variables.
   */
  const soltar = async (destinoId: number) => {
    if (!conceptos || arrastrado === null || arrastrado === destinoId) {
      setArrastrado(null)
      setEncima(null)
      return
    }

    const orden = conceptos.map((c) => c.id)
    const desde = orden.indexOf(arrastrado)
    const hasta = orden.indexOf(destinoId)
    orden.splice(hasta, 0, ...orden.splice(desde, 1))

    // Se pinta ya en el orden nuevo y luego se confirma: esperar al servidor
    // para mover una fila que ya has soltado se siente roto.
    const reordenados = orden.map((id) => conceptos.find((c) => c.id === id)!)
    setConceptos(reordenados)
    setArrastrado(null)
    setEncima(null)

    try {
      await api('/conceptos/orden', { metodo: 'PUT', cuerpo: { ids: orden } })
      onCambioGlobal()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
      await cargar()
    }
  }

  const pestanas = (
    <div className="segmentado">
      <button
        className={vista === 'conceptos' ? 'activo' : ''}
        onClick={() => setVista('conceptos')}
      >
        Conceptos
      </button>
      <button
        className={vista === 'plantilla' ? 'activo' : ''}
        onClick={() => setVista('plantilla')}
      >
        Plantilla
      </button>
    </div>
  )

  if (vista === 'plantilla') {
    return (
      <>
        <Cabecera
          titulo="Conceptos"
          subtitulo="Lo que costará un mes antes de que pase nada"
          debajo={pestanas}
        />
        <PantallaPlantilla onCambioGlobal={onCambioGlobal} />
      </>
    )
  }

  if (error) {
    return (
      <>
        <Cabecera titulo="Conceptos" debajo={pestanas} />
        <div className="limite">
          <ErrorLinea mensaje={error} onReintentar={() => void cargar()} />
        </div>
      </>
    )
  }

  if (!conceptos) {
    return (
      <>
        <Cabecera titulo="Conceptos" debajo={pestanas} />
        <div className="limite">
          <EsqueletoLista filas={8} />
        </div>
      </>
    )
  }

  return (
    <>
      <Cabecera
        titulo="Conceptos"
        subtitulo={`${cuantos(conceptos.filter((c) => c.activo).length, 'activo')} de ${conceptos.length}`}
        debajo={pestanas}
      />

      <div className="limite">
        {GRUPOS.map(({ tipo, titulo, pista }) => {
          const suyos = conceptos.filter((c) => c.tipo === tipo)
          return (
            <section key={tipo} className="seccion">
              <div className="seccion-cabecera">
                <div>
                  <h2 className="seccion-titulo">{titulo}</h2>
                  <p className="seccion-pista">{pista}</p>
                </div>
                <button
                  className="boton boton-secundario"
                  onClick={() => setCreando(tipo)}
                  aria-label={`Nuevo concepto en ${titulo}`}
                >
                  <IconoMas size={18} />
                  Nuevo
                </button>
              </div>

              {suyos.length === 0 ? (
                <EstadoVacio
                  icono="—"
                  titulo="Todavía no hay ninguno"
                  texto={`Crea el primer concepto de ${titulo.toLowerCase()}.`}
                />
              ) : (
                <div className="tarjeta">
                  {suyos.map((concepto) => (
                    <FilaConcepto
                      key={concepto.id}
                      concepto={concepto}
                      arrastrando={arrastrado === concepto.id}
                      encima={encima === concepto.id}
                      onAbrir={() => setAbierto(concepto.id)}
                      onEmpezarArrastre={() => setArrastrado(concepto.id)}
                      onEncima={() => setEncima(concepto.id)}
                      onSoltar={() => void soltar(concepto.id)}
                      onFinArrastre={() => {
                        setArrastrado(null)
                        setEncima(null)
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <FichaConcepto
        concepto={conceptos.find((c) => c.id === abierto) ?? null}
        onCerrar={() => setAbierto(null)}
        onCambio={recargar}
        onBorrar={(concepto) => {
          setAbierto(null)
          setABorrar(concepto)
        }}
        onIrAMes={onIrAMes}
      />

      <SheetNuevoConcepto
        tipo={creando}
        onCerrar={() => setCreando(null)}
        onCreado={async (nombre) => {
          setCreando(null)
          avisar(`"${nombre}" creado.`)
          await recargar()
        }}
      />

      <Confirmar
        abierto={!!aBorrar}
        titulo={`¿Borrar "${aBorrar?.nombre}"?`}
        mensaje="No tiene ningún apunte, así que se puede borrar sin tocar ningún mes."
        textoConfirmar="Borrar"
        peligroso
        onConfirmar={() => void borrar()}
        onCancelar={() => setABorrar(null)}
      />
    </>
  )
}

function FilaConcepto({
  concepto,
  arrastrando,
  encima,
  onAbrir,
  onEmpezarArrastre,
  onEncima,
  onSoltar,
  onFinArrastre,
}: {
  concepto: ConceptoDetalle
  arrastrando: boolean
  encima: boolean
  onAbrir: () => void
  onEmpezarArrastre: () => void
  onEncima: () => void
  onSoltar: () => void
  onFinArrastre: () => void
}) {
  const previsto = concepto.previstoActual
  const detalle: string[] = []
  if (concepto.tipo !== 'variable' && previsto) {
    if (previsto.diaPrevisto) detalle.push(`día ${previsto.diaPrevisto}`)
    detalle.push(euros(previsto.importePrevisto))
  }
  detalle.push(ETIQUETAS_CLASIFICACION[concepto.clasificacion])
  if (!concepto.activo) detalle.push('desactivado')

  return (
    <div
      className={
        'fila fila-concepto' +
        (arrastrando ? ' arrastrando' : '') +
        (encima ? ' encima' : '') +
        (concepto.activo ? '' : ' apagada')
      }
      draggable
      onDragStart={onEmpezarArrastre}
      onDragEnd={onFinArrastre}
      onDragOver={(e) => {
        e.preventDefault()
        onEncima()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onSoltar()
      }}
    >
      <span className="agarre" aria-hidden="true">
        <IconoArrastrar size={18} />
      </span>

      <button className="fila-cuerpo fila-boton" onClick={onAbrir}>
        <span className="fila-titulo">
          {concepto.nombre}
          {concepto.esObjetivo ? <span className="etiqueta-mini">objetivo</span> : null}
        </span>
        <span className="fila-detalle">{detalle.join(' · ')}</span>
      </button>
    </div>
  )
}
