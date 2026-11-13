/**
 * İçerik zekâsı servislerinin bellek içi sahteleri (keşif bütünleşmesi testleri için). Sözleşme:
 * server/src/kernel/intelligence.ts. `createTestApp()` sonrası `app.services.<ad>` üzerine kurulur.
 * Her sahtenin verisi değiştirilebilir; değiştiren `bump()` ile revision'ı artırır (gerçek servisler gibi).
 */
import type { FastifyInstance } from 'fastify'
import type { ClusteringRun, Microgenre, NeighborTitle } from '../../../shared/intelligence'
import type { AudienceService, EmbeddingService, MicrogenreService } from '../../src/kernel/intelligence'
import { ID } from './alan'

export function mg(
  id: string,
  name: string,
  titleIds: number[],
  opts: { layer?: Microgenre['layer']; specificity?: number; core?: string; type?: 'MOVIE' | 'SHOW' | null } = {},
): Microgenre {
  return {
    id,
    name,
    definition: { core: opts.core ?? 'animasyon', type: opts.type ?? null, slots: [] },
    titleIds,
    size: titleIds.length,
    specificity: opts.specificity ?? 1,
    layer: opts.layer ?? 'VISIBLE',
  }
}

/** Örnek içeriğin (9 başlık) mikro türleri */
export const FIXTURE_MICROGENRES: Microgenre[] = [
  // "Animasyon" tür satırıyla aynı küme → ana sayfada satır olmaz
  mg('mg_a_anim', 'Animasyon Filmleri ve Dizileri', [ID.sintel, ID.bbb, ID.caminandes, ID.spring], { specificity: 0 }),
  mg('mg_b_buyu', 'Büyülü Dünyalarda Geçen Filmler', [ID.sintel, ID.spring, ID.cosmos, ID.bbb], {
    core: 'fantastik',
  }),
  // Büyülü ile Jaccard 3/5 = 0.6 → ikisi birden seçilmez
  mg('mg_c_komedi', 'Sıcak Komediler', [ID.bbb, ID.caminandes, ID.cosmos, ID.spring], { core: 'komedi' }),
  mg('mg_d_klasik', 'Geleceği Düşleyen Klasikler', [ID.nosferatu, ID.metropolis, ID.tears, ID.cosmos], {
    core: 'bilim-kurgu',
  }),
  mg('mg_e_aile', 'Ailece İzlenecek Kısa Yapımlar', [ID.bbb, ID.caminandes, ID.spring, ID.anadolu], {
    core: 'cocuk-aile',
  }),
  mg('mg_h1_ejder', 'Ejderhalı Masalsı Animasyonlar', [ID.sintel, ID.spring], { layer: 'HIDDEN', specificity: 3 }),
  mg('mg_h2_acik', 'Açık Kaynakla Üretilmiş Kısa Filmler', [ID.sintel, ID.bbb, ID.tears, ID.cosmos, ID.spring], {
    layer: 'HIDDEN',
    specificity: 2,
  }),
  mg('mg_h3_sessiz', 'Sessiz Dışavurumcu Klasikler', [ID.nosferatu, ID.metropolis], {
    layer: 'HIDDEN',
    specificity: 3,
    core: 'klasik',
  }),
  // Çocuk profilinin hiçbir başlığını göremediği mikro tür
  mg('mg_h4_gotik', 'Karanlık Gotik Hikâyeler', [ID.nosferatu, ID.tears, ID.sintel], {
    layer: 'HIDDEN',
    specificity: 2,
    core: 'korku',
  }),
]

export interface FakeMicrogenres extends MicrogenreService {
  set(list: Microgenre[]): void
  bump(): void
}

/** Benzerlik: ortak mikro türlerin ln(1 + N/boyut) ağırlıklı örtüşmesi / kaynağın toplam ağırlığı (0–1) */
export function fakeMicrogenres(initial: Microgenre[] = FIXTURE_MICROGENRES, titleCount = 9): FakeMicrogenres {
  let list = initial
  let rev = 1
  const weight = (m: Microgenre) => Math.log(1 + titleCount / m.size)
  const ofTitle = (titleId: number) =>
    list
      .filter((m) => m.titleIds.includes(titleId))
      .sort((a, b) => b.specificity - a.specificity || a.size - b.size || a.id.localeCompare(b.id))
  return {
    all: () => list,
    get: (id) => list.find((m) => m.id === id) ?? null,
    ofTitle,
    similarTitles: (titleId, limit) => {
      const src = ofTitle(titleId)
      const total = src.reduce((s, m) => s + weight(m), 0)
      if (!total) return []
      const acc = new Map<number, { score: number; shared: Microgenre[] }>()
      for (const m of src)
        for (const t of m.titleIds) {
          if (t === titleId) continue
          const e = acc.get(t) ?? { score: 0, shared: [] }
          e.score += weight(m) / total
          e.shared.push(m)
          acc.set(t, e)
        }
      return [...acc.entries()]
        .map(([t, e]) => ({
          titleId: t,
          score: e.score,
          shared: e.shared.sort((a, b) => weight(b) - weight(a) || a.id.localeCompare(b.id)).map((m) => m.id),
        }))
        .sort((a, b) => b.score - a.score || a.titleId - b.titleId)
        .slice(0, limit)
    },
    stats: () => ({
      rubricVersion: 'test',
      generatedAt: new Date(0).toISOString(),
      total: list.length,
      visible: list.filter((m) => m.layer === 'VISIBLE').length,
      hidden: list.filter((m) => m.layer === 'HIDDEN').length,
      bySpecificity: {},
      coveredTitles: new Set(list.flatMap((m) => m.titleIds)).size,
      possibleDefinitions: 0,
    }),
    revision: () => rev,
    set(next) {
      list = next
    },
    bump() {
      rev++
    },
  }
}

export interface FakeEmbeddings extends EmbeddingService {
  setVector(titleId: number, v: number[] | null): void
  setReady(ready: boolean): void
  bump(): void
}

const cos = (a: Float32Array, b: Float32Array) => {
  let d = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    d += a[i]! * b[i]!
    na += a[i]! ** 2
    nb += b[i]! ** 2
  }
  return d / Math.sqrt(na * nb)
}

/** Örnek içerik için elle kurulmuş 3 boyutlu vektörler (animasyon · klasik · belgesel ekseni); Anadolu'nun vektörü yok */
export const FIXTURE_VECTORS: Record<number, number[]> = {
  [ID.sintel]: [1, 0.1, 0],
  [ID.spring]: [0.95, 0.15, 0],
  [ID.bbb]: [0.9, 0, 0.1],
  [ID.caminandes]: [0.85, 0, 0.2],
  [ID.cosmos]: [0.6, 0.3, 0.1],
  [ID.tears]: [0.3, 0.6, 0],
  [ID.nosferatu]: [-0.2, 1, 0],
  [ID.metropolis]: [-0.1, 0.95, 0.1],
}

export function fakeEmbeddings(vectors: Record<number, number[]> = FIXTURE_VECTORS, ready = true): FakeEmbeddings {
  const vec = new Map<number, Float32Array>(Object.entries(vectors).map(([k, v]) => [Number(k), Float32Array.from(v)]))
  let isReady = ready
  let rev = 1
  return {
    info: () => ({
      provider: 'sahte',
      modelVersion: 'test',
      dims: 3,
      titles: vec.size,
      shots: 0,
      modalities: ['CONTEXT'],
      builtAt: null,
      sceneDetected: 0,
    }),
    ready: () => isReady,
    titleVector: (id) => (isReady ? (vec.get(id) ?? null) : null),
    similarTitles: (id, limit): NeighborTitle[] => {
      const a = isReady ? vec.get(id) : undefined
      if (!a) return []
      return [...vec.entries()]
        .filter(([t]) => t !== id)
        .map(([titleId, b]) => ({ titleId, score: cos(a, b) }))
        .sort((x, y) => y.score - x.score || x.titleId - y.titleId)
        .slice(0, limit)
    },
    revision: () => rev,
    setVector(titleId, v) {
      if (v) vec.set(titleId, Float32Array.from(v))
      else vec.delete(titleId)
    },
    setReady(r) {
      isReady = r
    },
    bump() {
      rev++
    },
  }
}

export interface FakeAudience extends AudienceService {
  assign(profileGuid: string, communityId: string | null): void
  setTop(communityId: string, titleIds: number[]): void
  /** Yeni bir kümeleme koşusu (runId değişir) */
  newRun(): void
}

export function fakeAudience(): FakeAudience {
  const byProfile = new Map<string, string>()
  const top = new Map<string, number[]>()
  let runNo = 1
  const run = (): ClusteringRun => ({
    runId: `cr_test${runNo}`,
    computedAt: new Date(0).toISOString(),
    viewers: 10,
    k: top.size,
    iterations: 1,
    seed: 1,
    featureCount: 1,
    silhouette: null,
    sources: ['SYNTHETIC'],
  })
  return {
    run,
    communities: () => [],
    get: () => null,
    ofViewer: () => null,
    ofProfile: (guid) => {
      const c = byProfile.get(guid)
      return c ? { communityId: c, similarity: 0.8 } : null
    },
    topTitles: (communityId, limit) =>
      (top.get(communityId) ?? []).slice(0, limit).map((titleId, i) => ({ titleId, lift: 3 - i * 0.1, reach: 0.5 })),
    recompute: () => run(),
    assign(guid, c) {
      if (c) byProfile.set(guid, c)
      else byProfile.delete(guid)
    },
    setTop(c, ids) {
      top.set(c, ids)
    },
    newRun() {
      runNo++
    },
  }
}

/** Üç sahteyi uygulamaya kurar ve döndürür */
export function installIntelligence(app: FastifyInstance): {
  microgenres: FakeMicrogenres
  embeddings: FakeEmbeddings
  audience: FakeAudience
} {
  const microgenres = fakeMicrogenres()
  const embeddings = fakeEmbeddings()
  const audience = fakeAudience()
  app.services.microgenres = microgenres
  app.services.embeddings = embeddings
  app.services.audience = audience
  return { microgenres, embeddings, audience }
}
