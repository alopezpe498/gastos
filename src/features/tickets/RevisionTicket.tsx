import { useEffect, useMemo, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type {
  CategoriaProducto,
  LineaTicket,
  PropuestaTicket,
  Variante,
} from '../../lib/tipos'
import {
  BotonPrimario,
  BotonTexto,
  Cabecera,
  Card,
  Casilla,
  Chip,
  MenuFila,
} from '../../components/ui/Basicos'
import { CampoImporte } from '../../components/ui/Campos'
import { Acciones } from '../../components/ui/Navegacion'
import { useAvisos } from '../../components/ui/Toast'
import {
  Dato,
  EstadoCuadre,
  ResumenCategorias,
  SelectorVariante,
  VisorArchivo,
} from '../../components/ui/Compra'
import { cuantos, euros, fechaCorta } from '../../lib/formato'

/**
 * Revisar un ticket antes de guardarlo.
 *
 * Misma forma que la revisión del extracto, porque es el mismo trabajo: algo
 * llega leído por una máquina, se mira, se corrige y se acepta. Y las mismas
 * dos garantías:
 *
 *   - **Nada se guarda hasta aceptar.** Lo que se ve es un borrador.
 *   - **Aceptar está bloqueado mientras algo no cuadre**, y dice por qué. De un
 *     ticket no se puede perder una línea por el camino: si las cuarenta y
 *     cinco no suman lo que pone abajo, el detalle no vale para nada.
 *
 * Lo que sí es distinto: aquí el trabajo aburrido es clasificar cuarenta y
 * cinco líneas. Por eso está el botón que manda a «Otros» todo lo que quede —se
 * guarda el ticket hoy y se afina cuando se quiera— y por eso asignar una línea
 * asigna sola las que tienen el mismo texto.
 */

/** «1,252», no «1.252»: aquí el punto es el separador de miles. */
const cantidad = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 3 })

type Resumen = { ticketId: number; movimientoId: number; movimientoCreado: boolean; lineas: number }

type Props = {
  propuesta: PropuestaTicket
  onCancelar: () => void
  onGuardado: (resumen: Resumen) => void
}

/** La variante «Otros / Sin clasificar», que existe desde la semilla. */
const esOtros = (v: Variante) => v.producto === 'Otros' && v.nombre === 'Sin clasificar'

export function RevisionTicket({ propuesta, onCancelar, onGuardado }: Props) {
  const { avisar, avisarError } = useAvisos()

  const [cabecera] = useState(propuesta.cabecera)
  const [lineas, setLineas] = useState<LineaTicket[]>(propuesta.lineas)
  const [variantes, setVariantes] = useState<Variante[]>([])
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [vincular, setVincular] = useState(!!propuesta.coincidencia)
  const [guardando, setGuardando] = useState(false)
  /*
   * Lo seleccionado, por `orden`. Un ticket son cuarenta y cinco líneas y la
   * mitad son la misma decisión repetida: sin poder actuar sobre varias a la
   * vez, revisarlo es teclear, no revisar.
   */
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const [v, c] = await Promise.all([
          api<Variante[]>('/productos/variantes'),
          api<CategoriaProducto[]>('/categorias-producto?activas=1'),
        ])
        setVariantes(v)
        setCategorias(c)
      } catch (causa) {
        setError(mensajeDeError(causa))
      }
    })()
  }, [])

  // ---- el cuadre, en vivo ----
  const cuadre = useMemo(() => {
    const suma = Math.round(lineas.reduce((t, l) => t + (l.importe ?? 0), 0) * 100) / 100
    const diferencia = Math.round((cabecera.total - suma) * 100) / 100
    const cuadra = Math.abs(diferencia) <= 0.05
    const asignada = (l: LineaTicket) => !!l.varianteId || !!(l.varianteNueva && l.productoNuevo)
    const sinAsignar = lineas.filter((l) => !asignada(l)).length

    const problemas: string[] = []
    if (!cuadra) {
      problemas.push(
        diferencia > 0
          ? `Faltan ${euros(Math.abs(diferencia))}.`
          : `Sobran ${euros(Math.abs(diferencia))}.`,
      )
    }
    if (sinAsignar > 0) problemas.push(`${cuantos(sinAsignar, 'línea', 'líneas')} sin asignar.`)
    return { suma, diferencia, cuadra, sinAsignar, problemas }
  }, [lineas, cabecera.total])

  // ---- el reparto por categoría, también en vivo ----
  const reparto = useMemo(() => {
    const porCategoria = new Map<string, number>()
    for (const linea of lineas) {
      const variante = variantes.find((v) => v.id === linea.varianteId)
      const nombre =
        variante?.categoria ??
        categorias.find((c) => c.id === linea.categoriaId)?.nombre ??
        linea.propuesta?.categoria ??
        'Sin asignar'
      porCategoria.set(nombre, Math.round(((porCategoria.get(nombre) ?? 0) + linea.importe) * 100) / 100)
    }
    const total = [...porCategoria.values()].reduce((t, v) => t + v, 0)
    return [...porCategoria.entries()]
      .map(([categoria, importe]) => ({
        categoria,
        importe,
        parte: total === 0 ? null : importe / total,
      }))
      .sort((a, b) => b.importe - a.importe)
  }, [lineas, variantes, categorias])

  const cambiar = (orden: number, cambios: Partial<LineaTicket>) =>
    setLineas((actuales) => actuales.map((l) => (l.orden === orden ? { ...l, ...cambios } : l)))

  /**
   * Asignar una línea asigna también las que ponen exactamente lo mismo.
   *
   * En un ticket, «LLET SENCERA» sale tres veces y es la misma leche las tres.
   * Decidirlo una vez y que las otras dos sigan pidiendo atención sería trabajo
   * inventado.
   */
  const asignar = (linea: LineaTicket, cambios: Partial<LineaTicket>) => {
    const iguales = lineas.filter((l) => l.textoTicket === linea.textoTicket)
    setLineas((actuales) =>
      actuales.map((l) =>
        l.textoTicket === linea.textoTicket
          ? { ...l, ...cambios, origenAsignacion: 'manual', dudosa: false }
          : l,
      ),
    )
    if (iguales.length > 1) {
      avisar(`${cuantos(iguales.length, 'línea')} con el mismo texto, asignadas de una vez.`)
    }
  }

  const marcar = (ordenes: number[], marcada: boolean) =>
    setSeleccion((actual) => {
      const nueva = new Set(actual)
      for (const orden of ordenes) {
        if (marcada) nueva.add(orden)
        else nueva.delete(orden)
      }
      return nueva
    })

  const seleccionadas = lineas.filter((l) => seleccion.has(l.orden))
  const conPropuesta = seleccionadas.filter((l) => l.propuesta?.variante && l.propuesta?.producto)

  /**
   * Cada línea se queda con SU propuesta, no con una común.
   *
   * Es la acción que hace llevadero un ticket: la IA acierta en casi todas y
   * lo que se quiere es mirarlas de un vistazo y darlas por buenas en bloque,
   * no confirmar cuarenta y cinco veces lo mismo. Las que se hayan colado se
   * corrigen después, que siguen estando ahí.
   */
  const aceptarPropuestas = () => {
    setLineas((actuales) =>
      actuales.map((l) =>
        seleccion.has(l.orden) && l.propuesta?.variante && l.propuesta?.producto
          ? {
              ...l,
              varianteId: null,
              varianteNueva: l.propuesta.variante,
              productoNuevo: l.propuesta.producto,
              categoriaId: l.propuesta.categoriaId ?? null,
              marca: l.propuesta.marca ?? null,
              origenAsignacion: 'manual',
              dudosa: false,
            }
          : l,
      ),
    )
    avisar(`${cuantos(conPropuesta.length, 'línea')} con lo que proponía la IA.`)
    setSeleccion(new Set())
  }

  /** Una misma variante para todo lo seleccionado. */
  const asignarSeleccion = (varianteId: number) => {
    setLineas((actuales) =>
      actuales.map((l) =>
        seleccion.has(l.orden)
          ? { ...l, varianteId, varianteNueva: undefined, productoNuevo: undefined, origenAsignacion: 'manual', dudosa: false }
          : l,
      ),
    )
    avisar(`${cuantos(seleccion.size, 'línea')} asignadas.`)
    setSeleccion(new Set())
  }

  /** El botón que desbloquea un ticket largo: lo que quede, a «Otros». */
  const resolverElResto = () => {
    const otros = variantes.find(esOtros)
    if (!otros) {
      avisarError('No encuentro la variante «Otros»: revisa el catálogo.')
      return
    }
    const cuantas = lineas.filter((l) => !l.varianteId && !l.varianteNueva).length
    setLineas((actuales) =>
      actuales.map((l) =>
        l.varianteId || l.varianteNueva
          ? l
          : { ...l, varianteId: otros.id, origenAsignacion: 'manual', dudosa: true },
      ),
    )
    avisar(`${cuantos(cuantas, 'línea')} a «Otros». Se pueden afinar cuando quieras.`)
  }

  const guardar = async () => {
    setGuardando(true)
    setError('')
    try {
      const resumen = await api<Resumen>('/tickets/aceptar', {
        metodo: 'POST',
        cuerpo: {
          mesId: propuesta.mes.id,
          cabecera,
          lineas,
          movimientoId: vincular ? propuesta.coincidencia?.movimiento.id : null,
          archivoRuta: propuesta.archivoRuta,
          origen: propuesta.origen,
        },
      })
      onGuardado(resumen)
    } catch (causa) {
      setError(mensajeDeError(causa))
    } finally {
      setGuardando(false)
    }
  }

  const opcionesDeVariante = variantes.map((v) => ({
    id: v.id,
    nombre: v.nombre,
    marca: v.marca,
    producto: v.producto,
    categoria: v.categoria,
  }))

  const pendientes = lineas.filter((l) => !l.varianteId && !l.varianteNueva)
  const dudosas = lineas.filter((l) => (l.varianteId || l.varianteNueva) && l.dudosa)
  const hechas = lineas.filter((l) => (l.varianteId || l.varianteNueva) && !l.dudosa)

  const filaDe = (linea: LineaTicket) => (
    <FilaTicket
      key={linea.orden}
      linea={linea}
      variantes={variantes}
      seleccionada={seleccion.has(linea.orden)}
      onSeleccionar={(marcada) => marcar([linea.orden], marcada)}
      onAsignar={(cambios) => asignar(linea, cambios)}
      onCambiar={(cambios) => cambiar(linea.orden, cambios)}
      onBorrar={() => setLineas((a) => a.filter((l) => l.orden !== linea.orden))}
    />
  )

  /*
   * Los atajos de selección, como en el extracto: «todas», y un grupo por
   * cada categoría que la IA propone. Revisar un ticket es mirar seis carnes
   * de golpe y decir que sí, no confirmar una a una.
   */
  const gruposDePendientes = () => {
    const porCategoria = new Map<string, number[]>()
    for (const linea of pendientes) {
      const nombre = linea.propuesta?.categoria
      if (!nombre) continue
      porCategoria.set(nombre, [...(porCategoria.get(nombre) ?? []), linea.orden])
    }
    return [...porCategoria.entries()]
      .filter(([, ordenes]) => ordenes.length > 1)
      .sort((a, b) => b[1].length - a[1].length)
  }

  return (
    <>
      <Acciones>
        <BotonTexto onClick={onCancelar}>Cancelar</BotonTexto>
        <BotonPrimario disabled={cuadre.problemas.length > 0 || guardando} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : 'Aceptar'}
        </BotonPrimario>
      </Acciones>

      <Cabecera
        titulo={`Ticket de ${cabecera.tienda ?? 'la compra'}`}
        subtitulo={`${cabecera.fechaHora ? fechaCorta(cabecera.fechaHora.slice(0, 10)) : 'sin fecha'} · ${propuesta.mes.nombreMes} ${propuesta.mes.anio}`}
      />

      <Card titulo="Lo que dice el ticket">
        <div className="fila-campos" style={{ gap: 24, flexWrap: 'wrap' }}>
          <Dato etiqueta="Total">{euros(cabecera.total)}</Dato>
          <Dato etiqueta="Líneas">{lineas.length}</Dato>
          <Dato etiqueta="Suman">{euros(cuadre.suma)}</Dato>
          {cabecera.ultimos4 ? <Dato etiqueta="Tarjeta">···{cabecera.ultimos4}</Dato> : null}
        </div>

        <EstadoCuadre
          lineas={lineas.length}
          suma={cuadre.suma}
          total={cabecera.total}
          cuadra={cuadre.cuadra}
          problemas={cuadre.problemas}
        />

        {/*
          La coincidencia con un apunte que ya estaba. Es lo normal: el extracto
          del banco creó el apunte de MERCADONA días antes y ahora llega la foto.
          Sin esto, la compra quedaría apuntada dos veces.
        */}
        {propuesta.coincidencia ? (
          <p className="pista" style={{ marginTop: 10 }}>
            Coincide con «{propuesta.coincidencia.movimiento.descripcion || 'un apunte de comida'}»
            del mes ({propuesta.coincidencia.porQue}).{' '}
            {vincular
              ? 'Se adjuntará a ese apunte, sin crear otro.'
              : 'Se creará un apunte nuevo, además del que ya está.'}{' '}
            <BotonTexto onClick={() => setVincular((v) => !v)}>
              {vincular ? 'Crear uno nuevo' : 'Adjuntarlo al que ya está'}
            </BotonTexto>
          </p>
        ) : null}

        {propuesta.avisos.map((a) => (
          <p className="muted-3" key={a}>
            {a}
          </p>
        ))}
        {error ? <p className="pista" style={{ color: 'var(--comida)' }}>{error}</p> : null}
      </Card>

      {/*
        La barra de lo seleccionado. Se queda pegada arriba: una pulsación
        puede marcar cuarenta y cinco líneas, y tener que subir hasta el
        principio para decidir qué se hace con ellas convertiría el atajo en
        un viaje.
      */}
      {seleccion.size > 0 ? (
        <div className="barra-seleccion">
          <span>{cuantos(seleccion.size, 'seleccionada', 'seleccionadas')}</span>

          {conPropuesta.length > 0 ? (
            <BotonPrimario onClick={aceptarPropuestas}>
              Aceptar {cuantos(conPropuesta.length, 'propuesta')}
            </BotonPrimario>
          ) : null}

          <span style={{ minWidth: 220, flex: 1 }}>
            <SelectorVariante
              variantes={opcionesDeVariante}
              valor={null}
              etiqueta="Asignar lo seleccionado a"
              onElegir={asignarSeleccion}
            />
          </span>

          <BotonTexto onClick={() => setSeleccion(new Set())}>Quitar selección</BotonTexto>
        </div>
      ) : null}

      <div className="ticket-dos">
        <div className="pila">
          <Card
            titulo="Sin asignar"
            ayuda="Lo que falta por decidir. Al asignar una, las que ponen lo mismo se asignan solas."
            derecha={
              pendientes.length > 0 ? (
                <BotonTexto onClick={resolverElResto}>Lo que quede, a «Otros»</BotonTexto>
              ) : null
            }
          >
            {pendientes.length === 0 ? (
              <p className="muted-3">Ninguna: todo tiene su sitio.</p>
            ) : (
              <>
                <div className="atajos">
                  <span className="muted">Seleccionar</span>
                  <Chip
                    etiqueta={`Seleccionar las ${pendientes.length} líneas que faltan`}
                    onClick={() => marcar(pendientes.map((l) => l.orden), true)}
                  >
                    Todas ({pendientes.length})
                  </Chip>
                  {gruposDePendientes().map(([categoria, ordenes]) => (
                    <Chip
                      key={categoria}
                      etiqueta={`Seleccionar las ${ordenes.length} de ${categoria}`}
                      onClick={() => marcar(ordenes, true)}
                    >
                      {categoria} ({ordenes.length})
                    </Chip>
                  ))}
                </div>
                {pendientes.map(filaDe)}
              </>
            )}
          </Card>

          {dudosas.length > 0 ? (
            <Card
              titulo="Conviene mirarlas"
              ayuda="Salen de una propuesta que nadie ha confirmado todavía."
            >
              {dudosas.map(filaDe)}
            </Card>
          ) : null}

          <Card titulo="Asignadas" derecha={<span className="muted">{hechas.length}</span>}>
            {hechas.length === 0 ? (
              <p className="muted-3">Todavía ninguna.</p>
            ) : (
              hechas.map(filaDe)
            )}
          </Card>

          <Card titulo="En qué se va este ticket">
            <ResumenCategorias filas={reparto} />
          </Card>
        </div>

        {propuesta.archivoRuta ? (
          <Card titulo="El ticket">
            <VisorArchivo
              url={`/api/tickets/archivo/${propuesta.archivoRuta}`}
              nombre={cabecera.tienda ?? 'Ticket'}
            />
          </Card>
        ) : null}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Una línea
// ---------------------------------------------------------------------------

function FilaTicket({
  linea,
  variantes,
  seleccionada,
  onSeleccionar,
  onAsignar,
  onCambiar,
  onBorrar,
}: {
  linea: LineaTicket
  variantes: Variante[]
  seleccionada: boolean
  onSeleccionar: (marcada: boolean) => void
  onAsignar: (cambios: Partial<LineaTicket>) => void
  onCambiar: (cambios: Partial<LineaTicket>) => void
  onBorrar: () => void
}) {
  const asignada = !!linea.varianteId || !!linea.varianteNueva

  const opciones = variantes.map((v) => ({
    id: v.id,
    nombre: v.nombre,
    marca: v.marca,
    producto: v.producto,
    categoria: v.categoria,
  }))

  return (
    <div className={`linea-ticket${asignada ? '' : ' pendiente'}${seleccionada ? ' seleccionada' : ''}`}>
      <Casilla
        marcada={seleccionada}
        etiqueta={`Seleccionar ${linea.textoTicket}`}
        onCambiar={onSeleccionar}
      />
      <span className="celda-concepto">
        <span className="row-titulo">{linea.textoTicket}</span>
        <span className="d">
          {linea.cantidad !== 1 || linea.unidad !== 'ud'
            ? `${cantidad(linea.cantidad)} ${linea.unidad}${linea.precioUnitario ? ` × ${euros(linea.precioUnitario)}` : ''}`
            : linea.precioUnitario
              ? euros(linea.precioUnitario)
              : ''}
          {linea.varianteNueva ? ` · nuevo: ${linea.varianteNueva}` : ''}
          {linea.origenAsignacion === 'alias' ? ' · recordado' : ''}
        </span>
      </span>

      <SelectorVariante
        variantes={opciones}
        valor={linea.varianteId}
        etiqueta={`Qué es "${linea.textoTicket}"`}
        propuesta={
          linea.propuesta?.variante && linea.propuesta?.producto
            ? { variante: linea.propuesta.variante, producto: linea.propuesta.producto }
            : null
        }
        onElegir={(id) => onAsignar({ varianteId: id, varianteNueva: undefined, productoNuevo: undefined })}
        onCrear={({ variante: nombreVariante, producto }) =>
          onAsignar({
            varianteId: null,
            varianteNueva: nombreVariante,
            productoNuevo: producto,
            categoriaId: linea.propuesta?.categoriaId ?? null,
            marca: linea.propuesta?.marca ?? null,
          })
        }
      />

      <span style={{ textAlign: 'right' }}>
        <CampoImporte
          valor={linea.importe}
          etiqueta={`Importe de ${linea.textoTicket}`}
          onGuardar={(v) => onCambiar({ importe: v ?? 0 })}
        />
      </span>

      <MenuFila
        etiqueta={`Más cosas de ${linea.textoTicket}`}
        opciones={[
          { id: 'recordar', nombre: linea.recordar ? 'No recordar' : 'Recordar', icono: 'chispa' },
          { id: 'descuento', nombre: 'Marcar como descuento', icono: 'dividir' },
          { id: 'borrar', nombre: 'Quitar la línea', icono: 'papelera', peligro: true },
        ]}
        onElegir={(id) => {
          if (id === 'recordar') onCambiar({ recordar: !linea.recordar })
          if (id === 'descuento') onCambiar({ importe: -Math.abs(linea.importe) })
          if (id === 'borrar') onBorrar()
        }}
      />
    </div>
  )
}
