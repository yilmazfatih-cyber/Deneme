import { describe, expect, it } from 'vitest'
import { markKeepScroll, shouldKeepScroll, unmarkKeepScroll } from './scrollPolicy'

describe('kaydırma politikası', () => {
  it('kayıt sayılır; son kayıt silinince yol yeniden en üste kaydırılır', () => {
    expect(shouldKeepScroll('/rehber')).toBe(false)
    markKeepScroll('/rehber')
    markKeepScroll('/rehber') // StrictMode çift çizim
    unmarkKeepScroll('/rehber')
    expect(shouldKeepScroll('/rehber')).toBe(true)
    unmarkKeepScroll('/rehber')
    expect(shouldKeepScroll('/rehber')).toBe(false)
    expect(shouldKeepScroll('/canli')).toBe(false)
  })
})
