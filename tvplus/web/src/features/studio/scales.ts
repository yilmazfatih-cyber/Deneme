/**
 * Grafik ölçekleri ve veri hazırlığı (saf): doğrusal ölçek, okunur eksen değerleri, eşli çubuk (katalog ↔ izlenme)
 * sıralaması, en büyük farkların düz Türkçe okunuşu, dağılım grafiği sınırları.
 */
import type { MixRow } from '../../../../shared/intelligence'
import { pctWithSuffix } from './format'

export type Scale = (v: number) => number

/** [d0, d1] → [r0, r1] doğrusal eşleme; tanım aralığı sıfırsa aralığın ortası döner. */
export function linear(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0
  if (!Number.isFinite(span) || span === 0) return () => (r0 + r1) / 2
  return (v) => r0 + ((v - d0) / span) * (r1 - r0)
}

/** Okunur adım: 1, 2, 2.5, 5 × 10^n */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || !(count > 0)) return 1
  const raw = span / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * pow
}

/** 0'dan başlayan eksen için yuvarlanmış üst sınır: 0.392 → 0.4, 87 → 100. Boş/0 → 1. */
export function niceMax(max: number, count = 4): number {
  if (!(max > 0) || !Number.isFinite(max)) return 1
  const step = niceStep(max, count)
  return Math.ceil(max / step - 1e-9) * step
}

/** [min, max] aralığında okunur eksen değerleri (uçlar dahil, kayan nokta artığı temizlenmiş). */
export function ticks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return []
  if (max === min) return [min]
  const step = niceStep(max - min, count)
  const start = Math.ceil(min / step - 1e-9) * step
  const out: number[] = []
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)))
  return out
}

/** Çizgi grafiği yolu: noktalar → "M x y L x y …" (null değerler çizgiyi böler). */
export function linePath(points: readonly ({ x: number; y: number } | null)[]): string {
  let d = ''
  let pen = false
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${round2(p.x)} ${round2(p.y)} `
    pen = true
  }
  return d.trim()
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Noktaların kapsadığı alan, kenarlara pay bırakarak ([min − pad, max + pad]); tek nokta ya da boşsa [−1, 1]. */
export function extent(values: readonly number[], padRatio = 0.06): [number, number] {
  const fin = values.filter((v) => Number.isFinite(v))
  if (!fin.length) return [-1, 1]
  let lo = Math.min(...fin)
  let hi = Math.max(...fin)
  if (lo === hi) {
    lo -= 1
    hi += 1
  }
  const pad = (hi - lo) * padRatio
  return [lo - pad, hi + pad]
}

/* ───────────── Eşli çubuk: katalog payı ↔ izlenme payı ───────────── */

export interface PairedRow {
  key: string
  name: string
  catalogShare: number
  viewShare: number
  efficiency: number | null
  titles: number
  /** viewShare − catalogShare */
  gap: number
}

export interface PairedData {
  rows: PairedRow[]
  /** Her iki çubuğun ortak ölçeği (0 … max) */
  max: number
}

/**
 * Eşli çubuk verisi: verime göre büyükten küçüğe (verimi olmayanlar sonda, kendi aralarında katalog payına göre);
 * başlığı olmayan satırlar atılır; `limit` verilirse ilk N satır. Ortak ölçek iki payın en büyüğünden yuvarlanır.
 */
export function pairedRows(rows: readonly MixRow[], limit?: number): PairedData {
  const list: PairedRow[] = rows
    .filter((r) => r.titles > 0 || r.viewShare > 0)
    .map((r) => ({
      key: r.key,
      name: r.name,
      catalogShare: r.catalogShare,
      viewShare: r.viewShare,
      efficiency: r.efficiency,
      titles: r.titles,
      gap: r.viewShare - r.catalogShare,
    }))
    .sort((a, b) => {
      if (a.efficiency === null && b.efficiency === null) return b.catalogShare - a.catalogShare
      if (a.efficiency === null) return 1
      if (b.efficiency === null) return -1
      return b.efficiency - a.efficiency || b.viewShare - a.viewShare
    })
  const shown = limit !== undefined ? list.slice(0, limit) : list
  const top = Math.max(0, ...shown.map((r) => Math.max(r.catalogShare, r.viewShare)))
  return { rows: shown, max: niceMax(top) }
}

/**
 * En büyük farkların düz okunuşu (en çok iki cümle):
 *   "Sessiz Sinema kataloğun %12'si, izlenmenin %39'u." (talep arzın önünde)
 *   "Doğa ve Bilim kataloğun %23'ü, izlenmenin %11'i." (katalogda izlendiğinden fazla yer tutuyor)
 * İzlenme verisi yoksa ya da fark 2 puandan küçükse boş liste.
 */
export function gapReadings(rows: readonly MixRow[], minGap = 0.02): string[] {
  const usable = rows.filter((r) => r.efficiency !== null && r.titles > 0)
  if (!usable.length) return []
  const byGap = [...usable].sort((a, b) => b.viewShare - b.catalogShare - (a.viewShare - a.catalogShare))
  const out: string[] = []
  const over = byGap[0]
  const under = byGap[byGap.length - 1]
  const sentence = (r: MixRow) =>
    `${r.name} kataloğun ${pctWithSuffix(r.catalogShare)}, izlenmenin ${pctWithSuffix(r.viewShare)}.`
  if (over && over.viewShare - over.catalogShare >= minGap) out.push(sentence(over))
  if (under && under !== over && under.catalogShare - under.viewShare >= minGap) out.push(sentence(under))
  return out
}

/* ───────────── Gruplu çubuk (model ↔ tabanlar) ───────────── */

export interface GroupedBarLayout {
  groups: { label: string; x: number; bars: { key: string; value: number; x: number; y: number; h: number }[] }[]
  barWidth: number
  max: number
}

/**
 * Gruplu çubukların yerleşimi: her grupta seriler yan yana; grup arası boşluk bir çubuk genişliği.
 * `values[g][s]` — g. grubun s. serisi (null → çubuk çizilmez).
 */
export function groupedBars(
  groupLabels: readonly string[],
  seriesKeys: readonly string[],
  values: readonly (readonly (number | null)[])[],
  width: number,
  height: number,
  fixedMax?: number,
): GroupedBarLayout {
  const all = values.flat().filter((v): v is number => v !== null && Number.isFinite(v))
  const max = fixedMax ?? niceMax(Math.max(0, ...all))
  const n = Math.max(1, groupLabels.length)
  const s = Math.max(1, seriesKeys.length)
  const slots = n * s + n // her grup sonunda bir boşluk
  const barWidth = width / slots
  const y = linear([0, max], [height, 0])
  return {
    max,
    barWidth,
    groups: groupLabels.map((label, g) => {
      const gx = g * (s + 1) * barWidth + barWidth / 2
      return {
        label,
        x: gx + (s * barWidth) / 2,
        bars: seriesKeys.flatMap((key, i) => {
          const v = values[g]?.[i]
          if (v === null || v === undefined || !Number.isFinite(v)) return []
          const top = y(Math.max(0, Math.min(max, v)))
          return [{ key, value: v, x: gx + i * barWidth, y: top, h: height - top }]
        }),
      }
    }),
  }
}

/** İşaretli çubuk listesi için simetrik ölçek: en büyük mutlak değer (0 → 1). */
export function symmetricMax(values: readonly number[]): number {
  const m = Math.max(0, ...values.filter(Number.isFinite).map(Math.abs))
  return m > 0 ? m : 1
}
