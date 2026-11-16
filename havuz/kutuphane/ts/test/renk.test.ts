// renk modülünün testi: bilinen değerler (WCAG örnekleri, CSS Color 4 OKLCH örneği) + gidiş-dönüş özellikleri.
import { describe, expect, it } from 'vitest'
import {
  adjustForContrast,
  bestTextColor,
  ColorError,
  contrastRatio,
  hslToRgb,
  meetsWcag,
  oklchToRgb,
  parseHex,
  relativeLuminance,
  rgbToHsl,
  rgbToOklch,
  toHex,
} from '../src/renk.ts'

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('bilinen değerler', () => {
  it('hex ayrıştırma ve yazma', () => {
    expect(parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 })
    expect(parseHex('1E3A8A')).toEqual({ r: 30, g: 58, b: 138 })
    expect(parseHex('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 0.502 })
    expect(toHex({ r: 30, g: 58, b: 138 })).toBe('#1e3a8a')
    expect(toHex({ r: 300, g: -5, b: 127.6, a: 0.5 })).toBe('#ff008080')
    expect(() => parseHex('#ggg')).toThrow(ColorError)
  })

  it('WCAG kontrastı: siyah/beyaz 21, #777 yetmez, #767676 yeter', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(meetsWcag('#777777', '#ffffff')).toBe(false)
    expect(meetsWcag('#767676', '#ffffff')).toBe(true)
    expect(meetsWcag('#777777', '#ffffff', { largeText: true })).toBe(true)
    expect(meetsWcag('#595959', '#ffffff', { level: 'AAA' })).toBe(true)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10)
  })

  it('OKLCH: kırmızı ≈ oklch(0.628 0.2577 29.23), beyaz l≈1 c≈0', () => {
    const red = rgbToOklch(parseHex('#ff0000'))
    expect(red.l).toBeCloseTo(0.628, 3)
    expect(red.c).toBeCloseTo(0.2577, 3)
    expect(red.h).toBeCloseTo(29.23, 1)
    const white = rgbToOklch(parseHex('#ffffff'))
    expect(white.l).toBeCloseTo(1, 4)
    expect(white.c).toBeLessThan(1e-4)
  })

  it('HSL bilinen değerler', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 })
    expect(toHex(hslToRgb({ h: 120, s: 100, l: 25 }))).toBe('#008000')
  })
})

describe('gidiş-dönüş ve erişilebilir renk', () => {
  const random = seededRandom(91)
  const randomRgb = () => ({
    r: Math.floor(random() * 256),
    g: Math.floor(random() * 256),
    b: Math.floor(random() * 256),
  })

  it('RGB → HSL → RGB ve RGB → OKLCH → RGB aynı rengi verir', () => {
    for (let i = 0; i < 1000; i++) {
      const color = randomRgb()
      expect(toHex(hslToRgb(rgbToHsl(color)))).toBe(toHex(color))
      expect(toHex(oklchToRgb(rgbToOklch(color)))).toBe(toHex(color))
    }
  })

  it('sRGB dışındaki OKLCH rengi tonu koruyarak sığdırılır', () => {
    const rgb = oklchToRgb({ l: 0.7, c: 0.5, h: 145 })
    for (const value of [rgb.r, rgb.g, rgb.b]) expect(value >= 0 && value <= 255).toBe(true)
    expect(Math.abs(rgbToOklch(rgb).h - 145)).toBeLessThan(2)
  })

  it('adjustForContrast hedefe ulaşır ve tonu korur; bestTextColor en iyisini seçer', () => {
    for (let i = 0; i < 300; i++) {
      const fg = toHex(randomRgb())
      const bg = toHex(randomRgb())
      const adjusted = adjustForContrast(fg, bg, 4.5)
      const reachable = Math.max(contrastRatio('#000000', bg), contrastRatio('#ffffff', bg)) >= 4.5
      if (reachable) expect(contrastRatio(adjusted, bg)).toBeGreaterThanOrEqual(4.5)
    }
    const orange = adjustForContrast('#ff8800', '#ffffff', 4.5)
    expect(contrastRatio(orange, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(Math.abs(rgbToOklch(parseHex(orange)).h - rgbToOklch(parseHex('#ff8800')).h)).toBeLessThan(5)
    expect(bestTextColor('#1e3a8a')).toBe('#ffffff')
    expect(bestTextColor('#fde68a')).toBe('#000000')
  })
})
