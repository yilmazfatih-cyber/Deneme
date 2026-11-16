/**
 * Gizli sınav testi (uygulama-gece-yarisi): "bugün" cihazın YEREL gününe göre hesaplanmalı.
 * Puanlama bu dosyayı iki saat diliminde koşar: TZ=Europe/Istanbul ve TZ=America/New_York.
 */
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { ClockProvider, useToday } from '../src/lib/clock.tsx'
import { formatDay, toIsoDate } from '../src/lib/date.ts'

describe('gizli: yerel gün', () => {
  it('gece yarısından hemen sonra ve hemen önce yerel gün', () => {
    expect(toIsoDate(new Date(2026, 10, 16, 0, 30))).toBe('2026-11-16')
    expect(toIsoDate(new Date(2026, 10, 16, 2, 59))).toBe('2026-11-16')
    expect(toIsoDate(new Date(2026, 10, 16, 21, 30))).toBe('2026-11-16')
    expect(toIsoDate(new Date(2026, 10, 16, 23, 59))).toBe('2026-11-16')
    expect(toIsoDate(new Date(2027, 0, 1, 0, 5))).toBe('2027-01-01')
    expect(toIsoDate(new Date(2026, 11, 31, 23, 55))).toBe('2026-12-31')
  })

  it('useToday gece 00.30da bugünü verir; bugünün görevi "Bugün" görünür', () => {
    const clock = { now: () => new Date(2026, 10, 16, 0, 30) }
    const wrapper = ({ children }: { children: ReactNode }) => <ClockProvider clock={clock}>{children}</ClockProvider>
    const { result } = renderHook(() => useToday(), { wrapper })
    expect(result.current).toBe('2026-11-16')
    expect(formatDay('2026-11-16', result.current)).toBe('Bugün')
    expect(formatDay('2026-11-17', result.current)).toBe('Yarın')
  })
})
