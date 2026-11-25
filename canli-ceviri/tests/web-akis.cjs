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
    // Başlangıç olayları (__olayKipi): 'ikisi' (varsayılan: start, sonra audiostart), 'start', 'audiostart',
    // 'yok' (hiçbiri gelmez; testte __olay ile elle tetiklenir). Gerçek tarayıcıda olduğu gibi eşzamansız.
    start() {
      if (this.durum === 'acik') throw new Error('InvalidStateError')
      this.durum = 'acik'
      const kip = window.__olayKipi || 'ikisi'
      if (kip === 'yok') return
      queueMicrotask(() => {
        if (this.durum !== 'acik') return
        if (kip !== 'audiostart' && this.onstart) this.onstart({})
        if (kip !== 'start' && this.onaudiostart) this.onaudiostart({})
      })
    }
    abort() { if (this.durum !== 'acik') return; this.durum = 'kapali'; this.iptal = true; if (!window.__endYok) setTimeout(() => this.onend && this.onend(), 10) }
    stop() { this.abort() }
  }
  for (const ad of ['SpeechRecognition', 'webkitSpeechRecognition']) {
    Object.defineProperty(window, ad, { value: window.__taniYok ? undefined : SahteTanima, configurable: true, writable: true })
  }
  const son = () => window.__taniyicilar[window.__taniyicilar.length - 1]
  window.__sonuc = (metin) => son().onresult({ results: [[{ transcript: metin }]] })
  window.__olay = (ad) => { const t = son(); if (t['on' + ad]) t['on' + ad]({}) }
  window.__bitir = () => { const t = son(); t.durum = 'kapali'; t.onend() }
  window.__hata = (kod) => { const t = son(); t.onerror({ error: kod }); if (t.durum === 'acik') { t.durum = 'kapali'; t.onend && t.onend() } }
  window.__okunan = []
  const sentez = {
    // Okuma süresi ayarlanabilir; cancel() "end" vermez (Safari'nin vermeyebileceği durum)
    speak(u) { window.__okunan.push({ metin: u.text, dil: u.lang, ses: u.volume }); setTimeout(() => u.onend && u.onend({}), u.text.trim() ? (window.__okumaSuresi || 400) : 5) },
    cancel() { window.__iptal = (window.__iptal || 0) + 1 },
    getVoices() { return [] },
  }
  Object.defineProperty(window, 'speechSynthesis', { value: sentez, configurable: true })
  // Pano: yazılanı tutar; __panoRed iken reddeder
  window.__pano = null
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText(m) { if (window.__panoRed) return Promise.reject(new Error('NotAllowedError')); window.__pano = m; return Promise.resolve() },
  } })
  // Ekran kilidi: istek __kilitGecikme ms sonra döner; alınan ve bırakılan sayılır
  window.__kilit = { alinan: 0, birakilan: 0 }
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
    request() { return new Promise((r) => setTimeout(() => { window.__kilit.alinan += 1; r({ released: false, release() { if (!this.released) { this.released = true; window.__kilit.birakilan += 1 } return Promise.resolve() } }) }, window.__kilitGecikme || 0)) },
  } })
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
      } else if (ceviriKipi === 'yavas') {
        // 8 sn sonra yanıt verir; sayfa isteği bu arada iptal ederse yanıt yerine ulaşmaz
        await new Promise((r) => setTimeout(r, 8000))
        try {
          await rota.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: baslik,
            body: JSON.stringify({ responseData: { translatedText: 'GEC:' + q }, responseStatus: 200 }),
          })
        } catch {
          // sayfa isteği iptal etti
        }
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
      if (alaniaKipi === 'hata' || alaniaKipi === '500') {
        await rota.fulfill({
          status: alaniaKipi === 'hata' ? 401 : 500,
          headers: { 'access-control-allow-origin': '*' },
          body: 'no',
        })
        return
      }
      if (alaniaKipi === 'yavas') {
        await new Promise((r) => setTimeout(r, 7000))
        try {
          await rota.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: 'x' })
        } catch {
          // sayfa isteği iptal etti
        }
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
  bekle(
    (await s.locator('#gecmisOnay').isVisible()) && (await s.locator('.gecmis-oge').count()) === 2,
    'Temizle onay istiyor, henüz silmedi (KR9)',
  )
  bekle((await metin(s, '#gecmisOnay')).includes('Geçmiş silinsin mi?'), 'onay metni: Geçmiş silinsin mi?')
  await s.click('#gecmisVazgec')
  bekle(
    (await s.locator('#gecmisOnay').isHidden()) && (await s.locator('.gecmis-oge').count()) === 2,
    'Vazgeç: geçmiş duruyor',
  )
  bekle(
    await s.evaluate(() => document.activeElement && document.activeElement.id === 'temizle'),
    'Vazgeç: odak Temizle düğmesine döndü',
  )
  bekle(
    (await metin(s, '.panel[data-sekme="gecmis"]')).includes('Geçmiş sayfa kapanınca silinir.'),
    'geçmişin geçici olduğu yazıyor',
  )
  await s.click('#temizle')
  await s.click('#gecmisSil')
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
  // Q-15: dinleme sürdüğü için kırmızı hata satırı değil, sarı not
  bekle(
    (await metin(s, '#not')) === 'Günlük ücretsiz çeviri sınırı doldu. Yarın yeniden deneyin.' &&
      (await s.locator('#not.uyari').count()) === 1 &&
      (await s.locator('#hata').isHidden()),
    'günlük sınır: ileti sarı notta, kırmızı satır yok',
    await metin(s, '#not'),
  )
  bekle((await metin(s, '#anaDugme')).trim() === 'Durdur', 'hata sonrası dinleme sürüyor')
  ceviriKipi = 'kopuk'
  await s.evaluate(() => window.__sonuc('Und noch einer'))
  await s.waitForTimeout(1500)
  bekle(
    (await metin(s, '#not')) === 'Çeviri hizmetine ulaşılamadı. İnternet bağlantınızı kontrol edin.' &&
      (await s.locator('#not.uyari').count()) === 1 &&
      (await s.locator('#hata').isHidden()),
    'bağlantı hatası: ileti sarı notta, kırmızı satır yok',
    await metin(s, '#not'),
  )
  ceviriKipi = 'tamam'
  await s.evaluate(() => window.__sonuc('It is late'))
  await s.waitForTimeout(1500)
  bekle((await metin(s, '#anaDugme')).trim() === 'Durdur', 'bağlantı hatası sonrası dinleme sürüyor')
  bekle(
    (await s.locator('#hata').isHidden()) &&
      !(await s.locator('#not.uyari').count()) &&
      (await metin(s, '#not')).includes('Web deneme sürümü'),
    'başarılı çeviri notu kaldırdı',
    await metin(s, '#not'),
  )
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
  alaniaKipi = '500'
  await s.evaluate(() => window.__sonuc('Hello how are you'))
  await s.waitForTimeout(2000)
  okunan = await s.evaluate(() => window.__okunan.filter((o) => o.metin.trim()))
  bekle(okunan.length === 1, 'Alania hata verince cihaz sesi okudu', okunan)
  bekle((await metin(s, '#not')).includes('Alania sesine ulaşılamadı'), 'Alania notu göründü')
  alaniaKipi = 'hata'
  await s.evaluate(() => window.__sonuc('Where is the station'))
  await s.waitForTimeout(2000)
  bekle((await metin(s, '#not')).includes('Alania anahtarı geçersiz'), '401: "Alania anahtarı geçersiz" notu')
  let alaniaOnce = alaniaIstekleri.length
  await s.evaluate(() => window.__sonuc('Guten Tag'))
  await s.waitForTimeout(2000)
  bekle(alaniaIstekleri.length === alaniaOnce, '401 sonrası bu oturumda Alania denenmedi')
  alaniaKipi = 'tamam'
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

  // ---------- Yardımcılar (yeni bölümler) ----------
  const gorunurluk = (sayfa, deger) =>
    sayfa.evaluate((v) => {
      Object.defineProperty(document, 'visibilityState', { value: v, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    }, deger)
  const acikSayisi = (sayfa) => sayfa.evaluate(() => window.__taniyicilar.filter((t) => t.durum === 'acik').length)
  const dugmeMetni = async (sayfa) => (await metin(sayfa, '#anaDugme')).trim()
  // Görünen her denetimin genişliği ve yüksekliği en az 44 px mi? (küçük olanları döndürür)
  const kucukDenetimler = (sayfa) =>
    sayfa.evaluate(() =>
      [
        ...document.querySelectorAll(
          'button, input, textarea, [role="switch"], [role="radio"], [role="menuitemradio"], [tabindex]:not([tabindex="-1"])',
        ),
      ]
        .map((e) => [e, e.getBoundingClientRect()])
        .filter(([e, r]) => r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden')
        .filter(([, r]) => r.width < 44 || r.height < 44)
        .map(([e, r]) => `${e.id || e.className || e.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`),
    )
  const tasma = (sayfa) =>
    sayfa.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  // Söylenen cümleler ve çevirileri: Tanılama'da hiçbiri geçmemeli
  const ICERIK = [
    'Hello',
    'how are',
    'Where is',
    'station',
    'Guten',
    'Merhaba',
    'nasılsın',
    'İstasyon',
    'İyi günler',
    'TR:',
    'pd_live',
  ]

  // ---------- 15. Duraklama sayacı (Ön-1) ----------
  console.log('15. Duraklama sayacı yalnız metin değişince sıfırlanır')
  ortam = await tarayici.newContext()
  s = await sayfaAc(ortam)
  await s.click('#anaDugme')
  let istekOnce = istekler.length
  await s.evaluate(() => window.__sonuc('Where is the station'))
  await s.waitForTimeout(700)
  await s.evaluate(() => window.__sonuc('Where is the station')) // aynı metin yinelendi
  await s.waitForTimeout(750)
  bekle(istekler.length === istekOnce + 1, 'aynı metni yineleyen sonuç cümleyi uzatmadı', istekler.length - istekOnce)

  // ---------- 16. Ö-12: okuma ve gizli sekme iki ayrı bekletme nedeni ----------
  console.log('16. Okurken sekme gizlenip görünür olunca')
  await s.click('#anaDugme')
  await s.click('.sekme[data-sekme="ayarlar"]')
  await s.click('#duraklat')
  await s.click('.sekme[data-sekme="ceviri"]')
  await s.evaluate(() => (window.__okumaSuresi = 1500))
  await s.click('#anaDugme')
  await s.evaluate(() => window.__sonuc('Guten Tag'))
  await s.waitForTimeout(1450) // cümle kapandı, çeviri okunuyor
  once = await sayi(s)
  bekle((await acikSayisi(s)) === 0, 'okuma sürüyor, tanıma kapalı')
  await gorunurluk(s, 'hidden')
  await s.waitForTimeout(1800) // okuma bitti, sekme hâlâ gizli
  bekle(
    (await sayi(s)) === once && (await acikSayisi(s)) === 0,
    'okuma bitince gizli sekmede tanıma açılmadı',
    await sayi(s),
  )
  await s.waitForTimeout(2500)
  bekle(
    (await dugmeMetni(s)) === 'Durdur' && (await s.locator('#hata').isHidden()),
    'gizli sekmede oturum hatayla durmadı',
  )
  await gorunurluk(s, 'visible')
  await s.waitForTimeout(300)
  bekle((await sayi(s)) === once + 1 && (await acikSayisi(s)) === 1, 'sekme görününce tanıma bir kez açıldı')
  await s.evaluate(() => window.__sonuc('Hello how are you'))
  await s.waitForTimeout(1450) // okuma sürüyor
  once = await sayi(s)
  await gorunurluk(s, 'hidden')
  await s.waitForTimeout(200)
  await gorunurluk(s, 'visible')
  await s.waitForTimeout(300)
  bekle(
    (await sayi(s)) === once && (await acikSayisi(s)) === 0,
    'okuma sürerken sekme görününce tanıma açılmadı ("okurken beklet" bozulmadı)',
  )
  await s.waitForTimeout(1400)
  bekle((await sayi(s)) === once + 1 && (await acikSayisi(s)) === 1, 'okuma bitince tanıma açıldı')
  await s.click('#anaDugme')
  await s.click('.sekme[data-sekme="ayarlar"]')
  await s.click('#duraklat')
  await s.click('.sekme[data-sekme="ceviri"]')
  await s.evaluate(() => (window.__okumaSuresi = 400))

  // ---------- 17. Ön-10: abort sonrası "end" gelmezse ----------
  console.log('17. "end" gelmeyen tanıma (sigorta)')
  await s.click('#anaDugme')
  await s.evaluate(() => (window.__endYok = true))
  await s.evaluate(() => window.__sonuc('Where is the station'))
  await s.waitForTimeout(1500)
  once = await sayi(s)
  bekle((await acikSayisi(s)) === 0, '"end" gelmeden yeni tanıma açılmadı')
  await s.waitForTimeout(1500)
  bekle(
    (await sayi(s)) === once + 1 && (await acikSayisi(s)) === 1,
    'sigorta yeni tanımayı açtı, aynı anda tek tanıma açık',
    await s.evaluate(() => window.__taniyicilar.map((t) => t.durum)),
  )
  await s.evaluate(() => (window.__endYok = false))

  // ---------- 18. Ön-11: Durdur bekleyen cihaz sesini hemen bırakır ----------
  console.log('18. Durdur ve bekleyen cihaz sesi')
  await s.evaluate(() => {
    window.__okumaSuresi = 6000 // cancel() "end" vermiyor ve okuma uzun
    window.__okunan = []
  })
  await s.evaluate(() => window.__sonuc('Hello how are you'))
  await s.waitForTimeout(1450)
  await s.click('#anaDugme')
  await s.click('#anaDugme')
  await s.evaluate(() => (window.__okumaSuresi = 400))
  await s.evaluate(() => window.__sonuc('Where is the station'))
  await s.waitForTimeout(1700)
  okunan = await s.evaluate(() => window.__okunan.map((o) => o.metin))
  bekle(okunan.includes('İstasyon nerede?'), 'yeni oturumun ilk sesi eski sesi beklemedi', okunan)
  await s.click('#anaDugme')

  // ---------- 19. Ön-12: ekran kilidi beklenirken Durdur ----------
  console.log('19. Ekran kilidi')
  await s.evaluate(() => {
    window.__kilitGecikme = 300
    window.__kilit.alinan = 0
    window.__kilit.birakilan = 0
  })
  await s.click('#anaDugme')
  await s.click('#anaDugme')
  await s.waitForTimeout(600)
  let kilit = await s.evaluate(() => window.__kilit)
  bekle(kilit.alinan === 1 && kilit.birakilan === 1, 'geç gelen ekran kilidi bırakıldı', kilit)
  await s.evaluate(() => (window.__kilitGecikme = 0))

  // ---------- 20. Alania: 5 sn sınırı, Durdur iptali, devre kesici (KR10) ----------
  console.log('20. Alania: zaman aşımı, iptal, devre kesici')
  await s.click('.sekme[data-sekme="ayarlar"]')
  await s.fill('#anahtar', 'pd_live_deneme')
  await s.click('.sekme[data-sekme="ceviri"]')
  alaniaKipi = 'yavas'
  await s.click('#anaDugme')
  await s.evaluate(() => (window.__okunan = []))
  await s.evaluate(() => window.__sonuc('Guten Tag'))
  await s.waitForTimeout(1500) // Alania isteği yolda
  alaniaOnce = alaniaIstekleri.length
  await s.click('#anaDugme') // Durdur: istek iptal
  alaniaKipi = 'tamam'
  await s.click('#anaDugme')
  await s.evaluate(() => window.__sonuc('Hello how are you'))
  await s.waitForTimeout(1700)
  bekle(alaniaIstekleri.length === alaniaOnce + 1, 'Durdur sonrası ilk cümle eski Alania isteğini beklemedi')
  okunan = await s.evaluate(() => window.__okunan.filter((o) => o.metin.trim()))
  bekle(okunan.length === 0, 'iptal edilen cümle cihaz sesiyle de okunmadı', okunan)

  alaniaKipi = 'yavas'
  await s.evaluate(() => window.__sonuc('Where is the station'))
  await s.waitForTimeout(1200 + 4300)
  okunan = await s.evaluate(() => window.__okunan.filter((o) => o.metin.trim()))
  bekle(okunan.length === 0, '5 sn dolmadan yedeğe düşülmedi', okunan)
  await s.waitForTimeout(1500)
  okunan = await s.evaluate(() => window.__okunan.filter((o) => o.metin.trim()))
  bekle(okunan.length === 1, '5 sn sonunda istek kesildi, cihaz sesi okudu', okunan)
  bekle((await metin(s, '#not')).includes('Alania sesine ulaşılamadı'), 'zaman aşımında yedek notu')
  alaniaKipi = 'tamam'
  await s.evaluate(() => window.__sonuc('Guten Tag'))
  await s.waitForTimeout(1700)
  bekle(
    !(await metin(s, '#not')).includes('Alania'),
    'başarılı Alania sesinden sonra not kalktı',
    await metin(s, '#not'),
  )

  alaniaKipi = '500'
  await s.evaluate(() => (window.__okunan = []))
  alaniaOnce = alaniaIstekleri.length
  for (const cumle of ['Hello how are you', 'Where is the station', 'Guten Tag', 'It is late']) {
    await s.evaluate((c) => window.__sonuc(c), cumle)
    await s.waitForTimeout(1800)
  }
  bekle(
    alaniaIstekleri.length === alaniaOnce + 3,
    '3 hatadan sonra Alania denenmedi',
    alaniaIstekleri.length - alaniaOnce,
  )
  okunan = await s.evaluate(() => window.__okunan.filter((o) => o.metin.trim()))
  bekle(okunan.length === 4, '4 cümlenin hepsi cihaz sesiyle okundu', okunan.length)
  bekle((await metin(s, '#not')).includes('bu oturumda cihazın sesi'), 'devre kesici notu oturum boyunca')
  await s.click('#anaDugme')
  alaniaKipi = 'tamam'
  await s.click('#anaDugme')
  alaniaOnce = alaniaIstekleri.length
  await s.evaluate(() => window.__sonuc('Hello how are you'))
  await s.waitForTimeout(1700)
  bekle(alaniaIstekleri.length === alaniaOnce + 1, 'yeni oturumda Alania yeniden denendi')
  await s.click('#anaDugme')

  // ---------- 21. Tanılama ----------
  console.log('21. Tanılama')
  await s.click('#anaDugme')
  ceviriKipi = 'kopuk'
  await s.evaluate(() => window.__sonuc('Hello how are you'))
  await s.waitForTimeout(1500)
  ceviriKipi = 'tamam'
  await s.evaluate(() => window.__hata('not-allowed'))
  await s.waitForTimeout(200)
  await s.click('.sekme[data-sekme="ayarlar"]')
  bekle(/^\d+ olay · yalnız bu cihazda$/.test(await metin(s, '#tanilamaOzet')), 'Ayarlar: Tanılama satırı olay sayısı')
  await s.click('#tanilamaSatiri')
  bekle(await s.locator('#tanilamaSayfa').isVisible(), 'Tanılama sayfası açıldı')
  bekle(
    (await s.locator('#tanilamaSayfa').getAttribute('role')) === 'dialog' &&
      (await s.locator('#tanilamaSayfa').getAttribute('aria-modal')) === 'true',
    'sayfa: role=dialog, aria-modal',
  )
  bekle(await s.evaluate(() => document.activeElement.id === 'tanilamaBaslik'), 'açılınca odak başlıkta')
  const liste = await metin(s, '#taniListe')
  const gerekenler = [
    'başlat',
    'ses yolu',
    'tanıma açıldı',
    'tanıma bitti',
    'cümle',
    'çeviri',
    'ses',
    'kesinti',
    'sekme',
    'izin',
    'durdur',
  ]
  const eksik = gerekenler.filter((o) => !liste.split('\n').some((satir) => satir.startsWith(o)))
  bekle(eksik.length === 0, 'kayıt beklenen olayları içeriyor', eksik)
  const ayrintilar = [
    /dil=en/,
    /en-US/,
    /kelime=\d+/,
    /\d+ ms/,
    /neden=sessizlik/,
    /alania \d+ ms/,
    /alania hatası http=500/,
    /alania hatası zaman aşımı/,
    /alania isteği iptal edildi/,
    /alania bu oturumda kapalı/,
    /cihaz/,
    /gizlendi/,
    /göründü/,
    /mikrofon=reddedildi/,
    /neden=izin yok/,
    /neden=düğme/,
    /hata ağ/,
    /konum=bilinmiyor/,
    /mikrofon=verildi/,
    /dinliyor olay=audiostart/,
    /start \d+ ms/,
    /başladı neden=okuma/,
    /neden eklendi=gizli sekme/,
    /bitti neden=gizli sekme/,
    /bitti neden=okuma/,
  ].filter((r) => !r.test(liste))
  bekle(ayrintilar.length === 0, 'ayrıntılar: dil, kelime sayısı, süre, HTTP kodu, neden', ayrintilar.map(String))
  bekle(
    (await s.locator('#taniListe .tani-oge .tani-ad').first().textContent()) === 'Uyarı: durdur',
    'liste en yeni üstte; uyarı olayı "Uyarı:" ile okunur',
    await s.locator('#taniListe .tani-oge .tani-ad').first().textContent(),
  )
  const sayfaMetni = await metin(s, '#tanilamaSayfa')
  bekle(
    ICERIK.every((x) => !sayfaMetni.includes(x)),
    'ekrandaki kayıtta söylenen cümle ve çevirisi yok',
    ICERIK.filter((x) => sayfaMetni.includes(x)),
  )
  bekle(
    sayfaMetni.includes('Kayıt yalnızca bu cihazda, sayfa açıkken tutulur; konuşma ve çeviri metni içermez.'),
    'gizlilik cümlesi',
  )
  await s.click('#kopyala')
  await s.waitForTimeout(150)
  const pano = await s.evaluate(() => window.__pano)
  const ua = await s.evaluate(() => navigator.userAgent)
  const panoSatirlari = (pano || '').split('\n')
  const olaySatirlari = panoSatirlari.slice(panoSatirlari.indexOf('') + 1).filter(Boolean)
  bekle(
    Boolean(pano) &&
      panoSatirlari[0].includes('Tanılama kaydı') &&
      pano.includes('Tarayıcı: ' + ua) &&
      panoSatirlari.includes('Sayfa: http · index.html') &&
      panoSatirlari.includes('Sürüm: S01 tur 4') &&
      !pano.includes('Sayfa: /') &&
      /Tarih: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(pano),
    'Kopyala: başlıkta tarayıcı, "Sürüm: S01 tur 4", protokol + dosya adı (yol yok) ve tarih',
    panoSatirlari.slice(0, 7),
  )
  bekle(
    olaySatirlari.length > 20 && olaySatirlari.every((x) => /^\d{2}:\d{2}:\d{2}\.\d{3} {2}\S.* {2}?/.test(x)),
    'Kopyala: her satır "SS:DD:SS.mmm  olay  ayrıntı"',
    olaySatirlari.filter((x) => !/^\d{2}:\d{2}:\d{2}\.\d{3} {2}\S/.test(x)).slice(0, 3),
  )
  bekle(
    olaySatirlari[0].includes('  başlat  ') && olaySatirlari[olaySatirlari.length - 1].includes('  durdur  '),
    'Kopyala: eskiden yeniye',
  )
  bekle(
    ICERIK.every((x) => !pano.includes(x)),
    'kopyalanan kayıtta söylenen cümle ve çevirisi yok',
    ICERIK.filter((x) => pano.includes(x)),
  )
  bekle((await metin(s, '#kopyala')).trim() === 'Kopyalandı', 'düğme: Kopyalandı')
  bekle((await s.locator('#taniDuyuru').textContent()) === 'Kayıt panoya kopyalandı', 'duyuru: Kayıt panoya kopyalandı')
  await s.waitForTimeout(2100)
  bekle((await metin(s, '#kopyala')).trim() === 'Kopyala', '2 sn sonra düğme eski hâlinde')
  await s.evaluate(() => (window.__panoRed = true))
  await s.click('#kopyala')
  await s.waitForTimeout(150)
  bekle(
    (await s.locator('#kopyaMetin').isVisible()) &&
      (await s.inputValue('#kopyaMetin')).includes('Tanılama kaydı') &&
      (await s.locator('#kopyaUyari').isVisible()),
    'pano reddedince metin seçilebilir alanda',
  )
  await s.evaluate(() => (window.__panoRed = false))
  await goruntu(s, '6-tanilama.png')
  const olaySayisi = await s.locator('#taniListe .tani-oge').count()
  await s.click('#taniTemizle')
  bekle(
    (await metin(s, '#taniTemizle')).includes('Silmek için yeniden dokunun') &&
      (await s.locator('#taniListe .tani-oge').count()) === olaySayisi,
    'Temizle: ilk dokunuş onay istiyor, silmiyor',
  )
  await s.waitForTimeout(4200)
  bekle((await metin(s, '#taniTemizle')).trim() === 'Temizle', 'onay 4 sn sonra kalktı')
  await s.click('#taniTemizle')
  await s.click('#taniTemizle')
  await s.waitForTimeout(100)
  bekle(
    (await s.locator('#taniBos').isVisible()) && (await s.locator('#taniTemizle').isDisabled()),
    'Temizle: ikinci dokunuşta silindi, boş durum, Temizle devre dışı',
  )
  bekle((await s.locator('#taniDuyuru').textContent()) === 'Kayıt temizlendi', 'duyuru: Kayıt temizlendi')
  await s.keyboard.press('Escape')
  bekle(
    (await s.locator('#tanilamaSayfa').isHidden()) &&
      (await s.evaluate(() => document.activeElement.id === 'tanilamaSatiri')),
    'Esc kapattı, odak Tanılama satırına döndü',
  )
  bekle((await metin(s, '#tanilamaOzet')) === 'Henüz olay yok', 'özet: Henüz olay yok')
  await s.evaluate(() => {
    for (let i = 0; i < 170; i += 1) {
      for (const v of ['hidden', 'visible']) {
        Object.defineProperty(document, 'visibilityState', { value: v, configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      }
    }
  })
  await s.click('#tanilamaSatiri')
  bekle(
    (await s.locator('#taniListe .tani-oge').count()) === 300 && (await s.locator('#taniSinir').isVisible()),
    'en çok 300 olay; "Son 300 olay gösteriliyor."',
  )
  await s.click('#kopyala')
  await s.waitForTimeout(100)
  bekle(
    (await s.evaluate(() => window.__pano.split('\n').filter((x) => /^\d{2}:/.test(x)).length)) === 300,
    'kopyada 300 olay satırı',
  )
  await s.click('#tanilamaBitti')
  await ortam.close()

  // ---------- 22. Erişilebilirlik ve metinler ----------
  console.log('22. Erişilebilirlik ve metinler')
  ortam = await tarayici.newContext()
  s = await sayfaAc(ortam)
  bekle((await s.locator('.kart[aria-live]').count()) === 0, '"Şu An" kartı canlı bölge değil')
  bekle((await metin(s, '.kart h2')) === 'Şu An', '"Şu An" başlığı değişmedi')
  bekle(
    (await metin(s, '#not')).includes('kulaklık durumu gösterilmez'),
    'not: kulaklık durumu gösterilmez',
    await metin(s, '#not'),
  )
  const renk = (secici, ozellik) =>
    s.evaluate(([a, b]) => getComputedStyle(document.querySelector(a))[b], [secici, ozellik])
  bekle((await renk('#anaDugme', 'backgroundColor')) === 'rgb(43, 114, 229)', 'Başlat dolgusu --mavi-dolgu')
  bekle((await renk('.sekme[aria-current="page"]', 'color')) === 'rgb(74, 143, 247)', 'seçili sekme --mavi-metin')
  await s.click('#anaDugme')
  await s.waitForTimeout(350)
  bekle((await s.locator('#durumDuyuru').textContent()) === 'Dinleme başladı', 'duyuru: Dinleme başladı')
  bekle((await renk('#anaDugme', 'backgroundColor')) === 'rgb(222, 53, 48)', 'Durdur dolgusu --kirmizi-dolgu')
  bekle((await renk('#canliRozet', 'backgroundColor')) === 'rgb(43, 114, 229)', 'CANLI rozeti --mavi-dolgu')
  bekle((await s.locator('#canliRozet .sr').textContent()) === 'Dinleme açık', 'CANLI rozeti: "Dinleme açık"')
  await s.evaluate(() => window.__sonuc('Hello how'))
  bekle((await s.locator('.canli-metin').getAttribute('lang')) === 'en', 'canlı metin lang=en')
  await s.evaluate(() => window.__sonuc('Hello how are you'))
  await s.waitForTimeout(1500)
  bekle((await s.locator('.satir.buyuk .asil').getAttribute('lang')) === 'en', 'asıl cümle lang=en')
  bekle((await s.locator('.satir.buyuk .ceviri').getAttribute('lang')) === null, 'çeviride ayrı lang yok (sayfa tr)')
  bekle(
    (await s.locator('#ceviriDuyuru').textContent()) === 'Merhaba, nasılsın?',
    'canlı bölge yalnız son çeviriyi okur',
  )
  bekle((await s.locator('#ceviriDuyuru').getAttribute('aria-live')) === 'polite', 'çeviri bölgesi aria-live=polite')
  await s.click('#anaDugme')
  await s.waitForTimeout(150)
  bekle((await s.locator('#durumDuyuru').textContent()) === 'Dinleme durdu', 'duyuru: Dinleme durdu')
  await s.click('#anaDugme')
  await s.evaluate(() => window.__hata('not-allowed'))
  await s.waitForTimeout(100)
  bekle((await s.locator('#hata svg').count()) === 1, 'hata satırının başında uyarı simgesi')
  await s.click('.sekme[data-sekme="ayarlar"]')
  const ayarMetni = await metin(s, '.panel[data-sekme="ayarlar"]')
  bekle(ayarMetni.includes('Anahtar yalnızca bu tarayıcıda saklanır.'), 'anahtar: "bu tarayıcıda saklanır"')
  bekle(
    ayarMetni.includes(
      "Anahtar girerseniz çeviri metni seslendirmek için Alania'ya gönderilir; söylenen asıl cümle gönderilmez.",
    ),
    "anahtar dipnotu: Alania'ya giden metin söyleniyor (KR17a)",
  )
  bekle(ayarMetni.includes('Yalnız bu web sürümünde.'), 'duraklat: "yalnız bu web sürümünde"')
  bekle(
    (await metin(s, '#anahtarBaslik')) === 'ALANIA-2 API ANAHTARI' &&
      (await s.locator('#anahtarBaslik').textContent()) === 'Alania-2 API anahtarı',
    'bölüm başlığı biçemle büyük harf, metni olağan',
    await metin(s, '#anahtarBaslik'),
  )
  await s.click('#duraklatEtiket')
  bekle(
    (await s.locator('#duraklat').getAttribute('aria-checked')) === 'true',
    'şalter etiketine dokunmak da değiştirir',
  )
  await s.click('#duraklatEtiket')
  await ortam.close()

  // ---------- 23. Küçük ekran: dil menüsü, dinlerken düzen, dokunma alanları ----------
  console.log('23. 320×568')
  ortam = await tarayici.newContext()
  s = await sayfaAc(ortam, 320, 568)
  bekle((await kucukDenetimler(s)).length === 0, 'Çeviri: dokunma alanları ≥ 44 px', await kucukDenetimler(s))
  await s.click('#dilSeridi')
  const menuKutu = await s.locator('#dilMenu').boundingBox()
  bekle(menuKutu.y >= 0 && menuKutu.y + menuKutu.height <= 568, 'dil menüsü ekranın içinde', menuKutu)
  let erisilemeyen = []
  for (const kod of ['en', 'de', 'fr', 'es', 'it', 'ru', 'ar']) {
    const oge = s.locator(`.menu-oge[data-kod="${kod}"]`)
    await oge.scrollIntoViewIfNeeded()
    const ulasir = await oge.evaluate((e) => {
      const r = e.getBoundingClientRect()
      const ust = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return r.top >= 0 && r.bottom <= innerHeight && Boolean(ust) && e.contains(ust)
    })
    if (!ulasir) erisilemeyen.push(kod)
  }
  bekle(erisilemeyen.length === 0, '320×568: 7 dilin hepsi erişilebilir', erisilemeyen)
  bekle((await kucukDenetimler(s)).length === 0, 'dil menüsü öğeleri ≥ 44 px', await kucukDenetimler(s))
  await s.click('.menu-oge[data-kod="ar"]')
  bekle((await metin(s, '#dilAd')) === 'Arapça → Türkçe', 'Arapça seçilebildi')
  await s.click('#dilSeridi')
  await s.click('.menu-oge[data-kod="en"]')
  await s.click('#anaDugme')
  await s.evaluate(() => window.__sonuc('Hello how are you'))
  await s.waitForTimeout(1500)
  await s.evaluate(() => window.__sonuc('Where is the'))
  const duzen = await s.evaluate(() => {
    const k = (x) => document.querySelector(x).getBoundingClientRect()
    const h1 = document.querySelector('.panel[data-sekme="ceviri"] h1')
    return {
      baslik: k('.panel[data-sekme="ceviri"] h1').height,
      kesik: h1.scrollWidth > h1.clientWidth + 1,
      serit: k('#dilSeridi').height,
      ceviriAlt: k('.satir.buyuk .ceviri').bottom,
      ceviriUst: k('.satir.buyuk .ceviri').top,
      altUst: k('.alt').top,
      ipucuGorunur: k('#dilIpucu').width > 1,
    }
  })
  bekle(duzen.baslik <= 42 && !duzen.kesik, 'dinlerken başlık tek satırda, kesilmeden', duzen)
  bekle(Math.abs(duzen.serit - 56) <= 1 && !duzen.ipucuGorunur, 'dinlerken dil şeridi tek satır, 56 px', duzen)
  bekle(duzen.ceviriUst >= 0 && duzen.ceviriAlt <= duzen.altUst, 'dinlerken son çeviri kaydırmadan görünüyor', duzen)
  bekle((await tasma(s)) === 0, 'dinlerken yatay taşma yok (320)')
  bekle((await kucukDenetimler(s)).length === 0, 'dinlerken dokunma alanları ≥ 44 px', await kucukDenetimler(s))
  await goruntu(s, '7-320-dinliyor.png')
  await s.click('#anaDugme')
  await s.click('.sekme[data-sekme="gecmis"]')
  bekle((await kucukDenetimler(s)).length === 0, 'Geçmiş: dokunma alanları ≥ 44 px', await kucukDenetimler(s))
  await s.click('#temizle')
  bekle((await kucukDenetimler(s)).length === 0, 'Geçmiş onayı: dokunma alanları ≥ 44 px', await kucukDenetimler(s))
  await s.click('#gecmisVazgec')
  await s.click('.sekme[data-sekme="ayarlar"]')
  bekle((await kucukDenetimler(s)).length === 0, 'Ayarlar: dokunma alanları ≥ 44 px', await kucukDenetimler(s))
  bekle((await s.locator('#tanilamaSatiri').boundingBox()).height >= 56, 'Tanılama satırı en az 56 px')
  await s.click('#tanilamaSatiri')
  bekle((await kucukDenetimler(s)).length === 0, 'Tanılama: dokunma alanları ≥ 44 px', await kucukDenetimler(s))
  bekle((await tasma(s)) === 0, 'Tanılama açıkken yatay taşma yok (320)')
  await ortam.close()

  // ---------- 24. Genişlikler: dinlerken ve Tanılama açıkken ----------
  console.log('24. Genişlikler (dinlerken, Tanılama)')
  ortam = await tarayici.newContext()
  for (const [g, y] of [
    [320, 568],
    [360, 800],
    [390, 844],
    [1280, 960],
  ]) {
    s = await sayfaAc(ortam, g, y)
    await s.click('#anaDugme')
    await s.evaluate(() => window.__sonuc('Hello how are you'))
    await s.waitForTimeout(1500)
    const t1 = await tasma(s)
    await s.click('#anaDugme')
    await s.click('.sekme[data-sekme="ayarlar"]')
    await s.click('#tanilamaSatiri')
    const t2 = await tasma(s)
    bekle(t1 === 0 && t2 === 0, `yatay taşma yok, dinlerken ve Tanılama açıkken (${g})`, [t1, t2])
    await s.close()
  }
  await ortam.close()

  // ---------- 25. Aşamalar (YÖ-4, KR3): hazırlanıyor / dinliyor / kesintide ----------
  console.log('25. Aşamalar')
  ortam = await tarayici.newContext()
  s = await sayfaAc(ortam)
  const suAnMetni = () => metin(s, '#suAn')
  const rozetVar = () => s.locator('#canliRozet').isVisible()
  const kayit = async () => {
    await s.click('.sekme[data-sekme="ayarlar"]')
    await s.click('#tanilamaSatiri')
    await s.click('#kopyala')
    await s.waitForTimeout(100)
    const p = await s.evaluate(() => window.__pano)
    await s.click('#tanilamaBitti')
    await s.click('.sekme[data-sekme="ceviri"]')
    return p.split('\n').map((x) => x.replace(/^\d{2}:\d{2}:\d{2}\.\d{3} {2}/, ''))
  }
  const temizle = async () => {
    await s.click('.sekme[data-sekme="ayarlar"]')
    await s.click('#tanilamaSatiri')
    if (!(await s.locator('#taniTemizle').isDisabled())) {
      await s.click('#taniTemizle')
      await s.click('#taniTemizle')
    }
    await s.click('#tanilamaBitti')
    await s.click('.sekme[data-sekme="ceviri"]')
  }

  // a) İzin beklenirken (hiçbir olay yok): Hazırlanıyor…, CANLI yok, düğme Durdur
  await s.evaluate(() => (window.__olayKipi = 'yok'))
  await s.click('#anaDugme')
  await s.waitForTimeout(200)
  let su = await suAnMetni()
  bekle(su.includes('Hazırlanıyor…') && !su.includes('Dinliyorum'), 'izin beklenirken "Hazırlanıyor…"', su)
  bekle(!(await rozetVar()), 'hazırlanırken CANLI rozeti yok')
  bekle((await dugmeMetni(s)) === 'Durdur', 'hazırlanırken düğme: Durdur')
  bekle((await s.locator('#dilSeridi').getAttribute('aria-disabled')) === 'true', 'hazırlanırken dil şeridi kilitli')
  await s.waitForTimeout(350)
  bekle((await s.locator('#durumDuyuru').textContent()) === 'Hazırlanıyor', 'duyuru: Hazırlanıyor')
  await s.evaluate(() => window.__olay('audiostart'))
  su = await suAnMetni()
  bekle(su.includes('Dinliyorum…') && (await rozetVar()), 'audiostart gelince "Dinliyorum…" ve CANLI', su)
  await s.waitForTimeout(350)
  bekle((await s.locator('#durumDuyuru').textContent()) === 'Dinleme başladı', 'duyuru: Dinleme başladı')
  let k = await kayit()
  bekle(k.includes('tanıma açıldı  en-US konum=bilinmiyor'), 'Tanılama: tanıma açıldı … konum=bilinmiyor', k)
  bekle(k.includes('izin  mikrofon=verildi'), 'Tanılama: izin verildi satırı (audiostart)')
  bekle(
    k.some((x) => /^aşama {2}dinliyor olay=audiostart \d+ ms$/.test(x)),
    'Tanılama: geçişi yapan olay = audiostart',
    k.filter((x) => x.startsWith('aşama')),
  )
  await s.click('#anaDugme')

  // b) Hazırlanırken Durdur
  await s.click('#anaDugme')
  await s.waitForTimeout(100)
  await s.click('#anaDugme')
  bekle(
    (await dugmeMetni(s)) === 'Dinlemeyi Başlat' &&
      !(await rozetVar()) &&
      !(await suAnMetni()).includes('Hazırlanıyor'),
    'hazırlanırken Durdur: duruyor aşamasına döndü',
  )

  // c) Yalnız "start" gelen tarayıcı: start geçiş yapmaz, yalnız kayıttır (KR15); geçişi ilk sonuç yapar
  await temizle()
  await s.evaluate(() => (window.__olayKipi = 'start'))
  await s.click('#anaDugme')
  await s.waitForTimeout(100)
  su = await suAnMetni()
  bekle(
    su.includes('Hazırlanıyor…') && !su.includes('Dinliyorum') && !(await rozetVar()),
    'yalnız start gelince Hazırlanıyor… kalır, CANLI yok',
    su,
  )
  await s.evaluate(() => window.__sonuc('Hello'))
  bekle(await rozetVar(), 'start sonrası ilk sonuç dinliyor yapar')
  k = await kayit()
  bekle(
    k.some((x) => /^tanıma {2}start \d+ ms$/.test(x)) &&
      k.some((x) => /^aşama {2}dinliyor olay=sonuç \d+ ms$/.test(x)) &&
      !k.some((x) => /olay=start/.test(x)),
    'Tanılama: "tanıma  start <ms> ms" kaydı; geçişi yapan olay = sonuç',
    k.filter((x) => /^(aşama|tanıma {2})/.test(x)),
  )
  bekle(
    k.filter((x) => x.startsWith('izin')).join() === 'izin  mikrofon=verildi (ilk sonuç geldi)',
    'Tanılama: start izin sayılmaz; izin ilk sonuçta, bir kez',
    k.filter((x) => x.startsWith('izin')),
  )
  await s.click('#anaDugme')

  // d) Hiçbir olay gelmeyen tarayıcı: ilk sonuç geçişi yapar
  await temizle()
  await s.evaluate(() => (window.__olayKipi = 'yok'))
  await s.click('#anaDugme')
  await s.evaluate(() => window.__sonuc('Hello'))
  bekle((await rozetVar()) && (await metin(s, '.canli-metin')) === 'Hello', 'olay yoksa ilk sonuç dinliyor yapar')
  k = await kayit()
  bekle(
    k.some((x) => /^aşama {2}dinliyor olay=sonuç \d+ ms$/.test(x)),
    'Tanılama: geçişi yapan olay = sonuç',
  )
  await s.click('#anaDugme')

  // e) Hiçbir olay ve sonuç yok: 5 sn sonra aşama DEĞİŞMEZ (KR15); satır "Mikrofon bekleniyor…",
  //    Tanılama'da uyarı; sonradan audiostart gelince olağan geçiş
  await temizle()
  await s.click('#anaDugme')
  await s.waitForTimeout(4500)
  bekle((await suAnMetni()).includes('Hazırlanıyor…'), 'olay gelmezse 4,5 sn sonra hâlâ Hazırlanıyor…')
  await s.waitForTimeout(800)
  su = await suAnMetni()
  bekle(
    su.includes('Mikrofon bekleniyor. İzin istendiyse izin verin.') &&
      !su.includes('Dinliyorum') &&
      !su.includes('Hazırlanıyor') &&
      !(await rozetVar()) &&
      (await dugmeMetni(s)) === 'Durdur',
    '5 sn sonra "Mikrofon bekleniyor. İzin istendiyse izin verin.", CANLI ve Dinliyorum yok',
    su,
  )
  const asamaStili = await s.evaluate(() => {
    const p = document.querySelector('#suAn .dinliyorum')
    return { sinif: p.className, renk: getComputedStyle(p).color, simge: p.querySelector('use').getAttribute('href') }
  })
  bekle(
    asamaStili.sinif === 'dinliyorum' && asamaStili.simge === '#i-kum',
    'bekleniyor satırı "Hazırlanıyor…" ile aynı renk ve simge',
    asamaStili,
  )
  k = await kayit()
  bekle(
    k.includes('aşama  hazırlanıyor: 5 sn içinde audiostart ya da sonuç gelmedi') &&
      !k.some((x) => /^aşama {2}dinliyor/.test(x)) &&
      !k.some((x) => x.startsWith('izin')),
    'Tanılama: "aşama  hazırlanıyor: 5 sn içinde audiostart ya da sonuç gelmedi"; dinliyor ve izin yazılmadı',
    k.filter((x) => /^(aşama|izin)/.test(x)),
  )
  await s.click('.sekme[data-sekme="ayarlar"]')
  await s.click('#tanilamaSatiri')
  bekle(
    (await s.locator('#taniListe .tani-ad', { hasText: 'aşama' }).first().textContent()) === 'Uyarı: aşama',
    'Tanılama: 5 sn satırı uyarı olarak işaretli',
  )
  await s.click('#tanilamaBitti')
  await s.click('.sekme[data-sekme="ceviri"]')
  await s.evaluate(() => window.__olay('audiostart'))
  su = await suAnMetni()
  bekle(
    su.includes('Dinliyorum…') && !su.includes('Mikrofon bekleniyor') && (await rozetVar()),
    'sonradan audiostart gelince olağan geçiş: Dinliyorum… ve CANLI',
    su,
  )
  await s.click('#anaDugme')

  // f) Hazırlanırken sekme gizlenirse kesintide; dönünce yeniden Hazırlanıyor (doğrulanmadı)
  await s.click('#anaDugme')
  await gorunurluk(s, 'hidden')
  bekle((await suAnMetni()).includes('Duraklatıldı: sayfa arka planda'), 'hazırlanırken gizli: Duraklatıldı')
  await gorunurluk(s, 'visible')
  bekle((await suAnMetni()).includes('Hazırlanıyor…') && !(await rozetVar()), 'dönünce yine Hazırlanıyor…')
  await s.click('#anaDugme')
  await s.evaluate(() => (window.__olayKipi = 'ikisi'))

  // g) Okurken bekletme: Duraklatıldı: okuma sürüyor; CANLI yok; düğme Durdur
  await temizle()
  await s.click('.sekme[data-sekme="ayarlar"]')
  await s.click('#duraklat')
  await s.click('.sekme[data-sekme="ceviri"]')
  await s.evaluate(() => (window.__okumaSuresi = 1500))
  await s.click('#anaDugme')
  await s.evaluate(() => window.__sonuc('Hello how are you'))
  await s.waitForTimeout(1450)
  su = await suAnMetni()
  bekle(
    su.includes('Duraklatıldı: okuma sürüyor') && !su.includes('Dinliyorum'),
    'okurken "Duraklatıldı: okuma sürüyor"',
    su,
  )
  bekle(!(await rozetVar()), 'okurken CANLI rozeti yok')
  bekle((await dugmeMetni(s)) === 'Durdur', 'okurken düğme: Durdur')
  bekle(
    (await s.locator('.dinliyorum.duraklatildi').evaluate((e) => getComputedStyle(e).color)) === 'rgb(250, 194, 61)',
    '"Duraklatıldı" rengi --sari',
  )
  // okuma sürerken sekme de gizlenirse neden "sayfa arka planda"; görününce yine okuma
  await gorunurluk(s, 'hidden')
  bekle((await suAnMetni()).includes('Duraklatıldı: sayfa arka planda'), 'okurken gizli: "sayfa arka planda"')
  await gorunurluk(s, 'visible')
  bekle((await suAnMetni()).includes('Duraklatıldı: okuma sürüyor'), 'görününce okuma sürüyor: yine Duraklatıldı')
  await s.waitForTimeout(1500)
  bekle((await suAnMetni()).includes('Dinliyorum…') && (await rozetVar()), 'okuma bitince "Dinliyorum…" ve CANLI')
  await s.evaluate(() => (window.__okumaSuresi = 400))
  await s.click('.sekme[data-sekme="ayarlar"]')
  await s.click('#duraklat')
  await s.click('.sekme[data-sekme="ceviri"]')

  // h) Gizli sekme (dinlerken)
  await gorunurluk(s, 'hidden')
  su = await suAnMetni()
  bekle(
    su.includes('Duraklatıldı: sayfa arka planda') && !(await rozetVar()),
    'gizli sekmede "Duraklatıldı", CANLI yok',
    su,
  )
  bekle((await dugmeMetni(s)) === 'Durdur', 'gizli sekmede düğme: Durdur')
  await gorunurluk(s, 'visible')
  bekle((await suAnMetni()).includes('Dinliyorum…') && (await rozetVar()), 'görününce "Dinliyorum…" ve CANLI')
  k = await kayit()
  const kesintiler = k.filter((x) => x.startsWith('kesinti'))
  bekle(
    [
      'kesinti  başladı neden=okuma',
      'kesinti  neden eklendi=gizli sekme',
      'kesinti  neden kalktı=gizli sekme',
      'kesinti  bitti neden=okuma',
      'kesinti  başladı neden=gizli sekme',
      'kesinti  bitti neden=gizli sekme',
    ].every((x) => kesintiler.includes(x)),
    'Tanılama: kesinti başladı / neden eklendi / neden kalktı / bitti',
    kesintiler,
  )
  bekle(!k.some((x) => x.startsWith('bekleme')), 'Tanılama: eski "bekleme" adı yok')
  await s.click('#anaDugme')

  // i) Ön-9: Durdur uçuştaki çeviri isteğini iptal eder; yeni oturum onu beklemez
  console.log('25i. Durdur ve uçuştaki çeviri isteği')
  await temizle()
  const iptalEdilen = []
  s.on('requestfailed', (r) => {
    if (r.url().startsWith('https://api.mymemory.translated.net/'))
      iptalEdilen.push(r.failure() && r.failure().errorText)
  })
  ceviriKipi = 'yavas'
  await s.click('#anaDugme')
  await s.evaluate(() => window.__sonuc('Where is the station'))
  await s.waitForTimeout(1500) // istek yolda
  await s.click('#anaDugme')
  ceviriKipi = 'tamam'
  await s.waitForTimeout(150)
  bekle(iptalEdilen.length === 1, 'Durdur çeviri isteğini iptal etti', iptalEdilen)
  await s.click('#anaDugme')
  await s.evaluate(() => window.__sonuc('Hello how are you'))
  await s.waitForTimeout(1600)
  bekle(
    (await metin(s, '.satir.buyuk .ceviri')) === 'Merhaba, nasılsın?',
    'yeni oturumun ilk cümlesi eski isteği beklemeden çevrildi',
  )
  bekle(await s.locator('#hata').isHidden(), 'iptal edilen istek hata göstermedi')
  await s.waitForTimeout(300)
  const ceviriler = await s.locator('.satir .ceviri').allInnerTexts()
  bekle(
    !ceviriler.some((x) => x.includes('GEC:') || x.includes('İstasyon')),
    'iptal edilen cümle ekrana gelmedi',
    ceviriler,
  )
  k = await kayit()
  bekle(k.includes('çeviri  istek iptal edildi'), 'Tanılama: çeviri  istek iptal edildi')
  bekle(!k.some((x) => /^çeviri {2}hata/.test(x)), 'Tanılama: iptal hata sayılmadı')
  await s.click('#anaDugme')
  await ortam.close()

  // ---------- 26. Dikey kayma (C-1, C-12), dil şeridi opaklığı (C-5), kenar solması (C-8) ----------
  console.log('26. Dikey kayma ve konum')
  const ekranKaymasi = (sayfa) => sayfa.evaluate(() => document.getElementById('ekran').scrollTop)
  for (const [g, y] of [
    [390, 844],
    [320, 568],
  ]) {
    ortam = await tarayici.newContext()
    s = await sayfaAc(ortam, g, y)
    await s.click('#anaDugme')
    if (g === 390) {
      // (c) dinlerken kompakt dil şeridi tam opak (C-5)
      const opak = await s.evaluate(() =>
        ['.dil-ad', '.dil-ok'].map((x) => getComputedStyle(document.querySelector('#dilSeridi ' + x)).opacity),
      )
      bekle(opak[0] === '1' && opak[1] === '1', 'dinlerken dil şeridi başlığı ve oku opacity 1', opak)
      const kenar = await s.evaluate(() => ({
        maske: getComputedStyle(document.querySelector('.kaydir')).maskImage,
        alt: getComputedStyle(document.querySelector('.alt')).paddingTop,
        tani: getComputedStyle(document.getElementById('taniKaydir')).maskImage,
      }))
      bekle(
        /gradient/.test(kenar.maske) && /gradient/.test(kenar.tani) && kenar.alt === '8px',
        'kaydırma alanı ve Tanılama listesi altta soluyor; .alt üst boşluğu 8 px (C-8)',
        kenar,
      )
    }
    for (const c of ['Hello how are you', 'Where is the station', 'Guten Tag', 'It is late']) {
      await s.evaluate((x) => window.__sonuc(x), c)
      await s.waitForTimeout(1500)
    }
    await s.click('#anaDugme')
    await s.click('.sekme[data-sekme="ayarlar"]')
    await s.click('#tanilamaSatiri')
    await s.waitForTimeout(600) // sayfanın kayarak gelişi bitsin
    const olcum = await s.evaluate(() => {
      const r = document.getElementById('tanilamaBitti').getBoundingClientRect()
      const ust = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return {
        kayma: document.getElementById('ekran').scrollTop,
        ust: Math.round(r.top),
        yukseklik: Math.round(r.height),
        genislik: Math.round(r.width),
        gorunur: Boolean(ust) && document.getElementById('tanilamaBitti').contains(ust),
        olay: document.querySelectorAll('#taniListe li').length,
      }
    })
    bekle(olcum.olay > 20 && olcum.kayma === 0, `dört cümleden sonra Tanılama: #ekran.scrollTop 0 (${g}×${y})`, olcum)
    bekle(
      olcum.ust >= 0 && olcum.gorunur && olcum.yukseklik >= 44 && olcum.genislik >= 44,
      `"Bitti" ekranda, görünür ve 44 px (${g}×${y})`,
      olcum,
    )
    await s.click('#tanilamaBitti')
    bekle((await ekranKaymasi(s)) === 0, `Tanılama kapanınca #ekran.scrollTop 0 (${g}×${y})`)
    if (g === 320) {
      // (b) dil menüsü ve Geçmiş onayı kapanınca da kayma yok
      await s.click('.sekme[data-sekme="ceviri"]')
      await s.click('#dilSeridi')
      await s.click('.menu-oge[data-kod="de"]')
      const k1 = await ekranKaymasi(s)
      await s.click('#dilSeridi')
      await s.keyboard.press('Escape')
      const k2 = await ekranKaymasi(s)
      bekle(k1 === 0 && k2 === 0, 'dil menüsü kapanınca (seçim ve Esc) #ekran.scrollTop 0', [k1, k2])
      await s.click('.sekme[data-sekme="gecmis"]')
      await s.click('#temizle')
      const k3 = await ekranKaymasi(s)
      await s.click('#gecmisVazgec')
      const k4 = await ekranKaymasi(s)
      await s.click('#temizle')
      await s.click('#gecmisSil')
      const k5 = await ekranKaymasi(s)
      bekle(k3 === 0 && k4 === 0 && k5 === 0, 'Geçmiş onayı açılıp kapanınca (Vazgeç ve Sil) #ekran.scrollTop 0', [
        k3,
        k4,
        k5,
      ])
    }
    await ortam.close()
  }

  // ---------- Gizlilik ve Destek sayfaları ----------
  console.log('Gizlilik ve Destek sayfaları')
  {
    const ortam = await tarayici.newContext()
    for (const [dosya, baslik, anahtar] of [
      ['gizlilik.html', 'Gizlilik Politikası', 'patientdesk.ai'],
      ['destek.html', 'Destek', 'github.com/yilmazfatih-cyber/Deneme/issues'],
    ]) {
      for (const g of [320, 390, 1280]) {
        const s = await ortam.newPage()
        s.on(
          'console',
          (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && hatalar.push(m.text()),
        )
        s.on('pageerror', (e) => hatalar.push(String(e)))
        await s.setViewportSize({ width: g, height: 800 })
        const yanit = await s.goto(ADRES + dosya)
        const h1 = await s.locator('h1').allTextContents()
        const tasma = await s.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        bekle(
          yanit.status() === 200 && h1.length === 1 && h1[0] === baslik,
          `${dosya} açılıyor, tek h1 "${baslik}" (${g})`,
          h1,
        )
        bekle(tasma <= 0, `${dosya} ${g} px'te yatay taşma yok`, tasma)
        if (g === 320) {
          const geri = await s.locator('a[href="./index.html"]').count()
          const html = await s.content()
          bekle(
            geri === 1 && html.includes(anahtar) && !/<script/i.test(html),
            `${dosya} dönüş bağlantısı, içerik, betik yok`,
          )
        }
        await s.close()
      }
    }
    const s = await ortam.newPage()
    await s.goto(ADRES)
    await s.click('.sekme[data-sekme="ayarlar"]')
    const baglar = await s.locator('.yasal a').evaluateAll((a) => a.map((x) => x.getAttribute('href')))
    bekle(baglar.join() === './gizlilik.html,./destek.html', 'Ayarlar altında Gizlilik ve Destek bağlantıları', baglar)
    await ortam.close()
  }

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
