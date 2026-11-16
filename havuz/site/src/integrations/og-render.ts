/**
 * Paylaşım görseli (Open Graph, 1200×630 PNG) çizimi. Satori metni yazı tipinden yollara çevirir, sharp PNG'ye
 * dönüştürür; sistem yazı tipi kullanılmadığı için çıktı makinenin yazı tiplerine bağlı değildir. Aynı girdiden aynı
 * baytların çıktığı testle doğrulanır (tests/unit/og-render.test.ts; farklı makinede aynı paket sürümleriyle denenmedi).
 * Yazı tipleri npm paketlerinden okunur (@fontsource/figtree, @fontsource/instrument-serif; lisans: OFL-1.1).
 * Kim kullanır: src/integrations/og-images.ts, tests/unit/og-render.test.ts.
 * Genişletme: kartın görünümünü değiştirmek için `card()` içindeki öğeleri düzenleyin ve TEMPLATE_VERSION'ı artırın
 * (önbellekteki eski görseller yeniden üretilsin diye).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import satori from 'satori'
import sharp from 'sharp'
import { logoMarkSvg } from '../lib/logo.ts'

export const TEMPLATE_VERSION = 3
export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

export interface OgCard {
  title: string
  description: string
  /** Sağ üstteki küçük etiket: "Blog", "Belgeler" (boş olabilir). */
  kicker: string
  siteName: string
  /** Alt satırdaki alan adı: "sedir.example" */
  host: string
  colors: {
    page: string
    ink: string
    muted: string
    brand: string
    onBrand: string
    brandSoft: string
    brandInk: string
    line: string
  }
}

const require = createRequire(import.meta.url)
const font = (file: string) => readFileSync(require.resolve(file))

/** Satori WOFF/TTF ister (WOFF2 değil). Türkçe harfler latin + latin-ext alt kümelerine dağılmıştır; ikisi de yüklenir. */
const FONTS = [
  { name: 'Figtree', data: font('@fontsource/figtree/files/figtree-latin-500-normal.woff'), weight: 500 as const },
  {
    name: 'Figtree Ext',
    data: font('@fontsource/figtree/files/figtree-latin-ext-500-normal.woff'),
    weight: 500 as const,
  },
  { name: 'Figtree', data: font('@fontsource/figtree/files/figtree-latin-600-normal.woff'), weight: 600 as const },
  {
    name: 'Figtree Ext',
    data: font('@fontsource/figtree/files/figtree-latin-ext-600-normal.woff'),
    weight: 600 as const,
  },
  {
    name: 'Serif',
    data: font('@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff'),
    weight: 400 as const,
  },
  {
    name: 'Serif Ext',
    data: font('@fontsource/instrument-serif/files/instrument-serif-latin-ext-400-normal.woff'),
    weight: 400 as const,
  },
].map((entry) => ({ ...entry, style: 'normal' as const }))

const SANS = 'Figtree, Figtree Ext'
const SERIF = 'Serif, Serif Ext'

/** Yazı tipinde bulunmayan sık karakterlerin karşılıkları (₺ yerine TL gibi). */
const REPLACEMENTS: [RegExp, string][] = [
  [/₺\s?([\d.,]+)/gu, '$1 TL'],
  [/₺/gu, 'TL'],
  [/[→⇒]/gu, '->'],
  [/[✓✔]/gu, ''],
]

export function sanitize(text: string): string {
  return REPLACEMENTS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text).trim()
}

type Child = SatoriElement | string
interface SatoriElement {
  type: string
  props: { style?: Record<string, unknown>; children?: Child | Child[]; src?: string; width?: number; height?: number }
}

const h = (type: string, style: Record<string, unknown>, ...children: Child[]): SatoriElement => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
})

function card(input: OgCard): SatoriElement {
  const { colors } = input
  const title = sanitize(input.title)
  const titleSize = title.length > 70 ? 58 : title.length > 45 ? 68 : 80
  const mark = `data:image/svg+xml;base64,${Buffer.from(logoMarkSvg({ bg: colors.brand, fg: colors.onBrand, size: 64 })).toString('base64')}`
  return h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      padding: '64px 72px 56px',
      backgroundColor: colors.page,
      color: colors.ink,
      fontFamily: SANS,
      borderBottom: `14px solid ${colors.brand}`,
    },
    h(
      'div',
      { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
      h(
        'div',
        { display: 'flex', alignItems: 'center', gap: 18 },
        { type: 'img', props: { src: mark, width: 60, height: 60 } },
        h('div', { fontFamily: SERIF, fontSize: 44, lineHeight: 1 }, sanitize(input.siteName)),
      ),
      input.kicker
        ? h(
            'div',
            {
              display: 'flex',
              padding: '10px 22px',
              borderRadius: 999,
              backgroundColor: colors.brandSoft,
              color: colors.brandInk,
              fontSize: 26,
              fontWeight: 600,
            },
            sanitize(input.kicker),
          )
        : h('div', { display: 'flex' }, ''),
    ),
    h(
      'div',
      { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' },
      h(
        'div',
        {
          fontFamily: SERIF,
          fontSize: titleSize,
          lineHeight: 1.04,
          letterSpacing: '-0.01em',
          lineClamp: 3,
          display: 'block',
        },
        title,
      ),
      input.description
        ? h(
            'div',
            { marginTop: 26, fontSize: 30, lineHeight: 1.4, color: colors.muted, lineClamp: 2, display: 'block' },
            sanitize(input.description),
          )
        : h('div', { display: 'flex' }, ''),
    ),
    h(
      'div',
      {
        display: 'flex',
        alignItems: 'center',
        paddingTop: 22,
        borderTop: `2px solid ${colors.line}`,
        fontSize: 24,
        color: colors.muted,
      },
      input.host,
    ),
  )
}

/** Kartı PNG olarak üretir. `missing` gösterilemeyen karakterleri toplar (uyarı için). */
export async function renderOgCard(input: OgCard, missing: string[] = []): Promise<Buffer> {
  const svg = await satori(card(input) as never, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: FONTS,
    loadAdditionalAsset: async (_code: string, segment: string) => {
      missing.push(segment)
      return []
    },
  })
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 92, effort: 7 }).toBuffer()
}

/** Apple dokunma simgesi (180×180 PNG). */
export async function renderTouchIcon(colors: { brand: string; onBrand: string }): Promise<Buffer> {
  const svg = logoMarkSvg({ bg: colors.brand, fg: colors.onBrand, size: 180 }).replace('rx="9"', 'rx="0"')
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}
