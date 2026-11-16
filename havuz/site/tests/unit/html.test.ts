import { describe, expect, it } from 'vitest'
import { attr, findAll, meta, pagePathOf, parseHtml, textContent } from '../../src/integrations/html.ts'

const html = `<!doctype html><html lang="tr"><head><meta name="description" content="Açıklama"><meta property="og:title" content="Başlık"></head>
<body><main data-search-section="Blog"><h1>Başlık</h1><nav data-search-ignore>Menü</nav><p>Bir <strong>iki</strong></p><template><p>şablon</p></template></main></body></html>`

describe('HTML yardımcıları', () => {
  const document = parseHtml(html)

  it('meta etiketlerini name ya da property ile okur', () => {
    expect(meta(document, 'description')).toBe('Açıklama')
    expect(meta(document, 'og:title')).toBe('Başlık')
    expect(meta(document, 'yok')).toBeUndefined()
  })

  it('metni öğeler arasına boşluk koyarak çıkarır ve istenen öğeleri atlar', () => {
    const main = findAll(document, (element) => element.tagName === 'main')[0]
    expect(main && attr(main, 'data-search-section')).toBe('Blog')
    const text = main ? textContent(main, (element) => attr(element, 'data-search-ignore') !== undefined) : ''
    // <template> içeriği çizilmediği için metne girmez.
    expect(text).toBe('Başlık Bir iki')
  })

  it('dist dosyasını yayın yoluna çevirir', () => {
    expect(pagePathOf('index.html')).toBe('/')
    expect(pagePathOf('blog/yazi/index.html')).toBe('/blog/yazi/')
    expect(pagePathOf('404.html')).toBe('/404.html')
  })
})
