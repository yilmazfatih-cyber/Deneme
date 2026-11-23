/**
 * Belgeye soru uçtan uca testinin ayarı (tarif: havuz/tarifler/belgeye-soru-uygulamasi). Sunucuları bu ayar
 * BAŞLATMAZ: tarifin dogrula.py'si yz sunucusunu (sahte sağlayıcı + örnek belgeler) ve derlenmiş web'i sunan API'yi
 * boş kapılarda başlatıp adresi SOR_WEB_URL ile verir, bitince kapatır. Dosya adları `*.tarif.ts`: `npm run e2e`
 * bu testleri toplamaz (onların yz sunucusu yoktur).
 *
 *   SOR_WEB_URL=http://127.0.0.1:<kapı> PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chromium \
 *     npx playwright test --config e2e/sor/playwright.config.ts
 * Genişletme: yeni senaryo → bu klasörde `<ad>.tarif.ts`.
 */
import { defineConfig, devices } from '@playwright/test'

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

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.tarif.ts',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `${process.env.SOR_WEB_URL ?? 'http://127.0.0.1:8310'}/`,
    trace: 'off',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'telefon-390', use: phone(390, 844) },
    { name: 'telefon-360', use: phone(360, 800) },
  ],
})
