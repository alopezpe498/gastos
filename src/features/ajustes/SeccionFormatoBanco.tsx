import { useEffect, useRef, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { FormatoBanco as FormatoBancoTipo, LecturaPrueba } from '../../lib/tipos'
import { useAvisos } from '../../components/Avisos'
import { CampoTextoLinea } from '../../components/Campos'
import { IconoPapelera } from '../../components/Iconos'
import { euros } from '../../lib/formato'

/**
 * Cómo viene el fichero del banco.
 *
 * Se enseña lo que la aplicación ha deducido y se puede corregir. «Probar con
 * un archivo» es lo importante: enseña las primeras filas ya interpretadas, que
 * es la única forma de saber si el formato está bien sin importar de verdad.
 */
export function SeccionFormatoBanco() {
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
