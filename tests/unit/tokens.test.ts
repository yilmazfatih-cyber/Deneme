import { describe, expect, it } from 'vitest'
import { color, fitzColor, font, highContrast, size } from '../../src/theme/tokens'

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('tasarım token’ları', () => {
  it('metin kontrastı WCAG AA (çoğu AAA)', () => {
    expect(contrast(color.text, color.background)).toBeGreaterThanOrEqual(14.5)
    expect(contrast(color.textSecondary, color.background)).toBeGreaterThanOrEqual(7)
    expect(contrast(color.onColor, color.primary)).toBeGreaterThanOrEqual(7)
    expect(contrast(color.onColor, color.yes)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(color.onColor, color.no)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(highContrast.text, highContrast.background)).toBeGreaterThanOrEqual(20)
  })

  it('kategori kenarlıkları zemine karşı ≥ 3:1', () => {
    for (const [k, c] of Object.entries(fitzColor)) {
      expect(contrast(c, color.background), k).toBeGreaterThanOrEqual(3)
    }
    expect(contrast(color.border, color.background)).toBeGreaterThanOrEqual(3)
  })

  it('dokunma alanı ≥ 72 px, kart etiketi ≥ 22 px', () => {
    expect(size.touch).toBeGreaterThanOrEqual(72)
    expect(font.cardLabel).toBeGreaterThanOrEqual(22)
    expect(font.body).toBeGreaterThanOrEqual(18)
  })
})
