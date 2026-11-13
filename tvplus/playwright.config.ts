import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

/**
 * Uçtan uca testler gerçek sunucuyu (derlenmiş web ile, tek kapı) ayağa kaldırır ve gerçek tarayıcıda gezer.
 * Oynatma testleri açık içeriği (Sintel) uzak kökenden çektiği için ağ gerekir; `TVP_E2E_OFFLINE=1` bunları atlar.
 * Her koşu temiz bir veri klasörüyle başlar.
 */
const PORT = Number(process.env.TVP_E2E_PORT ?? 8899)
const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-e2e-'))

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npx tsx server/src/index.ts',
    url: `http://127.0.0.1:${PORT}/api/boot`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PORT: String(PORT), HOST: '127.0.0.1', TVP_DATA_DIR: dataDir, TVP_LOG_LEVEL: 'warn' },
  },
  projects: [
    { name: 'web', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobil', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
})
