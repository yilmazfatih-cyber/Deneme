/**
 * Tema renkleri (saf): açık ve koyu temanın bütün renk değişkenlerini tek yerde üretir.
 * - Nötr tonlar (zemin, metin, çizgi) aşağıda sabittir.
 * - Marka tonları site.config.ts → brand içindeki iki renkten türetilir; metin/zemin çiftleri WCAG AA (4.5:1)
 *   karşıtlığını sağlayacak biçimde ayarlanır. Böylece marka rengi değişse de okunabilirlik bozulmaz.
 * Kim kullanır: src/layouts/BaseLayout.astro (CSS'i <head>'e yazar), tests/unit/theme.test.ts (karşıtlık denetimi).
 * CSS tarafı: src/styles/global.css bu değişkenleri Tailwind renk adlarına bağlar (bg-page, text-ink, bg-brand…).
 * Genişletme: yeni bir renk değişkeni → buraya ekleyin, global.css içindeki @theme bloğuna da `--color-ad: var(--ad)` yazın.
 */
import { contrast, ensureContrast, hexToOklch, oklchToHex } from './color.ts'

export type ThemeName = 'light' | 'dark'
export type ThemeTokens = Record<string, string>

/** Nötr tonlar. Değiştirirseniz `npm run test` karşıtlık kurallarını yeniden denetler. */
export const neutrals: Record<ThemeName, ThemeTokens> = {
  light: {
    page: '#fbfaf7', // sayfa zemini (sıcak kâğıt)
    surface: '#ffffff', // kart, form alanı
    subtle: '#f4f2ed', // ikincil zemin (bölüm, kod)
    ink: '#101b16', // ana metin
    muted: '#4e5853', // ikincil metin
    line: '#e1e0d8', // ince ayırıcı çizgi
    'line-strong': '#88867e', // form alanı kenarı (3:1)
  },
  dark: {
    page: '#0d1310',
    surface: '#141c18',
    subtle: '#1a241f',
    ink: '#e6edea',
    muted: '#a3aea8',
    line: '#28322d',
    'line-strong': '#6a7570',
  },
}

/** Uyarı kutusu türleri ve ton açıları (OKLCH). */
export const calloutHues = { note: 250, tip: 160, important: 300, warning: 75, caution: 25 } as const
export type CalloutKind = keyof typeof calloutHues

const AA = 4.5
/** Yuvarlama payı: hedefi biraz yüksek tutarız ki hex'e çevrilince 4.5'in altına düşmesin. */
const TARGET = 4.6

function surfaces(theme: ThemeName): string[] {
  const tokens = neutrals[theme]
  return [tokens.page ?? '', tokens.surface ?? '', tokens.subtle ?? '']
}

/** Dolgu rengi üzerinde okunacak metin rengi: hangisi daha karşıtsa (açık ya da koyu). */
function readableOn(fill: string, light: string, dark: string): string {
  return contrast(fill, light) >= contrast(fill, dark) ? light : dark
}

function fillTokens(name: string, hex: string, theme: ThemeName): ThemeTokens {
  const base = hexToOklch(hex)
  const paper = '#ffffff'
  const night = neutrals.dark.page ?? '#000000'
  // Koyu temada dolgu açık bir tona çekilir; açık temada markanın kendi rengi kullanılır.
  let fill = theme === 'dark' ? oklchToHex({ l: 0.8, c: Math.min(base.c, 0.13), h: base.h }) : hex
  let onFill = readableOn(fill, paper, night)
  if (contrast(fill, onFill) < AA) {
    fill = ensureContrast(fill, [onFill], TARGET, onFill === paper ? 'darker' : 'lighter')
    onFill = readableOn(fill, paper, night)
  }
  const fillL = hexToOklch(fill)
  const strong = oklchToHex({ ...fillL, l: fillL.l + (onFill === paper ? -0.05 : 0.05) })
  const soft =
    theme === 'dark'
      ? oklchToHex({ l: 0.27, c: Math.min(base.c * 0.5, 0.05), h: base.h })
      : oklchToHex({ l: 0.955, c: Math.min(base.c * 0.3, 0.035), h: base.h })
  const line =
    theme === 'dark'
      ? oklchToHex({ l: 0.38, c: Math.min(base.c * 0.6, 0.07), h: base.h })
      : oklchToHex({ l: 0.87, c: Math.min(base.c * 0.45, 0.06), h: base.h })
  const inkStart = theme === 'dark' ? oklchToHex({ l: 0.82, c: Math.min(base.c, 0.12), h: base.h }) : hex
  const ink = ensureContrast(inkStart, [...surfaces(theme), soft], TARGET, theme === 'dark' ? 'lighter' : 'darker')
  return {
    [name]: fill,
    [`${name}-strong`]: strong,
    [`on-${name}`]: onFill,
    [`${name}-ink`]: ink,
    [`${name}-soft`]: soft,
    [`${name}-line`]: line,
  }
}

function deepTokens(primary: string, theme: ThemeName): ThemeTokens {
  const base = hexToOklch(primary)
  const deep = oklchToHex({ l: theme === 'dark' ? 0.26 : 0.3, c: Math.min(base.c, 0.075), h: base.h })
  const onDeep = '#f4f7f5'
  const onDeepMuted = ensureContrast(
    oklchToHex({ l: 0.82, c: Math.min(base.c * 0.3, 0.03), h: base.h }),
    [deep],
    TARGET,
    'lighter',
  )
  return { deep, 'on-deep': onDeep, 'on-deep-muted': onDeepMuted }
}

function calloutTokens(theme: ThemeName): ThemeTokens {
  const tokens: ThemeTokens = {}
  for (const [kind, hue] of Object.entries(calloutHues)) {
    const soft =
      theme === 'dark' ? oklchToHex({ l: 0.25, c: 0.035, h: hue }) : oklchToHex({ l: 0.96, c: 0.025, h: hue })
    const line = theme === 'dark' ? oklchToHex({ l: 0.4, c: 0.07, h: hue }) : oklchToHex({ l: 0.84, c: 0.07, h: hue })
    const start = theme === 'dark' ? oklchToHex({ l: 0.84, c: 0.1, h: hue }) : oklchToHex({ l: 0.45, c: 0.13, h: hue })
    tokens[`${kind}-soft`] = soft
    tokens[`${kind}-line`] = line
    tokens[`${kind}-ink`] = ensureContrast(start, [soft], TARGET, theme === 'dark' ? 'lighter' : 'darker')
  }
  return tokens
}

/** Bir temanın bütün renk değişkenleri (ad → hex). */
export function buildTheme(brand: { primary: string; accent: string }, theme: ThemeName): ThemeTokens {
  return {
    ...neutrals[theme],
    ...fillTokens('brand', brand.primary, theme),
    ...fillTokens('accent', brand.accent, theme),
    ...deepTokens(brand.primary, theme),
    ...calloutTokens(theme),
  }
}

/**
 * <head>'e yazılacak CSS. Her değişken `light-dark(açık, koyu)` biçimindedir: hangi tonun kullanılacağını
 * `color-scheme` belirler. Varsayılan `light dark` (JS kapalıyken sistem temasına uyar); tema düğmesi
 * <html data-theme="light|dark"> yazarak seçimi sabitler (src/styles/global.css).
 */
export function buildThemeCss(brand: { primary: string; accent: string }): string {
  const light = buildTheme(brand, 'light')
  const dark = buildTheme(brand, 'dark')
  const declarations = Object.keys(light).map(
    (name) => `--${name}:light-dark(${light[name]},${dark[name] ?? light[name]})`,
  )
  return `:root{${declarations.join(';')}}`
}

/**
 * Okunabilirlik kuralları: [metin, zemin, en az oran]. Testler bu tabloyu her iki temada denetler;
 * yeni bir renk çifti kullanmaya başlarsanız buraya ekleyin.
 */
export const contrastRules: ReadonlyArray<readonly [text: string, background: string, minimum: number]> = [
  ['ink', 'page', 7],
  ['ink', 'surface', 7],
  ['ink', 'subtle', 7],
  ['muted', 'page', AA],
  ['muted', 'surface', AA],
  ['muted', 'subtle', AA],
  ['line-strong', 'page', 3],
  ['line-strong', 'surface', 3],
  ['on-brand', 'brand', AA],
  ['on-brand', 'brand-strong', AA],
  ['brand-ink', 'page', AA],
  ['brand-ink', 'surface', AA],
  ['brand-ink', 'subtle', AA],
  ['brand-ink', 'brand-soft', AA],
  ['ink', 'brand-soft', 7],
  ['on-accent', 'accent', AA],
  ['accent-ink', 'page', AA],
  ['accent-ink', 'surface', AA],
  ['accent-ink', 'accent-soft', AA],
  ['on-deep', 'deep', 7],
  ['on-deep-muted', 'deep', AA],
  ...Object.keys(calloutHues).flatMap(
    (kind) =>
      [
        [`${kind}-ink`, `${kind}-soft`, AA],
        ['ink', `${kind}-soft`, 7],
      ] as const,
  ),
]
