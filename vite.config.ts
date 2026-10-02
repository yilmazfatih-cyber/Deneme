import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Göreli taban: GitHub Pages alt klasörü, Netlify ve Cloudflare Pages'te aynı derleme çalışır.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    // Telefonda denemek için yerel HTTPS: `npm run dev:https` (mikrofon ve service worker HTTPS ister)
    ...(mode === 'https' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg', 'symbols/*.svg', 'symbols/LICENSE.txt', 'audio/*'],
      manifest: {
        name: 'Köprü — resimlerle konuş',
        short_name: 'Köprü',
        description: 'Afazili yetişkinler için resimli iletişim panosu ve kelime pratiği.',
        lang: 'tr',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF8F5',
        theme_color: '#1B4F9C',
        categories: ['medical', 'health', 'education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,txt,mp3,m4a}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: {
    // React, yönlendirici, Dexie ve tüm içerik tek pakette (~185 kB gzip); ilk açılıştan sonra önbellekten gelir.
    chunkSizeWarningLimit: 800,
  },
  server: { host: true },
  preview: { host: true, port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
}))
