/**
 * bulanik_arama — Türkçe normalleştirmeli bulanık arama: yazım hatasına, büyük/küçük harfe, ç/c ş/s ı/i
 * farkına dayanıklı. Levenshtein ve Damerau (bitişik harf yer değiştirmesi) uzaklığı, trigram benzerliği,
 * puanlama ve sıralama.
 *
 * Kullanım:
 *   fuzzySearch('isparta', ['Isparta', 'Iğdır', 'Sparta FK'])          // [{ item: 'Isparta', score: 1, index: 0 }, …]
 *   fuzzySearch('kadikoy', kisiler, { key: (k) => k.ilce, limit: 5 })  // nesne listesinde alanla
 *   damerauLevenshtein('ankra', 'ankara')                               // 1
 *   trigramSimilarity('Çağrı Merkezi', 'cagri merkez')                  // 0…1
 *
 * Puan (0–1): tam eşleşme 1 · başta eşleşme 0,9+ · bir sözcüğün başında 0,8+ · içinde 0,7+ · değilse en iyi
 * sözcük benzerliği (Damerau) ile trigram benzerliğinin büyüğü × 0,7. Eşit puanda listedeki sıra korunur.
 *
 * Sınırlar: Uzaklıklar kod noktası üzerinden hesaplanır (birleşik emoji tek harf sayılmaz). Damerau, "kısıtlı"
 * (OSA) türüdür: bir alt dizi iki kez düzenlenmez. Her aramada liste baştan taranır (O(n·m)); 10 binlerce kayıtta
 * ön dizin (trigram indeksi) kurun. Normalleştirme bu dosyadadır (turkce modülüne bağımlı değildir).
 *
 * Genişletme: Yeni puan kuralı `fuzzyScore` içine, sırası belli bir `if` olarak eklenir; Python eşine
 * (kutuphane/bulanik_arama.py) aynı sayılarla eklenir ve `vektorler/bulanik_arama.json`'a örnek yazılır.
 */

export interface FuzzyResult<T> {
  item: T
  score: number
  index: number
}

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

/** Arama için normalleştirir: Türkçe küçük harf, işaretsiz, harf/rakam dışı → boşluk, tek boşluk. */
export function normalizeText(text: string): string {
  const lower = text
    .normalize('NFC')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase() // harf: İ/I önce elle çevrildi
  let out = ''
  for (const ch of lower.normalize('NFD')) {
    if (/\p{M}/u.test(ch)) continue
    const folded = FOLD[ch] ?? ch
    out += /[\p{L}\p{N}]/u.test(folded) ? folded : ' '
  }
  return out
    .normalize('NFC')
    .replace(/ı/g, 'i')
    .split(' ')
    .filter((word) => word !== '')
    .join(' ')
}

/** Levenshtein uzaklığı (ekleme/silme/değiştirme). `maxDistance` aşılırsa erken çıkar ve maxDistance + 1 döner. */
export function levenshtein(a: string, b: string, maxDistance?: number): number {
  const s = Array.from(a)
  const t = Array.from(b)
  if (maxDistance !== undefined && Math.abs(s.length - t.length) > maxDistance) return maxDistance + 1
  let previous = Array.from({ length: t.length + 1 }, (_, j) => j)
  for (let i = 1; i <= s.length; i++) {
    const current = [i]
    let rowMin = i
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      const value = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost)
      current.push(value)
      rowMin = Math.min(rowMin, value)
    }
    if (maxDistance !== undefined && rowMin > maxDistance) return maxDistance + 1
    previous = current
  }
  const distance = previous[t.length] ?? 0
  return maxDistance !== undefined && distance > maxDistance ? maxDistance + 1 : distance
}

/** Kısıtlı Damerau-Levenshtein (OSA): bitişik iki harfin yer değiştirmesi 1 işlem sayılır ("ankra" → "ankara" 1). */
export function damerauLevenshtein(a: string, b: string): number {
  const s = Array.from(a)
  const t = Array.from(b)
  const d: number[][] = Array.from({ length: s.length + 1 }, (_, i) =>
    Array.from({ length: t.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= s.length; i++) {
    const row = d[i] as number[]
    const prev = d[i - 1] as number[]
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      let value = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        value = Math.min(value, (d[i - 2]?.[j - 2] ?? 0) + 1)
      }
      row[j] = value
    }
  }
  return d[s.length]?.[t.length] ?? 0
}

/** Normalleştirilmiş metnin trigramları (sözcük başına "  söz " dolgulu; pg_trgm gibi), sıralı ve tekil. */
export function trigrams(text: string): string[] {
  const set = new Set<string>()
  for (const word of normalizeText(text).split(' ')) {
    if (word === '') continue
    const chars = Array.from(`  ${word} `)
    for (let i = 0; i + 3 <= chars.length; i++) set.add(chars.slice(i, i + 3).join(''))
  }
  return [...set].sort()
}

/** Trigram Jaccard benzerliği: |A∩B| / |A∪B| (0–1). İkisi de boşsa 0. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = new Set(trigrams(a))
  const tb = trigrams(b)
  if (ta.size === 0 && tb.length === 0) return 0
  const common = tb.filter((g) => ta.has(g)).length
  return common / (ta.size + tb.length - common)
}

function editSimilarity(a: string, b: string): number {
  const longest = Math.max(Array.from(a).length, Array.from(b).length)
  return longest === 0 ? 0 : 1 - damerauLevenshtein(a, b) / longest
}

/** Sorgunun hedefe benzerlik puanı (0–1); kurallar dosya başında. */
export function fuzzyScore(query: string, target: string): number {
  const q = normalizeText(query)
  const t = normalizeText(target)
  if (q === '' || t === '') return 0
  if (q === t) return 1
  const ratio = Array.from(q).length / Array.from(t).length
  if (t.startsWith(q)) return 0.9 + 0.09 * ratio
  const words = t.split(' ')
  if (words.some((word) => word.startsWith(q))) return 0.8 + 0.09 * ratio
  if (t.includes(q)) return 0.7 + 0.09 * ratio
  let best = editSimilarity(q, t)
  for (const word of words) best = Math.max(best, editSimilarity(q, word))
  return Math.max(best, trigramSimilarity(q, t)) * 0.7
}

/**
 * Listede arar; puanı `threshold`'dan (varsayılan 0,3) yüksek olanları puana göre (eşitlikte liste sırasıyla)
 * en çok `limit` (varsayılan 10) sonuç olarak döner. Nesne listesinde `key` ile aranacak metni seçin.
 */
export function fuzzySearch<T>(
  query: string,
  items: readonly T[],
  options: { key?: (item: T) => string; limit?: number; threshold?: number } = {},
): FuzzyResult<T>[] {
  const key = options.key ?? ((item: T) => String(item))
  const threshold = options.threshold ?? 0.3
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, key(item)) }))
    .filter((result) => result.score >= threshold)
    .sort((x, y) => y.score - x.score || x.index - y.index)
    .slice(0, options.limit ?? 10)
}
