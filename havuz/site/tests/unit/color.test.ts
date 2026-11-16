import { describe, expect, it } from 'vitest'
import { contrast, ensureContrast, hexToOklch, luminance, oklchToHex, parseHex, toHex } from '../../src/lib/color.ts'

describe('hex ayrıştırma', () => {
  it('gidiş-dönüş aynı rengi verir', () => {
    for (const hex of ['#000000', '#ffffff', '#1f5f4a', '#b4532a', '#3b82f6', '#facc15']) {
      expect(toHex(parseHex(hex))).toBe(hex)
    }
  })

  it('hatalı biçimi reddeder', () => {
    expect(() => parseHex('#fff')).toThrow(/#rrggbb/u)
    expect(() => parseHex('yeşil')).toThrow(/#rrggbb/u)
  })
})

describe('OKLCH dönüşümü', () => {
  // Başvuru değerleri: OKLab tanımındaki bilinen noktalar (beyaz L=1, siyah L=0, saf kırmızı ≈ L 0.628 C 0.2577 H 29.23).
  it('bilinen noktaları doğru verir', () => {
    expect(hexToOklch('#ffffff').l).toBeCloseTo(1, 3)
    expect(hexToOklch('#ffffff').c).toBeCloseTo(0, 3)
    expect(hexToOklch('#000000').l).toBeCloseTo(0, 5)
    const red = hexToOklch('#ff0000')
    expect(red.l).toBeCloseTo(0.628, 2)
    expect(red.c).toBeCloseTo(0.2577, 2)
    expect(red.h).toBeCloseTo(29.23, 0)
    const blue = hexToOklch('#0000ff')
    expect(blue.l).toBeCloseTo(0.452, 2)
    expect(blue.h).toBeCloseTo(264.05, 0)
  })

  it('gidiş-dönüşte rengi korur', () => {
    for (const hex of ['#1f5f4a', '#b4532a', '#3b82f6', '#facc15', '#7c3aed', '#808080', '#fbfaf7']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex)
    }
  })

  it('gösterilemeyen rengi doygunluğu azaltarak sığdırır (ton ve açıklık korunur)', () => {
    const wild = { l: 0.7, c: 0.4, h: 150 }
    const fitted = hexToOklch(oklchToHex(wild))
    expect(fitted.l).toBeCloseTo(0.7, 1)
    expect(Math.abs(fitted.h - 150)).toBeLessThan(4)
    expect(fitted.c).toBeLessThan(0.4)
  })
})

describe('WCAG karşıtlığı', () => {
  // Başvuru: WCAG tanımı gereği siyah/beyaz 21:1; #767676 beyaz üzerinde 4.54:1 (AA sınırındaki bilinen gri).
  it('bilinen oranları verir', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
    expect(contrast('#1f5f4a', '#1f5f4a')).toBeCloseTo(1, 5)
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('ensureContrast istenen orana ulaşana dek koyultur ya da açar', () => {
    const darker = ensureContrast('#7fd1b0', ['#ffffff'], 4.5, 'darker')
    expect(contrast(darker, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    const lighter = ensureContrast('#1f5f4a', ['#0d1310'], 4.5, 'lighter')
    expect(contrast(lighter, '#0d1310')).toBeGreaterThanOrEqual(4.5)
    // Zaten yeterliyse rengi değiştirmez.
    expect(ensureContrast('#1f5f4a', ['#ffffff'], 4.5, 'darker')).toBe('#1f5f4a')
  })
})
