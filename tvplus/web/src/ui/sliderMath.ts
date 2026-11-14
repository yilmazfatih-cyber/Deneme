/**
 * Netflix satırının (slider) sayfa hesabı — saf işlevler, birim testi: sliderMath.test.ts.
 *
 * Sayfada kart sayısı pencere genişliğinden gelir (UX_SPEC §2): ≥1400 → 6 · ≥1100 → 5 · ≥800 → 4 · daha dar → 3.
 * Son sayfa sona yaslanır (boş yer kalmaz): 10 öğe / sayfada 6 → sayfa 0: 0–5, sayfa 1: 4–9.
 * "Görünen aralık" kenardan görünen komşu kartları (sonraki sayfanın ilki, önceki sayfanın sonu) da içerir.
 */

/** [en az genişlik, sayfadaki kart] — büyükten küçüğe */
export const SLIDER_BREAKPOINTS: readonly (readonly [number, number])[] = [
  [1400, 6],
  [1100, 5],
  [800, 4],
]
export const SLIDER_MIN_ITEMS = 3

export function itemsPerPageFor(viewportWidth: number): number {
  for (const [min, n] of SLIDER_BREAKPOINTS) if (viewportWidth >= min) return n
  return SLIDER_MIN_ITEMS
}

export function pageCount(total: number, perPage: number): number {
  if (total <= 0 || perPage <= 0) return 0
  return Math.ceil(total / perPage)
}

export function clampPage(page: number, total: number, perPage: number): number {
  const n = pageCount(total, perPage)
  if (n === 0) return 0
  return Math.min(Math.max(0, Math.trunc(page)), n - 1)
}

/** Sayfanın ilk kartının sırası (son sayfa sona yaslanır). */
export function firstIndexOfPage(page: number, total: number, perPage: number): number {
  const p = clampPage(page, total, perPage)
  return Math.max(0, Math.min(p * perPage, total - perPage))
}

/** Kartı tam görünür kılan sayfa. */
export function pageOfIndex(index: number, total: number, perPage: number): number {
  if (total <= 0) return 0
  const i = Math.min(Math.max(0, index), total - 1)
  return clampPage(Math.floor(i / perPage), total, perPage)
}

export interface IndexRange {
  /** dahil */
  from: number
  /** dahil */
  to: number
}

/**
 * Sayfada görünen kartlar. `peek` açıkken kenarlardan görünen komşular da dahildir
 * (sağda sonraki sayfanın ilk kartı; ilk sayfa dışında solda öncekinin son kartı). Boş satırda { from: 0, to: -1 }.
 */
export function visibleRange(page: number, total: number, perPage: number, peek = true): IndexRange {
  if (total <= 0) return { from: 0, to: -1 }
  const first = firstIndexOfPage(page, total, perPage)
  const last = Math.min(total - 1, first + perPage - 1)
  return {
    from: peek && first > 0 ? first - 1 : first,
    to: peek ? Math.min(total - 1, last + 1) : last,
  }
}

/** Kart, sayfadaki tam görünen kartların neresinde: önizleme kartı kenarda içe doğru büyür. */
export function edgeOf(index: number, page: number, total: number, perPage: number): 'left' | 'right' | null {
  const first = firstIndexOfPage(page, total, perPage)
  const last = Math.min(total - 1, first + perPage - 1)
  if (index === first) return 'left'
  if (index === last) return 'right'
  return null
}

/** Odak `index`'e geçince gidilecek sayfa: kart zaten tam görünüyorsa sayfa değişmez. */
export function pageToReveal(index: number, page: number, total: number, perPage: number): number {
  const first = firstIndexOfPage(page, total, perPage)
  if (index >= first && index < first + perPage) return clampPage(page, total, perPage)
  return pageOfIndex(index, total, perPage)
}
