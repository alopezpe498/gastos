import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ErrorApi, mensajeDeError } from '../../lib/api'
import type {
  Concepto,
  ContextoMes,
  LecturaCaptura,
  MesCompleto,
  MesPorAbrir,
  Movimiento,
} from '../../lib/tipos'
import { Cabecera, Confirmar, ErrorLinea, EstadoVacio } from '../../components/Basicos'
import { EsqueletoLista, EsqueletoResumen } from '../../components/Esqueleto'
import { useAvisos } from '../../components/Avisos'
import { useEsEscritorio } from '../../lib/tamano'
import {
  IconoAjustes,
  IconoCamara,
  IconoDocumento,
  IconoMas,
  IconoPortapapeles,
} from '../../components/Iconos'
import { Sheet } from '../../components/Sheet'
import { cuantos, euros, hoyIso, NOMBRES_MESES } from '../../lib/formato'
import { ResumenMes } from './ResumenMes'
import { BarraComida } from './BarraComida'
import { TablaFijos } from './TablaFijos'
import { ListaVariables } from './ListaVariables'
import { AltaRapida } from './AltaRapida'
import { NavegacionMes, type Limites } from './NavegacionMes'
import { MenuMes } from './MenuMes'
import { RevisionCaptura } from './RevisionCaptura'
import { SheetPegar } from '../../components/SheetPegar'
import { comprimirImagen } from '../../lib/imagen'

type Props = {
  mesElegido: { anio: number; mes: number } | null
  onCambioDeMes: (mes: { anio: number; mes: number } | null) => void
  onVerAnalisis: () => void
  /** Lleva a Ajustes con el importador de extracto abierto en este mes. */
  onImportarExtracto: (mesId: number) => void
}

type Pestana = 'fijos' | 'variables' | 'resumen'

export function PantallaMes({ mesElegido, onCambioDeMes, onVerAnalisis, onImportarExtracto }: Props) {
  const { avisar, avisarError } = useAvisos()
  const escritorio = useEsEscritorio()
  const [mes, setMes] = useState<MesCompleto | null>(null)
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [pestana, setPestana] = useState<Pestana>('fijos')
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [aBorrar, setABorrar] = useState<Movimiento | null>(null)
  const [limites, setLimites] = useState<Limites | null>(null)
  // El mes al que se ha navegado y que todavía no existe: navegar no crea nada.
  const [porAbrir, setPorAbrir] = useState<(MesPorAbrir & { anio: number; mes: number }) | null>(
    null,
  )
  const [abriendo, setAbriendo] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  // Captura por foto o portapapeles: la lectura de la IA, pendiente de revisar.
  const [pegarAbierto, setPegarAbierto] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [captura, setCaptura] = useState<LecturaCaptura | null>(null)
  const [origenCaptura, setOrigenCaptura] = useState<'foto' | 'portapapeles'>('portapapeles')
  const camara = useRef<HTMLInputElement>(null)
  const selectorPdf = useRef<HTMLInputElement>(null)
  // Comparaciones con el año pasado y con la media. Se cargan aparte porque
  // recorren el histórico entero y no deben retrasar la pantalla del mes.
  const [contexto, setContexto] = useState<ContextoMes | null>(null)
  // Evita que una respuesta lenta de un mes anterior pise a la del mes actual.
  const peticion = useRef(0)

  const cargar = useCallback(async () => {
    const mia = ++peticion.current
    setCargando(true)
    setError('')
    try {
      /*
       * Navegar NO crea nada: se pide el mes y, si no existe, la pantalla lo
       * dice y ofrece abrirlo. Crear un mes es siempre un acto explicito.
       */
      const [catalogo, topes] = await Promise.all([
        api<Concepto[]>('/conceptos?activos=1'),
        api<Limites>('/meses/limites'),
      ])
      if (mia !== peticion.current) return
      setConceptos(catalogo)
      setLimites(topes)

      if (!mesElegido) {
        // Sin mes pedido, el que toca: el de hoy si existe, y si no el ultimo.
        const datos = await api<MesCompleto | null>('/meses/actual')
        if (mia !== peticion.current) return
        setMes(datos)
        setPorAbrir(null)
        return
      }

      try {
        const datos = await api<MesCompleto>(`/meses/${mesElegido.anio}/${mesElegido.mes}`)
        if (mia !== peticion.current) return
        setMes(datos)
        setPorAbrir(null)
      } catch (causa) {
        if (mia !== peticion.current) return
        // Un 404 aqui no es un error: es un mes al que todavia no se ha entrado.
        if (!(causa instanceof ErrorApi) || causa.estado !== 404) throw causa
        const info = await api<MesPorAbrir>(
          `/meses/por-abrir/${mesElegido.anio}/${mesElegido.mes}`,
        )
        if (mia !== peticion.current) return
        setMes(null)
        setPorAbrir({ ...info, anio: mesElegido.anio, mes: mesElegido.mes })
      }
    } catch (causa) {
      if (mia !== peticion.current) return
      setError(mensajeDeError(causa))
    } finally {
      if (mia === peticion.current) setCargando(false)
    }
  }, [mesElegido])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    const id = mes?.id
    if (!id) return
    let vigente = true
    setContexto(null)
    api<ContextoMes>(`/analitica/contexto/${id}`)
      .then((datos) => vigente && setContexto(datos))
      // Sin contexto la pantalla funciona igual: solo pierde las flechas.
      .catch(() => undefined)
    return () => {
      vigente = false
    }
  }, [mes?.id])

  /** Recarga solo el mes: tras cada apunte, el catalogo no ha cambiado. */
  const recargarMes = useCallback(async () => {
    if (!mes) return
    try {
      setMes(await api<MesCompleto>(`/meses/${mes.anio}/${mes.mes}`))
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }, [mes, avisarError])

  const conceptosVariables = useMemo(
    () => conceptos.filter((c) => c.tipo === 'variable' || c.tipo === 'sobre'),
    [conceptos],
  )

  // ---------- acciones ----------

  const cambiarMes = async (cambios: Record<string, unknown>) => {
    if (!mes) return
    try {
      setMes(await api<MesCompleto>(`/meses/${mes.id}`, { metodo: 'PATCH', cuerpo: cambios }))
    } catch (causa) {
      avisarError(mensajeDeError(causa))
      await recargarMes()
    }
  }

  const cambiarMovimiento = async (id: number, cambios: Record<string, unknown>) => {
    try {
      await api(`/movimientos/${id}`, { metodo: 'PATCH', cuerpo: cambios })
      await recargarMes()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
      await recargarMes()
    }
  }

  const alternarCobro = async (movimiento: Movimiento) => {
    try {
      if (movimiento.cobrado) {
        await api(`/movimientos/${movimiento.id}/cobro`, { metodo: 'DELETE' })
      } else {
        await api(`/movimientos/${movimiento.id}/cobro`, { metodo: 'POST', cuerpo: {} })
      }
      await recargarMes()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const apuntar = async (datos: {
    conceptoId: number
    importe: number
    fechaCobro: string
    descripcion: string
  }) => {
    if (!mes) return
    try {
      await api('/movimientos', { metodo: 'POST', cuerpo: { mesId: mes.id, ...datos } })
      await recargarMes()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  /**
   * Manda a la IA lo que se haya pegado o fotografiado. Lo que vuelve NO se
   * guarda: se abre la pantalla de revision.
   */
  const leerCaptura = async (
    cuerpo: Record<string, unknown>,
    origen: 'foto' | 'portapapeles',
  ) => {
    if (!mes) return
    setPegarAbierto(false)
    setLeyendo(true)
    setOrigenCaptura(origen)
    try {
      setCaptura(
        await api<LecturaCaptura>('/importar/captura', {
          metodo: 'POST',
          cuerpo: { mesId: mes.id, ...cuerpo },
        }),
      )
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setLeyendo(false)
    }
  }

  /**
   * Una factura en PDF (la del comedor, la de la luz). El servidor le saca el
   * texto y la manda a la IA como texto: sale mas exacto que fotografiarla.
   */
  const leerPdf = async (archivo: File) => {
    setLeyendo(true)
    try {
      const base64 = await new Promise<string>((resolver, rechazar) => {
        const lector = new FileReader()
        lector.onload = () => resolver(String(lector.result).split(',')[1] ?? '')
        lector.onerror = () => rechazar(new Error('No se ha podido leer el PDF.'))
        lector.readAsDataURL(archivo)
      })
      await leerCaptura({ pdf: base64, pista: `El archivo se llama "${archivo.name}".` }, 'foto')
    } catch (causa) {
      avisarError(mensajeDeError(causa))
      setLeyendo(false)
    }
  }

  const leerImagen = async (imagen: Blob, origen: 'foto' | 'portapapeles') => {
    setLeyendo(true)
    try {
      // Se comprime en el navegador: una foto de movil son varios MB y lo que
      // necesita el modelo cabe de sobra en 1500 px.
      const { base64, tipo } = await comprimirImagen(imagen)
      await leerCaptura({ imagen: base64, tipoImagen: tipo }, origen)
    } catch (causa) {
      avisarError(mensajeDeError(causa))
      setLeyendo(false)
    }
  }

  /** Abre el mes al que se ha navegado, con los que queden por medio. */
  const abrirEsteMes = async (anio: number, numeroMes: number) => {
    setAbriendo(true)
    try {
      const nuevo = await api<MesCompleto>('/meses/asegurar', {
        metodo: 'POST',
        cuerpo: { anio, mes: numeroMes },
      })
      const creados = nuevo.creados ?? []
      avisar(
        creados.length > 0
          ? `${nuevo.nombreMes} abierto, y también ${creados.map((c) => c.nombre).join(', ')}.`
          : `${nuevo.nombreMes} de ${nuevo.anio} abierto con ${cuantos(nuevo.fijos.length, 'fijo')}.`,
      )
      onCambioDeMes({ anio: nuevo.anio, mes: nuevo.mes })
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setAbriendo(false)
    }
  }

  /**
   * Atajo de la cabecera: abre el mes que va detras del que se esta viendo.
   *
   * Va por su propia ruta y no por "asegurar" a proposito: asegurar es
   * idempotente y se callaria si el mes ya existiera. Aqui interesa lo
   * contrario, que avise, porque el boton solo se pulsa para crear algo.
   */
  const abrirSiguiente = async () => {
    if (!mes) return
    setAbriendo(true)
    try {
      const nuevo = await api<MesCompleto>(`/meses/${mes.id}/siguiente`, { metodo: 'POST' })
      avisar(
        `${nuevo.nombreMes} de ${nuevo.anio} abierto con ${cuantos(nuevo.fijos.length, 'fijo')} y ` +
          `${euros(nuevo.ingreso)} de ingreso.`,
      )
      onCambioDeMes({ anio: nuevo.anio, mes: nuevo.mes })
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setAbriendo(false)
    }
  }

  const borrar = async () => {
    if (!aBorrar) return
    const movimiento = aBorrar
    setABorrar(null)
    try {
      await api(`/movimientos/${movimiento.id}`, { metodo: 'DELETE' })
      avisar(`"${movimiento.concepto}" borrado.`)
      await recargarMes()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  // ---------- estados de carga ----------

  if (error) {
    return (
      <>
        <Cabecera titulo="Mes" />
        <div className="limite">
          <ErrorLinea mensaje={error} onReintentar={() => void cargar()} />
        </div>
      </>
    )
  }

  if (cargando && !mes) {
    return (
      <>
        <Cabecera titulo="Mes" />
        <div className="limite">
          <EsqueletoResumen />
          <EsqueletoLista filas={8} />
        </div>
      </>
    )
  }

  // Un mes al que se ha navegado y que todavía no se ha abierto. Se puede
  // mirar, pero no hay nada que mirar: lo que hay es un botón para abrirlo.
  if (porAbrir) {
    const nombre = NOMBRES_MESES[porAbrir.mes - 1]
    return (
      <>
        <Cabecera
          titulo={`${nombre} ${porAbrir.anio}`}
          subtitulo="Sin abrir"
          debajo={
            <NavegacionMes
              anio={porAbrir.anio}
              mes={porAbrir.mes}
              limites={limites}
              onIr={(anio, numeroMes) => onCambioDeMes({ anio, mes: numeroMes })}
            />
          }
          anchaEnEscritorio
        />

        <div className="limite">
          <EstadoVacio
            icono="€"
            titulo={`${nombre} todavía no está abierto`}
            texto={
              porAbrir.intermedios.length > 0
                ? `Al abrirlo se crearán también ${porAbrir.intermedios
                    .map((m) => m.nombre.toLowerCase())
                    .join(', ')}: esos meses pasaron y sus recibos se cobraron.`
                : 'Al abrirlo se generan todos los gastos fijos activos, pendientes de cobro, con su importe previsto.'
            }
            accion={
              <button
                className="boton boton-principal"
                disabled={abriendo}
                onClick={() => void abrirEsteMes(porAbrir.anio, porAbrir.mes)}
              >
                {abriendo ? 'Abriendo…' : 'Abrir este mes'}
              </button>
            }
          />
        </div>
      </>
    )
  }

  if (!mes) {
    return (
      <>
        <Cabecera titulo="Mes" />
        <div className="limite">
          <EstadoVacio
            icono="€"
            titulo="Todavía no hay ningún mes"
            texto="Abre el mes en curso y se generarán solos todos los gastos fijos, pendientes de cobro."
            accion={
              <button
                className="boton boton-principal"
                disabled={abriendo}
                onClick={() => {
                  const ahora = new Date()
                  void abrirEsteMes(ahora.getFullYear(), ahora.getMonth() + 1)
                }}
              >
                {abriendo ? 'Abriendo…' : `Abrir ${NOMBRES_MESES[new Date().getMonth()].toLowerCase()}`}
              </button>
            }
          />
        </div>
      </>
    )
  }

  // ---------- navegacion entre meses ----------

  const navegacion = (
    <NavegacionMes
      anio={mes.anio}
      mes={mes.mes}
      limites={limites}
      onIr={(anio, numeroMes) => onCambioDeMes({ anio, mes: numeroMes })}
    />
  )

  // El atajo solo tiene sentido si el mes siguiente no existe todavía.
  const mesSiguiente =
    mes.mes === 12 ? { anio: mes.anio + 1, mes: 1 } : { anio: mes.anio, mes: mes.mes + 1 }
  const siguienteExiste = limites
    ? mesSiguiente.anio * 12 + mesSiguiente.mes - 1 <=
      limites.ultimo!.anio * 12 + limites.ultimo!.mes - 1
    : false

  const acciones = (
    <div className="cabecera-acciones">
      {escritorio ? (
        <button className="boton boton-secundario boton-compacto" onClick={onVerAnalisis}>
          Análisis
        </button>
      ) : null}
      <button
        className="boton boton-secundario boton-compacto"
        onClick={() => onImportarExtracto(mes.id)}
      >
        Importar extracto
      </button>
      {!siguienteExiste ? (
        <button
          className="boton boton-secundario boton-compacto"
          disabled={abriendo}
          onClick={() => void abrirSiguiente()}
        >
          {abriendo ? 'Abriendo…' : 'Abrir mes siguiente'}
        </button>
      ) : null}
      <button
        className="icono-boton"
        aria-label="Más acciones de este mes"
        onClick={() => setMenuAbierto(true)}
      >
        <IconoAjustes size={20} />
      </button>
    </div>
  )

  // El alta propone el ultimo dia del mes que se ve: apuntando en un mes pasado,
  // la fecha de hoy caeria fuera de ese mes.
  const hoy = hoyIso()
  const dentroDelMes = hoy.startsWith(mes.clave)
  const fechaPorDefecto = dentroDelMes
    ? hoy
    : `${mes.clave}-${String(new Date(mes.anio, mes.mes, 0).getDate()).padStart(2, '0')}`

  /**
   * Las dos entradas que no son teclear: una foto y el portapapeles. Van
   * pegadas al alta rapida porque son la misma accion —apuntar un gasto— por
   * otro camino.
   */
  const botonesCaptura = (
    <div className="captura-acciones">
      <button
        className="boton boton-secundario boton-compacto"
        disabled={leyendo}
        onClick={() => camara.current?.click()}
      >
        <IconoCamara size={18} />
        {leyendo ? 'Leyendo…' : 'Foto de un ticket'}
      </button>
      <button
        className="boton boton-secundario boton-compacto"
        disabled={leyendo}
        onClick={() => selectorPdf.current?.click()}
      >
        <IconoDocumento size={18} />
        Factura en PDF
      </button>
      <button
        className="boton boton-secundario boton-compacto"
        disabled={leyendo}
        onClick={() => setPegarAbierto(true)}
      >
        <IconoPortapapeles size={18} />
        Pegar
      </button>
      <input
        ref={camara}
        type="file"
        accept="image/*"
        capture="environment"
        className="solo-lectores"
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          if (archivo) void leerImagen(archivo, 'foto')
          e.target.value = ''
        }}
      />
      <input
        ref={selectorPdf}
        type="file"
        accept="application/pdf,.pdf"
        className="solo-lectores"
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          if (archivo) void leerPdf(archivo)
          e.target.value = ''
        }}
      />
    </div>
  )

  const paneles = {
    fijos: (
      <TablaFijos
        fijos={mes.fijos}
        onCambiarImporte={(id, importe) => cambiarMovimiento(id, { importe })}
        onAlternarCobro={alternarCobro}
        onCambiarFecha={(id, fechaCobro) => cambiarMovimiento(id, { fechaCobro })}
        mesReferencia={mes.clave}
      />
    ),
    variables: (
      <>
        {escritorio ? (
          <>
            <AltaRapida
              conceptos={conceptosVariables}
              onApuntar={apuntar}
              fechaPorDefecto={fechaPorDefecto}
            />
            {botonesCaptura}
          </>
        ) : null}
        <ListaVariables
          variables={mes.variables}
          conceptos={conceptosVariables}
          onCambiar={cambiarMovimiento}
          onBorrar={setABorrar}
          mesReferencia={mes.clave}
        />
      </>
    ),
  }

  return (
    <>
      <Cabecera
        titulo={`${mes.nombreMes} ${mes.anio}`}
        subtitulo={
          (mes.estado === 'cerrado' ? 'Cerrado · ' : '') +
          (mes.resumen.fijosPendientes.cuantos > 0
            ? `${cuantos(mes.resumen.fijosPendientes.cuantos, 'fijo')} sin cobrar`
            : 'todos los fijos cobrados')
        }
        acciones={acciones}
        debajo={navegacion}
        anchaEnEscritorio
      />

      <div className="limite limite-ancho">
        <ResumenMes mes={mes} contexto={contexto} onCambiar={cambiarMes} />
        <BarraComida
          resumen={mes.resumen}
          onCambiarPresupuesto={(valor) => cambiarMes({ presupuestoComida: valor ?? 0 })}
        />

        {escritorio ? (
          <div className="mes-columnas">
            <div className="mes-columna">{paneles.fijos}</div>
            <div className="mes-columna">{paneles.variables}</div>
          </div>
        ) : (
          <>
            <div className="segmentado">
              <button
                className={pestana === 'fijos' ? 'activo' : ''}
                onClick={() => setPestana('fijos')}
              >
                Fijos
              </button>
              <button
                className={pestana === 'variables' ? 'activo' : ''}
                onClick={() => setPestana('variables')}
              >
                Variables
              </button>
              <button
                className={pestana === 'resumen' ? 'activo' : ''}
                onClick={() => setPestana('resumen')}
              >
                Resumen
              </button>
            </div>

            {pestana === 'fijos' ? paneles.fijos : null}
            {pestana === 'variables' ? paneles.variables : null}
            {pestana === 'resumen' ? <NotasMes mes={mes} onCambiar={cambiarMes} /> : null}
          </>
        )}

        {escritorio ? <NotasMes mes={mes} onCambiar={cambiarMes} /> : null}
      </div>

      {/* En movil el alta vive en un boton flotante, accesible desde cualquier
          pestaña: apuntar un gasto no puede depender de en que pestaña estes. */}
      {escritorio ? null : (
        <button
          className="flotante"
          onClick={() => setAltaAbierta(true)}
          aria-label="Apuntar un gasto"
        >
          <IconoMas size={26} />
        </button>
      )}

      <Sheet abierta={altaAbierta} titulo="Apuntar gasto" onCerrar={() => setAltaAbierta(false)}>
        <AltaRapida
          conceptos={conceptosVariables}
          fechaPorDefecto={fechaPorDefecto}
          onApuntar={async (datos) => {
            await apuntar(datos)
            setAltaAbierta(false)
          }}
        />
        {botonesCaptura}
      </Sheet>

      <SheetPegar
        abierta={pegarAbierto}
        onCerrar={() => setPegarAbierto(false)}
        onImagen={(imagen) => void leerImagen(imagen, 'portapapeles')}
        onTexto={(texto) => void leerCaptura({ texto }, 'portapapeles')}
        onPdf={(archivo) => {
          setPegarAbierto(false)
          void leerPdf(archivo)
        }}
      />

      <RevisionCaptura
        lectura={captura}
        conceptos={conceptos}
        mesId={mes.id}
        mesClave={mes.clave}
        origen={origenCaptura}
        onCerrar={() => setCaptura(null)}
        onAplicarMes={cambiarMes}
        onGuardado={(cuantosApuntes) => {
          setCaptura(null)
          setAltaAbierta(false)
          avisar(`${cuantos(cuantosApuntes, 'apunte')} guardados.`)
          void recargarMes()
        }}
      />

      <MenuMes
        mes={mes}
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
        onCambiado={recargarMes}
        onCambiarEstado={async (estado) => {
          await cambiarMes({ estado })
          avisar(estado === 'cerrado' ? 'Mes cerrado.' : 'Mes reabierto.')
        }}
      />

      <Confirmar
        abierto={!!aBorrar}
        titulo="¿Borrar el apunte?"
        mensaje={`${aBorrar?.concepto ?? ''} · ${aBorrar?.importe ?? 0} €`}
        textoConfirmar="Borrar"
        peligroso
        onConfirmar={() => void borrar()}
        onCancelar={() => setABorrar(null)}
      />
    </>
  )
}

function NotasMes({
  mes,
  onCambiar,
}: {
  mes: MesCompleto
  onCambiar: (cambios: Record<string, unknown>) => Promise<void>
}) {
  return (
    <section className="bloque">
      <label className="seccion-titulo" htmlFor="notas-mes">
        Notas
      </label>
      <textarea
        id="notas-mes"
        className="campo"
        rows={3}
        maxLength={4000}
        placeholder="Lo que haya que recordar de este mes."
        defaultValue={mes.notas}
        onBlur={(e) => {
          if (e.target.value !== mes.notas) void onCambiar({ notas: e.target.value })
        }}
      />
    </section>
  )
}
