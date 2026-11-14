/**
 * Görünmeyen katman benzerliği: iki başlığın ortak mikro türlerinin ters sıklık ağırlıklı örtüşmesi.
 *
 *   ağırlık(m)    = ln(N / boyut(m))       — nadir mikro tür daha çok şey söyler; herkesi kapsayan 0 ağırlık alır
 *   puan(a, b)    = Σ ağırlık(ortak m) / √(Σ ağırlık(a'nın m'leri) · Σ ağırlık(b'nin m'leri))     (0–1, kosinüs)
 *   shared        = ortak mikro türler, en ağır önce (en çok SHARED_LIMIT) — "Çünkü … izledin" gerekçesi
 */
import type { Generation } from './generate'

export const SHARED_LIMIT = 10

export interface SimilarTitle {
  titleId: number
  score: number
  shared: string[]
}

export function similarTitles(gen: Generation, titleId: number, limit: number): SimilarTitle[] {
  const own = gen.byTitle.get(titleId)
  if (!own || limit <= 0) return []
  const totalOf = (id: number) => gen.titleWeight.get(id) ?? 0
  const selfTotal = totalOf(titleId)
  if (selfTotal <= 0) return []
  const acc = new Map<number, { sum: number; shared: { id: string; w: number; spec: number }[] }>()
  for (const mg of own) {
    const w = gen.weight.get(mg.id) ?? 0
    if (w <= 0) continue
    for (const other of mg.titleIds) {
      if (other === titleId) continue
      let e = acc.get(other)
      if (!e) acc.set(other, (e = { sum: 0, shared: [] }))
      e.sum += w
      e.shared.push({ id: mg.id, w, spec: mg.specificity })
    }
  }
  const out: SimilarTitle[] = []
  for (const [other, e] of acc) {
    const otherTotal = totalOf(other)
    if (otherTotal <= 0) continue
    out.push({
      titleId: other,
      score: Math.round((e.sum / Math.sqrt(selfTotal * otherTotal)) * 10000) / 10000,
      shared: e.shared
        .sort((a, b) => b.w - a.w || b.spec - a.spec || (a.id < b.id ? -1 : 1))
        .slice(0, SHARED_LIMIT)
        .map((s) => s.id),
    })
  }
  return out.sort((a, b) => b.score - a.score || a.titleId - b.titleId).slice(0, limit)
}
