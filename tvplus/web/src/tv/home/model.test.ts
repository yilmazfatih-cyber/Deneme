import { describe, expect, it } from 'vitest'
import {
  airingProgress,
  cardKindOf,
  episodeLabelOf,
  heroOf,
  itemsToLoad,
  mapChannel,
  mapRow,
  planRowItems,
  planRowSummaries,
  remainingText,
  rootPath,
  rowsToLoad,
  windowRange,
  type ListSummary,
  type RowNode,
} from './model'

const summary = (context: string, length = 3, extra: Partial<ListSummary> = {}): ListSummary => ({
  id: `L_${context}`,
  context,
  displayName: `Satır ${context}`,
  length,
  trackId: 42,
  ...extra,
})

describe('cardKindOf', () => {
  it('bağlamı kart biçimine çevirir', () => {
    expect(cardKindOf('billboard')).toBe('skip')
    expect(cardKindOf('top10')).toBe('poster')
    expect(cardKindOf('top10Shows')).toBe('poster')
    expect(cardKindOf('top10Movies')).toBe('poster')
    expect(cardKindOf('continueWatching')).toBe('resume')
    expect(cardKindOf('bridge')).toBe('channel')
    for (const c of ['microgenre', 'tasteCommunity', 'genre', 'curated', 'queue', 'popular', 'becauseYouWatched'])
      expect(cardKindOf(c)).toBe('standard')
    expect(cardKindOf(undefined)).toBe('skip')
  })
})

describe('yol planı', () => {
  it('Ana Sayfa lolomo, kategoriler lolomoByCategory kökünden okunur', () => {
    expect(rootPath('home')).toEqual(['lolomo'])
    expect(rootPath('shows')).toEqual(['lolomoByCategory', 'shows'])
    expect(planRowSummaries('movies', 6)).toEqual([['lolomoByCategory', 'movies', { from: 0, to: 5 }, 'summary']])
    expect(planRowSummaries('home', 0)).toEqual([])
  })

  it('devam et satırı bölüm (current) yapraklarını da ister; köprü satırı Falcor istemez', () => {
    const paths = planRowItems('home', 1, 'resume', 10)
    expect(paths).toHaveLength(3)
    expect(paths[0]).toEqual(['lolomo', 1, { from: 0, to: 9 }, expect.arrayContaining(['bookmark', 'storyArt'])])
    expect(paths[2]).toEqual(['lolomo', 1, { from: 0, to: 9 }, 'current', ['summary', 'displayRuntime', 'bookmark']])
    expect(planRowItems('home', 4, 'channel', 10)).toEqual([])
    expect(planRowItems('home', 2, 'poster', 1)[0]).toEqual(['lolomo', 2, 0, expect.arrayContaining(['boxart'])])
  })

  it('satırlar odak yaklaştıkça 3erli büyür, hiç küçülmez', () => {
    expect(rowsToLoad(0, 0, 20)).toBe(6)
    expect(rowsToLoad(2, 6, 20)).toBe(6)
    expect(rowsToLoad(3, 6, 20)).toBe(9)
    expect(rowsToLoad(6, 9, 20)).toBe(12)
    expect(rowsToLoad(1, 12, 20)).toBe(12)
    expect(rowsToLoad(18, 18, 20)).toBe(20)
    expect(rowsToLoad(0, 0, 4)).toBe(4)
  })

  it('öğeler satırın sonuna yaklaşınca 10ar büyür (yüzlerce öğede de)', () => {
    expect(itemsToLoad(0, 0, 300)).toBe(10)
    expect(itemsToLoad(5, 10, 300)).toBe(10)
    expect(itemsToLoad(6, 10, 300)).toBe(20)
    expect(itemsToLoad(196, 200, 300)).toBe(210)
    expect(itemsToLoad(299, 300, 300)).toBe(300)
    expect(itemsToLoad(0, 0, 4)).toBe(4)
  })
})

describe('pencereleme', () => {
  it('yalnız odak çevresini çizer', () => {
    expect(windowRange(0, 500, 7, 2)).toEqual({ from: 0, to: 9 })
    expect(windowRange(250, 500, 7, 2)).toEqual({ from: 248, to: 259 })
    expect(windowRange(499, 500, 7, 2)).toEqual({ from: 497, to: 500 })
    expect(windowRange(3, 0, 7, 2)).toEqual({ from: 0, to: 0 })
    expect(windowRange(900, 10, 7, 2)).toEqual({ from: 7, to: 10 })
  })
})

describe('mapRow', () => {
  const node = (id: number, extra: Record<string, unknown> = {}) => ({
    summary: { id, type: 'movie', isPlayable: true },
    title: `Başlık ${id}`,
    storyArt: { url: `/s/${id}` },
    boxart: { url: `/b/${id}` },
    ...extra,
  })

  it('vitrin satırı çizilmez', () => {
    expect(mapRow({ summary: summary('billboard', 1), '0': node(1) } as RowNode, 0, 10)).toBeNull()
  })

  it('Top 10: afiş görseli ve sıra; rozet TOP10/kilit değilse', () => {
    const row = mapRow(
      {
        summary: summary('top10Movies', 2),
        '0': node(7, { top10Rank: 1, badge: { kind: 'NEW', text: 'Yeni' } }),
        '1': node(8, { badge: { kind: 'TOP10', text: 'Top 10' } }),
        itemTctx: { '0': 'T0' },
      } as RowNode,
      2,
      10,
    )!
    expect(row.kind).toBe('poster')
    expect(row.items[0]).toMatchObject({ imageUrl: '/b/7', rank: 1, badge: 'Yeni', tctx: 'T0', key: '7' })
    expect(row.items[1]).toMatchObject({ rank: 2, badge: null })
    expect(row.items[1]!.tctx).toBe('2,1,L_top10Movies,42,,,,,,,Video:8,')
  })

  it('devam et: dizide bölüm etiketi, kalan süre ve bölümden oynatma', () => {
    const row = mapRow(
      {
        summary: summary('continueWatching', 2),
        '0': {
          ...node(80047000),
          summary: { id: 80047000, type: 'show', isPlayable: true },
          current: {
            summary: { id: 80047003, type: 'episode', isPlayable: true },
            displayRuntime: 'S1 B3 · 22 dk',
            bookmark: { positionSec: 600, runtimeSec: 1980, progress: 0.3 },
          },
        },
        '1': node(5, { bookmark: { positionSec: 100, runtimeSec: 6000, progress: 0.02 } }),
      } as RowNode,
      1,
      10,
    )!
    expect(row.items[0]).toMatchObject({
      progress: 0.3,
      caption: 'S1:B3 · 23 dk kaldı',
      play: { viewableId: 'Video:80047003', positionSec: 600 },
    })
    expect(row.items[1]).toMatchObject({
      caption: '1 sa 38 dk kaldı',
      play: { viewableId: 'Video:5', positionSec: 100 },
    })
  })

  it('kilitli başlık oynatılmaz, rozet gösterilmez; gelmemiş öğe null; tekrar eden anahtar tekilleşir', () => {
    const row = mapRow(
      {
        summary: summary('genre', 4),
        '0': node(1, {
          access: { state: 'UPSELL', reasonText: 'Sinema Paketi ile' },
          badge: { kind: 'NEW', text: 'Yeni' },
        }),
        '2': node(1),
      } as RowNode,
      3,
      4,
    )!
    expect(row.items).toHaveLength(4)
    expect(row.items[0]).toMatchObject({ locked: true, badge: null, play: null })
    expect(row.items[1]).toBeNull()
    expect(row.items[2]!.key).toBe('1-2')
  })

  it('becauseYouWatched gerekçesi taşınır', () => {
    const row = mapRow(
      { summary: summary('becauseYouWatched', 1, { reason: 'Uzay Belgeselleri' }), '0': node(1) } as RowNode,
      0,
      10,
    )!
    expect(row.reason).toBe('Uzay Belgeselleri')
  })
})

describe('üst alan', () => {
  const card = mapRow(
    {
      summary: summary('microgenre', 1),
      '0': { summary: { id: 9, type: 'show', isPlayable: true }, title: 'Dizi', storyArt: { url: '/s' } },
    } as RowNode,
    0,
    1,
  )!.items[0]!

  it('yapraklar gelmeden kartla, gelince tam bilgiyle', () => {
    expect(heroOf(card, undefined, undefined)).toMatchObject({
      title: 'Dizi',
      eyebrow: 'DİZİ',
      match: null,
      artUrl: '/s',
    })
    const h = heroOf(
      card,
      {
        summary: { id: 9, type: 'show', isPlayable: true },
        releaseYear: 2024,
        seasonCount: 2,
        maturity: { certificationValue: '13+', maturityLevel: 13 },
        tags: ['Sürükleyici', 'Gerilim', 'Uzay', 'Fazla'],
        shortSynopsis: 'Özet',
        billboardArt: { url: '/bb' },
        top10Rank: 3,
        promoVideo: { viewableId: 'Video:1', offset: 30 },
      },
      97,
    )
    expect(h).toMatchObject({
      match: '%97 Eşleşme',
      meta: ['2024', '2 Sezon'],
      maturity: '13+',
      tags: ['Sürükleyici', 'Gerilim', 'Uzay'],
      artUrl: '/bb',
      rankLine: 'Bugün Dizilerde 3 Numara',
      promo: { viewableId: 'Video:1', offset: 30 },
    })
  })
})

describe('yardımcılar', () => {
  it('bölüm etiketi ve kalan süre', () => {
    expect(episodeLabelOf('S2 B10 · 45 dk')).toBe('S2:B10')
    expect(episodeLabelOf('1 sa 28 dk')).toBeNull()
    expect(remainingText(0, 3600)).toBe('1 sa kaldı')
    expect(remainingText(3600, 3600)).toBeNull()
    expect(remainingText(10, null)).toBeNull()
  })

  it('kanal kartı: şimdiki yayının ilerlemesi', () => {
    const start = '2026-01-01T20:00:00Z'
    const end = '2026-01-01T22:00:00Z'
    expect(airingProgress(start, end, Date.parse('2026-01-01T21:00:00Z'))).toBe(0.5)
    expect(airingProgress(end, start, 0)).toBeNull()
    const ch = mapChannel(
      {
        channelId: 3,
        unifiedEntityId: 'Channel:3',
        name: 'TRT 1',
        number: 1,
        now: { title: 'Haber', startAt: start, endAt: end },
      },
      Date.parse('2026-01-01T20:30:00Z'),
    )
    expect(ch).toMatchObject({ key: 'kanal-3', program: 'Haber', progress: 0.25, locked: false })
  })
})
