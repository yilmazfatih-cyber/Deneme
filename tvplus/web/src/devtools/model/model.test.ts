import { describe, expect, it } from 'vitest'
import type { DevCategory, DevEvent } from '../../lib/devbus'
import { averageMs, formatFalcorPath, initialApi, reduceApi } from './api'
import { splitEsn } from './esn'
import { FEED_MAX, filterFeed, initialFeed, reduceFeed } from './feed'
import { fmtBytes, fmtCountdown, fmtKbps, fmtMs } from './format'
import { initialModel, reduceModel } from './index'
import { initialTelemetry, parseRateLimit, reduceTelemetry, sortedTally } from './telemetry'

let seq = 0
function ev(
  cat: DevCategory,
  label: string,
  detail?: Record<string, unknown>,
  opts: { ms?: number; ok?: boolean } = {},
): DevEvent {
  return { id: ++seq, at: 1_760_000_000_000 + seq, cat, label, ok: opts.ok ?? true, ms: opts.ms, detail }
}

describe('API modeli', () => {
  it('GraphQL ve Falcor sayaçları, önbellek isabeti ortalamaya girmez', () => {
    const events = [
      ev(
        'graphql',
        'DetailModal',
        { id: 'c68d01c6-a564', version: 102, variables: { videoId: 1 }, traceId: 't1', bytes: 2048, status: 200 },
        { ms: 100 },
      ),
      ev(
        'graphql',
        'MiniModalQuery',
        {
          id: 'x',
          version: 102,
          status: 400,
          errors: [{ message: 'yok', extensions: { code: 'PERSISTED_QUERY_NOT_FOUND' } }],
        },
        { ms: 50, ok: false },
      ),
      ev(
        'falcor',
        '3 yol',
        { paths: [['lolomo', 0, { from: 0, to: 9 }, 'title']], fromCache: false, traceId: 't2' },
        { ms: 80 },
      ),
      ev('falcor', '1 yol', { paths: [['videos', 1, 'title']], fromCache: true }, { ms: 1 }),
      ev('falcor', '1 yol', { paths: [], fromCache: false, missing: [['a'], ['b']] }, { ms: 40 }),
      ev('rest', 'GET /x'),
    ]
    let s = initialApi()
    for (const e of events) s = reduceApi(s, e)
    expect(s.graphql.map((c) => c.op)).toEqual(['MiniModalQuery', 'DetailModal']) // en yeni başta
    expect(s.graphql[0]?.error).toBe('PERSISTED_QUERY_NOT_FOUND')
    expect(s.gqlStats).toMatchObject({ count: 2, errors: 1 })
    expect(averageMs(s.gqlStats)).toBe(75)
    expect(s.falcorStats).toMatchObject({ count: 3, cacheHits: 1, network: 2 })
    expect(averageMs(s.falcorStats)).toBe(60)
    expect(s.falcor[0]?.missing).toBe(2)
    expect(s.falcor[1]?.fromCache).toBe(true)
  })

  it('Falcor yollarını okunur biçimde yazar', () => {
    expect(formatFalcorPath(['lolomo', 0, { from: 0, to: 9 }, 'title'])).toBe('lolomo[0][0..9].title')
    expect(formatFalcorPath(['videos', [80010001, 80010002], ['title', 'boxart']])).toBe(
      'videos[80010001,80010002]["title","boxart"]',
    )
    expect(formatFalcorPath(['lolomos', 'GUID-1', 'summary'])).toBe('lolomos["GUID-1"].summary')
    expect(formatFalcorPath(['lists', 'L1', { from: 2, length: 3 }])).toBe('lists.L1[2..4]')
  })
})

describe('olay günlüğü modeli', () => {
  it('paketleri ve olay adlarını sayar, hız sınırını okur', () => {
    let s = initialTelemetry()
    s = reduceTelemetry(
      s,
      ev(
        'event-log',
        '3 olay',
        { names: ['navigate', 'impression', 'impression'], status: 202, rate: '~0=true~RL=2212' },
        { ms: 30 },
      ),
    )
    s = reduceTelemetry(s, ev('event-log', '2 olay gönderilemedi', { error: 'TypeError: ağ' }, { ok: false }))
    s = reduceTelemetry(s, ev('event-log', '1 olay (beacon)', { names: ['playback.end'] }))
    s = reduceTelemetry(s, ev('graphql', 'X'))
    expect(s.batchesSent).toBe(2)
    expect(s.eventsSent).toBe(4)
    expect(s.failed).toBe(1)
    expect(s.lastRemaining).toBe(2212)
    expect(s.batches[0]?.beacon).toBe(true)
    expect(s.batches[1]?.count).toBe(2)
    expect(sortedTally(s.tally)).toEqual([
      ['impression', 2],
      ['navigate', 1],
      ['playback.end', 1],
    ])
    expect(parseRateLimit('~0=true~RL=17')).toBe(17)
    expect(parseRateLimit(null)).toBeNull()
  })
})

describe('ESN ayrıştırıcı', () => {
  it('parçalara böler', () => {
    const parts = splitEsn('TVPWCH-MC-8F3K2Q9ZLM')
    expect(parts?.map((p) => p.code)).toEqual(['TVP', 'W', 'CH', 'MC', '8F3K2Q9ZLM'])
    expect(parts?.map((p) => p.meaning).slice(0, 4)).toEqual(['TV+', 'web', 'Chrome', 'macOS'])
    expect(splitEsn('TVPWFF-LX-AB-CD')?.[4]?.code).toBe('AB-CD')
    expect(splitEsn('NFCDCH-MC-MU713AQA0KQ6')?.[0]?.meaning).toBe('Netflix')
  })
  it('tanımadığı biçimde null döner', () => {
    expect(splitEsn('bozuk')).toBeNull()
    expect(splitEsn('')).toBeNull()
    expect(splitEsn(null)).toBeNull()
  })
})

describe('akış ve birleşik model', () => {
  it('en yeni başta, 300 satırla sınırlı; süzgeç', () => {
    const many = Array.from({ length: 320 }, (_, i) => ev(i % 2 ? 'range' : 'graphql', `e${i}`))
    const s = reduceFeed(initialFeed(), many)
    expect(s.rows).toHaveLength(FEED_MAX)
    expect(s.rows[0]?.label).toBe('e319')
    expect(s.byCat.range).toBe(160)
    expect(filterFeed(s.rows, new Set(['graphql'])).every((r) => r.cat === 'graphql')).toBe(true)
  })

  it('temizlenen akış eski olayları göstermez ama diğer sekmeler etkilenmez; son iz kimliği', () => {
    const a = ev('graphql', 'A', { traceId: 'aaa' })
    const b = ev('graphql', 'B', { traceId: 'bbb' })
    const m = reduceModel(initialModel(), [a, b], a.id)
    expect(m.feed.rows.map((r) => r.label)).toEqual(['B'])
    expect(m.api.graphql).toHaveLength(2)
    expect(m.lastTraceId).toBe('bbb')
    expect(m.total).toBe(2)
  })
})

describe('biçimler', () => {
  it('Türkçe sayılar ve geri sayım', () => {
    expect(fmtMs(84.4)).toBe('84 ms')
    expect(fmtMs(1250)).toBe('1,3 sn')
    expect(fmtBytes(229 * 1024)).toBe('229 KB')
    expect(fmtBytes(1.5 * 1024 * 1024)).toBe('1,5 MB')
    expect(fmtKbps(1127)).toBe('1.127 kbps')
    expect(fmtKbps(21_800)).toBe('21,8 Mbps')
    expect(fmtCountdown(45_000)).toBe('45 sn')
    expect(fmtCountdown(11 * 60_000 + 4000)).toBe('11 dk 4 sn')
    expect(fmtCountdown(12 * 3600_000 - 60_000)).toBe('11 sa 59 dk')
    expect(fmtCountdown(-1)).toBe('süresi doldu')
  })
})
