/**
 * Türkçe metinden ASCII kısa ad (slug) üretir: "Çığ gibi büyüyen İş" → "cig-gibi-buyuyen-is".
 * Kim kullanır: üreteç (dosya adı), etiket adresleri, Markdown başlık kimlikleri (saf modül).
 * Genişletme: yeni bir harf eşlemesi gerekiyorsa LETTERS tablosuna ekleyin ve tests/unit/slug.test.ts'e örnek yazın.
 */

/** NFKD ayrıştırmasıyla çözülemeyen ya da Türkçe'de özel anlamı olan (küçük) harfler. */
const LETTERS: Record<string, string> = {
  ı: 'i',
  ğ: 'g',
  ş: 's',
  ç: 'c',
  ö: 'o',
  ü: 'u',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ł: 'l',
}

export function slugify(input: string): string {
  return (
    // Türkçe kuralıyla küçült: "İ" → "i", "I" → "ı" (ikisi de aşağıda "i" olur).
    [...input.toLocaleLowerCase('tr-TR')]
      .map((char) => LETTERS[char] ?? char)
      .join('')
      // Kalan aksanlar: "â" → "a" + birleşen işaret; işaretler atılır.
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/gu, '')
      // Kesme işaretleri kelimeyi bölmez: "Iğdır'da" → "igdirda".
      .replace(/['’`]/gu, '')
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
  )
}

/**
 * Aynı belgede yinelenen kısa adlara "-2", "-3" ekleyen sayaç üretir.
 * Kullanım: const unique = createSlugCounter(); unique('giris') → "giris"; unique('giris') → "giris-2".
 */
export function createSlugCounter(): (slug: string) => string {
  const seen = new Map<string, number>()
  return (slug) => {
    const count = (seen.get(slug) ?? 0) + 1
    seen.set(slug, count)
    return count === 1 ? slug : `${slug}-${count}`
  }
}
