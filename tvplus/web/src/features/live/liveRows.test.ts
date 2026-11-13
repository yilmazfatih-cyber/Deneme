import { describe, expect, it } from 'vitest'
import { placeHoverCard } from './hoverPlacement'
import {
  categoryGroups,
  channelEntries,
  clockOffset,
  currentAiring,
  favoriteEntries,
  featuredEntry,
  previewable,
  rowEntries,
  upcomingAiring,
  upNext,
  type ChannelEntry,
} from './liveRows'
import { renderableRows } from './liveLogic'
import { EMPTY_OVERRIDES, effectiveValue, isPending, overrideReducer, type OverrideState } from './overrides'
import type { AccessData, AiringBriefData, ChannelData, PageRowData } from './types'

const M = 60_000
const NOW = Date.parse('2026-11-13T18:00:00Z') // 21:00 TSİ
const PLAYABLE: AccessData = {
  state: 'PLAYABLE',
  reasonText: null,
  requiredProduct: null,
  requiredProductName: null,
  cta: null,
}

function airing(id: string, startMin: number, endMin: number): AiringBriefData {
  return {
    airingId: id,
    unifiedEntityId: `Airing:${id}`,
    title: id,
    kind: 'haber',
    startAt: new Date(NOW + startMin * M).toISOString(),
    endAt: new Date(NOW + endMin * M).toISOString(),
    liveState: 'LIVE',
    startOver: false,
    catchup: { available: false, until: null },
    access: PLAYABLE,
  }
}

function channel(id: number, over: Partial<ChannelData> = {}): ChannelData {
  return {
    __typename: 'Channel',
    channelId: id,
    unifiedEntityId: `Channel:${id}`,
    name: `Kanal ${id}`,
    number: id,
    category: id === 1 ? 'film-dizi' : 'haber',
    categoryName: id === 1 ? 'Film ve Dizi' : 'Haber',
    isHd: true,
    isFavorite: false,
    isKids: false,
    isSampleSchedule: id !== 1,
    sourceKind: id === 1 ? 'OWN_CDN' : 'YOUTUBE',
    access: PLAYABLE,
    logo: { key: 'k', type: 'CHANNEL_LOGO', url: `/logo/${id}`, width: 128, height: 128 },
    now: airing(`${id}-now`, -30, 30),
    next: airing(`${id}-next`, 30, 90),
    ...over,
  }
}

const track = (rowId: string, pos: number) => ({
  row: 0,
  pos,
  rowId,
  trackId: 7,
  entityId: `Channel:${pos}`,
  tctx: `0,${pos},${rowId}`,
})
function row(rowId: string, type: string, chs: ChannelData[]): PageRowData {
  return {
    rowId,
    type,
    title: rowId,
    ttlSec: 60,
    trackId: 7,
    bridgeTo: null,
    items: chs.map((c, i) => ({
      kind: 'CHANNEL',
      track: track(rowId, i),
      entity: c as unknown as PageRowData['items'][number]['entity'],
    })),
  }
}

describe('şimdi / sonraki (istemci saati)', () => {
  const ch = channel(20)
  it('veri alındığı anda: now yayında, next sırada', () => {
    expect(currentAiring(ch, NOW)?.airingId).toBe('20-now')
    expect(upcomingAiring(ch, NOW)?.airingId).toBe('20-next')
  })
  it('program sınırı geçince sonraki şimdi olur, sıradaki bilinmez (yeniden çekme gelene dek)', () => {
    expect(currentAiring(ch, NOW + 31 * M)?.airingId).toBe('20-next')
    expect(upcomingAiring(ch, NOW + 31 * M)).toBeNull()
  })
  it('her ikisi de bittiyse null', () => {
    expect(currentAiring(ch, NOW + 91 * M)).toBeNull()
  })
  it('yayın başlamadan önce (boşluk): şimdi yok, sıradaki now', () => {
    const gap = channel(21, { now: airing('a', 10, 40), next: airing('b', 40, 80) })
    expect(currentAiring(gap, NOW)).toBeNull()
    expect(upcomingAiring(gap, NOW)?.airingId).toBe('a')
  })
})

describe('satırlar', () => {
  const all = [channel(1, { isFavorite: true }), channel(20, { isFavorite: true }), channel(21), channel(60)]
  const rows = renderableRows([
    row('live-hero', 'LIVE_HERO', [all[2]!]),
    row('live-favorites', 'CHANNEL_ROW', [all[1]!, all[0]!]),
    row('live-all', 'CHANNEL_ROW', all),
  ])
  const entries = channelEntries(rows)

  it('tüm kanallar en kalabalık kanal satırından, numara sırasıyla, tekrarsız', () => {
    expect(entries.map((e) => e.channel.channelId)).toEqual([1, 20, 21, 60])
    expect(entries[0]!.track.rowId).toBe('live-all')
  })
  it('kahraman: sunucunun önerisi, yoksa 1 numara', () => {
    expect(featuredEntry(rows[0], entries)?.channel.channelId).toBe(21)
    expect(featuredEntry(undefined, entries)?.channel.channelId).toBe(1)
    expect(featuredEntry(undefined, [])).toBeNull()
  })
  it('Kanallarım: sunucu sırası, iyimser çıkarma ve ekleme', () => {
    const server: ChannelEntry[] = rowEntries(rows[1])
    expect(server.map((e) => e.channel.channelId)).toEqual([20, 1])
    expect(favoriteEntries(server, entries, (ch) => ch.isFavorite).map((e) => e.channel.channelId)).toEqual([20, 1])
    const fav = (ch: ChannelData) => (ch.channelId === 20 ? false : ch.channelId === 60 ? true : ch.isFavorite)
    expect(favoriteEntries(server, entries, fav).map((e) => e.channel.channelId)).toEqual([1, 60])
  })
  it('kategori satırları ilk görülme sırasıyla', () => {
    expect(categoryGroups(entries).map((g) => [g.name, g.entries.length])).toEqual([
      ['Film ve Dizi', 1],
      ['Haber', 3],
    ])
  })
  it('Az Sonra: başlama sırasıyla, eşitlikte kanal numarası; başlamış olan düşer', () => {
    const list = [
      { channel: channel(30, { next: airing('c', 10, 50) }), track: track('x', 0) },
      { channel: channel(22, { next: airing('d', 30, 60) }), track: track('x', 1) },
      { channel: channel(21, { next: airing('e', 30, 60) }), track: track('x', 2) },
      { channel: channel(23, { now: airing('f', -10, 10), next: null }), track: track('x', 3) },
    ]
    expect(upNext(list, NOW).map((u) => u.airing.airingId)).toEqual(['c', 'e', 'd'])
    expect(upNext(list, NOW, 1)).toHaveLength(1)
  })
})

describe('saat farkı ve önizleme', () => {
  it('2 sn altı gürültü sayılır', () => {
    expect(clockOffset('2026-11-13T18:00:01.000Z', NOW)).toBe(0)
    expect(clockOffset('2026-11-13T18:00:30.000Z', NOW)).toBe(30_000)
    expect(clockOffset('bozuk', NOW)).toBe(0)
  })
  it('yalnız kendi CDN kanalımız ve kilitsizse önizlenir', () => {
    expect(previewable(channel(1))).toBe(true)
    expect(previewable(channel(20))).toBe(false)
    expect(previewable(channel(1, { access: { ...PLAYABLE, state: 'UPSELL' } }))).toBe(false)
  })
})

describe('iyimser durum indirgeyicisi (favori / hatırlatma)', () => {
  const run = (...actions: Parameters<typeof overrideReducer>[1][]): OverrideState =>
    actions.reduce(overrideReducer, EMPTY_OVERRIDES)

  it('istek anında değer değişir, onayla bekleme biter', () => {
    const s1 = run({ type: 'request', key: 'a', value: true })
    expect(effectiveValue(s1, 'a', false)).toBe(true)
    expect(isPending(s1, 'a')).toBe(true)
    const s2 = overrideReducer(s1, { type: 'confirm', key: 'a', value: true })
    expect(effectiveValue(s2, 'a', false)).toBe(true)
    expect(isPending(s2, 'a')).toBe(false)
  })
  it('hata önceki değere döndürür', () => {
    const s = run({ type: 'request', key: 'a', value: true }, { type: 'fail', key: 'a', previous: false })
    expect(effectiveValue(s, 'a', false)).toBe(false)
    expect(isPending(s, 'a')).toBe(false)
  })
  it('hızlı çift dokunuşta son istek kazanır', () => {
    const s = run(
      { type: 'request', key: 'a', value: true },
      { type: 'request', key: 'a', value: false },
      { type: 'confirm', key: 'a', value: true }, // ilk isteğin yanıtı
    )
    expect(effectiveValue(s, 'a', false)).toBe(false)
    expect(isPending(s, 'a')).toBe(true)
    const done = overrideReducer(s, { type: 'confirm', key: 'a', value: false })
    expect(effectiveValue(done, 'a', true)).toBe(false)
    expect(isPending(done, 'a')).toBe(false)
  })
  it('geçersiz kılma yoksa sunucu değeri; sıfırlama hepsini siler', () => {
    expect(effectiveValue(EMPTY_OVERRIDES, 'x', true)).toBe(true)
    const s = run({ type: 'request', key: 'x', value: false }, { type: 'reset' })
    expect(effectiveValue(s, 'x', true)).toBe(true)
  })
})

describe('önizleme kartı yerleşimi', () => {
  const viewport = { width: 1440, height: 900 }
  const anchor = { left: 600, top: 400, width: 230, height: 130 }
  it('ortadaki kart ortadan 1.5× büyür, başlangıç ölçeği kartın kendisi', () => {
    const p = placeHoverCard({ anchor, viewport, bodyHeight: 150, minWidth: 0 })
    expect(p.width).toBe(345)
    expect(p.left).toBe(Math.round(600 + 115 - 172.5))
    expect(p.scale).toBeCloseTo(230 / 345, 3)
    // başlangıç dönüşümü kartı tam altındaki karta oturtur
    const startLeft = p.left + p.originX * (1 - p.scale)
    expect(Math.abs(startLeft - anchor.left)).toBeLessThanOrEqual(1)
  })
  it('kenar kartları içe doğru büyür', () => {
    expect(placeHoverCard({ anchor, viewport, bodyHeight: 150, edge: 'left' }).left).toBe(600)
    const r = placeHoverCard({ anchor, viewport, bodyHeight: 150, edge: 'right', minWidth: 0 })
    expect(r.left + r.width).toBe(830)
  })
  it('görünür alanı aşmaz', () => {
    const low = placeHoverCard({ anchor: { ...anchor, top: 820 }, viewport, bodyHeight: 200 })
    expect(low.top + low.mediaHeight + 200).toBeLessThanOrEqual(892)
    const high = placeHoverCard({ anchor: { ...anchor, top: 0 }, viewport, bodyHeight: 200, topInset: 68 })
    expect(high.top).toBeGreaterThanOrEqual(76)
    const side = placeHoverCard({ anchor: { ...anchor, left: 1380 }, viewport, bodyHeight: 100 })
    expect(side.left + side.width).toBeLessThanOrEqual(1432)
  })
})
