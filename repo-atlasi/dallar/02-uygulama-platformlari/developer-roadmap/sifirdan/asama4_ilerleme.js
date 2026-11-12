// Aşama 4 — İlerleme durumu: saf indirgeyici (reducer), özet, sıradaki konular, serileştirme ve birleştirme.
//
// roadmap.sh'de bir konuya tıklayıp "Done / In Progress / Skip" işaretleyebilirsin; ilerleme oturum açınca
// hesabına kaydedilir (sitenin bu kısmı bu depoda değil; ayrıntılar doğrulanmadı). Burada aynı fikri
// test edilebilir saf fonksiyonlarla kuruyoruz: durum nesnesi hiç yerinde değiştirilmez.

import { konuDugumleri } from './asama1_model.js'

export const DURUMLAR = ['done', 'learning', 'skipped']
export const SURUM = 1

/**
 * @typedef {{ durum: string | null, zaman: number }} Kayit  durum null = temizlendi (silme işareti)
 * @typedef {{ surum: number, yolHaritasi: string, kayitlar: Record<string, Kayit> }} Ilerleme
 * @typedef {{ tur: 'isaretle', dugum: string, durum: string, zaman: number }
 *         | { tur: 'temizle', dugum: string, zaman: number }
 *         | { tur: 'sifirla', zaman: number }} Eylem
 */

/** @param {string} yolHaritasi @returns {Ilerleme} */
export function bosIlerleme(yolHaritasi) {
  return { surum: SURUM, yolHaritasi, kayitlar: {} }
}

/** Geçerli (temizlenmemiş) durumlar: düğüm → durum. @param {Ilerleme} ilerleme */
export function durumlar(ilerleme) {
  /** @type {Record<string, string>} */
  const sonuc = {}
  for (const [id, k] of Object.entries(ilerleme.kayitlar)) if (k.durum) sonuc[id] = k.durum
  return sonuc
}

/**
 * Saf indirgeyici. Değişiklik yoksa AYNI nesneyi döndürür (arayüz gereksiz yere yeniden çizilmesin).
 * @param {Ilerleme} ilerleme @param {Eylem} eylem @returns {Ilerleme}
 */
export function ilerlemeUygula(ilerleme, eylem) {
  switch (eylem.tur) {
    case 'isaretle': {
      if (!DURUMLAR.includes(eylem.durum)) throw new Error(`Bilinmeyen durum: ${eylem.durum}`)
      if (ilerleme.kayitlar[eylem.dugum]?.durum === eylem.durum) return ilerleme
      return {
        ...ilerleme,
        kayitlar: { ...ilerleme.kayitlar, [eylem.dugum]: { durum: eylem.durum, zaman: eylem.zaman } },
      }
    }
    case 'temizle': {
      if (!ilerleme.kayitlar[eylem.dugum]?.durum) return ilerleme
      // Silmek yerine "temizlendi" işareti bırak: başka cihazla birleştirirken silme de yayılsın.
      return { ...ilerleme, kayitlar: { ...ilerleme.kayitlar, [eylem.dugum]: { durum: null, zaman: eylem.zaman } } }
    }
    case 'sifirla': {
      const kayitlar = {}
      for (const id of Object.keys(ilerleme.kayitlar)) kayitlar[id] = { durum: null, zaman: eylem.zaman }
      return { ...ilerleme, kayitlar }
    }
    default:
      throw new Error(`Bilinmeyen eylem: ${/** @type {any} */ (eylem).tur}`)
  }
}

/**
 * Yalnızca konu düğümleri sayılır. Tamamlanma oranı = bitti / (toplam − atlandı) — atlanan konu paydadan çıkar
 * (bu bizim tanımımız).
 * @param {import('./asama1_model.js').YolHaritasi} belge @param {Ilerleme} ilerleme
 */
export function ozet(belge, ilerleme) {
  const d = durumlar(ilerleme)
  const konular = konuDugumleri(belge)
  const say = (durum) => konular.filter((k) => d[k.id] === durum).length
  const bitti = say('done')
  const atlandi = say('skipped')
  const payda = konular.length - atlandi
  return {
    toplam: konular.length,
    bitti,
    ogreniliyor: say('learning'),
    atlandi,
    yuzde: payda === 0 ? 0 : Math.round((100 * bitti) / payda),
  }
}

/**
 * Sıradaki öneriler: henüz bitmemiş/atlanmamış ve kendisine kenarla bağlanan bütün konu düğümleri
 * bitmiş (ya da atlanmış) konular.
 * @param {import('./asama1_model.js').YolHaritasi} belge @param {Ilerleme} ilerleme
 */
export function siradakiler(belge, ilerleme) {
  const d = durumlar(ilerleme)
  const konular = konuDugumleri(belge)
  const konuIdleri = new Set(konular.map((k) => k.id))
  const kapandi = (id) => d[id] === 'done' || d[id] === 'skipped'
  return konular
    .filter((k) => !kapandi(k.id))
    .filter((k) =>
      belge.edges.filter((e) => e.target === k.id && konuIdleri.has(e.source)).every((e) => kapandi(e.source)),
    )
    .map((k) => k.id)
}

/** @param {Ilerleme} ilerleme */
export function serilestir(ilerleme) {
  return JSON.stringify(ilerleme)
}

/**
 * Güvenilmeyen metinden (localStorage, sunucu) ilerleme kur. Bozuk girdi hata fırlatır;
 * belge verilirse yol haritasında olmayan düğümler atılır.
 * @param {string} metin @param {import('./asama1_model.js').YolHaritasi} [belge] @returns {Ilerleme}
 */
export function geriYukle(metin, belge) {
  let ham
  try {
    ham = JSON.parse(metin)
  } catch {
    throw new Error('İlerleme verisi JSON değil')
  }
  if (!ham || ham.surum !== SURUM) throw new Error(`Desteklenmeyen ilerleme sürümü: ${ham?.surum}`)
  if (typeof ham.yolHaritasi !== 'string') throw new Error('yolHaritasi alanı yok')
  if (belge && ham.yolHaritasi !== belge.slug) throw new Error('İlerleme başka bir yol haritasına ait')
  const gecerli = belge ? new Set(belge.nodes.map((n) => n.id)) : null
  /** @type {Record<string, Kayit>} */
  const kayitlar = {}
  for (const [id, k] of Object.entries(ham.kayitlar ?? {})) {
    if (gecerli && !gecerli.has(id)) continue
    const kayit = /** @type {any} */ (k)
    if (!kayit || !Number.isFinite(kayit.zaman)) continue
    if (kayit.durum !== null && !DURUMLAR.includes(kayit.durum)) continue
    kayitlar[id] = { durum: kayit.durum, zaman: kayit.zaman }
  }
  return { surum: SURUM, yolHaritasi: ham.yolHaritasi, kayitlar }
}

/**
 * İki cihazın ilerlemesini birleştir: her düğüm için zamanı daha yeni olan kayıt kazanır (last-write-wins).
 * Eşit zamanda deterministik olmak için durum adına göre seç.
 * @param {Ilerleme} a @param {Ilerleme} b @returns {Ilerleme}
 */
export function birlestir(a, b) {
  if (a.yolHaritasi !== b.yolHaritasi) throw new Error('Farklı yol haritaları birleştirilemez')
  /** @type {Record<string, Kayit>} */
  const kayitlar = { ...a.kayitlar }
  for (const [id, kb] of Object.entries(b.kayitlar)) {
    const ka = kayitlar[id]
    if (!ka || kb.zaman > ka.zaman || (kb.zaman === ka.zaman && String(kb.durum) > String(ka.durum))) kayitlar[id] = kb
  }
  return { surum: SURUM, yolHaritasi: a.yolHaritasi, kayitlar }
}
