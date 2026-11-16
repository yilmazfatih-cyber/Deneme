// Üretecin uçtan uca testi (`npm run test:gen`, ~1–2 dk): geçici bir kopyada üretir, derler, lint ve testten geçirir.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['test/**/*.e2e.test.ts'],
    environment: 'node',
    maxWorkers: 1,
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
})
