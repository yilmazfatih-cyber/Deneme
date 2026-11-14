/**
 * dist-pages/ klasörünü GitHub Pages gibi sunan küçük durağan sunucu (yalnız sınama ve önizleme için).
 *   npm run serve:pages                 → http://127.0.0.1:8911/Deneme/
 *   PORT=8915 TVP_PAGES_BASE=/Deneme/ npm run serve:pages
 * Pages'in davranışı: yalnız GET/HEAD (öteki yöntemlere 405), klasör → index.html, bilinmeyen yol → 404,
 * metin dosyaları gzip'li. Ağda hiçbir API sunucusu yoktur: uygulama arka ucunu tarayıcıda çalıştırır.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(process.env.TVP_PAGES_DIR ?? join(import.meta.dirname, '..', 'dist-pages'))
const BASE = (process.env.TVP_PAGES_BASE ?? '/Deneme/').replace(/\/*$/, '/')
const PORT = Number(process.env.PORT ?? process.argv[2] ?? 8911)
const HOST = process.env.HOST ?? '127.0.0.1'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.vtt': 'text/vtt; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4s': 'video/iso.segment',
  '.mpd': 'application/dash+xml',
}
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|dash\+xml)|image\/svg)/

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(`${ROOT}/index.html yok. Önce: npm run build:pages`)
  process.exit(1)
}

const gzCache = new Map<string, { mtimeMs: number; body: Buffer }>()

const server = createServer((req, res) => {
  const method = req.method ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' })
    res.end('405 Not Allowed (durağan barındırma)')
    return
  }
  const url = new URL(req.url ?? '/', 'http://x')
  let path = decodeURIComponent(url.pathname)
  if (path === BASE.slice(0, -1)) {
    res.writeHead(301, { location: BASE + url.search })
    res.end()
    return
  }
  if (!path.startsWith(BASE)) return notFound(res)
  path = path.slice(BASE.length)
  let file = normalize(join(ROOT, path))
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return notFound(res)
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!url.pathname.endsWith('/')) {
      res.writeHead(301, { location: `${url.pathname}/${url.search}` })
      res.end()
      return
    }
    file = join(file, 'index.html')
  }
  if (!existsSync(file) || !statSync(file).isFile()) return notFound(res)
  const st = statSync(file)
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`
  const headers: Record<string, string> = {
    'content-type': type,
    etag,
    'cache-control': 'max-age=600',
    'access-control-allow-origin': '*',
  }
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers)
    res.end()
    return
  }
  const gzip = COMPRESSIBLE.test(type) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
  if (gzip) {
    let hit = gzCache.get(file)
    if (!hit || hit.mtimeMs !== st.mtimeMs) {
      hit = { mtimeMs: st.mtimeMs, body: gzipSync(readFileSync(file)) }
      gzCache.set(file, hit)
    }
    res.writeHead(200, {
      ...headers,
      'content-encoding': 'gzip',
      'content-length': String(hit.body.length),
      vary: 'Accept-Encoding',
    })
    res.end(method === 'HEAD' ? undefined : hit.body)
    return
  }
  res.writeHead(200, { ...headers, 'content-length': String(st.size) })
  if (method === 'HEAD') res.end()
  else createReadStream(file).pipe(res)
})

function notFound(res: import('node:http').ServerResponse): void {
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
  res.end('<!doctype html><title>404</title><h1>404</h1><p>Bu adreste dosya yok (durağan barındırma).</p>')
}

server.listen(PORT, HOST, () => {
  console.log(`dist-pages sunuluyor: http://${HOST}:${PORT}${BASE}  (yalnız GET/HEAD; API sunucusu yok)`)
})
