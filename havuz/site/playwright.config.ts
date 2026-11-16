/**
 * Uçtan uca testler (Playwright + axe). `npm run e2e` önce siteyi iki kez derler (dist/ ve dist-alt/), sonra
 * küçük statik sunucuyu (scripts/serve.ts) boş bir kapıda başlatıp testleri üç ekran boyutunda koşar:
 * 390×844 ve 360×800 (telefon), 1280×800 (masaüstü). "alt-klasor" projesi aynı siteyi /alt/klasor/ altında dener.
 * Önceden kurulu Chromium için: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chrome (bu makinede /opt/pw-browsers/chromium).
 * Genişletme: yeni senaryo → tests/e2e/<ad>.spec.ts. Ekran görüntüleri: playwright.shots.config.ts.
 */
import { execFileSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'

/** Boş bir kapı bulur (sabit kapı başka işlerle çakışabilir). İşçi süreçleri aynı değeri ortam değişkeninden alır. */
function freePort(): number {
  if (process.env.E2E_PORT) return Number(process.env.E2E_PORT)
  const script =
    "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"
  const port = Number(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }).trim())
  process.env.E2E_PORT = String(port)
  return port
}

const port = freePort()
const origin = `http://127.0.0.1:${port}`
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

const browser = {
  browserName: 'chromium' as const,
  locale: 'tr-TR',
  timezoneId: 'Europe/Istanbul',
  launchOptions: executablePath ? { executablePath } : {},
}
const phone = { ...devices['Pixel 7'], ...browser, deviceScaleFactor: 1 }

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  // Makine paylaşımlı olabilir: en fazla iki işçi, cömert süreler.
  workers: 2,
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `${origin}/`, trace: 'off' },
  projects: [
    {
      name: 'telefon-390',
      use: { ...phone, viewport: { width: 390, height: 844 } },
      testIgnore: '**/alt-klasor.spec.ts',
    },
    {
      name: 'telefon-360',
      use: { ...phone, viewport: { width: 360, height: 800 } },
      testIgnore: '**/alt-klasor.spec.ts',
    },
    {
      name: 'masaustu-1280',
      use: { ...devices['Desktop Chrome'], ...browser, viewport: { width: 1280, height: 800 } },
      testIgnore: '**/alt-klasor.spec.ts',
    },
    {
      name: 'alt-klasor',
      use: {
        ...devices['Desktop Chrome'],
        ...browser,
        viewport: { width: 1280, height: 800 },
        baseURL: `${origin}/alt/klasor/`,
      },
      testMatch: '**/alt-klasor.spec.ts',
    },
  ],
  webServer: {
    command: `node scripts/serve.ts --port ${port} --alt /alt/klasor/=dist-alt`,
    url: `${origin}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
