import { describe, expect, it } from 'vitest'
import {
  accessNoticeOf,
  aboutOf,
  attributionOf,
  episodeStateOf,
  matchOf,
  metaLineParts,
  metaOf,
  primaryActionOf,
  qualityLabels,
  similarsOf,
  type DetailActionInput,
} from './model'
import { invalidationPaths } from './sync'
import type { AccessData, CardVideoData, DetailVideo, EpisodeData, SeasonData, SimilarCardData } from './types'

const PLAYABLE: AccessData = { state: 'PLAYABLE', reasonText: null, requiredProduct: null }

function card(videoId: number, over: Partial<CardVideoData> = {}): CardVideoData {
  return {
    __typename: 'Movie',
    videoId,
    unifiedEntityId: `Video:${videoId}`,
    title: `Başlık ${videoId}`,
    shortSynopsis: 'Kısa özet',
    displayRuntime: '15 dk',
    latestYear: 2010,
    isPlayable: true,
    isKids: false,
    top10Rank: null,
    sourceKinds: ['OWN_CDN'],
    watchStatus: 'NEVER_WATCHED',
    access: PLAYABLE,
    badge: null,
    boxart: null,
    storyArt: null,
    contentAdvisory: { certificationValue: '13+', maturityLevel: 80 },
    bookmark: null,
    ...over,
  }
}

function episode(videoId: number, season: number, number: number, over: Partial<EpisodeData> = {}): EpisodeData {
  return {
    ...card(videoId, { __typename: 'Episode' }),
    number,
    seasonNumber: season,
    synopsis: `Bölüm ${number} özeti`,
    runtimeSec: 1500,
    still: { url: `/still/${videoId}.webp`, width: 480, height: 270 },
    ...over,
  }
}

function movie(over: Partial<DetailVideo> = {}): DetailVideo {
  return {
    ...card(80010001),
    title: 'Sintel',
    synopsis: 'Uzun özet',
    contextualSynopsis: 'Uzun özet',
    runtimeSec: 888,
    isAvailable: true,
    isInPlaylist: false,
    playlistActions: ['ADD_TO_PLAYLIST'],
    thumbRating: 'THUMBS_UNRATED',
    playbackBadges: ['VIDEO_HD', 'VIDEO_ULTRA_HD', 'AUDIO_FIVE_DOT_ONE', 'TEXT_SUBTITLES', 'SOURCE_OWN_CDN'],
    billboard: null,
    genreTags: [{ genreId: 7424, name: 'Animasyon' }],
    moodTags: [{ id: 1, displayName: 'Duygusal', isMood: true }],
    textEvidence: [],
    license: { name: 'CC BY 3.0', attribution: '© Blender Foundation', url: 'https://durian.blender.org/' },
    promoVideo: null,
    contentAdvisory: { certificationValue: '13+', maturityLevel: 80, reasons: ['Şiddet ve Korku'], boardName: 'RTÜK' },
    cast: [{ personId: 1, name: 'Halina Reijn' }],
    directors: [{ personId: 2, name: 'Colin Levy' }],
    creators: [],
    collections: [{ collectionId: 9001, name: 'Blender Açık Filmleri' }],
    ...over,
  }
}

const base: DetailActionInput = {
  typename: 'Movie',
  videoId: 80010001,
  access: PLAYABLE,
  bookmark: null,
  runtimeSec: 888,
  currentEpisode: null,
  tctx: '0,1,benzer,0,,,,,,,Video:80010001,',
}

describe('primaryActionOf', () => {
  it('film, izlenmemiş → Oynat', () => {
    const a = primaryActionOf(base)
    expect(a).toMatchObject({ kind: 'play', label: 'Oynat', playVideoId: 80010001, episodeCode: null })
    if (a.kind !== 'play') throw new Error()
    expect(a.to).toBe('/izle/Video:80010001?tctx=0%2C1%2Cbenzer%2C0%2C%2C%2C%2C%2C%2C%2CVideo%3A80010001%2C')
  })

  it('film, yarım kalmış → Devam Et + Baştan Başlat + kalan süre', () => {
    const a = primaryActionOf({ ...base, tctx: null, bookmark: { positionSec: 300, runtimeSec: 888, progress: 0.34 } })
    expect(a).toMatchObject({ kind: 'resume', label: 'Devam Et', progress: 0.34, remaining: '10 dk kaldı' })
    if (a.kind !== 'resume') throw new Error()
    expect(a.restartTo).toBe('/izle/Video:80010001?baslat=bastan')
  })

  it('bitmiş film → yeniden Oynat', () => {
    expect(primaryActionOf({ ...base, bookmark: { positionSec: 880, progress: 0.99 } }).kind).toBe('play')
  })

  it('dizi → sıradaki bölümün kodu, bölüm oynatılır', () => {
    const a = primaryActionOf({
      ...base,
      typename: 'Show',
      videoId: 80031000,
      currentEpisode: { videoId: 80031002, number: 2, seasonNumber: 1, runtimeSec: 600, bookmark: null },
    })
    expect(a).toMatchObject({ kind: 'play', label: 'Oynat', playVideoId: 80031002, episodeCode: 'S1:B2' })
  })

  it('dizi, yarım bölüm → Devam Et S2:B3', () => {
    const a = primaryActionOf({
      ...base,
      typename: 'Show',
      currentEpisode: {
        videoId: 7,
        number: 3,
        seasonNumber: 2,
        runtimeSec: 2700,
        bookmark: { positionSec: 1320, progress: 0.49 },
      },
    })
    expect(a).toMatchObject({ kind: 'resume', label: 'Devam Et', episodeCode: 'S2:B3', remaining: '23 dk kaldı' })
  })

  it('bölümü olmayan dizi → izlenemiyor', () => {
    expect(primaryActionOf({ ...base, typename: 'Show' })).toMatchObject({ kind: 'unavailable', label: null })
  })

  it('paket gerekiyor → Paketi İncele (paket adıyla)', () => {
    const a = primaryActionOf({
      ...base,
      access: {
        state: 'UPSELL',
        reasonText: 'Sinema Paketi ile izlenir',
        requiredProduct: 'sinema-paketi',
        requiredProductName: 'Sinema Paketi',
        cta: 'Paketi incele',
      },
    })
    expect(a).toEqual({
      kind: 'upsell',
      label: 'Paketi İncele',
      productName: 'Sinema Paketi',
      reasonText: 'Sinema Paketi ile izlenir',
    })
  })

  it('yayın süresi dolmuş → izlenemiyor, sunucunun gerekçesiyle', () => {
    const a = primaryActionOf({
      ...base,
      access: { state: 'OUT_OF_WINDOW', reasonText: 'Yayın süresi doldu', requiredProduct: null },
    })
    expect(a).toEqual({ kind: 'unavailable', label: null, reasonText: 'Yayın süresi doldu' })
  })
})

describe('metaOf / metaLineParts', () => {
  it('film: eşleşme, Yeni, yıl, süre, kalite, Top 10', () => {
    const m = metaOf(movie({ badge: { kind: 'NEW', text: 'Yeni' }, top10Rank: 2 }), 92)
    expect(m).toEqual({
      match: 92,
      isNew: true,
      year: 2010,
      duration: '15 dk',
      certification: '13+',
      reasons: ['Şiddet ve Korku'],
      quality: ['4K', '5.1', 'Altyazı'],
      top10: { rank: 2, category: 'Filmlerde' },
    })
    expect(metaLineParts(m).map((p) => p.text)).toEqual(['%92 Eşleşme', 'Yeni', '2010', '13+', '15 dk', '4K'])
  })

  it('eşleşme yoksa (null / geçersiz) gösterilmez', () => {
    expect(metaOf(movie(), null).match).toBeNull()
    expect(metaOf(movie(), 140).match).toBeNull()
    expect(metaLineParts(metaOf(movie())).map((p) => p.kind)).toEqual(['year', 'cert', 'duration', 'quality'])
  })

  it('dizi: birden çok sezonda "N Sezon", tek sezonda bölüm sayısı; Top 10 "Dizilerde"', () => {
    const show = movie({ __typename: 'Show', seasonCount: 2, episodeCount: 8, runtimeSec: null, top10Rank: 3 })
    expect(metaOf(show).duration).toBe('2 Sezon')
    expect(metaOf(show).top10).toEqual({ rank: 3, category: 'Dizilerde' })
    expect(metaOf({ ...show, seasonCount: 1, episodeCount: 4 }).duration).toBe('4 Bölüm')
  })

  it('Genel İzleyici kısaltılır, süre bilinmiyorsa displayRuntime', () => {
    const m = metaOf(
      movie({
        runtimeSec: null,
        displayRuntime: '1 sa 2 dk',
        playbackBadges: [],
        contentAdvisory: { certificationValue: 'Genel İzleyici', maturityLevel: 10, reasons: [] },
      }),
    )
    expect(metaLineParts(m).map((p) => p.text)).toEqual(['2010', 'Genel', '1 sa 2 dk'])
  })

  it('kalite etiketleri tekrarsız ve sıralı', () => {
    expect(qualityLabels(['TEXT_CLOSED_CAPTIONS', 'VIDEO_HD'])).toEqual(['HD', 'Altyazı'])
    expect(matchOf(87.6)).toBe(88)
  })
})

describe('episodeStateOf', () => {
  const seasons: SeasonData[] = [
    {
      seasonId: 's1',
      number: 1,
      numberLabel: 'S1',
      title: null,
      episodes: [
        episode(11, 1, 1, { bookmark: { positionSec: 1490, progress: 0.99 } }),
        episode(12, 1, 2, { bookmark: { positionSec: 600, progress: 0.4 } }),
      ],
    },
    {
      seasonId: 's2',
      number: 2,
      numberLabel: 'S2',
      title: 'Yeni maceralar',
      episodes: [
        episode(21, 2, 1),
        episode(22, 2, 2, {
          runtimeSec: null,
          still: null,
          access: { state: 'UPSELL', reasonText: 'Sinema Paketi ile izlenir', requiredProduct: 'x' },
        }),
      ],
    },
  ]

  it('varsayılan sezon sıradaki bölümün sezonu; sıradaki bölüm vurgulu; ilerleme ve kalan süre', () => {
    const s = episodeStateOf(seasons, { videoId: 12, seasonNumber: 1 })!
    expect(s.selected).toBe(1)
    expect(s.selectedLabel).toBe('Sezon 1')
    expect(s.showPicker).toBe(true)
    expect(s.seasons).toEqual([
      { number: 1, label: 'Sezon 1', episodeCount: 2 },
      { number: 2, label: 'Yeni maceralar', episodeCount: 2 },
    ])
    expect(s.episodes.map((e) => [e.videoId, e.isCurrent, e.progress, e.remaining, e.runtime, e.code])).toEqual([
      [11, false, 0.99, null, '25 dk', 'S1:B1'],
      [12, true, 0.4, '15 dk kaldı', '25 dk', 'S1:B2'],
    ])
  })

  it('seçilen sezon, kilitli bölüm, görselsiz bölüm', () => {
    const s = episodeStateOf(seasons, { videoId: 12, seasonNumber: 1 }, 2)!
    expect(s.selected).toBe(2)
    expect(s.selectedLabel).toBe('Yeni maceralar')
    const locked = s.episodes[1]!
    expect(locked).toMatchObject({ playable: false, lockedText: 'Sinema Paketi ile izlenir', runtime: '', image: null })
  })

  it('bilinmeyen seçim ve sıradaki bölüm yoksa ilk sezon; tek sezonda seçici yok', () => {
    expect(episodeStateOf(seasons, null, 9)!.selected).toBe(1)
    expect(episodeStateOf(seasons.slice(0, 1), null)!.showPicker).toBe(false)
    expect(episodeStateOf([], null)).toBeNull()
  })
})

describe('similarsOf', () => {
  const plain: SimilarCardData[] = [card(1), card(2), card(80010001)]

  it('gerekçeli liste yoksa düz benzerler; başlığın kendisi çıkar', () => {
    expect(similarsOf(80010001, plain, null).map((s) => [s.video.videoId, s.reason, s.match])).toEqual([
      [1, null, null],
      [2, null, null],
    ])
  })

  it('gerekçeli liste varsa o kullanılır (gerekçe + eşleşme), tekrarlar düşer', () => {
    const insights = {
      __typename: 'Movie' as const,
      videoId: 80010001,
      similarsWithReason: [
        { score: 0.5, reason: 'Ortak: Duygusal Fantastik Filmler', video: { ...card(3), matchScore: 91 } },
        { score: 0.4, reason: null, video: card(3) },
        { score: 0.3, reason: null, video: card(4) },
      ],
    }
    expect(similarsOf(80010001, plain, insights).map((s) => [s.video.videoId, s.reason, s.match])).toEqual([
      [3, 'Ortak: Duygusal Fantastik Filmler', 91],
      [4, null, null],
    ])
  })

  it('gerekçeli liste boş ya da null ise düz benzerlere düşer', () => {
    const insights = { __typename: 'Movie' as const, videoId: 80010001, similarsWithReason: null }
    expect(similarsOf(80010001, plain, insights)).toHaveLength(2)
  })
})

describe('erişim bildirimi, hakkında, lisans', () => {
  it('oynatılabilirse bildirim yok; paket ve pencere durumlarında sunucunun metni ve çağrısı', () => {
    expect(accessNoticeOf(PLAYABLE)).toBeNull()
    expect(
      accessNoticeOf({
        state: 'UPSELL',
        reasonText: 'Sinema Paketi ile izlenir',
        requiredProduct: 'sinema-paketi',
        cta: 'Paketi incele',
      }),
    ).toEqual({ state: 'UPSELL', text: 'Sinema Paketi ile izlenir', cta: 'Paketi incele', kind: 'upsell' })
    expect(accessNoticeOf({ state: 'OUT_OF_WINDOW', reasonText: null, requiredProduct: null })).toMatchObject({
      text: 'Bu içeriğin yayın süresi doldu',
      kind: 'unavailable',
    })
  })

  it('hakkında satırları: kişiler, türler, görünen mikro türler (/tur/<mg>), etiketler, koleksiyonlar', () => {
    const rows = aboutOf(
      movie(),
      [
        { id: 'mg_1', name: "2010'lardan Animasyon Filmleri", layer: 'VISIBLE' },
        { id: 'mg_2', name: 'Gizli', layer: 'HIDDEN' },
      ],
      { person: (id) => `/kisi/${id}`, genre: (id) => `/tur/${id}`, collection: (id) => `/koleksiyon/${id}` },
    )
    expect(rows.map((r) => r.label)).toEqual([
      'Yönetmen',
      'Oyuncular',
      'Türler',
      'Kategoriler',
      'Bu içerik',
      'Koleksiyonlar',
    ])
    expect(rows[3]!.items).toEqual([{ text: "2010'lardan Animasyon Filmleri", to: '/tur/mg_1' }])
  })

  it('lisans ve kaynak satırı', () => {
    expect(attributionOf(movie({ sourceKinds: ['OWN_CDN'], playbackBadges: ['SOURCE_YOUTUBE'] }))).toEqual({
      license: 'CC BY 3.0 · © Blender Foundation',
      url: 'https://durian.blender.org/',
      sources: ["TV+ CDN'i", 'YouTube'],
    })
  })
})

describe('invalidationPaths', () => {
  it('lolomo, bağlamı eşleşen listeler ve videonun kişisel yaprakları', () => {
    const graph = {
      lists: {
        L1: { summary: { $type: 'atom', value: { context: 'queue' } } },
        L2: { summary: { $type: 'atom', value: { context: 'trending' } } },
      },
    }
    expect(invalidationPaths(graph as never, 'g1', ['queue'], [5, 5])).toEqual([
      ['lolomos', 'g1'],
      ['lists', 'L1'],
      ['videos', 5, ['queue', 'bookmark', 'watchStatus', 'userRating', 'current']],
    ])
  })
})
