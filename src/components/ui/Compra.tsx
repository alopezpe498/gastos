import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { euros, redondo } from '../../lib/formato'
import { BotonIcono, BotonTexto } from './Basicos'
import { Icono } from './Icono'

/**
 * Las piezas que pide el detalle de la compra.
 *
 * Cuatro cosas que no existían en la caja y que hacen falta las tres pantallas
 * nuevas: elegir una variante creando lo que falte, un ranking en el que se
 * pueda bajar un nivel, las migas para saber dónde estás, y el visor del ticket
 * original para poder comprobar una línea.
 */

// ---------------------------------------------------------------------------
// El color de cada categoría
// ---------------------------------------------------------------------------

/*
 * Estable por NOMBRE y no por id: el id cambia entre una instalación y otra, y
 * la fruta tiene que ser del mismo color en las dos. Los que no están en la
 * lista se reparten por su posición en el catálogo, como los conceptos.
 */
const COLOR_DE_CATEGORIA: Record<string, string> = {
  Fruta: 'var(--ambar)',
  'Verdura y hortalizas': 'var(--ok)',
  'Carne y charcutería': 'var(--comida)',
  'Pescado y marisco': 'var(--azul)',
  'Lácteos y huevos': 'var(--extras)',
  'Panadería y bollería': 'var(--ambar)',
  Despensa: 'var(--tinta-2)',
  Congelados: 'var(--azul)',
  'Platos preparados y snacks': 'var(--rosa)',
  Bebidas: 'var(--extras)',
  Limpieza: 'var(--ok)',
  'Higiene y cuidado personal': 'var(--rosa)',
  Mascotas: 'var(--ambar)',
  Otros: 'var(--tinta-3)',
}

const RUEDA = [
  'var(--extras)',
  'var(--ok)',
  'var(--ambar)',
  'var(--azul)',
  'var(--rosa)',
  'var(--comida)',
]

export function colorDeCategoria(nombre: string | null | undefined, indice = 0): string {
  if (!nombre) return 'var(--tinta-3)'
  return COLOR_DE_CATEGORIA[nombre] ?? RUEDA[indice % RUEDA.length]
}

// ---------------------------------------------------------------------------
// Barras de ranking
// ---------------------------------------------------------------------------

export type BarraRanking = {
  id: string | number
  nombre: string
  importe: number
  /** Parte del total, de 0 a 1. `null` cuando no hay total con el que dividir. */
  parte: number | null
  color?: string
  detalle?: string
}

/**
 * El reparto, en barras horizontales que se pueden pulsar para bajar un nivel.
 *
 * Horizontales y no un donut porque lo que se compara son nombres largos con
 * cifras al lado, y un donut de catorce trozos no se lee. La barra está
 * escalada contra el mayor, no contra el total: si el primero es el 31 %, una
 * barra al 31 % de ancho desperdicia dos tercios de la fila.
 */
export function BarrasRanking({
  filas,
  onElegir,
  vacio = 'Todavía no hay nada que repartir.',
}: {
  filas: BarraRanking[]
  onElegir?: (id: string | number) => void
  vacio?: string
}) {
  if (filas.length === 0) return <p className="muted-3">{vacio}</p>

  const mayor = Math.max(...filas.map((f) => Math.abs(f.importe)), 0.01)

  return (
    <div className="barras">
      {filas.map((fila, indice) => {
        const contenido = (
          <>
            <span className="barras-cabeza">
              <span className="barras-nombre">
                <span
                  className="dot"
                  style={{ background: fila.color ?? colorDeCategoria(fila.nombre, indice) }}
                />
                {fila.nombre}
              </span>
              <span className="barras-cifra">
                {euros(fila.importe)}
                {fila.parte === null ? null : (
                  <span className="d"> · {Math.round(fila.parte * 100)} %</span>
                )}
              </span>
            </span>
            <span className="barras-linea">
              <span
                className="barras-relleno"
                style={{
                  width: `${Math.max(2, (Math.abs(fila.importe) / mayor) * 100)}%`,
                  background: fila.color ?? colorDeCategoria(fila.nombre, indice),
                }}
              />
            </span>
            {fila.detalle ? <span className="d">{fila.detalle}</span> : null}
          </>
        )

        return onElegir ? (
          <button className="barras-fila pulsable" key={fila.id} onClick={() => onElegir(fila.id)}>
            {contenido}
          </button>
        ) : (
          <div className="barras-fila" key={fila.id}>
            {contenido}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Migas
// ---------------------------------------------------------------------------

/**
 * Dónde estás dentro de categoría → producto → variante.
 *
 * Hace falta porque la pantalla de la compra es la única que navega hacia
 * dentro: sin migas, después de dos clics no se sabe si «Pollo» son todos los
 * pollos o los de la carnicería.
 */
export function Migas({
  pasos,
}: {
  pasos: { nombre: string; onVolver?: () => void }[]
}) {
  return (
    <nav className="migas" aria-label="Dónde estás">
      {pasos.map((paso, indice) => (
        <span className="migas-paso" key={`${paso.nombre}-${indice}`}>
          {indice > 0 ? <Icono nombre="chevron" size={13} /> : null}
          {paso.onVolver ? (
            <BotonTexto onClick={paso.onVolver}>{paso.nombre}</BotonTexto>
          ) : (
            <span className="migas-actual">{paso.nombre}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// El visor del ticket
// ---------------------------------------------------------------------------

/**
 * La foto o el PDF del ticket, al lado de las líneas.
 *
 * Es lo que permite comprobar una línea: el texto que sacó la IA puede estar
 * mal, el papel no. Con zoom porque un ticket fotografiado con el móvil tiene
 * la letra a seis píxeles de alto.
 */
export function VisorArchivo({ url, nombre }: { url: string; nombre: string }) {
  const [zoom, setZoom] = useState(1)
  const esPdf = /\.pdf($|\?)/i.test(url)

  return (
    <div className="visor">
      <div className="visor-barra">
        <span className="muted">{nombre}</span>
        <span className="fila-campos" style={{ gap: 4 }}>
          <BotonIcono
            icono="cerrar"
            etiqueta="Alejar"
            size={14}
            disabled={zoom <= 1}
            onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
          />
          <span className="d">{Math.round(zoom * 100)} %</span>
          <BotonIcono
            icono="mas"
            etiqueta="Acercar"
            size={14}
            disabled={zoom >= 4}
            onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
          />
        </span>
      </div>
      <div className="visor-marco">
        {esPdf ? (
          <object data={url} type="application/pdf" className="visor-pdf" aria-label={nombre}>
            <p className="muted-3">
              El navegador no enseña el PDF aquí. <a href={url}>Ábrelo aparte</a>.
            </p>
          </object>
        ) : (
          <img
            src={url}
            alt={nombre}
            className="visor-imagen"
            style={{ width: `${zoom * 100}%` }}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// El selector de variante
// ---------------------------------------------------------------------------

export type OpcionVariante = {
  id: number
  nombre: string
  marca: string | null
  producto: string | null
  categoria: string | null
}

/**
 * Elegir qué es una línea del ticket, creando lo que falte sin salir de aquí.
 *
 * Un ticket de cuarenta y cinco líneas trae siempre cinco cosas que el catálogo
 * no tiene todavía. Si para cada una hay que irse a otra pantalla, crear el
 * producto y volver, el ticket no se acaba de revisar nunca. Por eso la caja de
 * búsqueda ofrece, cuando no encuentra nada, crear lo que se ha escrito.
 */
export function SelectorVariante({
  variantes,
  valor,
  etiqueta,
  propuesta,
  frecuentes = [],
  onElegir,
  onCrear,
}: {
  variantes: OpcionVariante[]
  valor: number | null
  etiqueta: string
  /** Lo que propone la IA, ya escrito: un clic lo confirma. */
  propuesta?: { variante: string; producto: string } | null
  frecuentes?: number[]
  onElegir: (id: number) => void
  onCrear?: (nombres: { variante: string; producto: string }) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [busca, setBusca] = useState('')
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const elegida = variantes.find((v) => v.id === valor) ?? null
  const texto = busca.trim().toLowerCase()

  const filtradas = variantes
    .filter(
      (v) =>
        !texto ||
        v.nombre.toLowerCase().includes(texto) ||
        (v.producto ?? '').toLowerCase().includes(texto) ||
        (v.marca ?? '').toLowerCase().includes(texto),
    )
    .sort((a, b) => {
      const ia = frecuentes.indexOf(a.id)
      const ib = frecuentes.indexOf(b.id)
      if (ia !== ib) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
      return a.nombre.localeCompare(b.nombre)
    })
    .slice(0, 40)

  const comoTexto = (v: OpcionVariante) =>
    `${v.nombre}${v.marca ? ` · ${v.marca}` : ''}`

  return (
    <div className="buscador" ref={caja}>
      {abierto ? (
        <input
          className="campo visible"
          autoFocus
          aria-label={etiqueta}
          placeholder="Buscar o escribir uno nuevo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAbierto(false)
            if (e.key === 'Enter' && filtradas[0]) {
              onElegir(filtradas[0].id)
              setAbierto(false)
              setBusca('')
            }
          }}
        />
      ) : (
        <button
          className="campo visible selector-variante"
          aria-label={etiqueta}
          aria-expanded={false}
          onClick={() => {
            setAbierto(true)
            setBusca('')
          }}
        >
          {elegida ? (
            <span className="celda-concepto">
              <span className="row-titulo">{comoTexto(elegida)}</span>
              <span className="d">
                {elegida.producto} · {elegida.categoria}
              </span>
            </span>
          ) : propuesta ? (
            /* La propuesta de la IA, escrita en gris: un clic la confirma. */
            <span className="celda-concepto">
              <span className="propuesta-ia">{propuesta.variante}</span>
              <span className="d">{propuesta.producto} · propuesto</span>
            </span>
          ) : (
            <span className="muted-3">Elegir…</span>
          )}
          <span style={{ marginLeft: 'auto', color: 'var(--tinta-3)' }}>
            <Icono nombre="abajo" size={14} />
          </span>
        </button>
      )}

      {abierto ? (
        <div className="buscador-lista" role="listbox">
          {propuesta && !texto ? (
            <button
              className="opcion-crear"
              onClick={() => {
                onCrear?.(propuesta)
                setAbierto(false)
              }}
            >
              <Icono nombre="chispa" size={14} />
              <span className="opcion-linea">
                <span>{propuesta.variante}</span>
                <span className="d">lo que propone la IA · {propuesta.producto}</span>
              </span>
            </button>
          ) : null}

          {filtradas.map((v) => (
            <button
              key={v.id}
              role="option"
              aria-selected={v.id === valor}
              className={v.id === valor ? 'destacada' : undefined}
              onClick={() => {
                onElegir(v.id)
                setAbierto(false)
                setBusca('')
              }}
            >
              <span className="opcion-linea">
                <span>{comoTexto(v)}</span>
                <span className="d">
                  {v.producto} · {v.categoria}
                </span>
              </span>
            </button>
          ))}

          {texto && onCrear ? (
            <button
              className="opcion-crear"
              onClick={() => {
                onCrear({ variante: busca.trim(), producto: busca.trim() })
                setAbierto(false)
                setBusca('')
              }}
            >
              <Icono nombre="mas" size={14} />
              <span className="opcion-linea">
                <span>Crear «{busca.trim()}»</span>
                <span className="d">se añade al catálogo al guardar el ticket</span>
              </span>
            </button>
          ) : null}

          {filtradas.length === 0 && !texto ? (
            <p className="buscador-vacio">El catálogo está vacío: escribe para crear el primero.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// El cuadre
// ---------------------------------------------------------------------------

/**
 * Si el ticket cuadra, y qué falta para poder guardarlo.
 *
 * Se enseña siempre, cuadre o no: saber que 45 líneas suman exactamente lo que
 * pone abajo es media razón para fiarse del detalle.
 */
export function EstadoCuadre({
  lineas,
  suma,
  total,
  cuadra,
  problemas,
}: {
  lineas: number
  suma: number
  total: number
  /** Si las líneas suman el total. Es distinto de si se puede aceptar. */
  cuadra: boolean
  problemas: string[]
}) {
  /*
   * Sumar bien y estar listo son dos cosas distintas, y decirlas juntas
   * confunde: un ticket puede cuadrar al céntimo y tener cuarenta líneas sin
   * clasificar. Primero se dice si cuadra, que es lo que da confianza en el
   * detalle; después, lo que falta por hacer.
   */
  const todoHecho = problemas.length === 0
  return (
    <p className={`cuadre${todoHecho ? ' bien' : ''}`}>
      <Icono nombre={todoHecho ? 'check' : 'aviso'} size={15} />
      <span>
        {lineas} líneas suman {euros(suma)}
        {cuadra ? ' · cuadra con el ticket' : ` y el ticket dice ${euros(total)}`}
        {problemas.length > 0 ? ` — falta: ${problemas.join(' ')}` : ''}
      </span>
    </p>
  )
}

/** El resumen por categoría de un ticket, en vivo mientras se revisa. */
export function ResumenCategorias({
  filas,
}: {
  filas: { categoria: string; importe: number; parte: number | null }[]
}) {
  if (filas.length === 0) return null
  return (
    <div className="resumen-categorias">
      {filas.map((f, indice) => (
        <span className="chip" key={f.categoria}>
          <span className="dot" style={{ background: colorDeCategoria(f.categoria, indice) }} />
          {f.categoria} {redondo(f.importe)}
          {f.parte === null ? '' : ` · ${Math.round(f.parte * 100)} %`}
        </span>
      ))}
    </div>
  )
}

/** Una cifra suelta con su etiqueta, para las cabeceras de la compra. */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <span className="dato">
      <span className="d">{etiqueta}</span>
      <span className="dato-valor">{children}</span>
    </span>
  )
}
