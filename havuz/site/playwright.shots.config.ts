/**
 * Ekran görüntüleri (insanlar için, deviceScaleFactor 2): `npm run shots` → docs/ekran/<sayfa>-<genişlik>-<tema>.jpg
 * Görüntüler ilk ekranı (kaydırmadan görünen kısmı) gösterir. Sayfa listesi: tests/shots/shots.spec.ts.
 */
import { execFileSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'

/** Boş bir kapı bulur; işçi süreçleri aynı değeri ortam değişkeninden alır. */
function freePort(): number {
  if (process.env.SHOTS_PORT) return Number(process.env.SHOTS_PORT)
  const script =
    "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"
  const port = Number(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }).trim())
  process.env.SHOTS_PORT = String(port)
  return port
}

const port = freePort()
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
const browser = {
  browserName: 'chromium' as const,
  locale: 'tr-TR',
  timezoneId: 'Europe/Istanbul',
  deviceScaleFactor: 2,
  launchOptions: executablePath ? { executablePath } : {},
}

export default defineConfig({
  testDir: './tests/shots',
  workers: 2,
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}/`, trace: 'off' },
  projects: [
    { name: '390', use: { ...devices['Pixel 7'], ...browser, viewport: { width: 390, height: 844 } } },
    { name: '1280', use: { ...devices['Desktop Chrome'], ...browser, viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `node scripts/serve.ts --port ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
