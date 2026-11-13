/**
 * Arama testlerinin ortak örnek verisi (satır içi; içerik klasörüne ve katalog servisine bağlı değil).
 */
import { zChannel, zCollection, zTitle, type ContentChannel, type ContentTitle } from '../../shared/content-schema'
import { norm, stableId } from '../../shared/text'
import type { AiringRecord } from '../src/kernel/services'
import type { SearchPageCapabilitiesInput } from '../src/services/search/types'

/* ───────────── Örnek veri ───────────── */

export const NOW = new Date('2026-11-13T12:00:00Z')
const H = 3600_000
export const at = (hours: number) => new Date(NOW.getTime() + hours * H)

const YT = { type: 'YOUTUBE' as const, videoId: 'abcdefghijk' }
const LICENSE = { name: 'Test', attribution: 'Test' }

export type TitleInput = Partial<Omit<ContentTitle, 'availability'>> & {
  videoId: number
  title: string
  availability?: { addedAt: string; requiredProduct?: 'sinema-paketi' | null }
}
export function title(t: TitleInput): ContentTitle {
  const type = t.type ?? 'MOVIE'
  return zTitle.parse({
    slug: `t-${t.videoId}`,
    type,
    year: 2020,
    synopsis: 'Örnek özet metni, yeterince uzun bir cümle.',
    shortSynopsis: 'Kısa özet.',
    genres: ['dram'],
    maturity: { rating: '13+' },
    license: LICENSE,
    sources: type === 'MOVIE' ? [YT] : [],
    seasons:
      type === 'SHOW'
        ? [
            {
              number: 1,
              episodes: [{ videoId: t.videoId + 100, number: 1, title: 'Bölüm 1', synopsis: 'Bölüm', sources: [YT] }],
            },
          ]
        : [],
    ...t,
  })
}

export const TITLES: ContentTitle[] = [
  title({
    videoId: 80030001,
    title: 'Şahsiyet',
    type: 'SHOW',
    year: 2018,
    genres: ['suc', 'dram', 'yerli'],
    cast: ['Haluk Bilginer'],
    keywords: ['alzheimer', 'seri katil'],
    popularity: 90,
    availability: { addedAt: '2026-01-10' },
  }),
  title({
    videoId: 80030002,
    title: 'MasterChef Türkiye',
    type: 'SHOW',
    year: 2022,
    genres: ['yasam'],
    keywords: ['yemek', 'yarışma'],
    popularity: 80,
    availability: { addedAt: '2026-03-01' },
  }),
  title({ videoId: 80030003, title: 'Sahil', year: 2015, popularity: 40, availability: { addedAt: '2026-02-01' } }),
  title({
    videoId: 80030004,
    title: 'Kurtlar Vadisi',
    type: 'SHOW',
    year: 2003,
    genres: ['aksiyon', 'yerli'],
    cast: ['Necati Şaşmaz'],
    popularity: 70,
  }),
  title({
    videoId: 80030005,
    title: 'Bir Başkadır',
    type: 'SHOW',
    year: 2020,
    genres: ['dram', 'yerli'],
    keywords: ['istanbul'],
    popularity: 85,
  }),
  title({
    videoId: 80010001,
    title: 'Sintel',
    year: 2010,
    genres: ['animasyon', 'fantastik'],
    directors: ['Colin Levy'],
    popularity: 60,
    availability: { addedAt: '2026-01-01', requiredProduct: 'sinema-paketi' },
  }),
  title({
    videoId: 80030007,
    title: 'Pepee',
    type: 'SHOW',
    year: 2010,
    genres: ['cocuk-aile'],
    kids: true,
    maturity: { rating: 'GENEL', reasons: [] },
    popularity: 30,
  }),
  title({
    videoId: 80030008,
    title: 'Kara Sevda',
    type: 'SHOW',
    year: 2015,
    genres: ['romantik', 'dram'],
    popularity: 75,
  }),
]

const ch = (c: Partial<ContentChannel> & { channelId: number; name: string; number: number }): ContentChannel =>
  zChannel.parse({ slug: `k-${c.channelId}`, category: 'ulusal', description: 'Kanal', source: YT, ...c })

export const CHANNELS: ContentChannel[] = [
  ch({ channelId: 1, name: 'Kanal D', number: 5, favorite: true }),
  ch({ channelId: 2, name: 'TRT 1', number: 1 }),
  ch({ channelId: 3, name: 'TRT Çocuk', number: 7, category: 'cocuk', kids: true }),
  ch({ channelId: 4, name: 'Haber Global', number: 20, category: 'haber' }),
]

const airing = (
  id: string,
  channelId: number,
  t: string,
  start: number,
  end: number,
  videoId: number | null = null,
): AiringRecord => ({
  airingId: id,
  channelId,
  title: t,
  synopsis: '',
  kind: 'dizi',
  startAt: at(start),
  endAt: at(end),
  videoId,
  isSample: true,
})

export const AIRINGS: AiringRecord[] = [
  airing('a1', 1, 'Arka Sokaklar', -1, 1), // şu an canlı
  airing('a2', 1, 'Arka Sokaklar', 22, 23), // yarın tekrar (aynı başlık → tekilleşir)
  airing('a3', 2, 'MasterChef Türkiye', 6, 8, 80030002), // yaklaşan
  airing('a4', 3, 'Pepee', -0.5, 0.5, 80030007), // çocuk kanalında canlı
  airing('a5', 4, 'Ana Haber', -3, -2), // bitmiş
  airing('a6', 4, 'Gece Haberleri', 30, 31), // 24 saatten sonra
]

export function peopleOf(titles: ContentTitle[]) {
  const map = new Map<number, { personId: number; name: string; videoIds: number[] }>()
  for (const t of titles) {
    for (const name of [...t.cast, ...t.directors, ...t.creators]) {
      const personId = stableId(norm(name))
      const p = map.get(personId) ?? { personId, name, videoIds: [] }
      p.videoIds.push(t.videoId)
      map.set(personId, p)
    }
  }
  return [...map.values()]
}

export const COLLECTIONS = [
  zCollection.parse({
    collectionId: 9001,
    slug: 'yerli-seckisi',
    name: 'Yerli Diziler Seçkisi',
    description: 'Seçme yerli diziler',
    videoIds: [80030001, 80030005, 80030008],
  }),
]

/* ───────────── Yetenek bildirimleri ───────────── */

export const kinds = (...k: string[]) => ({ canHandleEntityKinds: k })
export const FULL_CAPS: SearchPageCapabilitiesInput = {
  capabilitiesBySection: {
    searchLive: {
      capabilitiesBySectionTreatment: {
        standard: {
          capabilitiesByEntityTreatment: {
            standardChannelTile: kinds('CHANNEL'),
            standardAiringRow: kinds('PROGRAM_AIRING'),
          },
        },
      },
    },
    searchList: {
      capabilitiesBySectionTreatment: {
        standard: {
          capabilitiesByEntityTreatment: {
            standardDestination: kinds('GENERIC_CONTAINER'),
            standardPersonChip: kinds('PERSON'),
            standardSuggestion: kinds('VIDEO'),
          },
        },
      },
    },
    searchGallery: {
      capabilitiesBySectionTreatment: {
        standard: { capabilitiesByEntityTreatment: { standardBoxshot: kinds('VIDEO') } },
      },
    },
  },
}
export const OLD_CAPS: SearchPageCapabilitiesInput = {
  capabilitiesBySection: {
    searchGallery: {
      capabilitiesBySectionTreatment: {
        standard: { capabilitiesByEntityTreatment: { standardBoxshot: kinds('VIDEO') } },
      },
    },
  },
}
export const NO_LIVE_CAPS: SearchPageCapabilitiesInput = {
  capabilitiesBySection: {
    searchList: FULL_CAPS.capabilitiesBySection?.searchList,
    searchGallery: FULL_CAPS.capabilitiesBySection?.searchGallery,
  },
}
