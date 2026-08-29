/**
 * Genera los iconos PNG de la PWA sin dependencias externas.
 * Dibuja tres barras crecientes con supersampling 4x y codifica el PNG a mano.
 *
 *   npm run iconos
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SS = 4 // factor de supersampling

// ---------- codificacion PNG ----------
const TABLA_CRC = (() => {
  const tabla = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c
  }
  return tabla
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i += 1) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function bloque(tipo, datos) {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([largo, cuerpo, crc])
}

function codificarPng(ancho, alto, rgba) {
  const crudo = Buffer.alloc((ancho * 4 + 1) * alto)
  for (let y = 0; y < alto; y += 1) {
    crudo[y * (ancho * 4 + 1)] = 0 // filtro None
    rgba.copy(crudo, y * (ancho * 4 + 1) + 1, y * ancho * 4, (y + 1) * ancho * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // color RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', deflateSync(crudo, { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ])
}

// ---------- geometria ----------
const dentroDeRectangulo = (x, y, w, h, r) => {
  const cx = Math.min(Math.max(x, r), w - r)
  const cy = Math.min(Math.max(y, r), h - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

const dentroDeCapsula = (x, y, x1, y1, x2, y2, r) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const largo2 = dx * dx + dy * dy || 1
  const t = Math.min(1, Math.max(0, ((x - x1) * dx + (y - y1) * dy) / largo2))
  const px = x1 + t * dx
  const py = y1 + t * dy
  return (x - px) ** 2 + (y - py) ** 2 <= r * r
}

/**
 * Tres barras crecientes en un espacio de 100x100: el gasto que sube. Cada una
 * es una capsula vertical, asi que las puntas salen redondeadas sin esfuerzo.
 */
const BARRAS = [
  [22, 80, 22, 60, 9],
  [50, 80, 50, 40, 9],
  [78, 80, 78, 20, 9],
]

const dentroDelGlifo = (x, y) => BARRAS.some((b) => dentroDeCapsula(x, y, ...b))

// ---------- dibujo ----------
const entre = (a, b, t) => a + (b - a) * t

/** @param tam px finales, @param escala 0..1 del lienzo, @param radio 0 = cuadrado completo */
function dibujar(tam, escala, radio) {
  const W = tam * SS
  const px = Buffer.alloc(tam * tam * 4)
  const acumulado = new Float32Array(tam * tam * 4)

  const glifo = W * escala
  const margen = (W - glifo) / 2
  const r = W * radio

  for (let sy = 0; sy < W; sy += 1) {
    for (let sx = 0; sx < W; sx += 1) {
      if (radio !== 0 && !dentroDeRectangulo(sx + 0.5, sy + 0.5, W, W, r)) continue

      // Degradado diagonal: del verde azulado profundo al mas claro.
      const t = (sx / W) * 0.35 + (sy / W) * 0.65
      let rojo = entre(0x1c, 0x0d, t)
      let verde = entre(0x8c, 0x59, t)
      let azul = entre(0x7f, 0x50, t)

      const gx = ((sx + 0.5 - margen) / glifo) * 100
      const gy = ((sy + 0.5 - margen) / glifo) * 100
      if (gx >= 0 && gx <= 100 && gy >= 0 && gy <= 100 && dentroDelGlifo(gx, gy)) {
        rojo = verde = azul = 255
      }

      const di = (Math.floor(sy / SS) * tam + Math.floor(sx / SS)) * 4
      acumulado[di] += rojo
      acumulado[di + 1] += verde
      acumulado[di + 2] += azul
      acumulado[di + 3] += 255
    }
  }

  const muestras = SS * SS
  for (let i = 0; i < tam * tam; i += 1) {
    const alfa = acumulado[i * 4 + 3] / muestras
    const cobertura = alfa / 255 || 1
    px[i * 4] = Math.round(acumulado[i * 4] / muestras / cobertura)
    px[i * 4 + 1] = Math.round(acumulado[i * 4 + 1] / muestras / cobertura)
    px[i * 4 + 2] = Math.round(acumulado[i * 4 + 2] / muestras / cobertura)
    px[i * 4 + 3] = Math.round(alfa)
  }

  return codificarPng(tam, tam, px)
}

const destinos = [
  ['public/icons/icon-192.png', 192, 0.6, 0.22],
  ['public/icons/icon-512.png', 512, 0.6, 0.22],
  // El maskable deja margen de sobra: los lanzadores recortan por su cuenta.
  ['public/icons/icon-maskable-512.png', 512, 0.46, 0],
  // iOS aplica su propia mascara, asi que el icono va a sangre.
  ['public/icons/apple-touch-icon.png', 180, 0.6, 0],
]

for (const [ruta, tam, escala, radio] of destinos) {
  const salida = join(RAIZ, ruta)
  mkdirSync(dirname(salida), { recursive: true })
  writeFileSync(salida, dibujar(tam, escala, radio))
  console.log('OK', ruta)
}
