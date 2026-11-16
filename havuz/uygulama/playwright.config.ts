/**
 * Uçtan uca testler: GERÇEK API (geçici SQLite veritabanıyla) + DERLENMİŞ web (vite preview, /api vekili).
 * Önce derleme gerekir: `npm run e2e` bunu kendisi yapar (sunuculu ve hesapsız iki derleme).
 *
 * Projeler:
 *   telefon-390 / telefon-360 / masaustu-1280   hesaplı senaryolar üç ekran boyutunda
 *   yerel                                       hesapsız derleme (VITE_API_URL=none)
 *   ekran                                       docs/ekran/ ekran görüntüleri (`npm run shots`)
 *
 * Kapılar sabit değil, boş kapı seçilir (paylaşımlı makinede çakışmasın). Önceden kurulu Chromium için:
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chromium. Makine paylaşımlı: en çok 2 işçi.
 */
import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'
import { freePort } from './e2e/support/ports.ts'

// Ayar dosyası işçi süreçlerinde yeniden okunur; değerler ortam değişkeniyle bir kez seçilip paylaşılır.
process.env.E2E_API_PORT ??= String(freePort())
process.env.E2E_WEB_PORT ??= String(freePort())
process.env.E2E_YEREL_PORT ??= String(freePort())
process.env.E2E_DB ??= `.data/e2e-${Date.now()}.db`

const API = `http://127.0.0.1:${process.env.E2E_API_PORT}`
const WEB = `http://localhost:${process.env.E2E_WEB_PORT}`
const YEREL = `http://localhost:${process.env.E2E_YEREL_PORT}`
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

const chromium = {
  ...devices['Desktop Chrome'],
  locale: 'tr-TR',
  timezoneId: 'Europe/Istanbul',
  launchOptions: executablePath ? { executablePath } : {},
}
const phone = (width: number, height: number) => ({
  ...chromium,
  viewport: { width, height },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
})

const projects: PlaywrightTestConfig['projects'] = [
  { name: 'telefon-390', testIgnore: /(yerel|ekran)\.spec\.ts/, use: phone(390, 844) },
  { name: 'telefon-360', testIgnore: /(yerel|ekran)\.spec\.ts/, use: phone(360, 800) },
  {
    name: 'masaustu-1280',
    testIgnore: /(yerel|ekran)\.spec\.ts/,
    use: { ...chromium, viewport: { width: 1280, height: 800 } },
  },
  { name: 'yerel', testMatch: /yerel\.spec\.ts/, use: { ...phone(390, 844), baseURL: `${YEREL}/` } },
  { name: 'ekran', testMatch: /ekran\.spec\.ts/, use: { ...chromium, deviceScaleFactor: 2 } },
]

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalTeardown: './e2e/support/teardown.ts',
  use: {
    baseURL: `${WEB}/`,
    trace: 'retain-on-failure',
    // Servis çalışanı testleri etkilemesin; çevrimdışı açılış testi kendisi açar.
    serviceWorkers: 'block',
  },
  projects,
  webServer: [
    {
      command: 'npm run start -w @uygulama/api',
      url: `${API}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      env: {
        NODE_ENV: 'test',
        PORT: process.env.E2E_API_PORT,
        HOST: '127.0.0.1',
        DATABASE_PATH: process.env.E2E_DB,
        APP_URL: WEB,
        RATE_LIMIT: 'off',
      },
    },
    {
      command: `npm run preview -w @uygulama/web -- --port ${process.env.E2E_WEB_PORT} --strictPort`,
      url: `${WEB}/`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: API },
    },
    {
      command: `npm run preview -w @uygulama/web -- --mode yerel --port ${process.env.E2E_YEREL_PORT} --strictPort`,
      url: `${YEREL}/`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
})
