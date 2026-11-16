/**
 * Birim ve kural testlerinin ayarı (Vitest). Yalnız saf TypeScript modülleri sınanır; Astro bileşenleri
 * derlenmiş site üzerinde scripts/check-site.ts ve Playwright ile denetlenir.
 * Genişletme: yeni test dosyası → tests/unit/ (mantık) ya da tests/rules/ (proje kuralları) altına `*.test.ts`.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/rules/**/*.test.ts'],
    environment: 'node',
    // Makine paylaşımlı olabilir: işçi sayısını düşük tut.
    maxWorkers: 2,
    testTimeout: 20_000,
  },
})
