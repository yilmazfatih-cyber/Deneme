import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Tekstil AI ERP',
        short_name: 'Tekstil ERP',
        description: 'Tekstil şirketleri için yapay zekâ destekli ERP',
        lang: 'tr',
        theme_color: '#1f3a5f',
        background_color: '#f6f5f1',
        display: 'standalone',
        start_url: './',
        icons: [{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        globIgnores: ['**/tesseract/**', '**/tessdata/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            // Açık model ağırlıkları (TF.js COCO-SSD, Tesseract dil verileri) ilk indirmeden sonra çevrimdışı kalır
            urlPattern: ({ url }) =>
              /tfhub|kaggle|storage\.googleapis|tessdata|tesseract|jsdelivr|unpkg/.test(url.hostname + url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'ai-models', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 180 } },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@tensorflow')) return 'tf';
          if (id.includes('tesseract.js')) return 'ocr';
          if (id.includes('pdfjs-dist')) return 'pdf';
          if (id.includes('recharts')) return 'charts';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
