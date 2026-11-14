import { describe, expect, it } from 'vitest'
import type { ManagedProfile } from '../../../../shared/devices'
import { CHOOSE_ON_TV, classifyPairError, countdownText, defaultProfile, profileForApprove } from './pairState'

const p = (guid: string, isLocked = false): ManagedProfile => ({
  guid,
  name: guid,
  avatarKey: 'a',
  avatarUrl: '',
  isKids: false,
  isLocked,
  maturityLevel: 100,
})

describe('TV onayı', () => {
  it('hata sınıflaması', () => {
    expect(classifyPairError(Object.assign(new Error('RATE_LIMITED'), { status: 429 }))).toBe('throttled')
    expect(classifyPairError(Object.assign(new Error('CODE_NOT_FOUND'), { status: 404 }))).toBe('notFound')
    expect(classifyPairError(new TypeError('Failed to fetch'))).toBe('offline')
    expect(classifyPairError(new Error('HTTP_500'))).toBe('unknown')
  })
  it('kilitli profil önceden seçilmez', () => {
    expect(defaultProfile([p('a', true), p('b')], 'a')).toBe('b')
    expect(defaultProfile([p('a'), p('b')], 'b')).toBe('b')
    expect(defaultProfile([p('a', true)], 'a')).toBe(CHOOSE_ON_TV)
  })
  it('kilitli profil ya da "TV de seçerim" sunucuya gitmez', () => {
    const list = [p('a', true), p('b')]
    expect(profileForApprove(list, 'a')).toBeUndefined()
    expect(profileForApprove(list, CHOOSE_ON_TV)).toBeUndefined()
    expect(profileForApprove(list, 'b')).toBe('b')
  })
  it('geri sayım', () => {
    const t = Date.parse('2026-11-13T20:00:00Z')
    expect(countdownText(new Date(t + 581_000).toISOString(), t)).toBe('9:41')
    expect(countdownText(new Date(t - 1000).toISOString(), t)).toBe('0:00')
  })
})
