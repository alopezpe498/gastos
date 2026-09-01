import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type {
  FichaProducto,
  HabitosCompra,
  ProductoDelRango,
  RepartoCompra,
  TiendaDelRango,
} from '../../lib/tipos'
import { Card, ErrorLinea, Esqueleto, Vacio } from '../../components/ui/Basicos'
import { CampoTexto } from '../../components/ui/Campos'
import { Celda, Fila as FilaTabla, Tabla } from '../../components/ui/Tabla'
import { BarrasRanking, Dato, Migas } from '../../components/ui/Compra'
import { cuantos, euros, fechaCorta, redondo } from '../../lib/formato'

/**
 * En qué se va la compra.
 *
 * La pregunta de esta pantalla no es «cuánto gasto en comida» —eso ya lo dice
 * el mes— sino en qué se reparte ese dinero. Por eso se navega hacia dentro:
 * categoría → producto → cada compra con su precio, que es el único sitio donde
 * se ve si el aceite ha subido o si en una tienda sale más caro.
 *
 * Todo sale de las líneas de los tickets. Un rango sin tickets no dice «0 €»:
 * dice que no hay tickets, que es otra cosa.
 */

type Donde =
  | { nivel: 'categorias' }
  | { nivel: 'productos'; categoriaId: number; categoria: string }
  | { nivel: 'producto'; productoId: number; desdeCategoria?: { id: number; nombre: string } }

export function Compra({ consulta }: { consulta: string }) {
  const [reparto, setReparto] = useState<RepartoCompra | null>(null)
  const [error, setError] = useState('')
  const [donde, setDonde] = useState<Donde>({ nivel: 'categorias' })
  const [busca, setBusca] = useState('')

  useEffect(() => {
    let vigente = true
    setError('')
    setReparto(null)
    setDonde({ nivel: 'categorias' })
    api<RepartoCompra>(`/analitica/compra/reparto${consulta ? `?${consulta}` : ''}`)
      .then((d) => vigente && setReparto(d))
      .catch((causa) => vigente && setError(mensajeDeError(causa)))
    return () => {
      vigente = false
    }
  }, [consulta])

  if (error) return <ErrorLinea mensaje={error} />
  if (!reparto) return <Esqueleto />

  if (reparto.tickets === 0) {
    return (
      <Vacio frase="Todavía no hay ningún ticket en este rango. Sube la foto de uno desde Importar › Tickets y aquí aparecerá en qué se ha ido la compra." />
    )
  }

  return (
    <div className="pila">
      <Card titulo="La compra en este rango">
        <div className="fila-campos" style={{ gap: 28, flexWrap: 'wrap' }}>
          <Dato etiqueta="Tickets">{reparto.tickets}</Dato>
          <Dato etiqueta="Total">{reparto.total === null ? '—' : euros(reparto.total)}</Dato>
          <Dato etiqueta="Categorías">{reparto.categorias.length}</Dato>
        </div>
        <div style={{ marginTop: 12, maxWidth: 320 }}>
          <CampoTexto
            valor={busca}
            etiqueta="Buscar un producto"
            placeholder="Buscar un producto… «pollo»"
            visible
            onGuardar={setBusca}
          />
        </div>
      </Card>

      {busca.trim().length > 2 ? (
        <Busqueda
          consulta={consulta}
          texto={busca.trim()}
          onAbrir={(productoId) => {
            setBusca('')
            setDonde({ nivel: 'producto', productoId })
          }}
        />
      ) : donde.nivel === 'categorias' ? (
        <Card titulo="En qué se va" ayuda="Pulsa una categoría para ver sus productos.">
          <BarrasRanking
            filas={reparto.categorias.map((c) => ({
              id: c.id ?? c.nombre,
              nombre: c.nombre,
              importe: c.total,
              parte: c.parte,
              detalle: cuantos(c.lineas, 'línea', 'líneas'),
            }))}
            onElegir={(id) => {
              const categoria = reparto.categorias.find((c) => (c.id ?? c.nombre) === id)
              if (categoria?.id) {
                setDonde({ nivel: 'productos', categoriaId: categoria.id, categoria: categoria.nombre })
              }
            }}
          />
        </Card>
      ) : donde.nivel === 'productos' ? (
        <Productos
          consulta={consulta}
          categoriaId={donde.categoriaId}
          categoria={donde.categoria}
          onVolver={() => setDonde({ nivel: 'categorias' })}
          onAbrir={(productoId) =>
            setDonde({
              nivel: 'producto',
              productoId,
              desdeCategoria: { id: donde.categoriaId, nombre: donde.categoria },
            })
          }
        />
      ) : (
        <Producto
          consulta={consulta}
          productoId={donde.productoId}
          onVolver={() =>
            donde.desdeCategoria
              ? setDonde({
                  nivel: 'productos',
                  categoriaId: donde.desdeCategoria.id,
                  categoria: donde.desdeCategoria.nombre,
                })
              : setDonde({ nivel: 'categorias' })
          }
          volverA={donde.desdeCategoria?.nombre ?? 'Categorías'}
        />
      )}

      <Tiendas consulta={consulta} />
      <Habitos consulta={consulta} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Los productos de una categoría
// ---------------------------------------------------------------------------

function Productos({
  consulta,
  categoriaId,
  categoria,
  onVolver,
  onAbrir,
}: {
  consulta: string
  categoriaId: number
  categoria: string
  onVolver: () => void
  onAbrir: (productoId: number) => void
}) {
  const [datos, setDatos] = useState<ProductoDelRango[] | null>(null)

  useEffect(() => {
    let vigente = true
    setDatos(null)
    api<ProductoDelRango[]>(
      `/analitica/compra/productos?categoria=${categoriaId}${consulta ? `&${consulta}` : ''}`,
    )
      .then((d) => vigente && setDatos(d))
      .catch(() => vigente && setDatos([]))
    return () => {
      vigente = false
    }
  }, [consulta, categoriaId])

  return (
    <Card titulo={categoria}>
      <Migas pasos={[{ nombre: 'Categorías', onVolver }, { nombre: categoria }]} />
      {datos === null ? (
        <Esqueleto />
      ) : (
        <BarrasRanking
          filas={datos.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            importe: p.total,
            parte: null,
            detalle: `${cuantos(p.compras, 'compra')}${p.kg ? ` · ${redondo(p.kg)} kg`.replace(' €', '') : ''}`,
          }))}
          onElegir={(id) => onAbrir(Number(id))}
          vacio="Nada de esta categoría en el rango."
        />
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Un producto por dentro
// ---------------------------------------------------------------------------

function Producto({
  consulta,
  productoId,
  onVolver,
  volverA,
}: {
  consulta: string
  productoId: number
  onVolver: () => void
  volverA: string
}) {
  const [ficha, setFicha] = useState<FichaProducto | null>(null)

  useEffect(() => {
    let vigente = true
    setFicha(null)
    api<FichaProducto>(`/analitica/compra/producto/${productoId}${consulta ? `?${consulta}` : ''}`)
      .then((d) => vigente && setFicha(d))
      .catch(() => vigente && setFicha(null))
    return () => {
      vigente = false
    }
  }, [consulta, productoId])

  if (!ficha) return <Esqueleto />

  return (
    <div className="pila">
      <Card titulo={ficha.nombre}>
        <Migas pasos={[{ nombre: volverA, onVolver }, { nombre: ficha.nombre }]} />
        <div className="fila-campos" style={{ gap: 28, flexWrap: 'wrap' }}>
          <Dato etiqueta="Gastado">{ficha.total === null ? '—' : euros(ficha.total)}</Dato>
          <Dato etiqueta="Compras">{ficha.compras}</Dato>
          <Dato etiqueta="Categoría">{ficha.categoria}</Dato>
        </div>
      </Card>

      <Card titulo="Variantes" ayuda="Lo que de verdad se compra, y a cómo sale cada una.">
        <Tabla
          etiqueta={`Variantes de ${ficha.nombre}`}
          columnas={[
            { clave: 'variante', titulo: 'Variante' },
            { clave: 'compras', titulo: 'Compras', num: true, ancho: 90 },
            { clave: 'cantidad', titulo: 'Cantidad', num: true, ancho: 100 },
            { clave: 'precio', titulo: 'Precio medio', num: true, ancho: 120 },
            { clave: 'total', titulo: 'Gastado', num: true, ancho: 110 },
          ]}
        >
          {ficha.variantes.map((v) => (
            <FilaTabla key={v.id}>
              <Celda>
                <span className="celda-concepto">
                  <span className="row-titulo">{v.nombre}</span>
                  {v.marca ? <span className="d">{v.marca}</span> : null}
                </span>
              </Celda>
              <Celda num>{v.compras}</Celda>
              <Celda num>
                {v.cantidad.toLocaleString('es-ES', { maximumFractionDigits: 3 })} {v.unidad}
              </Celda>
              <Celda num>{v.precioMedio === null ? '—' : euros(v.precioMedio)}</Celda>
              <Celda num>{euros(v.total)}</Celda>
            </FilaTabla>
          ))}
        </Tabla>
      </Card>

      {ficha.tiendas.length > 1 ? (
        <Card titulo="Dónde sale más barato" ayuda="El mismo producto, comparado entre tiendas.">
          <BarrasRanking
            filas={ficha.tiendas.map((t) => ({
              id: t.tienda,
              nombre: t.tienda,
              importe: t.precioMedio,
              parte: null,
              detalle: `${cuantos(t.compras, 'compra')} · de ${euros(t.minimo)} a ${euros(t.maximo)}`,
            }))}
          />
        </Card>
      ) : null}

      <Card titulo="Cada compra" ayuda="Con su fecha, su tienda y el precio de ese día.">
        <Tabla
          etiqueta={`Compras de ${ficha.nombre}`}
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', ancho: 110 },
            { clave: 'tienda', titulo: 'Tienda', ancho: 140 },
            { clave: 'que', titulo: 'Qué' },
            { clave: 'cantidad', titulo: 'Cantidad', num: true, ancho: 100 },
            { clave: 'precio', titulo: 'Precio', num: true, ancho: 100 },
            { clave: 'importe', titulo: 'Importe', num: true, ancho: 100 },
          ]}
        >
          {ficha.detalle.map((d) => (
            <FilaTabla key={d.id}>
              <Celda>{d.fecha ? fechaCorta(d.fecha.slice(0, 10)) : '—'}</Celda>
              <Celda>{d.tienda ?? '—'}</Celda>
              <Celda>
                <span className="celda-concepto">
                  <span className="row-titulo">{d.variante}</span>
                  <span className="d">{d.texto}</span>
                </span>
              </Celda>
              <Celda num>
                {d.cantidad.toLocaleString('es-ES', { maximumFractionDigits: 3 })} {d.unidad}
              </Celda>
              <Celda num>{d.precio === null ? '—' : euros(d.precio)}</Celda>
              <Celda num>{euros(d.importe)}</Celda>
            </FilaTabla>
          ))}
        </Tabla>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Buscar
// ---------------------------------------------------------------------------

function Busqueda({
  consulta,
  texto,
  onAbrir,
}: {
  consulta: string
  texto: string
  onAbrir: (productoId: number) => void
}) {
  const [datos, setDatos] = useState<ProductoDelRango[] | null>(null)

  useEffect(() => {
    let vigente = true
    setDatos(null)
    api<ProductoDelRango[]>(
      `/analitica/compra/buscar?q=${encodeURIComponent(texto)}${consulta ? `&${consulta}` : ''}`,
    )
      .then((d) => vigente && setDatos(d))
      .catch(() => vigente && setDatos([]))
    return () => {
      vigente = false
    }
  }, [consulta, texto])

  return (
    <Card titulo={`«${texto}»`}>
      {datos === null ? (
        <Esqueleto />
      ) : (
        <BarrasRanking
          filas={datos.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            importe: p.total,
            parte: null,
            detalle: `${p.categoria} · ${cuantos(p.compras, 'compra')}`,
          }))}
          onElegir={(id) => onAbrir(Number(id))}
          vacio="Nada que se llame así en este rango."
        />
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tiendas y hábitos
// ---------------------------------------------------------------------------

function Tiendas({ consulta }: { consulta: string }) {
  const [datos, setDatos] = useState<TiendaDelRango[] | null>(null)

  useEffect(() => {
    let vigente = true
    api<TiendaDelRango[]>(`/analitica/compra/tiendas${consulta ? `?${consulta}` : ''}`)
      .then((d) => vigente && setDatos(d))
      .catch(() => vigente && setDatos([]))
    return () => {
      vigente = false
    }
  }, [consulta])

  if (!datos || datos.length === 0) return null

  return (
    <Card titulo="Tiendas" ayuda="Cuánto se deja en cada una, y cuánto sale un ticket.">
      <Tabla
        etiqueta="Gasto por tienda"
        columnas={[
          { clave: 'tienda', titulo: 'Tienda' },
          { clave: 'tickets', titulo: 'Tickets', num: true, ancho: 90 },
          { clave: 'medio', titulo: 'Ticket medio', num: true, ancho: 120 },
          { clave: 'lineas', titulo: 'Líneas', num: true, ancho: 90 },
          { clave: 'total', titulo: 'Total', num: true, ancho: 110 },
        ]}
      >
        {datos.map((t) => (
          <FilaTabla key={t.tienda}>
            <Celda>{t.tienda}</Celda>
            <Celda num>{t.tickets}</Celda>
            <Celda num>{t.ticketMedio === null ? '—' : euros(t.ticketMedio)}</Celda>
            <Celda num>{t.lineasPorTicket ?? '—'}</Celda>
            <Celda num>{euros(t.total)}</Celda>
          </FilaTabla>
        ))}
      </Tabla>
    </Card>
  )
}

function Habitos({ consulta }: { consulta: string }) {
  const [datos, setDatos] = useState<HabitosCompra | null>(null)

  useEffect(() => {
    let vigente = true
    api<HabitosCompra>(`/analitica/compra/habitos${consulta ? `?${consulta}` : ''}`)
      .then((d) => vigente && setDatos(d))
      .catch(() => vigente && setDatos(null))
    return () => {
      vigente = false
    }
  }, [consulta])

  if (!datos || datos.tickets === 0) return null

  return (
    <Card titulo="Cuándo se compra">
      <div className="fila-campos" style={{ gap: 28, flexWrap: 'wrap', marginBottom: 12 }}>
        <Dato etiqueta="Ticket medio">
          {datos.ticketMedio === null ? '—' : euros(datos.ticketMedio)}
        </Dato>
        <Dato etiqueta="Líneas por ticket">{datos.lineasMedias ?? '—'}</Dato>
      </div>
      <BarrasRanking
        filas={datos.porDia
          .filter((d) => d.tickets > 0)
          .map((d) => ({
            id: d.dia,
            nombre: d.dia,
            importe: d.total ?? 0,
            parte: null,
            detalle: cuantos(d.tickets, 'ticket'),
          }))}
        vacio="Los tickets no traen fecha."
      />
    </Card>
  )
}
