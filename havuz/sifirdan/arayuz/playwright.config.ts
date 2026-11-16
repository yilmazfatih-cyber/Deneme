// Uçtan uca testler: derlenmiş gösterim sitesi `vite preview` ile sunulur; her gösterim telefon boyutlarında
// (390×844 ve 360×800) açılır, temel bir etkileşim yapılır, yatay kaydırma ve axe taraması denetlenir.
// Kapı: scripts/e2e.ts boş bir kapı bulur ve E2E_PORT ile verir (sabit kapı yok). Makine paylaşımlı: 2 işçi.
// Önceden kurulu Chromium: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chromium
// Genişletme: yeni gösterimin etkileşimi e2e/etkilesimler.ts'e eklenir.
import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 8452)
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

const phone = {
  ...devices['Pixel 7'],
  browserName: 'chromium' as const,
  locale: 'tr-TR',
  timezoneId: 'Europe/Istanbul',
  deviceScaleFactor: 1,
  launchOptions: executablePath ? { executablePath } : {},
}

export default defineConfig({
  testDir: './e2e',
  workers: 2,
  fullyParallel: true,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}/`, trace: 'retain-on-failure' },
  projects: [
    { name: 'telefon-390', use: { ...phone, viewport: { width: 390, height: 844 } } },
    { name: 'telefon-360', use: { ...phone, viewport: { width: 360, height: 800 } } },
  ],
  webServer: {
    command: `npx vite preview --port ${port} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
