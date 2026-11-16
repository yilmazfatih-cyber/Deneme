/**
 * Kim gidiyor: boyut taraması (hangi plan / sürüm / cihaz değerinde churn farklı), cepler (iki boyutun birleşiminde
 * tek tek etkilerinden beklenenin üstünde churn) ve churn edenlerin kümeleri.
 *
 * Çok sayıda grup sınandığı için p değerleri yanlış keşif oranına göre düzeltilir (Benjamini–Hochberg); yalnız
 * düzeltmeden sonra anlamlı kalanlar "cep" sayılır. k-anonimlik: `minBin`'den küçük gruplar hiç raporlanmaz.
 */
import type { ChurnSegments, ClusterRow, DimRow, PocketRow, ReasonFamily } from '../../../shared/lab'
import { kmeans, silhouette } from '../core/kmeans'
import { benjaminiHochberg, normSf, twoProportion } from '../core/stats'
import { FEATURE_INDEX, FEATURES, type FeatureFrame } from './features'
import type { FittedModel } from './model'

const logit = (p: number): number =>
  Math.log(Math.min(1 - 1e-6, Math.max(1e-6, p)) / (1 - Math.min(1 - 1e-6, Math.max(1e-6, p))))
const expit = (x: number): number => 1 / (1 + Math.exp(-x))

/**
 * Aynı kullanıcı birden çok anlık görüntüde yer alabildiği için satırlar bağımsız değildir; sınama istatistikleri
 * tasarım etkisine (satır / tekil kullanıcı) göre küçültülür — aksi hâlde p değerleri olduğundan iyimser çıkar.
 */
export function scanSegments(
  frame: FeatureFrame,
  model: FittedModel | null,
  opts: { minBin: number; seed?: number },
): ChurnSegments {
  const n = frame.rows
  let pos = 0
  for (let i = 0; i < n; i++) pos += frame.y[i]
  const base = n ? pos / n : 0
  const minBin = Math.max(opts.minBin, 20)
  const deff = n ? n / Math.max(1, new Set(frame.uid).size) : 1
  const shrink = 1 / Math.sqrt(Math.max(1, deff))

  /* ── Boyut değerleri ── */
  const dims: DimRow[] = []
  const marg: { n: Float64Array; c: Float64Array }[] = []
  for (const cat of frame.cats) {
    const cn = new Float64Array(cat.dict.length)
    const cc = new Float64Array(cat.dict.length)
    for (let i = 0; i < n; i++) {
      cn[cat.codes[i]]++
      cc[cat.codes[i]] += frame.y[i]
    }
    marg.push({ n: cn, c: cc })
    for (let k = 1; k < cat.dict.length; k++) {
      if (cn[k] < minBin || n - cn[k] < minBin) continue
      const t = twoProportion(pos - cc[k], n - cn[k], cc[k], cn[k])
      dims.push({
        dim: cat.key,
        value: cat.dict[k],
        n: cn[k],
        churnRate: cc[k] / cn[k],
        lift: base > 0 ? cc[k] / cn[k] / base : 0,
        p: 2 * normSf(Math.abs(t.stat) * shrink),
      })
    }
  }
  const adjD = benjaminiHochberg(dims.map((r) => r.p))
  dims.forEach((r, i) => (r.p = adjD[i]))
  dims.sort((a, b) => Math.abs(b.churnRate - base) * Math.sqrt(b.n) - Math.abs(a.churnRate - base) * Math.sqrt(a.n))

  /* ── Cepler: boyut çiftleri ── */
  const pockets: PocketRow[] = []
  const minCell = Math.max(minBin, 40)
  for (let a = 0; a < frame.cats.length; a++) {
    for (let b = a + 1; b < frame.cats.length; b++) {
      const A = frame.cats[a]
      const B = frame.cats[b]
      const nb = B.dict.length
      if (A.dict.length * nb > 40_000) continue
      const cn = new Float64Array(A.dict.length * nb)
      const cc = new Float64Array(A.dict.length * nb)
      for (let i = 0; i < n; i++) {
        const k = A.codes[i] * nb + B.codes[i]
        cn[k]++
        cc[k] += frame.y[i]
      }
      for (let ka = 1; ka < A.dict.length; ka++) {
        if (marg[a].n[ka] < minCell) continue
        for (let kb = 1; kb < nb; kb++) {
          const cell = ka * nb + kb
          const m = cn[cell]
          if (m < minCell) continue
          // Hücre, boyutlardan birinin tamamıysa birleşim yeni bilgi taşımaz
          if (m >= 0.97 * marg[a].n[ka] || m >= 0.97 * marg[b].n[kb]) continue
          const pa = marg[a].c[ka] / marg[a].n[ka]
          const pb = marg[b].c[kb] / marg[b].n[kb]
          const expected = expit(logit(pa) + logit(pb) - logit(base))
          const rate = cc[cell] / m
          const excess = cc[cell] - m * expected
          if (excess < 12 || rate < expected * 1.3) continue
          // Beklenen oran da veriden kestirilir (iki marjinal); belirsizliği için varyans iki katına çıkarılır
          const z = (excess / Math.sqrt(Math.max(1e-9, 2 * m * expected * (1 - expected)))) * shrink
          pockets.push({
            dims: [
              { dim: A.key, value: A.dict[ka] },
              { dim: B.key, value: B.dict[kb] },
            ],
            n: m,
            churnRate: rate,
            expected,
            lift: base > 0 ? rate / base : 0,
            excess,
            p: normSf(z),
          })
        }
      }
    }
  }
  const adjP = benjaminiHochberg(pockets.map((r) => r.p))
  pockets.forEach((r, i) => (r.p = adjP[i]))
  const sig = pockets.filter((r) => r.p < 0.01).sort((x, y) => y.excess - x.excess)

  /* ── Churn edenlerin kümeleri ── */
  const clusters: ClusterRow[] = []
  if (model) {
    const q = model.design.q
    const numeric = model.design.cols.map((c, k) => ({ c, k })).filter((x) => x.c.feature >= 0)
    const churners: number[] = []
    for (let i = 0; i < n; i++) if (frame.y[i]) churners.push(i)
    const m = churners.length
    const p = numeric.length
    if (m >= 200 && p >= 3) {
      const X = new Float32Array(m * p)
      for (let r = 0; r < m; r++)
        for (let j = 0; j < p; j++)
          X[r * p + j] = Math.max(-4, Math.min(4, model.design.Z[churners[r] * q + numeric[j].k]))
      let best: ReturnType<typeof kmeans> | null = null
      let bestS = -Infinity
      for (let k = 3; k <= 6; k++) {
        const km = kmeans(X, m, p, k, (opts.seed ?? 9) + k)
        let minSize = m
        for (let c = 0; c < k; c++) minSize = Math.min(minSize, km.sizes[c])
        if (minSize < Math.max(minBin, m * 0.04)) continue
        const s = silhouette(X, m, p, km.assign, k, 500, 5)
        if (s > bestS) {
          bestS = s
          best = km
        }
      }
      if (best) {
        const mean = new Float64Array(p)
        for (let r = 0; r < m; r++) for (let j = 0; j < p; j++) mean[j] += X[r * p + j] / m
        const P = FEATURES.length
        for (let c = 0; c < best.k; c++) {
          const raw = new Float64Array(p)
          for (let r = 0; r < m; r++) {
            if (best.assign[r] !== c) continue
            for (let j = 0; j < p; j++) raw[j] += frame.X[churners[r] * P + numeric[j].c.feature]
          }
          const traits = numeric
            .map((x, j) => ({
              feature: FEATURES[x.c.feature].key,
              label: FEATURES[x.c.feature].label,
              z: best.centers[c * p + j] - mean[j],
              value: best.sizes[c] ? raw[j] / best.sizes[c] : 0,
            }))
            .sort((x, y) => Math.abs(y.z) - Math.abs(x.z))
            .slice(0, 4)
          // Küme, kendisini en çok ayıran iki özellikle adlandırılır; ailesi en ayırt edici özelliğin ailesidir
          const family: ReasonFamily = FEATURES[FEATURE_INDEX[traits[0].feature]].family
          const part = (t: (typeof traits)[number]): string => `${t.label} ${t.z >= 0 ? 'yüksek' : 'düşük'}`
          clusters.push({
            id: `k${c + 1}`,
            name: traits.slice(0, 2).map(part).join(' · '),
            size: best.sizes[c],
            share: best.sizes[c] / m,
            family,
            traits,
          })
        }
        clusters.sort((a, b) => b.size - a.size)
        clusters.forEach((cl, i) => (cl.id = `k${i + 1}`))
      }
    }
  }
  return { baseRate: base, dims, pockets: sig.slice(0, 12), clusters }
}
