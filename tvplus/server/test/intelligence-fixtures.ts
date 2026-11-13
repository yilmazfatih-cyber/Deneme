/**
 * İçerik zekâsı testleri için bellek içi sahte servisler ve veri üreteçleri (diğer ajanlar da kullanabilir).
 *
 * - `createFakeViewing`   ViewingService: oynatmalardan (FakePlay) ya da doğrudan olgulardan (ViewingFact)
 * - `createFakeTagging`   TaggingService: başlık → geçerli etiketler
 * - `createFakeMicrogenres` MicrogenreService: hazır mikro tür listesi
 * - `makeTitle`           zTitle şemasından geçen küçük sentetik başlık
 * - `installFakes`        `createTestApp()` sonrasında app.services içine takar (katalog isteğe bağlı değiştirilir)
 * - `plantArchetypes`     ekilmiş zevk kalıplarından (arketip) izleyici oynatmaları + gerçek etiket haritası
 * - `purity`              küme saflığı (her kümenin en sık gerçek etiketi / toplam)
 */
import type { FastifyInstance } from 'fastify'
import { zTitle, type ContentTitle } from '../../shared/content-schema'
import type {
  DataSourceStatus,
  EffectiveTags,
  Microgenre,
  TitleTotals,
  ViewingDevice,
  ViewingEvent,
  ViewingFact,
  ViewingSource,
} from '../../shared/intelligence'
import type { TagVocabulary } from '../../shared/tagging-schema'
import type { MicrogenreService, TaggingService, ViewingQuery, ViewingService } from '../src/kernel/intelligence'
import type { CatalogService } from '../src/kernel/services'

/* ───────────── tohumlu rastgele ───────────── */

export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ISTANBUL_MS = 3 * 3600_000
export const monthOfTs = (ts: number) => new Date(ts + ISTANBUL_MS).toISOString().slice(0, 7)

/* ───────────── izleme verisi ───────────── */

export interface FakePlay {
  viewerId: string
  titleId: number
  /** epoch ms */
  ts: number
  watchedSec: number
  completed?: boolean
  /** Verilirse olgunun ilgi puanı en az bu olur */
  engagement?: number
  device?: ViewingDevice
  country?: string
  source?: ViewingSource
}

export interface FakeViewing extends ViewingService {
  plays: FakePlay[]
  addPlays(plays: FakePlay[]): void
  /** Doğrudan olgu (oynatmasız) — büyük ölçek testleri için */
  setFacts(facts: ViewingFact[], traits?: (viewerId: string) => { device: ViewingDevice | null; country: string | null }): void
  bump(): void
}

/** İlgi puanı: izlenen süreye göre 0,3–1 (+ tamamlama) */
export function engagementOf(watchedSec: number, completed: boolean): number {
  return Math.min(1, 0.3 + 0.6 * Math.min(1, watchedSec / 5400) + (completed ? 0.1 : 0))
}

export function createFakeViewing(init: { plays?: FakePlay[]; facts?: ViewingFact[] } = {}): FakeViewing {
  let rev = 1
  const plays: FakePlay[] = [...(init.plays ?? [])]
  let directFacts: ViewingFact[] = [...(init.facts ?? [])]
  let traitsFn: ((id: string) => { device: ViewingDevice | null; country: string | null }) | null = null
  let cache: { rev: number; facts: ViewingFact[]; byViewer: Map<string, ViewingFact[]> } | null = null

  const inWindow = (p: FakePlay, q: ViewingQuery = {}) =>
    (q.from === undefined || p.ts >= q.from) &&
    (q.to === undefined || p.ts < q.to) &&
    (q.sources === undefined || q.sources.includes(p.source ?? 'SYNTHETIC'))

  const build = () => {
    if (cache && cache.rev === rev) return cache
    const agg = new Map<string, ViewingFact>()
    for (const p of plays) {
      const key = `${p.viewerId}|${p.titleId}`
      const e = Math.max(p.engagement ?? 0, engagementOf(p.watchedSec, p.completed ?? false))
      const f = agg.get(key)
      if (!f) {
        agg.set(key, {
          viewerId: p.viewerId,
          titleId: p.titleId,
          source: p.source ?? 'SYNTHETIC',
          plays: 1,
          watchedSec: p.watchedSec,
          completions: p.completed ? 1 : 0,
          firstTs: p.ts,
          lastTs: p.ts,
          inList: false,
          rating: null,
          engagement: e,
        })
      } else {
        f.plays++
        f.watchedSec += p.watchedSec
        f.completions += p.completed ? 1 : 0
        f.firstTs = Math.min(f.firstTs, p.ts)
        f.lastTs = Math.max(f.lastTs, p.ts)
        f.engagement = Math.max(f.engagement, e)
      }
    }
    const facts = [...agg.values(), ...directFacts]
    const byViewer = new Map<string, ViewingFact[]>()
    for (const f of facts) {
      const l = byViewer.get(f.viewerId)
      if (l) l.push(f)
      else byViewer.set(f.viewerId, [f])
    }
    cache = { rev, facts, byViewer }
    return cache
  }

  const lastPlay = new Map<string, FakePlay>()
  const indexPlay = (p: FakePlay) => {
    const cur = lastPlay.get(p.viewerId)
    if (!cur || p.ts >= cur.ts) lastPlay.set(p.viewerId, p)
  }
  plays.forEach(indexPlay)

  const svc: FakeViewing = {
    plays,
    addPlays(more) {
      for (const p of more) {
        plays.push(p)
        indexPlay(p)
      }
      rev++
    },
    setFacts(facts, traits) {
      directFacts = facts
      traitsFn = traits ?? null
      rev++
    },
    bump() {
      rev++
    },
    append(events: ViewingEvent[]) {
      let accepted = 0
      let rejected = 0
      const add: FakePlay[] = []
      for (const e of events) {
        if (e.titleId === null || (e.type !== 'PLAY_END' && e.type !== 'PLAY_PROGRESS')) {
          rejected++
          continue
        }
        accepted++
        const p: FakePlay = {
          viewerId: e.viewerId,
          titleId: e.titleId,
          ts: e.ts,
          watchedSec: e.watchedSec ?? 0,
          completed: e.completed ?? false,
          source: e.source,
        }
        if (e.device) p.device = e.device
        if (e.country) p.country = e.country
        add.push(p)
      }
      if (add.length) svc.addPlays(add)
      return { accepted, duplicates: 0, rejected }
    },
    facts: () => build().facts,
    factsOfViewer: (viewerId) => build().byViewer.get(viewerId) ?? [],
    titleTotals(q) {
      const out = new Map<number, TitleTotals>()
      const viewers = new Map<number, Set<string>>()
      for (const p of plays) {
        if (!inWindow(p, q)) continue
        const t = out.get(p.titleId) ?? { titleId: p.titleId, viewers: 0, plays: 0, hours: 0, completions: 0 }
        t.plays++
        t.hours += p.watchedSec / 3600
        t.completions += p.completed ? 1 : 0
        out.set(p.titleId, t)
        const vs = viewers.get(p.titleId) ?? new Set<string>()
        vs.add(p.viewerId)
        viewers.set(p.titleId, vs)
      }
      for (const [id, t] of out) t.viewers = viewers.get(id)!.size
      if (plays.length === 0) {
        for (const f of directFacts) {
          const t = out.get(f.titleId) ?? { titleId: f.titleId, viewers: 0, plays: 0, hours: 0, completions: 0 }
          t.viewers++
          t.plays += f.plays
          t.hours += f.watchedSec / 3600
          t.completions += f.completions
          out.set(f.titleId, t)
        }
      }
      return out
    },
    monthlyTitleHours(q) {
      const out = new Map<string, Map<number, number>>()
      for (const p of plays) {
        if (!inWindow(p, q)) continue
        const m = monthOfTs(p.ts)
        const mm = out.get(m) ?? new Map<number, number>()
        mm.set(p.titleId, (mm.get(p.titleId) ?? 0) + p.watchedSec / 3600)
        out.set(m, mm)
      }
      return out
    },
    viewerTraits(viewerId) {
      if (traitsFn) return traitsFn(viewerId)
      const p = lastPlay.get(viewerId)
      return { device: p?.device ?? null, country: p?.country ?? null }
    },
    viewerIdOfProfile: (guid) => `v_profil_${guid}`,
    sources(): DataSourceStatus[] {
      if (plays.length === 0 && directFacts.length === 0) return []
      const ts = plays.map((p) => p.ts)
      return [
        {
          source: 'SYNTHETIC',
          events: plays.length,
          viewers: build().byViewer.size,
          titles: new Set(build().facts.map((f) => f.titleId)).size,
          firstTs: ts.length ? Math.min(...ts) : null,
          lastTs: ts.length ? ts.reduce((a, b) => Math.max(a, b), 0) : null,
          active: true,
          lastImport: null,
        },
      ]
    },
    activeSources: () => ['SYNTHETIC'],
    clear() {
      plays.length = 0
      directFacts = []
      rev++
    },
    revision: () => rev,
  }
  return svc
}

/* ───────────── etiketleme ve mikro türler ───────────── */

export const EMPTY_VOCABULARY: TagVocabulary = {
  version: '2026.11-1',
  scales: [],
  facets: [],
  naming: { genreNouns: {}, regions: [], eras: [], order: ['ADJECTIVE'] },
}

export interface FakeTagging extends TaggingService {
  set(titleId: number, tags: Partial<Omit<EffectiveTags, 'titleId'>>): void
}

export function createFakeTagging(
  tags: Record<number, Partial<Omit<EffectiveTags, 'titleId'>>> = {},
  vocabulary: TagVocabulary = EMPTY_VOCABULARY,
): FakeTagging {
  let rev = 1
  const map = new Map<number, Partial<Omit<EffectiveTags, 'titleId'>>>(Object.entries(tags).map(([k, v]) => [Number(k), v]))
  return {
    vocabulary: () => vocabulary,
    effective: (titleId) => {
      const t = map.get(titleId)
      return {
        titleId,
        rubricVersion: vocabulary.version,
        basis: t ? (t.basis ?? 'SAMPLE') : 'NONE',
        sheetCount: t?.sheetCount ?? 0,
        agreement: t?.agreement ?? null,
        scales: t?.scales ?? {},
        facets: t?.facets ?? {},
        descriptors: t?.descriptors ?? [],
      }
    },
    sheets: () => [],
    revision: () => rev,
    set(titleId, t) {
      map.set(titleId, t)
      rev++
    },
  }
}

export interface FakeMicrogenres extends MicrogenreService {
  setAll(list: Microgenre[]): void
}

export function createFakeMicrogenres(list: Microgenre[] = []): FakeMicrogenres {
  let rev = 1
  let items = list
  const stats = () => ({
    rubricVersion: '2026.11-1',
    generatedAt: '2026-11-01T00:00:00.000Z',
    total: items.length,
    visible: items.filter((m) => m.layer === 'VISIBLE').length,
    hidden: items.filter((m) => m.layer === 'HIDDEN').length,
    bySpecificity: {},
    coveredTitles: new Set(items.flatMap((m) => m.titleIds)).size,
    possibleDefinitions: items.length,
  })
  return {
    all: () => items,
    get: (id) => items.find((m) => m.id === id) ?? null,
    ofTitle: (titleId) => items.filter((m) => m.titleIds.includes(titleId)).sort((a, b) => b.specificity - a.specificity),
    similarTitles: () => [],
    stats,
    revision: () => rev,
    setAll(next) {
      items = next
      rev++
    },
  }
}

export function makeMicrogenre(id: string, name: string, core: string, titleIds: number[], specificity = 1): Microgenre {
  return {
    id,
    name,
    definition: { core, type: null, slots: [] },
    titleIds,
    size: titleIds.length,
    specificity,
    layer: titleIds.length >= 4 && specificity <= 2 ? 'VISIBLE' : 'HIDDEN',
  }
}

/* ───────────── katalog ───────────── */

let nextVideoId = 90_000_001

/** zTitle şemasından geçen küçük başlık (varsayılanlar şemadan). */
export function makeTitle(p: {
  videoId?: number
  type?: 'MOVIE' | 'SHOW'
  title?: string
  genres: ContentTitle['genres']
  moods?: ContentTitle['moods']
  addedAt?: string
  leavingAt?: string | null
  origin?: { countries: string[]; languages: string[] }
  acquisition?: ContentTitle['acquisition']
  licenseName?: string
  youtube?: boolean
  rating?: ContentTitle['maturity']['rating']
}): ContentTitle {
  const videoId = p.videoId ?? nextVideoId++
  const source = p.youtube
    ? { type: 'YOUTUBE', videoId: 'abcdefghijk' }
    : { type: 'PROGRESSIVE', url: 'https://example.org/v.mp4' }
  return zTitle.parse({
    videoId,
    slug: `test-${videoId}`,
    type: p.type ?? 'MOVIE',
    title: p.title ?? `Deneme ${videoId}`,
    year: 2020,
    synopsis: 'Deneme amaçlı sentetik bir yapım; içerik zekâsı testlerinde kullanılır.',
    shortSynopsis: 'Deneme yapımı.',
    genres: p.genres,
    moods: p.moods ?? [],
    maturity: { rating: p.rating ?? 'GENEL' },
    license: { name: p.licenseName ?? 'Ticari lisans', attribution: 'Deneme' },
    availability: { addedAt: p.addedAt ?? '2026-01-01', leavingAt: p.leavingAt ?? null },
    ...(p.type === 'SHOW'
      ? {
          seasons: [
            {
              number: 1,
              episodes: [
                {
                  videoId: videoId + 101,
                  number: 1,
                  title: 'Bölüm 1',
                  synopsis: 'Birinci bölüm.',
                  sources: [source],
                },
              ],
            },
          ],
        }
      : { sources: [source] }),
    ...(p.origin ? { origin: p.origin } : {}),
    ...(p.acquisition ? { acquisition: p.acquisition } : {}),
  })
}

/** Katalog servisinin üst başlık listesini değiştiren ince sarmal (diğer yöntemler asıl servise gider). */
export function catalogWith(base: CatalogService, titles: ContentTitle[]): CatalogService {
  const byId = new Map(titles.map((t) => [t.videoId, t]))
  const wrapped: CatalogService = Object.create(base) as CatalogService
  wrapped.allTitles = () => titles
  wrapped.getTitle = (id) => byId.get(id) ?? null
  return wrapped
}

export interface Fakes {
  viewing?: ViewingService
  tagging?: TaggingService
  microgenres?: MicrogenreService
  titles?: ContentTitle[]
}

export function installFakes(app: FastifyInstance, fakes: Fakes): void {
  if (fakes.viewing) app.services.viewing = fakes.viewing
  if (fakes.tagging) app.services.tagging = fakes.tagging
  if (fakes.microgenres) app.services.microgenres = fakes.microgenres
  if (fakes.titles) app.services.catalog = catalogWith(app.services.catalog, fakes.titles)
}

/* ───────────── ekilmiş zevk kalıpları ───────────── */

export interface Archetype {
  name: string
  /** Bu kalıptaki izleyicilerin seçtiği başlıklar */
  pool: number[]
  viewers: number
  /** İzleyici başına başlık sayısı aralığı */
  titlesPerViewer?: [number, number]
  device?: ViewingDevice
  /** İzleyicilere sırayla dağıtılan ülkeler (aynı toplulukta farklı ülkeler) */
  countries?: string[]
  /** İzleyici başına izleme süresi çarpanı (saat payını ayırmak için) */
  hoursScale?: number
}

export interface Planted {
  plays: FakePlay[]
  /** izleyici → arketip adı */
  truth: Map<string, string>
}

/**
 * Arketiplerden oynatmalar üretir. `noise` (0–1): her oynatmanın havuz dışı rastgele bir başlıktan gelme olasılığı.
 * Zamanlar `startTs`'den itibaren `days` güne yayılır.
 */
export function plantArchetypes(
  archetypes: Archetype[],
  opts: { seed: number; allTitles: number[]; noise?: number; startTs?: number; days?: number },
): Planted {
  const r = rng(opts.seed)
  const noise = opts.noise ?? 0
  const startTs = opts.startTs ?? Date.parse('2026-09-01T12:00:00Z')
  const days = opts.days ?? 60
  const plays: FakePlay[] = []
  const truth = new Map<string, string>()
  archetypes.forEach((a, ai) => {
    const [lo, hi] = a.titlesPerViewer ?? [3, 6]
    for (let v = 0; v < a.viewers; v++) {
      const viewerId = `v_${String(ai).padStart(2, '0')}${a.name}_${String(v).padStart(5, '0')}`
      truth.set(viewerId, a.name)
      const count = Math.min(lo + Math.floor(r() * (hi - lo + 1)), a.pool.length)
      const seen = new Set<number>()
      const bag = [...a.pool] // havuzdan yerine koymadan çekilir
      for (let i = 0; i < count; i++) {
        let titleId: number
        if (r() < noise && opts.allTitles.length > 0) {
          titleId = opts.allTitles[Math.floor(r() * opts.allTitles.length)]!
        } else {
          const j = Math.floor(r() * bag.length)
          titleId = bag[j]!
          bag[j] = bag[bag.length - 1]!
          bag.pop()
        }
        if (seen.has(titleId)) continue
        seen.add(titleId)
        const watchedSec = Math.round((1200 + r() * 4200) * (a.hoursScale ?? 1))
        const play: FakePlay = {
          viewerId,
          titleId,
          ts: startTs + Math.floor(r() * days * 86_400_000),
          watchedSec,
          completed: r() < 0.5,
        }
        if (a.device) play.device = a.device
        if (a.countries?.length) play.country = a.countries[v % a.countries.length]!
        plays.push(play)
      }
    }
  })
  return { plays, truth }
}

/** Saflık: her kümede en sık gerçek etiketin payı, kümeler üzerinden ağırlıklı ortalama. */
export function purity(assigned: Map<string, string>, truth: Map<string, string>): number {
  const byCluster = new Map<string, Map<string, number>>()
  let total = 0
  for (const [viewer, c] of assigned) {
    const t = truth.get(viewer)
    if (t === undefined) continue
    total++
    const m = byCluster.get(c) ?? new Map<string, number>()
    m.set(t, (m.get(t) ?? 0) + 1)
    byCluster.set(c, m)
  }
  let hit = 0
  for (const m of byCluster.values()) hit += Math.max(...m.values())
  return total > 0 ? hit / total : 0
}

/**
 * Gerçek test içeriğinden (content/titles) ayrık başlık havuzları: her başlık ilk eşleşen havuza girer.
 * Havuzlar: bilim/doğa belgeselleri · sessiz klasikler · animasyon kısaları · yaşam ve kültür.
 */
export function realCatalogPools(titles: ContentTitle[]): Record<'bilim' | 'sessiz' | 'animasyon' | 'yasam', number[]> {
  const pools = { bilim: [] as number[], sessiz: [] as number[], animasyon: [] as number[], yasam: [] as number[] }
  for (const t of titles) {
    const g = new Set<string>(t.genres)
    if (g.has('sessiz-sinema') || g.has('klasik')) pools.sessiz.push(t.videoId)
    else if (g.has('animasyon')) pools.animasyon.push(t.videoId)
    else if (g.has('doga-bilim') || g.has('teknoloji')) pools.bilim.push(t.videoId)
    else if (g.has('yasam') || g.has('tarih') || g.has('yerli')) pools.yasam.push(t.videoId)
  }
  return pools
}

/** Büyük ölçek: `n` izleyicinin doğrudan olguları (k arketip, havuzlar ayrık), O(n) bellek. */
export function syntheticFacts(
  n: number,
  pools: number[][],
  opts: { seed: number; titlesPerViewer?: [number, number] },
): ViewingFact[] {
  const r = rng(opts.seed)
  const [lo, hi] = opts.titlesPerViewer ?? [3, 7]
  const out: ViewingFact[] = []
  for (let v = 0; v < n; v++) {
    const pool = pools[v % pools.length]!
    const viewerId = `v_${v.toString(36).padStart(6, '0')}`
    const count = lo + Math.floor(r() * (hi - lo + 1))
    const seen = new Set<number>()
    for (let i = 0; i < count; i++) {
      const titleId = pool[Math.floor(r() * pool.length)]!
      if (seen.has(titleId)) continue
      seen.add(titleId)
      const watchedSec = 1200 + Math.floor(r() * 4000)
      out.push({
        viewerId,
        titleId,
        source: 'SYNTHETIC',
        plays: 1,
        watchedSec,
        completions: 0,
        firstTs: 0,
        lastTs: 0,
        inList: false,
        rating: null,
        engagement: engagementOf(watchedSec, false),
      })
    }
  }
  return out
}
