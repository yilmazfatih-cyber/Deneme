/**
 * Tohumlu sözde rastgele sayı üreteci (mulberry32). Kümeleme her yerde bunu kullanır: aynı veri + aynı tohum → aynı sonuç.
 */
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** İki tamsayıdan kararlı bir alt tohum (aday k'ların her biri kendi tohumunu alır; sıraları sonucu etkilemez). */
export function mixSeed(seed: number, salt: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (salt + 0x7f4a7c15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/** 0…n−1 arasından m farklı dizin (artan sırada); m ≥ n ise hepsi. */
export function sampleIndices(n: number, m: number, rng: Rng): Uint32Array {
  if (m >= n) {
    const all = new Uint32Array(n)
    for (let i = 0; i < n; i++) all[i] = i
    return all
  }
  // Kısmi Fisher–Yates: yalnız dokunulan yerler bir haritada tutulur (n büyük, m küçük olabilir).
  const swapped = new Map<number, number>()
  const out = new Uint32Array(m)
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rng() * (n - i))
    const vi = swapped.get(i) ?? i
    const vj = swapped.get(j) ?? j
    out[i] = vj
    swapped.set(j, vi)
  }
  return out.sort()
}
