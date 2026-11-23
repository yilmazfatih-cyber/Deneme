// KOPYA — elle değiştirmeyin. Kaynak: havuz/uygulama/shared/src/text.ts · Kopyalanma: 2026-11-23 · Yenile: npm run shared:sync
/**
 * Türkçe metin yardımcıları. Büyük/küçük harf dönüşümü HER ZAMAN buradaki işlevlerle yapılır:
 * düz `toUpperCase()` "i" harfini "I" yapar (doğrusu "İ"), `toLowerCase()` "I" harfini "i" yapar (doğrusu "ı").
 * Lint kuralı düz çağrıları yasaklar (bkz. eslint.config.js).
 *
 * Genişletme: yeni bir metin yardımcısı eklerken testini `shared/test/text.test.ts` içine yazın.
 */

export const TR = 'tr-TR'

export function upperTr(text: string): string {
  return text.toLocaleUpperCase(TR)
}

export function lowerTr(text: string): string {
  return text.toLocaleLowerCase(TR)
}

/** Yalnız ilk harfi büyütür: "istanbul" → "İstanbul". */
export function capitalizeTr(text: string): string {
  const first = text.charAt(0)
  return first ? upperTr(first) + text.slice(first.length) : text
}

const FOLD_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
}

/**
 * Arama anahtarı: küçük harf + Türkçe işaretlerden arındırma. "ÇIĞ", "çığ", "cig" aynı anahtarı verir.
 * Kullanıcının yazdığı metni kayıtlarla karşılaştırırken iki tarafı da bundan geçirin.
 */
export function foldTr(text: string): string {
  return lowerTr(text.normalize('NFC'))
    .replace(/[çğıöşüâîû]/g, (ch) => FOLD_MAP[ch] ?? ch)
    .replace(/\u0307/g, '') // "İ".toLowerCase() bazı ortamlarda "i\u0307" (i + birleşik nokta) üretir
}

/** `text` içinde `query` geçiyor mu (büyük-küçük ve Türkçe işaret duyarsız). Boş sorgu her şeyle eşleşir. */
export function matchesTr(text: string, query: string): boolean {
  const q = foldTr(query.trim())
  return q === '' || foldTr(text).includes(q)
}

const collator = new Intl.Collator(TR, { sensitivity: 'base', numeric: true })

/** Türk alfabesine göre sıralama karşılaştırması (ç, ğ, ı, ö, ş, ü yerinde; sayılar sayı gibi). */
export function compareTr(a: string, b: string): number {
  return collator.compare(a, b)
}

/** Adres çubuğuna uygun kısa ad: "Çığ gibi İş!" → "cig-gibi-is". */
export function slugifyTr(text: string): string {
  return foldTr(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
