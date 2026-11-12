import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ayniSiteMi, benzerlikAnahtari, geriyeMi, normalizeEt, ozelAdresMi, urlDerinligi } from '../asama1_url.js'
import { robotsAyristir } from '../asama2_robots.js'
import { anaIcerik, baglantilar, htmlAyristir, metaVeri, varlikCoz } from '../asama3_html.js'
import { markdownaCevir, sayfayiIsle } from '../asama4_markdown.js'

describe('URL', () => {
  test('normalizeEt: büyük harf, varsayılan port, ../, çapa', () => {
    assert.equal(normalizeEt('HTTP://Ornek.COM:80/a/../b?x=1#bolum'), 'http://ornek.com/b?x=1')
    assert.equal(normalizeEt('https://a.com/app#/ayarlar'), 'https://a.com/app#/ayarlar')
    assert.equal(normalizeEt('https://a.com/s?x=1', { ignoreQueryParameters: true }), 'https://a.com/s')
  })

  test('benzerlikAnahtari: aynı içeriğin farklı yazımları tek anahtara iner', () => {
    const ayni = [
      'http://www.a.com/blog/',
      'https://a.com/blog',
      'https://a.com/blog/index.html',
      'http://a.com/blog/index.php',
    ]
    assert.equal(new Set(ayni.map(benzerlikAnahtari)).size, 1)
    assert.notEqual(benzerlikAnahtari('https://a.com/blog?s=2'), benzerlikAnahtari('https://a.com/blog'))
    assert.notEqual(benzerlikAnahtari('https://a.com:8080/'), benzerlikAnahtari('https://a.com/'))
  })

  test('derinlik, site ve geriye tarama', () => {
    assert.equal(urlDerinligi('https://a.com/'), 0)
    assert.equal(urlDerinligi('https://a.com/a/b/index.html'), 2)
    const kok = new URL('https://www.a.com/blog')
    assert.ok(ayniSiteMi(kok, new URL('https://a.com/x')))
    assert.ok(!ayniSiteMi(kok, new URL('https://docs.a.com/x')))
    assert.ok(ayniSiteMi(kok, new URL('https://docs.a.com/x'), { allowSubdomains: true }))
    assert.ok(!ayniSiteMi(kok, new URL('https://a.com.evil.net/'), { allowSubdomains: true }))
    assert.ok(!geriyeMi(kok, new URL('https://a.com/blog/yazi')))
    assert.ok(geriyeMi(kok, new URL('https://a.com/hakkinda')))
    assert.ok(geriyeMi(kok, new URL('https://a.com/blogger')))
    assert.ok(!geriyeMi(new URL('https://a.com/'), new URL('https://a.com/her/sey')))
  })

  test('ozelAdresMi (SSRF)', () => {
    for (const host of [
      'localhost',
      'localhost.', // sondaki nokta: yine localhost
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '[::1]',
      new URL('http://[::ffff:127.0.0.1]/').hostname, // IPv6'ya gömülü IPv4, URL'de [::ffff:7f00:1]
    ]) {
      assert.ok(ozelAdresMi(host), host)
    }
    for (const host of ['8.8.8.8', '172.32.0.1', 'example.com', new URL('http://[::ffff:8.8.8.8]/').hostname]) {
      assert.ok(!ozelAdresMi(host), host)
    }
  })
})

describe('robots.txt', () => {
  const robots = robotsAyristir(`# yorum
User-agent: *
Disallow: /ozel
Allow: /ozel/acik
Disallow: /*.json$
Disallow:
Crawl-delay: 2

User-agent: GooglebotX
User-agent: MiniCrawl
Disallow: /yalniz-bize

Sitemap: https://a.com/harita.xml`)

  test('en uzun desen kazanır, eşitlikte Allow', () => {
    const ua = 'BaskaBot/1.0'
    assert.ok(!robots.izinliMi('https://a.com/ozel/x', ua))
    assert.ok(robots.izinliMi('https://a.com/ozel/acik/sayfa', ua))
    assert.ok(!robots.izinliMi('https://a.com/ozellik', ua)) // dikkat: '/ozel' öneki '/ozellik'i de kapsar
    assert.ok(robots.izinliMi('https://a.com/robots.txt', ua))
    const esit = robotsAyristir('User-agent: *\nDisallow: /a\nAllow: /a')
    assert.ok(esit.izinliMi('https://x.com/a', 'b'))
  })

  test('* ve $ jokerleri', () => {
    assert.ok(!robots.izinliMi('https://a.com/veri/x.json', 'b'))
    assert.ok(robots.izinliMi('https://a.com/veri/x.json?v=2', 'b'))
  })

  test('kendi ajanımızın grubu * grubunu ezer; gecikme ve site haritası', () => {
    const ua = 'MiniCrawl/0.1 (egitim)'
    assert.ok(robots.izinliMi('https://a.com/ozel/x', ua)) // bizim grupta /ozel yasak değil
    assert.ok(!robots.izinliMi('https://a.com/yalniz-bize', ua))
    assert.equal(robots.gecikme('BaskaBot'), 2)
    assert.equal(robots.gecikme(ua), null)
    assert.deepEqual(robots.siteHaritalari, ['https://a.com/harita.xml'])
    assert.ok(robotsAyristir('').izinliMi('https://a.com/her/sey', ua))
  })
})

describe('HTML -> Markdown', () => {
  const html = `<!DOCTYPE html><html lang="tr"><head><title>Deneme &amp; Test</title>
<meta name="description" content="Kısa açıklama"><meta property="og:title" content="OG Başlık">
<link rel="canonical" href="https://a.com/kanonik"><base href="https://a.com/dizin/">
<style>body{}</style><script>var x = "<p>yok</p>";</script></head>
<body><nav class="menu"><a href="/">Ana</a></nav>
<div class="cookie">Çerez uyarısı</div>
<div class="icerik"><h1>Başlık</h1><p>Birinci <b>kalın</b> &#305;&#x131; &copy;<p>İkinci <a href="alt?a=1#x">göreli</a>
<ul><li>bir<li>iki<ol><li>alt</li></ol></ul>
<pre><code class="language-js">if (a &lt; b) {
  dön()
}</code></pre>
<blockquote>Alıntı</blockquote>
<table><tr><th>Ad</th><th>Değer</th></tr><tr><td>x|y</td><td>1</td></tr></table>
<img src="/r.png" alt="resim"><a href="javascript:void(0)">js</a><a href="mailto:a@b.c">posta</a>
<a href="#/rota">rota</a></div>
<aside>Kenar çubuğu</aside><footer>Alt bilgi</footer></body></html>`
  const kok = htmlAyristir(html)

  test('varlıklar', () => {
    assert.equal(varlikCoz('&lt;a&gt; &amp;amp; &#305;&#x130; &bilinmeyen;'), '<a> &amp; ıİ &bilinmeyen;')
  })

  test('ana içerik: gezinme, çerez, kenar ve alt bilgi atılır', () => {
    const md = markdownaCevir(anaIcerik(kok), { tabanUrl: 'https://a.com/dizin/' })
    assert.ok(!/Ana|Çerez|Kenar|Alt bilgi|yok/.test(md), md)
    assert.match(
      md,
      /^# Başlık\n\nBirinci \*\*kalın\*\* ıı ©\n\nİkinci \[göreli\]\(https:\/\/a\.com\/dizin\/alt\?a=1#x\)/,
    )
    assert.ok(md.includes('- bir\n- iki\n  1. alt'), md)
    assert.ok(md.includes('```js\nif (a < b) {\n  dön()\n}\n```'), md)
    assert.ok(md.includes('> Alıntı'), md)
    assert.ok(md.includes('| Ad | Değer |\n| --- | --- |\n| x\\|y | 1 |'), md)
    assert.ok(md.includes('![resim](https://a.com/r.png)'), md)
  })

  test('<main> varsa doğrudan o alınır', () => {
    const md = sayfayiIsle(
      '<body><nav>Menü</nav><main><h2>Asıl</h2></main><p>dış</p></body>',
      'https://a.com/',
    ).markdown
    assert.equal(md, '## Asıl\n')
  })

  test('bağlantılar ve meta veriler', () => {
    assert.deepEqual(baglantilar(kok, 'https://a.com/dizin/sayfa'), [
      'https://a.com/',
      'https://a.com/dizin/alt?a=1',
      'https://a.com/dizin/#/rota',
    ])
    assert.deepEqual(metaVeri(kok), {
      title: 'Deneme & Test',
      language: 'tr',
      description: 'Kısa açıklama',
      og_title: 'OG Başlık',
      canonical: 'https://a.com/kanonik',
    })
  })
})
