/**
 * Derlenmiş siteyi sunan küçük statik sunucu (uçtan uca testler ve ekran görüntüleri için).
 *   node scripts/serve.ts                         → dist/ klasörünü boş bir kapıda sunar, adresi yazar
 *   node scripts/serve.ts --port 4411             → belirli kapı
 *   node scripts/serve.ts --alt /alt/klasor/=dist-alt → ayrıca alt klasör derlemesini o yolda sunar
 * Bulunamayan adreslerde 404.html'i 404 durum koduyla döner (GitHub Pages / Netlify gibi).
 * İnsanlar için önizleme: `npm run preview` (Astro'nun kendi sunucusu, kapı 4411).
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}

export interface Mount {
  /** URL ön eki: "/" ya da "/alt/klasor/" */
  prefix: string
  /** Sunulacak klasör (mutlak yol) */
  root: string
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

/** İstek yolunu dosyaya çevirir; klasör → index.html. Kök dışına çıkan yolları reddeder. */
export async function resolveFile(mount: Mount, pathname: string): Promise<string | null> {
  const relative = decodeURIComponent(pathname.slice(mount.prefix.length))
  const candidate = path.resolve(mount.root, `.${path.sep}${relative}`)
  if (candidate !== mount.root && !candidate.startsWith(`${mount.root}${path.sep}`)) return null
  if (await isFile(candidate)) return candidate
  const index = path.join(candidate, 'index.html')
  return (await isFile(index)) ? index : null
}

export function createStaticServer(mounts: Mount[]): http.Server {
  const ordered = [...mounts].sort((a, b) => b.prefix.length - a.prefix.length)
  return http.createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      const mount = ordered.find(
        (candidate) => pathname.startsWith(candidate.prefix) || `${pathname}/` === candidate.prefix,
      )
      if (!mount) {
        response.writeHead(404).end('Bulunamadı')
        return
      }
      if (`${pathname}/` === mount.prefix) {
        response.writeHead(301, { Location: mount.prefix }).end()
        return
      }
      const file = await resolveFile(mount, pathname)
      if (file === null) {
        const notFound = path.join(mount.root, '404.html')
        response.writeHead(404, { 'Content-Type': TYPES['.html'] ?? 'text/html' })
        if (await isFile(notFound)) createReadStream(notFound).pipe(response)
        else response.end('Bulunamadı')
        return
      }
      response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
      createReadStream(file).pipe(response)
    })()
  })
}

function parseArgs(argv: string[]): { port: number; mounts: Mount[] } {
  let port = 0
  const mounts: Mount[] = [{ prefix: '/', root: path.resolve('dist') }]
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--port' && next !== undefined) {
      port = Number(next)
      index++
    } else if (arg === '--alt' && next !== undefined) {
      const [prefix = '', dir = ''] = next.split('=')
      mounts.push({ prefix: `/${prefix.replace(/^\/+|\/+$/gu, '')}/`, root: path.resolve(dir) })
      index++
    }
  }
  return { port, mounts }
}

if (import.meta.main) {
  const { port, mounts } = parseArgs(process.argv.slice(2))
  const server = createStaticServer(mounts)
  server.listen(port, '127.0.0.1', () => {
    const address = server.address()
    const actual = typeof address === 'object' && address ? address.port : port
    for (const mount of mounts) console.log(`Sunuluyor: http://127.0.0.1:${actual}${mount.prefix}  ←  ${mount.root}`)
  })
}
