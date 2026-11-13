import { describe, expect, it } from 'vitest'
import {
  catchupMeta,
  liveStatus,
  neighbourChannelIds,
  nextRefetchAt,
  renderableRows,
  rowHasSampleSchedule,
  rowsNeedingRefetch,
  tonightMeta,
} from './liveLogic'
import type { PageRowData, RowItemData } from './types'

const NOW = Date.parse('2026-11-13T09:00:00Z') // 12:00 TSİ
const M = 60_000

function track(rowId: string, pos: number) {
  return { row: 0, pos, rowId, trackId: 1, entityId: `X:${pos}`, tctx: `0,${pos},${rowId},1,,,,,,,X:${pos},` }
}
function channelItem(rowId: string, pos: number, nowEnd: number, sample = false): RowItemData {
  return {
    kind: 'CHANNEL',
    track: track(rowId, pos),
    entity: {
      __typename: 'Channel',
      channelId: pos + 1,
      isSampleSchedule: sample,
      now: { startAt: new Date(nowEnd - 60 * M).toISOString(), endAt: new Date(nowEnd).toISOString() },
      next: { startAt: new Date(nowEnd).toISOString(), endAt: new Date(nowEnd + 60 * M).toISOString() },
    },
  }
}
function row(rowId: string, type: string, items: RowItemData[], ttlSec = 60): PageRowData {
  return { rowId, type, title: rowId, ttlSec, trackId: 1, bridgeTo: null, items }
}

describe('tanınmayanı atlama', () => {
  it('bilinmeyen satır tipi, varlık türü ve __typename sessizce atlanır', () => {
    const rows = renderableRows([
      row('a', 'MATCH_ROW', [channelItem('a', 0, NOW)]),
      row('b', 'CHANNEL_ROW', [
        channelItem('b', 0, NOW),
        { kind: 'SPORT_EVENT', track: track('b', 1), entity: { __typename: 'SportEvent' } },
        { kind: 'CHANNEL', track: track('b', 2), entity: { __typename: 'Hologram' } },
      ]),
      row('c', 'TONIGHT_ROW', [{ kind: 'SPORT_EVENT', track: track('c', 0), entity: { __typename: 'SportEvent' } }]),
      row('d', 'BRIDGE', []),
    ])
    expect(rows.map((r) => r.rowId)).toEqual(['b', 'd'])
    expect(rows[0]!.items).toHaveLength(1)
  })
})

describe('ilerleme ve kalan süre', () => {
  it('istemci saatiyle hesaplanır', () => {
    const s = liveStatus('2026-11-13T08:00:00Z', '2026-11-13T09:30:00Z', NOW)
    expect(s.progress).toBeCloseTo(60 / 90)
    expect(s.remainingMin).toBe(30)
    expect(s.line).toBe('11:00–12:30 · 30 dk kaldı')
    expect(s.ended).toBe(false)
  })
  it('geri sayım yalnız son 60 dakikada', () => {
    expect(liveStatus('2026-11-13T08:00:00Z', '2026-11-13T11:00:00Z', NOW).line).toBe('11:00–14:00')
  })
  it('bitince ilerleme 1, kalan 0', () => {
    const s = liveStatus('2026-11-13T07:00:00Z', '2026-11-13T08:00:00Z', NOW)
    expect(s.progress).toBe(1)
    expect(s.remainingMin).toBe(0)
    expect(s.ended).toBe(true)
  })
})

describe('hangi satır yeniden çekilmeli', () => {
  const fetchedAt = NOW
  const rows = [
    row('kanallar', 'CHANNEL_ROW', [channelItem('kanallar', 0, NOW + 10 * M)], 600),
    row('kopru', 'BRIDGE', [], 3600),
    row('kisa', 'CHANNEL_ROW', [channelItem('kisa', 0, NOW + 90 * M)], 60),
  ]
  it('hiçbir şey olmadıysa boş', () => {
    expect(rowsNeedingRefetch(rows, fetchedAt, NOW + 30_000)).toEqual([])
  })
  it('ttlSec dolan satır', () => {
    expect(rowsNeedingRefetch(rows, fetchedAt, NOW + 61_000)).toEqual(['kisa'])
  })
  it('program sınırı geçen satır', () => {
    const r = rowsNeedingRefetch([rows[0]!], fetchedAt, NOW + 10 * M + 1000)
    expect(r).toEqual(['kanallar'])
  })
  it('bir sonraki yeniden çekme anı: en erken ttl ya da sınır', () => {
    expect(nextRefetchAt(rows, fetchedAt)).toBe(NOW + 60_000)
    expect(nextRefetchAt([rows[0]!], fetchedAt)).toBe(NOW + 10 * M)
    expect(nextRefetchAt([], fetchedAt)).toBe(null)
  })
  it('veri alınmadan önce geçmiş sınır yeniden çekme sebebi değildir', () => {
    const old = row('eski', 'CHANNEL_ROW', [channelItem('eski', 0, NOW - 5 * M)], 600)
    expect(rowsNeedingRefetch([old], fetchedAt, NOW + M)).toEqual([])
  })
})

describe('komşu kanallar ve metinler', () => {
  it('kahramandan sonraki iki kanal, sonda başa döner', () => {
    expect(neighbourChannelIds([1, 20, 21, 22], 1)).toEqual([20, 21])
    expect(neighbourChannelIds([1, 20, 21, 22], 22)).toEqual([1, 20])
    expect(neighbourChannelIds([1, 20], 99)).toEqual([1, 20])
  })
  it('Bu akşam / Kaçırdıkların etiketleri', () => {
    expect(tonightMeta({ startAt: '2026-11-13T18:00:00Z' }, NOW)).toBe('Bugün 21:00')
    expect(
      catchupMeta(
        { startAt: '2026-11-12T17:00:00Z', catchup: { available: true, until: '2026-11-19T18:00:00Z' } },
        NOW,
      ),
    ).toBe('Dün 20:00')
    expect(
      catchupMeta(
        { startAt: '2026-11-07T17:00:00Z', catchup: { available: true, until: '2026-11-13T15:00:00Z' } },
        NOW,
      ),
    ).toBe('Cmt 20:00 · Son 6 saat')
  })
  it('örnek akış notu satır başına bir kez karar verilir', () => {
    expect(
      rowHasSampleSchedule(row('x', 'CHANNEL_ROW', [channelItem('x', 0, NOW), channelItem('x', 1, NOW, true)])),
    ).toBe(true)
    expect(rowHasSampleSchedule(row('x', 'CHANNEL_ROW', [channelItem('x', 0, NOW)]))).toBe(false)
  })
})
