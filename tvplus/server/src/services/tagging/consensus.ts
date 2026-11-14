/**
 * Onaylı insan fişlerinin uzlaşısı.
 *
 *   ölçek  — değerlendiren fişlerin ortancası; çift sayıda fişte ortadaki iki değerin ortalaması AŞAĞI yuvarlanır
 *            (kılavuzdaki "iki seviye arasında kalınca düşük olanı seç" kuralıyla aynı yönde).
 *   yüz    — fişlerin yarıdan fazlasında seçilmiş değerler; `max`ı aşarsa en çok seçilenler (eşitlikte sözlük sırası).
 *   uyum   — 0–1. Ölçekte: 1 − (fiş çiftleri arasındaki ortalama mutlak fark / 5). Yüzde: fiş çiftlerinin değer
 *            kümelerinin ortalama Jaccard benzerliği (iki fişte de boş olan yüz sayılmaz). Genel puan, en az iki fişin
 *            değerlendirdiği tüm ölçek ve yüzlerin ortalamasıdır. Tek fişte ya da karşılaştırılacak kalem yoksa null.
 */
import { SCALE_MAX, type TagSheet } from '../../../../shared/tagging-schema'
import type { VocabIndex } from './vocabulary'

export interface Consensus {
  scales: Record<string, number>
  facets: Record<string, string[]>
  agreement: number | null
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 === 1 ? s[mid]! : Math.floor((s[mid - 1]! + s[mid]!) / 2)
}

function pairs<T>(items: T[]): [T, T][] {
  const out: [T, T][] = []
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) out.push([items[i]!, items[j]!])
  return out
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a)
  const sb = new Set(b)
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 1 : inter / union
}

export const round3 = (x: number): number => Math.round(x * 1000) / 1000

export function consensus(index: VocabIndex, sheets: Pick<TagSheet, 'scales' | 'facets'>[]): Consensus {
  const scales: Record<string, number> = {}
  const facets: Record<string, string[]> = {}
  const parts: number[] = []

  for (const s of index.vocabulary.scales) {
    const vals = sheets.map((sh) => sh.scales[s.key]).filter((v): v is number => typeof v === 'number')
    if (vals.length === 0) continue
    scales[s.key] = median(vals)
    if (vals.length >= 2) {
      const ps = pairs(vals)
      parts.push(1 - ps.reduce((sum, [a, b]) => sum + Math.abs(a - b), 0) / ps.length / SCALE_MAX)
    }
  }

  const n = sheets.length
  for (const { facet, values } of index.facets.values()) {
    const chosen = sheets.map((sh) => (sh.facets[facet.key] ?? []).filter((v) => values.has(v)))
    const counts = new Map<string, number>()
    for (const c of chosen) for (const v of new Set(c)) counts.set(v, (counts.get(v) ?? 0) + 1)
    const order = [...values.keys()]
    const winners = [...counts]
      .filter(([, c]) => c * 2 > n)
      .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))
      .slice(0, facet.max)
      .map(([v]) => v)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    if (winners.length > 0) facets[facet.key] = winners
    if (n >= 2 && chosen.some((c) => c.length > 0)) {
      const ps = pairs(chosen)
      parts.push(ps.reduce((sum, [a, b]) => sum + jaccard(a, b), 0) / ps.length)
    }
  }

  const agreement = n >= 2 && parts.length > 0 ? round3(parts.reduce((a, b) => a + b, 0) / parts.length) : null
  return { scales, facets, agreement }
}
