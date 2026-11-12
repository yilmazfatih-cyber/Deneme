// Sadaka Taşı — sandık kuralları. Saf fonksiyonlar; tarayıcıda ve Node'da aynı çalışır.
// Tüm tutarlar kuruş cinsinden tam sayıdır (1 TL = 100 kuruş); kayan nokta hatası olmaz.
// Aylar 'YYYY-AA' metnidir. Kuralların insan dilindeki karşılığı: IS-PLANI.md → "4. Sandık kuralları".
//
// Hukuki tasarım: sandık bir derneğin üyelerine yardımlaşma sandığıdır. Yardım bir hak ya da bakiye değildir;
// kurul ihtiyaca göre karar verir, tavan aidat tutarına bağlı değildir, ödenen aidat iade edilmez.
//
// Para akışı (her kuruş defterde iz bırakır):
//   üye aidatı ┬─ %20 sadaka payı ─────────────────────────────────┐
//              ├─ %70 dayanışma havuzu ── kara gün destekleri      │
//              │        └─ rezerv hedefinin üstü (ay sonu) ─────────┼─→ sadaka alanlarına dağıtım
//              └─ %10 işletme gideri                                │
//                                                                   ┘

/** TL'yi kuruşa çevirir: TL(12.5) → 1250 */
export const TL = (n) => Math.round(n * 100)

export const VARSAYILAN_KURALLAR = Object.freeze({
  /** En küçük aylık aidat. */
  asgariAidat: TL(150),
  /** Her aidatın bölünüşü. Toplamı 1 olmalı. */
  oranlar: Object.freeze({ sadaka: 0.2, havuz: 0.7, isletme: 0.1 }),
  /** Kesintisiz ödenmiş bu kadar aydan sonra talep açılır (yeni üye ve ara verip dönen üye için). */
  beklemeAy: 3,
  /**
   * [ödenmiş ay eşiği, 12 aylık yardım tavanı]. Herkes için aynıdır; aidat tutarına bağlı değildir.
   * Kurul her yıl enflasyona ve havuzun durumuna göre günceller.
   */
  tavanlar: Object.freeze([Object.freeze([3, TL(10_000)]), Object.freeze([12, TL(20_000)])]),
  /** Onaylanan yardım bu kadar ay tavandan düşülür, sonra tavana geri döner. */
  pencereAy: 12,
  /** En küçük talep tutarı. */
  asgariTalep: TL(250),
  /** Hızlı inceleme: tutar ≤ hizliTavan ve ≤ kalan tavan × hizliLimitOrani. */
  hizliTavan: TL(5_000),
  hizliLimitOrani: 0.5,
  /** Bir ayda havuzdan ödenebilecek en büyük pay (ay başı bakiyesinin oranı). Afet kuralı. */
  aylikOdemeOrani: 0.3,
  /** Rezerv hedefi: o ayki havuz girişinin bu katı (≈ 3 aylık giriş). Üstü ay sonunda sadakaya aktarılır. */
  rezervKati: 3,
})

export const KATEGORILER = Object.freeze([
  {
    id: 'saglik',
    ad: 'Sağlık',
    aciklama: 'Ameliyat, tedavi, ilaç, tıbbi cihaz',
    belgeler: ['Fatura veya reçete', 'Epikriz ya da doktor raporu'],
  },
  {
    id: 'cenaze',
    ad: 'Cenaze',
    aciklama: 'Defin, nakil ve taziye giderleri',
    belgeler: ['Ölüm belgesi (e-Devlet)', 'Masraf faturası'],
  },
  {
    id: 'afet',
    ad: 'Afet',
    aciklama: 'Deprem, sel, yangın, fırtına',
    belgeler: ['AFAD, itfaiye ya da muhtarlık kaydı', 'Hasar fotoğrafları'],
  },
  {
    id: 'is',
    ad: 'İş kaybı',
    aciklama: 'İşten çıkarılma, iş yerinin kapanması',
    belgeler: ['SGK işten ayrılış kaydı (e-Devlet barkodlu)'],
  },
  {
    id: 'kaza',
    ad: 'Kaza',
    aciklama: 'Trafik, iş ya da ev kazası',
    belgeler: ['Tutanak veya hastane kaydı'],
  },
  {
    id: 'onarim',
    ad: 'Zorunlu onarım',
    aciklama: 'Su baskını, kombi, çatı gibi ertelenemeyen onarım',
    belgeler: ['Usta teklifi veya fatura', 'Fotoğraf'],
  },
  {
    id: 'diger',
    ad: 'Diğer acil durum',
    aciklama: 'Beklenmedik ve ertelenemeyen başka bir gider',
    belgeler: ['Durumu gösteren bir belge'],
  },
])

export const SADAKA_ALANLARI = Object.freeze([
  { id: 'acil', ad: 'En acil ihtiyaç', aciklama: 'Kurul her ay en acil alanı seçer' },
  { id: 'gida', ad: 'Gıda', aciklama: 'Gıda kolisi, aşevi, askıda ekmek' },
  { id: 'egitim', ad: 'Eğitim', aciklama: 'Burs, kırtasiye, yurt' },
  { id: 'saglik', ad: 'Sağlık', aciklama: 'İlaç, tedavi, hasta yakını' },
  { id: 'barinma', ad: 'Barınma', aciklama: 'Kira, yakacak, fatura' },
  { id: 'afet', ad: 'Afet', aciklama: 'Afet bölgelerine yardım' },
])

export const DURUMLAR = Object.freeze({
  inceleme: 'İncelemede',
  belge: 'Ek belge bekleniyor',
  sirada: 'Onaylandı, ödeme sırada',
  odendi: 'Ödendi',
  'uygun-degil': 'Uygun görülmedi',
  'geri-cekildi': 'Geri çekildi',
})

/** Kurulun "uygun görülmedi" kararında seçebileceği, suçlamayan gerekçeler. */
export const GEREKCELER = Object.freeze([
  'Talep, sandığın kara gün türlerinden birine uymuyor.',
  'Belgeler talebi doğrulamaya yetmedi; yeni belgeyle tekrar başvurabilirsiniz.',
  'Aynı gider başka bir kaynaktan (sigorta, SGK, kurum) karşılanmış görünüyor.',
  'Olay, bekleme süresi dolmadan önce yaşanmış görünüyor.',
])

const ACIK = new Set(['inceleme', 'belge'])

/** Kural ihlali: kullanıcıya gösterilecek, suçlamayan cümleler taşır. */
export class KuralHatasi extends Error {
  constructor(hatalar) {
    super(hatalar.join(' '))
    this.name = 'KuralHatasi'
    this.hatalar = hatalar
  }
}

// ---------- Yardımcılar ----------

export function topla(dizi) {
  let t = 0
  for (const x of dizi) t += x
  return t
}

/**
 * En büyük kalan yöntemi: tutarı ağırlıklara göre kuruş kuruş dağıtır; toplam her zaman tam tutardır.
 * agirliklar: { anahtar: ağırlık (>0) } → { anahtar: kuruş }
 */
export function dagit(tutar, agirliklar) {
  if (!Number.isInteger(tutar) || tutar < 0) throw new Error('Tutar kuruş cinsinden, eksi olmayan tam sayı olmalı')
  const anahtarlar = Object.keys(agirliklar).filter((a) => Number.isFinite(agirliklar[a]) && agirliklar[a] > 0)
  if (anahtarlar.length === 0) return {}
  const toplamAgirlik = topla(anahtarlar.map((a) => agirliklar[a]))
  const sonuc = {}
  const kalanlar = []
  let verilen = 0
  for (const a of anahtarlar) {
    const tam = (tutar * agirliklar[a]) / toplamAgirlik
    const taban = Math.floor(tam)
    sonuc[a] = taban
    verilen += taban
    kalanlar.push({ a, r: tam - taban })
  }
  let artan = tutar - verilen
  kalanlar.sort((x, y) => y.r - x.r || anahtarlar.indexOf(x.a) - anahtarlar.indexOf(y.a))
  for (let i = 0; artan > 0 && i < kalanlar.length; i++, artan--) sonuc[kalanlar[i].a] += 1
  return sonuc
}

/** Bir payı sadaka / havuz / işletme olarak böler; parçaların toplamı her zaman paydır. */
export function paylariBol(tutar, k = VARSAYILAN_KURALLAR) {
  return { sadaka: 0, havuz: 0, isletme: 0, ...dagit(tutar, k.oranlar) }
}

// ---------- Ay hesapları ----------

const AY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/
const AY_ADLARI = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
]

export function ayGecerli(ay) {
  return typeof ay === 'string' && AY_RE.test(ay)
}

function ayParcala(ay) {
  const m = AY_RE.exec(String(ay))
  if (!m) throw new Error(`Geçersiz ay: ${ay}`)
  return [Number(m[1]), Number(m[2])]
}

export function ayEkle(ay, n) {
  const [y, m] = ayParcala(ay)
  const t = y * 12 + (m - 1) + n
  const yy = Math.floor(t / 12)
  return `${yy}-${String(t - yy * 12 + 1).padStart(2, '0')}`
}

/** a'dan b'ye kaç ay geçer: ayFarki('2026-01', '2026-03') === 2 */
export function ayFarki(a, b) {
  const [y1, m1] = ayParcala(a)
  const [y2, m2] = ayParcala(b)
  return y2 * 12 + m2 - (y1 * 12 + m1)
}

/** '2026-11' → 'Kasım 2026'; kisa: 'Kas 26' */
export function ayAdi(ay, { kisa = false } = {}) {
  const [y, m] = ayParcala(ay)
  const ad = AY_ADLARI[m - 1]
  return kisa ? `${ad.slice(0, 3)} ${String(y).slice(2)}` : `${ad} ${y}`
}

// ---------- Para biçimleri ----------

const SAYI = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const SAYI_KURUSLU = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const SAYI_TEK_ONDALIK = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })

/** 125075 → '1.250,75 TL'; 125000 → '1.250 TL' */
export function paraYaz(kurus, { isaret = false } = {}) {
  const k = Math.round(kurus ?? 0)
  const mutlak = Math.abs(k)
  const metin = mutlak % 100 === 0 ? SAYI.format(mutlak / 100) : SAYI_KURUSLU.format(mutlak / 100)
  const on = k < 0 ? '−' : isaret && k > 0 ? '+' : ''
  return `${on}${metin} TL`
}

/** Büyük tutarları kısaltır: '2,1 milyon TL', '412 bin TL'. */
export function paraKisa(kurus) {
  const tl = Math.round((kurus ?? 0) / 100)
  const m = Math.abs(tl)
  if (m >= 1e9) return `${SAYI_TEK_ONDALIK.format(tl / 1e9)} milyar TL`
  if (m >= 1e6) return `${SAYI_TEK_ONDALIK.format(tl / 1e6)} milyon TL`
  if (m >= 1e4) return `${SAYI.format(Math.round(tl / 1e3))} bin TL`
  return `${SAYI.format(tl)} TL`
}

export function sayiYaz(n) {
  return SAYI.format(Math.round(n))
}

/**
 * Kullanıcının yazdığı tutarı kuruşa çevirir; geçersizse null.
 * Türkçe yazım önceliklidir: '1.250' → 1250 TL, '1.250,50' → 1250,50 TL, '12,5' → 12,50 TL.
 */
export function paraOku(girdi) {
  if (typeof girdi === 'number') return Number.isFinite(girdi) && girdi >= 0 ? Math.round(girdi * 100) : null
  let s = String(girdi ?? '')
    .replace(/\s/g, '')
    .replace(/^₺/, '')
    .replace(/(₺|tl)$/i, '')
  if (!s) return null
  const virgul = s.lastIndexOf(',')
  const nokta = s.lastIndexOf('.')
  if (virgul >= 0 && nokta >= 0) {
    s = virgul > nokta ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (virgul >= 0) {
    s = s.replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

export function kategoriAdi(id) {
  return KATEGORILER.find((c) => c.id === id)?.ad ?? 'Diğer'
}

export function alanAdi(id) {
  return SADAKA_ALANLARI.find((a) => a.id === id)?.ad ?? 'En acil ihtiyaç'
}

// ---------- Yardım tavanı ----------

/** Ödenmiş ay sayısına göre 12 aylık yardım tavanı; bekleme süresinde 0. */
export function tavanBul(odenenAy, k = VARSAYILAN_KURALLAR) {
  let tavan = 0
  for (const [esik, t] of k.tavanlar) if (odenenAy >= esik) tavan = t
  return tavan
}

/**
 * Bir üyenin o ayki yardım tavanı. Tavan bir hak ya da bakiye değildir: kurulun ihtiyaca göre
 * verebileceği yardımın üst sınırıdır. Aidat tutarına bağlı değildir; yalnız üyelik süresine bağlıdır.
 * - Bekleme: son `beklemeAy` ayın aidatı kesintisiz ödenmiş olmalı (ara verip dönen üyede yeniden işler).
 * - Tavan: ödenmiş ay sayısına göre basamaklı (3. aydan sonra 10.000 TL, 12. aydan sonra 20.000 TL; 12 ayda).
 * - Son 12 ayda onaylanan yardımlar ve incelenen talep tavandan düşülür.
 */
export function limitDetay(uye, talepler, ay, k = VARSAYILAN_KURALLAR) {
  const odemeler = (uye.odemeler || []).filter((o) => o.tutar > 0 && ayFarki(o.ay, ay) >= 0)
  const aylar = new Set(odemeler.map((o) => o.ay))
  const odenenAy = aylar.size
  const toplamOdenen = topla(odemeler.map((o) => o.tutar))

  let imlec = aylar.has(ay) ? ay : ayEkle(ay, -1)
  let ardisikAy = 0
  while (aylar.has(imlec)) {
    ardisikAy++
    imlec = ayEkle(imlec, -1)
  }

  const aktif = uye.durum === 'aktif'
  const beklemeKalanAy = Math.max(0, k.beklemeAy - ardisikAy)
  const tavan = tavanBul(odenenAy, k)
  const limit = aktif && beklemeKalanAy === 0 ? tavan : 0
  const sonraki = k.tavanlar.find(([esik, t]) => esik > odenenAy && t > tavan)
  const sonrakiTavan = sonraki ? { kalanAy: sonraki[0] - odenenAy, tavan: sonraki[1] } : null

  const benim = talepler.filter((t) => t.uyeId === uye.id)
  const pencerede = benim.filter((t) => t.onaylanan > 0 && t.kararAy && ayFarki(t.kararAy, ay) < k.pencereAy)
  const kullanilan = topla(pencerede.map((t) => t.onaylanan))
  const incelemede = topla(benim.filter((t) => ACIK.has(t.durum)).map((t) => t.tutar))
  const geriDonusler = pencerede
    .map((t) => ({ ay: ayEkle(t.kararAy, k.pencereAy), tutar: t.onaylanan }))
    .sort((a, b) => ayFarki(b.ay, a.ay))

  return {
    aktif,
    odenenAy,
    ardisikAy,
    toplamOdenen,
    beklemeKalanAy,
    tavan,
    sonrakiTavan,
    limit,
    kullanilan,
    incelemede,
    kullanilabilir: Math.max(0, limit - kullanilan - incelemede),
    geriDonusler,
  }
}

export function uyeLimiti(durum, uyeId, k = VARSAYILAN_KURALLAR) {
  const uye = durum.uyeler.find((u) => u.id === uyeId)
  if (!uye) throw new KuralHatasi(['Üye bulunamadı.'])
  return limitDetay(uye, durum.talepler, durum.ay, k)
}

/** Üyenin aidatı nereye gitti: doğrudan sadaka, havuz, işletme ve aldığı yardım. */
export function etkiHesapla(uye, talepler, k = VARSAYILAN_KURALLAR) {
  let toplam = 0
  let sadaka = 0
  let havuz = 0
  let isletme = 0
  for (const o of uye.odemeler || []) {
    const p = paylariBol(o.tutar, k)
    toplam += o.tutar
    sadaka += p.sadaka
    havuz += p.havuz
    isletme += p.isletme
  }
  const alinan = topla(talepler.filter((t) => t.uyeId === uye.id).map((t) => t.odenen))
  return { toplam, sadaka, havuz, isletme, alinan }
}

// ---------- Durum (sandığın tamamı) ----------

/**
 * Yeni sandık. `topluluk` verilirse tek tek izlenmeyen "diğer üyeler" toplu olarak modellenir
 * (demo ve projeksiyon için): { uyeSayisi, buyume, ortalamaPay, yillikTalepOrani, ortalamaTalep, alanDagilimi }.
 */
export function yeniDurum({ ay, topluluk = null, tohum = 1 }, k = VARSAYILAN_KURALLAR) {
  if (!ayGecerli(ay)) throw new Error(`Geçersiz ay: ${ay}`)
  const s = {
    surum: 1,
    ay,
    sayac: 0,
    tohum: tohum | 0,
    benId: null,
    uyeler: [],
    talepler: [],
    defter: [],
    raporlar: [],
    butce: null,
    topluluk: topluluk ? { ...topluluk, alanDagilimi: { ...topluluk.alanDagilimi }, gecmis: {}, bekleyen: 0 } : null,
  }
  ayiAc(s, k, { ilk: true })
  return s
}

export function bakiyeler(durum) {
  const b = { havuz: 0, sadaka: 0, isletme: 0 }
  for (const d of durum.defter) b[d.kova] += d.tutar
  return b
}

export function uyeSayisi(durum) {
  return durum.uyeler.filter((u) => u.durum === 'aktif').length + (durum.topluluk?.uyeSayisi || 0)
}

export function rezervHedefi(durum, k = VARSAYILAN_KURALLAR) {
  return k.rezervKati * (durum.butce?.havuzGirisi || 0)
}

/** Onaylanmış ama aylık ödeme tavanı yüzünden sırada bekleyen tutar. */
export function bekleyenBorc(durum) {
  const bireysel = topla(durum.talepler.filter((t) => t.durum === 'sirada').map((t) => t.onaylanan - t.odenen))
  return bireysel + (durum.topluluk?.bekleyen || 0)
}

export function butceKalan(durum) {
  if (!durum.butce) return 0
  return Math.max(0, Math.min(durum.butce.tavan - durum.butce.kullanilan, bakiyeler(durum).havuz))
}

function defterYaz(s, kayit) {
  if (!kayit.tutar) return
  s.defter.push({ no: s.defter.length + 1, ay: s.ay, ...kayit })
}

function yeniKimlik(s, onek) {
  s.sayac += 1
  return `${onek}-${String(s.sayac).padStart(4, '0')}`
}

/** Kimliği açık etmeyen, kısa üye kodu (kurul ad görmez). */
function uyeKodu(n) {
  return ((Math.imul(n + 7, 2654435761) >>> 0) % 1679616).toString(36).toUpperCase().padStart(4, '0')
}

/** Durumda saklanan tohumla tekrarlanabilir rastgele sayı (mulberry32). */
function rastgele(s) {
  s.tohum = (s.tohum + 0x6d2b79f5) | 0
  let t = s.tohum
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function tahsilat(s, odemeler, toplulukTutar, k, etiket = null) {
  let sadaka = 0
  let havuz = 0
  let isletme = 0
  for (const { uye, tutar } of odemeler) {
    const p = paylariBol(tutar, k)
    uye.odemeler.push({ ay: s.ay, tutar })
    sadaka += p.sadaka
    havuz += p.havuz
    isletme += p.isletme
    s.butce.alanAgirlik[uye.alan] = (s.butce.alanAgirlik[uye.alan] || 0) + p.sadaka
  }
  if (toplulukTutar > 0) {
    const p = paylariBol(toplulukTutar, k)
    sadaka += p.sadaka
    havuz += p.havuz
    isletme += p.isletme
    for (const [alan, oran] of Object.entries(s.topluluk.alanDagilimi)) {
      s.butce.alanAgirlik[alan] = (s.butce.alanAgirlik[alan] || 0) + p.sadaka * oran
    }
  }
  if (!etiket) {
    const adet = odemeler.length + (toplulukTutar > 0 ? s.topluluk.uyeSayisi : 0)
    etiket = `${ayAdi(s.ay)} aidatları (${sayiYaz(adet)} üye)`
  }
  defterYaz(s, { tur: 'katki', kova: 'sadaka', tutar: sadaka, aciklama: `${etiket} — sadaka payı` })
  defterYaz(s, { tur: 'katki', kova: 'havuz', tutar: havuz, aciklama: `${etiket} — dayanışma havuzu` })
  defterYaz(s, { tur: 'katki', kova: 'isletme', tutar: isletme, aciklama: `${etiket} — işletme` })
  s.butce.havuzGirisi += havuz
}

function ayiAc(s, k, { ilk = false } = {}) {
  s.butce = { ay: s.ay, tavan: 0, kullanilan: 0, havuzGirisi: 0, alanAgirlik: {} }
  const t = s.topluluk
  if (t) {
    if (!ilk) t.uyeSayisi = Math.max(0, Math.round(t.uyeSayisi * (1 + t.buyume)))
    t.gecmis[s.ay] = t.uyeSayisi
  }
  const odemeler = s.uyeler.filter((u) => u.durum === 'aktif').map((uye) => ({ uye, tutar: uye.aylikPay }))
  tahsilat(s, odemeler, t ? t.uyeSayisi * t.ortalamaPay : 0, k)
  s.butce.tavan = Math.floor(bakiyeler(s).havuz * k.aylikOdemeOrani)
  kuyruguOde(s)
}

/** Bir talebin onaylanan tutarını bu ayın bütçesi elverdiğince öder; kalanı sıraya girer. */
function odemeYap(s, t) {
  const ode = Math.min(t.onaylanan - t.odenen, butceKalan(s))
  if (ode > 0) {
    defterYaz(s, {
      tur: 'destek',
      kova: 'havuz',
      tutar: -ode,
      aciklama: `${kategoriAdi(t.kategori)} desteği`,
      ref: t.id,
    })
    t.odenen += ode
    s.butce.kullanilan += ode
  }
  t.durum = t.odenen >= t.onaylanan ? 'odendi' : 'sirada'
  if (t.durum === 'odendi') t.gecmis.push({ ay: s.ay, olay: `${paraYaz(ode)} ödendi` })
  else if (ode > 0) t.gecmis.push({ ay: s.ay, olay: `${paraYaz(ode)} ödendi; kalanı gelecek ay ödenecek` })
  else t.gecmis.push({ ay: s.ay, olay: 'Bu ayın ödeme payı doldu; ödeme gelecek ay yapılacak' })
}

/** Ay başında sıradaki ödemeler, bütçe yetmezse oransal olarak ödenir. */
function kuyruguOde(s) {
  const siradakiler = s.talepler.filter((t) => t.durum === 'sirada')
  const agirlik = {}
  for (const t of siradakiler) agirlik[t.id] = t.onaylanan - t.odenen
  if (s.topluluk?.bekleyen > 0) agirlik.topluluk = s.topluluk.bekleyen
  const borc = topla(Object.values(agirlik))
  const odenecek = Math.min(borc, butceKalan(s))
  if (odenecek <= 0) return
  const paylar = odenecek === borc ? agirlik : dagit(odenecek, agirlik)
  for (const t of siradakiler) {
    const o = paylar[t.id] || 0
    if (o <= 0) continue
    defterYaz(s, { tur: 'destek', kova: 'havuz', tutar: -o, aciklama: `${kategoriAdi(t.kategori)} desteği`, ref: t.id })
    t.odenen += o
    if (t.odenen >= t.onaylanan) t.durum = 'odendi'
    t.gecmis.push({ ay: s.ay, olay: t.durum === 'odendi' ? `Kalan ${paraYaz(o)} ödendi` : `${paraYaz(o)} daha ödendi` })
  }
  if (paylar.topluluk > 0) {
    defterYaz(s, {
      tur: 'destek',
      kova: 'havuz',
      tutar: -paylar.topluluk,
      aciklama: 'Sıradaki destekler (diğer üyeler)',
    })
    s.topluluk.bekleyen -= paylar.topluluk
  }
  s.butce.kullanilan += odenecek
}

// ---------- Üyelik ----------

export function uyeEkle(
  durum,
  { ad = null, sehir = '', aylikPay, alan = 'acil', ben = false },
  k = VARSAYILAN_KURALLAR,
) {
  if (!Number.isInteger(aylikPay) || aylikPay < k.asgariAidat) {
    throw new KuralHatasi([`Aylık aidat en az ${paraYaz(k.asgariAidat)} olmalı.`])
  }
  const s = structuredClone(durum)
  const id = yeniKimlik(s, 'U')
  const uye = {
    id,
    kod: uyeKodu(s.sayac),
    ad: ad ? String(ad).trim().slice(0, 60) : null,
    sehir: String(sehir || '').slice(0, 40),
    aylikPay,
    alan: SADAKA_ALANLARI.some((a) => a.id === alan) ? alan : 'acil',
    durum: 'aktif',
    katilimAy: s.ay,
    odemeler: [],
  }
  s.uyeler.push(uye)
  if (ben) s.benId = id
  tahsilat(s, [{ uye, tutar: aylikPay }], 0, k, `Yeni üyenin ilk aidatı (${uye.kod})`) // ilk aidat katılırken alınır
  return { durum: s, uyeId: id }
}

/** Aidat, sadaka tercihi ya da üyelik durumu (aktif / ara) değişir. Ara verip dönen üyenin bu ayki aidatı hemen alınır. */
export function uyeGuncelle(durum, uyeId, degisiklik, k = VARSAYILAN_KURALLAR) {
  const s = structuredClone(durum)
  const uye = s.uyeler.find((u) => u.id === uyeId)
  if (!uye) throw new KuralHatasi(['Üye bulunamadı.'])
  if (degisiklik.aylikPay !== undefined) {
    if (!Number.isInteger(degisiklik.aylikPay) || degisiklik.aylikPay < k.asgariAidat) {
      throw new KuralHatasi([`Aylık aidat en az ${paraYaz(k.asgariAidat)} olmalı.`])
    }
    uye.aylikPay = degisiklik.aylikPay
  }
  if (degisiklik.alan !== undefined && SADAKA_ALANLARI.some((a) => a.id === degisiklik.alan)) {
    uye.alan = degisiklik.alan
  }
  if (degisiklik.durum === 'ara' || degisiklik.durum === 'aktif') {
    const onceki = uye.durum
    uye.durum = degisiklik.durum
    if (onceki === 'ara' && uye.durum === 'aktif' && !uye.odemeler.some((o) => o.ay === s.ay)) {
      tahsilat(s, [{ uye, tutar: uye.aylikPay }], 0, k, `Üyeliğe dönen üyenin aidatı (${uye.kod})`)
    }
  }
  return s
}

// ---------- Talepler ----------

export function talepDogrula(durum, { uyeId, kategori, tutar, aciklama }, k = VARSAYILAN_KURALLAR) {
  const uye = durum.uyeler.find((u) => u.id === uyeId)
  if (!uye) return { gecerli: false, hatalar: ['Üye bulunamadı.'], yol: null, limit: null }
  const l = limitDetay(uye, durum.talepler, durum.ay, k)
  const hatalar = []
  if (!l.aktif) hatalar.push('Üyeliğiniz şu an arada. Talep için önce üyeliğinizi sürdürün.')
  else if (l.beklemeKalanAy > 0) {
    hatalar.push(`Bekleme süreniz ${l.beklemeKalanAy} ay sonra bitiyor. Ondan sonra talep açabilirsiniz.`)
  }
  if (durum.talepler.some((t) => t.uyeId === uyeId && ACIK.has(t.durum))) {
    hatalar.push('İncelenen bir talebiniz var. O sonuçlanınca yenisini açabilirsiniz.')
  }
  if (!KATEGORILER.some((c) => c.id === kategori)) hatalar.push('Bir kara gün türü seçin.')
  if (!Number.isInteger(tutar) || tutar <= 0) hatalar.push('Tutarı yazın.')
  else if (tutar < k.asgariTalep) hatalar.push(`En küçük talep ${paraYaz(k.asgariTalep)}.`)
  else if (l.aktif && l.beklemeKalanAy === 0 && tutar > l.kullanilabilir) {
    hatalar.push(`Bu tutar kalan yardım tavanınızın (${paraYaz(l.kullanilabilir)}) üstünde.`)
  }
  if (String(aciklama ?? '').trim().length < 10) hatalar.push('Durumu birkaç kelimeyle anlatın (en az 10 harf).')
  const hizli = Number.isInteger(tutar) && tutar <= k.hizliTavan && tutar <= l.kullanilabilir * k.hizliLimitOrani
  return { gecerli: hatalar.length === 0, hatalar, yol: hizli ? 'hizli' : 'kurul', limit: l }
}

export function talepOlustur(durum, girdi, k = VARSAYILAN_KURALLAR) {
  const d = talepDogrula(durum, girdi, k)
  if (!d.gecerli) throw new KuralHatasi(d.hatalar)
  const s = structuredClone(durum)
  const t = {
    id: yeniKimlik(s, 'T'),
    uyeId: girdi.uyeId,
    kategori: girdi.kategori,
    tutar: girdi.tutar,
    aciklama: String(girdi.aciklama).trim().slice(0, 600),
    belgeler: (girdi.belgeler || []).map((b) => String(b).slice(0, 120)).slice(0, 10),
    odemeYeri: girdi.odemeYeri === 'kendim' ? 'kendim' : 'kurum',
    yol: d.yol,
    durum: 'inceleme',
    acilisAy: s.ay,
    kararAy: null,
    onaylanan: 0,
    odenen: 0,
    gerekce: null,
    not: null,
    itiraz: false,
    gecmis: [
      { ay: s.ay, olay: d.yol === 'hizli' ? 'Talep alındı (hızlı inceleme)' : 'Talep alındı (kurul incelemesi)' },
    ],
  }
  s.talepler.push(t)
  return { durum: s, talepId: t.id }
}

/**
 * Kurul kararı.
 * karar: { tur: 'onay', tutar? } | { tur: 'belge', not } | { tur: 'red', gerekce }
 * Onayda ödeme hemen yapılır; ayın ödeme payı yetmezse kalanı sıraya girer ve gelecek ay ödenir.
 */
export function talepKararVer(durum, talepId, karar, k = VARSAYILAN_KURALLAR) {
  const s = structuredClone(durum)
  const t = s.talepler.find((x) => x.id === talepId)
  if (!t) throw new KuralHatasi(['Talep bulunamadı.'])
  if (t.durum !== 'inceleme') throw new KuralHatasi(['Bu talep şu an karar beklemiyor.'])
  if (karar.tur === 'onay') {
    const tutar = karar.tutar ?? t.tutar
    const uye = s.uyeler.find((u) => u.id === t.uyeId)
    const l = limitDetay(uye, s.talepler, s.ay, k)
    const enCok = Math.min(t.tutar, l.kullanilabilir + t.tutar)
    if (!Number.isInteger(tutar) || tutar <= 0 || tutar > enCok) {
      throw new KuralHatasi([`Onay tutarı 1 TL ile ${paraYaz(enCok)} arasında olmalı.`])
    }
    t.onaylanan = tutar
    t.kararAy = s.ay
    t.gecmis.push({ ay: s.ay, olay: tutar < t.tutar ? `${paraYaz(tutar)} olarak onaylandı` : 'Onaylandı' })
    odemeYap(s, t)
  } else if (karar.tur === 'belge') {
    t.durum = 'belge'
    t.not = String(karar.not || 'Ek belge gerekiyor.').slice(0, 300)
    t.gecmis.push({ ay: s.ay, olay: `Ek belge istendi: ${t.not}` })
  } else if (karar.tur === 'red') {
    if (!karar.gerekce) throw new KuralHatasi(['Bir gerekçe seçin.'])
    t.durum = 'uygun-degil'
    t.kararAy = s.ay
    t.gerekce = String(karar.gerekce).slice(0, 300)
    t.gecmis.push({ ay: s.ay, olay: 'Uygun görülmedi' })
  } else {
    throw new KuralHatasi(['Bilinmeyen karar.'])
  }
  return s
}

/** Üye ek belge yükler; talep yeniden incelemeye girer. */
export function belgeEkle(durum, talepId, belgeler) {
  const s = structuredClone(durum)
  const t = s.talepler.find((x) => x.id === talepId)
  if (!t || t.durum !== 'belge') throw new KuralHatasi(['Bu talep belge beklemiyor.'])
  const yeni = (belgeler || []).map((b) => String(b).slice(0, 120)).filter(Boolean)
  if (!yeni.length) throw new KuralHatasi(['En az bir belge ekleyin.'])
  t.belgeler = [...t.belgeler, ...yeni].slice(0, 10)
  t.durum = 'inceleme'
  t.gecmis.push({ ay: s.ay, olay: 'Ek belge eklendi; yeniden incelemede' })
  return s
}

/** Uygun görülmeyen talebe bir kez itiraz edilir; talep başka kurul üyelerince yeniden incelenir. */
export function itirazEt(durum, talepId, aciklama) {
  const s = structuredClone(durum)
  const t = s.talepler.find((x) => x.id === talepId)
  if (!t || t.durum !== 'uygun-degil') throw new KuralHatasi(['Bu talebe itiraz edilemez.'])
  if (t.itiraz) throw new KuralHatasi(['Bu talep için itiraz hakkı kullanıldı.'])
  t.itiraz = true
  t.durum = 'inceleme'
  t.kararAy = null
  t.yol = 'kurul'
  t.gecmis.push({ ay: s.ay, olay: `İtiraz edildi: ${String(aciklama || '').slice(0, 200) || 'açıklama yok'}` })
  return s
}

export function geriCek(durum, talepId) {
  const s = structuredClone(durum)
  const t = s.talepler.find((x) => x.id === talepId)
  if (!t || !ACIK.has(t.durum)) throw new KuralHatasi(['Bu talep geri çekilemez.'])
  t.durum = 'geri-cekildi'
  t.gecmis.push({ ay: s.ay, olay: 'Üye talebi geri çekti' })
  return s
}

// ---------- Ay sonu ----------

const TOPLULUK_KATEGORI_AGIRLIK = { saglik: 40, cenaze: 14, is: 16, kaza: 10, onarim: 10, afet: 4, diger: 6 }

/**
 * Ayı kapatır:
 * 1) (demo) diğer üyelerin bu ayki destekleri ödeme payından ödenir,
 * 2) havuzun rezerv hedefi + sıradaki borçların üstünde kalanı sadakaya aktarılır,
 * 3) sadaka hesabındaki her kuruş üyelerin alan tercihlerine göre dağıtılır,
 * 4) işletme payı giderlere harcanır, 5) ay raporu yazılır, 6) yeni ay açılır (paylar alınır, sıradakiler ödenir).
 */
export function ayiKapat(durum, k = VARSAYILAN_KURALLAR) {
  const s = structuredClone(durum)
  const ay = s.ay
  const t = s.topluluk
  let toplulukAdet = 0

  if (t) {
    const uygun = t.gecmis[ayEkle(ay, -k.beklemeAy)] || 0
    toplulukAdet = Math.round(((uygun * t.yillikTalepOrani) / 12) * (0.7 + 0.6 * rastgele(s)))
    if (toplulukAdet > 0) {
      const ihtiyac = toplulukAdet * Math.round(t.ortalamaTalep * (0.8 + 0.4 * rastgele(s)))
      const ode = Math.min(ihtiyac, butceKalan(s))
      t.bekleyen += ihtiyac - ode
      if (ode > 0) {
        for (const [kat, tutar] of Object.entries(dagit(ode, TOPLULUK_KATEGORI_AGIRLIK))) {
          defterYaz(s, {
            tur: 'destek',
            kova: 'havuz',
            tutar: -tutar,
            aciklama: `${kategoriAdi(kat)} destekleri (diğer üyeler)`,
            kategori: kat,
          })
        }
        s.butce.kullanilan += ode
      }
    }
  }

  const hedef = rezervHedefi(s, k)
  const fazla = Math.max(0, bakiyeler(s).havuz - hedef - bekleyenBorc(s))
  if (fazla > 0) {
    defterYaz(s, { tur: 'aktarim', kova: 'havuz', tutar: -fazla, aciklama: 'Rezervin üstündeki havuz sadakaya' })
    defterYaz(s, { tur: 'aktarim', kova: 'sadaka', tutar: fazla, aciklama: 'Havuzdan gelen fazla' })
  }

  const sadaka = bakiyeler(s).sadaka
  let alanlar = {}
  if (sadaka > 0) {
    const agirlik = Object.keys(s.butce.alanAgirlik).length ? s.butce.alanAgirlik : { acil: 1 }
    alanlar = dagit(sadaka, agirlik)
    for (const [alan, tutar] of Object.entries(alanlar)) {
      defterYaz(s, { tur: 'dagitim', kova: 'sadaka', tutar: -tutar, aciklama: `Sadaka — ${alanAdi(alan)}`, alan })
    }
  }

  const isletme = bakiyeler(s).isletme
  if (isletme > 0) {
    defterYaz(s, {
      tur: 'gider',
      kova: 'isletme',
      tutar: -isletme,
      aciklama: 'İşletme giderleri (ödeme komisyonu, yazılım, personel, denetim)',
    })
  }

  const kayitlar = s.defter.filter((d) => d.ay === ay)
  const tur = (ad, kova) =>
    topla(kayitlar.filter((d) => d.tur === ad && (!kova || d.kova === kova)).map((d) => d.tutar))
  const bireyselOdenen = new Set(kayitlar.filter((d) => d.tur === 'destek' && d.ref).map((d) => d.ref)).size
  s.raporlar.push({
    ay,
    uye: uyeSayisi(s),
    gelen: tur('katki'),
    havuzaGiren: tur('katki', 'havuz'),
    dogrudanSadaka: tur('katki', 'sadaka'),
    isletmePayi: tur('katki', 'isletme'),
    destek: 0 - tur('destek'),
    destekAdet: bireyselOdenen + toplulukAdet,
    aktarim: fazla,
    sadaka,
    alanlar,
    isletme,
    havuzSonu: bakiyeler(s).havuz,
    rezervHedefi: hedef,
    bekleyen: bekleyenBorc(s),
  })

  s.ay = ayEkle(ay, 1)
  ayiAc(s, k)
  return s
}

// ---------- Projeksiyon (kurucu hesaplayıcısı) ----------

/**
 * Beklenen değerlerle aylık projeksiyon. Rastgelelik yok; aynı girdi aynı sonucu verir.
 * g: { ay, baslangicUye, aylikYeniUye, ayrilmaOrani, ortalamaPay, yillikTalepOrani, ortalamaTalep,
 *      afet?: { ay, oran, ortalamaTalep } }  (afet.ay: 1'den başlayan ay sırası)
 */
export function projeksiyon(g, k = VARSAYILAN_KURALLAR) {
  const seri = []
  const uyeler = []
  let uye = g.baslangicUye
  let havuz = 0
  let kuyruk = 0
  const toplam = { katki: 0, sadaka: 0, destek: 0, isletme: 0, destekAdet: 0 }
  const kal = (1 - g.ayrilmaOrani) ** k.beklemeAy
  for (let i = 0; i < g.ay; i++) {
    if (i > 0) uye = uye * (1 - g.ayrilmaOrani) + g.aylikYeniUye
    uyeler.push(uye)
    const katki = Math.round(uye * g.ortalamaPay)
    const p = paylariBol(katki, k)
    havuz += p.havuz
    const tavan = Math.floor(havuz * k.aylikOdemeOrani)
    const uygun = i >= k.beklemeAy ? uyeler[i - k.beklemeAy] * kal : 0
    let adet = (uygun * g.yillikTalepOrani) / 12
    let ihtiyac = Math.round(adet * g.ortalamaTalep)
    if (g.afet && i === g.afet.ay - 1) {
      const afetAdet = uygun * g.afet.oran
      adet += afetAdet
      ihtiyac += Math.round(afetAdet * g.afet.ortalamaTalep)
    }
    kuyruk += ihtiyac
    const odenen = Math.min(kuyruk, tavan)
    kuyruk -= odenen
    havuz -= odenen
    const hedef = k.rezervKati * p.havuz
    const fazla = Math.max(0, havuz - hedef - kuyruk)
    havuz -= fazla
    const sadaka = p.sadaka + fazla
    toplam.katki += katki
    toplam.sadaka += sadaka
    toplam.destek += odenen
    toplam.isletme += p.isletme
    toplam.destekAdet += adet
    seri.push({ ay: i + 1, uye, katki, destek: odenen, ihtiyac, sadaka, isletme: p.isletme, havuz, hedef, kuyruk })
  }
  return { seri, toplam: { ...toplam, havuzSonu: havuz, kuyrukSonu: kuyruk } }
}
