/**
 * Web derlemesini (dist/) sunan küçük durağan sunucu: Playwright testleri ve elle deneme için.
 * expo-sqlite web'de SharedArrayBuffer ister; bunun için her yanıta COOP/COEP başlıkları eklenir. Bilinmeyen adres
 * index.html döner (tek sayfa uygulaması). Yalnız 127.0.0.1'i dinler.
 *
 * Kullanım: npm run serve:web            (kapı 5320)
 *           node scripts/serve-web.ts dist 0   (boş kapı; açılan kapı ilk satırda "PORT <sayı>" olarak yazılır)
 * Genişletme: yeni bir dosya türü → TYPES'a uzantı ve içerik türü ekleyin.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
}

export const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
} as const

async function fileFor(root: string, pathname: string): Promise<string> {
  const decoded = decodeURIComponent(pathname)
  const candidate = normalize(join(root, decoded))
  if (candidate !== root && !candidate.startsWith(root + sep)) return join(root, 'index.html')
  try {
    const info = await stat(candidate)
    return info.isDirectory() ? join(candidate, 'index.html') : candidate
  } catch {
    return join(root, 'index.html')
  }
}

export function serveStatic(rootDir: string, port: number): Promise<Server> {
  const root = resolve(rootDir)
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    void fileFor(root, url.pathname).then((file) => {
      for (const [name, value] of Object.entries(ISOLATION_HEADERS)) response.setHeader(name, value)
      response.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
      response.setHeader('Cache-Control', 'no-cache')
      const stream = createReadStream(file)
      stream.on('error', () => {
        response.statusCode = 404
        response.end()
      })
      stream.pipe(response)
    })
  })
  return new Promise((resolvePromise) => server.listen(port, '127.0.0.1', () => resolvePromise(server)))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir = 'dist', portText = '5320'] = process.argv.slice(2)
  const server = await serveStatic(dir, Number(portText))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : Number(portText)
  console.log(`PORT ${port}`)
  console.log(`Web derlemesi: http://127.0.0.1:${port} (durdurmak için Ctrl+C)`)
}
