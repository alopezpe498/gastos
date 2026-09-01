// Servidor de IA simulado.
//
// Habla el mismo protocolo que la API de OpenAI (/v1/chat/completions), que es
// a lo que apunta el servidor cuando se le pone OPENAI_BASE_URL. Asi la
// importacion se prueba entera —prompt, parseo, validacion— sin gastar la clave
// real y, sobre todo, sin depender de que un modelo conteste hoy lo mismo que
// ayer.
//
// Ademas permite fingir las averias que de verdad importan: una respuesta
// cortada por longitud, un JSON envuelto en markdown, un modelo que se inventa
// conceptos que no existen, y un error del proveedor.
import http from 'node:http'

/**
 * @param {object} opciones
 * @param {(peticion: object) => object|string} opciones.responder
 *   Recibe el cuerpo de la peticion y devuelve lo que el modelo "contesta":
 *   un objeto (se serializa a JSON) o un texto tal cual.
 * @param {number} [opciones.estado] para fingir un error del proveedor.
 * @param {string} [opciones.motivoFin] 'length' finge una respuesta cortada.
 */
export async function levantarIaFalsa({ responder, estado = 200, motivoFin = 'stop' } = {}) {
  const recibidas = []
  // Mutable: una prueba puede necesitar que la segunda llamada conteste otra
  // cosa —el mismo ticket con otro total, para probar la vinculacion—.
  let contestar = responder

  const servidor = http.createServer((req, res) => {
    let cuerpo = ''
    req.on('data', (trozo) => {
      cuerpo += trozo
    })
    req.on('end', () => {
      let peticion = {}
      try {
        peticion = JSON.parse(cuerpo || '{}')
      } catch {
        peticion = {}
      }
      recibidas.push({ url: req.url, peticion })

      if (estado !== 200) {
        res.writeHead(estado, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'fallo simulado del proveedor' } }))
        return
      }

      const contestacion = contestar(peticion)
      const texto = typeof contestacion === 'string' ? contestacion : JSON.stringify(contestacion)

      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          choices: [{ message: { content: texto }, finish_reason: motivoFin }],
        }),
      )
    })
  })

  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver))
  const puerto = servidor.address().port

  return {
    base: `http://127.0.0.1:${puerto}`,
    /** Lo que ha recibido: sirve para comprobar que el prompt lleva lo que debe. */
    recibidas,
    ultimaPeticion: () => recibidas[recibidas.length - 1]?.peticion ?? null,
    /** El texto que se le mando al modelo, con el catalogo y el contenido. */
    ultimoTextoDeUsuario() {
      const mensajes = this.ultimaPeticion()?.messages ?? []
      const usuario = mensajes.find((m) => m.role === 'user')
      if (!usuario) return ''
      if (typeof usuario.content === 'string') return usuario.content
      return (usuario.content ?? [])
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n')
    },
    /** Si la peticion llevaba imagen. */
    ultimaLlevabaImagen() {
      const mensajes = this.ultimaPeticion()?.messages ?? []
      const usuario = mensajes.find((m) => m.role === 'user')
      return Array.isArray(usuario?.content)
        ? usuario.content.some((p) => p.type === 'image_url')
        : false
    },
    /** Cambia lo que contesta a partir de la siguiente llamada. */
    cambiarRespuesta(nuevo) {
      contestar = nuevo
    },
    async cerrar() {
      await new Promise((resolver) => servidor.close(resolver))
    },
  }
}
