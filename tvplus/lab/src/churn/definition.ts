/**
 * Churn tanımı: sözleşmesiz bir üründe (kullanıcı iptal tuşuna basmadan da gider) churn, "n gün etkinlik yok" diye
 * tanımlanır. n keyfi seçilmez; veriden okunur: bir etkin günden sonra n gün sessiz kalan kullanıcıların ne kadarı
 * sonradan geri dönüyor? Geri dönme olasılığı eşiğin (varsayılan %20) altına düştüğü ilk n, churn süresidir.
 *
 * Boşluk süreleri sansürlüdür (son etkin günden sonraki boşluğun ne kadar süreceği bilinmez); bu yüzden oranlar
 * Kaplan–Meier ile kestirilir. Süreler tam gün olduğundan hesap sıralama gerektirmez (süre başına sayaç).
 */
import type { ChurnDefinition, GapRow } from '../../../shared/lab'
import { isActiveRow, type Activity, type ChurnData } from './data'

export const GAP_CANDIDATES = [7, 10, 14, 21, 28, 30, 45, 60, 90] as const
export const DEFAULT_RETURN_THRESHOLD = 0.2

/** Boşluk sürelerinin sağkalım eğrisi: S[t] = P(boşluk > t), t = 0 … pencere. */
export function gapSurvival(d: ChurnData, activity: Activity): { S: Float64Array; atRisk: Float64Array } {
  const W = d.dayMax - d.dayMin + 1
  const returned = new Float64Array(W + 2)
  const censored = new Float64Array(W + 2)
  for (let u = 0; u < d.n; u++) {
    let prev = -1
    for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
      if (!isActiveRow(d, r, activity)) continue
      const day = d.dDay[r]
      if (prev >= 0) returned[Math.min(W + 1, day - prev)]++
      prev = day
    }
    if (prev >= 0) {
      const c = d.dayMax - prev
      // c gün boyunca dönmediği biliniyor (c = 0 → bilgi yok)
      if (c > 0) censored[Math.min(W + 1, c)]++
    }
  }
  const S = new Float64Array(W + 2)
  const atRisk = new Float64Array(W + 2)
  let risk = 0
  for (let t = 1; t <= W + 1; t++) risk += returned[t] + censored[t]
  S[0] = 1
  let s = 1
  for (let t = 1; t <= W + 1; t++) {
    atRisk[t] = risk
    if (risk > 0) s *= 1 - returned[t] / risk
    S[t] = s
    risk -= returned[t] + censored[t]
  }
  return { S, atRisk }
}

export function gapTable(d: ChurnData, activity: Activity): GapRow[] {
  const W = d.dayMax - d.dayMin + 1
  const { S, atRisk } = gapSurvival(d, activity)
  // "Sonunda" = risk kümesinin hâlâ yeterli olduğu en uzun süre
  let horizon = W
  while (horizon > 1 && atRisk[horizon] < 30) horizon--
  const rows: GapRow[] = []
  for (const n of GAP_CANDIDATES) {
    if (n >= horizon) break
    const sn = S[n]
    rows.push({ n, exceedShare: sn, returnRate: sn > 0 ? Math.max(0, 1 - S[horizon] / sn) : 0 })
  }
  return rows
}

/**
 * Churn tanımını seçer. `n` verilirse o kullanılır ('elle'); verilmezse geri dönme olasılığı eşiğin altına düşen ilk
 * aday — pencerenin üçte birini aşmamak koşuluyla (etiketlemeye yer kalsın diye).
 */
export function chooseDefinition(
  d: ChurnData,
  opts: { n?: number; activity?: Activity; threshold?: number } = {},
): ChurnDefinition {
  const activity = opts.activity ?? 'izleme'
  const threshold = opts.threshold ?? DEFAULT_RETURN_THRESHOLD
  const gaps = gapTable(d, activity)
  const W = d.dayMax - d.dayMin + 1
  if (opts.n !== undefined) {
    if (!(opts.n >= 1) || opts.n >= W) throw new Error(`Churn süresi 1 ile ${W - 1} gün arasında olmalı.`)
    return { n: Math.floor(opts.n), activity, chosenBy: 'elle', threshold, gaps }
  }
  const maxN = Math.max(7, Math.floor(W / 3))
  const ok = gaps.filter((g) => g.n <= maxN)
  const pick = ok.find((g) => g.returnRate <= threshold) ?? ok[ok.length - 1]
  return { n: pick ? pick.n : Math.min(30, maxN), activity, chosenBy: 'veri', threshold, gaps }
}
