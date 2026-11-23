// Canlı Çeviri web deneme sürümü (../web): sahte konuşma tanıma, sahte çeviri hizmeti ve sahte
// seslendirme ile uçtan uca akış testi. Gerçek mikrofon, internet ya da ses gerekmez.
//
// Kullanım: node canli-ceviri/tests/web-akis.cjs [ekran görüntüsü klasörü]
// Önceden kurulu Chromium için: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chrome
const { chromium } = require('playwright')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const KOK = path.join(__dirname, '..', 'web')
const CIKTI = process.argv[2] // verilirse ekran görüntüleri buraya yazılır
const TURLER = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' }

const SAHTE = `
(() => {
  window.__taniyicilar = []
  class SahteTanima {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; this.durum = 'yeni'; window.__taniyicilar.push(this) }
    start() { if (this.durum === 'acik') throw new Error('InvalidStateError'); this.durum = 'acik' }
    abort() { if (this.durum !== 'acik') return; this.durum = 'kapali'; this.iptal = true; setTimeout(() => this.onend && this.onend(), 10) }
    stop() { this.abort() }
  }
  for (const ad of ['SpeechRecognition', 'webkitSpeechRecognition']) {
    Object.defineProperty(window, ad, { value: window.__taniYok ? undefined : SahteTanima, configurable: true, writable: true })
  }
  const son = () => window.__taniyicilar[window.__taniyicilar.length - 1]
  window.__sonuc = (metin) => son().onresult({ results: [[{ transcript: metin }]] })
  window.__bitir = () => { const t = son(); t.durum = 'kapali'; t.onend() }
  window.__hata = (kod) => { const t = son(); t.onerror({ error: kod }); if (t.durum === 'acik') { t.durum = 'kapali'; t.onend && t.onend() } }
  window.__okunan = []
  const sentez = {
    speak(u) { window.__okunan.push({ metin: u.text, dil: u.lang, ses: u.volume }); setTimeout(() => u.onend && u.onend({}), u.text.trim() ? 400 : 5) },
    cancel() { window.__iptal = (window.__iptal || 0) + 1 },
    getVoices() { return [] },
  }
  Object.defineProperty(window, 'speechSynthesis', { value: sentez, configurable: true })
})()
`

let gecen = 0
const kalan = []
function bekle(kosul, ad, ayrinti) {
  if (kosul) gecen += 1
  else kalan.push(ad + (ayrinti !== undefined ? ' → ' + JSON.stringify(ayrinti) : ''))
  console.log((kosul ? '  ✓ ' : '  ✗ ') + ad)
}

;(async () => {
  const sunucu = http.createServer((istek, yanit) => {
    const yol = decodeURIComponent(new URL(istek.url, 'http://x').pathname)
    const dosya = path.join(KOK, yol.endsWith('/') ? yol + 'index.html' : yol)
    if (!dosya.startsWith(KOK) || !fs.existsSync(dosya)) {
      yanit.writeHead(404)
      yanit.end()
      return
    }
    yanit.writeHead(200, { 'content-type': TURLER[path.extname(dosya)] || 'application/octet-stream' })
    yanit.end(fs.readFileSync(dosya))
  })
  await new Promise((tamam) => sunucu.listen(0, '127.0.0.1', tamam))
  const ADRES = `http://127.0.0.1:${sunucu.address().port}/`

  const tarayici = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  })
  const goruntu = async (sayfa, ad) => {
    if (CIKTI) await sayfa.screenshot({ path: path.join(CIKTI, ad) })
  }
  const hatalar = []
  const istekler = []
  let ceviriKipi = 'tamam'
  let alaniaKipi = 'tamam'
  const alaniaIstekleri = []
  const SOZLUK = {
    'Hello how are you': 'Merhaba, nasılsın?',
    'Where is the station': 'İstasyon nerede?',
    'Guten Tag': 'İyi günler',
    'It is late': 'Bug&#39;n ge&ccedil; oldu',
  }

  async function sayfaAc(ortam, genislik = 390, yukseklik = 844, taniYok = false) {
    const sayfa = await ortam.newPage()
    await sayfa.setViewportSize({ width: genislik, height: yukseklik })
    sayfa.on(
      'console',
      (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && hatalar.push(m.text()),
    )
    sayfa.on('pageerror', (e) => hatalar.push(String(e)))
    if (taniYok) await sayfa.addInitScript('window.__taniYok = true')
    await sayfa.addInitScript(SAHTE)
    await sayfa.route('https://api.mymemory.translated.net/**', async (rota) => {
      const adres = new URL(rota.request().url())
      istekler.push(adres)
      const q = adres.searchParams.get('q')
      const baslik = { 'access-control-allow-origin': '*' }
      if (ceviriKipi === 'sinir') {
        await rota.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: baslik,
          body: JSON.stringify({
            responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.' },
            responseStatus: 429,
          }),
        })
      } else if (ceviriKipi === 'kopuk') {
        await rota.abort('internetdisconnected')
      } else {
        await rota.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: baslik,
          body: JSON.stringify({ responseData: { translatedText: SOZLUK[q] || 'TR:' + q }, responseStatus: 200 }),
        })
      }
    })
    await sayfa.route('https://voice.patientdesk.ai/**', async (rota) => {
      const istek = rota.request()
      if (istek.method() === 'OPTIONS') {
        await rota.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': 'authorization, content-type',
            'access-control-allow-methods': 'POST',
          },
        })
        return
      }
      alaniaIstekleri.push({ govde: istek.postData(), yetki: istek.headers().authorization })
      if (alaniaKipi === 'hata') {
        await rota.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, body: 'no' })
        return
      }
      // 0,2 sn'lik sessiz WAV
      const n = 1600
      const b = Buffer.alloc(44 + n, 128)
      b.write('RIFF', 0)
      b.writeUInt32LE(36 + n, 4)
      b.write('WAVEfmt ', 8)
      b.writeUInt32LE(16, 16)
      b.writeUInt16LE(1, 20)
      b.writeUInt16LE(1, 22)
      b.writeUInt32LE(8000, 24)
      b.writeUInt32LE(8000, 28)
      b.writeUInt16LE(1, 32)
      b.writeUInt16LE(8, 34)
      b.write('data', 36)
      b.writeUInt32LE(n, 40)
      await rota.fulfill({
        status: 200,
        contentType: 'audio/wav',
        headers: { 'access-control-allow-origin': '*' },
        body: b,
      })
    })
    await sayfa.goto(ADRES)
    return sayfa
  }
  const metin = (sayfa, secici) => sayfa.locator(secici).first().innerText()
  const sayi = (sayfa) => sayfa.evaluate(() => window.__taniyicilar.length)
  const sonTani = (sayfa) =>
    sayfa.evaluate(() => {
      const t = window.__taniyicilar[window.__taniyicilar.length - 1]
      return { lang: t.lang, continuous: t.continuous, interimResults: t.interimResults, durum: t.durum }
    })

  // ---------- 1. Açılış ----------
  console.log('1. Açılış')
  let ortam = await tarayici.newContext({ deviceScaleFactor: 2 })
  let s = await sayfaAc(ortam)
  bekle((await s.title()) === 'Canlı Çeviri', 'başlık')
  bekle((await metin(s, '#suAn')).includes("AirPods'u takın"), 'boş durumda AirPods ipucu')
  bekle(await s.locator('#hata').isHidden(), 'hata görünmüyor')
  bekle((await metin(s, '#anaDugme')).trim() === 'Dinlemeyi Başlat', 'düğme: Dinlemeyi Başlat')
  bekle(
    (await s.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0,
    'yatay taşma yok (390)',
  )
  bekle(
    await s.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
    'telefon genişliğinde sayfa kaymıyor',
  )
  await goruntu(s, '1-bos.png')

  // ---------- 2. Başlat, canlı metin, cümle sonu, çeviri, seslendirme ----------
  console.log('2. Dinleme akışı')
  await s.click('#anaDugme')
  bekle((await sayi(s)) === 1, 'tanıma açıldı')
  let t = await sonTani(s)
  bekle(
    t.lang === 'en-US' && t.continuous && t.interimResults && t.durum === 'acik',
    'tanıma ayarları (en-US, sürekli)',
    t,
  )
  bekle(await s.locator('#canliRozet').isVisible(), 'CANLI rozeti')
  bekle((await metin(s, '#anaDugme')).trim() === 'Durdur', 'düğme: Durdur')
  bekle((await metin(s, '#suAn')).includes('Dinliyorum'), 'Dinliyorum…')
  bekle((await s.locator('#dilSeridi').getAttribute('aria-disabled')) === 'true', 'dil şeridi kilitli')
  let okunan = await s.evaluate(() => window.__okunan)
  bekle(okunan.length === 1 && okunan[0].ses === 0, 'seslendirme dokunuşta sessizce açıldı', okunan)

  await s.evaluate(() => window.__sonuc('Hello how'))
  bekle((await metin(s, '.canli-metin')) === 'Hello how', 'canlı metin görünüyor')
  await s.waitForTimeout(700)
  await s.evaluate(() => window.__sonuc('Hello how are you'))
  await s.waitForTimeout(700)
  bekle(istekler.length === 0, 'sessizlik dolmadan çeviri istenmedi (sayaç sıfırlandı)')
  await goruntu(s, '2-dinliyor.png')
  await s.waitForTimeout(900)
  bekle(istekler.length === 1, '1,2 sn sessizlikten sonra çeviri istendi')
  bekle(
    istekler[0] &&
      istekler[0].searchParams.get('q') === 'Hello how are you' &&
      istekler[0].search.includes('langpair=en%7Ctr'),
    'istek: q ve langpair=en|tr',
    istekler[0] && istekler[0].search,
  )
  bekle((await metin(s, '.satir.buyuk .ceviri')) === 'Merhaba, nasılsın?', 'çeviri ekranda')
  bekle((await metin(s, '.satir.buyuk .asil')) === 'Hello how are you', 'asıl cümle ekranda')
  okunan = await s.evaluate(() => window.__okunan)
  bekle(
    okunan.length === 2 && okunan[1].metin === 'Merhaba, nasılsın?' && okunan[1].dil === 'tr-TR',
    'çeviri Türkçe okundu',
    okunan,
  )
  bekle((await sayi(s)) === 2, 'cümleden sonra yeni tanıma açıldı')
  bekle((await sonTani(s)).durum === 'acik', 'yeni tanıma dinliyor')
  bekle((await s.locator('.canli-metin').count()) === 0, 'canlı metin temizlendi')

  // ---------- 3. Tanıma kendiliğinden biterse ----------
  console.log('3. Tanıma kendiliğinden biterse')
  await s.waitForTimeout(2100) // "hemen bitti" sayılmaması için
  await s.evaluate(() => window.__bitir())
  await s.waitForTimeout(400)
  bekle((await sayi(s)) === 3, 'yeniden açıldı')
  await s.evaluate(() => window.__sonuc('Where is the'))
  await s.evaluate(() => window.__bitir()) // yarım cümleyle bitti
  await s.waitForTimeout(600)
  bekle(
    istekler.length === 2 && istekler[1].searchParams.get('q') === 'Where is the',
    'yarım cümle kaybolmadı',
    istekler.length,
  )
  bekle((await sayi(s)) === 4, 'yarım cümleden sonra da yeniden açıldı')
  bekle(await s.locator('#oncekiler').isVisible(), 'Öncekiler kartı göründü')

  // ---------- 4. Durdur ve Geçmiş ----------
  console.log('4. Durdur ve Geçmiş')
  await s.click('#anaDugme')
  bekle((await sonTani(s)).durum === 'kapali', 'tanıma kapandı')
  bekle((await metin(s, '#anaDugme')).trim() === 'Dinlemeyi Başlat', 'düğme eski hâlinde')
  bekle(await s.locator('#canliRozet').isHidden(), 'CANLI rozeti gitti')
  await s.waitForTimeout(400)
  bekle((await sayi(s)) === 4, 'durduktan sonra yeni tanıma açılmadı')
  await s.click('.sekme[data-sekme="gecmis"]')
  bekle((await s.locator('.gecmis-oge').count()) === 2, 'Geçmiş: 2 çeviri')
  bekle(/^\d{2}:\d{2}$/.test(await metin(s, '.gecmis-oge .saat')), 'Geçmiş: saat biçimi')
  await goruntu(s, '3-gecmis.png')
  await s.click('#temizle')
  bekle((await metin(s, '#gecmisListe')).includes('Henüz çeviri yok'), 'Temizle: boş durum')

  // ---------- 5. Dil değişimi ve kalıcılık ----------
  console.log('5. Dil değişimi')
  await s.click('.sekme[data-sekme="ceviri"]')
  await s.click('#dilSeridi')
  bekle(await s.locator('#dilMenu').isVisible(), 'dil menüsü açıldı')
  bekle((await s.locator('.menu-oge').count()) === 7, '7 dil')
  await s.click('.menu-oge[data-kod="de"]')
  bekle((await metin(s, '#dilAd')) === 'Almanca → Türkçe', 'şerit: Almanca → Türkçe')
  await s.click('#anaDugme')
  bekle((await sonTani(s)).lang === 'de-DE', 'tanıma dili de-DE')
  await s.evaluate(() => window.__sonuc('Guten Tag'))
  await s.waitForTimeout(1500)
  const sonIstek = istekler[istekler.length - 1]
  bekle(sonIstek.search.includes('langpair=de%7Ctr'), 'istek: langpair=de|tr', sonIstek.search)
  bekle((await metin(s, '.satir.buyuk .ceviri')) === 'İyi günler', 'Almanca çeviri ekranda')

  // ---------- 6. Çeviri hataları ----------
  console.log('6. Çeviri hataları')
  ceviriKipi = 'sinir'
  await s.evaluate(() => window.__sonuc('Noch ein Satz'))
  await s.waitForTimeout(1500)
  bekle((await metin(s, '#hata')).includes('sınırı doldu'), 'günlük sınır mesajı', await metin(s, '#hata'))
  bekle((await metin(s, '#anaDugme')).trim() === 'Durdur', 'hata sonrası dinleme sürüyor')
  ceviriKipi = 'kopuk'
  await s.evaluate(() => window.__sonuc('Und noch einer'))
  await s.waitForTimeout(1500)
  bekle((await metin(s, '#hata')).includes('ulaşılamadı'), 'bağlantı hatası mesajı', await metin(s, '#hata'))
  ceviriKipi = 'tamam'
  await s.evaluate(() => window.__sonuc('It is late'))
  await s.waitForTimeout(1500)
  bekle(await s.locator('#hata').isHidden(), 'başarılı çeviri hatayı temizledi')
  bekle(
    (await metin(s, '.satir.buyuk .ceviri')) === "Bug'n geç oldu",
    'HTML varlıkları çözüldü',
    await metin(s, '.satir.buyuk .ceviri'),
  )

  // ---------- 7. Arka plan / geri dönüş ----------
  console.log('7. Arka plan')
  let once = await sayi(s)
  await s.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await s.waitForTimeout(400)
  bekle((await sonTani(s)).durum === 'kapali' && (await sayi(s)) === once, 'arka planda dinleme bekliyor')
  await s.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await s.waitForTimeout(200)
  bekle((await sayi(s)) === once + 1 && (await sonTani(s)).durum === 'acik', 'dönünce dinleme sürüyor')

  // ---------- 8. İzin hatası ----------
  console.log('8. İzin hatası')
  await s.evaluate(() => window.__hata('not-allowed'))
  await s.waitForTimeout(300)
  bekle((await metin(s, '#hata')).includes('Mikrofon izni'), 'izin mesajı')
  bekle((await metin(s, '#anaDugme')).trim() === 'Dinlemeyi Başlat', 'izin hatasında durdu')
  once = await sayi(s)
  await s.waitForTimeout(700)
  bekle((await sayi(s)) === once, 'izin hatasından sonra yeniden denemedi')

  // ---------- 9. Kısır döngü sigortası ----------
  console.log('9. Hemen biten tanıma')
  await s.click('#anaDugme')
  for (let i = 0; i < 6; i += 1) {
    await s.evaluate(() => window.__hata('network'))
    await s.waitForTimeout(650)
  }
  bekle((await metin(s, '#anaDugme')).trim() === 'Dinlemeyi Başlat', '6 boş denemeden sonra durdu')
  bekle((await metin(s, '#hata')).includes('internet'), 'neden: internet', await metin(s, '#hata'))

  // ---------- 10. Okurken duraklat ----------
  console.log('10. Okurken dinlemeyi duraklat')
  await s.click('.sekme[data-sekme="ayarlar"]')
  await s.click('#duraklat')
  bekle((await s.locator('#duraklat').getAttribute('aria-checked')) === 'true', 'şalter açık')
  await goruntu(s, '4-ayarlar.png')
  await s.click('.sekme[data-sekme="ceviri"]')
  await s.click('#anaDugme')
  await s.evaluate(() => window.__sonuc('Guten Tag'))
  await s.waitForTimeout(1350)
  once = await sayi(s)
  bekle((await sonTani(s)).durum === 'kapali', 'okunurken tanıma kapalı')
  await s.waitForTimeout(200)
  bekle((await sayi(s)) === once, 'okunurken yeni tanıma açılmadı')
  await s.waitForTimeout(700)
  bekle((await sayi(s)) === once + 1 && (await sonTani(s)).durum === 'acik', 'okuma bitince dinleme sürdü')
  await s.click('#anaDugme')

  // ---------- 11. Alania sesi ----------
  console.log('11. Alania')
  await s.click('.sekme[data-sekme="ayarlar"]')
  await s.click('#duraklat')
  await s.fill('#anahtar', 'pd_live_deneme')
  await s.click('.bolumlu button[data-ses="alania2-oncel"]')
  await s.click('.sekme[data-sekme="ceviri"]')
  await s.evaluate(() => (window.__okunan = []))
  await s.click('#anaDugme')
  await s.evaluate(() => window.__sonuc('Guten Tag'))
  await s.waitForTimeout(2000)
  const govde = alaniaIstekleri[0] && JSON.parse(alaniaIstekleri[0].govde)
  bekle(
    govde && govde.model === 'alania-v2' && govde.input === 'İyi günler' && govde.voice === 'alania2-oncel',
    'Alania isteği: model, metin, ses',
    govde,
  )
  bekle(alaniaIstekleri[0] && alaniaIstekleri[0].yetki === 'Bearer pd_live_deneme', 'Alania isteği: anahtar')
  okunan = await s.evaluate(() => window.__okunan.filter((o) => o.metin.trim()))
  bekle(okunan.length === 0, 'Alania çalınca cihaz sesi kullanılmadı', okunan)
  alaniaKipi = 'hata'
  await s.evaluate(() => window.__sonuc('Hello how are you'))
  await s.waitForTimeout(2000)
  okunan = await s.evaluate(() => window.__okunan.filter((o) => o.metin.trim()))
  bekle(okunan.length === 1, 'Alania hata verince cihaz sesi okudu', okunan)
  bekle((await metin(s, '#not')).includes('Alania sesine ulaşılamadı'), 'Alania notu göründü')
  await s.click('#anaDugme')

  // ---------- 12. Kalıcılık ----------
  console.log('12. Kalıcılık')
  await s.reload()
  bekle((await metin(s, '#dilAd')) === 'Almanca → Türkçe', 'dil hatırlandı')
  bekle((await s.inputValue('#anahtar')) === 'pd_live_deneme', 'anahtar hatırlandı')
  await s.click('.sekme[data-sekme="ayarlar"]')
  bekle(
    (await s.locator('.bolumlu button[data-ses="alania2-oncel"]').getAttribute('aria-checked')) === 'true',
    'ses seçimi hatırlandı',
  )
  await ortam.close()

  // ---------- 13. Desteklemeyen tarayıcı ----------
  console.log('13. Desteklemeyen tarayıcı')
  ortam = await tarayici.newContext()
  s = await sayfaAc(ortam, 390, 844, true)
  bekle((await metin(s, '#hata')).includes('desteklemiyor'), 'açılışta uyarı')
  await s.click('#anaDugme')
  bekle((await metin(s, '#anaDugme')).trim() === 'Dinlemeyi Başlat', 'başlamıyor')
  await ortam.close()

  // ---------- 14. Genişlikler ----------
  console.log('14. Genişlikler')
  ortam = await tarayici.newContext()
  for (const [g, y] of [
    [360, 800],
    [320, 568],
    [1280, 960],
  ]) {
    s = await sayfaAc(ortam, g, y)
    const tasma = await s.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    bekle(tasma === 0, `yatay taşma yok (${g})`, tasma)
    if (g === 1280) await goruntu(s, '5-masaustu.png')
    else {
      const dugme = await s.locator('#anaDugme').boundingBox()
      const sekmeler = await s.locator('.sekmeler').boundingBox()
      bekle(
        dugme.y + dugme.height <= sekmeler.y && sekmeler.y + sekmeler.height <= y,
        `düğme ve sekmeler ekranda (${g}×${y})`,
      )
    }
    await s.close()
  }
  await ortam.close()

  bekle(hatalar.length === 0, 'betik ya da güvenlik politikası (CSP) hatası yok', hatalar)
  await tarayici.close()
  sunucu.close()
  console.log(`\n${gecen} geçti, ${kalan.length} kaldı`)
  for (const k of kalan) console.log('  KALDI: ' + k)
  process.exit(kalan.length ? 1 : 0)
})().catch((hata) => {
  console.error(hata)
  process.exit(2)
})
