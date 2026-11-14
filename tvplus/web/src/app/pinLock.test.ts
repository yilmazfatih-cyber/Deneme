import { describe, expect, it } from 'vitest'
import { EMPTY_PIN_STATE, pinLockMessage, pinLockRemainingSec, registerPinFailure } from './pinLock'

describe('PIN deneme sınırı', () => {
  it('5. yanlışta 60 sn kilitlenir', () => {
    let s = EMPTY_PIN_STATE
    for (let i = 0; i < 4; i++) s = registerPinFailure(s, 1000)
    expect(s.failures).toBe(4)
    expect(pinLockRemainingSec(s, 1000)).toBe(0)
    s = registerPinFailure(s, 1000)
    expect(s.failures).toBe(0)
    expect(pinLockRemainingSec(s, 1000)).toBe(60)
    expect(pinLockRemainingSec(s, 31_000)).toBe(30)
    expect(pinLockRemainingSec(s, 61_000)).toBe(0)
  })

  it('ileti', () => {
    expect(pinLockMessage(60)).toBe('Çok fazla deneme. 1 dk sonra tekrar dene.')
    expect(pinLockMessage(12)).toBe('Çok fazla deneme. 12 sn sonra tekrar dene.')
  })
})
