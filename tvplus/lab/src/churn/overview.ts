/**
 * Churn genel görünümü: kaç kişi gitti, yeni gelenler ne kadar tutunuyor, kıdeme göre risk ne zaman yüksek.
 * Hepsi betimseldir; "neden" sorusu drivers / reasons / triggers modüllerindedir.
 */
import type { ChurnDefinition, ChurnOverview, SurvivalPoint } from '../../../shared/lab'
import { dayStr } from '../core/format'
import { kaplanMeier, kmAt, kmMedian, normInv } from '../core/stats'
import { isActiveRow, labelUsers, type ChurnData, type Labels } from './data'

export const SURVIVAL_DAYS = [1, 3, 7, 14, 21, 30, 45, 60, 90, 120, 180] as const
export const TENURE_BUCKETS: readonly [string, number, number][] = [
  ['0–6 gün', 0, 6],
  ['7–13 gün', 7, 13],
  ['14–29 gün', 14, 29],
  ['30–59 gün', 30, 59],
  ['60–89 gün', 60, 89],
  ['90+ gün', 90, 1e9],
]

/** Pencere içinde başlayan kullanıcılar: kayıt olayı varsa ya da ilk etkin günü pencere başından yeterince sonraysa. */
export function newUserMask(d: ChurnData, labels: Labels, def: ChurnDefinition): Uint8Array {
  const out = new Uint8Array(d.n)
  const signup = d.users.cols.signup_day as Int32Array
  const lead = Math.min(def.n, 14)
  for (let u = 0; u < d.n; u++) {
    if (labels.never[u]) continue
    if (signup[u] >= d.dayMin || labels.first[u] >= d.dayMin + lead) out[u] = 1
  }
  return out
}

export function overview(
  d: ChurnData,
  def: ChurnDefinition,
  labels = labelUsers(d, def.n, def.activity),
): ChurnOverview {
  const n = def.n
  const W = d.dayMax - d.dayMin + 1
  let everActive = 0
  let churned = 0
  let never = 0
  for (let u = 0; u < d.n; u++) {
    if (labels.never[u]) never++
    else {
      everActive++
      if (labels.churned[u]) churned++
    }
  }

  /* ── Dönem churn'ü: [.. p1)[p1 .. p0)[p0 .. son] — bir dönemde etkin olup sonrakinde hiç etkin olmayanlar ── */
  const periods: ChurnOverview['periods'] = []
  const nPeriods = Math.min(6, Math.floor(W / n))
  if (nPeriods >= 2) {
    // activeIn[j][u]: sondan j. dönemde etkin mi
    const flags: Uint8Array[] = []
    for (let j = 0; j < nPeriods; j++) flags.push(new Uint8Array(d.n))
    const end = d.dayMax + 1
    for (let u = 0; u < d.n; u++) {
      for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
        if (!isActiveRow(d, r, def.activity)) continue
        const j = Math.floor((end - 1 - d.dDay[r]) / n)
        if (j >= 0 && j < nPeriods) flags[j][u] = 1
      }
    }
    for (let j = nPeriods - 1; j >= 1; j--) {
      let base = 0
      let lost = 0
      for (let u = 0; u < d.n; u++) {
        if (!flags[j][u]) continue
        base++
        if (!flags[j - 1][u]) lost++
      }
      periods.push({
        from: dayStr(end - (j + 1) * n),
        to: dayStr(end - j * n - 1),
        base,
        churned: lost,
        rate: base ? lost / base : 0,
      })
    }
  }

  /* ── Yeni kullanıcılar: sağkalım ve haftalık tutunma ── */
  const isNew = newUserMask(d, labels, def)
  const time: number[] = []
  const event: number[] = []
  let newUsers = 0
  for (let u = 0; u < d.n; u++) {
    if (!isNew[u]) continue
    newUsers++
    const life = labels.last[u] - labels.first[u] + 1
    // Churn etmemiş kullanıcı son etkin gününde hâlâ risk altındadır ama sonucu bilinmez → yarım gün önce sansür
    time.push(labels.churned[u] ? life : life - 0.5)
    event.push(labels.churned[u])
  }
  const km = kaplanMeier(time, event)
  const z = normInv(0.975)
  const maxDay = W - n
  const survival: SurvivalPoint[] = []
  for (const day of SURVIVAL_DAYS) {
    if (day > maxDay) break
    const s = kmAt(km, day)
    let se = 0
    for (const p of km) {
      if (p.t > day) break
      se = p.se
    }
    survival.push({ day, s, lo: Math.max(0, s - z * se), hi: Math.min(1, s + z * se) })
  }
  const weekly: ChurnOverview['weekly'] = []
  for (let k = 1; k <= 16; k++) {
    let base = 0
    let kept = 0
    for (let u = 0; u < d.n; u++) {
      if (!isNew[u]) continue
      const from = labels.first[u] + 7 * k
      if (from + 6 > d.dayMax) continue
      base++
      for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
        const day = d.dDay[r]
        if (day > from + 6) break
        if (day >= from && isActiveRow(d, r, def.activity)) {
          kept++
          break
        }
      }
    }
    if (base < 20) break
    weekly.push({ week: k, base, retained: kept, rate: kept / base })
  }

  /* ── Haftalık etkin kullanıcı ve yapışkanlık ── */
  const weeks = Math.floor(W / 7)
  const wauCounts = new Float64Array(Math.max(0, weeks))
  const dau = new Float64Array(W)
  let mau = 0
  const weekStart = d.dayMax + 1 - weeks * 7
  const seen = new Int32Array(Math.max(1, weeks)).fill(-1)
  for (let u = 0; u < d.n; u++) {
    let inLast28 = false
    for (let r = d.dayFrom[u]; r < d.dayTo[u]; r++) {
      if (!isActiveRow(d, r, def.activity)) continue
      const day = d.dDay[r]
      dau[day - d.dayMin]++
      if (day > d.dayMax - 28) inLast28 = true
      const wk = Math.floor((day - weekStart) / 7)
      if (wk >= 0 && wk < weeks && seen[wk] !== u) {
        seen[wk] = u
        wauCounts[wk]++
      }
    }
    if (inLast28) mau++
  }
  let dauSum = 0
  const span = Math.min(28, W)
  for (let i = W - span; i < W; i++) dauSum += dau[i]
  const wau: ChurnOverview['wau'] = []
  for (let wk = Math.max(0, weeks - 26); wk < weeks; wk++)
    wau.push({ week: dayStr(weekStart + wk * 7), users: wauCounts[wk] })

  /* ── Kıdeme göre "son gün" riski (yalnız pencere içinde başlayanlar: kıdemi biliniyor) ── */
  const hz = TENURE_BUCKETS.map(([bucket]) => ({ bucket, days: 0, terminal: 0, rate: 0 }))
  for (let u = 0; u < d.n; u++) {
    if (!isNew[u]) continue
    let prevRow = -1
    for (let r = d.dayFrom[u]; r <= d.dayTo[u]; r++) {
      const isEnd = r === d.dayTo[u]
      if (!isEnd && !isActiveRow(d, r, def.activity)) continue
      if (prevRow >= 0) {
        const day = d.dDay[prevRow]
        const next = isEnd ? -1 : d.dDay[r]
        const observable = next >= 0 || d.dayMax - day >= n
        if (observable) {
          const tenure = day - labels.first[u]
          const b = TENURE_BUCKETS.findIndex(([, lo, hi]) => tenure >= lo && tenure <= hi)
          if (b >= 0) {
            hz[b].days++
            if (next < 0 || next - day >= n) hz[b].terminal++
          }
        }
      }
      if (!isEnd) prevRow = r
    }
  }
  for (const h of hz) h.rate = h.days ? h.terminal / h.days : 0

  return {
    definition: def,
    users: d.n,
    everActive,
    neverActive: never,
    churned,
    active: everActive - churned,
    churnedShare: everActive ? churned / everActive : 0,
    periods,
    newUsers,
    survival,
    medianLifetime: kmMedian(km),
    weekly,
    wau,
    stickiness: mau > 0 ? dauSum / span / mau : null,
    hazardByTenure: hz.filter((h) => h.days >= 30),
  }
}
