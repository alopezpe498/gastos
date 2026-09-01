import { useCallback, useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { AliasTicket, CategoriaProducto, Producto } from '../../lib/tipos'
import {
  BotonIcono,
  BotonPrimario,
  BotonTexto,
  Card,
  Chip,
  ErrorLinea,
  Esqueleto,
  Vacio,
} from '../../components/ui/Basicos'
import { CampoTexto, SelectorOpcion } from '../../components/ui/Campos'
import { ConfirmacionDialogo, Dialogo } from '../../components/ui/Dialogo'
import { Celda, Fila as FilaTabla, Tabla } from '../../components/ui/Tabla'
import { colorDeCategoria } from '../../components/ui/Compra'
import { useAvisos } from '../../components/ui/Toast'
import { cuantos } from '../../lib/formato'

/**
 * El catálogo de la compra: categoría → producto → variante.
 *
 * Es el que da sentido al historial de tickets. Un producto mal puesto no
 * pierde nada —las líneas apuntan a la variante, y la variante se mueve entera—
 * así que aquí se puede reordenar sin miedo: cambiar hoy la categoría de «Pollo»
 * recalcula también lo del año pasado, porque la categoría se saca por relación
 * y no se copia en cada línea.
 *
 * Lo único que borra de verdad es quitar un alias, y eso solo hace que la
 * próxima vez se vuelva a preguntar.
 */
export function Productos() {
  const { avisar, avisarError } = useAvisos()
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState<number | null>(null)
  const [fusionando, setFusionando] = useState<Producto | null>(null)
  const [nuevaCategoria, setNuevaCategoria] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [p, c] = await Promise.all([
        api<Producto[]>('/productos?variantes=1'),
        api<CategoriaProducto[]>('/categorias-producto'),
      ])
      setProductos(p)
      setCategorias(c)
    } catch (causa) {
      setError(mensajeDeError(causa))
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const cambiarProducto = async (id: number, cambios: Record<string, unknown>) => {
    try {
      await api(`/productos/${id}`, { metodo: 'PATCH', cuerpo: cambios })
      await cargar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const cambiarVariante = async (id: number, cambios: Record<string, unknown>) => {
    try {
      await api(`/productos/variantes/${id}`, { metodo: 'PATCH', cuerpo: cambios })
      await cargar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  if (error) return <ErrorLinea mensaje={error} onReintentar={() => void cargar()} />
  if (!productos) return <Esqueleto />

  const porCategoria = categorias
    .map((c) => ({ categoria: c, suyos: productos.filter((p) => p.categoriaId === c.id) }))
    .filter((g) => g.suyos.length > 0)

  const opcionesCategoria = categorias.map((c) => ({ id: String(c.id), nombre: c.nombre }))

  return (
    <div className="pila">
      <Card
        titulo="Categorías"
        ayuda="Las de la compra, no las de los conceptos del mes. Cambiar una recalcula todo el histórico: las líneas no se tocan."
        derecha={
          <span className="fila-campos">
            <span style={{ width: 180 }}>
              <CampoTexto
                valor={nuevaCategoria}
                etiqueta="Categoría nueva"
                placeholder="Categoría nueva…"
                visible
                onGuardar={setNuevaCategoria}
              />
            </span>
            <BotonPrimario
              disabled={!nuevaCategoria.trim()}
              onClick={async () => {
                try {
                  await api('/categorias-producto', {
                    metodo: 'POST',
                    cuerpo: { nombre: nuevaCategoria.trim() },
                  })
                  setNuevaCategoria('')
                  await cargar()
                } catch (causa) {
                  avisarError(mensajeDeError(causa))
                }
              }}
            >
              Añadir
            </BotonPrimario>
          </span>
        }
      >
        <div className="fila-campos" style={{ flexWrap: 'wrap', gap: 6 }}>
          {categorias.map((c, indice) => (
            <Chip key={c.id} color={colorDeCategoria(c.nombre, indice)} punto>
              {c.nombre}
              <span className="d"> · {productos.filter((p) => p.categoriaId === c.id).length}</span>
            </Chip>
          ))}
        </div>
      </Card>

      {porCategoria.length === 0 ? (
        <Vacio frase="El catálogo se llena solo al guardar tickets: cada cosa que se compra entra aquí." />
      ) : null}

      {porCategoria.map(({ categoria, suyos }) => (
        <Card
          key={categoria.id}
          titulo={categoria.nombre}
          derecha={<span className="muted">{cuantos(suyos.length, 'producto')}</span>}
        >
          <Tabla
            etiqueta={`Productos de ${categoria.nombre}`}
            columnas={[
              { clave: 'producto', titulo: 'Producto' },
              { clave: 'variantes', titulo: 'Variantes', num: true, ancho: 100 },
              { clave: 'categoria', titulo: 'Categoría', ancho: 240 },
              { clave: 'acciones', titulo: '', ancho: 60 },
            ]}
          >
            {suyos.map((producto) => (
              <FilaProducto
                key={producto.id}
                producto={producto}
                abierto={abierto === producto.id}
                opcionesCategoria={opcionesCategoria}
                onAbrir={() => setAbierto((a) => (a === producto.id ? null : producto.id))}
                onCambiar={(cambios) => void cambiarProducto(producto.id, cambios)}
                onCambiarVariante={cambiarVariante}
                onFusionar={() => setFusionando(producto)}
              />
            ))}
          </Tabla>
        </Card>
      ))}

      {fusionando ? (
        <DialogoFusion
          producto={fusionando}
          productos={productos}
          onCerrar={() => setFusionando(null)}
          onHecho={async (nombre) => {
            setFusionando(null)
            await cargar()
            avisar(`Fusionado con «${nombre}». El historial es ahora de los dos.`)
          }}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Un producto, con sus variantes dentro
// ---------------------------------------------------------------------------

function FilaProducto({
  producto,
  abierto,
  opcionesCategoria,
  onAbrir,
  onCambiar,
  onCambiarVariante,
  onFusionar,
}: {
  producto: Producto
  abierto: boolean
  opcionesCategoria: { id: string; nombre: string }[]
  onAbrir: () => void
  onCambiar: (cambios: Record<string, unknown>) => void
  onCambiarVariante: (id: number, cambios: Record<string, unknown>) => Promise<void>
  onFusionar: () => void
}) {
  const variantes = producto.variantes ?? []

  return (
    <>
      <FilaTabla>
        <Celda>
          <span className="fila-campos" style={{ gap: 6, flexWrap: 'nowrap', maxWidth: 320 }}>
            <span className="celda-abrir">
              {variantes.length > 0 ? (
                <BotonIcono
                  icono={abierto ? 'abajo' : 'chevron'}
                  etiqueta={`${abierto ? 'Cerrar' : 'Ver'} las variantes de ${producto.nombre}`}
                  size={14}
                  expandido={abierto}
                  onClick={onAbrir}
                />
              ) : null}
            </span>
            <CampoTexto
              valor={producto.nombre}
              etiqueta={`Nombre de ${producto.nombre}`}
              maxLength={80}
              onGuardar={(nombre) => {
                if (nombre.trim() && nombre !== producto.nombre) onCambiar({ nombre: nombre.trim() })
              }}
            />
          </span>
        </Celda>
        <Celda num>{variantes.length}</Celda>
        <Celda>
          <SelectorOpcion
            valor={String(producto.categoriaId)}
            opciones={opcionesCategoria}
            etiqueta={`Categoría de ${producto.nombre}`}
            onElegir={(id) => onCambiar({ categoriaId: Number(id) })}
          />
        </Celda>
        <Celda>
          <BotonIcono icono="copiar" etiqueta={`Fusionar ${producto.nombre}`} onClick={onFusionar} />
        </Celda>
      </FilaTabla>

      {abierto
        ? variantes.map((v) => (
            <FilaTabla key={v.id}>
              <Celda>
                <span className="fila-campos" style={{ gap: 6, flexWrap: 'nowrap', maxWidth: 320 }}>
                  <span className="celda-abrir" />
                  <CampoTexto
                    valor={v.nombre}
                    etiqueta={`Nombre de ${v.nombre}`}
                    maxLength={120}
                    onGuardar={(nombre) => {
                      if (nombre.trim() && nombre !== v.nombre) {
                        void onCambiarVariante(v.id, { nombre: nombre.trim() })
                      }
                    }}
                  />
                  {v.marca ? <span className="d">{v.marca}</span> : null}
                </span>
              </Celda>
              <Celda num>
                <span className="d">{v.unidadHabitual}</span>
              </Celda>
              <Celda colSpan={2}>
                <Alias varianteId={v.id} />
              </Celda>
            </FilaTabla>
          ))
        : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Los alias de una variante
// ---------------------------------------------------------------------------

/**
 * Cómo se llama esa cosa en el ticket.
 *
 * Se enseña aquí para poder quitar los que estén mal: un alias equivocado hace
 * que la línea se asigne sola cada mes al producto que no es, y desde el ticket
 * no se ve por qué. Los que puso la IA salen marcados: no los ha mirado nadie.
 */
function Alias({ varianteId }: { varianteId: number }) {
  const [alias, setAlias] = useState<AliasTicket[] | null>(null)

  const cargar = useCallback(async () => {
    try {
      setAlias(await api<AliasTicket[]>(`/productos/alias?variante=${varianteId}`))
    } catch {
      setAlias([])
    }
  }, [varianteId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (!alias || alias.length === 0) return <span className="d">sin alias</span>

  return (
    <span className="fila-campos" style={{ flexWrap: 'wrap', gap: 6 }}>
      {alias.map((a) => (
        <span className="chip" key={a.id}>
          {a.textoTicket}
          {a.tienda ? <span className="d"> · {a.tienda}</span> : null}
          {a.confirmado ? null : <span className="d"> · sin confirmar</span>}
          <BotonIcono
            icono="cerrar"
            etiqueta={`Quitar el alias ${a.textoTicket}`}
            size={13}
            onClick={async () => {
              await api(`/productos/alias/${a.id}`, { metodo: 'DELETE' })
              await cargar()
            }}
          />
        </span>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Fusionar
// ---------------------------------------------------------------------------

function DialogoFusion({
  producto,
  productos,
  onCerrar,
  onHecho,
}: {
  producto: Producto
  productos: Producto[]
  onCerrar: () => void
  onHecho: (nombre: string) => void | Promise<void>
}) {
  const [destino, setDestino] = useState<number | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const elegido = productos.find((p) => p.id === destino) ?? null

  return (
    <Dialogo titulo={`Fusionar «${producto.nombre}»`} onCerrar={onCerrar}>
      {confirmando && elegido ? (
        <ConfirmacionDialogo
          frase={`«${producto.nombre}» desaparece y sus variantes pasan a «${elegido.nombre}».`}
          detalle="El historial no se pierde: las líneas siguen apuntando a las mismas variantes, que cambian de padre."
          textoConfirmar={`Sí, fusionar con ${elegido.nombre}`}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={async () => {
            await api('/productos/fusionar', {
              metodo: 'POST',
              cuerpo: { seVa: producto.id, seQueda: elegido.id },
            })
            await onHecho(elegido.nombre)
          }}
        />
      ) : (
        <>
          <p className="muted">
            Elige con cuál se queda. Es para cuando la misma cosa ha entrado dos veces con nombres
            parecidos.
          </p>
          <div style={{ maxHeight: 320, overflow: 'auto', marginTop: 10 }}>
            {productos
              .filter((p) => p.id !== producto.id)
              .map((p) => (
                <label className="fila" key={p.id}>
                  <input
                    type="radio"
                    name="fusion"
                    className="casilla"
                    checked={destino === p.id}
                    onChange={() => setDestino(p.id)}
                  />
                  <span className="fila-cuerpo">
                    <span className="fila-titulo">{p.nombre}</span>
                    <span className="fila-detalle">{p.categoria}</span>
                  </span>
                </label>
              ))}
          </div>
          <div className="fila-campos" style={{ marginTop: 12 }}>
            <BotonPrimario disabled={!destino} onClick={() => setConfirmando(true)}>
              Continuar
            </BotonPrimario>
            <BotonTexto onClick={onCerrar}>Cancelar</BotonTexto>
          </div>
        </>
      )}
    </Dialogo>
  )
}
