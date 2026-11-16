/**
 * PWA simgelerini üretir: web/public/icon.svg → web/public/icons/*.png (192, 512, maskelenebilir 512, apple 180).
 * Playwright'ın Chromium'unu kullanır; önceden kurulu tarayıcı için PLAYWRIGHT_CHROMIUM_EXECUTABLE verin.
 *
 * Kullanım: npm run icons
 * Genişletme: yeni boyut → TARGETS'a satır ekleyin ve web/vite.config.ts → manifest.icons'a yazın.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', 'web', 'public')
const svg = readFileSync(join(root, 'icon.svg'), 'utf8')

/** Simge zemin rengi (icon.svg'deki çerçeve rengiyle aynı). */
const BACKGROUND = '#0e6157'

const TARGETS = [
  { file: 'icon-192.png', size: 192, inset: 0, opaque: false },
  { file: 'icon-512.png', size: 512, inset: 0, opaque: false },
  // iOS saydam köşeleri siyaha boyar: zemin dolu olmalı (köşeleri iOS kendisi yuvarlar).
  { file: 'apple-touch-icon.png', size: 180, inset: 0, opaque: true },
  // Maskelenebilir: işletim sistemi kenarları kırpabilir; içerik güvenli alana (%80) küçültülür, zemin tam dolu.
  { file: 'icon-maskable-512.png', size: 512, inset: 0.1, opaque: true },
] as const

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
const browser = await chromium.launch(executablePath ? { executablePath } : {})
try {
  const page = await browser.newPage()
  mkdirSync(join(root, 'icons'), { recursive: true })
  for (const { file, size, inset, opaque } of TARGETS) {
    const inner = Math.round(size * (1 - inset * 2))
    const art = svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<html><body style="margin:0;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${opaque ? BACKGROUND : 'transparent'}">${art}</body></html>`,
    )
    await page.screenshot({ path: join(root, 'icons', file), omitBackground: !opaque })
    console.log(`web/public/icons/${file}`)
  }
} finally {
  await browser.close()
}
