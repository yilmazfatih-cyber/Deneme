// Fiş service worker: uygulama kabuğunu önbelleğe alır; internet yoksa önbellekten açılır.
const CACHE = 'fis-v3'
const SHELL = [
  './',
  './index.html',
  './app.mjs',
  './fis.mjs',
  './ornek.mjs',
  './vendor/qrcode.mjs',
  './vendor/fflate.mjs',
  './manifest.webmanifest',
  './icon.svg',
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      // Yalnızca Fiş'in eski önbellekleri silinir: aynı kökte Köprü ve Bölüş'ün önbellekleri de durur.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fis-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Önce ağ (güncel sürüm), olmazsa önbellek.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Yalnızca sağlıklı yanıtlar önbelleğe girer; dağıtım sırasındaki 404 iyi kopyayı ezmesin.
        if (res.ok && res.type === 'basic') {
          const copy = res.clone()
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)))
        }
        return res
      })
      .catch(() =>
        caches
          .open(CACHE)
          .then((c) =>
            c
              .match(e.request, { ignoreSearch: true })
              .then((r) => r || (e.request.mode === 'navigate' ? c.match('./index.html') : undefined)),
          )
          .then((r) => r || Response.error()),
      ),
  )
})
