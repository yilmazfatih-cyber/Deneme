import { describe, expect, it } from 'vitest'
import { parseTctx } from '../../../../shared/tctx'
import { PreviewCache } from './cache'
import { appPathOfHref, detailPath, localTctx, playPath, withQuery } from './links'
import { badgeTextOf, isInProgress, lockedTextOf, playbackBadgeLabels, remainingText, sourceLabels } from './meta'
import { cachedListIds, invalidationPaths } from './sync'

describe('PreviewCache — satır ön yüklemesi', () => {
  it('ilk önizlemede satırdaki tüm kimlikler tek istekte (fare altındaki başta)', () => {
    const c = new PreviewCache<string>()
    const plan = c.planRow('L', [1, 2, 3, 4], 3, 0)
    expect(plan).toEqual({ hit: false, fetch: [3, 1, 2, 4], waiting: false })
    c.begin(plan.fetch)
    // İstek yoldayken aynı satırda başka karta geçmek yeni istek doğurmaz
    expect(c.planRow('L', [1, 2, 3, 4], 2, 10)).toEqual({ hit: false, fetch: [], waiting: true })
    c.settle(plan.fetch, new Map([[1, 'a'], [2, 'b'], [3, 'c'], [4, 'd']]), 100)
    expect(c.planRow('L', [1, 2, 3, 4], 4, 200)).toEqual({ hit: true, fetch: [], waiting: false })
    expect(c.get(4, 200)).toEqual({ value: 'd', ageMs: 100 })
    expect(c.requestedForRow('L')).toEqual([3, 1, 2, 4])
  })

  it('satıra sonradan yüklenen kartlar bir sonraki ıskada istenir; süresi dolan yeniden', () => {
    const c = new PreviewCache<string>(1000)
    c.settle([1, 2], new Map([[1, 'a'], [2, 'b']]), 0)
    expect(c.planRow('L', [1, 2, 3, 4], 3, 10).fetch).toEqual([3, 4])
    expect(c.planRow('L', [1, 2], 1, 2000).fetch).toEqual([1, 2])
  })

  it('başarısız istek yolda kalmaz; iyimser güncelleme eski değeri döndürür', () => {
    const c = new PreviewCache<{ inList: boolean }>()
    c.begin([7])
    c.settle([7], new Map(), 0)
    expect(c.isInflight(7)).toBe(false)
    expect(c.planRow('L', [7], 7, 1).fetch).toEqual([7])
    c.settle([7], new Map([[7, { inList: false }]]), 1)
    expect(c.update(7, (v) => ({ ...v, inList: true }))).toEqual({ inList: false })
    expect(c.get(7, 2)?.value.inList).toBe(true)
    expect(c.update(99, (v) => v)).toBeNull()
  })
})

describe('bağlantılar ve tctx', () => {
  it('tctx sorgu parametresi olarak kodlanır ve geri çözülür', () => {
    const t = localTctx('tur_783', 4, 80010001)
    expect(parseTctx(t)).toEqual({ row: 0, rank: 4, rowId: 'tur_783', trackId: 0, entityId: 'Video:80010001' })
    const path = detailPath(80010001, t)
    expect(path.startsWith('/detay/80010001?tctx=')).toBe(true)
    expect(new URLSearchParams(path.split('?')[1]).get('tctx')).toBe(t)
    expect(detailPath(5)).toBe('/detay/5')
  })
  it('oynatıcı yolu: Video:<id>, baştan başlat', () => {
    expect(playPath(80047101, 'x')).toBe('/izle/Video:80047101?tctx=x')
    expect(playPath(1, null, { fromStart: true })).toBe('/izle/Video:1?baslat=bastan')
    expect(withQuery('/a', { b: null, c: '' })).toBe('/a')
  })
  it('duyuru adresi', () => {
    expect(appPathOfHref('#/canli')).toBe('/canli')
    expect(appPathOfHref('/kitaplik')).toBe('/kitaplik')
    expect(appPathOfHref('https://ornek.com')).toBeNull()
  })
})

describe('meta yardımcıları', () => {
  it('oynatma rozetleri ve kaynaklar', () => {
    expect(playbackBadgeLabels(['VIDEO_HD', 'VIDEO_ULTRA_HD', 'AUDIO_FIVE_DOT_ONE', 'TEXT_SUBTITLES', 'SOURCE_OWN_CDN'])).toEqual(['4K', '5.1', 'Altyazı'])
    expect(playbackBadgeLabels(['VIDEO_HD', 'TEXT_CLOSED_CAPTIONS'])).toEqual(['HD', 'Altyazı'])
    expect(sourceLabels(['OWN_CDN', 'YOUTUBE'])).toEqual(["Kendi CDN'imiz", 'YouTube'])
    expect(sourceLabels(['SOURCE_PROGRESSIVE', 'VIDEO_HD', 'PROGRESSIVE'])).toEqual(['Tek dosya'])
  })
  it('kalan süre ve yarım kalma', () => {
    expect(remainingText(60, 600)).toBe('9 dk kaldı')
    expect(remainingText(0, 5400)).toBe('1 sa 30 dk kaldı')
    expect(remainingText(0, 3600)).toBe('1 sa kaldı')
    expect(remainingText(600, 600)).toBeNull()
    expect(remainingText(10, null)).toBeNull()
    expect(isInProgress({ positionSec: 10, progress: 0.1 })).toBe(true)
    expect(isInProgress({ positionSec: 0, progress: 0 })).toBe(false)
    expect(isInProgress({ positionSec: 590, progress: 0.98 })).toBe(false)
    expect(isInProgress(null)).toBe(false)
  })
  it('kart başına tek işaret: kilit rozeti bastırır', () => {
    expect(lockedTextOf({ state: 'PLAYABLE', reasonText: null })).toBeNull()
    expect(lockedTextOf({ state: 'UPSELL', reasonText: 'Sinema Paketi ile izlenir' })).toBe('Sinema Paketi ile izlenir')
    expect(lockedTextOf({ state: 'BLOCKED', reasonText: null })).toBe('Paketinde yok')
    expect(badgeTextOf({ kind: 'NEW', text: 'Yeni' }, true)).toBeNull()
    expect(badgeTextOf({ kind: 'LOCKED', text: 'Sinema Paketi' }, false)).toBeNull()
    expect(badgeTextOf({ kind: 'LEAVING_SOON', text: 'Son 3 gün' }, false)).toBe('Son 3 gün')
  })
})

describe('lolomo geçersiz kılma yolları', () => {
  const graph = {
    lists: {
      g_queue: { summary: { $type: 'atom' as const, value: { context: 'queue' } } },
      g_continueWatching: { summary: { $type: 'atom' as const, value: { context: 'continueWatching' } } },
      g_top10: { summary: { $type: 'atom' as const, value: { context: 'top10' } } },
      g_noSummary: {},
    },
  }
  it('yalnız istenen bağlamdaki listeler + lolomo sırası + değişen videonun kişisel yaprakları', () => {
    expect(cachedListIds(graph, ['queue'])).toEqual(['g_queue'])
    expect(invalidationPaths(graph, 'GUID', ['queue'], [80010001, 80010001])).toEqual([
      ['lolomos', 'GUID'],
      ['lists', 'g_queue'],
      ['videos', 80010001, ['queue', 'bookmark', 'watchStatus', 'userRating', 'current']],
    ])
    expect(invalidationPaths({}, null, ['continueWatching'], [])).toEqual([])
  })
})
