/**
 * SPA kabuğu (Netflix: sunucunun HTML'e gömdüğü `reactContext`).
 *  - web/dist statik dosyaları (karma adlı /assets/* değişmez önbellekli), /brand/* her zaman web/public/brand'den.
 *  - API öneki taşımayan GET istekleri web/dist/index.html'e düşer; `<!--TVP_BOOT-->` işaretinin yerine
 *    `<script id="tvp-boot" type="application/json">` içinde açılış bağlamı gömülür (`<` → <).
 *  - web/dist yoksa `npm run build` / `npm run dev` anlatan küçük bir Türkçe sayfa döner.
 *  - API önekli bilinmeyen adresler JSON 404 olarak kalır.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { BootContext } from '../../../shared/types'
import { buildBootContext } from '../services/identity/boot'
import { setNotFoundFallback } from './errors'

export const BOOT_MARKER = '<!--TVP_BOOT-->'
/** Bu öneklerle başlayan yollar SPA'ya düşmez (JSON 404 kalır). */
export const API_PREFIXES = ['/graphql', '/api', '/msl', '/oca', '/img', '/log', '/push'] as const
const STATIC_PREFIXES = ['/assets/', '/brand/']

export function isApiPath(url: string): boolean {
  const path = url.split('?')[0] ?? url
  return API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}

/** Açılış bağlamını HTML'e güvenle gömülecek biçime çevirir. */
export function bootScript(boot: BootContext): string {
  const json = JSON.stringify(boot).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return `<script id="tvp-boot" type="application/json">${json}</script>`
}

export function injectBoot(html: string, boot: BootContext): string {
  const script = bootScript(boot)
  if (html.includes(BOOT_MARKER)) return html.replace(BOOT_MARKER, () => script)
  if (html.includes('</head>')) return html.replace('</head>', () => `${script}</head>`)
  return script + html
}

const MISSING_DIST_HTML = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TV+ — derleme yok</title>
<style>body{font-family:system-ui,sans-serif;background:#0D0E12;color:#E8E9EE;max-width:40rem;margin:4rem auto;padding:0 1.5rem;line-height:1.6}code{background:#1C1E26;padding:.1rem .4rem;border-radius:4px}</style>
</head>
<body>
<h1>TV+ arayüzü henüz derlenmedi</h1>
<p>Sunucu çalışıyor, ama <code>web/dist</code> klasörü bulunamadı.</p>
<ul>
<li>Tek kapıdan çalıştırmak için: <code>npm run build</code>, ardından <code>npm start</code>.</li>
<li>Geliştirme için: <code>npm run dev</code> ve tarayıcıda <code>http://localhost:5173</code>.</li>
</ul>
<p>API uçları (<code>/api/boot</code>, <code>/graphql</code> …) şu an da yanıt veriyor.</p>
</body>
</html>`

export default async function plugin(app: FastifyInstance): Promise<void> {
  const distDir = app.config.webDistDir
  const brandDir = join(app.config.publicDir, 'brand')
  const indexFile = join(distDir, 'index.html')

  if (existsSync(brandDir)) {
    await app.register(fastifyStatic, {
      root: brandDir,
      prefix: '/brand/',
      decorateReply: false,
      index: false,
      cacheControl: false,
      setHeaders: (res) => {
        res.header('cache-control', 'public, max-age=86400')
      },
    })
  }

  if (existsSync(distDir)) {
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: '/',
      decorateReply: false,
      index: false,
      redirect: false,
      cacheControl: false,
      // index.html yalnızca açılış bağlamıyla (aşağıdaki geri dönüş) verilir.
      allowedPath: (pathName) => pathName !== '/' && pathName !== '/index.html',
      setHeaders: (res, path) => {
        const immutable = /[\\/]assets[\\/]/.test(path)
        res.header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300')
      },
    })
  }

  // index.html değişince (yeniden derleme) yeniden okunur.
  let cached: { mtimeMs: number; html: string } | null = null
  const readIndex = (): string | null => {
    try {
      const st = statSync(indexFile)
      if (!cached || cached.mtimeMs !== st.mtimeMs) cached = { mtimeMs: st.mtimeMs, html: readFileSync(indexFile, 'utf8') }
      return cached.html
    } catch {
      cached = null
      return null
    }
  }

  setNotFoundFallback(app, async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false
    const path = req.url.split('?')[0] ?? '/'
    if (isApiPath(path) || STATIC_PREFIXES.some((p) => path.startsWith(p))) return false
    reply.header('cache-control', 'no-store')
    const html = readIndex()
    if (html === null) {
      await reply.code(200).type('text/html; charset=utf-8').send(MISSING_DIST_HTML)
      return true
    }
    const boot = await buildBootContext(app, req)
    await reply.code(200).type('text/html; charset=utf-8').send(injectBoot(html, boot))
    return true
  })
}
