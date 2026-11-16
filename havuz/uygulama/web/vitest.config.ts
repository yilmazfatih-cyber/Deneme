// Web birim/bileşen testleri: jsdom + fake-indexeddb. Ağ yoktur; sunucu yerine shared'daki MemoryServer kullanılır.
// Makine paylaşımlı olduğu için en çok 2 işçi.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // PWA kayıt modülü yalnız derlemede vardır; testte boş bir taklit kullanılır.
    alias: { 'virtual:pwa-register': new URL('./test/helpers/pwaRegisterStub.ts', import.meta.url).pathname },
  },
  define: { __APP_VERSION__: JSON.stringify('0.0.0-test') },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    maxWorkers: 2,
    restoreMocks: true,
    testTimeout: 15_000,
  },
})
