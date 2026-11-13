import { describe, expect, it } from 'vitest'
import {
  formatClock,
  formatDayTime,
  formatEpisodeCode,
  formatLiveLine,
  formatMinutes,
  formatRemaining,
  formatRuntime,
  formatSeasons,
  formatTimeLeft,
  formatTimeRange,
  joinDot,
  liveProgress,
  minutesLeft,
} from './format'

// Türkiye UTC+3: 17:00Z = 20:00
const at = (iso: string) => new Date(iso)

describe('saat biçimleri (24 saat, Türkiye saati)', () => {
  it('saat ve aralık', () => {
    expect(formatClock(at('2026-11-13T17:00:00Z'))).toBe('20:00')
    expect(formatClock(at('2026-11-13T21:05:00Z'))).toBe('00:05')
    expect(formatTimeRange('2026-11-13T17:00:00Z', '2026-11-13T20:15:00Z')).toBe('20:00–23:15')
  })

  it('kalan süre ve canlı satırı', () => {
    const now = at('2026-11-13T19:33:00Z')
    expect(minutesLeft('2026-11-13T20:15:00Z', now)).toBe(42)
    expect(formatRemaining('2026-11-13T20:15:00Z', now)).toBe('42 dk kaldı')
    expect(formatRemaining('2026-11-13T21:45:00Z', now)).toBe('2 sa 12 dk kaldı')
    expect(formatRemaining('2026-11-13T19:00:00Z', now)).toBeNull()
    expect(formatLiveLine('2026-11-13T17:00:00Z', '2026-11-13T20:15:00Z', now)).toBe('20:00–23:15 · 42 dk kaldı')
    // başlamamış yayın: yalnız aralık
    expect(formatLiveLine('2026-11-13T20:15:00Z', '2026-11-13T21:00:00Z', now)).toBe('23:15–00:00')
  })

  it('ilerleme sınırları', () => {
    expect(liveProgress('2026-11-13T17:00:00Z', '2026-11-13T19:00:00Z', at('2026-11-13T18:00:00Z'))).toBe(0.5)
    expect(liveProgress('2026-11-13T17:00:00Z', '2026-11-13T19:00:00Z', at('2026-11-13T16:00:00Z'))).toBe(0)
    expect(liveProgress('2026-11-13T17:00:00Z', '2026-11-13T19:00:00Z', at('2026-11-13T20:00:00Z'))).toBe(1)
    expect(liveProgress('2026-11-13T17:00:00Z', '2026-11-13T17:00:00Z')).toBe(0)
  })

  it('göreli gün', () => {
    const now = at('2026-11-13T09:00:00Z') // Cuma 12:00
    expect(formatDayTime(at('2026-11-13T19:15:00Z'), now)).toBe('Bugün 22:15')
    expect(formatDayTime(at('2026-11-12T17:00:00Z'), now)).toBe('Dün 20:00')
    expect(formatDayTime(at('2026-11-14T06:00:00Z'), now)).toBe('Yarın 09:00')
    expect(formatDayTime(at('2026-11-15T17:00:00Z'), now)).toBe('Paz 20:00')
    expect(formatDayTime(at('2026-11-30T17:00:00Z'), now)).toBe('30 Kas 20:00')
  })
})

describe('süre biçimleri', () => {
  it('dakika ve çalışma süresi', () => {
    expect(formatMinutes(42)).toBe('42 dk')
    expect(formatMinutes(88)).toBe('1 sa 28 dk')
    expect(formatMinutes(120)).toBe('2 sa')
    expect(formatMinutes(0)).toBe('')
    expect(formatRuntime(5280)).toBe('1 sa 28 dk')
    expect(formatRuntime(null)).toBe('')
    expect(formatTimeLeft(23 * 60 - 10)).toBe('23 dk kaldı')
    expect(formatTimeLeft(0)).toBe('')
  })

  it('bölüm kodu, sezon, noktalı birleştirme', () => {
    expect(formatEpisodeCode(1, 3)).toBe('S1:B3')
    expect(formatSeasons(2)).toBe('2 Sezon')
    expect(formatSeasons(0)).toBe('')
    expect(joinDot([formatEpisodeCode(1, 3), formatTimeLeft(1380)])).toBe('S1:B3 · 23 dk kaldı')
    expect(joinDot(['2024', '', null, 'HD'])).toBe('2024 · HD')
  })
})
