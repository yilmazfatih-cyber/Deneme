import { describe, expect, it } from 'vitest'
import { contrast } from '../../src/lib/color.ts'
import { buildTheme, buildThemeCss, contrastRules, type ThemeName } from '../../src/lib/theme.ts'
import { siteConfig } from '../../src/site.config.ts'

/** Marka rengi ne seçilirse seçilsin kurallar tutmalı: sitenin kendi rengi + zor örnekler. */
const brands = [
  { name: 'site.config.ts', ...siteConfig.brand },
  { name: 'canlı mavi + turuncu', primary: '#2563eb', accent: '#f97316' },
  { name: 'sarı (açık renk) + mor', primary: '#facc15', accent: '#7c3aed' },
  { name: 'kırmızı + camgöbeği', primary: '#dc2626', accent: '#06b6d4' },
  { name: 'neredeyse siyah + gri', primary: '#111827', accent: '#9ca3af' },
  { name: 'çok açık pembe + lacivert', primary: '#fbcfe8', accent: '#1e3a8a' },
  { name: 'orta yeşil + limon', primary: '#22c55e', accent: '#bef264' },
]

describe.each(brands)('tema renkleri — $name', ({ primary, accent }) => {
  it.each(['light', 'dark'] as ThemeName[])('%s temada bütün metin/zemin çiftleri okunabilir', (themeName) => {
    const tokens = buildTheme({ primary, accent }, themeName)
    const failures: string[] = []
    for (const [text, background, minimum] of contrastRules) {
      const textColor = tokens[text]
      const backgroundColor = tokens[background]
      if (textColor === undefined || backgroundColor === undefined) {
        failures.push(`${text} / ${background}: değişken tanımlı değil (src/lib/theme.ts)`)
        continue
      }
      const ratio = contrast(textColor, backgroundColor)
      if (ratio < minimum) {
        failures.push(`${text} (${textColor}) / ${background} (${backgroundColor}): ${ratio.toFixed(2)} < ${minimum}`)
      }
    }
    expect(failures, `Karşıtlık yetersiz. Renkleri src/lib/theme.ts içinde düzeltin:\n${failures.join('\n')}`).toEqual(
      [],
    )
  })
})

describe('buildThemeCss', () => {
  it('her değişkeni açık ve koyu değeriyle light-dark() olarak üretir', () => {
    const css = buildThemeCss(siteConfig.brand)
    expect(css).toMatch(/^:root\{--page:light-dark\(#[0-9a-f]{6},#[0-9a-f]{6}\);/u)
    for (const name of ['brand', 'on-brand', 'brand-ink', 'accent', 'deep', 'caution-ink']) {
      expect(css).toMatch(new RegExp(`--${name}:light-dark\\(#[0-9a-f]{6},#[0-9a-f]{6}\\)`, 'u'))
    }
    expect(css).not.toContain('undefined')
  })
})
