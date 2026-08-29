import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { IconoPortapapeles } from './Iconos'

type Props = {
  abierta: boolean
  onCerrar: () => void
  /** Una imagen del portapapeles, arrastrada o leida con la API. */
  onImagen: (imagen: Blob) => void
  /** Texto plano: una lista copiada de un WhatsApp o un correo. */
  onTexto: (texto: string) => void
  /** Un PDF arrastrado hasta aqui: una factura, normalmente. */
  onPdf?: (archivo: File) => void
}

const TIPOS_IMAGEN = ['image/png', 'image/jpeg', 'image/webp']

const esMac = () =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent)

/**
 * Zona de pegado para escritorio. Acepta tres gestos sobre el mismo sitio:
 * Ctrl+V (o ⌘V), arrastrar y soltar una imagen, y el boton "Pegar", que lee el
 * portapapeles con la API cuando el navegador lo permite.
 *
 * Lo que salga de aqui entra en el mismo flujo que la foto o el archivo: misma
 * llamada a la IA y misma pantalla de revision.
 */
export function SheetPegar({ abierta, onCerrar, onImagen, onTexto, onPdf }: Props) {
  const [encima, setEncima] = useState(false)
  const [error, setError] = useState('')
  const [leyendo, setLeyendo] = useState(false)

  useEffect(() => {
    if (!abierta) return
    setError('')
    setEncima(false)

    // Se escucha en el documento para que Ctrl+V funcione nada mas abrir, sin
    // tener que hacer clic antes en la zona.
    const alPegar = (evento: ClipboardEvent) => {
      const datos = evento.clipboardData
      if (!datos) return

      for (const elemento of Array.from(datos.items)) {
        if (elemento.kind === 'file' && TIPOS_IMAGEN.includes(elemento.type)) {
          const archivo = elemento.getAsFile()
          if (archivo) {
            evento.preventDefault()
            onImagen(archivo)
            return
          }
        }
      }

      const texto = datos.getData('text/plain')
      if (texto.trim()) {
        evento.preventDefault()
        onTexto(texto)
        return
      }
      setError('Lo que has pegado no es ni una imagen ni texto.')
    }

    document.addEventListener('paste', alPegar)
    return () => document.removeEventListener('paste', alPegar)
  }, [abierta, onImagen, onTexto])

  /** Alternativa por si el usuario prefiere el boton al atajo de teclado. */
  const pegarConApi = async () => {
    setError('')
    if (!navigator.clipboard?.read) {
      setError(
        `Este navegador no deja leer el portapapeles desde un boton. Usa ${esMac() ? '⌘V' : 'Ctrl+V'}.`,
      )
      return
    }
    setLeyendo(true)
    try {
      const elementos = await navigator.clipboard.read()

      for (const elemento of elementos) {
        const tipo = elemento.types.find((candidato) => TIPOS_IMAGEN.includes(candidato))
        if (tipo) {
          onImagen(await elemento.getType(tipo))
          return
        }
      }
      for (const elemento of elementos) {
        if (elemento.types.includes('text/plain')) {
          const texto = await (await elemento.getType('text/plain')).text()
          if (texto.trim()) {
            onTexto(texto)
            return
          }
        }
      }
      setError('El portapapeles no contiene ninguna imagen ni texto.')
    } catch {
      // Lo habitual es que el navegador haya denegado el permiso.
      setError(
        `No se ha podido leer el portapapeles: puede que el navegador no haya dado permiso. Prueba con ${esMac() ? '⌘V' : 'Ctrl+V'}.`,
      )
    } finally {
      setLeyendo(false)
    }
  }

  const soltar = (evento: React.DragEvent) => {
    evento.preventDefault()
    setEncima(false)
    setError('')
    const archivo = evento.dataTransfer.files?.[0]
    if (!archivo) return
    // Una factura en PDF sigue otro camino: el servidor le saca el texto.
    if (archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name)) {
      if (!onPdf) {
        setError('Aqui no se pueden soltar PDF.')
        return
      }
      onPdf(archivo)
      return
    }
    if (!TIPOS_IMAGEN.includes(archivo.type)) {
      setError('Ese archivo no es una imagen ni un PDF. Admite PNG, JPEG, WEBP o PDF.')
      return
    }
    onImagen(archivo)
  }

  return (
    <Sheet abierta={abierta} titulo="Pegar desde el portapapeles" onCerrar={onCerrar}>
      <div
        className={`zona-pegado${encima ? ' encima' : ''}`}
        onDragOver={(evento) => {
          evento.preventDefault()
          setEncima(true)
        }}
        onDragLeave={(evento) => {
          if (evento.currentTarget.contains(evento.relatedTarget as Node)) return
          setEncima(false)
        }}
        onDrop={soltar}
      >
        <div className="zona-pegado-icono" aria-hidden="true">
          <IconoPortapapeles size={30} />
        </div>
        <p className="zona-pegado-titulo">
          Pulsa <kbd>{esMac() ? '⌘' : 'Ctrl'}</kbd> + <kbd>V</kbd> para pegar la imagen
        </p>
        <p className="zona-pegado-texto">
          También puedes arrastrar aquí una imagen o una factura en PDF, o pegar texto: una tabla
          copiada del Excel, una lista «concepto importe», o una frase como «Amazon 63,99 y
          farmacia 4,72».
        </p>
      </div>

      {error ? <p className="error-linea">{error}</p> : null}

      <button
        className="boton boton-secundario boton-ancho"
        style={{ marginTop: 14 }}
        onClick={() => void pegarConApi()}
        disabled={leyendo}
      >
        <IconoPortapapeles size={18} />
        {leyendo ? 'Leyendo...' : 'Pegar'}
      </button>

      <p className="pista">
        Da igual lo que pegues: todo acaba en la misma pantalla de revisión, y nada se guarda
        hasta que lo confirmes.
      </p>
    </Sheet>
  )
}
