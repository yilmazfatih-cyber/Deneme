// Vitest ayarı: testler `test/` altında, Node ortamında koşar.
// Paylaşımlı makinede nazik olmak için en çok 2 işçi kullanılır.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    maxWorkers: 2,
    testTimeout: 20_000,
  },
})
