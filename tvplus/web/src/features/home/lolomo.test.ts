import { describe, expect, it } from 'vitest'
import { parseTctx } from '../../../../shared/tctx'
import {
  CARD_LEAVES,
  cardBadgeOf,
  episodeCodeOf,
  genreLinksOf,
  heroDeferredLeaves,
  ImpressionTracker,
  initialItemCount,
  leavesFor,
  lolomoRoot,
  mapCard,
  mapHero,
  mapRow,
  nextItemCount,
  planRowBatch,
  planRowItems,
  rangeLabel,
  rowBatchOf,
  rowKindOf,
  seeAllPath,
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
    tags: ['Karanlık', 'Gerilimli', 'Bilim Kurgu', 'Fazla'],
    ...over,
  }
}

/** Açılış tohumunun (server/src/services/identity/boot.ts) afiş yaprakları: mobilde istek çıkmamalı. */
const BOOT_POSTER_LEAVES = ['summary', 'title', 'boxart', 'badge', 'access', 'top10Rank', 'tags']

describe('bağlam → satır biçimi', () => {
  it('vitrin, devam et, Top 10 (üç bağlam), köprü; diğer her bağlam standart; bağlamsız satır atlanır', () => {
    expect(rowKindOf('billboard')).toBe('hero')
    expect(rowKindOf('continueWatching')).toBe('continue')
    expect(rowKindOf('top10')).toBe('top10')
    expect(rowKindOf('top10Shows')).toBe('top10')
    expect(rowKindOf('top10Movies')).toBe('top10')
    expect(rowKindOf('bridge')).toBe('bridge')
    for (const c of ['queue', 'genre', 'microgenre', 'tasteCommunity', 'popular', 'leaving', 'becauseYouWatched'])
      expect(rowKindOf(c)).toBe('standard')
    expect(rowKindOf('yepyeni')).toBe('standard')
    expect(rowKindOf(undefined)).toBeNull()
    expect(rowKindOf('')).toBeNull()
  })

  it('kart görseli ekrana göre: masaüstü 16:9, mobil afiş; Top 10 her ekranda 16:9 (görsel tam görünsün)', () => {
    expect(leavesFor('standard', 'desktop')).toContain('storyArt')
    expect(leavesFor('standard', 'desktop')).not.toContain('boxart')
    expect(leavesFor('standard', 'mobile')).toContain('boxart')
    expect(leavesFor('top10', 'desktop')).toContain('storyArt')
    expect(leavesFor('top10', 'mobile')).toContain('storyArt')
    expect(leavesFor('top10', 'mobile')).not.toContain('boxart')
    expect(leavesFor('continue', 'desktop')).toEqual(expect.arrayContaining(['storyArt', 'bookmark']))
    expect(leavesFor('continue', 'mobile')).toEqual(expect.arrayContaining(['boxart', 'bookmark']))
    expect(leavesFor('hero', 'mobile')).toEqual(expect.arrayContaining(['boxart', 'tags']))
    expect(leavesFor('hero', 'desktop')).toEqual(expect.arrayContaining(['billboardArt', 'titleLogo', 'promoVideo']))
    // Açılışı bekletmeyen vitrin yaprakları ayrı istenir
    expect(heroDeferredLeaves('desktop')).toEqual(['top10Rank'])
    expect(heroDeferredLeaves('mobile')).toEqual(['queue'])
    expect(leavesFor('hero', 'desktop')).not.toContain('top10Rank')
    expect(leavesFor('bridge', 'desktop')).toEqual([])
  })

  it('mobil standart satır açılış tohumunun yapraklarıyla tamamen karşılanır', () => {
    for (const leaf of leavesFor('standard', 'mobile')) expect(BOOT_POSTER_LEAVES).toContain(leaf)
    for (const leaf of CARD_LEAVES) expect(BOOT_POSTER_LEAVES).toContain(leaf)
  })
})

describe('yol planlayıcı', () => {
  it('kök: ana sayfa `lolomo`, diğerleri lolomoByCategory', () => {
    expect(lolomoRoot('home')).toEqual(['lolomo'])
    expect(lolomoRoot('shows')).toEqual(['lolomoByCategory', 'shows'])
    expect(lolomoRoot('newPopular')).toEqual(['lolomoByCategory', 'newPopular'])
  })

  it('satır grubu: özet + kart yaprakları + itemTctx tek kümede, kök kategoriye göre', () => {
    const paths = planRowBatch(['lolomoByCategory', 'movies'], 3, 5, 'desktop')
    expect(paths).toEqual([
      ['lolomoByCategory', 'movies', { from: 3, to: 5 }, 'summary'],
      ['lolomoByCategory', 'movies', { from: 3, to: 5 }, { from: 0, to: 9 }, leavesFor('standard', 'desktop')],
      ['lolomoByCategory', 'movies', { from: 3, to: 5 }, 'itemTctx', { from: 0, to: 9 }],
    ])
    expect(planRowBatch(['lolomo'], 2, 2, 'mobile')[0]).toEqual(['lolomo', 2, 'summary'])
    expect(planRowBatch(['lolomo'], 3, 2, 'mobile')).toEqual([])
  })

  it('grup sınırları satır sayısına kıstırılır', () => {
    expect(rowBatchOf(0, 14)).toEqual({ from: 0, to: 2 })
    expect(rowBatchOf(4, 14)).toEqual({ from: 3, to: 5 })
    expect(rowBatchOf(13, 14)).toEqual({ from: 12, to: 13 })
  })

  it('satır öğeleri lists[listId] üzerinden; vitrin ve devam et sıradaki bölümü de ister; köprü öğesiz', () => {
    expect(planRowItems('L', 'standard', 'mobile', 0, 9)).toEqual([
      ['lists', 'L', { from: 0, to: 9 }, leavesFor('standard', 'mobile')],
      ['lists', 'L', 'itemTctx', { from: 0, to: 9 }],
    ])
    const cw = planRowItems('C', 'continue', 'desktop', 0, 0)
    expect(cw[0]).toEqual(['lists', 'C', 0, leavesFor('continue', 'desktop')])
    expect(cw[2]).toEqual(['lists', 'C', 0, 'current', ['summary', 'displayRuntime', 'bookmark']])
    expect(planRowItems('B', 'bridge', 'desktop', 0, 9)).toEqual([])
    expect(planRowItems('L', 'standard', 'desktop', 3, 2)).toEqual([])
  })

  it('başlangıç ve sonraki yatay aralıklar', () => {
    expect(initialItemCount('hero', 5)).toBe(1)
    expect(initialItemCount('standard', 40)).toBe(10)
    expect(initialItemCount('top10', 7)).toBe(7)
    expect(initialItemCount('bridge', 0)).toBe(0)
    expect(nextItemCount(10, 40, 5)).toBeNull()
    expect(nextItemCount(10, 40, 7)).toBe(20)
    expect(nextItemCount(30, 34, 29)).toBe(34)
    expect(nextItemCount(34, 34, 33)).toBeNull()
    expect(nextItemCount(10, 40, -1)).toBeNull()
  })
})

describe('görünüm modeli', () => {
  it('sunucu tctx varsa onu, yoksa aynı biçimde istemcide kurar; etiketler en çok üç', () => {
    const s = summary()
    const withServer = mapCard({ summary: s, '0': movie(1), itemTctx: { '0': 'SRV' } }, s, 2, 0)!
    expect(withServer.tctx).toBe('SRV')
    expect(withServer.tctxFromServer).toBe(true)
    expect(withServer.playTo).toBe('/izle/Video:1?tctx=SRV')
    expect(withServer.tags).toEqual(['Karanlık', 'Gerilimli', 'Bilim Kurgu'])
    const local = mapCard({ summary: s, '1': movie(2) }, s, 2, 1)!
    expect(local.tctxFromServer).toBe(false)
    expect(parseTctx(local.tctx)).toMatchObject({ row: 2, rank: 1, rowId: s.id, trackId: s.trackId })
  })

  it('rozet: kart başına bir, kilit bastırır, kısa ve doğru yazımla', () => {
    expect(cardBadgeOf({ kind: 'NEW', text: 'Yeni' }, false)).toEqual({ tone: 'accent', text: 'Yeni' })
    expect(cardBadgeOf({ kind: 'NEW_EPISODE', text: 'Yeni bölüm' }, false)?.text).toBe('Yeni Bölüm')
    expect(cardBadgeOf({ kind: 'LEAVING_SOON', text: 'Son 3 gün' }, false)?.text).toBe('Son 3 Gün')
    expect(cardBadgeOf({ kind: 'NEW', text: 'Yeni' }, true)?.tone).toBe('lock')
    expect(cardBadgeOf({ kind: 'TOP10', text: 'Top 10' }, false)).toBeNull()
    expect(cardBadgeOf(null, false)).toBeNull()
    const s = summary()
    const locked = mapCard(
      {
        summary: s,
        '0': movie(3, {
          access: { state: 'UPSELL', reasonText: 'Sinema Paketi ile', requiredProduct: 'p' },
          badge: { kind: 'NEW', text: 'Yeni' },
        }),
      },
      s,
      0,
      0,
    )!
    expect(locked.badge?.tone).toBe('lock')
    expect(locked.lockedText).toBe('Sinema Paketi ile')
    expect(locked.playTo).toBeNull()
  })

  it('Top 10: rakam satırdaki sıradır, rozet yok', () => {
    const s = summary({ context: 'top10Shows', id: 'abc_top10', genreId: undefined })
    const c = mapCard({ summary: s, '4': movie(9, { top10Rank: 1, badge: { kind: 'NEW', text: 'Yeni' } }) }, s, 1, 4)!
    expect(c.rank).toBe(5)
    expect(c.badge).toBeNull()
    expect(mapCard({ summary: summary(), '0': movie(9) }, summary(), 1, 0)!.rank).toBeNull()
    const nr = summary({ context: 'newReleases', genreId: undefined })
    expect(
      mapCard({ summary: nr, '0': movie(9, { badge: { kind: 'NEW', text: 'Yeni' } }) }, nr, 1, 0)!.badge,
    ).toBeNull()
  })

  it('devam et: dizide sıradaki bölüm oynatılır, altyazı "S1:B3 · 23 dk kaldı"', () => {
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
    expect(c.caption).toBe('S1:B3 · 23 dk kaldı')
    expect(c.progress).toBeCloseTo(0.67)
    const m = mapCard(
      { summary: cw, '0': movie(5, { bookmark: { positionSec: 60, runtimeSec: 600, progress: 0.1 } }) },
      cw,
      1,
      0,
    )!
    expect(m.caption).toBe('9 dk kaldı')
    // Başka satırlarda ilerleme ve altyazı yok
    const g = mapCard(
      { summary: summary(), '0': movie(5, { bookmark: { positionSec: 60, runtimeSec: 600, progress: 0.1 } }) },
      summary(),
      1,
      0,
    )!
    expect(g.progress).toBeNull()
    expect(g.caption).toBeNull()
    expect(episodeCodeOf('S2 B10 · 45 dk')).toBe('S2:B10')
    expect(episodeCodeOf('1 sa 28 dk')).toBeNull()
  })

  it('satır: henüz gelmemiş öğe null (iskelet); "Tümünü Gör" hedefleri', () => {
    const row = mapRow({ summary: summary(), '0': movie(1) }, 3, 10)!
    expect(row.kind).toBe('standard')
    expect(row.items).toHaveLength(10)
    expect(row.items[0]?.videoId).toBe(1)
    expect(row.items[1]).toBeNull()
    expect(row.seeAllTo).toBe('/tur/7424')
    expect(seeAllPath({ microgenreId: 'mg_3fa92c1b', context: 'microgenre' })).toBe('/tur/mg_3fa92c1b')
    expect(seeAllPath({ collectionId: 9002 })).toBe('/koleksiyon/9002')
    expect(seeAllPath({ context: 'queue' })).toBe('/listem')
    expect(seeAllPath({ context: 'newReleases' })).toBe('/yeni-ve-populer')
    expect(seeAllPath({ context: 'newReleases' }, 'newPopular')).toBeNull()
    expect(seeAllPath({ context: 'top10' })).toBeNull()
    expect(mapRow({ summary: summary({ context: '' }) }, 0, 10)).toBeNull()
    expect(mapRow({ summary: summary({ length: 4 }) }, 0, 10)!.items).toHaveLength(4)
  })

  it('vitrin: "Oynat" / "Devam Et", Top 10 satırı, manifest ön hazırlığı oynatılabilir kimlikle', () => {
    const bb = summary({ context: 'billboard', id: 'abc_billboard', length: 1, genreId: undefined })
    const fresh = mapHero(
      {
        summary: bb,
        '0': movie(80010001, {
          billboardArt: art('bb'),
          titleLogo: art('logo'),
          top10Rank: 3,
          queue: true,
          promoVideo: { viewableId: 'Video:80010001', computeId: 'c', offset: 105, sourceKind: 'OWN_CDN' },
        }),
      },
      0,
    )!
    expect(fresh.primaryLabel).toBe('Oynat')
    expect(fresh.artUrl).toBe('/img/bb.webp')
    expect(fresh.logoUrl).toBe('/img/logo.webp')
    expect(fresh.top10Rank).toBe(3)
    expect(fresh.inMyList).toBe(true)
    expect(fresh.promo).toEqual({ viewableId: 'Video:80010001', offset: 105 })
    expect(fresh.prefetchViewableId).toBe('Video:80010001')
    const started = mapHero(
      {
        summary: bb,
        '0': movie(80010001, { top10Rank: null, bookmark: { positionSec: 100, runtimeSec: 888, progress: 0.11 } }),
      },
      0,
    )!
    expect(started.primaryLabel).toBe('Devam Et')
    expect(started.top10Rank).toBeNull()
    const locked = mapHero(
      { summary: bb, '0': movie(9, { access: { state: 'UPSELL', reasonText: 'Paket', requiredProduct: 'p' } }) },
      0,
    )!
    expect(locked.playable).toBe(false)
    expect(locked.promo).toBeNull()
    expect(locked.prefetchViewableId).toBeNull()
  })

  it('Türler listesi: yalnız tür satırları, sıra korunur, tekrarsız', () => {
    expect(
      genreLinksOf([
        summary({ context: 'billboard', genreId: undefined }),
        summary({ genreId: 1, displayName: 'Dram' }),
        summary({ context: 'microgenre', genreId: undefined, microgenreId: 'mg_1' }),
        summary({ genreId: 2, displayName: 'Aksiyon' }),
        summary({ genreId: 1, displayName: 'Dram' }),
        undefined,
      ]),
    ).toEqual([
      { to: '/tur/1', name: 'Dram' },
      { to: '/tur/2', name: 'Aksiyon' },
    ])
  })
})

describe('gösterim izleme', () => {
  it('yalnız yeni görünen sıraları döndürür', () => {
    const t = new ImpressionTracker()
    expect(t.record('L', 0, 5)).toEqual([0, 1, 2, 3, 4, 5])
    expect(t.record('L', 4, 8)).toEqual([6, 7, 8])
    expect(t.record('M', 0, 1)).toEqual([0, 1])
    expect(t.record('L', 3, 2)).toEqual([])
    expect(rangeLabel([5, 0, 1, 2, 8, 9])).toBe('0-2,5,8-9')
  })
})
