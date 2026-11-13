/**
 * Çözümleyici kapsamı: shared/graphql/persisted.server.json içindeki gerçek kalıcı belgeler, çekirdek API'nin
 * GraphQL motoru (createGraphQLEngine) üzerinden bu çözümleyicilerle yürütülür.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  createGraphQLEngine,
  type GraphQLEngine,
  type GqlResponseBody,
  type PersistedRegistry,
} from '../src/graphql/engine'
import { resolvers } from '../src/graphql/resolvers/index'
import type { Passport } from '../src/kernel/context'
import { ACCOUNT_SINEMA, ADULT, createAlanApp, gqlContext, ID, KID, passport, TEEN, TEST_NOW } from './fixtures/alan'

const root = join(import.meta.dirname, '..', '..', 'shared', 'graphql')
const registry = JSON.parse(readFileSync(join(root, 'persisted.server.json'), 'utf8')) as PersistedRegistry
const idOf = (name: string) => {
  const e = Object.entries(registry.operations).find(([, op]) => op.name === name)
  if (!e) throw new Error(`Kalıcı sorgu yok: ${name}`)
  return e[0]
}

/* eslint-disable @typescript-eslint/no-explicit-any -- test gövdelerinde derin JSON erişimi */
type Data = Record<string, any>

describe('GraphQL çözümleyicileri (kalıcı belgelerle)', () => {
  let app: FastifyInstance
  let engine: GraphQLEngine
  const errors: string[] = []

  beforeAll(async () => {
    app = await createAlanApp()
    engine = createGraphQLEngine({
      typeDefs: readFileSync(join(root, 'schema.graphql'), 'utf8'),
      resolvers,
      persisted: registry,
      log: (level, msg, detail) =>
        void errors.push(`${level}: ${msg} ${detail instanceof Error ? detail.stack : JSON.stringify(detail ?? '')}`),
    })
  })
  afterAll(async () => {
    await app.close()
  })

  async function run(
    name: string,
    variables: Record<string, unknown> = {},
    pp: Passport = passport(ADULT),
  ): Promise<GqlResponseBody & { data: Data }> {
    const r = await engine.handle({
      body: {
        operationName: name,
        variables,
        extensions: { persistedQuery: { id: idOf(name), version: registry.version } },
      },
      passport: pp,
      makeContext: () => gqlContext(app, pp),
    })
    return { ...r.body, data: (r.body.data ?? {}) as Data }
  }
  async function ok(
    name: string,
    variables: Record<string, unknown> = {},
    pp: Passport = passport(ADULT),
  ): Promise<Data> {
    errors.length = 0
    const r = await run(name, variables, pp)
    expect(r.errors, `${name}: ${JSON.stringify(r.errors)} ${errors.join('\n')}`).toBeUndefined()
    return r.data
  }

  it('DetailModal — film', async () => {
    const { video: v } = await ok('DetailModal', { videoId: ID.sintel })
    expect(v).toMatchObject({
      __typename: 'Movie',
      videoId: ID.sintel,
      unifiedEntityId: `Video:${ID.sintel}`,
      title: 'Sintel',
      displayRuntime: '15 dk',
      latestYear: 2010,
      isPlayable: true,
      isAvailable: true,
      isKids: false,
      runtimeSec: 888,
      watchStatus: 'NEVER_WATCHED',
      bookmark: null,
      isInPlaylist: false,
      playlistActions: ['ADD_TO_PLAYLIST'],
      thumbRating: 'THUMBS_UNRATED',
      sourceKinds: ['OWN_CDN'],
      access: { state: 'PLAYABLE', reasonText: null },
      contentAdvisory: {
        certificationValue: '13+',
        maturityLevel: 80,
        boardName: 'RTÜK',
        reasons: ['Şiddet ve Korku'],
      },
      promoVideo: { viewableId: `Video:${ID.sintel}`, offset: 120, sourceKind: 'OWN_CDN' },
      license: { name: 'CC BY 3.0' },
      directors: [{ name: 'Colin Levy' }],
      collections: [{ collectionId: 9001, name: 'Blender açık filmleri' }],
    })
    expect(v.playbackBadges).toEqual(['AUDIO_FIVE_DOT_ONE', 'TEXT_SUBTITLES', 'SOURCE_OWN_CDN'])
    expect(v.boxart).toMatchObject({ type: 'BOXART', width: 368, height: 552 })
    expect(v.boxart.url).toMatch(/^\/img\/v1\/boxart\/368x552\/Video%3A80010001\.webp\?r=/)
    expect(v.billboard).toMatchObject({ type: 'BILLBOARD', width: 1280 })
    expect(v.genreTags.map((g: Data) => g.name)).toEqual(['Animasyon', 'Fantastik', 'Macera'])
    expect(v.moodTags[0]).toEqual({ id: 100001, displayName: 'Duygusal', isMood: true })
    expect(v.textEvidence.length).toBe(6) // ODP: tüm etiketler
    expect(v.supplementalVideos).toMatchObject([
      { __typename: 'Supplemental', videoId: ID.sintelTrailer, subType: 'TRAILER' },
    ])
    expect(v.similars.length).toBeGreaterThan(2)
    expect(v.similars.map((s: Data) => s.videoId)).not.toContain(ID.sintel)
    expect(typeof v.top10Rank).toBe('number')
  })

  it('DetailModal — dizi, bölüm; paket dışı; görünmez', async () => {
    const { video: show } = await ok('DetailModal', { videoId: ID.caminandes })
    expect(show).toMatchObject({
      __typename: 'Show',
      seasonCount: 2,
      episodeCount: 4,
      displayRuntime: '2 Sezon',
      sourceKinds: ['YOUTUBE'],
      badge: { kind: 'EXCLUSIVE', text: "Sadece TV+'ta" },
      promoVideo: { viewableId: `Video:${ID.cam_s1e1}`, offset: 30, sourceKind: 'YOUTUBE' },
      currentEpisode: { videoId: ID.cam_s1e1, number: 1, seasonNumber: 1, numberLabel: 'S1 B1' },
    })
    expect(show.seasons.map((s: Data) => [s.seasonId, s.numberLabel, s.title, s.episodes.length])).toEqual([
      [`${ID.caminandes}-S1`, 'S1', null, 2],
      [`${ID.caminandes}-S2`, 'S2', 'Yeni maceralar', 2],
    ])
    expect(show.seasons[0].episodes[1]).toMatchObject({
      __typename: 'Episode',
      title: 'Gran Dillama',
      displayRuntime: 'S1 B2 · 2 dk',
      parentShow: { videoId: ID.caminandes, title: 'Caminandes' },
      still: { type: 'EPISODE_STILL', width: 480 },
    })
    expect(show.seasons[1].episodes[1]).toMatchObject({ runtimeSec: null, displayRuntime: 'S2 B2' })

    const { video: ep } = await ok('DetailModal', { videoId: ID.cam_s2e1 })
    expect(ep).toMatchObject({
      __typename: 'Episode',
      number: 1,
      seasonNumber: 2,
      numberLabel: 'S2 B1',
      parentShow: { videoId: ID.caminandes },
    })

    const { video: tears } = await ok('DetailModal', { videoId: ID.tears })
    expect(tears).toMatchObject({
      isPlayable: false,
      promoVideo: null,
      badge: { kind: 'LOCKED', text: 'Sinema Paketi' },
      access: {
        state: 'UPSELL',
        reasonText: 'Sinema Paketi ile izlenir',
        requiredProductName: 'Sinema Paketi',
        cta: 'Paketi incele',
      },
    })
    const { video: owned } = await ok('DetailModal', { videoId: ID.tears }, passport(ADULT, ACCOUNT_SINEMA))
    expect(owned).toMatchObject({ isPlayable: true, badge: null })

    expect((await ok('DetailModal', { videoId: ID.nosferatu }, passport(TEEN))).video).toBeNull()
    expect((await ok('DetailModal', { videoId: 1 })).video).toBeNull()
  })

  it('rozet önceliği: Son N gün, Yeni', async () => {
    const d = await ok('MiniModalQuery', { videoIds: [ID.cosmos, ID.nosferatu, ID.anadolu, ID.spring] })
    expect(d.videos.map((v: Data) => v.badge)).toEqual([
      { kind: 'LEAVING_SOON', text: 'Son 5 gün' },
      { kind: 'NEW', text: 'Yeni' },
      { kind: 'NEW', text: 'Yeni' }, // yeni + özel → yeni önce gelir
      null,
    ])
  })

  it('MiniModalQuery — satır ön yüklemesi: sıra korunur, görünmeyen null', async () => {
    const d = await ok('MiniModalQuery', { videoIds: [ID.caminandes, 999, ID.sintel, ID.nosferatu] }, passport(KID))
    expect(d.videos.map((v: Data | null) => v?.videoId ?? null)).toEqual([ID.caminandes, null, null, null])
    const cam = d.videos[0]
    expect(cam.textEvidence.length).toBeLessThanOrEqual(3)
    expect(cam.textEvidence[0]).toEqual({ key: 'mood-100004', text: 'Eğlenceli' })
    expect(cam.titleLogo).toMatchObject({ type: 'TITLE_LOGO', width: 400, height: 160 })
    expect(cam.currentEpisode).toMatchObject({ videoId: ID.cam_s1e1, numberLabel: 'S1 B1', bookmark: null })
    expect(cam.isKids).toBe(true)
  })

  it('mutasyonlar + Library + yer imi akışı', async () => {
    const add = await ok('AddToPlaylist', { videoId: ID.sintel, tctx: '1,0,x,1,,,,,,,Video:80010001,' })
    expect(add.addToPlaylist).toEqual({
      isInPlaylist: true,
      video: { videoId: ID.sintel, isInPlaylist: true, playlistActions: ['DELETE_FROM_PLAYLIST'] },
    })
    await ok('AddToPlaylist', { videoId: ID.metropolis })
    const rm = await ok('RemoveFromPlaylist', { videoId: ID.metropolis })
    expect(rm.removeFromPlaylist).toMatchObject({ isInPlaylist: false, video: { isInPlaylist: false } })

    const th = await ok('SetThumbRating', { videoId: ID.bbb, rating: 'THUMBS_UP' })
    expect(th.setThumbRating).toEqual({
      thumbRating: 'THUMBS_UP',
      video: { videoId: ID.bbb, thumbRating: 'THUMBS_UP' },
    })

    const bm = await ok('SetBookmark', { viewableId: `Video:${ID.cam_s1e2}`, positionSec: 40 })
    expect(bm.setBookmark).toMatchObject({
      viewableId: `Video:${ID.cam_s1e2}`,
      watchStatus: 'STARTED',
      bookmark: { positionSec: 40, runtimeSec: 146 },
    })
    expect(bm.setBookmark.bookmark.progress).toBeCloseTo(40 / 146)
    const learned = await ok('SetBookmark', { viewableId: `Video:${ID.anadolu}`, positionSec: 100, durationSec: 2000 })
    expect(learned.setBookmark.bookmark).toMatchObject({ runtimeSec: 2000, progress: 0.05 })
    const ch = await ok('SetBookmark', { viewableId: 'Channel:3', positionSec: 5 })
    expect(ch.setBookmark).toEqual({ viewableId: 'Channel:3', watchStatus: 'NEVER_WATCHED', bookmark: null })

    expect((await ok('SetLastChannel', { channelId: 4 })).setLastChannel).toBe(true)
    expect((await ok('ToggleFavoriteChannel', { channelId: 2 })).toggleFavoriteChannel).toEqual({
      channelId: 2,
      isFavorite: true,
    })

    const lib = (await ok('Library')).library
    expect(lib.myList.map((v: Data) => v.videoId)).toEqual([ID.sintel])
    expect(lib.liked.map((v: Data) => v.videoId)).toEqual([ID.bbb])
    expect(lib.continueWatching.map((v: Data) => [v.__typename, v.videoId])).toEqual([
      ['Movie', ID.anadolu],
      ['Episode', ID.cam_s1e2],
    ])
    expect(lib.continueWatching[1]).toMatchObject({
      numberLabel: 'S1 B2',
      bookmark: { positionSec: 40 },
      watchStatus: 'STARTED',
    })
    expect(lib.favoriteChannels.map((c: Data) => c.channelId)).toEqual([1, 3, 2])

    // Dizi kartı: devam eden bölümün özeti ve ilerlemesi
    const { video: show } = await ok('DetailModal', { videoId: ID.caminandes })
    expect(show.contextualSynopsis).toBe("Gran Dillama: Koba'nın başı yine dertte.")
    expect(show.watchStatus).toBe('STARTED')
    expect(show.bookmark).toMatchObject({ positionSec: 40 })

    expect((await ok('RecordSearch', { term: 'Sintel' })).recordSearch).toBe(true)
    expect(app.services.progress.recentSearches(ADULT.guid)).toEqual(['Sintel'])
    expect((await ok('ClearRecentSearches')).clearRecentSearches).toBe(true)
    expect(app.services.progress.recentSearches(ADULT.guid)).toEqual([])

    expect((await ok('InterstitialHome', { location: 'HOME' })).interstitial).toMatchObject({
      id: 'canli-tanitim',
      href: '#/canli',
    })
    expect((await ok('DismissInterstitial', { id: 'canli-tanitim' })).dismissInterstitial).toBe(true)
    expect((await ok('InterstitialHome', { location: 'HOME' })).interstitial).toBeNull()
    // anonim de görür
    expect((await ok('InterstitialHome', { location: 'HOME' }, passport(null, null))).interstitial).toMatchObject({
      id: 'canli-tanitim',
    })

    expect((await ok('MarkNotificationsRead', { ids: null })).markNotificationsRead).toBe(true)
    expect(Array.isArray((await ok('Notifications')).notifications)).toBe(true)
  })

  it('mutasyon hataları: bilinmeyen video NOT_FOUND', async () => {
    const r = await run('AddToPlaylist', { videoId: 4242 })
    expect(r.errors?.[0]?.extensions.code).toBe('NOT_FOUND')
  })

  it('LivePage — yetenek pazarlığı ve varlık tipleri', async () => {
    // TEEN: bu dosyada son kanalı değiştirilmemiş profil
    const d = await ok(
      'LivePage',
      {
        capabilities: {
          rowTypes: ['LIVE_HERO', 'CHANNEL_ROW', 'TONIGHT_ROW', 'CATCHUP_ROW', 'BRIDGE'],
          entityKinds: ['CHANNEL', 'PROGRAM_AIRING'],
        },
      },
      passport(TEEN),
    )
    const p = d.livePage
    expect(p.serverTime).toBe(TEST_NOW.toISOString())
    expect(p.rows.map((r: Data) => r.type)).toEqual([
      'LIVE_HERO',
      'CHANNEL_ROW',
      'CHANNEL_ROW',
      'TONIGHT_ROW',
      'CATCHUP_ROW',
      'BRIDGE',
    ])
    const hero = p.rows[0].items[0]
    expect(hero).toMatchObject({
      kind: 'CHANNEL',
      entity: { __typename: 'Channel', channelId: 1, name: 'TRT 1', isFavorite: true, sourceKind: 'YOUTUBE' },
    })
    expect(hero.entity.now).toMatchObject({
      __typename: 'ProgramAiring',
      airingId: '1-20261113-0900',
      liveState: 'LIVE',
      startOver: false,
    })
    expect(hero.entity.next).toMatchObject({ airingId: '1-20261113-1300', liveState: 'UPCOMING' })
    expect(hero.entity.logo).toMatchObject({ type: 'CHANNEL_LOGO', width: 128 })
    expect(hero.track.tctx).toBe(`0,0,live-hero,${p.rows[0].trackId},,,,,,,Channel:1,`)
    const all = p.rows[2].items.map((i: Data) => i.entity)
    expect(all.find((c: Data) => c.channelId === 5).access).toMatchObject({ state: 'UPSELL' })
    expect(all.find((c: Data) => c.channelId === 3)).toMatchObject({
      isSampleSchedule: false,
      sourceKind: 'OWN_CDN',
      now: { startOver: true },
    })
    const tonight = p.rows[3].items[0].entity
    expect(tonight).toMatchObject({
      __typename: 'ProgramAiring',
      liveState: 'UPCOMING',
      art: { type: 'STORY_ART', width: 608 },
    })
    const catchup = p.rows[4].items.map((i: Data) => i.entity)
    expect(catchup.every((a: Data) => a.catchup.available === true && a.liveState === 'ENDED')).toBe(true)
    const accessOf = (a: Data) => a.access.state
    // paket kanalı kilitli görünür, 18+ film 13+ profile geri alınamaz, diğerleri oynatılabilir
    for (const a of catchup) {
      const expected = a.channel.channelId === 5 ? 'UPSELL' : a.video?.videoId === ID.nosferatu ? 'BLOCKED' : 'PLAYABLE'
      expect([a.airingId, accessOf(a)]).toEqual([a.airingId, expected])
    }
    expect(new Set(catchup.map(accessOf))).toEqual(new Set(['UPSELL', 'BLOCKED', 'PLAYABLE']))
    expect(p.rows[5]).toMatchObject({ bridgeTo: 'film-dizi', items: [] })

    const narrow = (await ok('LivePage', { capabilities: { rowTypes: ['CHANNEL_ROW'], entityKinds: ['CHANNEL'] } }))
      .livePage
    expect(narrow.rows.map((r: Data) => r.title)).toEqual(['Kanallarım', 'Tüm kanallar'])
    // ADULT önceki testte kanal 4'ü son kanal yaptı → kahraman o
    const adult = (await ok('LivePage', { capabilities: { rowTypes: ['LIVE_HERO'], entityKinds: ['CHANNEL'] } }))
      .livePage
    expect(adult.rows[0].items[0].entity.channelId).toBe(4)
  })

  it('Guide — kanallar ve yayın akışı aralığı; çocuk profili', async () => {
    const vars = { from: '2026-11-13T15:00:00.000Z', to: '2026-11-13T21:00:00.000Z' }
    const d = await ok('Guide', vars)
    expect(d.channels.map((c: Data) => c.number)).toEqual([1, 2, 3, 4, 5])
    const trt = d.channels[0]
    expect(trt.airings.map((a: Data) => a.airingId)).toEqual([
      '1-20261113-1300',
      '1-20261113-1900',
      '1-20261113-2000',
      '1-20261113-2200',
    ])
    expect(trt.airings[2]).toMatchObject({
      video: { videoId: ID.cam_s1e2 },
      startOver: true,
      catchup: { available: false },
    })
    expect(trt.airings[2].catchup.until).toBe('2026-11-20T19:00:00.000Z')
    expect(trt.isSampleSchedule).toBe(true)
    const film = await ok('Guide', { ...vars, category: 'film-dizi' })
    expect(film.channels.map((c: Data) => c.channelId)).toEqual([3, 5])
    const kid = await ok('Guide', vars, passport(KID))
    expect(kid.channels.map((c: Data) => c.channelId)).toEqual([4])
  })

  it('PlaybackMetadata — Video, Channel, Airing, bilinmeyen', async () => {
    const show = (await ok('PlaybackMetadata', { viewableId: `Video:${ID.caminandes}` }, passport(TEEN)))
      .playbackMetadata
    expect(show).toMatchObject({
      viewableId: `Video:${ID.caminandes}`,
      title: 'Caminandes',
      subtitle: 'S1 B1 · Llama Drama',
      live: false,
      video: { videoId: ID.cam_s1e1, number: 1, seasonNumber: 1 },
      nextEpisode: { videoId: ID.cam_s1e2, number: 2 },
      creditsOffsetSec: 45,
      access: { state: 'PLAYABLE' },
      channel: null,
      previousChannel: null,
    })
    const last = (await ok('PlaybackMetadata', { viewableId: `Video:${ID.cam_s1e2}` }, passport(TEEN))).playbackMetadata
    expect(last.nextEpisode.videoId).toBe(ID.cam_s2e1)
    const movie = (await ok('PlaybackMetadata', { viewableId: `Video:${ID.sintel}` }, passport(TEEN))).playbackMetadata
    expect(movie).toMatchObject({
      subtitle: null,
      nextEpisode: null,
      creditsOffsetSec: 843,
      video: { license: { name: 'CC BY 3.0' } },
    })

    const ch = (await ok('PlaybackMetadata', { viewableId: 'Channel:1' }, passport(TEEN))).playbackMetadata
    expect(ch).toMatchObject({
      title: 'Gündüz Kuşağı',
      subtitle: 'TRT 1',
      live: true,
      channel: { channelId: 1 },
      airing: { airingId: '1-20261113-0900', liveState: 'LIVE' },
      previousChannel: { channelId: 5, number: 5 },
      nextChannel: { channelId: 2, number: 2 },
      video: null,
    })
    const linear = (await ok('PlaybackMetadata', { viewableId: 'Channel:3' }, passport(TEEN))).playbackMetadata
    expect(linear.live).toBe(true)
    expect([ID.sintel, ID.bbb, ID.spring]).toContain(linear.video.videoId)

    const air = (await ok('PlaybackMetadata', { viewableId: 'Airing:1-20261112-2200' })).playbackMetadata
    expect(air).toMatchObject({
      title: 'Gece Sineması: Nosferatu',
      live: false,
      video: { videoId: ID.nosferatu },
      access: { state: 'PLAYABLE' },
    })
    const oldNews = (await ok('PlaybackMetadata', { viewableId: 'Airing:1-20261112-1900' })).playbackMetadata
    expect(oldNews.access).toMatchObject({ state: 'OUT_OF_WINDOW', reasonText: 'Tekrar izlenemiyor' })

    for (const id of ['Video:1', 'Channel:99', 'Airing:1-20200101-0000', 'bozuk', 'Person:1']) {
      expect((await ok('PlaybackMetadata', { viewableId: id })).playbackMetadata).toBeNull()
    }
    expect((await ok('PlaybackMetadata', { viewableId: 'Channel:1' }, passport(KID))).playbackMetadata).toBeNull()
  })

  it('MembershipStatus, CollectionPage, GenrePage, PersonPage', async () => {
    const m = (await ok('MembershipStatus')).membershipStatus
    expect(m).toMatchObject({
      status: 'CURRENT_MEMBER',
      account: { accountId: 'acc_test', products: ['tvplus-temel'] },
      activeProfile: { guid: ADULT.guid },
    })
    expect(m.account.profiles.map((p: Data) => [p.name, p.isActive])).toEqual([
      ['Deniz', true],
      ['Ece', false],
      ['Can', false],
    ])
    expect(m.account.profiles[0].avatar).toMatchObject({ type: 'AVATAR', width: 160 })
    const anon = (await ok('MembershipStatus', {}, passport(null, null))).membershipStatus
    expect(anon).toEqual({ status: 'ANONYMOUS', account: null, activeProfile: null })

    const col = (await ok('CollectionPage', { collectionId: 9001 }, passport(KID))).collection
    expect(col).toMatchObject({ unifiedEntityId: 'Collection:9001', name: 'Blender açık filmleri' })
    expect(col.videos.map((v: Data) => v.videoId)).toEqual([ID.bbb, ID.spring])
    expect((await ok('CollectionPage', { collectionId: 9999 })).collection).toBeNull()

    const g = (await ok('GenrePage', { genreId: 31574 })).genre
    expect(g).toMatchObject({ name: 'Klasikler' })
    expect(g.videos.map((v: Data) => v.videoId)).toEqual([ID.nosferatu, ID.metropolis])

    const personId = app.services.catalog.people().find((p) => p.name === 'Ton Roosendaal')!.personId
    const person = (await ok('PersonPage', { personId })).person
    expect(person.videos.length).toBe(6)
    expect((await ok('PersonPage', { personId: 1 })).person).toBeNull()
  })

  it('profil kapısı: anonim UNAUTHENTICATED, profilsiz PROFILE_REQUIRED (motor + çözümleyici)', async () => {
    expect((await run('Library', {}, passport(null, null))).errors?.[0]?.extensions.code).toBe('UNAUTHENTICATED')
    expect((await run('Library', {}, passport(null))).errors?.[0]?.extensions.code).toBe('PROFILE_REQUIRED')
  })
})
