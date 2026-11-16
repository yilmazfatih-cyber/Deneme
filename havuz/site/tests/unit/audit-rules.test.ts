import { describe, expect, it } from 'vitest'
import { parseHtml } from '../../src/integrations/html.ts'
import { pageRules, type PageContext } from '../../scripts/audit/rules.ts'
import { classify, collectReferences } from '../../scripts/audit/links.ts'
import { measurePage, staticImports } from '../../scripts/audit/budget.ts'

const SITE = 'https://sedir.example'

/** Bütün kurallardan geçen bir sayfa; testler bir parçasını bozar. */
function page(overrides: { head?: string; body?: string; lang?: string; url?: string } = {}): PageContext {
  const url = overrides.url ?? '/blog/yazi/'
  const head =
    overrides.head ??
    `<title>Yazı — Sedir</title><meta name="description" content="${'a'.repeat(80)}"><link rel="canonical" href="${SITE}${url}">
     <meta property="og:title" content="Yazı"><meta property="og:description" content="x"><meta property="og:image" content="${SITE}/og/blog/yazi.png">
     <meta property="og:url" content="${SITE}${url}"><meta property="og:type" content="article"><meta property="og:site_name" content="Sedir"><meta name="twitter:card" content="summary_large_image">`
  const body = overrides.body ?? '<h1>Yazı</h1><img src="/a.png" alt="" width="10" height="10">'
  const document = parseHtml(
    `<!doctype html><html lang="${overrides.lang ?? 'tr'}"><head>${head}</head><body>${body}</body></html>`,
  )
  return { file: 'blog/yazi/index.html', url, document, bytes: 1000, site: SITE, base: '/', expectedLang: 'tr' }
}

const run = (context: PageContext) => pageRules.flatMap((rule) => rule(context))
const rulesOf = (context: PageContext) => run(context).map((issue) => issue.rule)

describe('sayfa kuralları', () => {
  it('kusursuz sayfada sorun bulmaz', () => {
    expect(run(page())).toEqual([])
  })

  it('h1 eksikliğini ve fazlalığını yakalar', () => {
    expect(rulesOf(page({ body: '<p>x</p>' }))).toEqual(['tek-h1'])
    expect(rulesOf(page({ body: '<h1>a</h1><h1>b</h1>' }))).toEqual(['tek-h1'])
  })

  it('yanlış dili yakalar', () => {
    expect(rulesOf(page({ lang: 'en' }))).toEqual(['lang'])
  })

  it('kısa açıklamayı, eksik canonical ve OG etiketlerini yakalar', () => {
    const issues = run(page({ head: '<title>Başlık uzun</title><meta name="description" content="kısa">' }))
    const rules = issues.map((issue) => issue.rule)
    expect(rules).toContain('aciklama')
    expect(rules).toContain('canonical')
    expect(rules.filter((rule) => rule === 'open-graph').length).toBe(7)
    expect(issues.find((issue) => issue.rule === 'aciklama')?.message).toMatch(/4 karakter; 50–160 arası/u)
  })

  it('görselde alt metni ve boyutu ister', () => {
    expect(rulesOf(page({ body: '<h1>x</h1><img src="/a.png">' }))).toEqual(['gorsel-alt', 'gorsel-boyut'])
  })

  it('yinelenen id değerini bulur', () => {
    expect(rulesOf(page({ body: '<h1 id="a">x</h1><p id="a"></p>' }))).toEqual(['yinelenen-id'])
  })

  it('bozuk ve eksik JSON-LD yapısını bildirir', () => {
    const broken = page({ body: '<h1>x</h1><script type="application/ld+json">{"@type": </script>' })
    expect(run(broken)[0]?.message).toMatch(/geçerli JSON değil/u)
    const incomplete = page({
      body: '<h1>x</h1><script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"x"}</script>',
    })
    expect(run(incomplete).map((issue) => issue.message)).toEqual([
      'BlogPosting içinde "datePublished" eksik.',
      'BlogPosting içinde "image" eksik.',
      'BlogPosting içinde "author" eksik.',
      'BlogPosting içinde "url" eksik.',
    ])
  })
})

describe('bağlantı sınıflandırma', () => {
  const context = { site: SITE, base: '/depo/', pageUrl: '/depo/blog/' }

  it('dış adresleri ve özel şemaları atlar', () => {
    for (const value of [
      'https://example.com/x',
      'mailto:a@b.co',
      'tel:+90',
      'data:image/png;base64,xx',
      '//cdn.example.com/a.js',
    ]) {
      expect(classify(value, context)).toEqual({ type: 'skip' })
    }
  })

  it('iç adresleri yol ve çapa olarak çözer', () => {
    expect(classify('/depo/belgeler/#kurulum', context)).toEqual({
      type: 'internal',
      path: '/depo/belgeler/',
      hash: 'kurulum',
    })
    expect(classify('#icerik', context)).toEqual({ type: 'internal', path: '/depo/blog/', hash: 'icerik' })
    expect(classify(`${SITE}/depo/rss.xml`, context)).toEqual({ type: 'internal', path: '/depo/rss.xml', hash: '' })
  })

  it('alt klasörsüz, göreli, sonu "/" ile bitmeyen ve javascript: adresleri hata sayar', () => {
    expect(classify('/blog/', context)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/alt klasörle/u),
    })
    expect(classify('yazi/', context)).toMatchObject({ type: 'error', message: expect.stringMatching(/Göreli adres/u) })
    expect(classify('/depo/blog', context)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/"\/" ile bitmeli/u),
    })
    expect(classify('javascript:void(0)', context)).toMatchObject({ type: 'error' })
  })

  it('sayfadaki bütün başvuruları toplar (srcset ve og:image dâhil)', () => {
    const document = parseHtml(
      '<head><meta property="og:image" content="https://s/og.png"><link rel="stylesheet" href="/a.css"></head><body><a href="/x/">x</a><img src="/1.png" srcset="/1.png 1x, /2.png 2x" alt=""></body>',
    )
    expect(collectReferences(document).map((reference) => reference.value)).toEqual([
      'https://s/og.png',
      '/a.css',
      '/x/',
      '/1.png',
      '/1.png',
      '/2.png',
    ])
  })
})

describe('ağırlık bütçesi', () => {
  it('durağan içe aktarmaları bulur, dinamikleri saymaz', () => {
    const code =
      'import{a as b}from"./ortak.js";import"./yan.js";export*from"./c.js";const x=import("./arama.js");a.import("x")'
    expect(staticImports(code)).toEqual(['./ortak.js', './yan.js', './c.js'])
  })

  it('sayfanın CSS ve başlangıç JS ağırlığını ölçer; JSON-LD ve dinamik parçaları katmaz', () => {
    const files: Record<string, string> = {
      '/a.css': 'x'.repeat(100),
      '/_astro/sayfa.js': 'import"./ortak.js";const s=import("./arama.js")',
      '/_astro/ortak.js': 'y'.repeat(50),
      '/_astro/arama.js': 'z'.repeat(5000),
    }
    const document = parseHtml(
      '<head><link rel="stylesheet" href="/a.css"><style>abc</style><script type="application/ld+json">{"a":1}</script></head><body><script type="module" src="/_astro/sayfa.js"></script><script>1+1</script></body>',
    )
    const weight = measurePage(document, 500, { read: (file) => files[file] }, (value) =>
      value.startsWith('/') ? value : undefined,
    )
    expect(weight).toEqual({
      html: 500,
      css: 103,
      js: 'import"./ortak.js";const s=import("./arama.js")'.length + 50 + 3,
    })
  })
})
