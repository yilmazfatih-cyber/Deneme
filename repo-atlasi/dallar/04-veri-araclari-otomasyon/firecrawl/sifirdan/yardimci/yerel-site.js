// Testler için yerel web sitesi (internete çıkılmaz). Her isteği zamanıyla kaydeder.

import { createServer } from 'node:http'

/** @param {string} baslik @param {string} govde */
const sayfa = (baslik, govde) =>
  `<!DOCTYPE html><html lang="tr"><head><title>${baslik}</title>` +
  `<meta name="description" content="${baslik} açıklaması"></head><body>` +
  `<header><nav><a href="/">Ana sayfa</a> <a href="/hakkinda">Hakkında</a></nav></header>` +
  `${govde}<footer class="footer">Telif &copy; Örnek <a href="/iletisim">İletişim</a></footer></body></html>`

/**
 * @param {{ robots?: string, sayfalar?: Record<string, string>, yavasMs?: number }} [ayar]
 */
export function yerelSiteBaslat(ayar = {}) {
  /** @type {{ yol: string, zaman: number, ajan: string | undefined }[]} */
  const istekler = []
  /** @type {Record<string, string>} */
  const sayfalar = {
    '/': sayfa(
      'Ana Sayfa',
      `<main><h1>Hoş geldiniz</h1><p>Bu <strong>yerel</strong> bir deneme sitesidir.</p>
       <ul><li><a href="/blog/">Blog</a></li><li><a href="/blog/index.html">Blog (index)</a></li>
       <li><a href="/gizli/sayfa">Gizli</a></li><li><a href="/gizli/acik">Açık gizli</a></li>
       <li><a href="/dosya.pdf">PDF</a></li><li><a href="/resim.png">Resim</a></li>
       <li><a href="https://dis.example.com/sayfa">Dış site</a></li>
       <li><a href="/hakkinda#ekip">Ekip</a></li><li><a href="javascript:alert(1)">JS</a></li></ul></main>`,
    ),
    '/blog/': sayfa(
      'Blog',
      `<main><h1>Blog</h1><a href="yazi-1">Yazı 1</a> <a href="/blog/yazi-2/">Yazı 2</a>
       <a href="/blog/2024/10/derin-yazi">Derin</a></main>`,
    ),
    '/blog/yazi-1': sayfa('Yazı 1', '<main><h1>Birinci yazı</h1><p>İçerik.</p></main>'),
    '/blog/yazi-2': sayfa('Yazı 2', '<main><h1>İkinci yazı</h1><a href="/blog/yazi-1">geri</a></main>'),
    '/blog/2024/10/derin-yazi': sayfa('Derin', '<main><h1>Derin yazı</h1></main>'),
    '/hakkinda': sayfa('Hakkında', '<main><h1>Hakkında</h1><p>Biz kimiz?</p></main>'),
    '/iletisim': sayfa('İletişim', '<main><h1>İletişim</h1></main>'),
    '/gizli/sayfa': sayfa('Gizli', '<main><h1>Bunu görmemelisin</h1></main>'),
    '/gizli/acik': sayfa('Açık', '<main><h1>Robots buna izin veriyor</h1></main>'),
    '/harita-sayfasi': sayfa('Harita', '<main><h1>Yalnızca site haritasında</h1></main>'),
    ...ayar.sayfalar,
  }
  const robots =
    ayar.robots ??
    'User-agent: *\nDisallow: /gizli\nAllow: /gizli/acik\n\nUser-agent: KotuBot\nDisallow: /\n\nSitemap: /sitemap.xml\n'

  const sunucu = createServer((istek, yanit) => {
    const yol = new URL(istek.url ?? '/', 'http://yerel').pathname
    istekler.push({ yol, zaman: Date.now(), ajan: istek.headers['user-agent'] })
    const gonder = (/** @type {number} */ kod, /** @type {string} */ tur, /** @type {string} */ govde) => {
      yanit.writeHead(kod, { 'content-type': tur })
      yanit.end(govde)
    }
    if (yol === '/robots.txt') return gonder(200, 'text/plain', robots)
    if (yol === '/sitemap.xml') {
      const taban = `http://${istek.headers.host}`
      return gonder(200, 'application/xml', `<urlset><url><loc>${taban}/harita-sayfasi</loc></url></urlset>`)
    }
    if (yol === '/dosya.pdf') return gonder(200, 'application/pdf', '%PDF-1.4')
    if (yol === '/eski-hakkinda') {
      yanit.writeHead(301, { location: '/hakkinda' }) // taşınmış sayfa: kalıcı yönlendirme
      return yanit.end()
    }
    const html = sayfalar[yol] ?? sayfalar[yol.replace(/\/$/, '')]
    const yaz = () =>
      html
        ? gonder(200, 'text/html; charset=utf-8', html)
        : gonder(404, 'text/html', sayfa('Yok', '<main><h1>404</h1></main>'))
    if (ayar.yavasMs) setTimeout(yaz, ayar.yavasMs)
    else yaz()
  })
  return new Promise((coz) => {
    sunucu.listen(0, '127.0.0.1', () => {
      const adres = /** @type {import('node:net').AddressInfo} */ (sunucu.address())
      coz({ taban: `http://127.0.0.1:${adres.port}`, istekler, kapat: () => new Promise((k) => sunucu.close(k)) })
    })
  })
}
