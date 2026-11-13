/**
 * Eğitim hattı (docs/ICERIK_ZEKASI.md §13.2). Tamamı üreteçtir; arka plan sürücüsü kısa dilimlerle çalıştırır.
 *
 *  1. Etkileşimler + bölmeler (soğuk başlıklar; izleyici başına zaman kesiti: eğitim → doğrulama → sınama)
 *  2. DEĞERLENDİRME MODELİ: ALS yalnız eğitim etkileşimleriyle → içerik kulesi → harmanlı başlık vektörleri
 *  3. Sıralayıcı: doğrulama çiftleriyle (olumlu: doğrulama başlıkları; olumsuz: izlenmemişlerden örneklem)
 *  4. Ölçüm: sınama kümesinde model / popülerlik / tür yakınlığı; soğuk başlıklarda içerik kulesi / popülerlik
 *  5. ÜRETİM MODELİ: ALS tüm etkileşimlerle → içerik kulesi → harmanlı vektörler; sıralayıcı ağırlıkları (2–3'te
 *     öğrenilen) taşınır, puan ölçeği değerlendirme modelininkine eşlenir.
 * Sınama kümesi hiçbir öğrenmeye (ALS, kule, sıralayıcı, ölçek eşleme) girmez.
 */
import { createHash } from 'node:crypto'
import type { ContentTitle } from '../../../../shared/content-schema'
import type { RankingMetrics, TrainRequest, TrainingRun, ViewingFact, ViewingSource } from '../../../../shared/intelligence'
import { trainAls, type AlsResult } from './als'
import {
  blend,
  buildContentFeatures,
  SHRINKAGE,
  fitContentTower,
  predictContent,
  type ContentFeatures,
  type ContentSources,
} from './content'
import {
  buildCsr,
  buildInteractions,
  DEFAULT_SPLIT,
  ROLE_COLD,
  ROLE_TEST,
  ROLE_TRAIN,
  ROLE_VALID,
  splitInteractions,
  type Interactions,
  type Split,
  type Work,
} from './data'
import { gram, mixSeed, mulberry32 } from './linalg'
import { K, MetricAccumulator, topK } from './metrics'
import { features, foldIn, nearestCommunity, rowDot, type FeatureContext, type Fingerprint, type PredictionModel } from './model'
import { fitRanker, NF, rankerLogit, type RankerFit } from './ranker'

/** Büyük veride (otomatik seçim yapılmadığında) kullanılan değerler; küçük veride ızgaradan seçilir. */
export const DEFAULT_PARAMS: Required<TrainRequest> = {
  factors: 16,
  iterations: 12,
  regularization: 16,
  alpha: 5,
  seed: 1,
}
/** Otomatik seçim ızgarası ve üst sınırı (etkileşim) */
export const TUNE_FACTORS = [8, 16, 32]
export const TUNE_REGULARIZATION = [4, 16, 64]
export const AUTO_TUNE_MAX_INTERACTIONS = 100_000

/** Ölçümde ve sıralayıcı eğitiminde kullanılan en çok izleyici (tohumlu örneklem) */
export const EVAL_MAX_VIEWERS = 5000
export const RANKER_MAX_VIEWERS = 20_000
const NEGATIVES_PER_POSITIVE = 4
const CONTENT_LAMBDA = 0.5
const LIFT_PRIOR = 20

/** Sözleşmedeki TrainingRun + tanılama (bölme boyutları, doğrulama ölçümü, soğuk başlangıç tabanı, süreler). */
export interface TrainingRunInfo extends TrainingRun {
  /** Değerlendirme modelinin (yalnız eğitim etkileşimleri) kaybı */
  evalLoss: number[]
  split: {
    trainInteractions: number
    validationInteractions: number
    testInteractions: number
    /** Kesitten önce başlanmış (devam eden) sınama başlıkları: keşif ölçümünün dışında tutulur */
    continuationTargets: number
    /** Ölçüme giren izleyiciler (örneklem) / zamana göre bölmeye giren izleyiciler */
    testViewers: number
    splitViewers: number
    rankerViewers: number
    coldTitles: number
    coldStartViewers: number
    /** Soğuk başlangıç sıralamasındaki aday başlık sayısı (yalnız çıkarılan başlıklar) */
    coldStartCandidates: number
  } | null
  /** Doğrulama kümesinde yalnız iş birlikçi puanla sıralama (hiperparametre seçimi buna bakar; sınamaya değil) */
  validationCollaborative: RankingMetrics | null
  /** Otomatik seçimde denenen adaylar ve doğrulama puanları (seçilen `params`'tadır); seçim yapılmadıysa null */
  selection:
    | { factors: number; regularization: number; alpha: number; validationNdcgAt10: number; validationRecallAt10: number }[]
    | null
  /** Soğuk başlıklar arasında popülerlik tabanı (popülerlik izleyicilerin diğer yarısından ölçülür) */
  coldStartPopularity: RankingMetrics | null
  ranker: { positives: number; negatives: number; logLoss: number; iterations: number } | null
  solver: string | null
  synthetic: boolean
  note: string
  timings: Record<string, number>
  /** Ağırlıkların ve ölçümlerin özeti: aynı veri + tohum → aynı özet (belirlenimcilik denetimi) */
  modelHash: string | null
}

export interface TrainInput {
  facts: ViewingFact[]
  sources: ViewingSource[]
  synthetic: boolean
  note: string
  /** Katalog başlıkları (model evreni) */
  titles: ContentTitle[]
  content: ContentSources
  communityOf: (viewerId: string) => string | null
  audienceRunId: string | null
  embeddingLabel: string | null
  fingerprint: Fingerprint
}

export interface TrainOutput {
  model: PredictionModel | null
  run: TrainingRunInfo
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000

export function emptyRun(runId: string, params: Required<TrainRequest>, input: Pick<TrainInput, 'sources' | 'synthetic' | 'note'>): TrainingRunInfo {
  return {
    runId,
    status: 'RUNNING',
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    sources: input.sources,
    viewers: 0,
    titles: 0,
    interactions: 0,
    params,
    loss: [],
    metrics: null,
    evalLoss: [],
    split: null,
    validationCollaborative: null,
    selection: null,
    coldStartPopularity: null,
    ranker: null,
    solver: null,
    synthetic: input.synthetic,
    note: input.note,
    timings: {},
    modelHash: null,
  }
}

interface Fitted {
  als: AlsResult
  /** Harmanlı ve içerik vektörleri */
  V: Float32Array
  C: Float32Array
  counts: Float32Array
  gram: Float64Array
}

/** Bir ALS + içerik kulesi uydurması (değerlendirme ya da üretim). */
function* fitFactors(
  data: Interactions,
  keep: (k: number) => boolean,
  params: Required<TrainRequest>,
  feats: ContentFeatures,
  seedSalt: number,
): Work<Fitted> {
  const { byViewer, byTitle } = yield* buildCsr(data, keep)
  const f = params.factors
  const als = yield* trainAls(byViewer, byTitle, { ...params, seed: mixSeed(params.seed, seedSalt) })
  const T = data.titleIds.length
  const counts = new Float32Array(T)
  for (let t = 0; t < T; t++) counts[t] = byTitle.ptr[t + 1]! - byTitle.ptr[t]!
  const train: number[] = []
  for (let t = 0; t < T; t++) if (counts[t]! > 0) train.push(t)
  const weight = Float64Array.from(train, (t) => counts[t]! / (counts[t]! + 5))
  const tower = yield* fitContentTower(feats, train, als.y, weight, f, CONTENT_LAMBDA)
  const C = predictContent(feats, tower)
  yield
  const V = blend(als.y, C, counts, f)
  const G = gram(V, T, f, new Float64Array(f * f))
  for (let c = 0; c < f; c++) G[c * f + c]! += params.regularization
  return { als, V, C, counts, gram: G }
}

/** Rol filtresine göre topluluk × başlık log kaldıraç tablosu. */
function liftTable(
  data: Interactions,
  keep: (k: number) => boolean,
  community: Int32Array,
  k: number,
): Float32Array {
  const T = data.titleIds.length
  const nct = new Float64Array(k * T)
  const nc = new Float64Array(k)
  const nt = new Float64Array(T)
  let N = 0
  for (let v = 0; v < data.viewerIds.length; v++) {
    let any = false
    const c = community[v]!
    for (let q = data.ptr[v]!; q < data.ptr[v + 1]!; q++) {
      if (!keep(q)) continue
      any = true
      const t = data.i[q]!
      nt[t]!++
      if (c >= 0) nct[c * T + t]!++
    }
    if (any) {
      N++
      if (c >= 0) nc[c]!++
    }
  }
  const out = new Float32Array(k * T)
  for (let c = 0; c < k; c++)
    for (let t = 0; t < T; t++) {
      const pt = N > 0 ? nt[t]! / N : 0
      if (pt <= 0) continue
      const pct = (nct[c * T + t]! + LIFT_PRIOR * pt) / (nc[c]! + LIFT_PRIOR)
      out[c * T + t] = Math.log(pct / pt)
    }
  return out
}

/**
 * Seçilen etkileşimlerden popülerlik: log(1 + izleyen). Az izlenen başlıkta bilinmeyen popülerlik sıfır sayılmaz;
 * izlenen başlıkların ortancasına doğru büzülür (n / (n + k) ağırlık, k = SHRINKAGE) — vektör harmanıyla aynı kural.
 * Böylece yeni eklenmiş bir başlık "hiç izlenmedi" diye dibe itilmez; içerik kulesi onu doğru izleyiciye taşır.
 */
export function popularityOf(data: Interactions, keep: (k: number) => boolean): Float32Array {
  const T = data.titleIds.length
  const c = new Float64Array(T)
  for (let q = 0; q < data.u.length; q++) if (keep(q)) c[data.i[q]!]!++
  const seen = [...c].filter((x) => x > 0).map((x) => Math.log1p(x)).sort((a, b) => a - b)
  const median = seen.length ? seen[Math.floor(seen.length / 2)]! : 0
  return Float32Array.from(c, (x) => {
    const w = x / (x + SHRINKAGE)
    return w * Math.log1p(x) + (1 - w) * median
  })
}

/** Tohumlu örneklem (sıra korunur) */
function sample(items: number[], max: number, seed: number): number[] {
  if (items.length <= max) return items
  const rng = mulberry32(seed)
  const a = [...items]
  for (let k = 0; k < max; k++) {
    const j = k + Math.floor(rng() * (a.length - k))
    const tmp = a[k]!
    a[k] = a[j]!
    a[j] = tmp
  }
  return a.slice(0, max).sort((x, y) => x - y)
}

/** Puan dağılımı (ortalama, sapma): örneklem izleyici satırları × rastgele başlıklar. */
function scoreStats(x: Float32Array, M: Float32Array, rows: number, T: number, f: number, seed: number): [number, number] {
  const rng = mulberry32(seed)
  let s = 0
  let s2 = 0
  let n = 0
  const R = Math.min(rows, 2000)
  for (let k = 0; k < R; k++) {
    const u = rows <= 2000 ? k : Math.floor(rng() * rows)
    for (let j = 0; j < 20; j++) {
      const t = Math.floor(rng() * T)
      let d = 0
      for (let c = 0; c < f; c++) d += x[u * f + c]! * M[t * f + c]!
      s += d
      s2 += d * d
      n++
    }
  }
  if (n === 0) return [0, 1]
  const mean = s / n
  return [mean, Math.sqrt(Math.max(s2 / n - mean * mean, 1e-12))]
}

/**
 * `fixed`: istekte açıkça verilen parametreler. Verilmeyen `factors` ve `regularization`, veri küçükse
 * (≤ AUTO_TUNE_MAX_INTERACTIONS) küçük bir ızgaradan DOĞRULAMA kümesine (yalnız iş birlikçi NDCG@10) göre seçilir;
 * sınama kümesine hiç bakılmaz. Büyük veride varsayılanlar kullanılır.
 */
export function* train(
  input: TrainInput,
  requested: Required<TrainRequest>,
  run: TrainingRunInfo,
  fixed: { factors: boolean; regularization: boolean } = { factors: true, regularization: true },
): Work<TrainOutput> {
  let params = requested
  const t0 = performance.now()
  const mark = (name: string, from: number) => {
    run.timings[name] = Math.round(performance.now() - from)
    return performance.now()
  }
  let tm = t0
  const data = yield* buildInteractions(
    input.facts,
    input.titles.map((t) => t.videoId),
  )
  const T = data.titleIds.length
  const V = data.viewerIds.length
  const n = data.u.length
  run.viewers = V
  run.interactions = n
  let titlesSeen = 0
  {
    const seen = new Uint8Array(T)
    for (let q = 0; q < n; q++) seen[data.i[q]!] = 1
    for (let t = 0; t < T; t++) titlesSeen += seen[t]!
  }
  run.titles = titlesSeen
  tm = mark('veri', tm)
  if (n === 0 || V < 2 || titlesSeen < 2) {
    throw new Error(`eğitim için yeterli izleme verisi yok (${V} izleyici, ${n} etkileşim)`)
  }
  const titleById = new Map(input.titles.map((t) => [t.videoId, t]))
  const titleRows = data.titleIds.map((id) => titleById.get(id) ?? null)
  const feats = yield* buildContentFeatures(titleRows, input.content)
  tm = mark('icerikOzellikleri', tm)
  const split: Split = yield* splitInteractions(data, { ...DEFAULT_SPLIT, seed: params.seed })
  const role = split.role
  tm = mark('bolme', tm)

  // Topluluk ataması (izleyici başına bir kez)
  const communityIds: string[] = []
  const communityIndex = new Map<string, number>()
  const community = new Int32Array(V).fill(-1)
  for (let v = 0; v < V; v++) {
    let c: string | null = null
    try {
      c = input.communityOf(data.viewerIds[v]!)
    } catch {
      c = null
    }
    if (c !== null) {
      let ci = communityIndex.get(c)
      if (ci === undefined) {
        ci = communityIds.length
        communityIds.push(c)
        communityIndex.set(c, ci)
      }
      community[v] = ci
    }
    if ((v & 1023) === 1023) yield
  }
  const k = communityIds.length
  tm = mark('topluluk', tm)

  const addedAt = Float64Array.from(titleRows, (t) => (t ? Date.parse(t.availability.addedAt) : NaN))
  const genresOf = titleRows.map((t) => t?.genres ?? [])

  /* ── 2. değerlendirme modeli (+ doğrulamayla hiperparametre seçimi) ── */
  const isTrain = (q: number) => role[q] === ROLE_TRAIN
  const isPreTest = (q: number) => role[q] === ROLE_TRAIN || role[q] === ROLE_VALID
  const popTrain = popularityOf(data, isTrain)
  const popPreTest = popularityOf(data, isPreTest)
  const liftTrain = k > 0 ? liftTable(data, isTrain, community, k) : null
  const liftPreTest = k > 0 ? liftTable(data, isPreTest, community, k) : null
  const modelOf = (
    fit: Fitted,
    p: Required<TrainRequest>,
    pop: Float32Array,
    lift: Float32Array | null,
  ): PredictionModel => ({
    runId: '',
    trainedAt: '',
    params: p,
    f: p.factors,
    titleIds: data.titleIds,
    titleIndex: data.titleIndex,
    V: fit.V,
    C: fit.C,
    counts: fit.counts,
    popularity: pop,
    addedAt,
    gram: fit.gram,
    ranker: { mean: new Array<number>(NF).fill(0), std: new Array<number>(NF).fill(1), weights: [], bias: 0 },
    adjust: { cf: [1, 0], content: [1, 0] },
    communities: lift ? { ids: communityIds, lift } : null,
    contentSignals: { tags: false, microgenres: false, embeddings: null },
    sources: input.sources,
    synthetic: input.synthetic,
    note: input.note,
    fingerprint: input.fingerprint,
  })
  const splitViewers: number[] = []
  for (let v = 0; v < V; v++) if (!Number.isNaN(split.testCutoff[v]!)) splitViewers.push(v)
  const validViewers = splitViewers
  const universe = T - split.coldTitles

  /**
   * Doğrulama ölçümü (yalnız iş birlikçi puan): eğitim geçmişinden fold-in, hedef = doğrulama başlıkları.
   * Kesitten önce başlanmış doğrulama başlıkları "devam"dır; aday ya da hedef olmaz. Sınamaya dokunmaz.
   */
  const valViewers = sample(validViewers, EVAL_MAX_VIEWERS, mixSeed(params.seed, 23))
  /** İzleyici başına tüm katalog puanlanır: büyük katalogda daha sık verim */
  const yieldEvery = Math.max(1, Math.floor(40_000 / Math.max(1, T)))
  function* validate(m: PredictionModel): Work<RankingMetrics> {
    const acc = new MetricAccumulator(universe)
    const scores = new Float64Array(T)
    for (let s = 0; s < valViewers.length; s++) {
      const v = valViewers[s]!
      const cutoff = split.validCutoff[v]!
      const hist: { t: number; e: number }[] = []
      const exclude = new Set<number>()
      const targets = new Set<number>()
      for (let q = data.ptr[v]!; q < data.ptr[v + 1]!; q++) {
        const t = data.i[q]!
        if (role[q] === ROLE_TRAIN) {
          hist.push({ t, e: data.engagement[q]! })
          exclude.add(t)
        } else if (role[q] !== ROLE_COLD && data.firstTs[q]! < cutoff) exclude.add(t)
        else if (role[q] === ROLE_VALID) targets.add(t)
      }
      const fi = foldIn(m, hist)
      if (!fi || targets.size === 0) continue
      for (let t = 0; t < T; t++) scores[t] = rowDot(fi.x, m.V, t, m.f)
      acc.add(
        topK(scores, K, (t) => !split.cold[t] && !exclude.has(t)),
        targets,
      )
      if (s % yieldEvery === yieldEvery - 1) yield
    }
    return acc.result()
  }

  const auto = (!fixed.factors || !fixed.regularization) && n <= AUTO_TUNE_MAX_INTERACTIONS
  const candidates: Required<TrainRequest>[] = []
  if (auto) {
    for (const factors of fixed.factors ? [params.factors] : TUNE_FACTORS)
      for (const regularization of fixed.regularization ? [params.regularization] : TUNE_REGULARIZATION)
        candidates.push({ ...params, factors, regularization })
  } else candidates.push(params)
  let evalFit: Fitted | null = null
  let bestScore = -Infinity
  const selection: NonNullable<TrainingRunInfo['selection']> = []
  for (const cand of candidates) {
    const fit = yield* fitFactors(data, isTrain, cand, feats, 11)
    const val = yield* validate(modelOf(fit, cand, popTrain, liftTrain))
    selection.push({
      factors: cand.factors,
      regularization: cand.regularization,
      alpha: cand.alpha,
      validationNdcgAt10: val.ndcgAt10,
      validationRecallAt10: val.recallAt10,
    })
    if (val.ndcgAt10 > bestScore + 1e-9) {
      bestScore = val.ndcgAt10
      evalFit = fit
      params = cand
      run.validationCollaborative = val
    }
  }
  if (!evalFit) throw new Error('değerlendirme modeli kurulamadı')
  run.params = params
  run.selection = auto ? selection : null
  run.evalLoss = evalFit.als.loss.map((x) => Math.round(x * 1e6) / 1e6)
  run.solver = evalFit.als.solver
  const f = params.factors
  tm = mark('degerlendirmeModeli', tm)

  /* ── 3. sıralayıcı: doğrulama çiftleri ── */
  const mTrain = modelOf(evalFit, params, popTrain, liftTrain)
  const rankerViewers = sample(validViewers, RANKER_MAX_VIEWERS, mixSeed(params.seed, 21))
  const rng = mulberry32(mixSeed(params.seed, 22))
  const X: number[] = []
  const Y: number[] = []
  const W: number[] = []
  const feat = new Float64Array(NF)
  for (let s = 0; s < rankerViewers.length; s++) {
    const v = rankerViewers[s]!
    const hist: { t: number; e: number }[] = []
    const pos: number[] = []
    const known = new Set<number>()
    const firstOf = new Map<number, number>()
    const listed = new Set<number>()
    for (let q = data.ptr[v]!; q < data.ptr[v + 1]!; q++) {
      const t = data.i[q]!
      firstOf.set(t, data.firstTs[q]!)
      if (data.inList[q]) listed.add(t)
      if (role[q] === ROLE_TRAIN) {
        hist.push({ t, e: data.engagement[q]! })
        known.add(t)
      } else if (role[q] === ROLE_VALID) {
        pos.push(t)
        known.add(t)
      }
    }
    const fi = foldIn(mTrain, hist)
    if (!fi || pos.length === 0) continue
    const cutoff = split.validCutoff[v]!
    const trainSet = new Set(hist.map((h) => h.t))
    const ctx: FeatureContext = {
      x: fi.x,
      now: cutoff,
      communityRow: nearestCommunity(liftTrain, k, T, hist),
      inProgress: (t) => !trainSet.has(t) && (firstOf.get(t) ?? Infinity) < cutoff,
      inList: (t) => !trainSet.has(t) && listed.has(t) && (firstOf.get(t) ?? Infinity) < cutoff,
    }
    const push = (t: number, label: number, weight: number) => {
      features(mTrain, t, ctx, feat)
      for (let q = 0; q < NF; q++) X.push(feat[q]!)
      Y.push(label)
      W.push(weight)
    }
    for (const t of pos) {
      push(t, 1, 1)
      for (let j = 0; j < NEGATIVES_PER_POSITIVE; j++) {
        // izlenmemiş, soğuk olmayan rastgele başlık (birkaç denemede bulunamazsa atlanır)
        for (let tries = 0; tries < 20; tries++) {
          const cand = Math.floor(rng() * T)
          if (split.cold[cand] || known.has(cand)) continue
          push(cand, 0, 1 / NEGATIVES_PER_POSITIVE)
          break
        }
      }
    }
    if ((s & 63) === 63) yield
  }
  if (Y.length === 0) throw new Error('sıralayıcı için doğrulama çifti yok (yeterli geçmişi olan izleyici yok)')
  const rankerFit: RankerFit = yield* fitRanker(Float64Array.from(X), Uint8Array.from(Y), Float64Array.from(W))
  run.ranker = {
    positives: rankerFit.positives,
    negatives: rankerFit.negatives,
    logLoss: r4(rankerFit.logLoss),
    iterations: rankerFit.iterations,
  }
  tm = mark('siralayici', tm)

  /* ── 4. ölçüm: sınama kümesi ── */
  const mTest = modelOf(evalFit, params, popPreTest, liftPreTest)
  mTest.ranker = rankerFit
  const testViewers = sample(splitViewers, EVAL_MAX_VIEWERS, mixSeed(params.seed, 31))
  const accModel = new MetricAccumulator(universe)
  const accPop = new MetricAccumulator(universe)
  const accGenre = new MetricAccumulator(universe)
  const logits = new Float64Array(T)
  const popScore = new Float64Array(T)
  const genreScore = new Float64Array(T)
  let testInteractions = 0
  let continuationTargets = 0
  let validInteractions = 0
  let trainInteractions = 0
  for (let q = 0; q < n; q++) {
    if (role[q] === ROLE_TEST) testInteractions++
    else if (role[q] === ROLE_VALID) validInteractions++
    else if (role[q] === ROLE_TRAIN) trainInteractions++
  }
  // Popülerlik sıralaması: eşitlikte küçük dizin (topK kuralı)
  for (let t = 0; t < T; t++) popScore[t] = popPreTest[t]!
  for (let s = 0; s < testViewers.length; s++) {
    const v = testViewers[s]!
    const hist: { t: number; e: number }[] = []
    const targets = new Set<number>()
    const firstOf = new Map<number, number>()
    const listed = new Set<number>()
    const genreW = new Map<string, number>()
    for (let q = data.ptr[v]!; q < data.ptr[v + 1]!; q++) {
      const t = data.i[q]!
      firstOf.set(t, data.firstTs[q]!)
      if (data.inList[q]) listed.add(t)
      if (role[q] === ROLE_TRAIN || role[q] === ROLE_VALID) {
        hist.push({ t, e: data.engagement[q]! })
        for (const g of genresOf[t]!) genreW.set(g, (genreW.get(g) ?? 0) + data.engagement[q]!)
      } else if (role[q] === ROLE_TEST) targets.add(t)
    }
    const cutoff = split.testCutoff[v]!
    // Kesitten önce başlanmış sınama başlıkları "devam"dır: hiçbir yöntemde aday ya da hedef olmaz (yalnız keşif ölçülür)
    const histSet = new Set(hist.map((h) => h.t))
    for (const t of [...targets])
      if ((firstOf.get(t) ?? Infinity) < cutoff) {
        targets.delete(t)
        histSet.add(t)
        continuationTargets++
      }
    const fi = foldIn(mTest, hist)
    if (!fi || targets.size === 0) continue
    const ctx: FeatureContext = {
      x: fi.x,
      now: cutoff,
      communityRow: nearestCommunity(liftPreTest, k, T, hist),
      inProgress: (t) => !histSet.has(t) && (firstOf.get(t) ?? Infinity) < cutoff,
      inList: (t) => !histSet.has(t) && listed.has(t) && (firstOf.get(t) ?? Infinity) < cutoff,
    }
    for (let t = 0; t < T; t++) {
      if (split.cold[t] || histSet.has(t)) continue
      features(mTest, t, ctx, feat)
      logits[t] = rankerLogit(rankerFit, feat)
      let gs = 0
      const gl = genresOf[t]!
      for (const g of gl) gs += genreW.get(g) ?? 0
      // tür örtüşmesi; eşitlikte popülerlik
      genreScore[t] = (gl.length ? gs / Math.sqrt(gl.length) : 0) + 1e-6 * popPreTest[t]!
    }
    const allowed = (t: number) => !split.cold[t] && !histSet.has(t)
    accModel.add(topK(logits, K, allowed), targets)
    accPop.add(topK(popScore, K, allowed), targets)
    accGenre.add(topK(genreScore, K, allowed), targets)
    if (s % yieldEvery === yieldEvery - 1) yield
  }
  tm = mark('olcum', tm)

  /* ── 4b. soğuk başlangıç: çıkarılan başlıklar yalnız içerik kulesiyle ── */
  let coldStart: RankingMetrics | null = null
  let coldViewersN = 0
  if (split.coldTitles > 0) {
    const coldList: number[] = []
    for (let t = 0; t < T; t++) if (split.cold[t]) coldList.push(t)
    const half = (v: number) => mixSeed(params.seed ^ 0x5bd1e995, v) & 1
    const coldPop = new Float64Array(T)
    for (let v = 0; v < V; v++) {
      if (half(v) !== 0) continue
      for (let q = data.ptr[v]!; q < data.ptr[v + 1]!; q++) if (role[q] === ROLE_COLD) coldPop[data.i[q]!]!++
    }
    const accCold = new MetricAccumulator(coldList.length)
    const accColdPop = new MetricAccumulator(coldList.length)
    const contentScore = new Float64Array(T)
    const candidates: number[] = []
    for (let v = 0; v < V; v++) {
      if (half(v) !== 1) continue
      let hasCold = false
      let hasHist = false
      for (let q = data.ptr[v]!; q < data.ptr[v + 1]!; q++) {
        if (role[q] === ROLE_COLD) hasCold = true
        else if (role[q] === ROLE_TRAIN || role[q] === ROLE_VALID) hasHist = true
      }
      if (hasCold && hasHist) candidates.push(v)
    }
    const coldViewers = sample(candidates, EVAL_MAX_VIEWERS, mixSeed(params.seed, 41))
    for (let s = 0; s < coldViewers.length; s++) {
      const v = coldViewers[s]!
      const hist: { t: number; e: number }[] = []
      const targets = new Set<number>()
      for (let q = data.ptr[v]!; q < data.ptr[v + 1]!; q++) {
        if (role[q] === ROLE_COLD) targets.add(data.i[q]!)
        else if (role[q] === ROLE_TRAIN || role[q] === ROLE_VALID) hist.push({ t: data.i[q]!, e: data.engagement[q]! })
      }
      const fi = foldIn(mTest, hist)
      if (!fi) continue
      for (const t of coldList) {
        let d = 0
        for (let c = 0; c < f; c++) d += fi.x[c]! * evalFit.C[t * f + c]!
        contentScore[t] = d
      }
      const allowed = (t: number) => split.cold[t] === 1
      accCold.add(topK(contentScore, K, allowed), targets)
      accColdPop.add(topK(coldPop, K, allowed), targets)
      if ((s & 63) === 63) yield
    }
    coldViewersN = accCold.users
    if (accCold.users > 0) {
      coldStart = accCold.result()
      run.coldStartPopularity = accColdPop.result()
    }
  }
  run.metrics = {
    model: accModel.result(),
    popularity: accPop.result(),
    genreAffinity: accGenre.result(),
    coldStart,
  }
  run.split = {
    trainInteractions,
    validationInteractions: validInteractions,
    testInteractions,
    continuationTargets,
    testViewers: accModel.users,
    splitViewers: splitViewers.length,
    rankerViewers: rankerViewers.length,
    coldTitles: split.coldTitles,
    coldStartViewers: coldViewersN,
    coldStartCandidates: split.coldTitles,
  }
  tm = mark('sogukBaslangic', tm)

  /* ── 5. üretim modeli: tüm etkileşimler ── */
  const prodFit = yield* fitFactors(data, () => true, params, feats, 13)
  run.loss = prodFit.als.loss.map((x) => Math.round(x * 1e6) / 1e6)
  // Puan ölçeği eşleme: üretim puanı → değerlendirme modeli ölçeği (sıralayıcı o ölçekte öğrendi)
  const evalCf = scoreStats(evalFit.als.x, evalFit.V, V, T, f, mixSeed(params.seed, 51))
  const prodCf = scoreStats(prodFit.als.x, prodFit.V, V, T, f, mixSeed(params.seed, 51))
  const evalCt = scoreStats(evalFit.als.x, evalFit.C, V, T, f, mixSeed(params.seed, 52))
  const prodCt = scoreStats(prodFit.als.x, prodFit.C, V, T, f, mixSeed(params.seed, 52))
  const map = (from: [number, number], to: [number, number]): [number, number] => {
    const a = to[1] / from[1]
    return [a, to[0] - a * from[0]]
  }
  const all = () => true
  const model: PredictionModel = {
    runId: '',
    trainedAt: '',
    params,
    f,
    titleIds: data.titleIds,
    titleIndex: data.titleIndex,
    V: prodFit.V,
    C: prodFit.C,
    counts: prodFit.counts,
    popularity: popularityOf(data, all),
    addedAt,
    gram: prodFit.gram,
    ranker: { mean: rankerFit.mean, std: rankerFit.std, weights: rankerFit.weights, bias: rankerFit.bias },
    adjust: { cf: map(prodCf, evalCf), content: map(prodCt, evalCt) },
    communities: k > 0 ? { ids: communityIds, lift: liftTable(data, all, community, k) } : null,
    contentSignals: {
      tags: feats.signals.tags,
      microgenres: feats.signals.microgenres,
      embeddings: feats.signals.embeddings ? input.embeddingLabel : null,
    },
    sources: input.sources,
    synthetic: input.synthetic,
    note: input.note,
    fingerprint: input.fingerprint,
  }
  mark('uretimModeli', tm)
  // Kararlı kimlik: parametreler + ağırlıklar + ölçümler (aynı veri + tohum → aynı kimlik)
  const h = createHash('sha1')
    .update(JSON.stringify({ params, metrics: run.metrics, ranker: model.ranker, adjust: model.adjust }))
    .update(Buffer.from(model.V.buffer, model.V.byteOffset, model.V.byteLength))
    .update(Buffer.from(model.C.buffer, model.C.byteOffset, model.C.byteLength))
    .digest('hex')
  run.modelHash = `tm_${h.slice(0, 12)}`
  model.runId = run.runId
  run.durationMs = Math.round(performance.now() - t0)
  return { model, run }
}
