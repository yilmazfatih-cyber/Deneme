import { markdownToHtml } from 'satteri'
import { describe, expect, it } from 'vitest'
import { createMarkdownPlugins, localeFromFile } from '../../src/markdown/plugins.ts'
import { parseCodeMeta } from '../../src/markdown/shiki.ts'

/** Eklentilerimiz eşzamanlı çalışır; sonuç bir Promise değil, doğrudan HTML'dir. */
const render = (markdown: string, options: { base?: string; file?: string } = {}): string => {
  const result = markdownToHtml(markdown, {
    hastPlugins: createMarkdownPlugins({ base: options.base ?? '/' }),
    fileURL: new URL(options.file ?? 'file:///proje/src/content/blog/tr/yazi.md'),
  })
  if (result instanceof Promise) throw new Error('Markdown eklentileri eşzamanlı olmalı.')
  return result.html
}

describe('Markdown eklentileri', () => {
  it('başlıklara Türkçe karaktersiz, tekil kimlik verir', () => {
    const html = render('## Özellikler ve Fiyat\n\n### IĞDIR’da şöyle\n\n## Özellikler ve Fiyat')
    expect(html).toContain('<h2 id="ozellikler-ve-fiyat">')
    expect(html).toContain('<h3 id="igdirda-soyle">')
    expect(html).toContain('<h2 id="ozellikler-ve-fiyat-2">')
  })

  it('iç bağlantı ve görsellere alt klasörü ekler, dış adreslere ve çapalara dokunmaz', () => {
    const html = render('[iç](/blog/) [dış](https://example.com) [çapa](#x) ![görsel](/resim.png)', { base: '/depo/' })
    expect(html).toContain('href="/depo/blog/"')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('href="#x"')
    expect(html).toContain('src="/depo/resim.png"')
  })

  it('> [!TIP] alıntısını dilin etiketiyle uyarı kutusuna çevirir', () => {
    const tr = render('> [!TIP]\n> Kısa bir **ipucu**.')
    expect(tr).toContain('<aside class="callout callout-tip" role="note"><p class="callout-title">İpucu</p>')
    expect(tr).toContain('Kısa bir <strong>ipucu</strong>.')
    expect(tr).not.toContain('[!TIP]')
    const en = render('> [!WARNING]\n> Careful.', { file: 'file:///proje/src/content/blog/en/post.md' })
    expect(en).toContain('<p class="callout-title">Warning</p>')
    expect(render('> Sıradan alıntı.')).toContain('<blockquote>')
  })

  it('başlıklı görseli şekle çevirir, başlıksızı olduğu gibi bırakır', () => {
    expect(render('![Alt metin](./a.png "Alt yazı")')).toContain(
      '<figure class="figure"><img src="./a.png" alt="Alt metin"><figcaption>Alt yazı</figcaption></figure>',
    )
    expect(render('![Alt metin](./a.png)')).toContain('<p><img src="./a.png" alt="Alt metin"></p>')
  })

  it('kod bloğunu başlık çubuğu ve Kopyala düğmesiyle sarar', () => {
    const html = render('```ts\nconst a = 1\n```')
    // Dil adı derlemede Shiki'nin yazdığı data-language özniteliğinden gelir; burada Shiki çalışmaz.
    expect(html).toMatch(
      /<div class="code-block"><div class="code-header"><span class="code-lang"><\/span><button type="button" class="code-copy"/u,
    )
    expect(html).toContain('data-copy-label="Kopyala"')
  })

  it('tabloyu odaklanabilir kaydırma bölgesine alır ve dipnot etiketlerini çevirir', () => {
    const html = render('| A | B |\n| - | - |\n| 1 | 2 |\n\nNot[^1].\n\n[^1]: Açıklama.')
    expect(html).toContain('<div class="table-scroll" tabindex="0" role="region" aria-label="Tablo"><table>')
    expect(html).toContain('>Dipnotlar</h2>')
    expect(html).toContain('aria-label="Metne dön"')
  })

  it('dosya yolundan dili bulur', () => {
    expect(localeFromFile(new URL('file:///p/src/content/belgeler/en/x.md'))).toBe('en')
    expect(localeFromFile(new URL('file:///p/src/pages/x.md'))).toBe('tr')
    expect(localeFromFile(undefined)).toBe('tr')
  })
})

describe('parseCodeMeta', () => {
  it('başlığı ve vurgulanacak satırları çözer', () => {
    const meta = parseCodeMeta('title="src/site.config.ts" {2,4-6}')
    expect(meta.title).toBe('src/site.config.ts')
    expect([...meta.highlighted]).toEqual([2, 4, 5, 6])
  })

  it('üst veri yoksa boş döner', () => {
    expect(parseCodeMeta(undefined)).toEqual({ title: undefined, highlighted: new Set() })
  })
})
