/**
 * Uçtan uca testler (web derlemesi, Chromium). Önce `npm run build:web` (npm run e2e bunu yapar). Durağan sunucu
 * boş bir kapıda açılır (e2e/support/global-setup.ts) ve COOP/COEP başlıklarını verir (expo-sqlite web için şart).
 *
 *   telefon-390 / telefon-360   hesapsız kip duman testi + erişilebilirlik taraması
 *   ekran                       docs/ekran/ ekran görüntüleri (390×844, açık/koyu, deviceScaleFactor 2)
 *   api                         gerçek API'yle giriş + eşitleme (npm run e2e:api; MOBIL_API_URL gerekir)
 *
 * Önceden kurulu Chromium: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chromium (bu ortamda /opt/pw-browsers/chromium).
 */
import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
const launchOptions = executablePath ? { executablePath } : {}
const phone = (width: number, height: number) => ({
  ...devices['Pixel 7'],
  viewport: { width, height },
  locale: 'tr-TR',
  timezoneId: 'Europe/Istanbul',
  launchOptions,
})

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/support/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'off', actionTimeout: 15_000 },
  projects: [
    { name: 'telefon-390', testMatch: /yerel\.spec\.ts/, use: phone(390, 844) },
    { name: 'telefon-360', testMatch: /yerel\.spec\.ts/, use: phone(360, 800) },
    { name: 'ekran', testMatch: /ekran\.spec\.ts/, use: { ...phone(390, 844), deviceScaleFactor: 2 } },
    { name: 'api', testMatch: /api\.spec\.ts/, use: phone(390, 844) },
  ],
})
