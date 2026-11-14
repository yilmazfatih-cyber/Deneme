import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, defineConfig } from '@playwright/test'

/**
 * Uçtan uca testler gerçek sunucuyu (derlenmiş web ile, tek kapı) ayağa kaldırır ve gerçek tarayıcıda gezer.
 * Her koşu temiz bir veri klasörüyle başlar: sunucu ilk açılışta sentetik izleme örneğini üretir, toplulukları
 * kümeler ve tahmin modelini eğitir (testler hazır olmasını stüdyo uçlarını yoklayarak bekler).
 *
 * Projeler:
 *   web    1440×900 masaüstü         mobil  390×844 dokunmatik        tv  1920×1080, `?cihaz=tv`, yalnız klavye
 *   cdn    CDN düğümlerini (sunucu geneli) yavaşlatan / kapatan testler: öteki projeler bittikten sonra tek başına
 *
 * Sintel'in medyası açık bir kökten ağ üzerinden gelir; bu testlerin adında "(ağ gerekir)" yazar ve
 * `TVP_E2E_OFFLINE=1` onları atlar. Makine paylaşımlı: 2 işçi, yeniden deneme yok (yeniden deneme isteyen test bulgudur).
 */
const PORT = Number(process.env.TVP_E2E_PORT ?? 8899)
const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-e2e-'))

// Önceden kurulu Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; Playwright kendi sürümünü bulamazsa ortamdaki kopya.
const FALLBACK_CHROMIUM = '/opt/pw-browsers/chromium'
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (!existsSync(chromium.executablePath()) && existsSync(FALLBACK_CHROMIUM) ? FALLBACK_CHROMIUM : undefined)

const TV_SPECS = /tv\.spec\.ts$/
const CDN_SPECS = /oynatma-cdn\.spec\.ts$/
const DESKTOP_ONLY = /(studyo|cihazlar-arasi|degismezler)\.spec\.ts$/

export default defineConfig({
  testDir: 'e2e',
  timeout: 150_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: Number(process.env.TVP_E2E_WORKERS ?? 2),
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required'],
      ...(executablePath ? { executablePath } : {}),
    },
  },
  webServer: {
    command: 'npx tsx server/src/index.ts',
    url: `http://127.0.0.1:${PORT}/api/boot`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: { PORT: String(PORT), HOST: '127.0.0.1', TVP_DATA_DIR: dataDir, TVP_LOG_LEVEL: 'warn' },
  },
  projects: [
    {
      name: 'web',
      testIgnore: [TV_SPECS, CDN_SPECS],
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobil',
      testIgnore: [TV_SPECS, CDN_SPECS, DESKTOP_ONLY],
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'tv',
      testMatch: TV_SPECS,
      use: { viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'cdn',
      testMatch: CDN_SPECS,
      dependencies: ['web', 'mobil', 'tv'],
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
})
