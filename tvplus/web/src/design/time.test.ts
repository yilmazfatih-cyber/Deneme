import { describe, expect, it } from 'vitest'
import { formatClock, formatDayTime, formatLiveLine, formatRemaining, formatTimeRange, liveProgress, weekdayShort } from './time'

// 2026-11-13 Cuma, 20:00 Türkiye saati (UTC+3) = 17:00 UTC
const at = (iso: string) => new Date(iso).getTime()
const NOW = at('2026-11-13T17:00:00Z')

describe('zaman biçimi', () => {
  it('24 saat, Türkiye saati', () => {
    expect(formatClock(at('2026-11-13T17:00:00Z'))).toBe('20:00')
    expect(formatClock(at('2026-11-13T21:05:00Z'))).toBe('00:05')
    expect(formatTimeRange(at('2026-11-13T17:00:00Z'), at('2026-11-13T20:15:00Z'))).toBe('20:00–23:15')
  })

  it('geri sayım yalnız son 60 dakikada', () => {
    expect(formatRemaining(NOW + 42 * 60_000, NOW)).toBe('42 dk kaldı')
    expect(formatRemaining(NOW + 60 * 60_000, NOW)).toBe('60 dk kaldı')
    expect(formatRemaining(NOW + 61 * 60_000, NOW)).toBeNull()
    expect(formatRemaining(NOW - 1, NOW)).toBeNull()
    expect(formatLiveLine(NOW - 3 * 3600_000, NOW + 42 * 60_000, NOW)).toBe('17:00–20:42 · 42 dk kaldı')
    expect(formatLiveLine(NOW, NOW + 2 * 3600_000, NOW)).toBe('20:00–22:00')
  })

  it('göreli gün', () => {
    expect(formatDayTime(at('2026-11-13T19:15:00Z'), NOW)).toBe('Bugün 22:15')
    expect(formatDayTime(at('2026-11-12T17:00:00Z'), NOW)).toBe('Dün 20:00')
    expect(formatDayTime(at('2026-11-14T06:00:00Z'), NOW)).toBe('Yarın 09:00')
    expect(formatDayTime(at('2026-11-15T17:00:00Z'), NOW)).toBe('Paz 20:00')
    expect(formatDayTime(at('2026-11-30T17:00:00Z'), NOW)).toBe('30 Kas 20:00')
    // UTC'de aynı gün, Türkiye'de ertesi gün (00:30)
    expect(formatDayTime(at('2026-11-13T21:30:00Z'), NOW)).toBe('Yarın 00:30')
  })

  it('gün adları ve ilerleme', () => {
    expect(weekdayShort(NOW)).toBe('Cum')
    expect(weekdayShort(at('2026-11-14T12:00:00Z'))).toBe('Cmt')
    expect(liveProgress(NOW - 30 * 60_000, NOW + 30 * 60_000, NOW)).toBeCloseTo(0.5)
    expect(liveProgress(NOW + 1, NOW + 2, NOW)).toBe(0)
  })
})
