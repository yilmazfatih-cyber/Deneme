import { describe, expect, it } from 'vitest'
import {
  blockAtTime,
  dayLabel,
  dayWindow,
  moveInGrid,
  windowHasAirings,
  groupForList,
  initialScrollLeft,
  layoutBlocks,
  nowPx,
  PX_PER_MIN,
  ticks,
  timeToPx,
  windowWidth,
  zonedTime,
} from './guideMath'

const iso = (s: string) => new Date(s).toISOString()
const NOW = Date.parse('2026-11-13T09:10:00Z') // 12:10 TSİ

describe('Türkiye saati', () => {
  it('duvar saati → an', () => {
    expect(new Date(zonedTime(2026, 11, 13, 6)).toISOString()).toBe('2026-11-13T03:00:00.000Z')
    // gün taşması
    expect(new Date(zonedTime(2026, 11, 13 + 1, 2)).toISOString()).toBe('2026-11-13T23:00:00.000Z')
    expect(new Date(zonedTime(2026, 12, 32, 6)).toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })
})

describe('gün penceresi', () => {
  it('Bugün: 06:00 → ertesi gün 02:00', () => {
    const w = dayWindow(0, NOW)
    expect(new Date(w.from).toISOString()).toBe('2026-11-13T03:00:00.000Z')
    expect(new Date(w.to).toISOString()).toBe('2026-11-13T23:00:00.000Z')
  })
  it('Dün ve Yarın aynı kural', () => {
    expect(new Date(dayWindow(-1, NOW).from).toISOString()).toBe('2026-11-12T03:00:00.000Z')
    expect(new Date(dayWindow(1, NOW).to).toISOString()).toBe('2026-11-14T23:00:00.000Z')
  })
  it('gece 03:20 (TSİ) bugün penceresi şimdiyi kapsayacak kadar genişler', () => {
    const night = Date.parse('2026-11-13T00:20:00Z')
    const w = dayWindow(0, night)
    expect(w.from).toBeLessThanOrEqual(night - 60 * 60_000)
    expect(new Date(w.from).toISOString()).toBe('2026-11-12T23:00:00.000Z') // 02:00 TSİ, 30 dk'ya yuvarlı
    expect(w.to).toBe(zonedTime(2026, 11, 14, 2))
  })
})

describe('zaman → piksel', () => {
  const w = dayWindow(0, NOW)
  it('30 dk = 180 px, pencere 20 saat', () => {
    expect(timeToPx(w.from + 30 * 60_000, w)).toBe(180)
    expect(windowWidth(w)).toBe(20 * 60 * PX_PER_MIN)
  })
  it('çentikler 30 dakikada bir, 24 saat biçimi', () => {
    const t = ticks(w)
    expect(t).toHaveLength(40)
    expect(t[0]).toMatchObject({ label: '06:00', px: 0, major: true })
    expect(t[1]).toMatchObject({ label: '06:30', px: 180, major: false })
    expect(t.at(-1)!.label).toBe('01:30')
  })
  it('şimdi çizgisi ve ilk kaydırma', () => {
    expect(nowPx(NOW, w)).toBe((6 * 60 + 10) * PX_PER_MIN)
    expect(initialScrollLeft(NOW, w)).toBe((6 * 60 + 10 - 30) * PX_PER_MIN)
    expect(nowPx(w.to + 1, w)).toBe(null)
    expect(initialScrollLeft(w.to + 1, w)).toBe(0)
  })
})

describe('blok yerleşimi', () => {
  const w = dayWindow(0, NOW)
  const items = [
    { id: 'gece', startAt: iso('2026-11-13T01:00:00Z'), endAt: iso('2026-11-13T04:00:00Z') }, // 04:00–07:00 TSİ: solda kırpılır
    { id: 'ogle', startAt: iso('2026-11-13T09:00:00Z'), endAt: iso('2026-11-13T10:00:00Z') },
    { id: 'gec', startAt: iso('2026-11-13T22:30:00Z'), endAt: iso('2026-11-14T00:00:00Z') }, // sağda kırpılır
    { id: 'disari', startAt: iso('2026-11-14T00:00:00Z'), endAt: iso('2026-11-14T01:00:00Z') },
  ]
  const b = layoutBlocks(items, w)
  it('pencere dışı atlanır', () => {
    expect(b.map((x) => x.item.id)).toEqual(['gece', 'ogle', 'gec'])
  })
  it('kenarda kırpılır', () => {
    expect(b[0]).toMatchObject({ left: 0, width: 60 * PX_PER_MIN, clippedStart: true, clippedEnd: false })
    expect(b[1]).toMatchObject({
      left: 6 * 60 * PX_PER_MIN,
      width: 60 * PX_PER_MIN,
      clippedStart: false,
      clippedEnd: false,
    })
    expect(b[2]).toMatchObject({ width: 30 * PX_PER_MIN, clippedEnd: true })
  })
})

describe('mobil liste grupları', () => {
  it('Şimdi, Sıradaki, Daha sonra, Daha önce', () => {
    const list = [
      { id: 'a', startAt: iso('2026-11-13T07:00:00Z'), endAt: iso('2026-11-13T08:00:00Z') },
      { id: 'b', startAt: iso('2026-11-13T08:00:00Z'), endAt: iso('2026-11-13T09:00:00Z') },
      { id: 'd', startAt: iso('2026-11-13T10:00:00Z'), endAt: iso('2026-11-13T11:00:00Z') },
      { id: 'c', startAt: iso('2026-11-13T09:00:00Z'), endAt: iso('2026-11-13T10:00:00Z') },
      { id: 'e', startAt: iso('2026-11-13T11:00:00Z'), endAt: iso('2026-11-13T12:00:00Z') },
    ]
    const g = groupForList(list, NOW)
    expect(g.now?.id).toBe('c')
    expect(g.next?.id).toBe('d')
    expect(g.later.map((x) => x.id)).toEqual(['e'])
    expect(g.earlier.map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('gün sekmeleri ve sınırları (Türkiye saati)', () => {
  it('etiketler: Dün, Bugün, Yarın, sonra gün adı', () => {
    expect([-1, 0, 1].map((d) => dayLabel(d as -1 | 0 | 1, NOW))).toEqual(['Dün', 'Bugün', 'Yarın'])
    expect(dayLabel(2, NOW)).toBe('Pazar') // 13 Kasım 2026 Cuma → 15 Kasım Pazar
  })
  it('gün sınırı UTC değil Türkiye gece yarısıdır: 23:30 UTC (02:30 TSİ) ertesi gündür', () => {
    const late = Date.parse('2026-11-13T23:30:00Z') // 14 Kasım 02:30 TSİ
    expect(dayLabel(2, late)).toBe('Pazartesi')
    // "bugün" penceresi 14 Kasım'a aittir ve şimdiyi kapsar
    const w = dayWindow(0, late)
    expect(w.from).toBeLessThanOrEqual(late)
    expect(w.to).toBe(zonedTime(2026, 11, 15, 2))
    expect(new Date(dayWindow(1, late).from).toISOString()).toBe('2026-11-15T03:00:00.000Z')
  })
  it('örnek akışın gittiği son gün', () => {
    const chans = [{ airings: [{ startAt: iso('2026-11-14T05:00:00Z'), endAt: iso('2026-11-14T06:00:00Z') }] }]
    expect(windowHasAirings(chans, dayWindow(1, NOW))).toBe(true)
    expect(windowHasAirings(chans, dayWindow(2, NOW))).toBe(false)
  })
})

describe('klavyeyle gezinme', () => {
  const w = dayWindow(0, NOW)
  const at = (h: number, m = 0) => iso(`2026-11-13T${String(h - 3).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  const rows = [
    [
      { startAt: at(12), endAt: at(13) },
      { startAt: at(13), endAt: at(15) },
      { startAt: at(15), endAt: at(16) },
    ],
    [],
    [
      { startAt: at(11), endAt: at(13, 30) },
      { startAt: at(13, 30), endAt: at(14, 30) },
      { startAt: at(14, 30), endAt: at(17) },
    ],
  ]
  it('←/→ aynı kanalda, kenarda durur', () => {
    expect(moveInGrid(rows, { row: 0, index: 1 }, 'ArrowRight', w)).toEqual({ row: 0, index: 2 })
    expect(moveInGrid(rows, { row: 0, index: 2 }, 'ArrowRight', w)).toEqual({ row: 0, index: 2 })
    expect(moveInGrid(rows, { row: 0, index: 0 }, 'ArrowLeft', w)).toEqual({ row: 0, index: 0 })
    expect(moveInGrid(rows, { row: 0, index: 1 }, 'Home', w)).toEqual({ row: 0, index: 0 })
    expect(moveInGrid(rows, { row: 0, index: 0 }, 'End', w)).toEqual({ row: 0, index: 2 })
  })
  it('↓ boş kanalı atlar ve aynı ana denk gelen programa gider', () => {
    // 13:00–15:00 bloğunun ortası 14:00 → alt kanalda 13:30–14:30
    expect(moveInGrid(rows, { row: 0, index: 1 }, 'ArrowDown', w)).toEqual({ row: 2, index: 1 })
    expect(moveInGrid(rows, { row: 2, index: 2 }, 'ArrowUp', w)).toEqual({ row: 0, index: 2 })
  })
  it('ilk/son kanalda ↑/↓ yerinde kalır; PageDown son dolu kanala gider', () => {
    expect(moveInGrid(rows, { row: 0, index: 0 }, 'ArrowUp', w)).toEqual({ row: 0, index: 0 })
    expect(moveInGrid(rows, { row: 2, index: 0 }, 'ArrowDown', w)).toEqual({ row: 2, index: 0 })
    expect(moveInGrid(rows, { row: 0, index: 0 }, 'PageDown', w)).toEqual({ row: 2, index: 0 })
  })
  it('aralıkta blok yoksa ortası en yakın olan', () => {
    expect(blockAtTime(rows[0]!, Date.parse(at(20)), w)).toBe(2)
    expect(blockAtTime([], Date.parse(at(20)), w)).toBe(-1)
  })
})
