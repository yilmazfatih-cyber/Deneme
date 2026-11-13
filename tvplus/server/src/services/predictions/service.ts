/**
 * Tahmin servisi: eğitimin yaşam döngüsü (arka planda, kısa dilimlerle), kalıcılık ve istek anında tahmin.
 *
 * Yaşam döngüsü
 *   - Açılışta dataDir/models/ altındaki model yüklenir; veri ve içerik işaretleri anlamlı değişmediyse yeniden
 *     eğitilmez. Model yoksa ya da veri anlamlı değiştiyse arka planda eğitilir (izleme / gömme / mikro tür /
 *     etiket sayaçları birkaç saniye durulduktan sonra; ilk açılışta gömme ve topluluk hesabı beklenir).
 *   - Eğitim sürerken önceki model sunulmaya devam eder (ready/info/match yanıt verir).
 *   - Testlerde (autoStart false) hiçbir şey kendiliğinden eğitilmez.
 *
 * Sunum
 *   - Profilin izleyici vektörü kendi özetlerinden istek anında çözülür (fold-in); izleme sayacına göre önbellekte.
 *   - Geçmişi olmayan profil: match null, scores boş; topPicks kişisel olmayan yedek sıralama (match 0).
 *   - Profilin görebileceği başlıklar (çocuk / olgunluk) catalog.isVisibleTo ile süzülür.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type {
  ModelViewerSample,
  PredictionExplanation,
  PredictionModelInfo,
  TrainRequest,
  ViewerPrediction,
  ViewingFact,
  ViewingSource,
} from '../../../../shared/intelligence'
import type { PredictionService } from '../../kernel/intelligence'
import type { ProfileRecord } from '../../kernel/context'
import { buildContentFeatures, type ContentSources } from './content'
import type { Work } from './data'
import {
  contributions,
  features,
  foldIn,
  loadModel,
  MODEL_FORMAT,
  nearestCommunity,
  saveModel,
  type FeatureContext,
  type FoldIn,
  type Fingerprint,
  type PredictionModel,
} from './model'
import { matchOf, NF, RANKER_FEATURES, rankerLogit } from './ranker'
import { createHash } from 'node:crypto'
import { DEFAULT_PARAMS, emptyRun, train, type TrainInput, type TrainingRunInfo } from './train'

export interface PredictionTuning {
  /** false: hiçbir eğitim kendiliğinden başlamaz (testler) */
  autoStart: boolean
  /** Arka plan sürücüsünün tek seferde koştuğu süre (ms) */
  sliceMs: number
  /** Sayaç yoklama aralığı ve durulma süresi (ms) */
  pollMs: number
  debounceMs: number
  /** Açılışta gömme / topluluk hesabını en çok bu kadar bekle (ms) */
  maxWaitMs: number
}

/** Gerçek veri bundan az izleyiciye sahipse (en az 3 başlıklı) sentetik örnek eğitime eklenir */
export const MIN_REAL_VIEWERS = 50
/** Etkileşim / izleyici sayısında bu orandan büyük değişim "anlamlı"dır */
export const MATERIAL_SHARE = 0.05
const MAX_RUNS = 20
const PROFILE_CACHE = 256

export interface PredictionImpl extends PredictionService {
  /** Arka planda eğitim başlatır; RUNNING durumundaki çalıştırmayı hemen döner (REST). */
  startTraining(req?: TrainRequest, reason?: string): TrainingRunInfo
  /** Eğitir ve bitmesini bekler (testler, betikler). */
  trainNow(req?: TrainRequest): Promise<TrainingRunInfo>
  /** Veri / içerik değişikliğini şimdi denetler; gerekiyorsa eğitimi başlatır. */
  checkNow(): { decision: 'train' | 'unchanged' | 'busy' | 'no-data'; reason: string }
  idle(): Promise<void>
  busy(): boolean
  runs(): TrainingRunInfo[]
  model(): PredictionModel | null
  /** İzleyici (takma kimlik) ya da profil için tahmin (stüdyo simülatörü) */
  predict(who: { viewerId?: string; profileGuid?: string }, first: number): ViewerPrediction
  explainFor(who: { viewerId?: string; profileGuid?: string }, titleId: number): PredictionExplanation | null
  sampleViewers(communityId: string | null, first: number): ModelViewerSample[]
}

interface Personal {
  viewerId: string
  fi: FoldIn | null
  /** Başlık dizini başına logit; görünmeyen başlık NaN */
  logits: Float64Array
  history: ViewingFact[]
  historySet: Set<number>
  watched: Set<number>
  ctx: FeatureContext
  communityId: string | null
}

type Who = { viewerId?: string; profileGuid?: string }

export function runSync<T>(gen: Work<T>): T {
  for (;;) {
    const r = gen.next()
    if (r.done) return r.value
  }
}

export async function runAsync<T>(gen: Work<T>, sliceMs: number, cancelled: () => boolean): Promise<T> {
  for (;;) {
    const t0 = performance.now()
    for (;;) {
      const r = gen.next()
      if (r.done) return r.value
      if (performance.now() - t0 >= sliceMs) break
    }
    await new Promise<void>((resolve) => setImmediate(resolve))
    if (cancelled()) throw new Error('eğitim iptal edildi')
  }
}

const noteFor = (sources: ViewingSource[]): string => {
  if (sources.length === 0) return 'İzleme verisi yok; model eğitilemez.'
  const real = sources.filter((x) => x !== 'SYNTHETIC')
  if (sources.includes('SYNTHETIC') && real.length > 0)
    return (
      `Gerçek izleme verisi (${real.join(', ')}) henüz eşiğin altında; model SENTETİK örnekle birlikte eğitildi. ` +
      'Ölçümler gerçek izleyici davranışını göstermez.'
    )
  if (sources.includes('SYNTHETIC'))
    return (
      'Model SENTETİK örnek izleme verisiyle eğitildi; ölçümler gerçek izleyici davranışını göstermez. ' +
      'Mixpanel verisi bağlanınca aynı hattan yeniden eğitilir.'
    )
  return `Model gerçek izleme verisiyle eğitildi (${sources.join(', ')}).`
}

export function createPredictionService(app: FastifyInstance, tuning: PredictionTuning): PredictionImpl {
  const dir = join(app.config.dataDir, 'models')
  const runsFile = join(dir, 'prediction-runs.json')
  const svc = () => app.services

  let model: PredictionModel | null = null
  let seq = 0
  try {
    model = loadModel(dir)
    if (model) seq = 1
  } catch (err) {
    app.log.warn({ err }, 'tahmin modeli yüklenemedi; yeniden eğitilecek')
    model = null
  }
  let runs: TrainingRunInfo[] = []
  try {
    if (existsSync(runsFile)) runs = JSON.parse(readFileSync(runsFile, 'utf8')) as TrainingRunInfo[]
    // yarıda kalmış (sunucu kapanmış) çalıştırmalar
    for (const r of runs)
      if (r.status === 'RUNNING') {
        r.status = 'FAILED'
        r.error = 'sunucu eğitim sürerken kapandı'
      }
  } catch {
    runs = []
  }
  if (model) app.log.info(`tahmin modeli diskten yüklendi (${model.runId}); yeniden eğitim gerekmedikçe kullanılacak`)

  let job: { run: TrainingRunInfo; promise: Promise<void>; cancelled: boolean } | null = null
  let closed = false
  let lastRequest: TrainRequest = {}

  const persistRuns = () => {
    try {
      mkdirSync(dir, { recursive: true })
      const tmp = `${runsFile}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(runs.slice(0, MAX_RUNS)))
      renameSync(tmp, runsFile)
    } catch (err) {
      app.log.warn({ err }, 'eğitim kayıtları yazılamadı')
    }
  }

  /* ───────────── veri anlık görüntüsü ───────────── */

  const contentSources = (): ContentSources => {
    const s = svc()
    let embReady = false
    try {
      embReady = s.embeddings.ready()
    } catch {
      embReady = false
    }
    return {
      tags: (titleId) => {
        const e = s.tagging.effective(titleId)
        return e.basis === 'NONE' ? null : { scales: e.scales, facets: e.facets, descriptors: e.descriptors }
      },
      microgenres: (titleId) => s.microgenres.ofTitle(titleId).map((m) => m.id),
      embedding: (titleId) => (embReady ? s.embeddings.titleVector(titleId) : null),
    }
  }

  const embeddingLabel = (): string | null => {
    try {
      const s = svc()
      if (!s.embeddings.ready()) return null
      const i = s.embeddings.info()
      return `${i.provider} · ${i.modelVersion}`
    } catch {
      return null
    }
  }

  const audienceRun = (): string | null => {
    try {
      return svc().audience.run()?.runId ?? null
    } catch {
      return null
    }
  }

  /** Eğitim kaynakları: etkin kaynaklar; gerçek veri yetersizse sentetik örnek eklenir. */
  const gather = (): Omit<TrainInput, 'fingerprint'> & { fingerprint: Omit<Fingerprint, 'content'> } & {
    contentHash: string
  } => {
    const s = svc()
    let sources: ViewingSource[] = []
    let facts: ViewingFact[] = []
    try {
      // Etkin kaynaklar: gerçek veri eşiğin altındaysa izleme servisi SENTETİK örneği de katar
      // (kernel/intelligence.ts activeSources). Eşik yokmuş gibi gerçek veri tek başına çok azsa yine örnek eklenir.
      sources = [...s.viewing.activeSources()]
      facts = s.viewing.facts()
      if (!sources.includes('SYNTHETIC')) {
        const perViewer = new Map<string, number>()
        for (const f of facts) perViewer.set(f.viewerId, (perViewer.get(f.viewerId) ?? 0) + 1)
        let realViewers = 0
        for (const c of perViewer.values()) if (c >= 3) realViewers++
        const synth = s.viewing.sources().find((x) => x.source === 'SYNTHETIC')
        if (realViewers < MIN_REAL_VIEWERS && synth && synth.events > 0) {
          sources = [...sources, 'SYNTHETIC']
          facts = s.viewing.facts({ sources })
        }
      }
    } catch (err) {
      app.log.warn({ err }, 'tahmin modeli: izleme verisi okunamadı')
    }
    let engagementSum = 0
    let lastTs = 0
    const viewers = new Set<string>()
    for (const f of facts) {
      engagementSum += f.engagement
      if (f.lastTs > lastTs) lastTs = f.lastTs
      viewers.add(f.viewerId)
    }
    const titles = s.catalog.allTitles()
    const content = contentSources()
    const byId = new Map(titles.map((t) => [t.videoId, t]))
    const ids = [...byId.keys()].sort((a, b) => a - b)
    const feats = runSync(buildContentFeatures(ids.map((id) => byId.get(id)!), content))
    const h = createHash('sha1')
    h.update(feats.names.join('|'))
    for (const r of feats.rows) h.update(Buffer.from(r.idx.buffer)).update(Buffer.from(r.val.buffer))
    return {
      facts,
      sources,
      synthetic: sources.includes('SYNTHETIC'),
      note: noteFor(sources),
      titles,
      content,
      communityOf: (viewerId) => {
        try {
          return svc().audience.ofViewer(viewerId)?.communityId ?? null
        } catch {
          return null
        }
      },
      audienceRunId: audienceRun(),
      embeddingLabel: embeddingLabel(),
      fingerprint: {
        sources,
        interactions: facts.length,
        viewers: viewers.size,
        engagementSum: Math.round(engagementSum * 1000) / 1000,
        lastTs,
        audience: audienceRun(),
      },
      contentHash: h.digest('hex').slice(0, 16),
    }
  }

  /** Anlamlı değişiklik var mı? Varsa gerekçe (Türkçe), yoksa null. */
  const materialChange = (prev: Fingerprint | null, cur: Fingerprint): string | null => {
    if (!prev) return 'model yok'
    const majorOf = (fp: Fingerprint) => fp.sources.join(',')
    const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, b)
    if (prev.content !== cur.content) return 'içerik işaretleri değişti (gömme / etiket / mikro tür / katalog)'
    if (rel(cur.interactions, prev.interactions) >= MATERIAL_SHARE)
      return `etkileşim sayısı değişti (${prev.interactions} → ${cur.interactions})`
    if (rel(cur.viewers, prev.viewers) >= MATERIAL_SHARE) return `izleyici sayısı değişti (${prev.viewers} → ${cur.viewers})`
    // Kaynak kümesi: yalnız veri payı da değiştiyse (ör. sentetiğe birkaç gerçek olay eklenmesi anlamlı değildir)
    if (majorOf(prev) !== majorOf(cur) && !cur.sources.includes('SYNTHETIC')) return 'eğitim kaynakları değişti'
    if (prev.audience === null && cur.audience !== null) return 'zevk toplulukları hazır'
    return null
  }

  /* ───────────── eğitim ───────────── */

  const install = (m: PredictionModel, run: TrainingRunInfo) => {
    model = m
    seq++
    cache.clear()
    try {
      saveModel(dir, m)
    } catch (err) {
      app.log.warn({ err }, 'tahmin modeli diske yazılamadı')
    }
    const mt = run.metrics
    app.log.info(
      {
        runId: run.runId,
        viewers: run.viewers,
        titles: run.titles,
        interactions: run.interactions,
        durationMs: run.durationMs,
        recallAt10: mt?.model.recallAt10,
        popularityRecallAt10: mt?.popularity.recallAt10,
      },
      'tahmin modeli eğitildi',
    )
  }

  const startTraining = (req?: TrainRequest, reason = 'istek'): TrainingRunInfo => {
    // Açıkça istenen değerler bir sonraki otomatik eğitimde de korunur; verilmeyenler varsayılan / doğrulamayla seçilir
    if (req) lastRequest = { ...req }
    const want = req ?? lastRequest
    const params: Required<TrainRequest> = {
      factors: want.factors ?? DEFAULT_PARAMS.factors,
      iterations: want.iterations ?? DEFAULT_PARAMS.iterations,
      regularization: want.regularization ?? DEFAULT_PARAMS.regularization,
      alpha: want.alpha ?? DEFAULT_PARAMS.alpha,
      seed: want.seed ?? DEFAULT_PARAMS.seed,
    }
    const fixed = { factors: want.factors !== undefined, regularization: want.regularization !== undefined }
    if (job) job.cancelled = true
    const g = gather()
    const input: TrainInput = { ...g, fingerprint: { ...g.fingerprint, content: g.contentHash } }
    const runId = `tr_${Date.now().toString(36)}_${(runs.length + 1).toString(36)}`
    const run = emptyRun(runId, params, input)
    runs.unshift(run)
    runs = runs.slice(0, MAX_RUNS)
    persistRuns()
    app.log.info(`tahmin modeli eğitimi başladı (${reason}; ${input.facts.length} özet)`)
    const t0 = performance.now()
    const me: { run: TrainingRunInfo; promise: Promise<void>; cancelled: boolean } = {
      run,
      cancelled: false,
      promise: Promise.resolve(),
    }
    me.promise = runAsync(train(input, params, run, fixed), tuning.sliceMs, () => closed || me.cancelled)
      .then((out) => {
        run.status = 'DONE'
        run.finishedAt = new Date().toISOString()
        run.durationMs = Math.round(performance.now() - t0)
        if (out.model) {
          out.model.trainedAt = run.finishedAt
          install(out.model, run)
        }
      })
      .catch((err: unknown) => {
        run.status = 'FAILED'
        run.error = err instanceof Error ? err.message : String(err)
        run.finishedAt = new Date().toISOString()
        run.durationMs = Math.round(performance.now() - t0)
        if (!closed && !me.cancelled) app.log.warn(`tahmin modeli eğitilemedi: ${run.error}`)
      })
      .finally(() => {
        if (job === me) job = null
        if (!closed) persistRuns()
      })
    job = me
    return run
  }

  const checkNow = (): ReturnType<PredictionImpl['checkNow']> => {
    if (job) return { decision: 'busy', reason: 'eğitim sürüyor' }
    const g = gather()
    if (g.facts.length === 0) return { decision: 'no-data', reason: 'izleme verisi yok' }
    const fp: Fingerprint = { ...g.fingerprint, content: g.contentHash }
    const why = materialChange(model?.fingerprint ?? null, fp)
    if (!why) return { decision: 'unchanged', reason: 'veri anlamlı değişmedi' }
    startTraining(undefined, why)
    return { decision: 'train', reason: why }
  }

  /* ───────────── otomatik yeniden eğitim (yoklama + durulma) ───────────── */

  const bootAt = Date.now()
  let lastStamp = ''
  let lastChangeAt = 0
  let checkedStamp = ''
  const stampNow = (): string => {
    const s = svc()
    const rev = (fn: () => number) => {
      try {
        return fn()
      } catch {
        return -1
      }
    }
    return [
      rev(() => s.viewing.revision()),
      rev(() => s.embeddings.revision()),
      rev(() => s.microgenres.revision()),
      rev(() => s.tagging.revision()),
    ].join('|')
  }
  const tick = () => {
    if (closed || job) return
    const stamp = stampNow()
    const now = Date.now()
    if (stamp !== lastStamp) {
      lastStamp = stamp
      lastChangeAt = now
      return
    }
    if (now - lastChangeAt < tuning.debounceMs || stamp === checkedStamp) return
    const waiting = now - bootAt < tuning.maxWaitMs
    if (waiting) {
      try {
        const s = svc()
        if (!s.embeddings.ready()) return
        if (s.viewing.sources().some((x) => x.events > 0) && s.audience.run() === null) return
      } catch {
        // bekleme denetimi başarısızsa sürdür
      }
    }
    checkedStamp = stamp
    try {
      const r = checkNow()
      if (r.decision === 'unchanged' && model)
        app.log.info(`tahmin modeli güncel (${model.runId}); yeniden eğitim gerekmedi`)
    } catch (err) {
      app.log.warn({ err }, 'tahmin modeli: değişiklik denetimi başarısız')
    }
  }
  if (tuning.autoStart) {
    let timer: NodeJS.Timeout | null = null
    app.addHook('onReady', async () => {
      timer = setInterval(tick, tuning.pollMs)
      timer.unref()
    })
    app.addHook('onClose', async () => {
      if (timer) clearInterval(timer)
    })
  }
  app.addHook('onClose', async () => {
    closed = true
    if (job) await job.promise
  })

  /* ───────────── sunum ───────────── */

  const cache = new Map<string, Personal | null>()

  const profileOf = (guid: string): ProfileRecord | null => {
    try {
      return svc().identity.getProfile(guid)
    } catch {
      return null
    }
  }

  const personal = (who: Who): Personal | null => {
    const m = model
    if (!m) return null
    const s = svc()
    let viewingRev = -1
    try {
      viewingRev = s.viewing.revision()
    } catch {
      viewingRev = -1
    }
    const key = `${seq}|${viewingRev}|${who.profileGuid !== undefined ? `p:${who.profileGuid}` : `v:${who.viewerId ?? ''}`}`
    if (cache.has(key)) {
      const hit = cache.get(key)!
      cache.delete(key)
      cache.set(key, hit)
      return hit
    }
    const computed = computePersonal(m, who)
    cache.set(key, computed)
    while (cache.size > PROFILE_CACHE) cache.delete(cache.keys().next().value!)
    return computed
  }

  const computePersonal = (m: PredictionModel, who: Who): Personal => {
    const s = svc()
    const guid = who.profileGuid
    let viewerId = who.viewerId ?? ''
    let facts: ViewingFact[] = []
    try {
      if (guid !== undefined) viewerId = s.viewing.viewerIdOfProfile(guid)
      facts = s.viewing.factsOfViewer(viewerId)
    } catch {
      facts = []
    }
    const T = m.titleIds.length
    const best = new Map<number, ViewingFact>()
    for (const f of facts) {
      const t = m.titleIndex.get(f.titleId)
      if (t === undefined) continue
      const cur = best.get(t)
      if (!cur || f.engagement > cur.engagement) best.set(t, f)
    }
    const hist = [...best].sort((a, b) => a[0] - b[0]).map(([t, f]) => ({ t, e: f.engagement }))
    const fi = foldIn(m, hist)
    const historySet = new Set(best.keys())
    const watched = new Set<number>()
    const started = new Set<number>()
    for (const [t, f] of best) {
      if (f.completions > 0 || f.engagement >= 0.75) watched.add(t)
      else if (f.plays > 0 || f.watchedSec > 0) started.add(t)
    }
    const listed = new Set<number>()
    for (const [t, f] of best) if (f.inList) listed.add(t)
    let profile: ProfileRecord | null = null
    let communityId: string | null = null
    if (guid !== undefined) {
      profile = profileOf(guid)
      try {
        for (const id of s.progress.myList(guid)) {
          const t = m.titleIndex.get(id)
          if (t !== undefined) listed.add(t)
        }
        for (const { titleId } of s.progress.continueWatching(guid)) {
          const t = m.titleIndex.get(titleId)
          if (t !== undefined && !watched.has(t)) started.add(t)
        }
        for (const id of s.progress.recentTitles(guid)) {
          const t = m.titleIndex.get(id)
          if (t !== undefined && s.progress.watchStatus(guid, id) === 'WATCHED') {
            watched.add(t)
            started.delete(t)
          }
        }
      } catch {
        // ilerleme servisi yoksa yalnız izleme özetleri
      }
      try {
        communityId = s.audience.ofProfile(guid)?.communityId ?? null
      } catch {
        communityId = null
      }
    } else {
      try {
        communityId = s.audience.ofViewer(viewerId)?.communityId ?? null
      } catch {
        communityId = null
      }
    }
    const communityRow = m.communities
      ? nearestCommunity(m.communities.lift, m.communities.ids.length, T, hist)
      : -1
    const ctx: FeatureContext = {
      x: fi?.x ?? null,
      now: Date.now(),
      communityRow,
      inProgress: (t) => started.has(t),
      inList: (t) => listed.has(t),
    }
    const logits = new Float64Array(T)
    const feat = new Float64Array(NF)
    for (let t = 0; t < T; t++) {
      const visible = guid === undefined ? true : s.catalog.isVisibleTo(profile, m.titleIds[t]!)
      if (!visible) {
        logits[t] = NaN
        continue
      }
      features(m, t, ctx, feat)
      logits[t] = rankerLogit(m.ranker, feat)
    }
    return {
      viewerId,
      fi,
      logits,
      history: [...facts].sort((a, b) => b.lastTs - a.lastTs || a.titleId - b.titleId),
      historySet,
      watched,
      ctx,
      communityId,
    }
  }

  const ranked = (
    p: Personal,
    m: PredictionModel,
    limit: number,
    opts: { type?: 'MOVIE' | 'SHOW'; excludeWatched?: boolean; excludeHistory?: boolean } = {},
  ): { titleId: number; score: number; match: number }[] => {
    const s = svc()
    const order: number[] = []
    for (let t = 0; t < m.titleIds.length; t++) {
      if (Number.isNaN(p.logits[t]!)) continue
      if (opts.excludeHistory && p.historySet.has(t)) continue
      if (opts.excludeWatched && p.watched.has(t)) continue
      if (opts.type && s.catalog.getTitle(m.titleIds[t]!)?.type !== opts.type) continue
      order.push(t)
    }
    order.sort((a, b) => p.logits[b]! - p.logits[a]! || m.titleIds[a]! - m.titleIds[b]!)
    return order.slice(0, Math.max(0, Math.floor(limit))).map((t) => ({
      titleId: m.titleIds[t]!,
      score: round6(p.logits[t]!),
      match: p.fi ? matchOf(p.logits[t]!) : 0,
    }))
  }

  const explainWith = (p: Personal | null, titleId: number): PredictionExplanation | null => {
    const m = model
    if (!m || !p || !p.fi) return null
    const t = m.titleIndex.get(titleId)
    if (t === undefined || Number.isNaN(p.logits[t]!)) return null
    const feat = new Float64Array(NF)
    features(m, t, p.ctx, feat)
    const parts = new Float64Array(NF)
    const logit = rankerLogit(m.ranker, feat, 0, parts)
    const contrib = contributions(m, p.fi, t)
      .filter((c) => c.weight > 0 && c.t !== t)
      .sort((a, b) => b.weight - a.weight || a.t - b.t)
      .slice(0, 5)
    const s = svc()
    const nameOf = (id: number) => s.catalog.getTitle(id)?.title ?? `#${id}`
    const reasons: string[] = []
    const partOf = (name: string) => parts[RANKER_FEATURES.findIndex((f) => f.name === name)]!
    if (contrib.length > 0 && partOf('isbirlikci') > 0)
      reasons.push(`İzlediğin ${nameOf(m.titleIds[contrib[0]!.t]!)} ile aynı zevk çizgisinde`)
    if (partOf('icerik') > 0.25 && m.counts[t]! < 5) reasons.push('İçeriği izlediklerine benziyor')
    if (partOf('topluluk') > 0.15) reasons.push('Zevk topluluğunda öne çıkıyor')
    if (feat[3]! > 0.6) reasons.push('Yeni eklendi')
    if (feat[5]! > 0) reasons.push('Yarım kaldı; kaldığın yerden sürdür')
    if (feat[6]! > 0) reasons.push('Listende')
    if (partOf('populerlik') > 0.3) reasons.push('Çok izleniyor')
    if (reasons.length === 0) reasons.push(logit > 0 ? 'Zevkine uygun görünüyor' : 'Zevkine pek uymuyor')
    return {
      titleId,
      match: matchOf(logit),
      score: round6(logit),
      parts: [
        ...RANKER_FEATURES.map((f, k) => ({ name: f.name, value: round6(feat[k]!), contribution: round6(parts[k]!) })),
        { name: 'sabit', value: 1, contribution: round6(m.ranker.bias) },
      ],
      becauseOf: contrib.map((c) => ({ titleId: m.titleIds[c.t]!, weight: round6(c.weight) })),
      reasons,
    }
  }

  const info = (): PredictionModelInfo => {
    const m = model
    const done = runs.filter((r) => r.status === 'DONE').length
    const run = runs[0] ?? null
    return {
      ready: m !== null,
      version: `tahmin-${MODEL_FORMAT} · ${done} eğitim`,
      algorithm: 'örtük geri bildirimli ağırlıklı ALS + içerik kulesi (ridge) + lojistik sıralayıcı',
      trainedAt: m?.trainedAt ?? null,
      run,
      features: m
        ? RANKER_FEATURES.map((f, k) => ({
            name: f.name,
            description: f.description,
            weight: round6(m.ranker.weights[k] ?? 0),
          }))
        : [],
      contentSignals: m?.contentSignals ?? { tags: false, microgenres: false, embeddings: null },
      note: m ? m.note : job ? 'Model eğitiliyor; ilk eğitim bitince hazır olur.' : 'Model henüz eğitilmedi.',
    }
  }

  let samplesCache: { key: string; rows: { viewerId: string; titles: number; hours: number }[] } | null = null
  const sampleViewers = (communityId: string | null, first: number): ModelViewerSample[] => {
    const s = svc()
    const m = model
    const sources = m?.sources ?? []
    const key = `${seq}|${s.viewing.revision()}`
    if (!samplesCache || samplesCache.key !== key) {
      const acc = new Map<string, { titles: number; sec: number }>()
      for (const f of sources.length ? s.viewing.facts({ sources }) : []) {
        const a = acc.get(f.viewerId) ?? { titles: 0, sec: 0 }
        a.titles++
        a.sec += f.watchedSec
        acc.set(f.viewerId, a)
      }
      samplesCache = {
        key,
        rows: [...acc]
          .map(([viewerId, a]) => ({ viewerId, titles: a.titles, hours: Math.round((a.sec / 3600) * 10) / 10 }))
          .sort((a, b) => b.titles - a.titles || (a.viewerId < b.viewerId ? -1 : 1)),
      }
    }
    const out: ModelViewerSample[] = []
    for (const r of samplesCache.rows) {
      if (out.length >= first) break
      let c: string | null = null
      try {
        c = s.audience.ofViewer(r.viewerId)?.communityId ?? null
      } catch {
        c = null
      }
      if (communityId !== null && c !== communityId) continue
      out.push({ viewerId: r.viewerId, communityId: c, titles: r.titles, hours: r.hours })
    }
    return out
  }

  const impl: PredictionImpl = {
    ready: () => model !== null,
    info,
    match(profileGuid, titleId) {
      const m = model
      const p = personal({ profileGuid })
      if (!m || !p || !p.fi) return null
      const t = m.titleIndex.get(titleId)
      if (t === undefined || Number.isNaN(p.logits[t]!)) return null
      return matchOf(p.logits[t]!)
    },
    scores(profileGuid, titleIds) {
      const out = new Map<number, number>()
      const m = model
      const p = personal({ profileGuid })
      if (!m || !p || !p.fi) return out
      for (const id of titleIds) {
        const t = m.titleIndex.get(id)
        if (t === undefined || Number.isNaN(p.logits[t]!)) continue
        out.set(id, round6(p.logits[t]!))
      }
      return out
    },
    topPicks(profileGuid, limit, opts) {
      const m = model
      const p = personal({ profileGuid })
      if (!m || !p) return []
      return ranked(p, m, limit, opts ?? {})
    },
    explain: (profileGuid, titleId) => explainWith(personal({ profileGuid }), titleId),
    revision: () => seq,

    startTraining,
    trainNow: async (req) => {
      const run = startTraining(req)
      while (job && job.run === run) await job.promise
      return run
    },
    checkNow,
    idle: async () => {
      while (job) await job.promise
    },
    busy: () => job !== null,
    runs: () => runs,
    model: () => model,
    predict(who, first) {
      const m = model
      const p = personal(who)
      const history = (p?.history ?? []).slice(0, 50).map((f) => ({ titleId: f.titleId, engagement: f.engagement }))
      return {
        viewerId: p?.viewerId ?? who.viewerId ?? '',
        communityId: p?.communityId ?? null,
        history,
        picks: m && p ? ranked(p, m, first, { excludeHistory: true }) : [],
      }
    },
    explainFor: (who, titleId) => explainWith(personal(who), titleId),
    sampleViewers,
  }
  return impl
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6
