/**
 * public/icons/icon.svg dosyasından PWA simgelerini (PNG) üretir. Playwright'ın Chromium'unu kullanır.
 * Kullanım: npm run icons
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const svg = readFileSync(join(root, 'public/icons/icon.svg'), 'utf8')

const targets = [
  { file: 'icon-192.png', size: 192, padding: 0 },
  { file: 'icon-512.png', size: 512, padding: 0 },
  { file: 'apple-touch-icon.png', size: 180, padding: 0 },
  // Maskable: güvenli alan için içerik %80'e küçültülür, zemin tam dolu.
  { file: 'icon-maskable-512.png', size: 512, padding: 0.1 },
]

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
)
const page = await browser.newPage()
for (const { file, size, padding } of targets) {
  const inner = Math.round(size * (1 - padding * 2))
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:#1B4F9C;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
    </body></html>`,
  )
  await page.screenshot({ path: join(root, 'public/icons', file), omitBackground: false })
  console.log(`public/icons/${file}`)
}
await browser.close()
