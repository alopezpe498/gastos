import { useRef, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type {
  Concepto,
  ConceptoPrevisto,
  HojaDelLibro,
  ResultadoImportacion,
  SugerenciaConcepto,
  VistaPrevia,
} from '../../lib/tipos'
import { useAvisos } from '../../components/ui/Toast'
import { Interruptor } from '../../components/ui/Basicos'
import { cuantos, euros } from '../../lib/formato'
import { Icono } from '../../components/ui/Icono'

type Props = { onImportado: () => void }

type Paso = 'archivo' | 'hoja' | 'previa' | 'hecho'

/**
 * Importacion de las hojas anuales del Excel.
 *
 * Tres pasos, y el del medio es el que importa: antes de tocar nada se ensena
 * exactamente lo que va a pasar, mes a mes y concepto a concepto. Importar
 * cinco años a ciegas y descubrir despues que se han creado veinte conceptos
 * duplicados no tiene arreglo comodo.
 */
export function SeccionImportar({ onImportado }: Props) {
  const { avisar, avisarError } = useAvisos()
  const [paso, setPaso] = useState<Paso>('archivo')
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [archivo, setArchivo] = useState('')
  const [hojas, setHojas] = useState<HojaDelLibro[]>([])
  const [previa, setPrevia] = useState<VistaPrevia | null>(null)
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  // nombre del Excel -> id del concepto al que se manda ('' = crear uno nuevo)
  const [mapeos, setMapeos] = useState<Record<string, string>>({})
  const [sobrescribir, setSobrescribir] = useState(false)
  const [crearAjustes, setCrearAjustes] = useState(true)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [hayIa, setHayIa] = useState(false)
  const [sugerencias, setSugerencias] = useState<SugerenciaConcepto[]>([])
  const [sugiriendo, setSugiriendo] = useState(false)
  // La hoja que ha fallado con el parser, para poder ofrecer el plan B con IA.
  const [hojaFallida, setHojaFallida] = useState<{ nombre: string; error: string } | null>(null)
  const selector = useRef<HTMLInputElement>(null)

  const reiniciar = () => {
    setPaso('archivo')
    setArchivo('')
    setNombreArchivo('')
    setHojas([])
    setPrevia(null)
    setMapeos({})
    setResultado(null)
    setSobrescribir(false)
    setSugerencias([])
    setHojaFallida(null)
    if (selector.current) selector.current.value = ''
  }

  const elegirArchivo = async (fichero: File) => {
    setTrabajando(true)
    try {
      const base64 = await new Promise<string>((resolver, rechazar) => {
        const lector = new FileReader()
        lector.onload = () => resolver(String(lector.result))
        lector.onerror = () => rechazar(new Error('No se ha podido leer el archivo.'))
        lector.readAsDataURL(fichero)
      })

      const { hojas: encontradas, hayIa: conIa } = await api<{
        hojas: HojaDelLibro[]
        hayIa: boolean
      }>('/importar/excel/hojas', { metodo: 'POST', cuerpo: { archivo: base64 } })

      setHayIa(conIa)
      setArchivo(base64)
      setNombreArchivo(fichero.name)
      setHojas(encontradas)
      setPaso('hoja')

      const candidatas = encontradas.filter((h) => h.esCandidata)
      if (candidatas.length === 0) {
        avisarError('En este archivo no hay ninguna hoja que parezca de cuentas anuales.')
      }
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setTrabajando(false)
    }
  }

  /** Deja lista la pantalla de vista previa venga del parser o de la IA. */
  const montarPrevia = async (datos: VistaPrevia) => {
    setPrevia(datos)
    setConceptos(await api<Concepto[]>('/conceptos'))
    setSobrescribir(false)
    setSugerencias([])
    setHojaFallida(null)
    setPaso('previa')

    // Si hay IA y conceptos nuevos, se piden sugerencias en segundo plano: la
    // pantalla ya está montada y usable mientras tanto.
    const nuevos = [...datos.fijos, ...datos.variables].filter((c) => c.nuevo)
    if (!datos.hayIa || nuevos.length === 0) return

    setSugiriendo(true)
    try {
      const { sugerencias: propuestas } = await api<{ sugerencias: SugerenciaConcepto[] }>(
        '/importar/excel/sugerir',
        { metodo: 'POST', cuerpo: { nuevos: nuevos.map((c) => c.nombreExcel) } },
      )
      setSugerencias(propuestas)
      // Se dejan preseleccionadas, pero visibles: hay que mirarlas antes de
      // confirmar, no se aplican a escondidas.
      setMapeos((actuales) => {
        const copia = { ...actuales }
        for (const s of propuestas) copia[s.nombreExcel] = String(s.conceptoId)
        return copia
      })
    } catch (causa) {
      // Que la IA falle no puede tumbar la importación: se sigue a mano.
      avisarError(`No se han podido pedir sugerencias: ${mensajeDeError(causa)}`)
    } finally {
      setSugiriendo(false)
    }
  }

  const verPrevia = async (hoja: string) => {
    setTrabajando(true)
    setHojaFallida(null)
    try {
      await montarPrevia(
        await api<VistaPrevia>('/importar/excel/vista-previa', {
          metodo: 'POST',
          cuerpo: { archivo, hoja },
        }),
      )
    } catch (causa) {
      const mensaje = mensajeDeError(causa)
      avisarError(mensaje)
      // Si el parser no reconoce el formato, la IA puede intentarlo.
      if (hayIa) setHojaFallida({ nombre: hoja, error: mensaje })
    } finally {
      setTrabajando(false)
    }
  }

  /** Plan B: leer la hoja con IA cuando el parser no reconoce su formato. */
  const verPreviaConIa = async (hoja: string) => {
    setTrabajando(true)
    try {
      await montarPrevia(
        await api<VistaPrevia>('/importar/excel/hoja-libre', {
          metodo: 'POST',
          cuerpo: { archivo, hoja },
        }),
      )
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setTrabajando(false)
    }
  }

  const importar = async () => {
    if (!previa) return
    setTrabajando(true)
    try {
      const soloElegidos = Object.fromEntries(
        Object.entries(mapeos).filter(([, valor]) => valor !== ''),
      )
      const datos = await api<ResultadoImportacion>('/importar/excel/confirmar', {
        metodo: 'POST',
        cuerpo: previa.sesionId
          ? { sesionId: previa.sesionId, mapeos: soloElegidos, sobrescribir, crearAjustes }
          : { archivo, hoja: previa.hoja, mapeos: soloElegidos, sobrescribir, crearAjustes },
      })
      setResultado(datos)
      setPaso('hecho')
      avisar(`${datos.anio} importado: ${cuantos(datos.meses, 'mes', 'meses')}.`)
      onImportado()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setTrabajando(false)
    }
  }

  // ---------- paso 1: el archivo ----------

  if (paso === 'archivo') {
    return (
      <section className="bloque">
        <h3 className="seccion-titulo">Importar del Excel</h3>
        <p className="seccion-pista">
          Sube el libro con tus hojas anuales (<code>Cuentas2024</code>, <code>Cuentas2025</code>…)
          y elige cuál importar. Antes de tocar nada verás exactamente qué va a entrar.
        </p>

        <label className="zona-archivo">
          <Icono nombre="subir" size={22} />
          <span className="zona-archivo-titulo">
            {trabajando ? 'Abriendo el archivo…' : 'Elegir archivo .xlsx'}
          </span>
          <span className="zona-archivo-texto">Nada se importa hasta que lo confirmes.</span>
          <input
            ref={selector}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="solo-lectores"
            disabled={trabajando}
            onChange={(e) => {
              const fichero = e.target.files?.[0]
              if (fichero) void elegirArchivo(fichero)
            }}
          />
        </label>
      </section>
    )
  }

  // ---------- paso 2: la hoja ----------

  if (paso === 'hoja') {
    const candidatas = hojas.filter((h) => h.esCandidata)
    const resto = hojas.filter((h) => !h.esCandidata)

    return (
      <section className="bloque">
        <div className="seccion-cabecera">
          <div>
            <h3 className="seccion-titulo">¿Qué hoja?</h3>
            <p className="seccion-pista">{nombreArchivo}</p>
          </div>
          <button className="boton boton-secundario" onClick={reiniciar}>
            Cambiar archivo
          </button>
        </div>

        {/*
          El parser no ha reconocido el formato. Con IA configurada se puede
          intentar leerla igualmente: no sustituye al parser, es la salida para
          las hojas que no son anuales (la del mes en curso, por ejemplo).
        */}
        {hojaFallida ? (
          <div className="banda-aviso">
            <Icono nombre="aviso" size={18} />
            <span>
              <strong>{hojaFallida.nombre}</strong>: {hojaFallida.error}
              <button
                className="boton boton-secundario boton-compacto banda-accion"
                disabled={trabajando}
                onClick={() => void verPreviaConIa(hojaFallida.nombre)}
              >
                <Icono nombre="chispa" size={16} />
                {trabajando ? 'Leyendo con IA…' : 'Probar a leerla con IA'}
              </button>
            </span>
          </div>
        ) : null}

        <div className="tarjeta">
          {candidatas.map((hoja) => (
            <button
              key={hoja.nombre}
              className="fila fila-boton"
              disabled={trabajando}
              onClick={() => void verPrevia(hoja.nombre)}
            >
              <span className="fila-titulo">{hoja.nombre}</span>
              <span className="fila-detalle">Cuentas de {hoja.anio}</span>
            </button>
          ))}
        </div>

        {resto.length > 0 ? (
          <details className="desplegable">
            <summary>Ver las otras {resto.length} hojas del libro</summary>
            <div className="tarjeta">
              {resto.map((hoja) => (
                <button
                  key={hoja.nombre}
                  className="fila fila-boton"
                  disabled={trabajando}
                  onClick={() => void verPrevia(hoja.nombre)}
                >
                  <span className="fila-titulo">{hoja.nombre}</span>
                  <span className="fila-detalle">
                    {hoja.anio ? `Año ${hoja.anio}` : 'Sin año en el nombre'}
                  </span>
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </section>
    )
  }

  // ---------- paso 4: hecho ----------

  if (paso === 'hecho' && resultado) {
    return (
      <section className="bloque">
        <h3 className="seccion-titulo">{resultado.anio} importado</h3>
        <div className="tarjeta">
          <div className="fila">
            <span className="fila-cuerpo">
              <span className="fila-titulo">
                {cuantos(resultado.meses, 'mes', 'meses')}, {cuantos(resultado.fijos, 'fijo')} y{' '}
                {cuantos(resultado.variables, 'gasto variable', 'gastos variables')}
              </span>
              <span className="fila-detalle">Los meses importados quedan cerrados.</span>
            </span>
          </div>
          {resultado.conceptosCreados.length > 0 ? (
            <div className="fila">
              <span className="fila-cuerpo">
                <span className="fila-titulo">
                  {cuantos(resultado.conceptosCreados.length, 'concepto')} nuevos
                </span>
                <span className="fila-detalle">{resultado.conceptosCreados.join(', ')}</span>
              </span>
            </div>
          ) : null}
          {resultado.aliasCreados.length > 0 ? (
            <div className="fila">
              <span className="fila-cuerpo">
                <span className="fila-titulo">Nombres recordados</span>
                <span className="fila-detalle">{resultado.aliasCreados.join(' · ')}</span>
              </span>
            </div>
          ) : null}
        </div>

        <button className="boton boton-principal boton-ancho" onClick={reiniciar}>
          Importar otra hoja
        </button>
      </section>
    )
  }

  // ---------- paso 3: la vista previa ----------

  if (!previa) return null

  const nuevos = [...previa.fijos, ...previa.variables].filter((c) => c.nuevo)
  const porAlias = [...previa.fijos, ...previa.variables].filter((c) => c.porAlias)
  const descuadres = previa.meses.filter((m) => m.descuadre !== null && m.descuadre !== 0)
  const bloqueado = previa.yaImportado && !sobrescribir

  return (
    <section className="bloque">
      <div className="seccion-cabecera">
        <div>
          <h3 className="seccion-titulo">Vista previa de {previa.anio}</h3>
          <p className="seccion-pista">
            {previa.hoja} · {nombreArchivo}
          </p>
        </div>
        <button className="boton boton-secundario" onClick={() => setPaso('hoja')}>
          Otra hoja
        </button>
      </div>

      {previa.avisos.map((aviso) => (
        <p className="banda-aviso" key={aviso}>
          <Icono nombre="aviso" size={18} />
          <span>{aviso}</span>
        </p>
      ))}

      {previa.yaImportado ? (
        <div className="fila fila-ajuste">
          <div className="fila-cuerpo">
            <span className="fila-titulo">
              Ya hay {cuantos(previa.mesesExistentes.length, 'mes', 'meses')} de {previa.anio}
            </span>
            <span className="fila-detalle">
              Sobrescribir los borra y los vuelve a crear desde la hoja. Lo que hayas editado a
              mano en esos meses se pierde.
            </span>
          </div>
          <Interruptor
            activo={sobrescribir}
            onCambiar={setSobrescribir}
            etiqueta="Sobrescribir los meses que ya existen"
          />
        </div>
      ) : null}

      {/* ---------- meses ---------- */}

      <h4 className="subseccion">Meses</h4>
      <div className="tarjeta tabla-previa">
        <div className="previa-fila cabecera">
          <span>Mes</span>
          <span>Ingresos</span>
          <span>Fijos + comida</span>
          <span>Variables</span>
          <span>Gastos</span>
        </div>
        {previa.meses.map((mes) => (
          <div className="previa-fila" key={mes.mes}>
            <span>{mes.nombre}</span>
            <span className="dinero">{euros(mes.ingreso)}</span>
            <span className="dinero">{euros(mes.gastosCalculado - mes.otrosCalculado)}</span>
            <span className="dinero">
              {mes.variables} · {euros(mes.otrosCalculado)}
              {mes.descuadre ? (
                <span className="previa-marca"> Excel dice {euros(mes.otrosExcel)}</span>
              ) : null}
            </span>
            <span className="dinero">
              {euros(mes.gastosCalculado)}
              {mes.diferenciaGastos ? (
                <span className="previa-marca">
                  {' '}
                  Excel dice {euros(mes.gastosExcel)}
                  {mes.objetivoAhorro ? ' (incluye el ahorro)' : ''}
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      {descuadres.length > 0 ? (
        <div className="fila fila-ajuste">
          <div className="fila-cuerpo">
            <span className="fila-titulo">
              Crear un «Ajuste importación» en {cuantos(descuadres.length, 'mes', 'meses')}
            </span>
            <span className="fila-detalle">
              La fila «Otros» de la hoja no cuadra con la suma de sus apuntes. Con esto, el total
              del mes seguirá coincidiendo con tu Excel.
            </span>
          </div>
          <Interruptor
            activo={crearAjustes}
            onCambiar={setCrearAjustes}
            etiqueta="Crear movimientos de ajuste"
          />
        </div>
      ) : null}

      {/* ---------- conceptos ---------- */}

      <h4 className="subseccion">
        Conceptos {nuevos.length > 0 ? `· ${cuantos(nuevos.length, 'nuevo')}` : '· todos conocidos'}
      </h4>

      {sugiriendo ? (
        <p className="pista">
          <Icono nombre="chispa" size={14} /> Preguntando a la IA a qué concepto va cada nombre nuevo…
        </p>
      ) : sugerencias.length > 0 ? (
        <p className="pista">
          <Icono nombre="chispa" size={14} /> La IA ha propuesto {cuantos(sugerencias.length, 'destino')} y
          los ha dejado preseleccionados. <strong>Revísalos</strong>: no se aplica nada hasta que
          confirmes.
        </p>
      ) : null}

      {porAlias.length > 0 ? (
        <p className="pista">
          Reconocidos por otro nombre: {porAlias.map((c) => `${c.nombreExcel} → ${c.conceptoNombre}`).join(' · ')}
        </p>
      ) : null}

      <div className="tarjeta tabla-previa">
        {[...previa.fijos, ...previa.variables].map((concepto) => (
          <FilaConceptoPrevisto
            key={`${concepto.tipoSugerido}-${concepto.nombreExcel}`}
            concepto={concepto}
            conceptos={conceptos}
            valor={mapeos[concepto.nombreExcel] ?? ''}
            sugerencia={sugerencias.find((s) => s.nombreExcel === concepto.nombreExcel) ?? null}
            onCambiar={(valor) =>
              setMapeos((actuales) => ({ ...actuales, [concepto.nombreExcel]: valor }))
            }
          />
        ))}
      </div>

      <button
        className="boton boton-principal boton-ancho"
        disabled={trabajando || bloqueado}
        onClick={() => void importar()}
      >
        {trabajando
          ? 'Importando…'
          : bloqueado
            ? 'Activa «sobrescribir» para continuar'
            : `Importar ${previa.anio}`}
      </button>
    </section>
  )
}

function FilaConceptoPrevisto({
  concepto,
  conceptos,
  valor,
  sugerencia,
  onCambiar,
}: {
  concepto: ConceptoPrevisto
  conceptos: Concepto[]
  valor: string
  sugerencia: SugerenciaConcepto | null
  onCambiar: (valor: string) => void
}) {
  const destino = concepto.nuevo
    ? `se creará como ${concepto.tipoSugerido}`
    : `va a "${concepto.conceptoNombre}"`

  // La sugerencia sigue en pie mientras no se toque el desplegable.
  const aceptada = sugerencia !== null && valor === String(sugerencia.conceptoId)

  return (
    <div className={`previa-concepto${concepto.nuevo ? ' nuevo' : ''}${aceptada ? ' sugerido' : ''}`}>
      <span className="previa-concepto-nombre">
        {concepto.nombreExcel}
        {concepto.nuevo ? <span className="etiqueta-mini">nuevo</span> : null}
        {aceptada ? (
          <span className="etiqueta-mini ia" title={sugerencia.motivo}>
            <Icono nombre="chispa" size={11} /> IA {Math.round(sugerencia.confianza * 100)} %
          </span>
        ) : null}
      </span>
      <span className="previa-concepto-datos dinero">
        {cuantos(concepto.meses, 'mes', 'meses')} · {euros(concepto.total)}
      </span>
      <select
        className="previa-concepto-destino"
        aria-label={`Dónde va "${concepto.nombreExcel}"`}
        value={valor || (concepto.conceptoId ? String(concepto.conceptoId) : '')}
        onChange={(e) => onCambiar(e.target.value)}
      >
        <option value="">{destino}</option>
        {conceptos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
    </div>
  )
}
