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
  const VARSAYILAN_NOT = 'Web deneme sürümü · çeviri internet üzerinden yapılır'
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
    calisiyor: false,
    canliMetin: '',
    menuAcik: false,
    hata: Tanima ? '' : DESTEK_YOK,
    not: '',
    satirlar: [],
  }
  if (!DILLER.some((x) => x.kod === d.dil)) d.dil = 'en'

  const $ = (id) => document.getElementById(id)
  const dilBul = (kod) => DILLER.find((x) => x.kod === kod) || DILLER[0]
  const saatBicimi = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' })

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

  // Asıl cümle + Türkçesi
  function satirGorunumu(satir, buyuk) {
    const kutu = oge('div', buyuk ? 'satir buyuk' : 'satir')
    const asil = oge('p', 'asil', satir.asil)
    asil.dir = 'auto'
    kutu.append(asil, oge('p', 'ceviri', satir.ceviri))
    return kutu
  }

  // O an söylenen cümle ve en son çeviri (her yeni kelimede yeniden çizilir)
  function cizSuAn() {
    const suAn = $('suAn')
    suAn.replaceChildren()
    if (d.canliMetin) {
      const canli = oge('p', 'canli-metin', d.canliMetin)
      canli.dir = 'auto'
      suAn.append(canli)
    } else if (d.calisiyor) {
      const dinliyorum = oge('p', 'dinliyorum')
      dinliyorum.append(simge('kulak', 17), 'Dinliyorum…')
      suAn.append(dinliyorum)
    }
    const son = d.satirlar[d.satirlar.length - 1]
    if (son) suAn.append(satirGorunumu(son, true))
    else if (!d.calisiyor) {
      suAn.append(oge('p', 'ipucu', "AirPods'u takın ve aşağıdaki düğmeye dokunun. Çeviri kulaklığınızdan okunur."))
    }
  }

  function ciz() {
    for (const dugme of document.querySelectorAll('.sekme')) {
      if (dugme.dataset.sekme === d.sekme) dugme.setAttribute('aria-current', 'page')
      else dugme.removeAttribute('aria-current')
    }
    for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.dataset.sekme !== d.sekme

    // Çeviri
    $('canliRozet').hidden = !d.calisiyor
    $('dilAd').textContent = dilBul(d.dil).ad + ' → Türkçe'
    $('dilIpucu').textContent = d.calisiyor
      ? 'Dili değiştirmek için önce durdurun'
      : 'Kaynak dili değiştirmek için dokunun'
    const serit = $('dilSeridi')
    serit.setAttribute('aria-disabled', String(d.calisiyor))
    serit.setAttribute('aria-expanded', String(d.menuAcik))
    $('dilMenu').hidden = !d.menuAcik
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
    $('hata').textContent = d.hata
    $('not').textContent = d.not || VARSAYILAN_NOT
    $('not').classList.toggle('uyari', Boolean(d.not))

    const dugme = $('anaDugme')
    dugme.classList.toggle('durdur', d.calisiyor)
    dugme.replaceChildren(simge(d.calisiyor ? 'dur' : 'mikrofon', 22), d.calisiyor ? 'Durdur' : 'Dinlemeyi Başlat')

    // Geçmiş
    $('temizle').hidden = d.satirlar.length === 0
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
  }

  // ---------- Dinleme ----------

  let taniyici = null // etkin tanıma; null ise dinlemiyoruz
  let duraklamaSayaci = 0
  let oturumNo = 0 // durdurulunca bekleyen çeviri ve sesleri atlamak için
  let bosBitis = 0 // art arda hemen ve sonuçsuz biten tanıma sayısı
  let sonTanimaHatasi = ''
  let askida = false // çeviri okunurken ya da sekme arka plandayken dinleme bekliyor
  let cevirKuyrugu = Promise.resolve() // çeviriler söylenme sırasıyla
  let sesKuyrugu = Promise.resolve() // sesler üst üste binmesin
  let ekranKilidi = null
  let sonSoz = null

  function baslat() {
    if (!Tanima) {
      d.hata = DESTEK_YOK
      ciz()
      return
    }
    oturumNo += 1
    bosBitis = 0
    sonTanimaHatasi = ''
    askida = false
    d.calisiyor = true
    d.menuAcik = false
    d.canliMetin = ''
    d.hata = ''
    d.not = ''
    sesiAc() // dokunuş anında: tarayıcı sonraki seslendirmelere izin versin
    tanimayiBaslat()
    ekraniAcikTut()
    ciz()
  }

  function durdur(mesaj) {
    oturumNo += 1
    askida = false
    d.calisiyor = false
    d.canliMetin = ''
    if (mesaj) d.hata = mesaj
    clearTimeout(duraklamaSayaci)
    tanimayiKapat()
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel()
    } catch {
      // seslendirme yoksa yapılacak bir şey yok
    }
    calar.pause()
    ekraniBirak()
    ciz()
  }

  // Yeni bir tanıma açar. Her cümleden sonra ve tanıma kendiliğinden bitince yeniden çağrılır.
  function tanimayiBaslat() {
    const t = new Tanima()
    const no = oturumNo
    const acilis = Date.now()
    let sonucVar = false
    t.lang = dilBul(d.dil).konusma
    t.continuous = true
    t.interimResults = true
    t.maxAlternatives = 1

    t.onresult = (olay) => {
      if (t !== taniyici || t.kapali) return // kapatılmış tanımadan kalan sonuç
      let metin = ''
      for (let i = 0; i < olay.results.length; i += 1) metin += olay.results[i][0].transcript + ' '
      metin = metin.replace(/\s+/g, ' ').trim()
      if (!metin) return
      sonucVar = true
      d.canliMetin = metin
      cizSuAn()
      // Her yeni kelimede sayacı sıfırla; sessizlik olunca cümleyi kapat.
      clearTimeout(duraklamaSayaci)
      duraklamaSayaci = setTimeout(cumleyiKapat, DURAKLAMA)
    }

    t.onerror = (olay) => {
      if (t !== taniyici) return
      sonTanimaHatasi = olay.error || ''
      if (KALICI_HATALAR[sonTanimaHatasi]) durdur(KALICI_HATALAR[sonTanimaHatasi])
    }

    t.onend = () => {
      if (t !== taniyici) return // biz kapattık ya da durdurulduk
      taniyici = null
      clearTimeout(duraklamaSayaci)
      cumleyiGonder() // tanıma kendiliğinden bittiyse yarım cümle kaybolmasın
      if (!d.calisiyor || askida || no !== oturumNo) return
      // Art arda hemen ve sonuçsuz biten tanımalar: kısır döngüye girme, nedenini söyle.
      const bos = !sonucVar && Date.now() - acilis < 2000
      bosBitis = bos ? bosBitis + 1 : 0
      if (bosBitis >= 6) {
        durdur(
          sonTanimaHatasi === 'network'
            ? 'Konuşma tanıma için internet bağlantısı gerekli.'
            : 'Konuşma tanıma başlatılamadı. Sayfayı yenileyip yeniden deneyin.',
        )
        return
      }
      setTimeout(
        () => {
          if (d.calisiyor && !askida && !taniyici && no === oturumNo) tanimayiBaslat()
        },
        bos ? 500 : 150,
      )
    }

    taniyici = t
    try {
      t.start()
    } catch {
      // start() hata verirse "end" gelmez; aynı yoldan yeniden denensin
      setTimeout(() => t.onend(), 300)
    }
  }

  // Tanımayı sessizce kapatır; yenisi açılmaz.
  function tanimayiKapat() {
    const t = taniyici
    taniyici = null
    if (!t) return
    t.kapali = true
    try {
      t.abort()
    } catch {
      // zaten kapanmış
    }
  }

  // Sessizlik oldu: cümleyi çeviriye gönder, tanımayı yenile (dinlemeye kesintisiz devam).
  function cumleyiKapat() {
    cumleyiGonder()
    const t = taniyici
    if (!t) return
    t.kapali = true // kapanırken gelebilecek son sonuçları yoksay
    try {
      t.abort()
    } catch {
      // zaten kapanmış
    }
    // abort() sonrası "end" gelmezse sigorta olarak elle çağır; yenisini o açar.
    setTimeout(() => {
      if (t === taniyici) t.onend()
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
    cevirKuyrugu = cevirKuyrugu.then(() => cevirVeOku(metin, dil, no)).catch(() => {})
  }

  // Dinlemeyi geçici olarak bekletir (çeviri okunurken ya da sekme arka plana gidince).
  function dinlemeyiBeklet() {
    askida = true
    clearTimeout(duraklamaSayaci)
    cumleyiGonder()
    tanimayiKapat()
  }

  function dinlemeyiSurdur(no) {
    if (!askida) return
    askida = false
    if (d.calisiyor && no === oturumNo && !taniyici) tanimayiBaslat()
  }

  // ---------- Çeviri ----------

  async function cevirVeOku(asil, dil, no) {
    if (no !== oturumNo) return
    let ceviri
    try {
      ceviri = await cevir(asil, dil)
    } catch (hata) {
      if (no === oturumNo) {
        d.hata = hata.message
        ciz()
      }
      return
    }
    if (no !== oturumNo) return // bu arada durduruldu
    d.hata = ''
    d.satirlar.push({ asil, ceviri, saat: new Date() })
    ciz()
    sesKuyrugu = sesKuyrugu.then(() => oku(ceviri, no)).catch(() => {})
  }

  // MyMemory çağrısı: kaynak dildeki metin gider, Türkçesi döner.
  async function cevir(metin, kaynak) {
    const ceviriler = []
    for (const parca of parcala(metin, CEVIRI_SINIRI)) {
      const adres = `${CEVIRI_ADRESI}?q=${encodeURIComponent(parca)}&langpair=${kaynak}%7Ctr`
      let yanit
      let veri
      try {
        yanit = await getir(adres, {}, 10000)
        veri = await yanit.json()
      } catch {
        throw new Error('Çeviri hizmetine ulaşılamadı. İnternet bağlantınızı kontrol edin.')
      }
      const sonuc = veri && veri.responseData ? String(veri.responseData.translatedText || '') : ''
      const kod = Number(veri && veri.responseStatus)
      if (yanit.status === 429 || kod === 429 || /MYMEMORY WARNING/i.test(sonuc)) {
        throw new Error('Günlük ücretsiz çeviri sınırı doldu. Yarın yeniden deneyin.')
      }
      if (!yanit.ok || kod !== 200 || !sonuc) throw new Error('Çeviri yapılamadı. Biraz sonra yeniden deneyin.')
      ceviriler.push(varliklariCoz(sonuc))
    }
    return ceviriler.join(' ')
  }

  function getir(adres, secenekler, sure) {
    const kesici = new AbortController()
    const sayac = setTimeout(() => kesici.abort(), sure)
    return fetch(adres, { ...secenekler, signal: kesici.signal }).finally(() => clearTimeout(sayac))
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
    if (duraklat) dinlemeyiBeklet()
    try {
      const anahtar = depo.oku('alaniaAnahtar', '')
      if (anahtar) {
        try {
          await alaniaIleOku(metin, anahtar, no)
          return
        } catch {
          // Alania'ya ulaşılamadıysa sessiz kalma; nedenini de göster
          if (no === oturumNo) {
            d.not = 'Alania sesine ulaşılamadı; cihazın sesi kullanılıyor.'
            ciz()
          }
        }
      }
      if (no === oturumNo) await cihazSesiyleOku(metin)
    } finally {
      if (duraklat) dinlemeyiSurdur(no)
    }
  }

  function cihazSesiyleOku(metin) {
    return new Promise((bitti) => {
      const sentez = window.speechSynthesis
      if (!sentez || typeof SpeechSynthesisUtterance === 'undefined') {
        bitti()
        return
      }
      const soz = new SpeechSynthesisUtterance(metin)
      soz.lang = 'tr-TR'
      const ses = sentez.getVoices().find((s) => /^tr\b/i.test(String(s.lang).replace('_', '-')))
      try {
        if (ses) soz.voice = ses
      } catch {
        // ses atanamazsa tarayıcı dile göre kendi sesini seçer
      }
      sonSoz = soz // başvuru tutulmazsa bazı tarayıcılarda "end" olayı gelmiyor
      const sigorta = setTimeout(bitti, 4000 + metin.length * 120)
      soz.onend = soz.onerror = () => {
        clearTimeout(sigorta)
        bitti()
      }
      if (sentez.resume) sentez.resume() // bazı tarayıcılarda seslendirme "duraklamış" kalabiliyor
      sentez.speak(soz)
    })
  }

  // Alania-2 API çağrısı: Türkçe metin gider, ses verisi döner ve çalınır.
  async function alaniaIleOku(metin, anahtar, no) {
    const yanit = await getir(
      ALANIA_ADRESI,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${anahtar}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ALANIA_MODELI, input: metin, voice: d.ses }),
      },
      15000,
    )
    if (!yanit.ok) throw new Error('Alania yanıtı: ' + yanit.status)
    const veri = await yanit.blob()
    if (no !== oturumNo) return
    const adres = URL.createObjectURL(veri)
    try {
      calar.src = adres
      await calar.play()
      await new Promise((bitti) => {
        calar.onended = calar.onerror = calar.onpause = bitti
      })
    } finally {
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
    try {
      if (navigator.wakeLock) ekranKilidi = await navigator.wakeLock.request('screen')
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

  // Sekme arka plana gidince dinleme bekler, dönünce kaldığı yerden sürer.
  document.addEventListener('visibilitychange', () => {
    if (!d.calisiyor) return
    if (document.visibilityState === 'visible') {
      ekraniAcikTut()
      dinlemeyiSurdur(oturumNo)
    } else {
      dinlemeyiBeklet()
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
    if (d.calisiyor) durdur()
    else baslat()
  })

  $('dilSeridi').addEventListener('click', (olay) => {
    olay.stopPropagation()
    if (d.calisiyor) return
    d.menuAcik = !d.menuAcik
    ciz()
  })

  menu.addEventListener('click', (olay) => {
    const secenek = olay.target.closest('.menu-oge')
    if (!secenek) return
    olay.stopPropagation()
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

  document.addEventListener('keydown', (olay) => {
    if (olay.key !== 'Escape' || !d.menuAcik) return
    d.menuAcik = false
    ciz()
    $('dilSeridi').focus()
  })

  for (const dugme of document.querySelectorAll('.sekme')) {
    dugme.addEventListener('click', () => {
      d.sekme = dugme.dataset.sekme
      d.menuAcik = false
      ciz()
    })
  }

  $('temizle').addEventListener('click', () => {
    d.satirlar = []
    ciz()
  })

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
