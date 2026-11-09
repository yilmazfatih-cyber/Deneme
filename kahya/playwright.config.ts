import { defineConfig, devices } from '@playwright/test'

// Uçtan uca testler derlenmiş arayüzle (npm run e2e) bellek içi demo veritabanında çalışır.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
const launchOptions = executablePath ? { executablePath } : {}
const PORT = Number(process.env.E2E_PORT ?? 8788)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'off',
  },
  projects: [
    { name: 'masaustu', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 860 }, launchOptions } },
  ],
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning server/index.ts',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PORT: String(PORT), KAHYA_DB: ':memory:', KAHYA_DEMO: '1', KAHYA_SEED_DEMO: '1', KAHYA_AI: 'kural' },
  },
})
