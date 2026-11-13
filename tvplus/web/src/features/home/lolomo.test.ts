import { describe, expect, it } from 'vitest'
import { parseTctx } from '../../../../shared/tctx'
import {
  ImpressionTracker,
  initialItemCount,
  mapCard,
  mapHero,
  mapRow,
  nextItemCount,
  planRowBatch,
  planRowItems,
  POSTER_LEAVES,
  rangeLabel,
  rowBatchOf,
  rowKindOf,
  seeAllPath,
  type ListNode,
  type ListSummary,
} from './lolomo'

const art = (k: string) => ({ url: `/img/${k}.webp`, width: 1, height: 1, key: k })

const summary = (over: Partial<ListSummary> = {}): ListSummary => ({
  id: 'abc_genre_7424',
  context: 'genre',
  displayName: 'Animasyon',
  length: 13,
  trackId: 71486492,
  genreId: 7424,
  ...over,
})

function movie(id: number, over: Record<string, unknown> = {}) {
  return {
    summary: { id, type: 'movie' as const, isPlayable: true, isKids: false, unifiedEntityId: `Video:${id}` },
    title: `Film ${id}`,
    boxart: art(`b${id}`),
    storyArt: art(`s${id}`),
    access: { state: 'PLAYABLE', reasonText: null, requiredProduct: null },
    ...over,
  }
}

describe('rowKindOf', () => {
  it('bağlamları çizim biçimine eşler, bilinmeyeni atlar', () => {
    expect(rowKindOf('billboard')).toBe('hero')
    expect(rowKindOf('continueWatching')).toBe('landscape')
    expect(rowKindOf('bridge')).toBe('bridge')
    for (const c of [
      'top10',
      'queue',
      'becauseYouWatched',
      'gems',
      'newReleases',
      'genre',
      'collection',
      'curated',
      'exclusive',
      'leaving',
    ])
      expect(rowKindOf(c)).toBe('poster')
    expect(rowKindOf('games')).toBeNull()
    expect(rowKindOf(undefined)).toBeNull()
  })
})

describe('yol planlayıcı', () => {
  it('satır grubu: özet + afiş yaprakları + itemTctx tek kümede', () => {
    expect(planRowBatch(6, 8)).toEqual([
      ['lolomo', { from: 6, to: 8 }, 'summary'],
      ['lolomo', { from: 6, to: 8 }, { from: 0, to: 9 }, [...POSTER_LEAVES]],
      ['lolomo', { from: 6, to: 8 }, 'itemTctx', { from: 0, to: 9 }],
    ])
    expect(planRowBatch(3, 3)[0]).toEqual(['lolomo', 3, 'summary'])
    expect(planRowBatch(5, 4)).toEqual([])
  })

  it('grup sınırları satır sayısına kıstırılır', () => {
    expect(rowBatchOf(0, 15)).toEqual({ from: 0, to: 2 })
    expect(rowBatchOf(7, 15)).toEqual({ from: 6, to: 8 })
    expect(rowBatchOf(14, 15)).toEqual({ from: 12, to: 14 })
    expect(rowBatchOf(13, 14)).toEqual({ from: 12, to: 13 })
  })

  it('satır öğeleri lists[listId] üzerinden; yalnız bağlamın gerektirdiği yapraklar', () => {
    const poster = planRowItems('L', 'poster', 10, 19)
    expect(poster).toEqual([
      ['lists', 'L', { from: 10, to: 19 }, [...POSTER_LEAVES]],
      ['lists', 'L', 'itemTctx', { from: 10, to: 19 }],
    ])
    expect(JSON.stringify(poster)).not.toContain('bookmark')
    const cw = planRowItems('C', 'landscape', 0, 9)
    expect(JSON.stringify(cw)).toContain('bookmark')
    expect(cw[2]).toEqual(['lists', 'C', { from: 0, to: 9 }, 'current', ['summary', 'displayRuntime', 'bookmark']])
    const hero = planRowItems('B', 'hero', 0, 0)
    expect(hero[0]![2]).toBe(0)
    expect(JSON.stringify(hero)).toContain('promoVideo')
    expect(JSON.stringify(hero)).toContain('billboardArt')
    expect(planRowItems('X', 'bridge', 0, 9)).toEqual([])
    expect(planRowItems('X', 'poster', 0, -1)).toEqual([])
  })

  it('başlangıç ve sonraki yatay aralıklar', () => {
    expect(initialItemCount('poster', 40)).toBe(10)
    expect(initialItemCount('poster', 4)).toBe(4)
    expect(initialItemCount('hero', 1)).toBe(1)
    expect(initialItemCount('bridge', 0)).toBe(0)
    expect(nextItemCount(10, 40, 5)).toBeNull() // sona uzak
    expect(nextItemCount(10, 40, 7)).toBe(20) // son 3 karta gelindi
    expect(nextItemCount(30, 35, 29)).toBe(35)
    expect(nextItemCount(13, 13, 12)).toBeNull() // hepsi yüklü
    expect(nextItemCount(10, 40, -1)).toBeNull()
  })
})

describe('görünüm modeli', () => {
  it('sunucu tctx varsa onu, yoksa aynı biçimde istemcide kurar', () => {
    const list: ListNode = {
      summary: summary(),
      '0': movie(80010001),
      '1': movie(80010002),
      itemTctx: { '0': '4,0,abc_genre_7424,71486492,,,,,,,Video:80010001,' },
    }
    const a = mapCard(list, summary(), 4, 0)!
    expect(a.tctxFromServer).toBe(true)
    expect(a.detailTo).toBe(`/detay/80010001?tctx=${encodeURIComponent(a.tctx)}`)
    const b = mapCard(list, summary(), 4, 1)!
    expect(b.tctxFromServer).toBe(false)
    expect(parseTctx(b.tctx)).toEqual({
      row: 4,
      rank: 1,
      rowId: 'abc_genre_7424',
      trackId: 71486492,
      entityId: 'Video:80010002',
    })
  })

  it('kilitli öğede rozet yok, tek satır yetki metni var', () => {
    const node = movie(80020003, {
      access: { state: 'UPSELL', reasonText: 'Sinema Paketi ile izlenir', requiredProduct: 'sinema-paketi' },
      badge: { kind: 'LOCKED', text: 'Sinema Paketi' },
    })
    const c = mapCard({ summary: summary(), '0': node }, summary(), 0, 0)!
    expect(c.badge).toBeNull()
    expect(c.lockedText).toBe('Sinema Paketi ile izlenir')
    expect(c.playTo).toBeNull()
  })

  it('yeni rozet kart başına tek; Top 10 sırası', () => {
    const top = summary({ context: 'top10', id: 'abc_top10', genreId: undefined })
    const c = mapCard(
      { summary: top, '0': movie(1, { badge: { kind: 'NEW', text: 'Yeni' }, top10Rank: 3 }) },
      top,
      1,
      0,
    )!
    expect(c.badge).toBe('Yeni')
    expect(c.rank).toBe(3)
    expect(mapCard({ summary: summary(), '0': movie(1, { top10Rank: 3 }) }, summary(), 1, 0)!.rank).toBeNull()
  })

  it('devam et: dizide sıradaki bölüm oynatılır, meta "S1 B3 · 23 dk kaldı"', () => {
    const cw = summary({ context: 'continueWatching', id: 'abc_continueWatching', genreId: undefined })
    const show = movie(80047000, {
      summary: { id: 80047000, type: 'show', isPlayable: true, isKids: false, unifiedEntityId: 'Video:80047000' },
      current: {
        summary: { id: 80047103, type: 'episode', isPlayable: true, isKids: false, unifiedEntityId: 'Video:80047103' },
        displayRuntime: 'S1 B3 · 1 sa 10 dk',
        bookmark: { positionSec: 2820, runtimeSec: 4200, progress: 0.67 },
      },
    })
    const c = mapCard({ summary: cw, '0': show, itemTctx: { '0': 't' } }, cw, 1, 0)!
    expect(c.playVideoId).toBe(80047103)
    expect(c.playTo).toBe('/izle/Video:80047103?tctx=t')
    expect(c.meta).toBe('S1 B3 · 23 dk kaldı')
    expect(c.progress).toBeCloseTo(0.67)
    const m = mapCard(
      { summary: cw, '0': movie(5, { bookmark: { positionSec: 60, runtimeSec: 600, progress: 0.1 } }) },
      cw,
      1,
      0,
    )!
    expect(m.meta).toBe('9 dk kaldı')
  })

  it('satır: henüz gelmemiş öğe null (iskelet), "Tümü" türe/koleksiyona gider', () => {
    const row = mapRow({ summary: summary(), '0': movie(1) }, 3, 10)!
    expect(row.items).toHaveLength(10)
    expect(row.items[0]?.videoId).toBe(1)
    expect(row.items[1]).toBeNull()
    expect(row.seeAllTo).toBe('/tur/7424')
    expect(seeAllPath({ collectionId: 9002 })).toBe('/koleksiyon/9002')
    expect(seeAllPath({})).toBeNull()
    expect(mapRow({ summary: summary({ context: 'mystery' }) }, 0, 10)).toBeNull()
    expect(mapRow({ summary: summary({ length: 4 }) }, 0, 10)!.items).toHaveLength(4)
  })

  it('vitrin: yarım kaldıysa "Devam et", manifest ön hazırlığı oynatılabilir kimlikle', () => {
    const bb = summary({ context: 'billboard', id: 'abc_billboard', length: 1, genreId: undefined })
    const fresh = mapHero(
      {
        summary: bb,
        '0': movie(80010001, {
          billboardArt: art('bb'),
          promoVideo: { viewableId: 'Video:80010001', computeId: 'c', offset: 105, sourceKind: 'OWN_CDN' },
        }),
      },
      0,
    )!
    expect(fresh.primaryLabel).toBe('İzle')
    expect(fresh.artUrl).toBe('/img/bb.webp')
    expect(fresh.promo).toEqual({ viewableId: 'Video:80010001', offset: 105 })
    expect(fresh.prefetchViewableId).toBe('Video:80010001')
    const started = mapHero(
      {
        summary: bb,
        '0': movie(80010001, {
          watchStatus: 'STARTED',
          bookmark: { positionSec: 100, runtimeSec: 888, progress: 0.11 },
        }),
      },
      0,
    )!
    expect(started.primaryLabel).toBe('Devam et')
    const locked = mapHero(
      { summary: bb, '0': movie(9, { access: { state: 'UPSELL', reasonText: 'Paket', requiredProduct: 'p' } }) },
      0,
    )!
    expect(locked.playable).toBe(false)
    expect(locked.promo).toBeNull()
    expect(locked.prefetchViewableId).toBeNull()
  })
})

describe('gösterim izleme', () => {
  it('yalnız yeni görünen sıraları döndürür', () => {
    const t = new ImpressionTracker()
    expect(t.record('L', 0, 5)).toEqual([0, 1, 2, 3, 4, 5])
    expect(t.record('L', 3, 8)).toEqual([6, 7, 8])
    expect(t.record('L', 0, 8)).toEqual([])
    expect(t.record('M', 0, 1)).toEqual([0, 1])
    expect(t.record('L', -1, -1)).toEqual([])
    expect(rangeLabel([6, 7, 8, 10])).toBe('6-8,10')
  })
})
