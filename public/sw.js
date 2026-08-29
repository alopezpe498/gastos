// Service worker de Gastos.
// Estrategia: precache del shell de la app + "network first" para navegaciones
// (para que una nueva versión se vea al recargar) y "stale while revalidate"
// para los estáticos con hash. Las llamadas a /api nunca se cachean.
const VERSION = 'gastos-v1'
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  // La serif de los titulares y de las cifras se precachea: sin red, la app se
  // ve igual.
  '/fonts/fraunces-latin.woff2',
]

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request
  if (peticion.method !== 'GET') return

  const url = new URL(peticion.url)
  if (url.origin !== self.location.origin) return
  // El dinero nunca se sirve de la caché: si no hay red, mejor un error visible
  // que un saldo viejo con pinta de bueno.
  if (url.pathname.startsWith('/api')) return

  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          const copia = respuesta.clone()
          caches.open(VERSION).then((cache) => cache.put('/index.html', copia))
          return respuesta
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    )
    return
  }

  evento.respondWith(
    caches.match(peticion).then((enCache) => {
      const red = fetch(peticion)
        .then((respuesta) => {
          if (respuesta && respuesta.status === 200) {
            const copia = respuesta.clone()
            caches.open(VERSION).then((cache) => cache.put(peticion, copia))
          }
          return respuesta
        })
        .catch(() => enCache)
      return enCache || red
    }),
  )
})
