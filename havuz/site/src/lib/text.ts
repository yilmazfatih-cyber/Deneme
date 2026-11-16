/**
 * Metin yardımcıları: Türkçe'ye duyarlı büyük/küçük harf, kısaltma, düz metne çevirme.
 * Kim kullanır: bileşenler, SEO, arama, üreteç ve testler (saf modül; Node betikleri de içe aktarır).
 * Kural: kodda çıplak `toUpperCase()` / `toLowerCase()` YASAK (ESLint yakalar); `i → İ`, `I → ı` hatası olur.
 * Genişletme: yeni bir metin yardımcısı gerekiyorsa buraya ekleyin ve tests/unit/text.test.ts'e örnek yazın.
 */

/** Dil kodundan (ör. "tr", "en") büyük/küçük harf için kullanılacak yerel ayarı verir. */
function caseLocale(lang: string): string {
  return lang.startsWith('tr') ? 'tr-TR' : 'en-US'
}

/** Türkçe kurallarıyla büyük harf: "iş ığdır" → "İŞ IĞDIR". */
export function upperTr(text: string): string {
  return text.toLocaleUpperCase('tr-TR')
}

/** Türkçe kurallarıyla küçük harf: "IĞDIR İŞ" → "ığdır iş". */
export function lowerTr(text: string): string {
  return text.toLocaleLowerCase('tr-TR')
}

/** Verilen dile göre büyük harf (Türkçe dışındaki diller için İngilizce kuralları). */
export function upperFor(text: string, lang: string): string {
  return text.toLocaleUpperCase(caseLocale(lang))
}

/** Verilen dile göre küçük harf. */
export function lowerFor(text: string, lang: string): string {
  return text.toLocaleLowerCase(caseLocale(lang))
}

/** İlk harfi dile göre büyütür: ("iletişim", "tr") → "İletişim". */
export function capitalizeFor(text: string, lang: string): string {
  const first = [...text][0]
  if (first === undefined) return text
  return upperFor(first, lang) + text.slice(first.length)
}

/**
 * Metni en fazla `max` karaktere indirir; kelimeyi ortadan bölmez, sonuna "…" koyar.
 * Meta açıklamaları ve kart özetleri için kullanılır.
 */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut
  return base.replace(/[\s.,;:!?–—-]+$/u, '') + '…'
}

/**
 * Markdown/MDX gövdesini kabaca düz metne çevirir (okuma süresi ve özet için yeterli; tam ayrıştırıcı değildir).
 * Kod bloklarını, HTML/JSX etiketlerini, bağlantı adreslerini ve biçim işaretlerini atar.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?---\s*/u, '') // ön bilgi
    .replace(/```[\s\S]*?```/gu, ' ') // kod blokları
    .replace(/^(import|export)\s.*$/gmu, ' ') // MDX içe/dışa aktarma satırları
    .replace(/<[^>]+>/gu, ' ') // HTML / JSX etiketleri
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1') // görseller → alt metin
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1') // bağlantılar → metin
    .replace(/^\s{0,3}>\s?(\[![A-Z]+\])?/gmu, '') // alıntı ve uyarı işaretleri
    .replace(/^\s{0,3}#{1,6}\s+/gmu, '') // başlık işaretleri
    .replace(/[*_`~|]/gu, '') // vurgu, kod, tablo işaretleri
    .replace(/\s+/gu, ' ')
    .trim()
}

/** Kelime sayısı (boşlukla ayrılmış; Türkçe ve İngilizce için yeterli). */
export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length
}

/** `{ad}` biçimindeki yer tutucuları doldurur: fill("{n} dk okuma", { n: 4 }) → "4 dk okuma". */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/gu, (whole, key: string) => {
    const value = values[key]
    return value === undefined ? whole : String(value)
  })
}
