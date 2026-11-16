// Birim testlerin ayarı. Varsayılan ortam Node'dur; DOM isteyen test dosyası ilk satırına
// `// @vitest-environment jsdom` yazar. Makine paylaşımlı olduğu için en fazla 2 işçi kullanılır.
// Genişletme: yeni bir test klasörü `test/<sistem>/` altında açılır; ayrıca kayıt gerekmez.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment', development: false } },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    maxWorkers: 2,
    testTimeout: 20_000,
  },
})
