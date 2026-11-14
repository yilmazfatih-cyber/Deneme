import { describe, expect, it } from 'vitest'
import { CHROME, FRAMES, GAP, layoutFrames, PHONE_TALLER } from './layout'

describe('vitrin yerleşimi', () => {
  it('geniş pencerede yan yana, sığar ve oranlar doğru', () => {
    const W = 1536
    const H = 720
    const l = layoutFrames(W, H)
    expect(l.mode).toBe('row')
    const total = l.frames.reduce((s, f) => s + f.width + CHROME[f.id].x, 0) + GAP * 2
    expect(total).toBeLessThanOrEqual(W + 3)
    for (const f of l.frames) {
      const spec = FRAMES.find((x) => x.id === f.id)!
      expect(f.width / f.height).toBeCloseTo(spec.vw / spec.vh, 1)
      expect(f.scale).toBeCloseTo(f.height / spec.vh, 5)
    }
    const [tv, web, phone] = l.frames
    expect(tv!.height).toBe(web!.height)
    expect(phone!.height).toBe(Math.floor(tv!.height * PHONE_TALLER))
    expect(phone!.height + CHROME.telefon.y).toBeLessThanOrEqual(H)
  })
  it('alçak pencerede yükseklik sınırlar', () => {
    const l = layoutFrames(2400, 500)
    const phone = l.frames.find((f) => f.id === 'telefon')!
    expect(phone.height + CHROME.telefon.y).toBeLessThanOrEqual(500)
  })
  it('dar pencerede alt alta ve taşmaz', () => {
    const l = layoutFrames(360, 700)
    expect(l.mode).toBe('stack')
    for (const f of l.frames) expect(f.width + CHROME[f.id].x).toBeLessThanOrEqual(360 + 1)
    const web = l.frames.find((f) => f.id === 'web')!
    // gövde iki yandan %6 taşar
    expect((web.width + CHROME.web.x) * 1.12).toBeLessThanOrEqual(361)
  })
})
