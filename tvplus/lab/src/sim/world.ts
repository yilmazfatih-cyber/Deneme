/**
 * Simülasyon dünyası: örnek uygulamanın GERÇEK sunucu örneği (katalog, etiketleme, mikro türler, gömme, zevk
 * toplulukları, tahmin modeli, keşif) + lab'ın köprülediği katalog + gerçek kullanıcıların izleme özetleri.
 *
 * Uygulama başsız çalışır (HTTP kapısı açılmaz); simüle kullanıcılar servisleri doğrudan sürer:
 *   ana sayfa   buildLolomo(services, profil, { now, flags })      ← uygulamanın kendi kodu, deney bayraklarıyla
 *   ilerleme    services.progress.setBookmark(...)                  ← "İzlemeye Devam Et", izlendi durumu
 *   izleme      SimViewing.watch(...)                               ← tahmin modelinin profil vektörü bundan çözülür
 *   Top 10      SimEvents.play(...)                                 ← son 24 saatin oynatmaları (simülasyon saatiyle)
 *
 * İki servis lab'ın bellek içi karşılıklarıyla değiştirilir (uygulamanın sözleşmesi buna izin verir: servislere
 * istek anında kayıt defterinden erişilir): `viewing` (diske yazmasın, hızlı olsun, evren başına ayrılabilsin) ve
 * `events` (oynatma sayaçları duvar saatine değil simülasyon saatine göre pencerelensin).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type {
  DataSourceStatus,
  TitleTotals,
  ViewingEvent,
  ViewingFact,
  ViewingSource,
} from '../../../shared/intelligence'
import type { EventBatch } from '../../../shared/types'
import { buildApp } from '../../../server/src/app'
import type { ProfileRecord } from '../../../server/src/kernel/context'
import type { ViewingService } from '../../../server/src/kernel/intelligence'
import type { EventsService, Services } from '../../../server/src/kernel/services'
import { audienceInternals } from '../../../server/src/services/audience/plugin'
import { embeddingsInternals } from '../../../server/src/services/embeddings/plugin'
import { predictionInternals } from '../../../server/src/services/predictions/plugin'
import { referenceSeconds } from '../../../server/src/services/viewing/resolve'
import { engagementOf } from '../../../server/src/services/viewing/store'
import { loadTable } from '../core/columns'
import type { Lab } from '../core/lab'
import { bridgeDir, loadBridge, type BridgeMap, type BridgeTitle } from './bridge'

interface FactAcc {
  plays: number
  watchedSec: number
  completions: number
  firstTs: number
  lastTs: number
}

/** Bellek içi izleme servisi: özetler doğrudan tutulur (olay günlüğü yok). */
export class SimViewing implements ViewingService {
  /** Eğitim nüfusu (gerçek kullanıcıların özetleri) */
  private readonly population = new Map<string, Map<number, FactAcc>>()
  /** Simüle profiller (evren başına ayrı kimlik) */
  private readonly profiles = new Map<string, Map<number, FactAcc>>()
  private rev = 1
  private events = 0
  private readonly reference: (titleId: number) => number
  private readonly refCache = new Map<number, number>()

  constructor(reference: (titleId: number) => number) {
    this.reference = reference
  }

  private refOf(titleId: number): number {
    let r = this.refCache.get(titleId)
    if (r === undefined) {
      r = this.reference(titleId)
      this.refCache.set(titleId, r)
    }
    return r
  }

  private add(
    map: Map<string, Map<number, FactAcc>>,
    viewerId: string,
    titleId: number,
    watchedSec: number,
    completed: boolean,
    ts: number,
    plays: number,
  ): void {
    let v = map.get(viewerId)
    if (!v) {
      v = new Map()
      map.set(viewerId, v)
    }
    const f = v.get(titleId)
    if (f) {
      f.plays += plays
      f.watchedSec += watchedSec
      if (completed) f.completions++
      if (ts < f.firstTs) f.firstTs = ts
      if (ts > f.lastTs) f.lastTs = ts
    } else v.set(titleId, { plays, watchedSec, completions: completed ? 1 : 0, firstTs: ts, lastTs: ts })
    this.events++
  }

  /** Eğitim nüfusuna özet ekler (dünya kurulurken). */
  seed(
    viewerId: string,
    titleId: number,
    watchedSec: number,
    completions: number,
    firstTs: number,
    lastTs: number,
    plays: number,
  ): void {
    let v = this.population.get(viewerId)
    if (!v) {
      v = new Map()
      this.population.set(viewerId, v)
    }
    v.set(titleId, { plays, watchedSec, completions, firstTs, lastTs })
    this.events++
  }

  /** Simüle profilin izlemesi (ya da ikizin başlangıç geçmişi). */
  watch(profileGuid: string, titleId: number, watchedSec: number, completed: boolean, ts: number, plays = 1): void {
    this.add(this.profiles, this.viewerIdOfProfile(profileGuid), titleId, watchedSec, completed, ts, plays)
  }

  /** Profilin izlediği başlıklar (simülatörün kendi durumu için) */
  profileTitles(profileGuid: string): ReadonlyMap<number, FactAcc> | undefined {
    return this.profiles.get(this.viewerIdOfProfile(profileGuid))
  }

  /** Profilleri siler (yeni evren). `prefix` verilirse yalnız o önekle başlayanlar. */
  resetProfiles(prefix?: string): void {
    if (!prefix) this.profiles.clear()
    else for (const k of [...this.profiles.keys()]) if (k.startsWith(`v_${prefix}`)) this.profiles.delete(k)
    this.rev++
  }

  /** Öneri tarafının yeni izlemeleri görmesi için sürüm sayacını ilerletir (simülatör gün başında çağırır). */
  bump(): void {
    this.rev++
  }

  private toFact(viewerId: string, titleId: number, f: FactAcc): ViewingFact {
    return {
      viewerId,
      titleId,
      source: 'MIXPANEL',
      plays: f.plays,
      watchedSec: f.watchedSec,
      completions: f.completions,
      firstTs: f.firstTs,
      lastTs: f.lastTs,
      inList: false,
      rating: null,
      engagement: engagementOf(
        { watchedSec: f.watchedSec, completions: f.completions, inList: false, plays: f.plays, rating: null },
        this.refOf(titleId),
      ),
    }
  }

  append(events: ViewingEvent[]): { accepted: number; duplicates: number; rejected: number } {
    let accepted = 0
    for (const e of events) {
      if (e.titleId === null || (e.type !== 'PLAY_END' && e.type !== 'PLAY_PROGRESS')) continue
      this.add(
        this.population,
        e.viewerId,
        e.titleId,
        e.watchedSec ?? 0,
        e.completed === true,
        e.ts,
        e.type === 'PLAY_END' ? 1 : 0,
      )
      accepted++
    }
    if (accepted) this.rev++
    return { accepted, duplicates: 0, rejected: events.length - accepted }
  }
  facts(): ViewingFact[] {
    const out: ViewingFact[] = []
    for (const [viewerId, v] of this.population)
      for (const [titleId, f] of v) out.push(this.toFact(viewerId, titleId, f))
    return out
  }
  factsOfViewer(viewerId: string): ViewingFact[] {
    const v = this.profiles.get(viewerId) ?? this.population.get(viewerId)
    if (!v) return []
    const out: ViewingFact[] = []
    for (const [titleId, f] of v) out.push(this.toFact(viewerId, titleId, f))
    return out
  }
  titleTotals(): Map<number, TitleTotals> {
    const out = new Map<number, TitleTotals>()
    for (const v of this.population.values())
      for (const [titleId, f] of v) {
        const t = out.get(titleId) ?? { titleId, viewers: 0, plays: 0, hours: 0, completions: 0 }
        t.viewers++
        t.plays += f.plays
        t.hours += f.watchedSec / 3600
        t.completions += f.completions
        out.set(titleId, t)
      }
    return out
  }
  monthlyTitleHours(): Map<string, Map<number, number>> {
    return new Map()
  }
  viewerTraits(): { device: ViewingEvent['device'] | null; country: string | null } {
    return { device: null, country: null }
  }
  viewerIdOfProfile(profileGuid: string): string {
    return `v_${profileGuid}`
  }
  sources(): DataSourceStatus[] {
    return [
      {
        source: 'MIXPANEL',
        events: this.events,
        viewers: this.population.size,
        titles: 0,
        firstTs: null,
        lastTs: null,
        active: true,
        lastImport: null,
      },
    ]
  }
  activeSources(): ViewingSource[] {
    return ['MIXPANEL']
  }
  clear(): void {
    this.population.clear()
    this.profiles.clear()
    this.rev++
  }
  revision(): number {
    return this.rev
  }
}

/** Simülasyon saatine göre oynatma sayaçları (Top 10). Evren başına ayrı tutulur. */
export class SimEvents implements EventsService {
  /** [videoId, simülasyon anı ms] — etkin evrenin oynatmaları */
  private plays: [number, number][] = []
  private byUniverse = new Map<string, [number, number][]>()
  /** Simülasyonun "şimdi"si (ms) */
  now = 0

  /** Son sayım (aynı simülasyon anında yinelenen Top 10 sorguları için) */
  private counted: { now: number; hours: number; map: Map<number, number> } | null = null

  /** Etkin evreni değiştirir (her evrenin kendi Top 10'u olur). */
  useUniverse(key: string): void {
    let list = this.byUniverse.get(key)
    if (!list) {
      list = []
      this.byUniverse.set(key, list)
    }
    this.plays = list
    this.counted = null
  }
  dropUniverse(key: string): void {
    this.byUniverse.delete(key)
  }
  play(videoId: number, ts: number): void {
    this.plays.push([videoId, ts])
    // Pencereye düşen bir oynatma sayımı eskitir (motor oynatmaları "şimdi"den sonraya yazar; olağan durumda eskimez)
    if (ts <= this.now) this.counted = null
  }
  /** Pencerenin dışında kalan eski oynatmaları atar (gün başında). */
  prune(): void {
    const cutoff = this.now - 26 * 3_600_000
    if (this.plays.length > 0 && this.plays[0][1] < cutoff) {
      const kept = this.plays.filter(([, t]) => t >= cutoff)
      this.plays.length = 0
      this.plays.push(...kept)
    }
    this.counted = null
  }
  playCounts(windowHours: number): Map<number, number> {
    const c = this.counted
    if (c && c.now === this.now && c.hours === windowHours) return c.map
    const since = this.now - windowHours * 3_600_000
    const out = new Map<number, number>()
    for (const [vid, t] of this.plays) if (t >= since && t <= this.now) out.set(vid, (out.get(vid) ?? 0) + 1)
    this.counted = { now: this.now, hours: windowHours, map: out }
    return out
  }
  ingest(_batch: EventBatch): { accepted: number; dropped: number; rateLimitRemaining: number } {
    return { accepted: 0, dropped: 0, rateLimitRemaining: 0 }
  }
  stats(): { total: number; lastBatchAt: string | null; byName: Record<string, number> } {
    return { total: this.plays.length, lastBatchAt: null, byName: {} }
  }
}

export interface SimWorld {
  app: FastifyInstance
  services: Services
  bridge: BridgeMap
  /** Lab başlık dizini → köprü başlığı */
  byTid: Map<number, BridgeTitle>
  byVideoId: Map<number, BridgeTitle>
  viewing: SimViewing
  events: SimEvents
  /** Eğitim özeti */
  training: { viewers: number; facts: number; modelReady: boolean; communities: number; seconds: number }
  profile(guid: string, name?: string): ProfileRecord
  close(): Promise<void>
}

/**
 * Dünyayı kurar: uygulama örneği köprü kataloğuyla açılır, gerçek kullanıcıların izleme özetleri yüklenir, gömme
 * vektörleri, zevk toplulukları ve tahmin modeli bu veriden hesaplanır.
 * `beforeDay` verilirse yalnız o günden ÖNCE başlamış izlemeler eğitime girer (geçmişe dönük sınama için).
 */
export async function openWorld(
  lab: Lab,
  opts: { beforeDay?: number; seed?: number; train?: boolean } = {},
): Promise<SimWorld> {
  const t0 = Date.now()
  const bridge = loadBridge(lab)
  if (!bridge) throw new Error('Katalog köprüsü kurulmamış. Önce: npm run lab -- sim kur')
  const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-lab-sim-'))
  const app = await buildApp({
    contentDir: bridgeDir(lab),
    dataDir,
    secret: 'tvplus-lab-sim',
    isTest: true,
    offline: true,
    logLevel: 'silent',
    debugAccess: 'open',
    studioAccess: 'open',
    sampleViewing: false,
  })
  await app.ready()
  const services = app.services
  const byTid = new Map(bridge.titles.map((t) => [t.tid, t]))
  const byVideoId = new Map(bridge.titles.map((t) => [t.videoId, t]))
  const viewing = new SimViewing((titleId) => referenceSeconds(services.catalog.getTitle(titleId), () => null))
  const events = new SimEvents()
  services.viewing = viewing
  services.events = events

  // Eğitim nüfusu: lab'ın izleme özetleri (kullanıcı × başlık)
  const facts = loadTable(lab.tableDir, 'izleme')
  const fUid = facts.cols.uid
  const fTid = facts.cols.tid
  const fPlays = facts.cols.plays
  const fWatch = facts.cols.watch_sec
  const fComp = facts.cols.completions
  const fFirst = facts.cols.first_day
  const fLast = facts.cols.last_day
  let seeded = 0
  const seen = new Set<number>()
  for (let r = 0; r < facts.rows; r++) {
    const bt = byTid.get(fTid[r])
    if (!bt) continue
    if (opts.beforeDay !== undefined && fFirst[r] >= opts.beforeDay) continue
    viewing.seed(
      `v_${fUid[r].toString(36)}`,
      bt.videoId,
      fWatch[r],
      fComp[r],
      fFirst[r] * 86_400_000,
      fLast[r] * 86_400_000,
      Math.max(1, fPlays[r]),
    )
    seen.add(fUid[r])
    seeded++
  }
  viewing.bump()
  let modelReady = false
  let communities = 0
  if (opts.train !== false && seeded > 0) {
    await embeddingsInternals(app).whenReady()
    try {
      await audienceInternals(app).recomputeAsync({ seed: opts.seed ?? 1 })
      communities = services.audience.communities().length
    } catch {
      communities = 0
    }
    const run = await predictionInternals(app).trainNow({ seed: opts.seed ?? 1 })
    modelReady = run.status === 'DONE' && services.predictions.ready()
  }
  return {
    app,
    services,
    bridge,
    byTid,
    byVideoId,
    viewing,
    events,
    training: {
      viewers: seen.size,
      facts: seeded,
      modelReady,
      communities,
      seconds: Math.round((Date.now() - t0) / 100) / 10,
    },
    profile: (guid, name = 'İzleyici') => ({
      guid,
      accountId: `hesap-${guid}`,
      name,
      avatar: 'avatar-1.png',
      isKids: false,
      maturityLevel: 1000,
      language: 'tr',
    }),
    close: async () => {
      await app.close()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}
