import { useCallback, useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Clasificacion, ConceptoDetalle, NombreColor, Tipo } from '../../lib/tipos'
import { BotonTexto, Cabecera, Card, Chip, ErrorLinea, Esqueleto, IconoConcepto, Interruptor, Tabs, Vacio } from '../../components/ui/Basicos'
import { Asa, Fila } from '../../components/ui/Fila'
import { ConfirmacionDialogo, Dialogo } from '../../components/ui/Dialogo'
import { Icono, ICONOS_DE_CONCEPTO } from '../../components/ui/Icono'
import { useAvisos } from '../../components/ui/Toast'
import { cuantos, euros } from '../../lib/formato'
import {
  iconoDe,
  iconoPorNombre,
  NOMBRES_COLOR,
  PALETAS,
  paletaDe,
  registrarConceptos,
} from '../../lib/conceptos'
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
  // El concepto al que se le está eligiendo color desde la lista.
  const [colorDe, setColorDe] = useState<ConceptoDetalle | null>(null)
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
      const catalogo = await api<ConceptoDetalle[]>('/conceptos?detalle=1')
      setConceptos(catalogo)
      // Con el catálogo entero delante se rehace el reparto de colores.
      registrarConceptos(catalogo)
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

  /** Un cambio suelto en un concepto, desde la lista y sin abrir la ficha. */
  const cambiar = async (id: number, cambios: Record<string, unknown>) => {
    try {
      await api(`/conceptos/${id}`, { metodo: 'PATCH', cuerpo: cambios })
      await cargar()
      onCambioGlobal()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
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
    <Tabs
      pestanas={[
        { id: 'conceptos' as const, nombre: 'Conceptos' },
        { id: 'plantilla' as const, nombre: 'Plantilla' },
      ]}
      activa={vista}
      onCambiar={setVista}
    />
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
        <div className="pila">
          <ErrorLinea mensaje={error} onReintentar={() => void cargar()} />
        </div>
      </>
    )
  }

  if (!conceptos) {
    return (
      <>
        <Cabecera titulo="Conceptos" debajo={pestanas} />
        <div className="pila">
          <Esqueleto filas={8} />
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

      <div className="pila">
        {GRUPOS.map(({ tipo, titulo, pista }) => {
          const suyos = conceptos.filter((c) => c.tipo === tipo)
          return (
            <Card
              key={tipo}
              titulo={titulo}
              ayuda={pista}
              derecha={
                <BotonTexto icono="mas" onClick={() => setCreando(tipo)}>
                  Nuevo
                </BotonTexto>
              }
            >
              {suyos.length === 0 ? (
                <Vacio frase={`Crea el primer concepto de ${titulo.toLowerCase()}.`} />
              ) : (
                <>
                  {suyos.map((concepto) => (
                    <FilaConcepto
                      key={concepto.id}
                      concepto={concepto}
                      arrastrando={arrastrado === concepto.id}
                      encima={encima === concepto.id}
                      onAbrir={() => setAbierto(concepto.id)}
                      onCambiarColor={setColorDe}
                      onCambiarActivo={(c, activo) => void cambiar(c.id, { activo })}
                      onEmpezarArrastre={() => setArrastrado(concepto.id)}
                      onEncima={() => setEncima(concepto.id)}
                      onSoltar={() => void soltar(concepto.id)}
                      onFinArrastre={() => {
                        setArrastrado(null)
                        setEncima(null)
                      }}
                    />
                  ))}
                </>
              )}
            </Card>
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

      {aBorrar ? (
        <Dialogo titulo={`¿Borrar "${aBorrar.nombre}"?`} onCerrar={() => setABorrar(null)}>
          <ConfirmacionDialogo
            frase="No tiene ningún apunte, así que se puede borrar sin tocar ningún mes."
            textoConfirmar="Sí, borrar"
            onConfirmar={() => void borrar()}
            onCancelar={() => setABorrar(null)}
          />
        </Dialogo>
      ) : null}

      {/*
        El aspecto de un concepto —su color y su dibujo— se decide mirando la
        lista entera, así que se cambia desde la lista y no dentro de la ficha.
      */}
      {colorDe ? (
        <Dialogo titulo={`Aspecto de ${colorDe.nombre}`} onCerrar={() => setColorDe(null)}>
          <p className="muted">
            Es por lo que reconoces el concepto antes de leer su nombre. Si no eliges nada le tocan
            solos, y no se repiten con los demás mientras queden.
          </p>

          <label className="campo-etiqueta">Color</label>
          <div className="rejilla-aspecto">
            {NOMBRES_COLOR.map((nombre) => {
              const paleta = PALETAS[nombre]
              const elegido = colorDe.color === nombre
              return (
                <button
                  key={nombre}
                  className={`aspecto${elegido ? ' elegido' : ''}`}
                  style={{ background: paleta.suave, color: paleta.color }}
                  aria-pressed={elegido}
                  aria-label={`Color ${nombre}`}
                  onClick={() =>
                    // Volver a pulsar el elegido lo devuelve al automático.
                    void cambiar(colorDe.id, { color: elegido ? null : (nombre as NombreColor) })
                  }
                >
                  <span className="dot" style={{ background: paleta.color }} />
                </button>
              )
            })}
          </div>

          <label className="campo-etiqueta">Icono</label>
          <div className="rejilla-aspecto">
            {ICONOS_DE_CONCEPTO.map((nombre) => {
              const elegido = (colorDe.icono ?? iconoPorNombre(colorDe.nombre)) === nombre
              return (
                <button
                  key={nombre}
                  className={`aspecto${elegido ? ' elegido' : ''}`}
                  aria-pressed={elegido}
                  aria-label={`Icono ${nombre}`}
                  onClick={() =>
                    void cambiar(colorDe.id, { icono: colorDe.icono === nombre ? null : nombre })
                  }
                >
                  <Icono nombre={nombre} size={17} />
                </button>
              )
            })}
          </div>

          <p className="muted-3" style={{ marginTop: 10 }}>
            Pulsa el que ya está elegido para volver al automático.
          </p>
        </Dialogo>
      ) : null}
    </>
  )
}

const ETIQUETAS_TIPO: Record<Tipo, string> = {
  fijo: 'Fijo',
  variable: 'Variable',
  sobre: 'Sobre',
}

function FilaConcepto({
  concepto,
  arrastrando,
  encima,
  onAbrir,
  onCambiarColor,
  onCambiarActivo,
  onEmpezarArrastre,
  onEncima,
  onSoltar,
  onFinArrastre,
}: {
  concepto: ConceptoDetalle
  arrastrando: boolean
  encima: boolean
  onAbrir: () => void
  onCambiarColor: (concepto: ConceptoDetalle) => void
  onCambiarActivo: (concepto: ConceptoDetalle, activo: boolean) => void
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

  const paleta = paletaDe(concepto)

  return (
    <Fila
      arrastrando={arrastrando}
      encima={encima}
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
      izquierda={
        <>
          <Asa />
          {/*
            El icono no es un adorno: es el botón del color y del dibujo.
            Tocarlo los abre y se cambian ahí mismo, sin entrar en la ficha para
            algo que se decide mirando la lista entera.
          */}
          <button
            className="ico-boton"
            aria-label={`Cambiar el aspecto de ${concepto.nombre}`}
            onClick={() => onCambiarColor(concepto)}
          >
            <IconoConcepto
              icono={iconoDe(concepto)}
              color={paleta.color}
              suave={paleta.suave}
            />
          </button>
        </>
      }
      titulo={concepto.nombre}
      onAbrir={onAbrir}
      centro={
        <>
          {concepto.esObjetivo ? <Chip>objetivo</Chip> : null}
          <Chip>{ETIQUETAS_TIPO[concepto.tipo]}</Chip>
          <span className="muted-3 solo-ancho">{detalle.join(' · ')}</span>
        </>
      }
      importe={
        <span style={{ marginLeft: 'auto' }}>
          <Interruptor
            activo={concepto.activo}
            etiqueta={`${concepto.activo ? 'Desactivar' : 'Activar'} ${concepto.nombre}`}
            onCambiar={(activo) => onCambiarActivo(concepto, activo)}
          />
        </span>
      }
    />
  )
}
