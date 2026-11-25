// Canlı Çeviri — web deneme sürümü
//
// Akış:  mikrofon -> konuşma tanıma (tarayıcı) -> çeviri (MyMemory, internet)
//        -> Türkçe seslendirme (Alania-2, anahtar yoksa cihazın sesi) -> kulaklık
//
// Arayüz ve cümle ayırma kuralı iPhone uygulamasıyla (../CanliCeviri) aynıdır:
// 1,2 saniye sessizlik bir cümleyi bitirir; biten cümle çevrilir, ekrana yazılır, okunur.

;(() => {
  'use strict'

  const DILLER = [
    { kod: 'en', ad: 'İngilizce', konusma: 'en-US' },
    { kod: 'de', ad: 'Almanca', konusma: 'de-DE' },
    { kod: 'fr', ad: 'Fransızca', konusma: 'fr-FR' },
    { kod: 'es', ad: 'İspanyolca', konusma: 'es-ES' },
    { kod: 'it', ad: 'İtalyanca', konusma: 'it-IT' },
    { kod: 'ru', ad: 'Rusça', konusma: 'ru-RU' },
    { kod: 'ar', ad: 'Arapça', konusma: 'ar-SA' },
  ]
  const DURAKLAMA = 1200 // bu kadar ms sessizlik = cümle bitti
  const CEVIRI_ADRESI = 'https://api.mymemory.translated.net/get'
  const CEVIRI_SINIRI = 450 // MyMemory istek başına en çok 500 bayt alır
  const ALANIA_ADRESI = 'https://voice.patientdesk.ai/v1/audio/speech'
  const ALANIA_MODELI = 'alania-v2'
  const ALANIA_SURESI = 5000 // bağlantı + yanıt + gövde, toplam (ses-hatti S5)
  const ALANIA_KESICI = 3 // art arda bu kadar hatada oturum boyunca cihazın sesi (S6)
  const ALANIA_NOTU = 'Alania sesine ulaşılamadı; cihazın sesi kullanılıyor.'
  const KESICI_NOTU = 'Alania sesine ulaşılamadı; bu oturumda cihazın sesi kullanılıyor.'
  const ANAHTAR_NOTU = 'Alania anahtarı geçersiz; bu oturumda cihazın sesi kullanılıyor.'
  const TANI_SINIRI = 300
  const SURUM = 'S01 tur 3' // Tanılama kopyasının başlığına yazılır
  // Başlat'tan sonra tarayıcı dinlemenin başladığını (start / audiostart / ilk sonuç) bu sürede bildirmezse
  // ekran "Hazırlanıyor…"da kalmasın diye "dinliyor"a geçilir ve Tanılama'ya olay=yedek yazılır.
  const HAZIRLIK_YEDEK = 5000
  const KESINTI_METNI = { okuma: 'okuma sürüyor', gizli: 'sayfa arka planda' }
  const VARSAYILAN_NOT = 'Web deneme sürümü · kulaklık durumu gösterilmez · çeviri internetten yapılır'
  const DESTEK_YOK = 'Bu tarayıcı konuşma tanımayı desteklemiyor. iPhone’da Safari ile açın.'
  const KALICI_HATALAR = {
    'not-allowed': 'Mikrofon izni verilmedi. Adres çubuğundan bu site için mikrofona izin verin.',
    'service-not-allowed':
      'Konuşma tanıma kullanılamıyor. Sayfayı Safari’de açın; Ayarlar › Genel › Klavye › Dikteyi Etkinleştir açık olmalı.',
    'audio-capture': 'Mikrofona ulaşılamadı.',
    'language-not-supported': 'Bu dil için konuşma tanıma bu cihazda yok.',
  }

  const Tanima = window.SpeechRecognition || window.webkitSpeechRecognition

  // Ayarlar yalnızca bu tarayıcıda saklanır.
  const depo = {
    oku(ad, yedek) {
      try {
        const deger = localStorage.getItem(ad)
        return deger === null ? yedek : deger
      } catch {
        return yedek
      }
    },
    yaz(ad, deger) {
      try {
        localStorage.setItem(ad, deger)
      } catch {
        // gizli sekme vb.: ayar bu oturumla sınırlı kalır
      }
    },
  }

  // Ekranların paylaştığı durum
  const d = {
    sekme: 'ceviri',
    dil: depo.oku('kaynakDil', 'en'),
    ses: depo.oku('alaniaSes', 'alania2-f1'),
    duraklat: depo.oku('okurkenDuraklat', '0') === '1',
    // Aşama tek kaynaktır (S01 KR3, ses-hatti § 6): 'duruyor' | 'hazirlaniyor' | 'dinliyor' | 'kesintide'.
    // Çizim yalnız buna (ve kesintideyken kesintiNedeni'ne: 'okuma' | 'gizli') bakar.
    asama: 'duruyor',
    kesintiNedeni: '',
    canliMetin: '',
    menuAcik: false,
    gecmisOnay: false,
    hata: Tanima ? '' : DESTEK_YOK,
    not: '',
    satirlar: [],
  }
  if (!DILLER.some((x) => x.kod === d.dil)) d.dil = 'en'

  const $ = (id) => document.getElementById(id)
  const oturumAcik = () => d.asama !== 'duruyor'
  const dilBul = (kod) => DILLER.find((x) => x.kod === kod) || DILLER[0]
  const saatBicimi = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' })
  const iki = (n) => String(n).padStart(2, '0')

  // ---------- Tanılama kaydı ----------
  // Yalnız bellekte, en çok 300 olay; sayfa kapanınca silinir. Konuşma ya da çeviri metni ASLA yazılmaz:
  // ayrıntılar yalnız dil kodu, kelime sayısı, süre, hata kodu gibi içeriksiz bilgilerdir.

  const tani = { olaylar: [], atilan: 0 }
  const TEKRAR_BIRLESEN = new Set(['tanıma açıldı', 'tanıma bitti'])

  function kaydet(olay, ayrinti = '', uyari = false) {
    const simdi = new Date()
    // Kısır döngüde aynı satır art arda yinelenirse (5 sn içinde) yeni satır yerine sayaç artar.
    if (TEKRAR_BIRLESEN.has(olay)) {
      for (const onceki of tani.olaylar.slice(-2)) {
        if (onceki.olay === olay && onceki.ayrinti === ayrinti && simdi - onceki.son < 5000) {
          onceki.tekrar += 1
          onceki.son = simdi
          taniyiGuncelle()
          return
        }
      }
    }
    tani.olaylar.push({ zaman: simdi, son: simdi, olay, ayrinti: String(ayrinti), uyari, tekrar: 1 })
    if (tani.olaylar.length > TANI_SINIRI) {
      tani.olaylar.splice(0, tani.olaylar.length - TANI_SINIRI)
      tani.atilan += 1
    }
    taniyiGuncelle()
  }

  function saatMetni(z, ms) {
    const s = `${iki(z.getHours())}:${iki(z.getMinutes())}:${iki(z.getSeconds())}`
    return ms ? s + '.' + String(z.getMilliseconds()).padStart(3, '0') : s
  }
  const ayrintiMetni = (o) => o.ayrinti + (o.tekrar > 1 ? ` ×${o.tekrar}` : '')

  // Panoya giden düz metin: başlık + kronolojik satırlar ("SS:DD:SS.mmm  olay  ayrıntı").
  function taniMetni() {
    const z = new Date()
    const fark = -z.getTimezoneOffset()
    const dilim = `UTC${fark >= 0 ? '+' : '-'}${iki(Math.floor(Math.abs(fark) / 60))}:${iki(Math.abs(fark) % 60)}`
    const satirlar = [
      'Canlı Çeviri web deneme sürümü · Tanılama kaydı',
      'Tarayıcı: ' + navigator.userAgent,
      'Sürüm: ' + SURUM,
      // Yol yazılmaz: file:// ile açılınca klasör adında kullanıcı adı olabilir (ses-hatti § 6).
      `Sayfa: ${location.protocol.replace(':', '')} · ${location.pathname.split('/').pop() || 'index.html'}`,
      `Tarih: ${z.getFullYear()}-${iki(z.getMonth() + 1)}-${iki(z.getDate())} ${saatMetni(z, false)} (${dilim})`,
      `Olay: ${tani.olaylar.length} (en çok ${TANI_SINIRI}${tani.atilan ? '; eski olaylar atıldı' : ''})`,
      'Sıra: eskiden yeniye',
      '',
    ]
    for (const o of tani.olaylar) {
      satirlar.push(`${saatMetni(o.zaman, true)}  ${o.olay}  ${ayrintiMetni(o)}`.trimEnd())
    }
    return satirlar.join('\n') + '\n'
  }

  // ---------- Görünüm ----------

  function oge(etiket, sinif, metin) {
    const e = document.createElement(etiket)
    if (sinif) e.className = sinif
    if (metin != null) e.textContent = metin
    return e
  }

  function simge(ad, boyut) {
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('width', boyut)
    svg.setAttribute('height', boyut)
    svg.setAttribute('aria-hidden', 'true')
    const kullan = document.createElementNS(ns, 'use')
    kullan.setAttribute('href', '#i-' + ad)
    svg.append(kullan)
    return svg
  }

  // Ekran okuyucuya kısa duyuru (aynı metin yinelense de okunsun diye önce boşaltılır).
  function duyur(id, metin) {
    const e = $(id)
    e.textContent = ''
    setTimeout(() => {
      e.textContent = metin
    }, 60)
  }

  // Asıl cümle + Türkçesi. Asıl cümle kendi diliyle işaretlenir (ekran okuyucu doğru sesle okusun).
  function satirGorunumu(satir, buyuk) {
    const kutu = oge('div', buyuk ? 'satir buyuk' : 'satir')
    const asil = oge('p', 'asil', satir.asil)
    asil.dir = 'auto'
    asil.lang = satir.dil
    kutu.append(asil, oge('p', 'ceviri', satir.ceviri))
    return kutu
  }

  // O an söylenen cümle ve en son çeviri (her yeni kelimede yeniden çizilir; canlı bölge değildir)
  function cizSuAn() {
    const suAn = $('suAn')
    suAn.replaceChildren()
    if (d.asama === 'dinliyor' && d.canliMetin) {
      const canli = oge('p', 'canli-metin', d.canliMetin)
      canli.dir = 'auto'
      canli.lang = d.dil
      suAn.append(canli)
    } else if (d.asama === 'dinliyor') {
      const dinliyorum = oge('p', 'dinliyorum')
      dinliyorum.append(simge('kulak', 17), 'Dinliyorum…')
      suAn.append(dinliyorum)
    } else if (d.asama === 'hazirlaniyor') {
      const hazir = oge('p', 'dinliyorum')
      hazir.append(simge('kum', 17), 'Hazırlanıyor…')
      suAn.append(hazir)
    } else if (d.asama === 'kesintide') {
      const durgun = oge('p', 'dinliyorum duraklatildi')
      durgun.append(simge('duraklat', 17), 'Duraklatıldı: ' + (KESINTI_METNI[d.kesintiNedeni] || 'bekleniyor'))
      suAn.append(durgun)
    }
    const son = d.satirlar[d.satirlar.length - 1]
    if (son) suAn.append(satirGorunumu(son, true))
    else if (d.asama === 'duruyor') {
      suAn.append(oge('p', 'ipucu', "AirPods'u takın ve aşağıdaki düğmeye dokunun. Çeviri kulaklığınızdan okunur."))
    }
  }

  function ciz() {
    for (const dugme of document.querySelectorAll('.sekme')) {
      if (dugme.dataset.sekme === d.sekme) dugme.setAttribute('aria-current', 'page')
      else dugme.removeAttribute('aria-current')
    }
    for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.dataset.sekme !== d.sekme
    const acik = d.asama !== 'duruyor' // hazırlanıyor, dinliyor ve kesintide: oturum sürüyor
    $('ekran').classList.toggle('dinliyor', acik) // KR7: duruyor dışındaki her aşamada kompakt düzen

    // Çeviri
    $('canliRozet').hidden = d.asama !== 'dinliyor' // CANLI yalnız gerçekten dinlerken (KR3)
    $('dilAd').textContent = dilBul(d.dil).ad + ' → Türkçe'
    $('dilIpucu').textContent = acik ? 'Dili değiştirmek için önce durdurun' : 'Kaynak dili değiştirmek için dokunun'
    $('dilIpucu').classList.toggle('sr', acik) // dinlerken görünmez, ekran okuyucu okur
    const serit = $('dilSeridi')
    serit.setAttribute('aria-disabled', String(acik))
    serit.setAttribute('aria-expanded', String(d.menuAcik))
    $('dilMenu').hidden = !d.menuAcik
    if (d.menuAcik) menuyuKonumla()
    for (const secenek of document.querySelectorAll('.menu-oge')) {
      secenek.setAttribute('aria-checked', String(secenek.dataset.kod === d.dil))
    }

    cizSuAn()

    $('oncekiler').hidden = d.satirlar.length < 2
    const liste = $('oncekiListe')
    liste.replaceChildren()
    d.satirlar
      .slice(0, -1)
      .slice(-3)
      .reverse()
      .forEach((satir, i) => {
        if (i) liste.append(oge('div', 'ayrac'))
        liste.append(satirGorunumu(satir, false))
      })

    $('hata').hidden = !d.hata
    $('hataMetin').textContent = d.hata
    $('not').textContent = d.not || VARSAYILAN_NOT
    $('not').classList.toggle('uyari', Boolean(d.not))

    const dugme = $('anaDugme')
    dugme.classList.toggle('durdur', acik)
    dugme.replaceChildren(simge(acik ? 'dur' : 'mikrofon', 22), acik ? 'Durdur' : 'Dinlemeyi Başlat')

    // Geçmiş
    if (d.satirlar.length === 0) d.gecmisOnay = false
    $('temizle').hidden = d.satirlar.length === 0 || d.gecmisOnay
    $('gecmisOnay').hidden = !d.gecmisOnay
    const gecmis = $('gecmisListe')
    gecmis.replaceChildren()
    if (d.satirlar.length === 0) {
      const bos = oge('div', 'bos')
      bos.append(
        simge('baloncuk', 54),
        oge('p', 'bos-baslik', 'Henüz çeviri yok'),
        oge('p', 'bos-alt', 'Çevrilen cümleler burada listelenir.'),
      )
      gecmis.append(bos)
    } else {
      for (const satir of [...d.satirlar].reverse()) {
        const kutu = oge('div', 'gecmis-oge')
        kutu.append(oge('p', 'saat', saatBicimi.format(satir.saat)), satirGorunumu(satir, false))
        gecmis.append(kutu)
      }
    }

    // Ayarlar
    for (const secenek of document.querySelectorAll('.bolumlu button')) {
      secenek.setAttribute('aria-checked', String(secenek.dataset.ses === d.ses))
    }
    $('duraklat').setAttribute('aria-checked', String(d.duraklat))
    taniyiGuncelle()
  }

  // Dil menüsü .ekran'a göre konumlanır: kaydırma alanı onu kesmez; ekrana sığmayan kısım menünün
  // içinde kaydırılır. Altta yer azsa (kısa ekran, şerit aşağı kaymış) şeridin üstüne açılır.
  function menuyuKonumla() {
    const menu = $('dilMenu')
    const e = $('ekran').getBoundingClientRect()
    const s = $('dilSeridi').getBoundingClientRect()
    const alt = e.bottom - s.bottom - 16
    const ust = s.top - e.top - 16
    menu.style.right = Math.max(0, e.right - s.right) + 'px'
    if (alt >= 230 || alt >= ust) {
      menu.style.top = s.bottom - e.top + 8 + 'px'
      menu.style.bottom = 'auto'
      menu.style.maxHeight = Math.max(120, alt) + 'px'
    } else {
      menu.style.top = 'auto'
      menu.style.bottom = e.bottom - s.top + 8 + 'px'
      menu.style.maxHeight = Math.max(120, ust) + 'px'
    }
  }

  // ---------- Tanılama görünümü ----------

  let taniAcik = false
  let kopyalandiSayaci = 0
  let silOnayi = false
  let silOnaySayaci = 0

  // Ayarlar'daki özet satırı her olayda; açıksa sayfanın listesi de güncellenir.
  function taniyiGuncelle() {
    const n = tani.olaylar.length
    $('tanilamaOzet').textContent = n ? `${n} olay · yalnız bu cihazda` : 'Henüz olay yok'
    if (taniAcik) cizTanilama()
  }

  function cizTanilama() {
    const kap = $('taniKaydir')
    const onceKonum = kap.scrollTop
    const onceYukseklik = kap.scrollHeight
    const liste = $('taniListe')
    liste.replaceChildren()
    for (let i = tani.olaylar.length - 1; i >= 0; i -= 1) {
      const o = tani.olaylar[i]
      const li = oge('li', 'tani-oge')
      const ust = oge('div', 'tani-ust')
      const ad = oge('span', 'tani-ad')
      if (o.uyari) ad.append(simge('uyari', 13), oge('span', 'sr', 'Uyarı: '))
      ad.append(o.olay)
      const saat = oge('span', 'tani-saat', saatMetni(o.zaman, false))
      saat.prepend(oge('span', 'sr', ', saat '))
      ust.append(ad, saat)
      li.append(ust)
      const ayrinti = ayrintiMetni(o)
      if (ayrinti) li.append(oge('p', 'tani-ayrinti', ayrinti))
      liste.append(li)
    }
    const bos = tani.olaylar.length === 0
    liste.hidden = bos
    $('taniBos').hidden = !bos
    $('taniSinir').hidden = tani.olaylar.length < TANI_SINIRI
    // Kullanıcı aşağı kaydırmışsa üste eklenen satırlar konumu sıçratmasın.
    if (onceKonum > 0) kap.scrollTop = onceKonum + (kap.scrollHeight - onceYukseklik)

    const kopyala = $('kopyala')
    kopyala.replaceChildren(simge(kopyalandiSayaci ? 'tik' : 'kopya', 22), kopyalandiSayaci ? 'Kopyalandı' : 'Kopyala')
    const temizle = $('taniTemizle')
    if (bos) silOnayi = false
    temizle.disabled = bos
    temizle.replaceChildren(simge('cop', 18), silOnayi ? 'Silmek için yeniden dokunun' : 'Temizle')
    temizle.setAttribute('aria-label', silOnayi ? 'Silmek için yeniden dokunun' : 'Kaydı temizle')
  }

  function tanilamayiAc() {
    taniAcik = true
    d.menuAcik = false
    $('tanilamaSayfa').hidden = false
    $('kopyaUyari').hidden = true
    $('kopyaMetin').hidden = true
    for (const id of ['paneller', 'sekmeSarici']) $(id).setAttribute('inert', '')
    $('taniKaydir').scrollTop = 0
    cizTanilama()
    $('tanilamaBaslik').focus()
  }

  function tanilamayiKapat() {
    taniAcik = false
    silOnayi = false
    clearTimeout(silOnaySayaci)
    $('tanilamaSayfa').hidden = true
    for (const id of ['paneller', 'sekmeSarici']) $(id).removeAttribute('inert')
    $('tanilamaSatiri').focus()
  }

  function kopyala() {
    const metin = taniMetni()
    const basarili = () => {
      $('kopyaUyari').hidden = true
      $('kopyaMetin').hidden = true
      clearTimeout(kopyalandiSayaci)
      kopyalandiSayaci = setTimeout(() => {
        kopyalandiSayaci = 0
        if (taniAcik) cizTanilama()
      }, 2000)
      cizTanilama()
      duyur('taniDuyuru', 'Kayıt panoya kopyalandı')
    }
    // Pano reddederse metni seçilebilir bir alanda göster (Safari'nin davranışı varsayılmaz).
    const yedek = () => {
      const alan = $('kopyaMetin')
      alan.value = metin
      alan.hidden = false
      $('kopyaUyari').hidden = false
      try {
        alan.focus()
        alan.select()
      } catch {
        // seçilemezse kullanıcı elle seçer
      }
      duyur('taniDuyuru', 'Otomatik kopyalanamadı. Metni seçip kopyalayın.')
    }
    let soz
    try {
      // Dokunuşun içinde, beklemeden çağrılır (Safari kullanıcı hareketini ister)
      soz = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(metin) : null
    } catch {
      soz = null
    }
    if (!soz) yedek()
    else Promise.resolve(soz).then(basarili, yedek)
  }

  function taniyiTemizle() {
    if (!tani.olaylar.length) return
    if (!silOnayi) {
      silOnayi = true
      clearTimeout(silOnaySayaci)
      silOnaySayaci = setTimeout(() => {
        silOnayi = false
        if (taniAcik) cizTanilama()
      }, 4000)
      cizTanilama()
      duyur('taniDuyuru', 'Silmek için yeniden dokunun')
      return
    }
    silOnayi = false
    clearTimeout(silOnaySayaci)
    tani.olaylar = []
    tani.atilan = 0
    taniyiGuncelle()
    $('tanilamaBaslik').focus()
    duyur('taniDuyuru', 'Kayıt temizlendi')
  }

  // ---------- Dinleme ----------

  let taniyici = null // etkin tanıma; null ise dinlemiyoruz
  let duraklamaSayaci = 0
  let oturumNo = 0 // durdurulunca bekleyen çeviri ve sesleri atlamak için
  let bosBitis = 0 // art arda hemen ve sonuçsuz biten tanıma sayısı
  let sonTanimaHatasi = ''
  // Dinlemeyi bekleten iki ayrı neden (ses-hatti § 6): tanıma ancak ikisi de kalkınca yeniden açılır.
  const askiNedeni = { okuma: false, gizli: false }
  const askida = () => askiNedeni.okuma || askiNedeni.gizli
  const ASKI_ADI = { okuma: 'okuma', gizli: 'gizli sekme' }
  let cevirKuyrugu = Promise.resolve() // çeviriler söylenme sırasıyla
  let sesKuyrugu = Promise.resolve() // sesler üst üste binmesin
  let ekranKilidi = null
  let sonSoz = null
  let bekleyenSesBitti = null // cihaz sesinin bekleyen sözü; Durdur hemen çözer
  let alaniaKesici = null // uçuştaki Alania isteği; Durdur iptal eder
  let alaniaHataSayisi = 0
  let alaniaKapali = false // bu oturumda Alania denenmez (devre kesici)
  let dinlemeDogrulandi = false // bu oturumda dinlemenin başladığı bir tarayıcı olayıyla görüldü mü
  let izinYazildi = false
  let baslatZamani = 0
  let ceviriKesici = null // oturumun çeviri isteklerini keser; Durdur iptal eder (ses-hatti § 6)

  // Aşamayı oturumun durumundan türetir (duruyor yalnız baslat / durdur ile değişir).
  function asamaGuncelle() {
    if (d.asama === 'duruyor') return
    if (askida()) {
      d.asama = 'kesintide'
      d.kesintiNedeni = askiNedeni.gizli ? 'gizli' : 'okuma'
    } else {
      d.asama = dinlemeDogrulandi ? 'dinliyor' : 'hazirlaniyor'
      d.kesintiNedeni = ''
    }
  }

  // Dinlemenin gerçekten başladığını gösteren ilk olay: start, audiostart, ilk sonuç ya da yedek süre.
  // Safari'de hangisinin (ve izin isteminden önce mi sonra mı) geldiği belli değil; hangisi önce gelirse
  // geçişi o yapar ve adı Tanılama'ya yazılır (cihazda okunabilsin).
  function dinlemeBasladi(t, no, olay) {
    if (t !== taniyici || t.kapali || no !== oturumNo) return
    if (!izinYazildi && (olay === 'audiostart' || olay === 'sonuç')) {
      izinYazildi = true
      kaydet('izin', 'mikrofon=verildi' + (olay === 'sonuç' ? ' (ilk sonuç geldi)' : ''))
    }
    if (dinlemeDogrulandi) return
    dinlemeDogrulandi = true
    kaydet(
      'aşama',
      `dinliyor olay=${olay} ${Math.round(performance.now() - baslatZamani)} ms`,
      olay === 'yedek', // olay gelmediyse uyarı: ekran "Dinliyorum" der ama tarayıcı bunu doğrulamadı
    )
    asamaGuncelle()
    ciz()
    if (d.asama === 'dinliyor') duyur('durumDuyuru', 'Dinleme başladı')
  }

  function baslat() {
    if (!Tanima) {
      d.hata = DESTEK_YOK
      kaydet('başlat', 'reddedildi neden=tarayıcı konuşma tanımayı desteklemiyor', true)
      ciz()
      return
    }
    oturumNo += 1
    bosBitis = 0
    sonTanimaHatasi = ''
    askiNedeni.okuma = false
    askiNedeni.gizli = false
    alaniaHataSayisi = 0
    alaniaKapali = false
    dinlemeDogrulandi = false
    izinYazildi = false
    baslatZamani = performance.now()
    ceviriKesici = new AbortController()
    cevirKuyrugu = Promise.resolve() // yeni oturum eski oturumun çevirisini beklemez
    d.asama = 'hazirlaniyor' // izin istemi ve tanımanın açılışı bu aşamadadır
    d.kesintiNedeni = ''
    d.menuAcik = false
    d.canliMetin = ''
    d.hata = ''
    d.not = ''
    kaydet('başlat', 'dil=' + d.dil)
    kaydet('ses yolu', 'bilinmiyor (tarayıcı seçer)')
    sesiAc() // dokunuş anında: tarayıcı sonraki seslendirmelere izin versin
    tanimayiBaslat()
    ekraniAcikTut()
    ciz()
    // Başlangıç olayı bu adımda geldiyse "Dinleme başladı" zaten duyuruldu.
    if (d.asama === 'hazirlaniyor') duyur('durumDuyuru', 'Hazırlanıyor')
  }

  // neden: 'düğme' ya da 'izin yok' / 'hata …' (Tanılama'ya yazılır)
  function durdur(mesaj, neden = 'düğme') {
    const calisiyordu = oturumAcik()
    oturumNo += 1
    askiNedeni.okuma = false
    askiNedeni.gizli = false
    d.asama = 'duruyor'
    d.kesintiNedeni = ''
    d.canliMetin = '' // Durdur'da yarım cümle atılır (C4)
    if (mesaj) d.hata = mesaj
    clearTimeout(duraklamaSayaci)
    tanimayiKapat(neden === 'düğme' ? 'durdur' : neden)
    if (alaniaKesici) {
      alaniaKesici.abort()
      alaniaKesici = null
      kaydet('ses', 'alania isteği iptal edildi')
    }
    if (ceviriKesici) {
      if (ceviriKesici.ucusta > 0) kaydet('çeviri', 'istek iptal edildi')
      ceviriKesici.abort()
      ceviriKesici = null
    }
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel()
    } catch {
      // seslendirme yoksa yapılacak bir şey yok
    }
    // Tarayıcı iptalde "end" vermezse bekleyen okuma sigortayı beklemesin; yeni oturum hemen okuyabilsin.
    if (bekleyenSesBitti) bekleyenSesBitti()
    calar.pause()
    ekraniBirak()
    if (calisiyordu) kaydet('durdur', 'neden=' + neden, neden !== 'düğme')
    ciz()
    if (calisiyordu && neden === 'düğme') duyur('durumDuyuru', 'Dinleme durdu')
  }

  // Yeni bir tanıma açar. Her cümleden sonra ve tanıma kendiliğinden bitince yeniden çağrılır.
  function tanimayiBaslat() {
    if (!oturumAcik() || askida()) return // gizli sekmede ya da okurken tanıma açılmaz
    const t = new Tanima()
    const no = oturumNo
    const acilis = Date.now()
    let sonucVar = false
    let hataKodu = ''
    t.lang = dilBul(d.dil).konusma
    t.continuous = true
    t.interimResults = true
    t.maxAlternatives = 1

    t.onstart = () => dinlemeBasladi(t, no, 'start')
    t.onaudiostart = () => dinlemeBasladi(t, no, 'audiostart')

    t.onresult = (olay) => {
      if (t !== taniyici || t.kapali) return // kapatılmış tanımadan kalan sonuç
      dinlemeBasladi(t, no, 'sonuç')
      let metin = ''
      for (let i = 0; i < olay.results.length; i += 1) metin += olay.results[i][0].transcript + ' '
      metin = metin.replace(/\s+/g, ' ').trim()
      if (!metin) return
      sonucVar = true
      // Sayaç yalnız metin gerçekten değişince sıfırlanır (C1); aynı metni yineleyen sonuç cümleyi uzatmaz.
      if (metin === d.canliMetin) return
      d.canliMetin = metin
      cizSuAn()
      clearTimeout(duraklamaSayaci)
      duraklamaSayaci = setTimeout(cumleyiKapat, DURAKLAMA)
    }

    t.onerror = (olay) => {
      if (t !== taniyici || t.kapali) return
      hataKodu = olay.error || 'bilinmiyor'
      sonTanimaHatasi = hataKodu
      if (hataKodu === 'not-allowed') kaydet('izin', 'mikrofon=reddedildi (not-allowed)', true)
      if (hataKodu === 'service-not-allowed') kaydet('izin', 'konuşma tanıma=reddedildi (service-not-allowed)', true)
      if (KALICI_HATALAR[hataKodu]) {
        const izin = hataKodu === 'not-allowed' || hataKodu === 'service-not-allowed'
        durdur(KALICI_HATALAR[hataKodu], izin ? 'izin yok' : 'hata tanıma ' + hataKodu)
      }
    }

    t.onend = () => {
      if (t !== taniyici) return // biz kapattık ya da durdurulduk
      taniyici = null
      clearTimeout(duraklamaSayaci)
      kaydet(
        'tanıma bitti',
        t.kapanisNedeni
          ? 'neden=' + t.kapanisNedeni
          : hataKodu
            ? 'neden=hata ' + hataKodu
            : sonucVar
              ? 'neden=son sonuç'
              : 'neden=sonuçsuz',
        Boolean(hataKodu) && !t.kapanisNedeni,
      )
      cumleyiGonder() // tanıma kendiliğinden bittiyse yarım cümle kaybolmasın
      if (!oturumAcik() || askida() || no !== oturumNo) return
      // Art arda hemen ve sonuçsuz biten tanımalar: kısır döngüye girme, nedenini söyle.
      const bos = !sonucVar && Date.now() - acilis < 2000
      bosBitis = bos ? bosBitis + 1 : 0
      if (bosBitis >= 6) {
        durdur(
          sonTanimaHatasi === 'network'
            ? 'Konuşma tanıma için internet bağlantısı gerekli.'
            : 'Konuşma tanıma başlatılamadı. Sayfayı yenileyip yeniden deneyin.',
          'hata tanıma ' + (sonTanimaHatasi || 'sonuçsuz'),
        )
        return
      }
      setTimeout(
        () => {
          if (oturumAcik() && !askida() && !taniyici && no === oturumNo) tanimayiBaslat()
        },
        bos ? 500 : 150,
      )
    }

    taniyici = t
    try {
      t.start()
      // Tarayıcı tanımanın cihazda mı sunucuda mı yapıldığını söylemez (ses-hatti § 6).
      kaydet('tanıma açıldı', t.lang + ' konum=bilinmiyor')
      if (!dinlemeDogrulandi) {
        setTimeout(() => {
          if (!dinlemeDogrulandi) dinlemeBasladi(t, no, 'yedek')
        }, HAZIRLIK_YEDEK)
      }
    } catch (hata) {
      // start() hata verirse "end" gelmez; aynı yoldan yeniden denensin
      hataKodu = 'başlatılamadı ' + ((hata && hata.name) || '')
      setTimeout(() => {
        if (t === taniyici && t.onend) t.onend()
      }, 300)
    }
  }

  // Tanımayı sessizce kapatır; yenisi açılmaz.
  function tanimayiKapat(neden) {
    const t = taniyici
    taniyici = null
    if (!t) return
    t.kapali = true
    try {
      t.abort()
    } catch {
      // zaten kapanmış
    }
    kaydet('tanıma bitti', 'neden=' + neden, neden.startsWith('hata'))
  }

  // Sessizlik oldu: cümleyi çeviriye gönder, tanımayı yenile (dinlemeye kesintisiz devam).
  function cumleyiKapat() {
    cumleyiGonder()
    const t = taniyici
    if (!t) return
    t.kapali = true // kapanırken gelebilecek son sonuçları ve "aborted" hatasını yoksay
    t.kapanisNedeni = 'sessizlik'
    try {
      t.abort()
    } catch {
      // zaten kapanmış
    }
    // abort() sonrası "end" gelmezse (sigorta): abort'u bir kez daha dene, geç gelecek "end"i sustur ve
    // yenisini aynı yoldan aç. Böylece eski tanıma canlıyken ikinci bir tanıma açılmaz (Ön-10).
    setTimeout(() => {
      if (t !== taniyici) return
      try {
        t.abort()
      } catch {
        // zaten kapanmış
      }
      const son = t.onend
      t.onend = null
      kaydet('tanıma', 'sigorta: end olayı gelmedi')
      if (son) son()
      else taniyici = null
    }, 1500)
  }

  // Ekrandaki yarım cümleyi çeviri sırasına koyar.
  function cumleyiGonder() {
    const metin = d.canliMetin.trim()
    if (!metin) return
    d.canliMetin = ''
    cizSuAn()
    const no = oturumNo
    const dil = d.dil
    const kesici = ceviriKesici
    kaydet('cümle', 'kelime=' + metin.split(/\s+/).filter(Boolean).length)
    cevirKuyrugu = cevirKuyrugu.then(() => cevirVeOku(metin, dil, no, kesici)).catch(() => {})
  }

  // Dinlemeyi geçici olarak bekletir (neden: 'okuma' ya da 'gizli'); aşama "kesintide" olur.
  // Tanılama adları iPhone ile aynı: kesinti başladı / neden eklendi / neden kalktı / bitti.
  function dinlemeyiBeklet(neden) {
    if (!oturumAcik()) return
    if (!askiNedeni[neden]) {
      kaydet('kesinti', (askida() ? 'neden eklendi=' : 'başladı neden=') + ASKI_ADI[neden])
    }
    askiNedeni[neden] = true
    clearTimeout(duraklamaSayaci)
    cumleyiGonder()
    tanimayiKapat('kesinti ' + ASKI_ADI[neden])
    asamaGuncelle()
    ciz()
  }

  // Bir bekletme nedenini kaldırır; tanıma ancak hiçbir neden kalmayınca açılır.
  function dinlemeyiSurdur(neden, no) {
    if (!askiNedeni[neden]) return
    askiNedeni[neden] = false
    kaydet('kesinti', (askida() ? 'neden kalktı=' : 'bitti neden=') + ASKI_ADI[neden])
    asamaGuncelle()
    ciz()
    if (!askida() && oturumAcik() && no === oturumNo && !taniyici) tanimayiBaslat()
  }

  // ---------- Çeviri ----------

  async function cevirVeOku(asil, dil, no, kesici) {
    if (no !== oturumNo) return
    let ceviri
    const bas = performance.now()
    try {
      ceviri = await cevir(asil, dil, kesici)
    } catch (hata) {
      if (no === oturumNo && hata.kod !== 'iptal') {
        kaydet('çeviri', 'hata ' + (hata.kod || 'bilinmiyor'), true)
        d.hata = hata.message
        ciz()
      }
      return
    }
    if (no !== oturumNo) return // bu arada durduruldu
    kaydet('çeviri', Math.round(performance.now() - bas) + ' ms')
    d.hata = ''
    d.satirlar.push({ asil, ceviri, dil, saat: new Date() })
    ciz()
    duyur('ceviriDuyuru', ceviri)
    sesKuyrugu = sesKuyrugu.then(() => oku(ceviri, no)).catch(() => {})
  }

  function ceviriHatasi(mesaj, kod) {
    const hata = new Error(mesaj)
    hata.kod = kod
    return hata
  }

  // MyMemory çağrısı: kaynak dildeki metin gider, Türkçesi döner.
  // kesici: oturumun AbortController'ı; Durdur onu keser, istek hemen biter (kod 'iptal').
  async function cevir(metin, kaynak, kesici) {
    const ceviriler = []
    for (const parca of parcala(metin, CEVIRI_SINIRI)) {
      const adres = `${CEVIRI_ADRESI}?q=${encodeURIComponent(parca)}&langpair=${kaynak}%7Ctr`
      let yanit
      let veri
      if (kesici) kesici.ucusta = (kesici.ucusta || 0) + 1
      try {
        yanit = await getir(adres, {}, 10000, kesici && kesici.signal)
        veri = await yanit.json()
      } catch (hata) {
        const kod =
          kesici && kesici.signal.aborted
            ? 'iptal'
            : hata && hata.name === 'AbortError'
              ? 'zaman aşımı'
              : yanit
                ? 'yanıt okunamadı'
                : 'ağ'
        throw ceviriHatasi('Çeviri hizmetine ulaşılamadı. İnternet bağlantınızı kontrol edin.', kod)
      } finally {
        if (kesici) kesici.ucusta -= 1
      }
      const sonuc = veri && veri.responseData ? String(veri.responseData.translatedText || '') : ''
      const kod = Number(veri && veri.responseStatus)
      if (yanit.status === 429 || kod === 429 || /MYMEMORY WARNING/i.test(sonuc)) {
        throw ceviriHatasi('Günlük ücretsiz çeviri sınırı doldu. Yarın yeniden deneyin.', 'sınır http=429')
      }
      if (!yanit.ok || kod !== 200 || !sonuc) {
        throw ceviriHatasi(
          'Çeviri yapılamadı. Biraz sonra yeniden deneyin.',
          `http=${yanit.status} durum=${Number.isNaN(kod) ? '?' : kod}`,
        )
      }
      ceviriler.push(varliklariCoz(sonuc))
    }
    return ceviriler.join(' ')
  }

  // Süre dolunca ya da dış sinyal (Durdur) gelince istek kesilir.
  function getir(adres, secenekler, sure, dis) {
    const kesici = new AbortController()
    const kes = () => kesici.abort()
    const sayac = setTimeout(kes, sure)
    if (dis) {
      if (dis.aborted) kes()
      else dis.addEventListener('abort', kes, { once: true })
    }
    return fetch(adres, { ...secenekler, signal: kesici.signal }).finally(() => {
      clearTimeout(sayac)
      if (dis) dis.removeEventListener('abort', kes)
    })
  }

  // Uzun metni, UTF-8 bayt sınırını aşmayan parçalara kelime aralarından böler.
  function parcala(metin, sinir) {
    const kodlayici = new TextEncoder()
    const parcalar = []
    let parca = ''
    for (const kelime of metin.split(' ')) {
      const aday = parca ? parca + ' ' + kelime : kelime
      if (parca && kodlayici.encode(aday).length > sinir) {
        parcalar.push(parca)
        parca = kelime
      } else {
        parca = aday
      }
    }
    if (parca) parcalar.push(parca)
    return parcalar
  }

  // Çeviri hizmeti bazen &#39; gibi HTML varlıkları döndürür.
  function varliklariCoz(metin) {
    const alan = document.createElement('textarea')
    alan.innerHTML = metin
    return alan.value
  }

  // ---------- Seslendirme ----------

  const calar = new Audio() // Alania sesi için; dokunuş anında "açılır"
  let sessizAdres = ''

  // Sıradaki çeviriyi seslendirir; bitince döner.
  async function oku(metin, no) {
    if (no !== oturumNo) return // durdurulmuş oturumdan kalma
    const duraklat = d.duraklat
    if (duraklat) dinlemeyiBeklet('okuma')
    try {
      const anahtar = depo.oku('alaniaAnahtar', '')
      let neden = ''
      if (anahtar && !alaniaKapali) {
        if (await alaniaDene(metin, anahtar, no)) return
      } else if (anahtar) neden = 'alania kapalı (bu oturum)'
      if (no === oturumNo) await cihazSesiyleOku(metin, neden)
    } finally {
      if (duraklat) dinlemeyiSurdur('okuma', no)
    }
  }

  // Alania ile okumayı dener. true: okundu ya da oturum bitti (yedeğe gerek yok); false: cihaz sesiyle okunmalı.
  async function alaniaDene(metin, anahtar, no) {
    try {
      await alaniaIleOku(metin, anahtar, no)
      if (no === oturumNo) {
        alaniaHataSayisi = 0
        if (d.not === ALANIA_NOTU) {
          d.not = '' // başarılı Alania sesinden sonra yedek notu kalkar
          ciz()
        }
      }
      return true
    } catch (hata) {
      if (no !== oturumNo) return true // Durdur iptal etti: okunmaz, hata sayılmaz
      const http = hata && hata.http
      alaniaHataSayisi += 1
      kaydet('ses', 'alania hatası ' + ((hata && hata.ayrinti) || 'bilinmiyor'), true)
      const anahtarGecersiz = http === 401 || http === 403
      if (anahtarGecersiz || alaniaHataSayisi >= ALANIA_KESICI) {
        alaniaKapali = true
        kaydet(
          'ses',
          'alania bu oturumda kapalı neden=' + (anahtarGecersiz ? 'anahtar' : alaniaHataSayisi + ' hata'),
          true,
        )
        d.not = anahtarGecersiz ? ANAHTAR_NOTU : KESICI_NOTU
      } else {
        d.not = ALANIA_NOTU
      }
      ciz()
      return false
    }
  }

  function cihazSesiyleOku(metin, neden) {
    return new Promise((bitti) => {
      const sentez = window.speechSynthesis
      if (!sentez || typeof SpeechSynthesisUtterance === 'undefined') {
        kaydet('ses', 'yok (tarayıcıda seslendirme yok)', true)
        bitti()
        return
      }
      const soz = new SpeechSynthesisUtterance(metin)
      soz.lang = 'tr-TR'
      let ses = null
      try {
        ses = sentez.getVoices().find((s) => /^tr\b/i.test(String(s.lang).replace('_', '-'))) || null
        if (ses) soz.voice = ses
      } catch {
        // ses atanamazsa tarayıcı dile göre kendi sesini seçer
      }
      // Safari ses listesini geç doldurabilir; "bulunamadı" yalnız bilgi, okuma yine denenir.
      kaydet('ses', 'cihaz' + (neden ? ' neden=' + neden : '') + (ses ? '' : ' tr-ses=listede yok'))
      sonSoz = soz // başvuru tutulmazsa bazı tarayıcılarda "end" olayı gelmiyor
      let sigorta = 0
      const bitir = () => {
        clearTimeout(sigorta)
        if (bekleyenSesBitti === bitir) bekleyenSesBitti = null
        bitti()
      }
      bekleyenSesBitti = bitir
      sigorta = setTimeout(bitir, 4000 + metin.length * 120)
      soz.onend = soz.onerror = bitir
      try {
        if (sentez.resume) sentez.resume() // bazı tarayıcılarda seslendirme "duraklamış" kalabiliyor
        sentez.speak(soz)
      } catch {
        bitir()
      }
    })
  }

  function alaniaHatasi(ayrinti, http) {
    const hata = new Error('Alania: ' + ayrinti)
    hata.ayrinti = ayrinti
    hata.http = http
    return hata
  }

  // Alania-2 API çağrısı: Türkçe metin gider, ses verisi döner ve çalınır.
  // Toplam bekleme (bağlantı + yanıt + gövde) 5 sn; Durdur isteği iptal eder.
  async function alaniaIleOku(metin, anahtar, no) {
    const kesici = new AbortController()
    alaniaKesici = kesici
    let zamanAsimi = false
    const sayac = setTimeout(() => {
      zamanAsimi = true
      kesici.abort()
    }, ALANIA_SURESI)
    const bas = performance.now()
    let veri
    try {
      let yanit
      try {
        yanit = await fetch(ALANIA_ADRESI, {
          method: 'POST',
          headers: { Authorization: `Bearer ${anahtar}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: ALANIA_MODELI, input: metin, voice: d.ses }),
          signal: kesici.signal,
        })
      } catch {
        throw alaniaHatasi(zamanAsimi ? 'zaman aşımı' : 'ağ')
      }
      if (!yanit.ok) throw alaniaHatasi('http=' + yanit.status, yanit.status)
      const ms = Math.round(performance.now() - bas)
      try {
        veri = await yanit.blob()
      } catch {
        throw alaniaHatasi(zamanAsimi ? 'zaman aşımı' : 'gövde okunamadı')
      }
      if (!veri.size) throw alaniaHatasi('boş yanıt')
      if (no === oturumNo) kaydet('ses', `alania ${ms} ms`)
    } finally {
      clearTimeout(sayac)
      if (alaniaKesici === kesici) alaniaKesici = null
    }
    if (no !== oturumNo) return
    const adres = URL.createObjectURL(veri)
    let sigorta = 0
    try {
      calar.src = adres
      try {
        await calar.play()
      } catch {
        throw alaniaHatasi('çalınamadı') // ör. tarayıcı dokunuşsuz çalmaya izin vermedi
      }
      await new Promise((bitti) => {
        calar.onended = calar.onerror = calar.onpause = bitti
        // "ended" gelmezse sıra tıkanmasın
        const sure = Number.isFinite(calar.duration) ? calar.duration * 1000 : 30000
        sigorta = setTimeout(bitti, sure + 3000)
      })
    } finally {
      clearTimeout(sigorta)
      calar.onended = calar.onerror = calar.onpause = null
      URL.revokeObjectURL(adres)
    }
  }

  // Tarayıcılar sesi yalnızca dokunuşla başlatır. Başlat'a basıldığı anda seslendirmeyi ve
  // ses çaları bir kez sessizce çalıştırır; sonraki çeviriler dokunuş olmadan okunabilir.
  function sesiAc() {
    try {
      const sentez = window.speechSynthesis
      if (sentez && typeof SpeechSynthesisUtterance !== 'undefined') {
        sentez.cancel()
        const bos = new SpeechSynthesisUtterance(' ')
        bos.volume = 0
        bos.lang = 'tr-TR'
        sonSoz = bos
        sentez.speak(bos)
      }
    } catch {
      // seslendirme yoksa çeviri yalnızca ekranda görünür
    }
    if (depo.oku('alaniaAnahtar', '')) {
      if (!sessizAdres) sessizAdres = sessizSes()
      calar.src = sessizAdres
      calar.play().catch(() => {})
    }
  }

  // 0,1 saniyelik sessiz WAV (8 kHz, 8 bit, tek kanal).
  function sessizSes() {
    const n = 800
    const bayt = new Uint8Array(44 + n)
    const gorunum = new DataView(bayt.buffer)
    const yaz = (konum, metin) => {
      for (let i = 0; i < metin.length; i += 1) bayt[konum + i] = metin.charCodeAt(i)
    }
    yaz(0, 'RIFF')
    gorunum.setUint32(4, 36 + n, true)
    yaz(8, 'WAVEfmt ')
    gorunum.setUint32(16, 16, true)
    gorunum.setUint16(20, 1, true)
    gorunum.setUint16(22, 1, true)
    gorunum.setUint32(24, 8000, true)
    gorunum.setUint32(28, 8000, true)
    gorunum.setUint16(32, 1, true)
    gorunum.setUint16(34, 8, true)
    yaz(36, 'data')
    gorunum.setUint32(40, n, true)
    bayt.fill(128, 44)
    return URL.createObjectURL(new Blob([bayt], { type: 'audio/wav' }))
  }

  // ---------- Ekran kilidi ve arka plan ----------

  async function ekraniAcikTut() {
    if (!navigator.wakeLock || (ekranKilidi && !ekranKilidi.released)) return
    const no = oturumNo
    try {
      const kilit = await navigator.wakeLock.request('screen')
      // İstek beklenirken Durdur'a basıldıysa kilidi hemen bırak (yoksa serbest kalmaz).
      if (!oturumAcik() || no !== oturumNo || (ekranKilidi && !ekranKilidi.released)) {
        kilit.release()
        return
      }
      ekranKilidi = kilit
      if (kilit.addEventListener) {
        kilit.addEventListener('release', () => {
          if (ekranKilidi === kilit) ekranKilidi = null
        })
      }
    } catch {
      // desteklenmiyorsa ekran kendi süresinde kararır
    }
  }

  function ekraniBirak() {
    try {
      if (ekranKilidi) ekranKilidi.release()
    } catch {
      // zaten bırakılmış
    }
    ekranKilidi = null
  }

  // Sekme arka plana gidince dinleme bekler, dönünce (başka bekletme nedeni yoksa) sürer.
  document.addEventListener('visibilitychange', () => {
    const gorunur = document.visibilityState === 'visible'
    kaydet('sekme', gorunur ? 'göründü' : 'gizlendi')
    if (!oturumAcik()) return
    if (gorunur) {
      ekraniAcikTut()
      dinlemeyiSurdur('gizli', oturumNo)
    } else {
      dinlemeyiBeklet('gizli')
    }
  })

  // ---------- Olaylar ----------

  const menu = $('dilMenu')
  for (const dil of DILLER) {
    const secenek = oge('button', 'menu-oge')
    secenek.type = 'button'
    secenek.setAttribute('role', 'menuitemradio')
    secenek.dataset.kod = dil.kod
    const tik = simge('tik', 20)
    tik.classList.add('menu-tik')
    secenek.append(tik, dil.ad)
    menu.append(secenek)
  }

  $('anaDugme').addEventListener('click', () => {
    if (oturumAcik()) durdur()
    else baslat()
  })

  $('dilSeridi').addEventListener('click', (olay) => {
    olay.stopPropagation()
    if (oturumAcik()) return
    d.menuAcik = !d.menuAcik
    ciz()
  })

  menu.addEventListener('click', (olay) => {
    olay.stopPropagation()
    const secenek = olay.target.closest('.menu-oge')
    if (!secenek) return
    d.dil = secenek.dataset.kod
    depo.yaz('kaynakDil', d.dil)
    d.menuAcik = false
    ciz()
    $('dilSeridi').focus()
  })

  document.addEventListener('click', () => {
    if (!d.menuAcik) return
    d.menuAcik = false
    ciz()
  })

  // Menü açıkken ekran kayar ya da boyut değişirse menü şeridin yanında kalsın.
  const yenidenKonumla = () => {
    if (d.menuAcik) menuyuKonumla()
  }
  for (const kap of document.querySelectorAll('.kaydir')) kap.addEventListener('scroll', yenidenKonumla)
  window.addEventListener('resize', yenidenKonumla)

  document.addEventListener('keydown', (olay) => {
    if (taniAcik) {
      if (olay.key === 'Escape') {
        olay.preventDefault()
        tanilamayiKapat()
      } else if (olay.key === 'Tab') {
        // Odak sayfanın içinde döner
        const odaklar = [...$('tanilamaSayfa').querySelectorAll('button, textarea, [tabindex="-1"]')].filter(
          (e) => !e.disabled && !e.hidden && e.offsetParent !== null,
        )
        const ilk = odaklar[0]
        const son = odaklar[odaklar.length - 1]
        if (olay.shiftKey && document.activeElement === ilk) {
          olay.preventDefault()
          son.focus()
        } else if (!olay.shiftKey && document.activeElement === son) {
          olay.preventDefault()
          ilk.focus()
        } else if (!$('tanilamaSayfa').contains(document.activeElement)) {
          olay.preventDefault()
          ilk.focus()
        }
      }
      return
    }
    if (olay.key !== 'Escape' || !d.menuAcik) return
    d.menuAcik = false
    ciz()
    $('dilSeridi').focus()
  })

  for (const dugme of document.querySelectorAll('.sekme')) {
    dugme.addEventListener('click', () => {
      d.sekme = dugme.dataset.sekme
      d.menuAcik = false
      d.gecmisOnay = false
      ciz()
    })
  }

  // Geçmişi temizle: onay ister (KR9)
  $('temizle').addEventListener('click', () => {
    d.gecmisOnay = true
    ciz()
    $('gecmisVazgec').focus()
  })
  $('gecmisVazgec').addEventListener('click', () => {
    d.gecmisOnay = false
    ciz()
    $('temizle').focus()
  })
  $('gecmisSil').addEventListener('click', () => {
    d.satirlar = []
    d.gecmisOnay = false
    ciz()
    $('gecmisBaslik').focus()
    duyur('durumDuyuru', 'Geçmiş silindi')
  })

  $('tanilamaSatiri').addEventListener('click', tanilamayiAc)
  $('tanilamaBitti').addEventListener('click', tanilamayiKapat)
  $('kopyala').addEventListener('click', kopyala)
  $('taniTemizle').addEventListener('click', taniyiTemizle)

  $('anahtar').value = depo.oku('alaniaAnahtar', '')
  $('anahtar').addEventListener('input', (olay) => depo.yaz('alaniaAnahtar', olay.target.value.trim()))

  for (const secenek of document.querySelectorAll('.bolumlu button')) {
    secenek.addEventListener('click', () => {
      d.ses = secenek.dataset.ses
      depo.yaz('alaniaSes', d.ses)
      ciz()
    })
  }

  $('duraklat').addEventListener('click', () => {
    d.duraklat = !d.duraklat
    depo.yaz('okurkenDuraklat', d.duraklat ? '1' : '0')
    ciz()
  })

  ciz()
})()
