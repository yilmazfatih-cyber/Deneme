// Gösterim sayfasının uçtan uca testi (Chromium, telefon boyutları, internetsiz, axe taraması).
// Çalıştırma: npm ci && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run e2e
// Ekran görüntüleri: EKRAN_KLASORU (varsayılan test-results/), deviceScaleFactor 2.
// `node --test tarayici/` bu dosyayı ÇALIŞTIRMAZ (testler.js içinde değildir; tarayıcı ister).

import assert from 'node:assert/strict'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, join, resolve, sep } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

import { Tokenizer } from '../tokenizer.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SHOTS = resolve(ROOT, process.env.EKRAN_KLASORU ?? 'test-results')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' }
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
]

let server
let browser
let base

function serve(request, response) {
  const path = resolve(ROOT, `.${decodeURIComponent(new URL(request.url, 'http://x').pathname)}`)
  const file = existsSync(path) && statSync(path).isDirectory() ? join(path, 'index.html') : path
  if (!(file + sep).startsWith(ROOT) || !existsSync(file)) {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file)
    .on('error', () => response.destroy())
    .pipe(response)
}

before(async () => {
  server = createServer(serve)
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  base = `http://127.0.0.1:${server.address().port}`
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  assert.ok(executablePath, 'PLAYWRIGHT_CHROMIUM_EXECUTABLE ortam değişkenine Chromium yolunu yazın.')
  browser = await chromium.launch({ executablePath })
})

after(async () => {
  await browser?.close()
  await new Promise((done) => server.close(done))
})

function expectedText() {
  const vectors = JSON.parse(readFileSync(join(ROOT, 'tarayici/sinama/ornek-model.json'), 'utf8'))
  const tokenizer = new Tokenizer(JSON.parse(readFileSync(join(ROOT, 'ornek-model/tarayici/tokenizer.json'), 'utf8')))
  const { output } = vectors.greedy[0]
  const end = output.indexOf(tokenizer.specialId('<|son|>'))
  return tokenizer.decode(end < 0 ? output : output.slice(0, end))
}

for (const viewport of VIEWPORTS) {
  test(`gösterim ${viewport.width}x${viewport.height}: internetsiz yükler, Python ile aynı metni üretir`, async () => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'tr-TR' })
    const page = await context.newPage()
    const external = []
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue()
      external.push(route.request().url())
      return route.abort()
    })
    await page.goto(`${base}/tarayici/`)
    await page.waitForSelector('body[data-durum="hazir"]', { timeout: 60_000 })
    await page.fill('#sicaklik', '0')
    await page.fill('#ceza', '1')
    await page.fill('#azami', '40')
    await page.click('#uret')
    await page.waitForSelector('body[data-durum="bitti"]', { timeout: 120_000 })
    assert.equal(await page.textContent('#uretilen'), expectedText())
    assert.match(await page.textContent('#durum'), /belirteç/)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(overflow <= 0, `yatay kaydırma var: ${overflow}px`)
    const small = await page.$$eval('button, input, textarea', (items) =>
      items.filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.id),
    )
    assert.deepEqual(small, [], 'dokunma alanı 44 pikselden küçük')
    const axe = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
    await page.addScriptTag({ content: readFileSync(axe, 'utf8') })
    const result = await page.evaluate(() => globalThis.axe.run())
    const serious = result.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => v.id)
    assert.deepEqual(serious, [], 'axe: ciddi erişilebilirlik bulgusu')
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: join(SHOTS, `tarayici-${viewport.width}.png`), fullPage: true })
    assert.deepEqual(external, [], 'sayfa dış ağa istek attı')
    assert.deepEqual(errors, [])
    await context.close()
  })
}
