const LADO_MAXIMO = 1500
const CALIDAD = 0.8

/**
 * Reduce la foto antes de subirla: 1500 px de lado mayor y JPEG al 80%.
 * Una foto de movil pasa de varios MB a unos pocos cientos de KB.
 */
export async function comprimirImagen(
  // Blob y no File: del portapapeles llega un Blob suelto, sin nombre.
  archivo: Blob,
): Promise<{ base64: string; tipo: string; bytes: number }> {
  const mapa = await cargarBitmap(archivo)
  const escala = Math.min(1, LADO_MAXIMO / Math.max(mapa.width, mapa.height))
  const ancho = Math.round(mapa.width * escala)
  const alto = Math.round(mapa.height * escala)

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const contexto = lienzo.getContext('2d')
  if (!contexto) throw new Error('Este navegador no puede procesar la imagen.')
  contexto.drawImage(mapa, 0, 0, ancho, alto)
  if ('close' in mapa) mapa.close()

  const datos = lienzo.toDataURL('image/jpeg', CALIDAD)
  const base64 = datos.split(',')[1] ?? ''
  return { base64, tipo: 'image/jpeg', bytes: Math.round((base64.length * 3) / 4) }
}

async function cargarBitmap(archivo: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(archivo)
    } catch {
      // Safari antiguo: se cae al metodo con <img>.
    }
  }
  return new Promise((resolver, rechazar) => {
    const imagen = new Image()
    const url = URL.createObjectURL(archivo)
    imagen.onload = () => {
      URL.revokeObjectURL(url)
      resolver(imagen)
    }
    imagen.onerror = () => {
      URL.revokeObjectURL(url)
      rechazar(new Error('No se ha podido leer la foto.'))
    }
    imagen.src = url
  })
}

/** Lee un archivo (xlsx o csv) como base64 para mandarlo en el JSON. */
export function archivoABase64(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => {
      const resultado = String(lector.result ?? '')
      resolver(resultado.split(',')[1] ?? '')
    }
    lector.onerror = () => rechazar(new Error('No se ha podido leer el archivo.'))
    lector.readAsDataURL(archivo)
  })
}
