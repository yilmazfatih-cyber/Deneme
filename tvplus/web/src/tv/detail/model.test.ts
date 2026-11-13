import { describe, expect, it } from 'vitest'
import {
  castLine,
  detailMeta,
  episodeLabel,
  episodePlay,
  primaryActionOf,
  qualityLabels,
  startEpisodeOf,
  trailerOf,
  type DetailVideoData,
  type EpisodeData,
  type SeasonData,
} from './model'

const base: DetailVideoData = {
  __typename: 'Movie',
  videoId: 80010001,
  unifiedEntityId: 'Video:80010001',
  title: 'Sintel',
  shortSynopsis: 'k',
  displayRuntime: '15 dk',
  latestYear: 2010,
  isPlayable: true,
  top10Rank: null,
  watchStatus: 'NEVER_WATCHED',
  access: { state: 'PLAYABLE', reasonText: null },
  badge: null,
  boxart: null,
  storyArt: null,
  contentAdvisory: { certificationValue: '13+', maturityLevel: 13, boardName: 'RTÜK', reasons: ['Şiddet'] },
  bookmark: null,
  synopsis: 'Uzun',
  contextualSynopsis: 'Uzun',
  runtimeSec: 888,
  isInPlaylist: false,
  thumbRating: 'THUMBS_UNRATED',
  playbackBadges: ['VIDEO_HD', 'AUDIO_FIVE_DOT_ONE', 'TEXT_SUBTITLES'],
  billboard: null,
  genreTags: [],
  textEvidence: [],
  promoVideo: null,
  matchScore: 92,
  cast: [{ personId: 1, name: 'Halina Reijn' }],
}

const ep = (id: number, season: number, extra: Partial<EpisodeData> = {}): EpisodeData => ({
  videoId: id,
  unifiedEntityId: `Video:${id}`,
  title: `B${id}`,
  number: id % 10,
  seasonNumber: season,
  numberLabel: `S${season} B${id % 10}`,
  synopsis: '',
  runtimeSec: 1200,
  displayRuntime: '20 dk',
  isPlayable: true,
  access: { state: 'PLAYABLE', reasonText: null },
  bookmark: null,
  still: null,
  ...extra,
})

describe('birincil eylem', () => {
  it('film: Oynat; yarım kaldıysa Devam Et + Baştan Başlat ve kalan süre', () => {
    expect(primaryActionOf(base)).toMatchObject({ kind: 'play', label: 'Oynat', viewableId: 'Video:80010001', startOver: false })
    const r = primaryActionOf({ ...base, bookmark: { positionSec: 288, runtimeSec: 888, progress: 0.32 } })
    expect(r).toMatchObject({ kind: 'resume', label: 'Devam Et', positionSec: 288, startOver: true, progressLine: '10 dk kaldı' })
    // bitmeye yakın: baştan oynatılır
    expect(primaryActionOf({ ...base, bookmark: { positionSec: 880, runtimeSec: 888, progress: 0.99 } }).kind).toBe('play')
  })

  it('dizi: devam edilecek bölüm oynatılır', () => {
    const show: DetailVideoData = {
      ...base,
      __typename: 'Show',
      videoId: 7,
      watchStatus: 'STARTED',
      currentEpisode: {
        videoId: 73,
        numberLabel: 'S1 B3',
        title: 'Tayfun',
        runtimeSec: 1800,
        bookmark: { positionSec: 600, runtimeSec: 1800, progress: 0.33 },
      },
    }
    expect(primaryActionOf(show)).toMatchObject({
      kind: 'resume',
      label: 'Devam Et',
      viewableId: 'Video:73',
      positionSec: 600,
      progressLine: 'S1:B3 · Tayfun · 20 dk kaldı',
    })
  })

  it('paket gerektiren başlık: Paketi İncele + sunucunun sakin metni; diğer durumlar Benzerlerini Gör', () => {
    expect(
      primaryActionOf({ ...base, access: { state: 'UPSELL', reasonText: 'Sinema Paketi ile izlenir', requiredProductName: 'Sinema' } }),
    ).toMatchObject({ kind: 'upsell', label: 'Paketi İncele', viewableId: null, accessText: 'Sinema Paketi ile izlenir' })
    expect(primaryActionOf({ ...base, access: { state: 'OUT_OF_WINDOW', reasonText: null } })).toMatchObject({
      kind: 'unavailable',
      label: 'Benzerlerini Gör',
      accessText: 'Bu başlık şu an izlenemiyor.',
    })
  })
})

describe('bilgi satırı', () => {
  it('eşleşme, yıl, süre, yaş işareti, kalite, oyuncular', () => {
    expect(detailMeta(base)).toEqual({ match: '%92 Eşleşme', parts: ['2010', '15 dk'], maturity: '13+' })
    expect(detailMeta({ ...base, __typename: 'Show', seasonCount: 2, matchScore: null }).parts).toEqual(['2010', '2 Sezon'])
    expect(qualityLabels(base.playbackBadges)).toEqual(['HD', '5.1', 'Altyazı'])
    expect(qualityLabels(['VIDEO_ULTRA_HD', 'VIDEO_HD'])).toEqual(['4K'])
    expect(castLine(base)).toBe('Oyuncular: Halina Reijn')
    expect(castLine({ ...base, cast: [], directors: [{ personId: 2, name: 'Colin Levy' }] })).toBe('Yönetmen: Colin Levy')
    expect(castLine({ ...base, cast: [] })).toBeNull()
    expect(episodeLabel('S2 B10')).toBe('S2:B10')
  })

  it('fragman: TRAILER, yoksa TEASER, yoksa yok', () => {
    expect(trailerOf(base)).toBeNull()
    expect(
      trailerOf({
        ...base,
        supplementalVideos: [
          { videoId: 5, title: 't', subType: 'TEASER', isPlayable: true },
          { videoId: 6, title: 'f', subType: 'TRAILER', isPlayable: true },
        ],
      }),
    ).toBe('Video:6')
  })
})

describe('bölümler', () => {
  const seasons: SeasonData[] = [
    { seasonId: 's1', number: 1, numberLabel: 'S1', title: null, episodes: [ep(11, 1), ep(12, 1)] },
    { seasonId: 's2', number: 2, numberLabel: 'S2', title: null, episodes: [ep(21, 2), ep(22, 2)] },
  ]

  it('odak devam edilecek bölümde açılır; yoksa ilk bölüm', () => {
    expect(startEpisodeOf(seasons, 22)).toEqual({ seasonIndex: 1, episodeId: 22 })
    expect(startEpisodeOf(seasons, null)).toEqual({ seasonIndex: 0, episodeId: 11 })
    expect(startEpisodeOf(seasons, 999)).toEqual({ seasonIndex: 0, episodeId: 11 })
    expect(startEpisodeOf([], 1)).toEqual({ seasonIndex: 0, episodeId: null })
  })

  it('bölüm oynatma: yarım kaldıysa kaldığı yerden; kilitliyse yok', () => {
    expect(episodePlay(ep(11, 1))).toEqual({ viewableId: 'Video:11', positionSec: null })
    expect(episodePlay(ep(11, 1, { bookmark: { positionSec: 60, runtimeSec: 1200, progress: 0.05 } }))).toEqual({
      viewableId: 'Video:11',
      positionSec: 60,
    })
    expect(episodePlay(ep(11, 1, { access: { state: 'UPSELL', reasonText: 'x' } }))).toBeNull()
  })
})
