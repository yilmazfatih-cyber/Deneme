import { describe, expect, it } from 'vitest'
import type { SrsState } from '../../src/db'
import { applyOutcome, BOX_INTERVAL_DAYS, canSay, DAY, initialState, intervalFor, isUncued } from '../../src/lib/srs'

const now = Date.UTC(2026, 9, 2, 9)

describe('aralıklı tekrar', () => {
  it('beş kutu: 1, 2, 4, 7, 14 gün', () => {
    expect(BOX_INTERVAL_DAYS).toEqual([1, 2, 4, 7, 14])
    expect(intervalFor(1)).toBe(DAY)
    expect(intervalFor(5)).toBe(14 * DAY)
    expect(intervalFor(9)).toBe(14 * DAY)
  })

  it('ipucusuz başarı bir kutu ilerletir, ipuçlu başarı yerinde tutar, "henüz değil" bir kutu geri alır', () => {
    const s = { ...initialState('su', now), stage: 'surdur' as const, box: 3 }
    expect(applyOutcome(s, { result: 'said', cueLevel: 0 }, now).box).toBe(4)
    expect(applyOutcome(s, { result: 'said', cueLevel: 2 }, now).box).toBe(3)
    expect(applyOutcome(s, { result: 'said_with_help', cueLevel: 1 }, now).box).toBe(3)
    expect(applyOutcome(s, { result: 'not_yet', cueLevel: 6 }, now).box).toBe(2)
    expect(applyOutcome({ ...s, box: 1 }, { result: 'not_yet', cueLevel: 6 }, now).box).toBe(1)
    expect(applyOutcome({ ...s, box: 5 }, { result: 'said', cueLevel: 0 }, now).box).toBe(5)
  })

  it('Tanı → Hatırla: üst üste 2 doğru', () => {
    let s = initialState('su', now)
    s = applyOutcome(s, { result: 'correct', cueLevel: 0 }, now)
    expect(s.stage).toBe('tani')
    s = applyOutcome(s, { result: 'correct', cueLevel: 1 }, now)
    expect(s.stage).toBe('tani')
    expect(s.streak).toBe(0)
    s = applyOutcome(s, { result: 'correct', cueLevel: 0 }, now)
    s = applyOutcome(s, { result: 'correct', cueLevel: 0 }, now)
    expect(s.stage).toBe('hatirla')
  })

  it('Hatırla → Kullan: ipucu ihtiyacı azalınca; Kullan → Sürdür: cümle içinde ipucusuz', () => {
    let s: SrsState = { ...initialState('su', now), stage: 'hatirla' }
    s = applyOutcome(s, { result: 'said', cueLevel: 1 }, now)
    s = applyOutcome(s, { result: 'said', cueLevel: 0 }, now)
    expect(s.stage).toBe('kullan')
    s = applyOutcome(s, { result: 'said', cueLevel: 3 }, now)
    expect(s.stage).toBe('kullan')
    s = applyOutcome(s, { result: 'said', cueLevel: 0 }, now)
    expect(s.stage).toBe('surdur')
    expect(s.maintainSince).toBe(now)
    expect(canSay(s)).toBe(true)
  })

  it('Sürdür: 14 gün sonra hâlâ söylüyorsa kazanılır', () => {
    let s: SrsState = { ...initialState('su', now), stage: 'surdur', box: 4, maintainSince: now }
    s = applyOutcome(s, { result: 'said', cueLevel: 0 }, now + 5 * DAY)
    expect(s.stage).toBe('surdur')
    s = applyOutcome(s, { result: 'said', cueLevel: 0 }, now + 15 * DAY)
    expect(s.stage).toBe('kazanildi')
  })

  it('tekrar tarihi kutuya göre planlanır', () => {
    const s = { ...initialState('su', now), stage: 'surdur' as const, box: 2 }
    expect(applyOutcome(s, { result: 'said', cueLevel: 0 }, now).nextReview).toBe(now + 4 * DAY)
  })

  it('ipucusuz sayılan sonuçlar', () => {
    expect(isUncued({ result: 'said', cueLevel: 0 })).toBe(true)
    expect(isUncued({ result: 'correct', cueLevel: 0 })).toBe(true)
    expect(isUncued({ result: 'said', cueLevel: 1 })).toBe(false)
    expect(isUncued({ result: 'said_with_help', cueLevel: 0 })).toBe(false)
  })
})
