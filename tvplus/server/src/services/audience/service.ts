/**
 * Zevk toplulukları servisi: anlık görüntü (olgular + katalog + etiketler) → özellik uzayı → izleyici matrisi →
 * küresel k-ortalama → topluluk tanımları. Son çalıştırma ve atamalar kalıcı depoda tutulur.
 *
 * Tazeleme tembeldir: okuma anında izleme / mikro tür / etiketleme sayaçları değişmişse yeni hesap ARKA PLANDA başlar
 * ve o bitene kadar önceki çalıştırma sunulur. Hiç çalıştırma yoksa ve veri küçükse ilk hesap eşzamanlıdır.
 */
import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { ContentTitle } from '../../../../shared/content-schema'
import type { ClusteringRun, TasteCommunity, ViewingFact, ViewingSource } from '../../../../shared/intelligence'
import type { AudienceService } from '../../kernel/intelligence'
import { createStore, type Store } from '../../kernel/store'
import { describe, type TitleLift } from './describe'
import { buildFeatureSpace, buildViewerMatrix, viewerVector, type FeatureDef, type FeatureSpace } from './features'
import { cluster, round, type Work } from './kmeans'

/** Sözleşmedeki ClusteringRun + tanılama alanları (atanmamış izleyici, süre, aday k'ların siluetleri). */
export interface ClusteringRunInfo extends ClusteringRun {
  /** Geçmişi yetersiz olduğu için kümelemeye girmeyen izleyiciler */
  unassigned: number
  durationMs: number
  candidates: { k: number; silhouette: number | null }[]
}

export interface AudienceImpl extends AudienceService {
  /** Olay döngüsünü kilitlemeden yeniden hesaplar (REST ucu bunu kullanır). */
  recomputeAsync(opts?: { k?: number; seed?: number }): Promise<ClusteringRunInfo>
  /** Arka plandaki hesap (varsa) bitene kadar bekler. */
  idle(): Promise<void>
  busy(): boolean
  /** Depodaki son kalıcı model (tanılama ve testler) */
  persisted(): PersistedModel | null
}

export interface AudienceTuning {
  /** Hiç çalıştırma yokken eşzamanlı hesaplanacak en çok olgu sayısı */
  syncFactLimit: number
  /** Arka plan sürücüsünün tek seferde koştuğu süre (ms) */
  sliceMs: number
}

export const DEFAULT_SEED = 1

interface Model {
  /** Hangi sayaç durumundan hesaplandı (null: depodan yüklendi, tazelenmeli) */
  stamp: string | null
  run: ClusteringRunInfo
  communities: TasteCommunity[]
  byId: Map<string, number>
  titleLifts: TitleLift[][]
  space: FeatureSpace
  idf: Float32Array
  ct: Float32Array
  k: number
  viewerRow: Map<string, number>
  assign: Int32Array
  sim: Float32Array
}

export interface PersistedModel {
  version: 1
  run: ClusteringRunInfo
  communities: TasteCommunity[]
  titleLifts: TitleLift[][]
  features: FeatureDef[]
  titleVecs: [number, number[], number[]][]
  idf: number[]
  ct: number[]
  k: number
  viewers: string[]
  assign: number[]
  sim: number[]
}

interface AudienceState {
  model: PersistedModel | null
  options: { seed: number; k: number | null }
}

interface Snapshot {
  stamp: string
  facts: ViewingFact[]
  titles: ContentTitle[]
  sources: ViewingSource[]
}

/* ───────────── sürücüler ───────────── */

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
    if (cancelled()) throw new Error('kümeleme iptal edildi (sunucu kapanıyor)')
  }
}

/* ───────────── kalıcılık ───────────── */

const r6 = (x: number) => Math.round(x * 1e6) / 1e6

export function serialiseModel(m: Model): PersistedModel {
  return {
    version: 1,
    run: m.run,
    communities: m.communities,
    titleLifts: m.titleLifts,
    features: m.space.features,
    titleVecs: [...m.space.titleVecs].map(([id, v]) => [id, v.idx, v.val.map(r6)]),
    idf: Array.from(m.idf, r6),
    ct: Array.from(m.ct, r6),
    k: m.k,
    viewers: [...m.viewerRow.keys()],
    assign: Array.from(m.assign),
    sim: Array.from(m.sim, r6),
  }
}

export function restoreModel(p: PersistedModel): Model | null {
  if (p.version !== 1) return null
  const viewerRow = new Map<string, number>()
  p.viewers.forEach((v, i) => viewerRow.set(v, i))
  return {
    stamp: null,
    run: p.run,
    communities: p.communities,
    byId: new Map(p.communities.map((c, i) => [c.id, i])),
    titleLifts: p.titleLifts,
    space: { features: p.features, titleVecs: new Map(p.titleVecs.map(([id, idx, val]) => [id, { idx, val }])) },
    idf: Float32Array.from(p.idf),
    ct: Float32Array.from(p.ct),
    k: p.k,
    viewerRow,
    assign: Int32Array.from(p.assign),
    sim: Float32Array.from(p.sim),
  }
}

/* ───────────── servis ───────────── */

export function createAudienceService(app: FastifyInstance, tuning: AudienceTuning): AudienceImpl {
  const store: Store<AudienceState> = createStore(app.config, 'audience', () => ({
    model: null,
    options: { seed: DEFAULT_SEED, k: null },
  }))
  const options = store.get().options ?? { seed: DEFAULT_SEED, k: null }
  let model: Model | null = null
  try {
    const p = store.get().model
    model = p ? restoreModel(p) : null
  } catch {
    model = null
  }
  let job: { seq: number; stamp: string; promise: Promise<void> } | null = null
  let nextSeq = 1
  let installedSeq = 0
  let failedStamp: string | null = null
  let closed = false
  app.addHook('onClose', async () => {
    closed = true
    store.flush()
  })

  const svc = () => app.services
  const stampNow = (): string => {
    const s = svc()
    const rev = (fn: () => number) => {
      try {
        return fn()
      } catch {
        return -1
      }
    }
    return `${rev(() => s.viewing.revision())}|${rev(() => s.microgenres.revision())}|${rev(() => s.tagging.revision())}`
  }

  const takeSnapshot = (stamp: string): Snapshot => {
    const s = svc()
    let facts: ViewingFact[] = []
    let sources: ViewingSource[] = []
    try {
      facts = s.viewing.facts()
      sources = s.viewing.activeSources()
    } catch (err) {
      app.log.warn({ err }, 'zevk toplulukları: izleme verisi okunamadı')
    }
    return { stamp, facts, titles: s.catalog.allTitles(), sources }
  }

  function* compute(snap: Snapshot, opts: { seed: number; k: number | null }): Work<Model> {
    const t0 = performance.now()
    const s = svc()
    const coverage = new Map<number, number>()
    for (const f of snap.facts) coverage.set(f.titleId, (coverage.get(f.titleId) ?? 0) + 1)
    const space = buildFeatureSpace(snap.titles, s.tagging, s.microgenres, coverage)
    yield
    const mat = yield* buildViewerMatrix(snap.facts, space)
    const res = yield* cluster(mat, { seed: opts.seed, k: opts.k, maxK: app.config.maxCommunities })
    const traitsOf = (viewerId: string) => {
      try {
        return s.viewing.viewerTraits(viewerId)
      } catch {
        return { device: null, country: null }
      }
    }
    const desc = yield* describe(mat, space, res, traitsOf)
    const viewerRow = new Map<string, number>()
    mat.viewerIds.forEach((v, i) => viewerRow.set(v, i))
    const hash = createHash('sha1')
      .update(`${opts.seed}|${res.k}|${mat.n}|${mat.dims}|`)
      .update(Buffer.from(desc.assign.buffer, desc.assign.byteOffset, desc.assign.byteLength))
      .digest('hex')
    const run: ClusteringRunInfo = {
      runId: `cr_${hash.slice(0, 12)}`,
      computedAt: new Date().toISOString(),
      viewers: mat.n,
      k: res.k,
      iterations: res.iterations,
      seed: opts.seed,
      featureCount: mat.dims,
      silhouette: res.silhouette,
      sources: snap.sources,
      unassigned: mat.unassigned,
      durationMs: Math.round(performance.now() - t0),
      candidates: res.candidates,
    }
    return {
      stamp: snap.stamp,
      run,
      communities: desc.communities,
      byId: new Map(desc.communities.map((c, i) => [c.id, i])),
      titleLifts: desc.titleLifts,
      space,
      idf: mat.idf,
      ct: desc.ct,
      k: res.k,
      viewerRow,
      assign: desc.assign,
      sim: res.sim,
    }
  }

  const install = (m: Model, seq: number): void => {
    if (seq < installedSeq) return // daha yeni bir hesap zaten kuruldu
    installedSeq = seq
    model = m
    store.update((st) => {
      st.model = serialiseModel(m)
      st.options = { ...options }
    })
    const r = m.run
    app.log.info(
      { viewers: r.viewers, k: r.k, silhouette: r.silhouette, durationMs: r.durationMs, unassigned: r.unassigned },
      'zevk toplulukları hesaplandı',
    )
  }

  const startJob = (snap: Snapshot): Promise<void> => {
    const seq = nextSeq++
    const promise = runAsync(compute(snap, { ...options }), tuning.sliceMs, () => closed)
      .then((m) => install(m, seq))
      .catch((err: unknown) => {
        failedStamp = snap.stamp
        if (!closed) app.log.error({ err }, 'zevk toplulukları hesaplanamadı')
      })
      .finally(() => {
        if (job?.seq === seq) job = null
        if (!closed && stampNow() !== snap.stamp) ensureFresh()
      })
    job = { seq, stamp: snap.stamp, promise }
    return promise
  }

  function ensureFresh(): void {
    if (closed) return
    const stamp = stampNow()
    if (model && model.stamp === stamp) return
    if (job || failedStamp === stamp) return
    const snap = takeSnapshot(stamp)
    if (!model && snap.facts.length <= tuning.syncFactLimit) {
      try {
        install(runSync(compute(snap, { ...options })), nextSeq++)
      } catch (err) {
        failedStamp = stamp
        app.log.error({ err }, 'zevk toplulukları hesaplanamadı')
      }
      return
    }
    void startJob(snap)
  }

  const current = (): Model | null => {
    ensureFresh()
    return model && model.k > 0 ? model : null
  }

  const nearest = (m: Model, facts: ViewingFact[]): { communityId: string; similarity: number } | null => {
    const v = viewerVector(facts, m.space, m.idf)
    if (!v) return null
    let best = -1
    let bestScore = -Infinity
    for (let j = 0; j < m.k; j++) {
      let s = 0
      for (let q = 0; q < v.idx.length; q++) s += v.val[q]! * m.ct[v.idx[q]! * m.k + j]!
      if (s > bestScore) {
        bestScore = s
        best = j
      }
    }
    if (best < 0 || bestScore <= 0) return null
    return { communityId: m.communities[best]!.id, similarity: round(bestScore, 4) }
  }

  const ofViewer = (viewerId: string): { communityId: string; similarity: number } | null => {
    const m = current()
    if (!m) return null
    const row = m.viewerRow.get(viewerId)
    if (row !== undefined) {
      return { communityId: m.communities[m.assign[row]!]!.id, similarity: round(m.sim[row]!, 4) }
    }
    let facts: ViewingFact[] = []
    try {
      facts = svc().viewing.factsOfViewer(viewerId)
    } catch {
      return null
    }
    return facts.length > 0 ? nearest(m, facts) : null
  }

  const applyOptions = (opts?: { k?: number; seed?: number }) => {
    if (opts?.seed !== undefined) options.seed = opts.seed >>> 0
    options.k = opts?.k ?? null
  }

  return {
    run: () => current()?.run ?? null,
    communities: () => current()?.communities ?? [],
    get: (id) => {
      const m = current()
      const i = m?.byId.get(id)
      return m && i !== undefined ? m.communities[i]! : null
    },
    ofViewer,
    ofProfile: (profileGuid) => {
      let viewerId: string
      try {
        viewerId = svc().viewing.viewerIdOfProfile(profileGuid)
      } catch {
        return null
      }
      return ofViewer(viewerId)
    },
    topTitles: (communityId, limit) => {
      const m = current()
      const i = m?.byId.get(communityId)
      if (!m || i === undefined) return []
      return m.titleLifts[i]!.slice(0, Math.max(0, Math.floor(limit)))
    },
    recompute: (opts) => {
      applyOptions(opts)
      const snap = takeSnapshot(stampNow())
      const m = runSync(compute(snap, { ...options }))
      install(m, nextSeq++)
      return m.run
    },
    recomputeAsync: async (opts) => {
      applyOptions(opts)
      const snap = takeSnapshot(stampNow())
      const seq = nextSeq++
      const m = await runAsync(compute(snap, { ...options }), tuning.sliceMs, () => closed)
      install(m, seq)
      return m.run
    },
    idle: async () => {
      while (job) await job.promise
    },
    busy: () => job !== null,
    persisted: () => store.get().model,
  }
}
