/**
 * Derlenmiş web uygulamasını (WEB_DIST, ör. web/dist) API ile AYNI kökenden sunar: tek servisle yayın.
 *
 * Kurallar:
 *  - /api ile başlayan adresler buraya hiç düşmez (bilinmeyen API adresi JSON 404 alır).
 *  - Var olan dosya sunulur. `/assets/` altındakiler (Vite'ın özetli adlı dosyaları) 1 yıl, değişmez önbellekte
 *    tutulur; öteki her şey (index.html, sw.js, manifest…) `no-cache`: her açılışta tazelik sorulur (ETag ile).
 *  - Uzantısız ve bulunamayan adres → index.html (SPA yedeği). Uzantılı ve bulunamayan (ör. eski bir .js) → 404;
 *    yoksa tarayıcı JS yerine HTML alır ve anlaşılmaz bir hata verir.
 *  - Klasör dışına çıkma (`..`), gizli dosyalar (`.env`) ve bozuk kodlama 404 alır.
 *
 * Genişletme: yeni bir dosya türü sunulacaksa MIME_TYPES'a uzantısını ekleyin.
 */
import { existsSync, statSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { AppError } from '@uygulama/shared'
import type { Context, MiddlewareHandler } from 'hono'
import { errorResponse } from './errors.ts'
import type { AppEnv } from './types.ts'

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
}

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'
export const NO_CACHE = 'no-cache'

/** Klasör sunulabilir mi (index.html var mı)? */
export function isWebDistReady(root: string | null): root is string {
  return root !== null && existsSync(resolve(root, 'index.html')) && statSync(root).isDirectory()
}

function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/')
}

async function fileAt(path: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const info = await stat(path)
    return info.isFile() ? { size: info.size, mtimeMs: info.mtimeMs } : null
  } catch {
    return null
  }
}

async function sendFile(c: Context<AppEnv>, path: string, cacheControl: string): Promise<Response | null> {
  const info = await fileAt(path)
  if (!info) return null
  const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`
  // eslint-disable-next-line no-restricted-syntax -- dosya uzantısı ASCII'dir; Türkçe kural ("I" → "ı") burada YANLIŞ olur
  const extension = extname(path).toLowerCase()
  const headers: Record<string, string> = {
    'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
    'Cache-Control': cacheControl,
    ETag: etag,
  }
  if (c.req.header('if-none-match') === etag) return c.body(null, 304, headers)
  const body = await readFile(path)
  return c.body(body, 200, headers)
}

/** WEB_DIST'i sunan işleyici. Klasör hazır değilse `null` (yalnız API çalışır). */
export function staticWeb(root: string | null): MiddlewareHandler<AppEnv> | null {
  if (!isWebDistReady(root)) return null
  const base = resolve(root)
  const indexPath = resolve(base, 'index.html')
  const notFound = (c: Context<AppEnv>) => errorResponse(c, new AppError('not_found'))

  return async (c, next) => {
    if (isApiPath(c.req.path)) return next()
    let pathname: string
    try {
      pathname = decodeURIComponent(c.req.path)
    } catch {
      return notFound(c)
    }
    const segments = pathname.split('/')
    if (pathname.includes('\0') || segments.some((part) => part.startsWith('.') && part !== '.well-known')) {
      return notFound(c)
    }
    const target = resolve(base, `.${pathname}`)
    if (target !== base && !target.startsWith(base + sep)) return notFound(c)
    if (target !== base) {
      const cache = pathname.startsWith('/assets/') ? IMMUTABLE_CACHE : NO_CACHE
      const response = await sendFile(c, target, cache)
      if (response) return response
      if (extname(pathname) !== '') return notFound(c)
    }
    return (await sendFile(c, indexPath, NO_CACHE)) ?? notFound(c)
  }
}
