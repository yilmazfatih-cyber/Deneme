// KOPYA — elle değiştirmeyin. Kaynak: havuz/uygulama/shared/src/testing/random.ts · Kopyalanma: 2026-11-23 · Yenile: npm run shared:sync
/**
 * Tohumlu sözde rastgele sayı üreteci (mulberry32). Testlerde `Math.random` yerine kullanılır ki
 * başarısız bir rastgele test aynı tohumla birebir yeniden üretilebilsin.
 */
export interface Rng {
  /** [0, 1) aralığında sayı. */
  next(): number
  /** [0, max) aralığında tam sayı. */
  int(max: number): number
  /** Diziden rastgele bir öğe; dizi boşsa `undefined`. */
  pick<T>(items: readonly T[]): T | undefined
  /** Verilen olasılıkla `true`. */
  chance(probability: number): boolean
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (max: number) => Math.floor(next() * max)
  return {
    next,
    int,
    pick: (items) => (items.length === 0 ? undefined : items[int(items.length)]),
    chance: (probability) => next() < probability,
  }
}
