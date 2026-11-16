// Kök betiklerin (üreteç) hızlı birim testleri: `npm run test` içinde koşar.
// Üretecin uçtan uca testi (geçici kopyada üret + derle + test et) ayrıdır: vitest.gen.config.ts → `npm run test:gen`.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  test: { include: ['test/**/*.unit.test.ts'], environment: 'node', maxWorkers: 1 },
})
