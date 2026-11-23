/**
 * İletişim formu → uygulama API'si uçtan uca testinin ayarı (tarif: havuz/tarifler/site-iletisim-formu-api).
 * Sunucuları bu ayar BAŞLATMAZ: tarifin dogrula.py'si API'yi ve PUBLIC_FORM_ENDPOINT ile derlenmiş siteyi boş
 * kapılarda başlatıp adresleri SITE_URL ve API_URL ile verir. Tek proje ve tek işçi: hız sınırı bütçesi
 * (IP başına saatte 5 ileti) testler arasında paylaşılır, sıra belirli kalsın.
 *
 *   SITE_URL=http://127.0.0.1:<kapı> API_URL=http://127.0.0.1:<kapı> PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chrome \
 *     npx playwright test --config tests/tarif/playwright.config.ts
 * Genişletme: yeni senaryo → bu klasörde `<ad>.spec.ts` (hız sınırı bütçesini README'deki tabloya yazın).
 */
import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: 'list',
  use: { baseURL: `${process.env.SITE_URL ?? 'http://127.0.0.1:4411'}/`, trace: 'off' },
  projects: [
    {
      name: 'telefon-390',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
})
