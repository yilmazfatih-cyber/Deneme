// Uçtan uca sınama (örnek kip). Çalıştır: npm run e2e   — görüntüler için: SHOTS_DIR=docs/shots npm run e2e
// Playwright ve Chromium önceden kurulu; burada kurulmaz.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from '../server.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const here = path.dirname(fileURLToPath(import.meta.url))
const sample = path.join(here, 'ornek.fountain')

const server = createApp({ mock: true, mockDelayMs: 12 })
await new Promise((r) => server.listen(0, '127.0.0.1', () => r()))
const base = `http://127.0.0.1:${server.address().port}/`

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
})
let failed = 0
/** @param {string} name @param {() => Promise<void>} fn */
async function step(name, fn) {
  try {
    await fn()
    console.log(`ok   - ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL - ${name}\n${e instanceof Error ? e.stack : e}`)
  }
}

const UPPER = new Set(['scene', 'character', 'transition'])
// Kayıt değeri gibi: büyük harfli türlerde metin tr-TR ile büyütülür (görüntü CSS'ten gelir).
const els = async (page) =>
  (await page.$$eval('#sayfa > div', (ds) => ds.map((d) => [d.dataset.type, d.textContent]))).map(([t, x]) => [
    t,
    UPPER.has(t) ? x.toLocaleUpperCase('tr-TR') : x,
  ])
const types = async (page) => (await els(page)).map((e) => e[0])
const noHScroll = (page) =>
  page.evaluate(() => ({
    doc: document.documentElement.scrollWidth <= window.innerWidth,
    body: document.body.scrollWidth <= window.innerWidth,
  }))

// ---------------------------------------------------------------------------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()))
await page.goto(base)
await page.waitForSelector('#sayfa > div')

await step('örnek kip etiketi görünür', async () => {
  await page.waitForSelector('#kipEtiket:not([hidden])')
})

await step('Enter / Tab ile sahne yazılır', async () => {
  await page.click('#sayfa > div')
  await page.keyboard.type('iç. çay ocağı - gece')
  await page.keyboard.press('Enter')
  assert.deepEqual(await els(page), [
    ['scene', 'İÇ. ÇAY OCAĞI - GECE'],
    ['action', ''],
  ])
  await page.keyboard.type('Şevket semaverin başında bardak siler.')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab') // aksiyon → karakter
  await page.keyboard.type('şevket')
  await page.keyboard.press('Enter') // karakter → diyalog
  await page.keyboard.type('Bu saatte kim gelir ki?')
  await page.keyboard.press('Enter') // diyalog → karakter
  await page.keyboard.type('nilüfer')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab') // diyalog → parantez
  await page.keyboard.type('kapıdan')
  await page.keyboard.press('Enter') // parantez → diyalog
  await page.keyboard.type('Açsana, Şevket Abi.')
  assert.deepEqual(await els(page), [
    ['scene', 'İÇ. ÇAY OCAĞI - GECE'],
    ['action', 'Şevket semaverin başında bardak siler.'],
    ['character', 'ŞEVKET'],
    ['dialogue', 'Bu saatte kim gelir ki?'],
    ['character', 'NİLÜFER'],
    ['parenthetical', 'kapıdan'],
    ['dialogue', 'Açsana, Şevket Abi.'],
  ])
  assert.equal(await page.inputValue('#tip'), 'dialogue')
  await page.keyboard.press('Shift+Tab') // diyalog → karakter (geri)
  assert.equal(await page.inputValue('#tip'), 'character')
  await page.keyboard.press('Tab')
  assert.equal(await page.inputValue('#tip'), 'dialogue')
})

await step('tür seçici öğeyi değiştirir', async () => {
  await page.keyboard.press('Enter') // yeni karakter
  await page.selectOption('#tip', 'transition')
  await page.keyboard.type('kesme')
  assert.deepEqual((await els(page)).at(-1), ['transition', 'KESME'])
  await page.keyboard.press('Enter') // geçiş → sahne
  assert.equal((await types(page)).at(-1), 'scene')
  await page.keyboard.press('Backspace')
})

await step('gezinti: sahne ve karakter listesi', async () => {
  await page.waitForFunction(() => document.querySelectorAll('#sahneListe li button').length === 1)
  assert.match(await page.textContent('#sahneListe'), /İÇ\. ÇAY OCAĞI - GECE/)
  const chars = await page.textContent('#karakterListe')
  assert.match(chars, /ŞEVKET/)
  assert.match(chars, /NİLÜFER/)
  assert.match(await page.textContent('#istatistik'), /kelime · .* sayfa · 1 sahne/)
})

await step('"Devam ettir": önizleme gelir, Ekle ile öğeler eklenir', async () => {
  await page.click('#sayfa > div:nth-child(4)') // diyalog içi
  const before = await els(page)
  await page.click('[data-eylem=continue]')
  await page.waitForSelector('#yzKarar:not([hidden]):has(#yzEkle:not([hidden]))')
  // önizleme biçimli: öğe türleri var
  assert.ok((await page.$$('#yzSonuc .izleme [data-type=character]')).length >= 2)
  assert.match(await page.textContent('#yzSonuc'), /Gece yarısı dükkân açık kalmaz/)
  // hiçbir şey kendiliğinden eklenmedi
  assert.deepEqual(await els(page), before)
  await page.click('#yzEkle')
  const after = await els(page)
  assert.ok(after.length >= before.length + 7, `${after.length} >= ${before.length + 7}`)
  const joined = after.map((e) => e.join(':')).join('\n')
  assert.match(joined, /character:NİLÜFER\ndialogue:Gece yarısı dükkân açık kalmaz, Şevket\./)
  assert.match(joined, /parenthetical:gözünü kaçırarak/)
  assert.match(joined, /ŞEVKET\n/)
  assert.match(await page.textContent('#bildirim'), /Eklendi/)
})

await step('geri al yapay zekâ eklemesini kaldırır, yinele geri getirir', async () => {
  const withAi = (await els(page)).length
  await page.click('#bildirim button') // Geri al
  const undone = (await els(page)).length
  assert.ok(undone < withAi)
  await page.click('#yinele')
  assert.equal((await els(page)).length, withAi)
})

await step('"Yeniden yaz": Değiştir seçimi değiştirir', async () => {
  await page.click('#sayfa > div:nth-child(2)')
  await page.fill('#yonerge', 'daha gergin')
  await page.click('[data-eylem=rewrite]')
  await page.waitForSelector('#yzDegistir:not([hidden])')
  await page.click('#yzDegistir')
  const e = await els(page)
  assert.ok(e.some((x) => x[1].includes('Bu çay bugün son çay')))
  assert.ok(!e.some((x) => x[1] === 'Şevket semaverin başında bardak siler.'), JSON.stringify(e))
})

await step('Analiz et ve Çekim listesi biçimli çıktı verir; Durdur çalışır', async () => {
  await page.click('[data-eylem=analyze]')
  await page.waitForSelector('#yzKarar:not([hidden])')
  assert.ok((await page.$$('#yzSonuc h3')).length >= 5)
  await page.click('#yzVazgec')
  await page.click('[data-eylem=shots]')
  await page.waitForSelector('#yzKarar:not([hidden])')
  assert.ok((await page.$$('#yzSonuc table tr')).length >= 4)
  assert.equal(await page.isHidden('#yzEkle'), true, 'çekim listesi belgeye eklenmez')
  await page.click('#yzVazgec')
  await page.click('[data-eylem=analyze]')
  await page.waitForSelector('#yzDur:not([hidden])')
  await page.waitForFunction(() => document.querySelector('#yzSonuc')?.textContent?.length > 20)
  await page.click('#yzDur')
  await page.waitForFunction(() => document.querySelector('#yzDurum')?.textContent === 'Durduruldu.')
  await page.click('#yzVazgec')
})

await step('sürüm kaydet / listele / geri yükle (önce anlık görüntü)', async () => {
  await page.click('#surumKaydet')
  await page.fill('#onayGirdi', 'İlk taslak')
  await page.click('#onayTamam')
  const snapshotCount = (await els(page)).length
  // belgeyi değiştir
  await page.click('#sayfa > div:last-child')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Sonradan eklenen satır.')
  assert.equal((await els(page)).length, snapshotCount + 1)
  await page.click('#surumler')
  const list = await page.textContent('#surumListe')
  assert.match(list, /İlk taslak/)
  assert.match(list, /Yapay zekâ çıktısından önce \(otomatik\)/)
  await page.locator('#surumListe li', { hasText: 'İlk taslak' }).getByText('Geri yükle').click()
  await page.waitForSelector('#onay[open]')
  assert.match(await page.textContent('#onayMetin'), /otomatik sürüm olarak kaydedilir/)
  await page.click('#onayIptal') // vazgeç: hiçbir şey değişmez
  assert.equal((await els(page)).length, snapshotCount + 1)
  await page.click('#surumler')
  await page.locator('#surumListe li', { hasText: 'İlk taslak' }).getByText('Geri yükle').click()
  await page.click('#onayTamam')
  await page.waitForFunction((n) => document.querySelectorAll('#sayfa > div').length === n, snapshotCount)
  assert.ok(!(await els(page)).some((e) => e[1] === 'Sonradan eklenen satır.'))
  await page.click('#surumler')
  assert.match(await page.textContent('#surumListe'), /Geri yüklemeden önce \(otomatik\)/)
  await page.click('#surumKapat')
})

await step('yeniden yükleyince belge korunur', async () => {
  await page.waitForFunction(() => /Kaydedildi/.test(document.querySelector('#durum')?.textContent ?? ''))
  const before = await els(page)
  await page.reload()
  await page.waitForSelector('#sayfa > div')
  assert.deepEqual(await els(page), before)
  assert.match(await page.textContent('#sayfa'), /Gece yarısı dükkân açık kalmaz/)
})

await step('.fountain dışa aktarma: Türkçe zorlayıcı işaretlerle', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#disaAktar')])
  assert.match(dl.suggestedFilename(), /^[a-z0-9-]+\.fountain$/)
  const text = readFileSync(await dl.path(), 'utf8')
  assert.match(text, /^\.İÇ\. ÇAY OCAĞI - GECE$/m)
  assert.match(text, /^@NİLÜFER$/m)
})

await step('.fountain içe aktarma yeni proje açar; proje silme onay ister', async () => {
  await page.setInputFiles('#dosya', sample)
  await page.waitForFunction(() => document.querySelector('#baslik')?.value === 'Çay Ocağı')
  assert.equal((await types(page))[0], 'scene')
  assert.equal(await page.$$eval('#projeSec option', (o) => o.length), 2)
  await page.click('#projeSil')
  await page.waitForSelector('#onay[open]')
  await page.click('#onayIptal')
  assert.equal(await page.$$eval('#projeSec option', (o) => o.length), 2, 'onaysız silinmedi')
})

if (process.env.SHOTS_DIR) {
  mkdirSync(process.env.SHOTS_DIR, { recursive: true })
  await page.close()
  const shotCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
  })
  const p = await shotCtx.newPage()
  await p.goto(base)
  await p.waitForSelector('#sayfa > div')
  await p.setInputFiles('#dosya', sample)
  await p.waitForFunction(() => document.querySelector('#baslik')?.value === 'Çay Ocağı')
  await p.click('#sayfa > div:nth-child(4)')
  await p.click('[data-eylem=continue]')
  await p.waitForFunction(() => document.querySelector('#yzDurum')?.textContent === 'Hazır.')
  await p.evaluate(() => (document.querySelector('#bildirim').hidden = true))
  await p.screenshot({ path: path.join(process.env.SHOTS_DIR, 'desktop.png') })
  await shotCtx.close()
}

// ---------------------------------------------------------------------------
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const m = await mctx.newPage()
await m.goto(base)
await m.waitForSelector('#sayfa > div')

await step('390×844: yatay kaydırma yok (boş, dolu, çekmeceler)', async () => {
  let r = await noHScroll(m)
  assert.ok(r.doc && r.body, 'boş belge')
  await m.setInputFiles('#dosya', sample)
  await m.waitForFunction(() => document.querySelector('#baslik')?.value === 'Çay Ocağı')
  r = await noHScroll(m)
  assert.ok(r.doc && r.body, 'dolu belge')
  // uzun tek sözcük bile taşmaz
  await m.click('#sayfa > div:nth-child(2)')
  await m.keyboard.type(' ' + 'Çok'.repeat(40))
  r = await noHScroll(m)
  assert.ok(r.doc && r.body, 'uzun sözcük')
  await m.click('#btnSol')
  assert.equal(await m.isVisible('#sol'), true)
  r = await noHScroll(m)
  assert.ok(r.doc && r.body, 'sol çekmece')
  await m.click('#perdeKapat', { position: { x: 380, y: 400 } })
  assert.equal(await m.isVisible('#sol'), false)
  await m.click('#btnSag')
  assert.equal(await m.isVisible('#sag'), true)
  await m.click('[data-eylem=analyze]')
  await m.waitForSelector('#yzKarar:not([hidden])')
  r = await noHScroll(m)
  assert.ok(r.doc && r.body, 'sağ çekmece, analiz çıktısı')
  await m.click('#yzVazgec')
  await m.keyboard.press('Escape')
  assert.equal(await m.isVisible('#sag'), false)
})

await step('390×844: yan paneller çekmece olarak açılıp kapanır', async () => {
  await m.click('#btnSol')
  await m.click('#sahneListe li button')
  assert.equal(await m.isVisible('#sol'), false, 'sahneye gidince çekmece kapanır')
})

if (process.env.SHOTS_DIR) {
  // örnek sahneyi temiz göstermek için yeniden içe aktar
  const before = await m.locator('#projeSec option').count()
  await m.setInputFiles('#dosya', sample)
  await m.waitForFunction((n) => document.querySelectorAll('#projeSec option').length === n + 1, before)
  await m.evaluate(() => {
    window.scrollTo(0, 0)
    document.querySelector('#bildirim').hidden = true
  })
  await m.screenshot({ path: path.join(process.env.SHOTS_DIR, 'mobile.png') })
}

await step('konsolda sayfa hatası yok', async () => {
  assert.deepEqual(pageErrors, [])
})

await browser.close()
server.closeAllConnections?.()
server.close()
console.log(failed ? `\n${failed} adım başarısız` : '\nTüm adımlar geçti')
process.exit(failed ? 1 : 0)
