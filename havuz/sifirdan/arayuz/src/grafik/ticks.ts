// "Güzel" eksen adımları: insanlar eksende 0, 20, 40… ya da 0,5 / 1 / 1,5 görmek ister; 0, 17,3, 34,6 değil.
// Ham adım (aralık / istenen çizgi sayısı) 10'un kuvvetine bölünür ve 1, 2, 5 ya da 10'a yuvarlanır
// (eşikler √2, √10, √50: hangi güzel sayıya oranca daha yakınsa). Değerler adım × tamsayı olarak üretilip
// adımın ondalık basamağına yuvarlanır: 0,1 × 3 = 0,30000000000000004 hatası eksene sızmaz.
// Genişletme: logaritmik ölçek için 1-2-5 dizisini her onluk için tekrarlayan `logTicks` yazılabilir.

export function tickStep(min: number, max: number, count: number): number {
  const span = Math.abs(max - min)
  if (span === 0 || !Number.isFinite(span)) return 1
  const raw = span / Math.max(1, count)
  const power = 10 ** Math.floor(Math.log10(raw))
  const error = raw / power
  const factor = error >= Math.sqrt(50) ? 10 : error >= Math.sqrt(10) ? 5 : error >= Math.sqrt(2) ? 2 : 1
  return factor * power
}

/** Adımın kaç ondalık basamak gerektirdiği (0,25 → 2). */
export function stepDecimals(step: number): number {
  if (step >= 1) return 0
  let decimals = 0
  while (Math.abs(Math.round(step * 10 ** decimals) - step * 10 ** decimals) > 1e-9 && decimals < 20) decimals++
  return decimals
}

/** [min, max] içindeki güzel çizgi değerleri (uçlar adımın katıysa dahil). */
export function ticks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min]
  const [lo, hi] = min < max ? [min, max] : [max, min]
  const step = tickStep(lo, hi, count)
  const decimals = stepDecimals(step)
  const out: number[] = []
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + step * 1e-9; i++)
    out.push(Number((i * step).toFixed(decimals)) + 0)
  return min < max ? out : out.reverse()
}

/** Tanım aralığını güzel adımların katlarına genişletir: [3, 97] → [0, 100]. Tek değeri bir aralığa açar. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  if (min === max) {
    if (min === 0) return [0, 1]
    const pad = Math.abs(min) * 0.1
    return niceDomain(min - pad, max + pad, count)
  }
  let [lo, hi] = min < max ? [min, max] : [max, min]
  for (let i = 0; i < 2; i++) {
    const step = tickStep(lo, hi, count)
    lo = Math.floor(lo / step) * step
    hi = Math.ceil(hi / step) * step
  }
  const decimals = stepDecimals(tickStep(lo, hi, count))
  return [Number(lo.toFixed(decimals)) + 0, Number(hi.toFixed(decimals)) + 0]
}
