/**
 * @vitest-environment node
 * KURAL: renk belirteçleri WCAG AA karşıtlığını sağlar (açık ve koyu tema).
 * Metin/zemin çiftleri ≥ 4.5, arayüz çizgisi ve odak halkası ≥ 3 (WCAG 1.4.3 ve 1.4.11).
 * Renk değiştirince bu test kırılırsa yeni rengi koyulaştırın/açın; çifti listeden çıkarmayın.
 */
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { read, SRC } from './source.ts'

const css = read(join(SRC, 'styles', 'index.css'))

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`styles/index.css içinde "${selector}" bloğu yok`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
  const [r = 0, g = 0, b = 0] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].toSorted((x, y) => y - x)
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
}

const TEXT_PAIRS = [
  ['ink', 'canvas'],
  ['ink', 'surface'],
  ['ink', 'surface-2'],
  ['muted', 'canvas'],
  ['muted', 'surface'],
  ['muted', 'surface-2'],
  ['accent-ink', 'accent'],
  ['accent-text', 'canvas'],
  ['accent-text', 'surface'],
  ['accent-text', 'accent-soft'],
  ['danger', 'surface'],
  ['danger', 'danger-soft'],
  ['warn', 'warn-soft'],
  ['ok', 'ok-soft'],
] as const

const UI_PAIRS = [
  ['line-strong', 'surface'],
  ['line-strong', 'canvas'],
  ['focus', 'canvas'],
  ['focus', 'surface'],
] as const

describe('renk karşıtlığı (kural testi)', () => {
  for (const [theme, selector] of [
    ['açık', ':root'],
    ['koyu', ":root[data-theme='dark']"],
  ] as const) {
    it(`${theme} tema: metin ≥ 4.5, çizgi ve odak ≥ 3`, () => {
      const tokens = block(selector)
      const failures: string[] = []
      for (const [fg, bg] of TEXT_PAIRS) {
        const ratio = contrast(tokens[fg] ?? '', tokens[bg] ?? '')
        if (!(ratio >= 4.5)) failures.push(`${fg} / ${bg}: ${ratio.toFixed(2)}`)
      }
      for (const [fg, bg] of UI_PAIRS) {
        const ratio = contrast(tokens[fg] ?? '', tokens[bg] ?? '')
        if (!(ratio >= 3)) failures.push(`${fg} / ${bg}: ${ratio.toFixed(2)}`)
      }
      expect(failures).toEqual([])
    })
  }
})
