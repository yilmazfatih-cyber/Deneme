import { describe, expect, it } from 'vitest'
import { rankingDetail, toSections, type SearchEntityData, type SearchPageData } from './results'

const video = (id: number, extra: Partial<SearchEntityData> = {}): SearchEntityData => ({
  unifiedEntityId: `Video:${id}`,
  kind: 'VIDEO',
  displayString: `V${id}`,
  treatment: 'standardBoxshot',
  predicted: false,
  score: 0.5,
  reason: null,
  explain: [{ name: 'metin', value: 1, weight: 1, contribution: 1 }],
  track: { tctx: `t${id}` },
  contextualArtwork: null,
  video: {
    __typename: 'Movie',
    videoId: id,
    unifiedEntityId: `Video:${id}`,
    title: `Film ${id}`,
    access: { state: 'PLAYABLE', reasonText: null },
    badge: null,
    storyArt: { url: `/s/${id}` },
    boxart: null,
  },
  channel: null,
  ...extra,
})

const page: SearchPageData = {
  searchTerm: 'si',
  requestId: 'req-1',
  trackId: 9,
  isFallback: false,
  modelVersion: 'lr-1 · 3 güncelleme',
  correction: null,
  sections: [
    {
      __typename: 'SearchPredictedSection',
      id: 'tahmin',
      displayString: 'Bunlar ilgini çekebilir',
      entities: [video(3, { predicted: true, reason: 'Sintel ile ilgili' })],
    },
    {
      __typename: 'SearchGallerySection',
      id: 'galeri',
      displayString: 'Film ve Diziler',
      entities: [video(1), video(2)],
    },
  ],
}

describe('arama sonuçları', () => {
  it('modelin sırası korunur, tahmin bölümü kendi başlığıyla sonda; gerekçe yalnız tahmin kartında', () => {
    const s = toSections(page)
    expect(s.map((x) => [x.id, x.predicted])).toEqual([
      ['galeri', false],
      ['tahmin', true],
    ])
    expect(s[0]!.items.map((i) => [i.title, i.position, i.reason])).toEqual([
      ['Film 1', 0, null],
      ['Film 2', 1, null],
    ])
    expect(s[1]!.items[0]).toMatchObject({ title: 'Film 3', position: 2, reason: 'Sintel ile ilgili', tctx: 't3' })
  })

  it('çizilemeyen öğeler atlanır, boş bölüm düşer; kanal canlı kart olur', () => {
    const s = toSections(
      {
        ...page,
        sections: [
          { __typename: 'SearchGallerySection', id: 'g', displayString: 'G', entities: [video(1, { video: null })] },
          {
            __typename: 'SearchLiveSection',
            id: 'canli',
            displayString: 'Şu an canlı',
            entities: [
              video(0, {
                video: null,
                unifiedEntityId: 'Channel:4',
                channel: {
                  channelId: 4,
                  unifiedEntityId: 'Channel:4',
                  name: 'TRT 1',
                  number: 1,
                  logo: null,
                  now: { title: 'Haber', startAt: '2026-01-01T20:00:00Z', endAt: '2026-01-01T21:00:00Z' },
                },
              }),
            ],
          },
        ],
      },
      Date.parse('2026-01-01T20:30:00Z'),
    )
    expect(s).toHaveLength(1)
    expect(s[0]!.items[0]).toMatchObject({
      live: true,
      progress: 0.5,
      target: { kind: 'channel', channelId: 4 },
      position: 1,
    })
  })

  it('sıralama olayı: ilk 5 sonucun puanı ve bileşenleri', () => {
    const d = rankingDetail(page)
    expect(d.term).toBe('si')
    expect(d.modelVersion).toContain('lr-1')
    expect(d.top.map((t) => t.id)).toEqual(['Video:3', 'Video:1', 'Video:2'])
  })
})
