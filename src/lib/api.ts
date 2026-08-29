const CLAVE_TOKEN = 'gastos.token'

export class ErrorApi extends Error {
  estado: number
  constructor(mensaje: string, estado: number) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.estado = estado
  }
}

export function leerToken(): string {
  try {
    return localStorage.getItem(CLAVE_TOKEN) ?? ''
  } catch {
    return ''
  }
}

export function guardarToken(token: string) {
  try {
    localStorage.setItem(CLAVE_TOKEN, token)
  } catch {
    // Navegacion privada: se sigue funcionando durante la sesion.
  }
}

export function olvidarToken() {
  try {
    localStorage.removeItem(CLAVE_TOKEN)
  } catch {
    // sin almacenamiento no hay nada que borrar
  }
}

/** Se avisa a la app cuando el token deja de valer, para volver al PIN. */
type ManejadorSesion = () => void
let alCaducarSesion: ManejadorSesion = () => {}
export function cuandoCaduqueLaSesion(manejador: ManejadorSesion) {
  alCaducarSesion = manejador
}

type Opciones = {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  cuerpo?: unknown
  sinAuth?: boolean
}

export async function api<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const { metodo = 'GET', cuerpo, sinAuth = false } = opciones
  const cabeceras: Record<string, string> = {}
  if (cuerpo !== undefined) cabeceras['content-type'] = 'application/json'

  const token = leerToken()
  if (!sinAuth && token) cabeceras.authorization = `Bearer ${token}`

  let respuesta: Response
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  } catch {
    throw new ErrorApi('Sin conexion con el servidor. Comprueba la red.', 0)
  }

  if (respuesta.status === 401 && !sinAuth) {
    olvidarToken()
    alCaducarSesion()
    throw new ErrorApi('Tu sesion ha caducado. Vuelve a introducir el PIN.', 401)
  }

  if (respuesta.status === 204) return undefined as T

  let datos: unknown = null
  const texto = await respuesta.text()
  if (texto) {
    try {
      datos = JSON.parse(texto)
    } catch {
      datos = null
    }
  }

  if (!respuesta.ok) {
    const mensaje =
      (datos as { error?: string } | null)?.error ?? 'Algo ha fallado. Reintenta en un momento.'
    throw new ErrorApi(mensaje, respuesta.status)
  }
  return datos as T
}

export const mensajeDeError = (causa: unknown): string =>
  causa instanceof ErrorApi || causa instanceof Error
    ? causa.message
    : 'Algo ha fallado. Reintenta en un momento.'

/**
 * Descarga un archivo de la API respetando el PIN.
 *
 * No vale con un <a href="/api/...">: el token va en la cabecera, no en la URL,
 * y meterlo en la direccion lo dejaria escrito en el historial del navegador.
 * Asi que se pide con fetch, se convierte en blob y se dispara la descarga.
 */
export async function descargar(ruta: string, nombrePorDefecto: string): Promise<void> {
  const token = leerToken()
  const respuesta = await fetch(`/api${ruta}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })

  if (respuesta.status === 401) {
    olvidarToken()
    alCaducarSesion()
    throw new ErrorApi('Tu sesion ha caducado. Vuelve a introducir el PIN.', 401)
  }

  if (!respuesta.ok) {
    let mensaje = 'No se ha podido preparar la descarga.'
    try {
      const datos = await respuesta.json()
      if (datos?.error) mensaje = datos.error
    } catch {
      // La respuesta de error no era JSON: se queda el mensaje generico.
    }
    throw new ErrorApi(mensaje, respuesta.status)
  }

  // El servidor manda el nombre en content-disposition; si falta, se usa el que
  // proponga quien llama.
  const cabecera = respuesta.headers.get('content-disposition') ?? ''
  const enCabecera = cabecera.match(/filename="([^"]+)"/)
  const nombre = enCabecera ? enCabecera[1] : nombrePorDefecto

  const blob = await respuesta.blob()
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Se libera en el siguiente ciclo: revocarlo antes cancela la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
