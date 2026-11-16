/**
 * Arama için metin katlama (saf). Türkçe'de "İ/i/I/ı" büyük-küçük harf eşleşmesi ve Türkçe klavyesi olmayan
 * ziyaretçilerin "cig" yazması gibi durumlar için dizine ve sorguya AYNI katlama uygulanır:
 *   "ÇIĞ gibi İŞ" → "cig gibi is"     "Iğdır'da" → "igdirda"
 * Kim kullanır: src/integrations/search-index.ts (dizin) ve src/scripts/search-ui.ts (sorgu).
 * Genişletme: yeni bir dil özel harf istiyorsa src/lib/slug.ts'teki LETTERS tablosuna ekleyin.
 */
import { slugify } from './slug.ts'
import { lowerFor } from './text.ts'

/** Metni dile göre küçültür ve aksanları atarak ASCII'ye katlar; kelime sınırları korunur. */
export function foldForSearch(text: string, lang: string): string {
  return lowerFor(text, lang)
    .split(/\s+/u)
    .map((word) => slugify(word).replace(/-/gu, ''))
    .filter((word) => word !== '')
    .join(' ')
}

/** Sorgunun aranacak biçimleri: dile göre küçültülmüş hâli ve katlanmış hâli (tekrarsız). */
export function queryVariants(query: string, lang: string): string[] {
  const trimmed = query.trim()
  if (trimmed === '') return []
  return [...new Set([lowerFor(trimmed, lang), foldForSearch(trimmed, lang)])].filter((variant) => variant !== '')
}
