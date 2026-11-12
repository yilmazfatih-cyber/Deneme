import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { RED, Tarayici } from '../asama5_tarayici.js'
import { apiSunucusu } from '../asama6_api.js'
import { yerelSiteBaslat } from '../yardimci/yerel-site.js'

/** @type {{ taban: string, istekler: { yol: string, zaman: number, ajan?: string }[], kapat: () => Promise<void> }} */
let site
before(async () => {
  site = await yerelSiteBaslat()
})
after(() => site.kapat())

const yol = (/** @type {string} */ url) => new URL(url).pathname
const tara = (/** @type {string} */ adres, /** @type {object} */ secenek = {}) =>
  new Tarayici(site.taban + adres, { allowPrivateNetwork: true, concurrency: 1, ...secenek }).calistir()

describe('Tarayıcı', () => {
  test('BFS sırası, robots, tekrar, dış bağlantı ve dosya süzgeçleri', async () => {
    const once = site.istekler.length
    const sonuc = await tara('/')
    const yollar = sonuc.belgeler.map((b) => yol(b.metadata.sourceURL))
    assert.deepEqual(yollar, [
      '/',
      '/harita-sayfasi', // site haritasından
      '/hakkinda',
      '/blog/',
      '/gizli/acik', // Allow, Disallow'dan uzun: izinli
      '/iletisim',
      '/blog/yazi-1',
      '/blog/yazi-2/',
      '/blog/2024/10/derin-yazi',
    ])
    const istenen = site.istekler.slice(once).map((i) => i.yol)
    assert.ok(!istenen.includes('/gizli/sayfa'), 'robots ile yasaklı sayfa istenmemeli')
    assert.ok(!istenen.includes('/blog/index.html'), '/blog/ ile aynı sayılmalı')
    assert.ok(!istenen.includes('/resim.png'))
    assert.equal(sonuc.reddedilenler[`${site.taban}/gizli/sayfa`], RED.ROBOTS)
    assert.equal(sonuc.reddedilenler['https://dis.example.com/sayfa'], RED.DIS)
    assert.equal(sonuc.reddedilenler[`${site.taban}/resim.png`], RED.DOSYA)
    assert.deepEqual(sonuc.robotsEngelledi, [`${site.taban}/gizli/sayfa`])
    assert.match(sonuc.hatalar[0].error, /HTML değil: application\/pdf/)
    assert.ok(
      site.istekler.slice(once).every((i) => i.ajan?.startsWith('MiniCrawl/')),
      'dürüst User-Agent',
    )
  })

  test('ana içerik ve meta veri', async () => {
    const { belgeler } = await tara('/', { limit: 1 })
    assert.equal(belgeler.length, 1)
    const [ana] = belgeler
    assert.equal(ana.metadata.title, 'Ana Sayfa')
    assert.equal(ana.metadata.language, 'tr')
    assert.equal(ana.metadata.statusCode, 200)
    assert.ok(ana.markdown.startsWith('# Hoş geldiniz\n\nBu **yerel** bir deneme sitesidir.'), ana.markdown)
    assert.ok(!ana.markdown.includes('Telif'), 'footer atılmalı')
    assert.ok(ana.links.includes(`${site.taban}/iletisim`), 'bağlantılar tüm sayfadan toplanır')
  })

  test('limit, keşif derinliği ve yol derinliği', async () => {
    assert.equal((await tara('/', { limit: 3 })).belgeler.length, 3)
    const sig = await tara('/', { maxDiscoveryDepth: 1, sitemap: 'skip' })
    assert.ok(sig.belgeler.every((b) => !b.metadata.sourceURL.includes('yazi')))
    assert.equal(sig.reddedilenler[`${site.taban}/blog/yazi-1`], RED.KESIF)
    const yolSiniri = await tara('/', { maxDepth: 2 })
    assert.equal(yolSiniri.reddedilenler[`${site.taban}/blog/2024/10/derin-yazi`], RED.DERINLIK)
  })

  test('geriye tarama varsayılan olarak kapalı', async () => {
    const blog = await tara('/blog/', { sitemap: 'skip' })
    assert.ok(blog.belgeler.every((b) => yol(b.metadata.sourceURL).startsWith('/blog/')))
    assert.equal(blog.reddedilenler[`${site.taban}/hakkinda`], RED.GERIYE)
    const tum = await tara('/blog/', { sitemap: 'skip', allowBackwardCrawling: true })
    assert.ok(tum.belgeler.some((b) => yol(b.metadata.sourceURL) === '/hakkinda'))
  })

  test('nezaket: istekler arasında en az delay kadar süre (eş zamanlı işçilerle bile)', async () => {
    const once = site.istekler.length
    await tara('/', { limit: 4, delay: 0.15, concurrency: 3, sitemap: 'skip' })
    const sayfalar = site.istekler.slice(once).filter((i) => i.yol !== '/robots.txt')
    assert.equal(sayfalar.length, 4)
    for (let i = 1; i < sayfalar.length; i++) {
      assert.ok(
        sayfalar[i].zaman - sayfalar[i - 1].zaman >= 140,
        `aralık ${sayfalar[i].zaman - sayfalar[i - 1].zaman} ms`,
      )
    }
  })

  test("robots.txt Crawl-delay'e uyulur", async () => {
    const yavas = await yerelSiteBaslat({ robots: 'User-agent: *\nCrawl-delay: 0.2\n' })
    try {
      const once = yavas.istekler.length
      await new Tarayici(`${yavas.taban}/`, { allowPrivateNetwork: true, limit: 3, sitemap: 'skip' }).calistir()
      const sayfalar = yavas.istekler.slice(once).filter((i) => i.yol !== '/robots.txt')
      assert.equal(sayfalar.length, 3)
      assert.ok(sayfalar[2].zaman - sayfalar[0].zaman >= 380)
    } finally {
      await yavas.kapat()
    }
  })

  test('SSRF koruması ve iptal', async () => {
    await assert.rejects(new Tarayici(`${site.taban}/`).calistir(), /SSRF/)
    const yavas = await yerelSiteBaslat({ yavasMs: 300 })
    try {
      const iptal = new AbortController()
      const tarayici = new Tarayici(`${yavas.taban}/`, { allowPrivateNetwork: true, signal: iptal.signal })
      setTimeout(() => iptal.abort(), 100)
      const baslangic = Date.now()
      const sonuc = await tarayici.calistir()
      assert.ok(Date.now() - baslangic < 1000)
      assert.ok(sonuc.belgeler.length <= 1)
    } finally {
      await yavas.kapat()
    }
  })
})

describe('İş API’si', () => {
  /** @type {import('node:http').Server} */
  let sunucu
  let api = ''
  before(async () => {
    sunucu = apiSunucusu({ yerelAgIzni: true, tarayiciEk: { concurrency: 1 } }).sunucu
    await new Promise((hazir) => sunucu.listen(0, '127.0.0.1', () => hazir(undefined)))
    api = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (sunucu.address()).port}`
  })
  after(() => new Promise((bitti) => sunucu.close(() => bitti(undefined))))

  const istek = async (/** @type {string} */ yontem, /** @type {string} */ adres, /** @type {unknown} */ govde) => {
    const cevap = await fetch(api + adres, {
      method: yontem,
      headers: { 'content-type': 'application/json' },
      body: govde === undefined ? undefined : typeof govde === 'string' ? govde : JSON.stringify(govde),
    })
    return { durum: cevap.status, veri: await cevap.json() }
  }

  /** @param {string} id */
  const bitmesiniBekle = async (id) => {
    for (let i = 0; i < 100; i++) {
      const { veri } = await istek('GET', `/v2/crawl/${id}`)
      if (veri.status !== 'scraping') return veri
      await new Promise((r) => setTimeout(r, 30))
    }
    throw new Error('iş bitmedi')
  }

  test('POST /v2/crawl -> id; GET ile durum ve veriler', async () => {
    const { durum, veri } = await istek('POST', '/v2/crawl', { url: `${site.taban}/`, limit: 5 })
    assert.equal(durum, 200)
    assert.equal(veri.success, true)
    assert.match(veri.url, new RegExp(`/v2/crawl/${veri.id}$`))
    const sonuc = await bitmesiniBekle(veri.id)
    assert.equal(sonuc.status, 'completed')
    assert.equal(sonuc.completed, 5)
    assert.equal(sonuc.data.length, 5)
    assert.ok(sonuc.data[0].markdown.includes('# Hoş geldiniz'))
    const hatalar = await istek('GET', `/v2/crawl/${veri.id}/errors`)
    assert.deepEqual(hatalar.veri.robotsBlocked, [`${site.taban}/gizli/sayfa`])
    assert.equal((await istek('DELETE', `/v2/crawl/${veri.id}`)).durum, 409)
  })

  test('POST /v2/scrape tek sayfa', async () => {
    const { durum, veri } = await istek('POST', '/v2/scrape', { url: `${site.taban}/hakkinda`, formats: ['links'] })
    assert.equal(durum, 200)
    assert.equal(veri.data.markdown, '# Hakkında\n\nBiz kimiz?\n')
    assert.equal(veri.data.metadata.title, 'Hakkında')
    assert.ok(veri.data.links.length > 0)
  })

  test('iptal: DELETE /v2/crawl/:id', async () => {
    const yavas = await yerelSiteBaslat({ yavasMs: 200 })
    try {
      const { veri } = await istek('POST', '/v2/crawl', { url: `${yavas.taban}/`, limit: 20, delay: 1 })
      await new Promise((r) => setTimeout(r, 100))
      assert.deepEqual((await istek('DELETE', `/v2/crawl/${veri.id}`)).veri, { status: 'cancelled' })
      const durum = await istek('GET', `/v2/crawl/${veri.id}`)
      assert.equal(durum.veri.status, 'cancelled')
    } finally {
      await yavas.kapat()
    }
  })

  test('doğrulama hataları ve SSRF', async () => {
    assert.equal((await istek('POST', '/v2/crawl', { url: 'ftp://a.com' })).durum, 400)
    assert.equal((await istek('POST', '/v2/crawl', '{bozuk')).durum, 400)
    assert.equal((await istek('POST', '/v2/crawl', { url: `${site.taban}/`, limit: -1 })).durum, 400)
    assert.equal((await istek('GET', '/v2/crawl/olmayan-id')).durum, 404)
    const korumali = apiSunucusu().sunucu
    await new Promise((hazir) => korumali.listen(0, '127.0.0.1', () => hazir(undefined)))
    try {
      const port = /** @type {import('node:net').AddressInfo} */ (korumali.address()).port
      const cevap = await fetch(`http://127.0.0.1:${port}/v2/crawl`, {
        method: 'POST',
        body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data' }),
      })
      assert.equal(cevap.status, 403)
    } finally {
      await new Promise((bitti) => korumali.close(() => bitti(undefined)))
    }
  })
})
