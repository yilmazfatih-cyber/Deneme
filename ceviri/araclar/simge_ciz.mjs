// simge.svg → Ceviri/Assets.xcassets/AppIcon.appiconset/AppIcon.png (1024×1024).
// Kullanım (depo kökünden): node ceviri/araclar/simge_ciz.mjs
// Playwright'ın Chromium'u gerekir. Saydamlık kanalı sonra kaldırılır (App Store saydam simge kabul etmez):
//   python3 -c "from PIL import Image; p='…/AppIcon.png'; Image.open(p).convert('RGB').save(p)"
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const burasi = dirname(fileURLToPath(import.meta.url))
const svg = await readFile(join(burasi, 'simge.svg'), 'utf8')
const hedef = join(burasi, '..', 'Ceviri', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon.png')

const tarayici = await chromium.launch()
const sayfa = await tarayici.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
await sayfa.setContent(`<html><body style="margin:0;background:#040A1C">${svg}</body></html>`)
await sayfa.screenshot({ path: hedef, clip: { x: 0, y: 0, width: 1024, height: 1024 } })
await tarayici.close()
console.log('yazıldı:', hedef)
