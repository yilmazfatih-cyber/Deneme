import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { parseTctx } from '../../shared/tctx'
import type { EventsService } from '../src/kernel/services'
import { buildLivePage } from '../src/services/discovery/livePage'
import { buildLolomo, MIN_ROW_ITEMS } from '../src/services/discovery/lolomo'
import { similarity, similarTitles } from '../src/services/discovery/similarity'
import { top10ForProfile, top10Rank } from '../src/services/discovery/top10'
import { localDayNumber } from '../src/services/epg/time'
import { ADULT, createAlanApp, FIXTURE_CONTENT_DIR, ID, KID, passport, setClock, TEEN, TEST_NOW } from './fixtures/alan'

const ALL_ROWS = ['LIVE_HERO', 'CHANNEL_ROW', 'TONIGHT_ROW', 'CATCHUP_ROW', 'POSTER_ROW', 'CONTINUE_ROW', 'BRIDGE']
const ALL_KINDS = ['VIDEO', 'CHANNEL', 'PROGRAM_AIRING', 'PERSON', 'GENERIC_CONTAINER']

function fakeEvents(counts: [number, number][]): EventsService {
  return {
    playCounts: () => new Map(counts),
    ingest: () => ({ accepted: 0, dropped: 0, rateLimitRemaining: 0 }),
    stats: () => ({ total: 0, lastBatchAt: null, byName: {} }),
  }
}

describe('Film & Dizi lolomo', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await createAlanApp()
  })
  afterEach(async () => {
    await app.close()
  })
  const lolomo = (profile = ADULT, top10Supported = true, now = TEST_NOW) =>
    buildLolomo(app.services, profile, { top10Supported, now })

  it('yeni profil: satır sırası ve varlık kuralları', () => {
    const l = lolomo()
    expect(l.lists.map((x) => x.context)).toEqual([
      'billboard',
      'top10',
      'newReleases',
      'genre',
      'collection',
      'bridge',
      'curated',
    ])
    const byCtx = Object.fromEntries(l.lists.map((x) => [x.context, x]))
    expect(byCtx.top10!.videoIds.length).toBe(9)
    expect(byCtx.newReleases!.videoIds.slice(0, 3)).toEqual([ID.anadolu, ID.nosferatu, ID.spring]) // eklenme tarihi azalan
    expect(byCtx.newReleases!.displayName).toBe('Yeni gelenler')
    expect(byCtx.genre).toMatchObject({ displayName: 'Animasyon', genreId: 7424 })
    expect(byCtx.genre!.videoIds).toEqual([ID.sintel, ID.bbb, ID.caminandes, ID.spring]) // popülerlik sırası
    expect(byCtx.collection).toMatchObject({ displayName: 'Blender açık filmleri', collectionId: 9001 })
    expect(byCtx.curated).toMatchObject({ displayName: 'Editörün seçimi' })
    expect(byCtx.bridge).toMatchObject({ displayName: 'Canlı TV', videoIds: [] })
    // 3'ten az öğeli satırlar düşer: exclusive (2), korku (1), leaving (1)
    for (const x of l.lists)
      if (!['billboard', 'bridge'].includes(x.context)) expect(x.videoIds.length).toBeGreaterThanOrEqual(MIN_ROW_ITEMS)
    // kararlı kimlikler
    expect(lolomo().lists.map((x) => [x.listId, x.trackId])).toEqual(l.lists.map((x) => [x.listId, x.trackId]))
    expect(new Set(l.lists.map((x) => x.listId)).size).toBe(l.lists.length)
    expect(l.lists.every((x) => Number.isInteger(x.trackId))).toBe(true)
    expect(lolomo(TEEN).lists[0]!.listId).not.toBe(l.lists[0]!.listId) // profile özgü
  })

  it('vitrin: tarihe göre kararlı günlük dönüş', () => {
    const cands = [ID.sintel, ID.tears, ID.caminandes]
    const pick = (now: Date) => lolomo(ADULT, true, now).lists[0]!.videoIds
    expect(pick(TEST_NOW)).toEqual([cands[localDayNumber(TEST_NOW) % 3]])
    expect(pick(new Date(TEST_NOW.getTime() + 3600_000))).toEqual(pick(TEST_NOW))
    const tomorrow = new Date(TEST_NOW.getTime() + 86_400_000)
    expect(pick(tomorrow)).toEqual([cands[localDayNumber(tomorrow) % 3]])
    expect(pick(tomorrow)).not.toEqual(pick(TEST_NOW))
  })

  it('Top 10 yetenek bayrağı kapalıysa satır hiç üretilmez', () => {
    expect(lolomo(ADULT, false).lists.some((x) => x.context === 'top10')).toBe(false)
  })

  it('çocuk profili: yalnız uygun başlıklar', () => {
    const l = lolomo(KID)
    const kidsOk = new Set([ID.bbb, ID.spring, ID.metropolis, ID.caminandes, ID.anadolu])
    for (const x of l.lists) for (const v of x.videoIds) expect(kidsOk.has(v as never)).toBe(true)
    expect(l.lists[0]).toMatchObject({ context: 'billboard', videoIds: [ID.caminandes] })
    expect(l.lists.map((x) => x.context)).toEqual(['billboard', 'top10', 'newReleases', 'genre', 'bridge'])
  })

  it('kişisel satırlar: devam et, Listem, "… izlediğin için", Sana özel', () => {
    const p = app.services.progress
    setClock(app, new Date(TEST_NOW.getTime() - 60_000))
    p.setBookmark(ADULT.guid, ID.nosferatu, 600)
    setClock(app, TEST_NOW)
    p.setBookmark(ADULT.guid, ID.sintel, 300)
    p.addToMyList(ADULT.guid, ID.metropolis)
    p.setThumbRating(ADULT.guid, ID.spring, 'THUMBS_UP')
    const l = lolomo()
    const byCtx = Object.fromEntries(l.lists.map((x) => [x.context, x]))
    expect(l.lists.map((x) => x.context).slice(0, 5)).toEqual([
      'billboard',
      'continueWatching',
      'top10',
      'becauseYouWatched',
      'queue',
    ])
    expect(byCtx.continueWatching!.videoIds).toEqual([ID.sintel, ID.nosferatu])
    expect(byCtx.queue!.videoIds).toEqual([ID.metropolis])
    expect(byCtx.becauseYouWatched!.displayName).toBe('Sintel izlediğin için')
    expect(byCtx.becauseYouWatched!.videoIds).not.toContain(ID.sintel)
    expect(byCtx.gems!.displayName).toBe('Sana özel')
    expect(byCtx.gems!.videoIds.length).toBeGreaterThanOrEqual(3)
    // genç profilde 18+ izleme geçmişi görünmez
    p.setBookmark(TEEN.guid, ID.nosferatu, 600)
    const teen = Object.fromEntries(lolomo(TEEN).lists.map((x) => [x.context, x]))
    expect(teen.continueWatching).toBeUndefined()
    expect(teen.becauseYouWatched).toBeUndefined()
  })

  it('Kalkmadan izle: 30 gün içinde kalkanlar, en yakın önce', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tvplus-alan-'))
    cpSync(FIXTURE_CONTENT_DIR, dir, { recursive: true })
    const file = join(dir, 'titles', 'blender.json')
    const titles = JSON.parse(readFileSync(file, 'utf8')) as {
      videoId: number
      availability: Record<string, unknown>
    }[]
    for (const t of titles) {
      if (t.videoId === ID.spring) t.availability.leavingAt = '2026-12-01'
      if (t.videoId === ID.bbb) t.availability.leavingAt = '2026-11-25'
      if (t.videoId === ID.sintel) t.availability.leavingAt = '2027-03-01' // pencere dışı
    }
    writeFileSync(file, JSON.stringify(titles))
    const other = await createAlanApp({ contentDir: dir })
    const l = buildLolomo(other.services, ADULT, { top10Supported: true, now: TEST_NOW })
    expect(l.lists.at(-1)).toMatchObject({
      context: 'leaving',
      displayName: 'Kalkmadan izle',
      videoIds: [ID.cosmos, ID.bbb, ID.spring],
    })
    await other.close()
  })

  it('benzerlik: ağırlıklı Jaccard + koleksiyon desteği', () => {
    const cat = app.services.catalog
    const s = (a: number, b: number) => similarity(cat, cat.getTitle(a)!, cat.getTitle(b)!)
    expect(s(ID.sintel, ID.spring)).toBeCloseTo(s(ID.spring, ID.sintel))
    expect(s(ID.sintel, ID.spring)).toBeGreaterThan(s(ID.sintel, ID.nosferatu))
    expect(s(ID.nosferatu, ID.metropolis)).toBeGreaterThan(s(ID.nosferatu, ID.bbb))
    const sims = similarTitles(cat, ID.nosferatu).map((t) => t.videoId)
    expect(sims[0]).toBe(ID.metropolis)
    expect(sims).not.toContain(ID.nosferatu)
  })

  it('Top 10: popülerlik + son 24 saatin oynatmaları', () => {
    const base = top10ForProfile(app.services, ADULT, TEST_NOW)
    expect(base[0]).toBe(ID.sintel) // popülerlik 80
    expect(top10ForProfile(app.services, ADULT, TEST_NOW)).toEqual(base) // aynı gün kararlı
    // bölüm oynatmaları üst başlığa toplanır
    app.services.events = fakeEvents([
      [ID.metropolis, 40],
      [ID.cam_s1e1, 30],
      [ID.cam_s1e2, 30],
    ])
    const hot = top10ForProfile(app.services, ADULT, TEST_NOW)
    expect(hot.slice(0, 2)).toEqual([ID.caminandes, ID.metropolis])
    expect(top10Rank(app.services, ID.metropolis, ADULT, TEST_NOW)).toBe(2)
    expect(top10Rank(app.services, ID.nosferatu, KID, TEST_NOW)).toBeNull()
    expect(top10ForProfile(app.services, KID, TEST_NOW)).not.toContain(ID.sintel)
  })
})

describe('Canlı TV sayfası', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await createAlanApp()
  })
  afterEach(async () => {
    await app.close()
  })
  const page = (pp = passport(ADULT), rowTypes = ALL_ROWS, entityKinds = ALL_KINDS) =>
    buildLivePage(app.services, pp, { rowTypes, entityKinds }, TEST_NOW)

  it('tüm yetenekler: satırlar, ttl, tctx', () => {
    const p = page()
    expect(p.rows.map((r) => [r.rowId, r.type, r.title])).toEqual([
      ['live-hero', 'LIVE_HERO', null],
      ['live-favorites', 'CHANNEL_ROW', 'Kanallarım'],
      ['live-all', 'CHANNEL_ROW', 'Tüm kanallar'],
      ['live-tonight', 'TONIGHT_ROW', 'Bu akşam'],
      ['live-catchup', 'CATCHUP_ROW', 'Kaçırdıkların · son 7 gün'],
      ['live-bridge', 'BRIDGE', 'Film & Dizi'],
    ])
    expect(p.rows[0]!.items.map((i) => i.entity)).toEqual([{ channelId: 1 }])
    expect(p.rows[1]!.items.map((i) => i.entity)).toEqual([{ channelId: 1 }, { channelId: 3 }])
    expect(p.rows[2]!.items.length).toBe(5)
    expect(p.rows.find((r) => r.type === 'LIVE_HERO')!.ttlSec).toBe(60)
    expect(p.rows.at(-1)).toMatchObject({ bridgeTo: 'film-dizi', items: [] })
    expect(Date.parse(p.expires) - TEST_NOW.getTime()).toBe(60_000)
    expect(p.serverTime).toBe(TEST_NOW.toISOString())

    const tonight = p.rows[3]!.items.map((i) => i.entity as { airingId: string; startAt: Date })
    const from = Date.parse('2026-11-13T16:00:00Z')
    const to = Date.parse('2026-11-13T21:00:00Z')
    expect(tonight.length).toBeGreaterThan(5)
    for (const a of tonight) expect(a.startAt.getTime() >= from && a.startAt.getTime() < to).toBe(true)
    expect(tonight.map((a) => a.airingId)).toContain('1-20261113-1900')

    for (const a of p.rows[4]!.items.map(
      (i) => i.entity as { endAt: Date; videoId: number | null; channelId: number },
    )) {
      expect(a.endAt.getTime()).toBeLessThanOrEqual(TEST_NOW.getTime())
      expect(a.videoId !== null || a.channelId === 3).toBe(true)
    }

    p.rows.forEach((r, row) =>
      r.items.forEach((it, pos) => {
        expect(it.track).toMatchObject({ row, pos, rowId: r.rowId, trackId: r.trackId })
        expect(parseTctx(it.track.tctx)).toEqual({
          row,
          rank: pos,
          rowId: r.rowId,
          trackId: r.trackId,
          entityId: it.track.entityId,
        })
      }),
    )
  })

  it('son kanal kahramanda; çocuk profili yalnız çocuk kanalları', () => {
    app.services.progress.setLastChannel(ADULT.guid, 5)
    expect(page().rows[0]!.items[0]!.entity).toEqual({ channelId: 5 })
    const kid = page(passport(KID))
    const channelIds = kid.rows.flatMap((r) => r.items.map((i) => ('channelId' in i.entity ? i.entity.channelId : -1)))
    expect(new Set(channelIds)).toEqual(new Set([4]))
    expect(kid.rows.map((r) => r.rowId)).toEqual(['live-hero', 'live-all', 'live-catchup', 'live-bridge'])
  })

  it('yetenek pazarlığı: bilinmeyen satır tipi ve varlık türü yollanmaz', () => {
    const p = page(passport(ADULT), ['CHANNEL_ROW', 'TONIGHT_ROW', 'BRIDGE'], ['CHANNEL'])
    expect(p.rows.map((r) => r.rowId)).toEqual(['live-favorites', 'live-all', 'live-bridge'])
    expect(p.rows.map((_, i) => i)).toEqual(p.rows.flatMap((r, i) => (r.items[0] ? [r.items[0].track.row] : [i])))
    const q = page(passport(ADULT), ['TONIGHT_ROW'], ['PROGRAM_AIRING'])
    expect(q.rows.map((r) => r.type)).toEqual(['TONIGHT_ROW'])
    expect(q.rows[0]!.items.every((i) => i.kind === 'PROGRAM_AIRING' && i.track.row === 0)).toBe(true)
  })
})
