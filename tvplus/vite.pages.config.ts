/**
 * Durağan barındırma derlemesi (GitHub Pages): `npm run build:pages` → dist-pages/.
 *  - Göreli taban (`./`): site her alt yolda (ör. /Deneme/) çalışır.
 *  - Giriş static-host/page/main.ts: arka ucu (worker) bağlar, API taşımasını kurar, sonra web/src/main.tsx'i yükler.
 *  - Worker paketi gerçek sunucu kodunu (server/src) içerir; Node modülleri static-host/node altındaki tarayıcı
 *    karşılıklarına, fastify ve eklentileri static-host/host altındaki ev sahibine takma adla bağlanır.
 *  - İçerik paketi (tvp-icerik.json) content/**'ten derlemede üretilir.
 * Varsayılan derleme (vite.config.ts → web/dist) bu dosyadan etkilenmez.
 */
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Alias, type Plugin } from 'vite'
import { buildContentPack } from './static-host/build/content-pack.ts'
import { CONTENT_PACK_FILE } from './static-host/shared/protocol.ts'

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url))
const shim = (name: string): string => here(`./static-host/node/${name}.ts`)
const host = (name: string): string => here(`./static-host/host/${name}.ts`)

/** `node:x` ve çıplak `x` adlarını aynı karşılığa bağlar (yalnız tam eşleşme). */
const nodeAlias = (names: string[], target: string): Alias => ({
  find: new RegExp(`^(?:node:)?(?:${names.map((n) => n.replace('/', '\\/')).join('|')})$`),
  replacement: target,
})

const aliases: Alias[] = [
  nodeAlias(['fs/promises'], shim('fs-promises')),
  nodeAlias(['fs'], shim('fs')),
  nodeAlias(['path', 'path/posix'], shim('path')),
  nodeAlias(['crypto'], shim('crypto')),
  nodeAlias(['os'], shim('os')),
  nodeAlias(['url'], shim('url')),
  nodeAlias(['stream'], shim('stream')),
  nodeAlias(['zlib'], shim('zlib')),
  nodeAlias(['http', 'https'], shim('http')),
  nodeAlias(['string_decoder'], shim('string-decoder')),
  nodeAlias(['timers/promises'], shim('timers-promises')),
  nodeAlias(['timers'], shim('timers')),
  nodeAlias(['events'], shim('events')),
  { find: /^node:buffer$/, replacement: shim('buffer') },
  { find: /^(?:node:)?process$/, replacement: shim('process') },
  { find: /^fastify$/, replacement: host('fastify') },
  { find: /^@fastify\/cookie$/, replacement: host('fastify-cookie') },
  { find: /^@fastify\/formbody$/, replacement: host('fastify-formbody') },
  { find: /^@fastify\/static$/, replacement: host('fastify-static') },
  { find: /^sharp$/, replacement: shim('sharp') },
  { find: /^undici$/, replacement: shim('undici') },
]

/** index.html'in uygulama girişini durağan girişle değiştirir; içerik paketini yayımlar. */
function pagesPlugin(): Plugin {
  return {
    name: 'tvp-pages',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html
          .replace('src="/src/main.tsx"', 'src="../static-host/page/main.ts"')
          // Marka simgesi göreli: alt yolda da bulunur.
          .replace('href="/brand/logo.png"', 'href="./brand/logo.png"'),
    },
    generateBundle() {
      const pack = buildContentPack(here('.'))
      this.emitFile({ type: 'asset', fileName: CONTENT_PACK_FILE, source: pack.json })
      this.info(
        `içerik paketi: ${pack.files} dosya, ${(pack.bytes / 1024).toFixed(0)} KB (${pack.skipped.length} dosya dışarıda)`,
      )
    },
  }
}

/**
 * Vite tarayıcı derlemesinde `process.env` ifadesini `{}` ile değiştirir; sunucu kodu ise ortam değişkenlerini çalışma
 * anında okur (worker'daki `process` karşılığı: TVP_BASE_PATH vb.). Bu yüzden worker paketinde sunucu dosyalarındaki
 * `process.env`, prelude'un tanımladığı `__tvpProcessEnv` küresel adına çevrilir (yalnız NODE_ENV derlemede sabitlenir).
 */
function runtimeProcessEnv(): Plugin {
  return {
    name: 'tvp-runtime-process-env',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/](server|shared)[\\/].*\.ts$/.test(id) || !code.includes('process.env')) return null
      return { code: code.replace(/(?<![\w.$])process\.env\b(?!\.NODE_ENV)/g, '__tvpProcessEnv'), map: null }
    },
  }
}

export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react(), pagesPlugin()],
  resolve: { alias: aliases },
  worker: {
    format: 'iife',
    plugins: () => [runtimeProcessEnv()],
  },
  build: {
    outDir: '../dist-pages',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
})
