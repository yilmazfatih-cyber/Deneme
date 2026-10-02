import { defineConfig, devices } from '@playwright/test'

/**
 * Uçtan uca testler ve ekran görüntüleri telefon boyutunda çalışır (390×844 ve 360×800).
 * Önce derleme gerekir: `npm run e2e` / `npm run shots` bunu kendisi yapar.
 * Önceden kurulu bir Chromium kullanmak için: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chrome
 */
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
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'shots/**/*.spec.ts'],
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'telefon-390', use: { ...phone, viewport: { width: 390, height: 844 } } },
    { name: 'telefon-360', use: { ...phone, viewport: { width: 360, height: 800 } } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
