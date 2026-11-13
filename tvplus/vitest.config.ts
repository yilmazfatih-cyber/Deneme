import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/test/**/*.test.ts', 'web/src/**/*.test.ts', 'shared/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 20_000,
    // Her test dosyası kendi veri klasörünü kullanır (bkz. server/test/helpers.ts); paralel çalışabilir.
    pool: 'forks',
  },
})
