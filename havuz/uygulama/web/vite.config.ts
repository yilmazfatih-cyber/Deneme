// Web derleme ayarı: React + Tailwind + PWA. Kapılar: geliştirme 5310, önizleme 5311; /api istekleri API'ye
// (varsayılan http://127.0.0.1:8310; API yalnız IPv4 dinler) aktarılır. Uçtan uca testler API_PROXY_TARGET ile başka kapı verir.
//
// Önbellek kuralı: uygulama kabuğu (html/js/css/simge) servis çalışanınca önbelleğe alınır; /api ASLA alınmaz.
// Göreli taban (base: './'): aynı derleme alan adının kökünde de alt klasörde de (GitHub Pages) çalışır.
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { APP } from './src/app/config.ts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8310'
const proxy = { '/api': { target: apiTarget } }

/** index.html içindeki %APP_NAME% gibi yer tutucuları app/config.ts'ten doldurur. */
function appIdentity(): Plugin {
  return {
    name: 'uygulama-kimligi',
    transformIndexHtml: (html) =>
      html
        .replaceAll('%APP_NAME%', APP.name)
        .replaceAll('%APP_DESCRIPTION%', APP.description)
        .replaceAll('%APP_BACKGROUND%', APP.backgroundColor),
  }
}

export default defineConfig(({ mode }) => ({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    appIdentity(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: APP.name,
        short_name: APP.shortName,
        description: APP.description,
        lang: 'tr',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: APP.backgroundColor,
        theme_color: APP.themeColor,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        // API adresleri uygulama sayfası değildir: çevrimdışı yedek sayfa onlara karışmasın.
        navigateFallbackDenylist: [/^\/api(\/|$)/],
        cleanupOutdatedCaches: true,
        // Bilerek boş: API yanıtları önbelleğe alınmaz (veri yerel veritabanındadır).
        runtimeCaching: [],
      },
    }),
  ],
  server: { port: 5310, strictPort: true, proxy },
  preview: { port: 5311, strictPort: true, proxy },
  // `--mode yerel` (npm run build:yerel): hesapsız derleme ayrı klasöre çıkar, sunuculu derlemeyi ezmez.
  build: { outDir: mode === 'yerel' ? 'dist-yerel' : 'dist', chunkSizeWarningLimit: 900 },
}))
