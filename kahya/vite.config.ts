import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Arayüz web/ altında; derleme kahya/dist'e çıkar ve sunucu (server/index.ts) bu klasörü yayınlar.
// Geliştirmede Vite 5174'te çalışır, /api isteklerini 8787'deki sunucuya aktarır.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    port: 5174,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
})
