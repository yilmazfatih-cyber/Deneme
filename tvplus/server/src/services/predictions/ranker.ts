/**
 * Sıralayıcı: küçük bir lojistik model. Girdiler (her biri eğitim çiftlerinin ortalama/sapmasıyla ölçeklenir):
 *   iş birlikçi puan · içerik puanı · popülerlik · yenilik · zevk topluluğu kaldıracı · yarım kalmış · listede
 * Eğitim: DOĞRULAMA çiftleri — izleyicinin doğrulama başlıkları (olumlu) ve izlemediği başlıklardan tohumlu örneklem
 * (olumsuz). Olumsuzlar 1/k ağırlıkla sayılır: olumlu ve olumsuzun toplam ağırlığı eşittir, böylece çıkan olasılık
 * "bu başlığı rastgele bir katalog başlığına tercih etme olasılığı" olarak okunur (eşleşme yüzdesi buna dayanır).
 * Çözüm: L2 düzenlileştirmeli Newton (IRLS); az özellik olduğu için tam ve belirlenimci.
 */
import type { Work } from './data'
import { sigmoid, solveSpd } from './linalg'

/**
 * `nonNegative`: yakınlık bildiren özelliklerin ağırlığı negatif olamaz (daha çok yakınlık tahmini düşüremez).
 * Birbiriyle ilişkili puanlar (iş birlikçi ve içerik) eşdoğrusal olduğunda serbest çözüm birine negatif ağırlık
 * verip ötekini şişirebilir; kısıt bunu önler ve ağırlıklar okunur kalır (etkin küme yöntemiyle).
 */
export const RANKER_FEATURES = [
  {
    name: 'isbirlikci',
    description: 'İş birlikçi puan: izleyici vektörü · başlık vektörü (ALS, içerikle harmanlı)',
    nonNegative: true,
  },
  {
    name: 'icerik',
    description: 'İçerik kulesi puanı: izleyici vektörü · içerikten tahmin edilen başlık vektörü',
    nonNegative: true,
  },
  {
    name: 'populerlik',
    description: 'Popülerlik: izleyen kişi sayısının logaritması (az izlenende ortancaya büzülür)',
    nonNegative: false,
  },
  {
    name: 'yenilik',
    description: 'Yenilik: kataloğa eklenmesinden bu yana geçen sürenin azalan işlevi (60 gün)',
    nonNegative: false,
  },
  {
    name: 'topluluk',
    description: 'Zevk topluluğu kaldıracı: başlığın izleyicinin topluluğundaki payı / genel payı (log)',
    nonNegative: true,
  },
  { name: 'yarim', description: 'Yarım kalmış: başlanmış ama bitirilmemiş', nonNegative: true },
  { name: 'listede', description: 'Listemde: izleyici başlığı listesine eklemiş', nonNegative: true },
] as const

export const NF = RANKER_FEATURES.length

export interface Ranker {
  mean: number[]
  std: number[]
  /** Ölçeklenmiş özellik ağırlıkları (sapması 0 olan özellik 0 ağırlık alır) */
  weights: number[]
  bias: number
}

export interface RankerFit extends Ranker {
  /** Eğitim çiftleri (olumlu / olumsuz) ve son ağırlıklı log kaybı */
  positives: number
  negatives: number
  logLoss: number
  iterations: number
}

/**
 * `x` satır öncelikli (çift × NF), `y` 0/1, `w` örnek ağırlığı. L2 cezası `lambda` (sabit terime uygulanmaz).
 */
export function* fitRanker(x: Float64Array, y: Uint8Array, w: Float64Array, lambda = 1): Work<RankerFit> {
  // Etkin küme: kısıtlı bir ağırlık negatif çıkarsa o özellik 0'a sabitlenip yeniden çözülür
  const fixed = new Array<boolean>(NF).fill(false)
  for (;;) {
    const fit = yield* fitRankerFixed(x, y, w, lambda, fixed)
    let changed = false
    RANKER_FEATURES.forEach((f, k) => {
      if (f.nonNegative && !fixed[k] && fit.weights[k]! < 0) {
        fixed[k] = true
        changed = true
      }
    })
    if (!changed) return fit
  }
}

function* fitRankerFixed(
  x: Float64Array,
  y: Uint8Array,
  w: Float64Array,
  lambda: number,
  fixed: boolean[],
): Work<RankerFit> {
  const n = y.length
  const mean = new Array<number>(NF).fill(0)
  const std = new Array<number>(NF).fill(0)
  let wsum = 0
  for (let r = 0; r < n; r++) {
    wsum += w[r]!
    for (let k = 0; k < NF; k++) mean[k]! += w[r]! * x[r * NF + k]!
  }
  for (let k = 0; k < NF; k++) mean[k] = wsum > 0 ? mean[k]! / wsum : 0
  for (let r = 0; r < n; r++)
    for (let k = 0; k < NF; k++) {
      const d = x[r * NF + k]! - mean[k]!
      std[k]! += w[r]! * d * d
    }
  for (let k = 0; k < NF; k++) std[k] = wsum > 0 ? Math.sqrt(std[k]! / wsum) : 0
  const active = std.map((s, k) => s > 1e-9 && !fixed[k])
  const D = NF + 1
  const beta = new Float64Array(D)
  const z = new Float64Array(D)
  const H = new Float64Array(D * D)
  const g = new Float64Array(D)
  let it = 0
  let loss = 0
  let positives = 0
  for (let r = 0; r < n; r++) positives += y[r]!
  for (; it < 50; it++) {
    H.fill(0)
    g.fill(0)
    loss = 0
    for (let r = 0; r < n; r++) {
      z[0] = 1
      for (let k = 0; k < NF; k++) z[k + 1] = active[k] ? (x[r * NF + k]! - mean[k]!) / std[k]! : 0
      let s = 0
      for (let k = 0; k < D; k++) s += beta[k]! * z[k]!
      const p = sigmoid(s)
      const wr = w[r]!
      const err = p - y[r]!
      loss += wr * (y[r] ? -Math.log(Math.max(p, 1e-12)) : -Math.log(Math.max(1 - p, 1e-12)))
      const h = wr * Math.max(p * (1 - p), 1e-9)
      for (let a = 0; a < D; a++) {
        g[a]! += wr * err * z[a]!
        if (z[a] === 0) continue
        for (let c = 0; c <= a; c++) H[a * D + c]! += h * z[a]! * z[c]!
      }
      if ((r & 4095) === 4095) yield
    }
    for (let a = 0; a < D; a++) for (let c = a + 1; c < D; c++) H[a * D + c] = H[c * D + a]!
    for (let a = 1; a < D; a++) {
      H[a * D + a]! += lambda
      g[a]! += lambda * beta[a]!
      if (!active[a - 1]) {
        // etkisiz özellik: ağırlığı 0'da tut
        for (let c = 0; c < D; c++) {
          H[a * D + c] = c === a ? 1 : 0
          H[c * D + a] = c === a ? 1 : 0
        }
        g[a] = 0
      }
    }
    H[0]! += 1e-9
    const step = Float64Array.from(g)
    solveSpd(H, D, step)
    let maxStep = 0
    for (let a = 0; a < D; a++) {
      beta[a]! -= step[a]!
      maxStep = Math.max(maxStep, Math.abs(step[a]!))
    }
    if (maxStep < 1e-8) {
      it++
      break
    }
  }
  return {
    mean,
    std: std.map((s, k) => (std[k]! > 1e-9 ? s : 0)),
    weights: Array.from(beta.subarray(1)),
    bias: beta[0]!,
    positives,
    negatives: n - positives,
    logLoss: wsum > 0 ? loss / wsum : 0,
    iterations: it,
  }
}

/** Ham özelliklerden logit ve özellik katkıları (`parts` verilirse doldurulur). */
export function rankerLogit(r: Ranker, x: ArrayLike<number>, xo = 0, parts?: Float64Array): number {
  let s = r.bias
  for (let k = 0; k < NF; k++) {
    const sd = r.std[k]!
    const c = sd > 0 ? (r.weights[k]! * (x[xo + k]! - r.mean[k]!)) / sd : 0
    if (parts) parts[k] = c
    s += c
  }
  return s
}

/**
 * Eşleşme yüzdesi = round(100 · σ(logit)), 1–99 arasına sıkıştırılır. σ(logit) dengeli eğitildiği için
 * "bu başlığı katalogdan rastgele bir başlığa tercih etme olasılığı"dır: tek izleyici için katalog boyunca yayılır
 * (zevkine uzak başlıklar düşük, çekirdek zevki yüksek) ve puanla tekdüze artar.
 */
export function matchOf(logit: number): number {
  return Math.max(1, Math.min(99, Math.round(100 * sigmoid(logit))))
}
