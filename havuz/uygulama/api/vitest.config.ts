/**
 * API testlerinin ayarı. Makine paylaşımlı olduğu için en çok 2 işçi; node:sqlite deneysel uyarısı bastırılır.
 *
 * Genişletme: yeni test klasörü eklerseniz `include` kalıbına uyduğundan emin olun (test/**\/*.test.ts).
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    maxWorkers: 2,
    execArgv: ['--disable-warning=ExperimentalWarning'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
