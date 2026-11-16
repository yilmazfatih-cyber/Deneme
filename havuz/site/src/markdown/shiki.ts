/**
 * Kod çitlerinin üst verisini okuyan Shiki dönüştürücüsü.
 *   ```ts title="src/site.config.ts" {2,4-6}
 * - `title="…"`  → kod bloğunun başlık çubuğunda görünür (plugins.ts → codeBlocks okur)
 * - `{2,4-6}`    → 2. ve 4–6. satırlar vurgulanır (CSS: .line.highlighted)
 * Kim kullanır: astro.config.ts (`markdown.shikiConfig.transformers`), tests/unit/markdown.test.ts.
 * Genişletme: yeni bir üst veri anahtarı → `parseCodeMeta` içine ekleyin ve teste örnek yazın.
 */
import type { AstroUserConfig } from 'astro'

type ShikiConfig = NonNullable<NonNullable<AstroUserConfig['markdown']>['shikiConfig']>
type Transformer = NonNullable<ShikiConfig['transformers']>[number]

export interface CodeMeta {
  title: string | undefined
  /** Vurgulanacak satır numaraları (1'den başlar). */
  highlighted: Set<number>
}

/** Kod çitinin dil adından sonraki kısmını çözer: `title="a.ts" {1,3-4}`. */
export function parseCodeMeta(raw: string | undefined): CodeMeta {
  const meta = raw ?? ''
  const title = /title="([^"]+)"/u.exec(meta)?.[1]
  const highlighted = new Set<number>()
  const ranges = /\{([\d,\s-]+)\}/u.exec(meta)?.[1]
  for (const part of (ranges ?? '').split(',')) {
    const [from, to] = part.split('-').map((value) => Number.parseInt(value.trim(), 10))
    if (from === undefined || Number.isNaN(from)) continue
    const end = to === undefined || Number.isNaN(to) ? from : to
    for (let line = from; line <= Math.min(end, from + 500); line++) highlighted.add(line)
  }
  return { title, highlighted }
}

export const codeMetaTransformer: Transformer = {
  name: 'site-code-meta',
  pre(node) {
    const { title } = parseCodeMeta(this.options.meta?.__raw)
    if (title !== undefined) node.properties['data-title'] = title
  },
  line(node, line) {
    if (!parseCodeMeta(this.options.meta?.__raw).highlighted.has(line)) return
    const current = node.properties.class
    node.properties.class = [...(Array.isArray(current) ? current : [String(current ?? '')]), 'highlighted']
      .filter((value) => value !== '')
      .join(' ')
  },
}
