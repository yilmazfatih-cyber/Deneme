/**
 * İçerik karması planlayıcısı (docs/ICERIK_ZEKASI.md §7). Eklenecek N başlığın türlere dağılımını ÖNERİR; karar vermez.
 *
 *   talep  = 0,5 · izlenme payı (en büyüğe göre) + 0,3 · verim (v / (1 + v)) + 0,2 · eğilim (son 28 gün / önceki 28 gün)
 *   yargı  = (editör görüşü + 1) / 2            (görüş yoksa 0,5 = yansız)
 *   puan   = veriAğırlığı · talep + (1 − veriAğırlığı) · yargı
 *   maliyet verilirse puan, saat/maliyet veriminin geometrik ortalamaya oranının kareköküyle ölçeklenir (0,5–2 kat)
 *   hedef pay ∝ puan³ (öneriyi belirginleştirir) · başlıklar en büyük kalan yöntemiyle tam N'ye dağıtılır
 *   bütçe verilirse toplam maliyet bütçeyi aşmayana kadar N küçültülür (aynı hedef paylarla)
 *
 * Her bileşen kendi türünün verisinde azalmayan, diğer türlerinkinde artmayan biçimdedir: bir türün talebi artarsa
 * (diğer girdiler aynıyken) aldığı başlık sayısı azalmaz.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { Microgenre, PlanInput, PlanResult, PlanRow, TasteCommunity } from '../../../../shared/intelligence'
import { genreName, round4, trNumber, trPercent } from './labels'
import { inScope } from './mix'

export const PLAN_NOTE =
  'Bu plan bir öneridir: izleme verisini ve editör yargısını birleştirir. Kararı içerik ekibi verir; maliyet, hak ve yayın takvimi ayrıca değerlendirilmelidir.'

export const DEFAULT_DATA_WEIGHT = 0.7
const SHARPNESS = 3
const DEMAND_WEIGHTS = { share: 0.5, efficiency: 0.3, trend: 0.2 }
const TREND_EPS = 0.01
const GAP_MIN_LIFT = 1.5
const GAP_LIMIT = 10
const GAP_MAX_JACCARD = 0.5
const FIT_MIN_LIFT = 1.2
const UNDERSERVED_RATIO = 1.5
const UNDERSERVED_MIN_DIFF = 0.02

export interface PlanData {
  titles: ContentTitle[]
  /** Başlık → izlenen saat (tüm geçmiş) */
  hours: Map<number, number>
  /** Başlık → son 28 gün / ondan önceki 28 gün saatleri */
  recent: Map<number, number>
  previous: Map<number, number>
  microgenres: Microgenre[]
  communities: TasteCommunity[]
  communityTitles: (communityId: string) => { titleId: number; lift: number; reach: number }[]
  generatedAt: string
}

interface Work {
  key: string
  titles: number
  hours: number
  recent: number
  previous: number
  catalogShare: number
  viewShare: number
  efficiency: number | null
  trendRatio: number | null
  demand: number
  judgment: number | null
  judgmentScore: number
  score: number
  hpt: number
  cost: number | null
  costEfficiency: number | null
  factor: number
  weight: number
  target: number
  slots: number
  reasons: string[]
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** En büyük kalan yöntemi: toplam tam olarak `total`. Eşitlikte daha yüksek puan, sonra anahtar sırası. */
export function largestRemainder(
  items: { key: string; share: number; tiebreak: number }[],
  total: number,
): Map<string, number> {
  const out = new Map<string, number>()
  if (items.length === 0) return out
  const sum = items.reduce((s, i) => s + i.share, 0)
  const shares = sum > 0 ? items.map((i) => i.share / sum) : items.map(() => 1 / items.length)
  let used = 0
  const rem = items.map((it, i) => {
    const q = shares[i]! * total
    const f = Math.floor(q + 1e-9)
    out.set(it.key, f)
    used += f
    return { key: it.key, r: q - f, tiebreak: it.tiebreak }
  })
  rem.sort((a, b) => b.r - a.r || b.tiebreak - a.tiebreak || (a.key < b.key ? -1 : 1))
  for (let i = 0; i < total - used; i++) {
    const it = rem[i % rem.length]!
    out.set(it.key, out.get(it.key)! + 1)
  }
  return out
}

export function computePlan(input: PlanInput, data: PlanData): PlanResult {
  const scope = input.scope ?? 'ALL'
  const dataWeight = input.dataWeight ?? DEFAULT_DATA_WEIGHT
  const judgment = input.judgment ?? {}
  const costs = input.costPerTitle ?? {}
  const titles = data.titles.filter(inScope(scope))
  const T = titles.length
  const hoursOf = (m: Map<number, number>, id: number) => Math.max(0, m.get(id) ?? 0)

  // Tür satırları: kapsamdaki katalogda geçen türler + yargı ya da maliyet verilen türler
  const keys = new Set<string>()
  for (const t of titles) for (const g of t.genres) keys.add(g)
  for (const g of Object.keys(judgment)) keys.add(g)
  for (const g of Object.keys(costs)) keys.add(g)

  let H = 0
  let Hr = 0
  let Hp = 0
  const acc = new Map<string, { titles: number; hours: number; recent: number; previous: number }>(
    [...keys].map((k) => [k, { titles: 0, hours: 0, recent: 0, previous: 0 }]),
  )
  for (const t of titles) {
    const h = hoursOf(data.hours, t.videoId)
    const r = hoursOf(data.recent, t.videoId)
    const p = hoursOf(data.previous, t.videoId)
    H += h
    Hr += r
    Hp += p
    for (const g of new Set(t.genres)) {
      const a = acc.get(g)!
      a.titles++
      a.hours += h
      a.recent += r
      a.previous += p
    }
  }

  const rows: Work[] = [...acc.entries()].map(([key, a]) => {
    const catalogShare = T > 0 ? a.titles / T : 0
    const viewShare = H > 0 ? a.hours / H : 0
    const efficiency = H > 0 && catalogShare > 0 ? viewShare / catalogShare : null
    let trendRatio: number | null = null
    if (Hr > 0 && Hp > 0 && a.recent + a.previous > 0) {
      trendRatio = (a.recent / Hr + TREND_EPS) / (a.previous / Hp + TREND_EPS)
    }
    const j = judgment[key]
    return {
      key,
      titles: a.titles,
      hours: a.hours,
      recent: a.recent,
      previous: a.previous,
      catalogShare,
      viewShare,
      efficiency,
      trendRatio,
      demand: 0,
      judgment: j === undefined ? null : clamp(j, -1, 1),
      judgmentScore: j === undefined ? 0.5 : (clamp(j, -1, 1) + 1) / 2,
      score: 0,
      hpt: 0,
      cost: null,
      costEfficiency: null,
      factor: 1,
      weight: 0,
      target: 0,
      slots: 0,
      reasons: [],
    }
  })

  const maxVs = Math.max(0, ...rows.map((r) => r.viewShare))
  for (const r of rows) {
    const share = maxVs > 0 ? r.viewShare / maxVs : 0
    const eff = r.efficiency === null ? 0.5 : r.efficiency / (1 + r.efficiency)
    const trend = r.trendRatio === null ? 0.5 : r.trendRatio / (1 + r.trendRatio)
    // Katalogda hiç başlığı olmayan türde veri bir şey söylemez: talep 0 (yalnız yargı ve maliyet taşır)
    r.demand =
      r.titles === 0 ? 0 : DEMAND_WEIGHTS.share * share + DEMAND_WEIGHTS.efficiency * eff + DEMAND_WEIGHTS.trend * trend
    r.score = dataWeight * r.demand + (1 - dataWeight) * r.judgmentScore
  }

  // Maliyet: saat/maliyet verimi (veri ağırlığıyla yumuşatılmış) puanı 0,5–2 kat ölçekler
  const costKeys = Object.keys(costs).filter((k) => acc.has(k))
  const hasCosts = costKeys.length > 0
  const meanCost = hasCosts ? costKeys.reduce((s, k) => s + costs[k]!, 0) / costKeys.length : null
  const avgHpt = T > 0 ? H / T : 0
  if (hasCosts) {
    const xs = new Map<string, number>()
    for (const r of rows) {
      r.hpt = r.titles > 0 ? r.hours / r.titles : avgHpt
      const c = costs[r.key]
      if (c === undefined) continue
      r.cost = c
      r.costEfficiency = Math.round((r.hpt / c) * 10000) / 10000
      const x = H > 0 ? Math.pow(r.hpt, dataWeight) / c : 1 / c
      xs.set(r.key, x)
    }
    const positive = [...xs.values()].filter((x) => x > 0)
    const gm = positive.length > 0 ? Math.exp(positive.reduce((s, x) => s + Math.log(x), 0) / positive.length) : 1
    for (const r of rows) {
      const x = xs.get(r.key)
      if (x === undefined) continue
      r.factor = x > 0 ? clamp(Math.sqrt(x / gm), 0.5, 2) : 0.5
    }
  }

  for (const r of rows) r.weight = Math.pow(Math.max(0, r.score * r.factor), SHARPNESS)
  const weightSum = rows.reduce((s, r) => s + r.weight, 0)
  for (const r of rows) r.target = weightSum > 0 ? r.weight / weightSum : rows.length > 0 ? 1 / rows.length : 0

  const allocate = (n: number) =>
    largestRemainder(
      rows.map((r) => ({ key: r.key, share: r.target, tiebreak: r.score })),
      n,
    )
  let alloc = allocate(input.slots)
  const unconstrained = new Map(alloc)
  let budgetCut = false
  if (input.budget !== undefined && hasCosts) {
    const costOf = (key: string) => costs[key] ?? meanCost ?? 0
    const spend = (a: Map<string, number>) => [...a].reduce((s, [k, n]) => s + n * costOf(k), 0)
    let n = input.slots
    while (n > 0 && spend(alloc) > input.budget + 1e-9) {
      n--
      alloc = allocate(n)
      budgetCut = true
    }
  }
  for (const r of rows) r.slots = alloc.get(r.key) ?? 0

  // Gerekçeler
  for (const r of rows) {
    const reasons = r.reasons
    if (r.titles === 0) reasons.push('Katalogda bu türde başlık yok')
    if (H === 0) reasons.push('Henüz izlenme verisi yok')
    else if (r.efficiency !== null) {
      if (r.efficiency >= 1.15) reasons.push(`İzlenme payı katalog payının ${trNumber(r.efficiency)} katı`)
      else if (r.efficiency <= 0.85)
        reasons.push(`Katalogda izlendiğinden fazla yer tutuyor (${trNumber(r.efficiency)} kat)`)
      else reasons.push('İzlenme payı katalog payıyla dengeli')
      if (r.viewShare >= 0.2) reasons.push(`İzlemedeki payı ${trPercent(r.viewShare)}`)
    } else if (r.hours === 0 && r.titles > 0) reasons.push('Bu türde izlenme yok')
    if (r.trendRatio !== null) {
      if (r.trendRatio >= 1.15) reasons.push('Son 4 haftada talep artıyor')
      else if (r.trendRatio <= 0.87) reasons.push('Son 4 haftada talep azalıyor')
    }
    if (r.judgment !== null && dataWeight < 1) {
      if (r.judgment >= 0.25) reasons.push('Editör yargısı: artır')
      else if (r.judgment <= -0.25) reasons.push('Editör yargısı: azalt')
      else reasons.push('Editör yargısı: koru')
    }
    if (r.factor >= 1.15) reasons.push('Maliyetine göre çok izleniyor')
    else if (r.factor <= 0.87) reasons.push('Maliyetine göre az izleniyor')
    if (input.budget !== undefined && hasCosts && r.cost === null && r.slots > 0)
      reasons.push('Maliyet verilmedi; ortalama maliyet varsayıldı')
    const before = unconstrained.get(r.key) ?? 0
    if (budgetCut && r.slots < before) reasons.push(`Bütçe sınırı: ${before} yerine ${r.slots} başlık`)
    if (reasons.length === 0) reasons.push('Belirgin bir sinyal yok')
  }

  const outRows: PlanRow[] = rows
    .sort((a, b) => b.slots - a.slots || b.target - a.target || (a.key < b.key ? -1 : 1))
    .map((r) => ({
      key: r.key,
      name: genreName(r.key),
      catalogShare: round4(r.catalogShare),
      viewShare: round4(r.viewShare),
      efficiency: r.efficiency === null ? null : Math.round(r.efficiency * 1000) / 1000,
      demandScore: round4(r.demand),
      judgmentScore: round4(r.judgmentScore),
      costEfficiency: r.costEfficiency,
      targetShare: round4(r.target),
      slots: r.slots,
      reasons: r.reasons,
    }))

  return {
    generatedAt: data.generatedAt,
    input: { ...input, slots: input.slots, scope, dataWeight },
    rows: outRows,
    gaps: findGaps(titles, H, data),
    underserved: findUnderserved(titles, data),
    note: PLAN_NOTE,
  }
}

/**
 * Talebi yüksek (izlenme payı katalog payının ≥ 1,5 katı) ama başlığı az (≤ ortanca, en az 3) mikro türler;
 * birbirinin neredeyse aynısı olanlardan yalnız ilki.
 */
function findGaps(titles: ContentTitle[], H: number, data: PlanData): PlanResult['gaps'] {
  if (H <= 0 || titles.length === 0) return []
  const scoped = new Set(titles.map((t) => t.videoId))
  const scopeType = titles.every((t) => t.type === 'MOVIE')
    ? 'MOVIE'
    : titles.every((t) => t.type === 'SHOW')
      ? 'SHOW'
      : null
  const T = titles.length
  const cands: { mg: Microgenre; size: number; lift: number; sig: string }[] = []
  for (const mg of data.microgenres) {
    if (mg.definition.type !== null && scopeType !== null && mg.definition.type !== scopeType) continue
    const ids = mg.titleIds.filter((id) => scoped.has(id))
    if (ids.length === 0) continue
    let h = 0
    for (const id of ids) h += Math.max(0, data.hours.get(id) ?? 0)
    if (h <= 0) continue
    cands.push({ mg, size: ids.length, lift: h / H / (ids.length / T), sig: [...ids].sort((a, b) => a - b).join(',') })
  }
  if (cands.length === 0) return []
  const sizes = cands.map((c) => c.size).sort((a, b) => a - b)
  const median = sizes[Math.floor(sizes.length / 2)]!
  const maxSize = Math.max(3, median)
  // Çeşitlilik: başlık kümesi seçilmiş bir boşlukla yarıdan çok örtüşen aday atlanır (Jaccard ≥ 0,5)
  const chosen: Set<number>[] = []
  const overlaps = (ids: Set<number>) =>
    chosen.some((c) => {
      let inter = 0
      for (const id of ids) if (c.has(id)) inter++
      return inter / (ids.size + c.size - inter) >= GAP_MAX_JACCARD
    })
  return cands
    .filter((c) => c.lift >= GAP_MIN_LIFT && c.size <= maxSize)
    .sort(
      (a, b) =>
        b.lift - a.lift || a.size - b.size || a.mg.specificity - b.mg.specificity || (a.mg.id < b.mg.id ? -1 : 1),
    )
    .filter((c) => {
      const ids = new Set(c.sig.split(',').map(Number))
      if (overlaps(ids)) return false
      chosen.push(ids)
      return true
    })
    .slice(0, GAP_LIMIT)
    .map((c) => ({ microgenreId: c.mg.id, name: c.mg.name, size: c.size, demandLift: Math.round(c.lift * 100) / 100 }))
}

/**
 * Yeterince beslenmeyen topluluklar: izleme saatindeki payı, kendisine uyan katalog payından belirgin büyük olanlar.
 * Uyan katalog: topluluğun genele göre en çok öne çıkardığı başlıklar (her başlık en yüksek kaldıraçlı topluluğa sayılır).
 */
function findUnderserved(titles: ContentTitle[], data: PlanData): PlanResult['underserved'] {
  if (data.communities.length === 0 || titles.length === 0) return []
  const scoped = new Set(titles.map((t) => t.videoId))
  const best = new Map<number, { c: number; lift: number }>()
  data.communities.forEach((c, ci) => {
    for (const tl of data.communityTitles(c.id)) {
      if (!scoped.has(tl.titleId) || tl.lift < FIT_MIN_LIFT) continue
      const cur = best.get(tl.titleId)
      if (!cur || tl.lift > cur.lift) best.set(tl.titleId, { c: ci, lift: tl.lift })
    }
  })
  const supply = new Array<number>(data.communities.length).fill(0)
  for (const b of best.values()) supply[b.c]!++
  return data.communities
    .map((c, ci) => ({
      communityId: c.id,
      name: c.name,
      demandShare: round4(c.hoursShare),
      supplyShare: round4(supply[ci]! / titles.length),
    }))
    .filter(
      (u) =>
        u.demandShare >= UNDERSERVED_RATIO * u.supplyShare && u.demandShare - u.supplyShare >= UNDERSERVED_MIN_DIFF,
    )
    .sort(
      (a, b) =>
        b.demandShare - b.supplyShare - (a.demandShare - a.supplyShare) || (a.communityId < b.communityId ? -1 : 1),
    )
}
