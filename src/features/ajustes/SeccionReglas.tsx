import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Concepto, Regla, PruebaRegla, FormatoBanco as FormatoBancoTipo, LecturaPrueba } from '../../lib/tipos'
import { Confirmar, ErrorLinea } from '../../components/Basicos'
import { EsqueletoLista } from '../../components/Esqueleto'
import { useAvisos } from '../../components/Avisos'
import { CampoTextoLinea, Interruptor } from '../../components/Campos'
import { IconoArrastrar, IconoMas, IconoPapelera } from '../../components/Iconos'
import { cuantos, euros } from '../../lib/formato'

/**
 * Reglas de clasificación del extracto del banco.
 *
 * Toda la pantalla gira alrededor de una idea: **el orden es la regla**. Se
 * evalúan de arriba abajo y gana la primera que encaja, así que arrastrar una
 * fila cambia el resultado tanto como cambiar su texto. Por eso el número de
 * orden se ve siempre y «Probar» enseña cuántas se han descartado antes.
 */

const ETIQUETAS_TIPO: Record<Regla['tipo'], string> = {
  fijo: 'Fijo',
  sobre: 'Comida',
  variable: 'Variable',
  manual: 'A revisar',
}

const ETIQUETAS_ORIGEN: Record<Regla['origen'], string> = {
  seed: 'de fábrica',
  usuario: 'tuya',
  aprendida: 'aprendida',
}

export function SeccionReglas({ conceptos }: { conceptos: Concepto[] }) {
  const { avisar, avisarError } = useAvisos()
  const [reglas, setReglas] = useState<Regla[] | null>(null)
  const [error, setError] = useState('')
  const [aBorrar, setABorrar] = useState<Regla | null>(null)
  const [arrastrada, setArrastrada] = useState<number | null>(null)
  const [encima, setEncima] = useState<number | null>(null)
  const [filtro, setFiltro] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      setReglas(await api<Regla[]>('/reglas'))
    } catch (causa) {
      setError(mensajeDeError(causa))
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const cambiar = async (regla: Regla, cambios: Partial<Regla>) => {
    // Se pinta ya y se confirma después: escribir en una tabla y esperar al
    // servidor en cada tecla se siente roto.
    setReglas((actuales) =>
      actuales ? actuales.map((r) => (r.id === regla.id ? { ...r, ...cambios } : r)) : actuales,
    )
    try {
      await api(`/reglas/${regla.id}`, { metodo: 'PATCH', cuerpo: cambios })
      await cargar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
      await cargar()
    }
  }

  const borrar = async () => {
    if (!aBorrar) return
    const regla = aBorrar
    setABorrar(null)
    try {
      await api(`/reglas/${regla.id}`, { metodo: 'DELETE' })
      avisar(`Regla "${regla.texto}" borrada.`)
      await cargar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const soltar = async (destinoId: number) => {
    const origen = arrastrada
    setArrastrada(null)
    setEncima(null)
    if (!reglas || origen === null || origen === destinoId) return

    const orden = reglas.map((r) => r.id)
    const desde = orden.indexOf(origen)
    const hasta = orden.indexOf(destinoId)
    orden.splice(hasta, 0, ...orden.splice(desde, 1))
    setReglas(orden.map((id) => reglas.find((r) => r.id === id)!))

    try {
      setReglas(await api<Regla[]>('/reglas/orden', { metodo: 'PUT', cuerpo: { ids: orden } }))
    } catch (causa) {
      avisarError(mensajeDeError(causa))
      await cargar()
    }
  }

  const propuestas = useMemo(() => (reglas ?? []).filter((r) => r.estado === 'propuesta'), [reglas])
  const visibles = useMemo(() => {
    const lista = (reglas ?? []).filter((r) => r.estado !== 'propuesta')
    if (!filtro.trim()) return lista
    const buscar = filtro.trim().toLowerCase()
    return lista.filter(
      (r) =>
        r.texto.toLowerCase().includes(buscar) ||
        (r.concepto ?? '').toLowerCase().includes(buscar),
    )
  }, [reglas, filtro])

  if (error) {
    return (
      <section className="seccion">
        <ErrorLinea mensaje={error} onReintentar={() => void cargar()} />
      </section>
    )
  }
  if (!reglas) {
    return (
      <section className="seccion">
        <EsqueletoLista filas={6} />
      </section>
    )
  }

  return (
    <>
      <section className="seccion">
        <div className="seccion-cabecera">
          <div>
            <h3 className="seccion-titulo">Reglas de clasificación</h3>
            <p className="seccion-pista">
              Cómo se reconoce cada movimiento del banco. Se miran de arriba abajo y{' '}
              <strong>gana la primera que encaja</strong>, así que el orden importa tanto como el
              texto: arrastra para cambiarlo.
            </p>
          </div>
        </div>

        <ProbarRegla onCambio={cargar} conceptos={conceptos} />
      </section>

      {propuestas.length > 0 ? (
        <section className="seccion">
          <h3 className="seccion-titulo">
            Propuestas · {cuantos(propuestas.length, 'regla', 'reglas')}
          </h3>
          <p className="seccion-pista">
            Aprendidas al clasificar un extracto. Ya clasifican, pero se ven marcadas hasta que las
            confirmes.
          </p>
          <div className="tarjeta">
            {propuestas.map((regla) => (
              <div className="fila" key={regla.id}>
                <div className="fila-cuerpo">
                  <span className="fila-titulo">
                    {regla.texto} → {regla.concepto ?? 'a revisar'}
                  </span>
                  <span className="fila-detalle">
                    {ETIQUETAS_TIPO[regla.tipo]} · {ETIQUETAS_ORIGEN[regla.origen]}
                  </span>
                </div>
                <button
                  className="boton boton-secundario boton-compacto"
                  onClick={() => void cambiar(regla, { estado: 'confirmada' })}
                >
                  Confirmar
                </button>
                <button
                  className="icono-boton"
                  aria-label={`Rechazar la regla ${regla.texto}`}
                  onClick={() => setABorrar(regla)}
                >
                  <IconoPapelera size={18} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="seccion">
        <div className="seccion-cabecera">
          <div>
            <h3 className="seccion-titulo">{cuantos(visibles.length, 'regla', 'reglas')}</h3>
          </div>
          <input
            className="campo-linea texto campo-buscar"
            placeholder="Buscar texto o concepto"
            aria-label="Buscar entre las reglas"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>

        <div className="tarjeta tabla-reglas">
          <div className="regla-fila cabecera" aria-hidden="true">
            <span>#</span>
            <span>Texto que busca</span>
            <span>Concepto</span>
            <span>Encaje</span>
            <span>Usos</span>
            <span>Activa</span>
            <span />
          </div>

          {visibles.map((regla, indice) => (
            <div
              key={regla.id}
              className={
                'regla-fila' +
                (arrastrada === regla.id ? ' arrastrando' : '') +
                (encima === regla.id ? ' encima' : '') +
                (regla.activa ? '' : ' apagada')
              }
              draggable={!filtro}
              onDragStart={() => setArrastrada(regla.id)}
              onDragEnd={() => {
                setArrastrada(null)
                setEncima(null)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setEncima(regla.id)
              }}
              onDrop={(e) => {
                e.preventDefault()
                void soltar(regla.id)
              }}
            >
              <span className="regla-orden" aria-hidden="true">
                <span className="agarre">
                  <IconoArrastrar size={16} />
                </span>
                <span>{filtro ? regla.prioridad : indice + 1}</span>
              </span>

              <CampoTextoLinea
                valor={regla.texto}
                ariaLabel={`Texto de la regla ${regla.texto}`}
                maxLength={60}
                onGuardar={(texto) => void cambiar(regla, { texto })}
              />

              <select
                className="campo-linea"
                aria-label={`Concepto de la regla ${regla.texto}`}
                value={regla.conceptoId ?? ''}
                onChange={(e) => {
                  const valor = e.target.value
                  void cambiar(regla, {
                    conceptoId: valor === '' ? null : Number(valor),
                    tipo: valor === '' ? 'manual' : undefined,
                  } as Partial<Regla>)
                }}
              >
                <option value="">— a revisar siempre —</option>
                {conceptos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>

              <select
                className="campo-linea"
                aria-label={`Cómo encaja la regla ${regla.texto}`}
                value={regla.coincidencia}
                onChange={(e) =>
                  void cambiar(regla, { coincidencia: e.target.value as Regla['coincidencia'] })
                }
              >
                <option value="empieza">Empieza palabra</option>
                <option value="exacta">Palabra completa</option>
              </select>

              <span className="regla-usos" title={ETIQUETAS_ORIGEN[regla.origen]}>
                {regla.vecesAplicada || '—'}
              </span>

              <Interruptor
                activo={regla.activa}
                ariaLabel={`Activar la regla ${regla.texto}`}
                onCambiar={(activa) => void cambiar(regla, { activa })}
              />

              <button
                className="icono-boton"
                aria-label={`Borrar la regla ${regla.texto}`}
                onClick={() => setABorrar(regla)}
              >
                <IconoPapelera size={18} />
              </button>
            </div>
          ))}
        </div>

        {filtro ? (
          <p className="pista">Quita el filtro para poder reordenar arrastrando.</p>
        ) : null}

        <NuevaRegla conceptos={conceptos} onCreada={cargar} />
      </section>

      <FormatoBanco />

      <CopiaReglas onCambio={cargar} />

      <Confirmar
        abierto={!!aBorrar}
        titulo={`¿Borrar la regla "${aBorrar?.texto}"?`}
        mensaje="Los movimientos que reconocía pasarán a clasificarse a mano. No toca ningún apunte ya guardado."
        textoConfirmar="Borrar"
        peligroso
        onConfirmar={() => void borrar()}
        onCancelar={() => setABorrar(null)}
      />
    </>
  )
}

/** Pega una descripción del banco y mira qué pasa con ella. */
function ProbarRegla({
  onCambio,
  conceptos,
}: {
  onCambio: () => Promise<void> | void
  conceptos: Concepto[]
}) {
  const { avisarError } = useAvisos()
  const [texto, setTexto] = useState('')
  const [prueba, setPrueba] = useState<PruebaRegla | null>(null)
  const [probando, setProbando] = useState(false)

  const lanzar = async () => {
    if (!texto.trim()) return
    setProbando(true)
    try {
      setPrueba(await api<PruebaRegla>('/reglas/probar', {
        metodo: 'POST',
        cuerpo: { descripcion: texto },
      }))
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setProbando(false)
    }
  }

  return (
    <div className="tarjeta probador">
      <label className="etiqueta-campo" htmlFor="probar-regla">
        Probar una descripción
      </label>
      <div className="probador-fila">
        <input
          id="probar-regla"
          className="campo-linea texto"
          placeholder="COMPRA TARJ. 5402XXXXXXXX4010 MERCADONA RAMBLA"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void lanzar()
          }}
        />
        <button
          className="boton boton-secundario"
          disabled={probando || !texto.trim()}
          onClick={() => void lanzar()}
        >
          {probando ? 'Probando…' : 'Probar'}
        </button>
      </div>

      {prueba ? (
        <div className="probador-resultado">
          {prueba.ganadora ? (
            <p>
              Gana <strong>{prueba.ganadora.texto}</strong> →{' '}
              <strong>{prueba.ganadora.concepto ?? 'a revisar a mano'}</strong>
              {prueba.descartadas > 0
                ? `, después de descartar ${cuantos(prueba.descartadas, 'regla', 'reglas')}.`
                : ', la primera de la lista.'}
            </p>
          ) : (
            <p>
              No encaja ninguna regla: iría al bloque de <strong>sin clasificar</strong>.
            </p>
          )}

          {prueba.propuesta ? (
            <CrearDesdePrueba
              propuesta={prueba.propuesta}
              conceptos={conceptos}
              onCreada={async () => {
                await onCambio()
                await lanzar()
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** El atajo del probador: crear la regla que le faltaba a esa descripción. */
function CrearDesdePrueba({
  propuesta,
  conceptos,
  onCreada,
}: {
  propuesta: string
  conceptos: Concepto[]
  onCreada: () => Promise<void> | void
}) {
  const { avisar, avisarError } = useAvisos()
  const [texto, setTexto] = useState(propuesta)
  const [conceptoId, setConceptoId] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => setTexto(propuesta), [propuesta])

  const crear = async () => {
    if (!conceptoId) return
    setEnviando(true)
    try {
      const concepto = conceptos.find((c) => c.id === Number(conceptoId))
      await api('/reglas', {
        metodo: 'POST',
        cuerpo: {
          texto,
          conceptoId: Number(conceptoId),
          tipo: concepto?.tipo === 'sobre' ? 'sobre' : concepto?.tipo ?? 'variable',
        },
      })
      avisar(`Regla "${texto}" creada.`)
      setConceptoId('')
      await onCreada()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="probador-crear">
      <span className="pista">Crear una regla con esto:</span>
      <input
        className="campo-linea texto"
        aria-label="Texto de la regla nueva"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <select
        className="campo-linea"
        aria-label="Concepto de la regla nueva"
        value={conceptoId}
        onChange={(e) => setConceptoId(e.target.value)}
      >
        <option value="">Elige concepto…</option>
        {conceptos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <button
        className="boton boton-secundario boton-compacto"
        disabled={!conceptoId || !texto.trim() || enviando}
        onClick={() => void crear()}
      >
        Crear
      </button>
    </div>
  )
}

function NuevaRegla({
  conceptos,
  onCreada,
}: {
  conceptos: Concepto[]
  onCreada: () => Promise<void> | void
}) {
  const { avisar, avisarError } = useAvisos()
  const [texto, setTexto] = useState('')
  const [conceptoId, setConceptoId] = useState('')
  const campo = useRef<HTMLInputElement>(null)

  const crear = async () => {
    if (!texto.trim()) return
    try {
      const concepto = conceptos.find((c) => c.id === Number(conceptoId))
      await api('/reglas', {
        metodo: 'POST',
        cuerpo: {
          texto,
          conceptoId: conceptoId === '' ? null : Number(conceptoId),
          tipo: conceptoId === '' ? 'manual' : concepto?.tipo === 'sobre' ? 'sobre' : concepto?.tipo,
        },
      })
      avisar(`Regla "${texto.trim()}" creada, la última de la lista.`)
      setTexto('')
      setConceptoId('')
      campo.current?.focus()
      await onCreada()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  return (
    <div className="regla-nueva">
      <input
        ref={campo}
        className="campo-linea texto"
        placeholder="Texto nuevo (p. ej. DRUNI)"
        aria-label="Texto de la regla nueva"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void crear()
        }}
      />
      <select
        className="campo-linea"
        aria-label="Concepto de la regla nueva"
        value={conceptoId}
        onChange={(e) => setConceptoId(e.target.value)}
      >
        <option value="">— a revisar siempre —</option>
        {conceptos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <button
        className="boton boton-secundario"
        disabled={!texto.trim()}
        onClick={() => void crear()}
      >
        <IconoMas size={18} />
        Añadir
      </button>
    </div>
  )
}

/**
 * Cómo viene el fichero del banco.
 *
 * Se enseña lo que la aplicación ha deducido y se puede corregir. «Probar con
 * un archivo» es lo importante: enseña las primeras filas ya interpretadas, que
 * es la única forma de saber si el formato está bien sin importar de verdad.
 */
function FormatoBanco() {
  const { avisar, avisarError } = useAvisos()
  const [formato, setFormato] = useState<FormatoBancoTipo | null>(null)
  const [prueba, setPrueba] = useState<LecturaPrueba | null>(null)
  const [probando, setProbando] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void api<{ porDefecto: FormatoBancoTipo | null }>('/extracto/formatos')
      .then((r) => setFormato(r.porDefecto))
      .catch(() => setFormato(null))
  }, [])

  const cambiar = async (cambios: Partial<FormatoBancoTipo>) => {
    if (!formato) return
    try {
      setFormato(
        await api<FormatoBancoTipo>(`/extracto/formatos/${formato.id}`, {
          metodo: 'PATCH',
          cuerpo: cambios,
        }),
      )
      avisar('Formato guardado.')
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const probar = async (fichero: File) => {
    setProbando(true)
    try {
      const base64 = await new Promise<string>((resolver, rechazar) => {
        const lector = new FileReader()
        lector.onload = () => resolver(String(lector.result))
        lector.onerror = () => rechazar(new Error('No he podido leer el archivo.'))
        lector.readAsDataURL(fichero)
      })
      setPrueba(
        await api<LecturaPrueba>('/extracto/leer', {
          metodo: 'POST',
          cuerpo: { archivo: base64, nombreArchivo: fichero.name },
        }),
      )
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setProbando(false)
    }
  }

  if (!formato) return null

  return (
    <section className="seccion">
      <h3 className="seccion-titulo">Formato del banco</h3>
      <p className="seccion-pista">
        Cómo se lee el archivo. Las columnas se buscan por su nombre en la cabecera, no por su
        posición, así que aunque el banco las mueva sigue funcionando.
      </p>

      <div className="tarjeta">
        <div className="fila">
          <div className="fila-cuerpo">
            <span className="fila-titulo">{formato.nombre}</span>
            <span className="fila-detalle">
              Cabecera: la fila que ponga «{formato.filaCabeceraTexto}» · Decimales con «
              {formato.separadorDecimal}»
            </span>
          </div>
        </div>
        {(
          [
            ['columnaFecha', 'Columna de la fecha'],
            ['columnaConcepto', 'Columna del concepto'],
            ['columnaImporte', 'Columna del importe'],
            ['filaCabeceraTexto', 'Texto que delata la cabecera'],
          ] as const
        ).map(([campo, etiqueta]) => (
          <div className="fila" key={campo}>
            <div className="fila-cuerpo">
              <span className="fila-titulo">{etiqueta}</span>
            </div>
            <CampoTextoLinea
              valor={String(formato[campo] ?? '')}
              ariaLabel={etiqueta}
              maxLength={60}
              onGuardar={(valor) => void cambiar({ [campo]: valor } as Partial<FormatoBancoTipo>)}
            />
          </div>
        ))}
      </div>

      <p className="seccion-pista">
        <strong>Trozos que se quitan</strong> de la descripción para poder leerla. Solo afectan a lo
        que se ve: las reglas se comparan siempre contra el texto original del banco.
      </p>
      <div className="tarjeta">
        {formato.prefijosALimpiar.map((patron, i) => (
          <div className="fila" key={i}>
            <code className="fila-cuerpo patron">{patron}</code>
            <button
              className="icono-boton"
              aria-label={`Quitar el patrón ${patron}`}
              onClick={() =>
                void cambiar({
                  prefijosALimpiar: formato.prefijosALimpiar.filter((_, j) => j !== i),
                })
              }
            >
              <IconoPapelera size={18} />
            </button>
          </div>
        ))}
      </div>

      <div className="fila-botones">
        <button
          className="boton boton-secundario"
          disabled={probando}
          onClick={() => archivo.current?.click()}
        >
          {probando ? 'Leyendo…' : 'Probar con un archivo'}
        </button>
        <input
          ref={archivo}
          type="file"
          accept=".xls,.xlsx,.csv"
          hidden
          onChange={(e) => {
            const fichero = e.target.files?.[0]
            e.target.value = ''
            if (fichero) void probar(fichero)
          }}
        />
      </div>

      {prueba ? (
        prueba.necesitaAyuda ? (
          <p className="banda-aviso">{prueba.motivo}</p>
        ) : (
          <div className="tarjeta">
            <p className="pista">
              Cabecera en la fila {(prueba.filaCabecera ?? 0) + 1} · {prueba.nOrigen} movimientos
              leídos. Las diez primeras:
            </p>
            {(prueba.movimientos ?? []).slice(0, 10).map((m, i) => (
              <div className="linea-simple" key={i}>
                <span className="linea-fecha">{m.fecha ?? '—'}</span>
                <span className="linea-limpia">{m.descripcionLimpia}</span>
                <span className="dinero">{euros(m.importe)}</span>
              </div>
            ))}
          </div>
        )
      ) : null}
    </section>
  )
}

/** Llevarse las reglas a otra máquina, o recuperarlas. */
function CopiaReglas({ onCambio }: { onCambio: () => Promise<void> | void }) {
  const { avisar, avisarError } = useAvisos()
  const archivo = useRef<HTMLInputElement>(null)

  const importar = async (fichero: File) => {
    try {
      const datos = JSON.parse(await fichero.text())
      const resultado = await api<{ anadidas: string[]; repetidas: string[]; sinConcepto: string[] }>(
        '/reglas/importar',
        { metodo: 'POST', cuerpo: { reglas: datos.reglas ?? datos } },
      )
      const partes = [`${resultado.anadidas.length} añadidas`]
      if (resultado.repetidas.length) partes.push(`${resultado.repetidas.length} ya estaban`)
      if (resultado.sinConcepto.length) {
        partes.push(`${resultado.sinConcepto.length} sin concepto conocido`)
      }
      avisar(`Reglas importadas: ${partes.join(', ')}.`)
      await onCambio()
    } catch (causa) {
      avisarError(causa instanceof SyntaxError ? 'Ese archivo no es un JSON válido.' : mensajeDeError(causa))
    }
  }

  return (
    <section className="seccion">
      <h3 className="seccion-titulo">Copia de las reglas</h3>
      <p className="seccion-pista">
        Un JSON con todas. Al importarlo, los conceptos se buscan por nombre y las repetidas se
        saltan, así que se puede cargar dos veces sin duplicar nada.
      </p>
      <div className="fila-botones">
        <a className="boton boton-secundario" href="/api/reglas/exportar" download>
          Exportar
        </a>
        <button className="boton boton-secundario" onClick={() => archivo.current?.click()}>
          Importar
        </button>
        <input
          ref={archivo}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const fichero = e.target.files?.[0]
            e.target.value = ''
            if (fichero) void importar(fichero)
          }}
        />
      </div>
    </section>
  )
}
