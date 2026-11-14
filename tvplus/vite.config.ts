import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Geliştirmede SPA'yı Vite (5173) sunar; API/CDN yolları Node sunucusuna (8787) aktarılır.
// Üretimde (npm run build && npm start) her şeyi tek kapıdan Node sunucusu verir.
const SERVER = process.env.TVP_SERVER_ORIGIN ?? 'http://127.0.0.1:8787'
const PROXIED = ['/graphql', '/api', '/msl', '/oca', '/img', '/log', '/push']

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(PROXIED.map((p) => [p, { target: SERVER, changeOrigin: false }])),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
})
