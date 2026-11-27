import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Testler Workers çalışma zamanında (workerd) koşar. Bağlamalar wrangler.toml'dan gelir; gizli değerlerin yerine
// yalnız teste özgü, uydurma değerler konur.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          SONIOX_API_KEY: 'test-uzun-omurlu-soniox-anahtari-0123456789',
          OZET_TUZU: 'test-tuzu-yalniz-testlerde-kullanilir',
        },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
})
