// Ölçekler: veri değerini (tanım kümesi) ekran konumuna (değer kümesi) çevirir.
// - Doğrusal: sayılar; `invert` ekrandan veriye (fare konumundan değer bulmak için).
// - Bant (kategorik): her kategoriye eşit genişlikte bir bant; aralarda ve uçlarda boşluk oranı.
// - Zaman: tarih → ekran; çizgiler takvime göre seçilir (gün, hafta, ay, çeyrek, yıl...) — time.ts.
// Genişletme: logaritmik ölçek = `linearScale` gibi bir nesne, eşlemede Math.log10 ile.
import { niceDomain, ticks } from './ticks.ts'

export interface LinearScale {
  (value: number): number
  domain: [number, number]
  range: [number, number]
  invert(position: number): number
  ticks(count?: number): number[]
}

export function linearScale(domain: [number, number], range: [number, number], clamp = false): LinearScale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  const map = (value: number) => {
    let t = (value - d0) / span
    if (clamp) t = Math.max(0, Math.min(1, t))
    return r0 + t * (r1 - r0)
  }
  return Object.assign(map, {
    domain,
    range,
    invert: (position: number) => d0 + ((position - r0) / (r1 - r0 || 1)) * span,
    ticks: (count = 5) => ticks(d0, d1, count),
  })
}

/** Güzel sınırlı doğrusal ölçek: y ekseni için (0'ı içermesi istenirse `includeZero`). */
export function niceLinear(
  values: readonly number[],
  range: [number, number],
  count = 5,
  includeZero = true,
): LinearScale {
  const finite = values.filter(Number.isFinite)
  let min = finite.length ? Math.min(...finite) : 0
  let max = finite.length ? Math.max(...finite) : 1
  if (includeZero) {
    min = Math.min(0, min)
    max = Math.max(0, max)
  }
  return linearScale(niceDomain(min, max, count), range)
}

export interface BandScale {
  (index: number): number
  bandwidth: number
  step: number
  count: number
}

/** n kategoriyi [r0, r1] aralığına bantlar hâlinde yerleştirir. */
export function bandScale(count: number, range: [number, number], paddingInner = 0.2, paddingOuter = 0.1): BandScale {
  const [r0, r1] = range
  const step = (r1 - r0) / Math.max(1, count - paddingInner + paddingOuter * 2)
  const start = r0 + step * paddingOuter
  return Object.assign((index: number) => start + index * step, { bandwidth: step * (1 - paddingInner), step, count })
}
