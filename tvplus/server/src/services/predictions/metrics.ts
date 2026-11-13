/**
 * Sıralama ölçümleri (ikili ilgililik; K = 10):
 *   Recall@K   = isabet / min(K, |hedef|)            (izleyici ortalaması)
 *   NDCG@K     = Σ_{isabet sırası r} 1/log2(r+1)  /  Σ_{r ≤ min(K,|hedef|)} 1/log2(r+1)
 *   HitRate@K  = en az bir isabet alan izleyici oranı
 *   Coverage   = herhangi bir izleyicinin ilk K listesinde yer alan başlık / aday başlık evreni
 */
import type { RankingMetrics } from '../../../../shared/intelligence'

export const K = 10

/**
 * En yüksek puanlı `k` aday (puan büyükten küçüğe; eşitlikte küçük dizin önce). `allowed(t)` false olanlar atlanır.
 * Tam sıralama yapılmaz: küçük bir sıralı tampon tutulur (O(n·k)).
 */
export function topK(scores: ArrayLike<number>, k: number, allowed: (t: number) => boolean): number[] {
  const idx: number[] = []
  const val: number[] = []
  for (let t = 0; t < scores.length; t++) {
    if (!allowed(t)) continue
    const s = scores[t]!
    if (Number.isNaN(s)) continue
    if (idx.length === k && !(s > val[k - 1]!)) continue
    let p = idx.length === k ? k - 1 : idx.length
    if (idx.length < k) {
      idx.push(t)
      val.push(s)
    }
    while (p > 0 && s > val[p - 1]!) {
      idx[p] = idx[p - 1]!
      val[p] = val[p - 1]!
      p--
    }
    idx[p] = t
    val[p] = s
  }
  return idx
}

export class MetricAccumulator {
  recall = 0
  ndcg = 0
  hits = 0
  users = 0
  readonly covered = new Set<number>()
  readonly universe: number

  constructor(universe: number) {
    this.universe = universe
  }

  add(ranked: number[], targets: Set<number>): void {
    if (targets.size === 0) return
    let hit = 0
    let dcg = 0
    const k = Math.min(K, ranked.length)
    for (let r = 0; r < k; r++) {
      this.covered.add(ranked[r]!)
      if (targets.has(ranked[r]!)) {
        hit++
        dcg += 1 / Math.log2(r + 2)
      }
    }
    let idcg = 0
    const ideal = Math.min(K, targets.size)
    for (let r = 0; r < ideal; r++) idcg += 1 / Math.log2(r + 2)
    this.recall += hit / ideal
    this.ndcg += idcg > 0 ? dcg / idcg : 0
    this.hits += hit > 0 ? 1 : 0
    this.users++
  }

  result(): RankingMetrics {
    const n = this.users
    const r4 = (x: number) => Math.round(x * 10_000) / 10_000
    return {
      recallAt10: n ? r4(this.recall / n) : 0,
      ndcgAt10: n ? r4(this.ndcg / n) : 0,
      hitRateAt10: n ? r4(this.hits / n) : 0,
      coverage: this.universe ? r4(this.covered.size / this.universe) : 0,
    }
  }
}
