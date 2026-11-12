/**
 * Mesai hesap motoru: 4857 sayılı İş Kanunu'nun genel kurallarına göre çalışma süresi, fazla çalışma ve ihlal denetimi.
 * Saf ES modülüdür (DOM, ağ ve "bugün" yok); tarayıcıda app.js, testlerde node --test kullanır.
 *
 * Kanun: md. 41 (fazla çalışma %50, fazla sürelerle çalışma %25, yıllık 270 saat, serbest zaman), md. 44 ve 47 (UBGT),
 * md. 46 (hafta tatili), md. 63 (haftalık 45, günlük 11 saat, denkleştirme), md. 68 (ara dinlenmesi), md. 69 (gece).
 * Kanunda yazmayan yöntemler (225 böleni, günlük aşımın fazla çalışma sayılması, yarım gün UBGT) kodda ve metinlerde
 * "uygulama" diye işaretlidir. Hukuki tavsiye değildir.
 */

export const KURALLAR = Object.freeze({
  haftalikAzamiDk: 45 * 60, // md. 63
  gunlukAzamiDk: 11 * 60, // md. 63: "günde onbir saati aşmamak koşulu ile"
  geceAzamiDk: 7.5 * 60, // md. 69
  yillikFazlaCalismaSaat: 270, // md. 41
  varsayilanSaatBoleni: 225, // Yargıtay uygulaması (kanunda yazmaz): 30 gün x 7,5 saat, haftada 45 saatlik tam süre
  gunBoleni: 30, // uygulama: günlük ücret = aylık / 30
  fazlaCalismaZammi: 1.5, // md. 41: %50
  fazlaSurelerleZammi: 1.25, // md. 41: %25
  serbestZamanFc: 1.5, // md. 41: fazla çalışma saati başına 1 sa 30 dk
  serbestZamanFsc: 1.25, // md. 41: fazla sürelerle çalışma saati başına 1 sa 15 dk
  haftaTatiliDk: 24 * 60, // md. 46: 7 günde kesintisiz 24 saat
  denklestirmeHafta: 8, // md. 63: 2 ay; en kısa iki ay 59 gün, 8 hafta 56 gün, 9 hafta 63 gün
  denklestirmeTisHafta: 17, // md. 63: TİS ile 4 ay; en kısa dört ay 120 gün, 17 hafta 119 gün
  yarimGunUbgtDk: 13 * 60, // 2429 sayılı Kanun: arifeler ve 28 Ekim saat 13:00'ten itibaren tatil
})

export const GUN_ADLARI = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
export const UBGT_ADLARI = Object.freeze({ 0: 'Hayır', 0.5: 'Yarım gün', 1: 'Tam gün' })

export const VARSAYILAN_AYARLAR = Object.freeze({
  aylikBrut: 0,
  sozlesmeHaftalikSaat: 45,
  saatBoleni: KURALLAR.varsayilanSaatBoleni,
  denklestirme: false,
  molaYontemi: 'girilen', // 'girilen' | 'en-az-yasal'
  gunlukAsimFazlaCalisma: true, // Yargıtay uygulaması (doğrulanmadı); false: yalnız haftalık 45 saat aşımı
  oncekiFazlaCalismaSaat: 0,
  donemBaslangic: '', // isteğe bağlı 'YYYY-AA-GG': 1. haftanın pazartesisi
  devirBitis: '', // isteğe bağlı 'SS:DD': 1. haftadan önce başlayıp pazartesiye taşan vardiyanın bitişi
  geceBaslangic: '20:00',
  geceBitis: '06:00',
})

const GUN_DK = 24 * 60
const HAFTA_DK = 7 * GUN_DK
const GUN_MS = 24 * 60 * 60 * 1000

/** 'SS:DD' → gece yarısından itibaren dakika; geçersizse NaN. '24:00' gün sonu olarak kabul edilir. */
export function dakikaya(metin) {
  const eslesme = /^(\d{1,2}):(\d{2})$/.exec(String(metin ?? '').trim())
  if (!eslesme) return NaN
  const [saat, dakika] = [Number(eslesme[1]), Number(eslesme[2])]
  if (dakika > 59 || saat > 24 || (saat === 24 && dakika > 0)) return NaN
  return saat * 60 + dakika
}

/** 570 → '9 sa 30 dk' */
export function saatMetni(dk) {
  const tam = Math.round(dk)
  const saat = Math.floor(tam / 60)
  const dakika = tam % 60
  return dakika ? `${saat} sa ${dakika} dk` : `${saat} sa`
}

const paraBicimi = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })
const ondalikBicimi = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const sayiBicimi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })

/** Türk lirası biçimi: 1234.5 → '₺1.234,50' */
export function tlMetni(tutar) {
  return paraBicimi.format(tutar)
}

/** Bir ondalık basamak, Türkçe ayraçlarla: 1092 → '1.092,0' */
export function ondalikMetni(sayi) {
  return ondalikBicimi.format(sayi)
}

/** Gerektiği kadar ondalık: 37.5 → '37,5', 225 → '225' */
export function sayiMetni(sayi) {
  return sayiBicimi.format(sayi)
}

/** 'YYYY-AA-GG' → o günün UTC gece yarısı (ms); geçersizse NaN. Saat dilimi kullanılmaz: tarih yalnız takvim günüdür. */
export function tarihe(metin) {
  const eslesme = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(metin ?? '').trim())
  if (!eslesme) return NaN
  const [yil, ay, gun] = [Number(eslesme[1]), Number(eslesme[2]), Number(eslesme[3])]
  const ms = Date.UTC(yil, ay - 1, gun)
  const t = new Date(ms)
  return t.getUTCFullYear() === yil && t.getUTCMonth() === ay - 1 && t.getUTCDate() === gun ? ms : NaN
}

/** UTC ms → 'GG.AA.YYYY' (UTC bileşenleriyle; saat dilimi kayması olmaz). */
export function tarihMetni(ms) {
  const t = new Date(ms)
  const iki = (n) => String(n).padStart(2, '0')
  return `${iki(t.getUTCDate())}.${iki(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`
}

/** md. 68: işin süresine göre en az ara dinlenmesi (dakika). */
export function yasalAraDinlenme(netDk) {
  if (netDk <= 0) return 0
  if (netDk <= 4 * 60) return 15
  if (netDk <= 7.5 * 60) return 30
  return 60
}

/**
 * Mola girilmemişse md. 68'e uyan en kısa ara dinlenmesi. Eşik net süreye bağlı olduğundan iki bantta basamak yerine
 * kalan süre düşülür: ör. brüt 8 sa 1 dk'da 31 dk molayla net 7,5 sa olur ve 30 dk yeter (60 dk gerekmez).
 */
export function enAzYasalMola(brutDk) {
  if (brutDk <= 0) return 0
  let mola = 60
  if (brutDk <= 4 * 60 + 15) mola = 15
  else if (brutDk <= 4 * 60 + 30) mola = brutDk - 4 * 60
  else if (brutDk <= 7.5 * 60 + 30) mola = 30
  else if (brutDk <= 7.5 * 60 + 60) mola = brutDk - 7.5 * 60
  return Math.min(mola, brutDk)
}

/** md. 69: gece en geç 20:00'de başlar, en erken 06:00'da biter ve her halde en çok 11 saat sürer. */
export function geceDonemiUygunMu(baslangic, bitis) {
  const gb = dakikaya(baslangic)
  const gs = dakikaya(bitis)
  if (Number.isNaN(gb) || Number.isNaN(gs)) return false
  return gb <= 20 * 60 && gs >= 6 * 60 && gs + GUN_DK - gb <= 11 * 60
}

/** UBGT işareti: 0 (yok), 0.5 (yarım gün: arifeler ve 28 Ekim, 13:00'ten sonrası), 1 (tam gün). Eski kayıtta true/false. */
export function ubgtDegeri(deger) {
  if (deger === true || deger === 1 || deger === '1') return 1
  if (deger === 0.5 || deger === '0.5') return 0.5
  return 0
}

function kesisim(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
}

/** [bas, bit) aralığının gece dönemine düşen dakikası (bitiş ertesi güne taşabilir). Ayarlar önceden doğrulanmıştır. */
function geceDakikasi(bas, bit, ayarlar) {
  const gb = dakikaya(ayarlar.geceBaslangic)
  const gs = dakikaya(ayarlar.geceBitis)
  let toplam = 0
  for (let gun = -1; gun <= 1; gun++) {
    toplam += kesisim(bas, bit, gun * GUN_DK + gb, gun * GUN_DK + gs + GUN_DK)
  }
  return toplam
}

export function bosGun() {
  return { calisti: false, baslangic: '09:00', bitis: '18:00', molaDk: 60, ubgt: 0 }
}

export function bosHafta() {
  return { gunler: GUN_ADLARI.map(() => bosGun()) }
}

/** 996: 09:00-21:00, haftada 6 gün. Mola Türk hukukundaki en az süre (1 saat) alındı. */
export function ornek996Haftasi() {
  return {
    gunler: GUN_ADLARI.map((_, i) =>
      i < 6 ? { calisti: true, baslangic: '09:00', bitis: '21:00', molaDk: 60, ubgt: 0 } : bosGun(),
    ),
  }
}

/** Kayıttan gelen (eski ya da bozuk) haftayı 7 günlük geçerli biçime getirir; bilinmeyen alanlar taşınmaz. */
export function haftayiDuzelt(hafta) {
  const gunler = Array.isArray(hafta?.gunler) ? hafta.gunler : []
  return {
    gunler: GUN_ADLARI.map((_, i) => {
      const kayit = gunler[i] && typeof gunler[i] === 'object' ? gunler[i] : {}
      const v = bosGun()
      return {
        calisti: Boolean(kayit.calisti ?? v.calisti),
        baslangic: typeof kayit.baslangic === 'string' ? kayit.baslangic : v.baslangic,
        bitis: typeof kayit.bitis === 'string' ? kayit.bitis : v.bitis,
        molaDk: kayit.molaDk ?? v.molaDk,
        ubgt: ubgtDegeri(kayit.ubgt),
      }
    }),
  }
}

function ihlal(kod, madde, mesaj) {
  return { kod, madde, mesaj }
}

const sayiya = (deger, yedek) => {
  const sayi = Number(deger)
  return Number.isFinite(sayi) ? sayi : yedek
}
const doluMu = (deger) => String(deger ?? '').trim() !== ''

/** Kullanıcı ayarlarını doğrular; geçersiz değerin yerine varsayılanı koyar ve bunu uyarı olarak bildirir. */
export function ayarlariDuzelt(girdi = {}) {
  const a = { ...VARSAYILAN_AYARLAR, ...(girdi && typeof girdi === 'object' ? girdi : {}) }
  const ihlaller = []
  const uyarilar = []
  a.aylikBrut = Math.max(sayiya(a.aylikBrut, 0), 0)
  a.oncekiFazlaCalismaSaat = Math.max(sayiya(a.oncekiFazlaCalismaSaat, 0), 0)

  let sozlesme = sayiya(a.sozlesmeHaftalikSaat, 0)
  if (sozlesme <= 0) sozlesme = 45 // boş ya da geçersiz: tam süre
  if (sozlesme > 45) {
    const mesaj = `sözleşmedeki haftalık süre ${sayiMetni(sozlesme)} saat; en çok 45 saat olabilir (45 alındı)`
    ihlaller.push(ihlal('SOZLESME_45', 'md. 63', mesaj))
  }
  a.sozlesmeHaftalikSaat = Math.min(Math.max(sozlesme, 1), 45)

  const bolen = sayiya(a.saatBoleni, 0)
  if (bolen > 0) a.saatBoleni = bolen
  else {
    a.saatBoleni = KURALLAR.varsayilanSaatBoleni
    uyarilar.push('Saat ücreti böleni boş ya da geçersiz; 225 alındı.')
  }
  if (a.sozlesmeHaftalikSaat < 45 && a.saatBoleni === KURALLAR.varsayilanSaatBoleni) {
    const s = sayiMetni(a.sozlesmeHaftalikSaat)
    uyarilar.push(
      `Saat ücreti 225'e bölünerek hesaplandı. Sözleşmeniz haftada ${s} saat olduğu için bölen farklı olabilir ` +
        `(ör. 5 × ${s} = ${sayiMetni(5 * a.sozlesmeHaftalikSaat)}; doğrulanmadı); ayarlardan değiştirebilirsiniz.`,
    )
  }

  a.denklestirme = Boolean(a.denklestirme)
  a.gunlukAsimFazlaCalisma = Boolean(a.gunlukAsimFazlaCalisma)
  a.molaYontemi = a.molaYontemi === 'en-az-yasal' ? 'en-az-yasal' : 'girilen'

  if (!geceDonemiUygunMu(a.geceBaslangic, a.geceBitis)) {
    uyarilar.push(
      "Gece dönemi ayarı boş ya da md. 69'a uymuyor (gece en geç 20:00'de başlar, en erken 06:00'da biter, " +
        'en çok 11 saat sürer); hesapta 20:00–06:00 kullanıldı.',
    )
    a.geceBaslangic = VARSAYILAN_AYARLAR.geceBaslangic
    a.geceBitis = VARSAYILAN_AYARLAR.geceBitis
  }

  a.pazartesi = null // 1. haftanın pazartesisi (UTC ms); yalnız tarih girildiyse
  if (doluMu(a.donemBaslangic)) {
    const ms = tarihe(a.donemBaslangic)
    if (Number.isNaN(ms)) {
      uyarilar.push('Dönem başlangıç tarihi geçersiz (YYYY-AA-GG); tarih kullanılmadı.')
    } else {
      const haftaGunu = (new Date(ms).getUTCDay() + 6) % 7 // 0 = pazartesi
      a.pazartesi = ms - haftaGunu * GUN_MS
      if (haftaGunu) {
        uyarilar.push(`Dönem başlangıcı pazartesi değil; o haftanın pazartesisi (${tarihMetni(a.pazartesi)}) alındı.`)
      }
    }
  }

  a.devirDk = 0 // 1. haftanın pazartesisinde önceki vardiyanın sürdüğü dakika
  if (doluMu(a.devirBitis)) {
    const dk = dakikaya(a.devirBitis)
    if (Number.isNaN(dk)) uyarilar.push('Önceki haftadan taşan vardiyanın bitişi SS:DD biçiminde olmalı; kullanılmadı.')
    else a.devirDk = dk
  }
  return { ayarlar: a, ihlaller, uyarilar }
}

function bosGunSonucu() {
  return {
    calisti: false,
    brutDk: 0,
    girilenMolaDk: 0,
    dusulenMolaDk: 0,
    netDk: 0,
    geceDk: 0,
    geceCalismasi: false,
    asimDk: 0, // günlük 11 saati (gece çalışmasında 7,5 saati) aşan süre
    ubgt: 0, // işaret: 0 | 0.5 | 1
    ubgtGun: 0, // ilave ücrete esas gün: yarım günde 13:00'ten sonra çalışılmadıysa 0
    nobet24: false,
    aralik: null,
    ihlaller: [],
    hatalar: [],
  }
}

/** Ayarlar doğrulanmış kabul edilir (bkz. ayarlariDuzelt). */
function gunHesabi(gun, a) {
  const sonuc = bosGunSonucu()
  if (!gun?.calisti) return sonuc
  const bas = dakikaya(gun.baslangic)
  const bit = dakikaya(gun.bitis)
  if (Number.isNaN(bas) || Number.isNaN(bit) || bas >= GUN_DK) {
    sonuc.hatalar.push('saatler SS:DD biçiminde olmalı; bu gün hesaba katılmadı')
    return sonuc
  }
  // Bitiş başlangıçtan küçükse vardiya gece yarısını aşar; ikisi eşitse 24 saatlik nöbettir (ör. 08:00-08:00).
  const brut = bit > bas ? bit - bas : bit + GUN_DK - bas
  const girilenMola = Math.min(Math.max(Number(gun.molaDk) || 0, 0), brut)
  const dusulen = a.molaYontemi === 'en-az-yasal' ? Math.max(girilenMola, enAzYasalMola(brut)) : girilenMola
  const net = brut - dusulen
  const gece = geceDakikasi(bas, bas + brut, a)
  const geceCalismasi = gece * 2 > brut
  const ubgt = ubgtDegeri(gun.ubgt)
  const ubgtGun = ubgt === 0.5 && bas + brut <= KURALLAR.yarimGunUbgtDk ? 0 : ubgt
  Object.assign(sonuc, { calisti: true, brutDk: brut, girilenMolaDk: girilenMola, dusulenMolaDk: dusulen })
  Object.assign(sonuc, { netDk: net, geceDk: gece, geceCalismasi, ubgt, ubgtGun, nobet24: brut === GUN_DK })
  sonuc.aralik = [bas, bas + brut]
  sonuc.asimDk = Math.max(0, net - KURALLAR.gunlukAzamiDk, geceCalismasi ? net - KURALLAR.geceAzamiDk : 0)

  const gereken = yasalAraDinlenme(net)
  if (girilenMola < gereken) {
    const mesaj = `ara dinlenmesi ${girilenMola} dk; ${saatMetni(net)} çalışmada en az ${gereken} dk olmalı`
    sonuc.ihlaller.push(ihlal('ARA_DINLENME', 'md. 68', mesaj))
  }
  if (net > KURALLAR.gunlukAzamiDk) {
    const mesaj = `günlük çalışma ${saatMetni(net)}; en çok 11 saat olabilir`
    sonuc.ihlaller.push(ihlal('GUNLUK_11', 'md. 63', mesaj))
  }
  if (geceCalismasi && net > KURALLAR.geceAzamiDk) {
    const mesaj =
      `gece çalışması ${saatMetni(net)}; en çok 7,5 saat olabilir ` +
      '(turizm, özel güvenlik ve sağlıkta işçinin yazılı onayıyla istisna var)'
    sonuc.ihlaller.push(ihlal('GECE_7_5', 'md. 69', mesaj))
  }
  return sonuc
}

export function gunuHesapla(gun, ayarlar = VARSAYILAN_AYARLAR) {
  return gunHesabi(gun, ayarlariDuzelt(ayarlar).ayarlar)
}

/**
 * md. 46: haftanın (pazartesi 00:00 - pazar 24:00) içindeki en uzun kesintisiz dinlenme. devirDk: önceki haftadan
 * taşan çalışmanın pazartesi bittiği dakika; o saate kadar dinlenme sayılmaz.
 */
function enUzunDinlenme(gunler, devirDk = 0) {
  let onceki = Math.max(0, devirDk)
  let enUzun = 0
  gunler.forEach((g, i) => {
    if (!g.aralik) return
    enUzun = Math.max(enUzun, i * GUN_DK + g.aralik[0] - onceki)
    onceki = Math.max(onceki, i * GUN_DK + g.aralik[1])
  })
  return Math.max(enUzun, HAFTA_DK - onceki)
}

/**
 * Fazla çalışma: haftalık (denkleştirmede dönemlik) 45 saat aşımı ile günlük aşımlar toplamından büyük olanı
 * (Yargıtay uygulaması; doğrulanmadı). Fazla sürelerle çalışma: fazla çalışmaya girmeyen ve sözleşme süresi ile
 * 45 saat arasında kalan süre (md. 41). Aynı saat iki kez ödenmez.
 */
function fazlaSureler(netDk, haftaSayisi, sozlesmeSaat, gunlukAsimDk = 0) {
  const yasalDk = KURALLAR.haftalikAzamiDk * haftaSayisi
  const sozlesmeDk = sozlesmeSaat * 60 * haftaSayisi
  const haftalikAsimDk = Math.max(0, netDk - yasalDk)
  const fcDk = Math.max(haftalikAsimDk, gunlukAsimDk)
  const fscDk = Math.min(Math.max(0, netDk - fcDk - sozlesmeDk), yasalDk - sozlesmeDk)
  return { fcDk, fscDk, haftalikAsimDk }
}

function haftaHesabi(hafta, a, no, devirDk) {
  const gunler = haftayiDuzelt(hafta).gunler.map((g) => gunHesabi(g, a))
  // Çakışan vardiya (ör. pazartesi 20:00-08:00 ve salı 07:00) fiziksel olarak imkânsızdır: sonraki gün hesaba katılmaz.
  let sonBitis = Math.max(0, devirDk)
  gunler.forEach((g, i) => {
    if (!g.aralik) return
    const bas = i * GUN_DK + g.aralik[0]
    if (bas < sonBitis) {
      gunler[i] = bosGunSonucu()
      gunler[i].hatalar.push(`önceki vardiyayla ${saatMetni(sonBitis - bas)} çakışıyor; bu gün hesaba katılmadı`)
      return
    }
    sonBitis = i * GUN_DK + g.aralik[1]
  })
  const toplam = (alan) => gunler.reduce((t, g) => t + g[alan], 0)
  const netDk = toplam('netDk')
  const gunlukAsimDk = toplam('asimDk')
  const { fcDk, fscDk, haftalikAsimDk } = fazlaSureler(
    netDk,
    1,
    a.sozlesmeHaftalikSaat,
    a.gunlukAsimFazlaCalisma ? gunlukAsimDk : 0,
  )
  const ihlaller = gunler.flatMap((g, i) =>
    g.ihlaller.map((x) => ({ ...x, hafta: no, gun: i, mesaj: `${no}. hafta ${GUN_ADLARI[i]}: ${x.mesaj}` })),
  )
  const dinlenme = enUzunDinlenme(gunler, devirDk)
  if (dinlenme < KURALLAR.haftaTatiliDk) {
    const mesaj = `${no}. hafta: en uzun kesintisiz dinlenme ${saatMetni(dinlenme)}; 7 günde en az 24 saat olmalı`
    ihlaller.push({ ...ihlal('HAFTA_TATILI', 'md. 46', mesaj), hafta: no, gun: null })
  }
  return {
    no,
    pazartesi: a.pazartesi === null ? null : a.pazartesi + (no - 1) * 7 * GUN_MS,
    gunler,
    netDk,
    gunlukAsimDk,
    haftalikAsimDk,
    fcDk: a.denklestirme ? 0 : fcDk, // denkleştirmede dönem toplamına bakılır
    fscDk: a.denklestirme ? 0 : fscDk,
    ubgtGun: toplam('ubgtGun'),
    enUzunDinlenmeDk: dinlenme,
    sonBitisDk: sonBitis, // pazartesi 00:00'dan itibaren; 7 günü aşarsa sonraki haftaya taşar
    ihlaller,
  }
}

export function haftayiHesapla(hafta, ayarlar = VARSAYILAN_AYARLAR, no = 1, devirDk = 0) {
  return haftaHesabi(hafta, ayarlariDuzelt(ayarlar).ayarlar, no, devirDk)
}

/** md. 41'deki 270 saatlik yıllık sınıra bu tempoyla ne zaman ulaşılacağı. "Yıl" takvim yılı varsayılır. */
function yillikSinirNotu(a, haftalikOrt) {
  const onceki = a.oncekiFazlaCalismaSaat
  const hafta = Math.floor((KURALLAR.yillikFazlaCalismaSaat - onceki) / haftalikOrt) + 1 // dönemin başından itibaren
  const tempo = `Bu tempoda (haftada ${ondalikMetni(haftalikOrt)} saat fazla çalışma)`
  const oncekiEk = onceki > 0 ? `, bu yıl önceki ${sayiMetni(onceki)} saat dahil` : ''
  if (a.pazartesi !== null) {
    const yil = new Date(a.pazartesi).getUTCFullYear()
    const yilSonu = Date.UTC(yil, 11, 31)
    const asimHaftasi = a.pazartesi + (hafta - 1) * 7 * GUN_MS
    if (asimHaftasi > yilSonu) {
      const kalanHafta = ((yilSonu - a.pazartesi) / GUN_MS + 1) / 7
      const yilSonuToplam = onceki + haftalikOrt * kalanHafta
      return (
        `${tempo} ${yil} sonuna kadar toplam yaklaşık ${ondalikMetni(yilSonuToplam)} saat olur${oncekiEk}; ` +
        '270 saatlik yıllık sınır bu takvim yılında aşılmaz.'
      )
    }
    return `${tempo} 270 saatlik yıllık sınır dönemin ${hafta}. haftasında (${tarihMetni(asimHaftasi)} ile başlayan hafta) aşılır.`
  }
  if (hafta > 52) {
    const toplam52 = onceki + haftalikOrt * 52
    return `${tempo} 52 hafta sürse bile toplam ${ondalikMetni(toplam52)} saat olur${oncekiEk}; 270 saatlik yıllık sınır aşılmaz.`
  }
  return (
    `${tempo} 270 saatlik yıllık sınır dönemin başından itibaren ${hafta}. haftada aşılır; ` +
    'yıl sonuna kalan hafta sayısıyla karşılaştırın ya da dönem başlangıç tarihini girin.'
  )
}

const yuvarla = (tutar) => Math.round(tutar * 100) / 100

export function donemiHesapla(haftalar, ayarlarGirdi = {}) {
  const { ayarlar: a, ihlaller, uyarilar } = ayarlariDuzelt(ayarlarGirdi)
  const liste = Array.isArray(haftalar) && haftalar.length ? haftalar : [bosHafta()]
  let devir = a.devirDk
  const sonucHaftalar = liste.map((h, i) => {
    const sonuc = haftaHesabi(h, a, i + 1, devir)
    devir = Math.max(0, sonuc.sonBitisDk - HAFTA_DK)
    return sonuc
  })
  const n = sonucHaftalar.length
  const toplam = (alan) => sonucHaftalar.reduce((t, h) => t + h[alan], 0)
  const netDk = toplam('netDk')
  const gunlukAsimDk = toplam('gunlukAsimDk')
  const gunler = sonucHaftalar.flatMap((h) => h.gunler)
  let fcDk = toplam('fcDk')
  let fscDk = toplam('fscDk')
  const notlar = []

  if (a.denklestirme) {
    ;({ fcDk, fscDk } = fazlaSureler(netDk, n, a.sozlesmeHaftalikSaat, a.gunlukAsimFazlaCalisma ? gunlukAsimDk : 0))
    if (n > KURALLAR.denklestirmeTisHafta) {
      uyarilar.push(
        'Girilen dönem 4 aydan uzun: denkleştirme dönemi en çok 2 aydır, toplu sözleşmeyle 4 aya kadar uzatılabilir ' +
          '(md. 63; turizm sektöründe farklı süreler var, doğrulanmadı).',
      )
    } else if (n > KURALLAR.denklestirmeHafta) {
      uyarilar.push(
        'Girilen dönem 2 aydan uzun: denkleştirme dönemi en çok 2 aydır, ancak toplu sözleşmeyle 4 aya kadar ' +
          'uzatılabilir (md. 63).',
      )
    }
  }
  if (a.pazartesi !== null) {
    const sonGun = a.pazartesi + (n * 7 - 1) * GUN_MS
    if (new Date(sonGun).getUTCFullYear() !== new Date(a.pazartesi).getUTCFullYear()) {
      uyarilar.push(
        `Dönem yıl sonunu aşıyor (son gün ${tarihMetni(sonGun)}); 270 saat denetimi tüm dönemi aynı yıla sayar.`,
      )
    }
  }
  let hataSayisi = 0
  for (const h of sonucHaftalar) {
    h.gunler.forEach((g, i) => {
      hataSayisi += g.hatalar.length ? 1 : 0
      for (const x of g.hatalar) uyarilar.push(`${h.no}. hafta ${GUN_ADLARI[i]}: ${x}.`)
    })
  }

  ihlaller.push(...sonucHaftalar.flatMap((h) => h.ihlaller))
  const yillikSaat = a.oncekiFazlaCalismaSaat + fcDk / 60
  if (yillikSaat > KURALLAR.yillikFazlaCalismaSaat) {
    const mesaj = `bu yılki fazla çalışma ${ondalikMetni(yillikSaat)} saat; en çok 270 saat olabilir`
    ihlaller.push(ihlal('YILLIK_270', 'md. 41', mesaj))
    notlar.push(
      '270 saati aşan fazla çalışma da hesaba katıldı: sınır işvereni bağlar, yapılan çalışmanın ücreti yine ödenir ' +
        '(Yargıtay uygulaması; doğrulanmadı).',
    )
  } else if (fcDk > 0) {
    notlar.push(yillikSinirNotu(a, fcDk / 60 / n))
  }

  if (gunlukAsimDk > 0) {
    notlar.push(
      a.gunlukAsimFazlaCalisma
        ? 'Günlük 11 saati (gece çalışmasında 7,5 saati) aşan süre de fazla çalışma sayıldı; haftalık (denkleştirmede ' +
            'dönemlik) 45 saat aşımıyla karşılaştırılıp büyük olan alındı (Yargıtay uygulaması; doğrulanmadı).'
        : 'Günlük 11 saat ve gece 7,5 saat aşımı yalnız ihlal olarak gösterildi; Yargıtay bunları haftalık 45 saat ' +
            'aşılmasa da fazla çalışma sayabilir (doğrulanmadı).',
    )
  }
  if (gunler.some((g) => g.dusulenMolaDk > g.girilenMolaDk)) {
    notlar.push(
      "Girilenden uzun mola düşülen günlerde md. 68'e uyan en kısa ara dinlenmesi alındı; mahkemeler farklı süre " +
        'düşebilir (doğrulanmadı).',
    )
  }
  if (fcDk + fscDk > 0) notlar.push('Fazla çalışma için işçinin yazılı onayı gerekir (Fazla Çalışma Yönetmeliği).')
  if (ihlaller.some((x) => x.kod === 'HAFTA_TATILI')) {
    notlar.push(
      'Hafta tatilinde çalışılan gün için ayrıca ücret istenebilir (Yargıtay uygulaması; oran ve yöntem ' +
        'doğrulanmadı); bu kalem hesaba katılmadı.',
    )
  }
  const ubgtGun = toplam('ubgtGun')
  if (ubgtGun > 0) {
    notlar.push(
      'UBGT günlerinde çalışılan her gün için ayrıca bir günlük ücret ödenir (md. 47); yarım gün tatilde (arifeler, ' +
        "28 Ekim) 13:00'ten sonra çalışıldıysa yarım günlük ücret alındı (uygulama; doğrulanmadı). Bu ilave ücret " +
        'serbest zamana çevrilmez.',
    )
  }
  if (gunler.some((g) => g.ubgt > 0)) {
    notlar.push("UBGT'de çalışma için toplu ya da iş sözleşmesinde hüküm ya da işçinin onayı gerekir (md. 44).")
  }
  const erkenBiten = gunler.filter((g) => g.ubgt === 0.5 && g.ubgtGun === 0).length
  if (erkenBiten > 0) {
    notlar.push(
      `Yarım gün UBGT işaretli ${erkenBiten} günde çalışma 13:00'ten önce bittiği için ilave ücret hesaplanmadı.`,
    )
  }
  if (gunler.some((g) => g.geceDk > 0)) {
    notlar.push('Gece çalışması için kanunda ayrı zam yoktur; toplu ya da iş sözleşmesine bakın.')
  }

  const saatUcreti = a.aylikBrut / a.saatBoleni
  const gunlukUcret = a.aylikBrut / KURALLAR.gunBoleni
  const ucret = {
    saatUcreti: yuvarla(saatUcreti),
    fazlaCalisma: yuvarla((fcDk / 60) * saatUcreti * KURALLAR.fazlaCalismaZammi),
    fazlaSurelerle: yuvarla((fscDk / 60) * saatUcreti * KURALLAR.fazlaSurelerleZammi),
    ubgt: yuvarla(ubgtGun * gunlukUcret),
  }
  ucret.toplam = yuvarla(ucret.fazlaCalisma + ucret.fazlaSurelerle + ucret.ubgt)
  return {
    ayarlar: a,
    haftalar: sonucHaftalar,
    netDk,
    fcDk,
    fscDk,
    gunlukAsimDk,
    ubgtGun,
    ucret,
    serbestZamanDk: fcDk * KURALLAR.serbestZamanFc + fscDk * KURALLAR.serbestZamanFsc, // md. 41
    hataSayisi,
    ihlaller,
    uyarilar,
    notlar,
  }
}

/** CSV hücresi: ayraç/tırnak/satır sonu varsa tırnakla; formülle başlayan metni etkisizleştir (CSV enjeksiyonu). */
export function csvHucresi(deger) {
  let metin = String(deger ?? '')
  if (/^[=+\-@\t\r]/.test(metin)) metin = `'${metin}`
  return /[";\r\n]/.test(metin) ? `"${metin.replaceAll('"', '""')}"` : metin
}

const ondalik = (sayi) => sayi.toFixed(2).replace('.', ',')

/** Türkçe Excel için ';' ayraçlı, ondalık virgüllü CSV (BOM'u indirme sırasında arayüz ekler). */
export function csvOlustur(haftalar, sonuc) {
  const satirlar = [
    [
      'Hafta',
      'Gün',
      'Tarih',
      'Çalıştı',
      'Başlangıç',
      'Bitiş',
      'Girilen mola (dk)',
      'Düşülen mola (dk)',
      'Net (saat)',
      'Gece (saat)',
      'Günlük aşım (saat)',
      'UBGT',
      'İhlaller ve hatalar',
    ],
  ]
  sonuc.haftalar.forEach((hafta, h) => {
    const girdiler = haftayiDuzelt(Array.isArray(haftalar) ? haftalar[h] : undefined).gunler
    hafta.gunler.forEach((gun, g) => {
      const girdi = girdiler[g]
      satirlar.push([
        hafta.no,
        GUN_ADLARI[g],
        hafta.pazartesi === null ? '' : tarihMetni(hafta.pazartesi + g * GUN_MS),
        girdi.calisti ? 'Evet' : 'Hayır',
        girdi.calisti ? girdi.baslangic : '',
        girdi.calisti ? girdi.bitis : '',
        girdi.calisti ? girdi.molaDk : '',
        gun.calisti ? gun.dusulenMolaDk : '',
        ondalik(gun.netDk / 60),
        ondalik(gun.geceDk / 60),
        ondalik(gun.asimDk / 60),
        girdi.calisti ? UBGT_ADLARI[girdi.ubgt] : '',
        [...gun.ihlaller.map((x) => `${x.madde}: ${x.mesaj}`), ...gun.hatalar.map((x) => `Giriş hatası: ${x}`)].join(
          '; ',
        ),
      ])
    })
  })
  const u = sonuc.ucret
  satirlar.push(
    [],
    ['Toplam net çalışma (saat)', ondalik(sonuc.netDk / 60)],
    ['Fazla çalışma (saat, %50)', ondalik(sonuc.fcDk / 60)],
    ['Fazla sürelerle çalışma (saat, %25)', ondalik(sonuc.fscDk / 60)],
    [`Saat ücreti (TL, aylık brüt / ${sayiMetni(sonuc.ayarlar.saatBoleni)})`, ondalik(u.saatUcreti)],
    ['Fazla çalışma ücreti (TL)', ondalik(u.fazlaCalisma)],
    ['Fazla sürelerle çalışma ücreti (TL)', ondalik(u.fazlaSurelerle)],
    ['Bu iki ücret yerine işçi isterse serbest zaman (saat, 6 ay içinde)', ondalik(sonuc.serbestZamanDk / 60)],
    ['UBGT ilave ücreti (TL, serbest zamana çevrilmez)', ondalik(u.ubgt)],
    ['Toplam tahmini brüt alacak (TL)', ondalik(u.toplam)],
    ...sonuc.ihlaller.map((x) => ['İhlal', x.madde, x.mesaj]),
    ...sonuc.uyarilar.map((x) => ['Uyarı', x]),
    ...sonuc.notlar.map((x) => ['Not', x]),
    [],
    ['Hukuki tavsiye değildir; mevzuat ve toplu sözleşme hükümleri farklılık yaratabilir.'],
  )
  return satirlar.map((satir) => satir.map(csvHucresi).join(';')).join('\r\n') + '\r\n'
}
