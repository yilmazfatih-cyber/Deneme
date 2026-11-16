import { describe, expect, it } from 'vitest'
import {
  cubicBezier,
  dampingRatio,
  EASINGS,
  ease,
  formatColor,
  interpolate,
  mixColors,
  mixSrgb,
  oklabToRgb,
  parseColor,
  rgbToOklab,
  rk4Step,
  settleTime,
  springState,
  steps,
  toTransform,
} from '../../src/animasyon/index.ts'

describe('yumuşatma eğrileri', () => {
  it('kural testi: her eğri 0 → 0 ve 1 → 1', () => {
    for (const [name, fn] of Object.entries(EASINGS)) {
      expect(fn(0), name).toBeCloseTo(0, 9)
      expect(fn(1), name).toBeCloseTo(1, 9)
    }
  })

  it('cubic-bezier, bağımsız ikiye bölme çözümüyle aynı sonucu verir', () => {
    const [x1, y1, x2, y2] = [0.25, 0.1, 0.25, 1]
    const bez = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3
    for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      let lo = 0
      let hi = 1
      for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2
        if (bez(x1, x2, mid) < x) lo = mid
        else hi = mid
      }
      expect(ease(x)).toBeCloseTo(bez(y1, y2, lo), 6)
    }
    expect(() => cubicBezier(1.5, 0, 0, 1)).toThrow(RangeError)
  })

  it('basamaklı eğri', () => {
    expect([0, 0.3, 0.5, 0.99, 1].map(steps(4))).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(steps(4, 'start')(0.1)).toBe(0.25)
  })
})

describe('yay fiziği', () => {
  const configs = [
    { stiffness: 170, damping: 10, mass: 1 },
    { stiffness: 100, damping: 20, mass: 1 },
    { stiffness: 80, damping: 40, mass: 2 },
  ]

  it('az, kritik ve aşırı sönümlü kapalı formüller RK4 sayısal çözümüyle örtüşür', () => {
    expect(configs.map((c) => Math.sign(dampingRatio(c) - 1))).toEqual([-1, 0, 1])
    for (const config of configs) {
      let x = -100
      let v = 30
      const dt = 1 / 2000
      for (let step = 1; step <= 2000; step++) {
        ;[x, v] = rk4Step(x, v, dt, config)
        if (step % 250 === 0) {
          const exact = springState(0, 100, step * dt, { ...config, restDisplacement: 0, restVelocity: 0 }, 30)
          expect(exact.position - 100).toBeCloseTo(x, 6)
          expect(exact.velocity).toBeCloseTo(v, 5)
        }
      }
    }
  })

  it('durulur; az sönümlü yay hedefi aşar, kritik sönümlü aşmaz', () => {
    const overshoot = (config: (typeof configs)[number]) => {
      let max = 0
      for (let t = 0; t < 3; t += 0.005) max = Math.max(max, springState(0, 100, t, config).position)
      return max
    }
    expect(overshoot(configs[0]!)).toBeGreaterThan(100)
    expect(overshoot(configs[1]!)).toBeLessThanOrEqual(100)
    const end = springState(0, 100, settleTime(0, 100, configs[1]), configs[1])
    expect(end).toEqual({ position: 100, velocity: 0, done: true })
    expect(() => springState(0, 1, 0, { stiffness: -1 })).toThrow(RangeError)
  })
})

describe('renk ve ara değerleme', () => {
  it('ayrıştırma ve biçimleme', () => {
    expect(parseColor('#0af')).toEqual({ r: 0, g: 170, b: 255, a: 1 })
    expect(parseColor('#11223380').a).toBeCloseTo(0.502, 3)
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
    expect(formatColor({ r: 1.4, g: 300, b: -2, a: 1 })).toBe('rgb(1, 255, 0)')
    expect(() => parseColor('kırmızımsı')).toThrow(/Renk çözümlenemedi/)
  })

  it('OKLab: beyaz L=1, kırmızının başvuru değeri, gidiş-dönüş', () => {
    const white = rgbToOklab({ r: 255, g: 255, b: 255, a: 1 })
    expect(white.L).toBeCloseTo(1, 6)
    expect(white.a).toBeCloseTo(0, 6)
    const red = rgbToOklab({ r: 255, g: 0, b: 0, a: 1 })
    expect([red.L, red.a, red.b].map((n) => Math.round(n * 1e4) / 1e4)).toEqual([0.628, 0.2249, 0.1258])
    const back = oklabToRgb(rgbToOklab({ r: 12, g: 200, b: 99, a: 1 }))
    expect([back.r, back.g, back.b].map(Math.round)).toEqual([12, 200, 99])
  })

  it('OKLab karışımı sRGB karışımından daha açık ve canlı bir orta verir', () => {
    expect(mixColors('#000000', '#ffffff')(0.5)).toBe('rgb(99, 99, 99)')
    const lab = rgbToOklab(parseColor(mixColors('#0000ff', '#ffff00')(0.5)))
    const srgb = rgbToOklab(parseColor(mixSrgb('#0000ff', '#ffff00')(0.5)))
    expect(lab.L).toBeGreaterThan(srgb.L)
  })

  it('birimli dizgi, dizi, nesne ve dönüşüm', () => {
    expect(interpolate('10px 20px', '30px 60px')(0.5)).toBe('20px 40px')
    expect(interpolate('rotate(0deg)', 'rotate(90deg)')(0.25)).toBe('rotate(22.5deg)')
    expect(interpolate([0, 10], [10, 20])(0.5)).toEqual([5, 15])
    expect(interpolate({ x: 0, opacity: 1 }, { x: 100, opacity: 0 })(0.5)).toEqual({ x: 50, opacity: 0.5 })
    expect(interpolate('a', 'b')(0.4)).toBe('a')
    expect(toTransform({ x: 10, scale: 2 })).toBe('translate(10px, 0px) rotate(0deg) scale(2)')
  })
})
