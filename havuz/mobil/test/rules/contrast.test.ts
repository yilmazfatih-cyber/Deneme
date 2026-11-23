/**
 * KURAL: renkler okunur. Her metin/zemin çifti WCAG AA (≥ 4,5:1), form kenarları ≥ 3:1 — açık ve koyu temada.
 * Yeni renk eklediyseniz kullanıldığı çifti PAIRS'e yazın. Hesap: WCAG 2.x göreli parlaklık formülü.
 */
import { DARK, LIGHT, type Palette } from '../../src/ui/palette.ts'
import { expectNone } from './source.ts'

function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255)
  const [r = 0, g = 0, b = 0] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].toSorted((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

type Key = Exclude<keyof Palette, 'list'>

const TEXT_PAIRS: [Key, Key][] = [
  ['ink', 'background'],
  ['ink', 'surface'],
  ['ink', 'surfaceAlt'],
  ['muted', 'background'],
  ['muted', 'surface'],
  ['onAccent', 'accent'],
  ['accentInk', 'accentSoft'],
  ['accentInk', 'surface'],
  ['accentInk', 'background'],
  ['danger', 'surface'],
  ['danger', 'dangerSoft'],
  ['success', 'successSoft'],
  ['success', 'surface'],
  ['warn', 'warnSoft'],
  ['onToast', 'toast'],
  ['toastAction', 'toast'],
]
const BORDER_PAIRS: [Key, Key][] = [
  ['lineStrong', 'surface'],
  ['lineStrong', 'background'],
  ['accent', 'surface'],
]

describe('renk karşıtlığı (kural testi)', () => {
  it.each([
    ['açık', LIGHT],
    ['koyu', DARK],
  ] as const)('%s tema: metinler ≥ 4,5:1, kenarlar ≥ 3:1', (_name, palette) => {
    const problems = [
      ...TEXT_PAIRS.filter(([fg, bg]) => contrast(palette[fg], palette[bg]) < 4.5).map(
        ([fg, bg]) => `${fg} / ${bg}: ${contrast(palette[fg], palette[bg]).toFixed(2)}`,
      ),
      ...BORDER_PAIRS.filter(([fg, bg]) => contrast(palette[fg], palette[bg]) < 3).map(
        ([fg, bg]) => `${fg} / ${bg}: ${contrast(palette[fg], palette[bg]).toFixed(2)}`,
      ),
    ]
    expectNone(problems, 'Rengi koyulaştırın/açın (src/ui/palette.ts):')
  })
})
