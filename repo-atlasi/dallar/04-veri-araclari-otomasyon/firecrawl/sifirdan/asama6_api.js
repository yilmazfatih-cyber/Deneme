// Aşama 6 — iş API'si: POST /v2/crawl -> id, GET /v2/crawl/:id -> durum + veriler.
//
// Firecrawl'da API (Express, apps/api/src/routes/v2.ts) ile işçiler ayrı süreçlerdir.
// Ana kazıma işleri Postgres tablosu üzerinde çalışan kendi kuyrukları NuQ'ya gider
// (services/worker/nuq.ts: 'FOR UPDATE SKIP LOCKED' ile iş kapma, RabbitMQ ile bildirim);
// tarama durumu Redis'te tutulur (lib/crawl-redis.ts). Yan kuyruklar hâlâ BullMQ.
// Biz hepsini tek süreçte, bellek içi bir kuyrukla taklit ediyoruz: API isteği
// hemen bir kimlik döner, iş arka planda yürür, istemci durumu sorgular (polling).

import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { ozelAdresMi } from './asama1_url.js'
import { sayfayiIsle } from './asama4_markdown.js'
import { guvenliGetir, KULLANICI_AJANI, Tarayici } from './asama5_tarayici.js'

/** @typedef {'scraping' | 'completed' | 'failed' | 'cancelled'} IsDurumu */

export class IsKuyrugu {
  /** @param {{ esZamanli?: number, saklamaMs?: number }} [secenekler] */
  constructor({ esZamanli = 2, saklamaMs = 24 * 60 * 60 * 1000 } = {}) {
    this.esZamanli = esZamanli
    this.saklamaMs = saklamaMs // Firecrawl'da tarama sonuçları 24 saat saklanır (Redis EXPIRE)
    /** @type {Map<string, any>} */
    this.isler = new Map()
    /** @type {{ is: any, calistir: (is: any) => Promise<unknown> }[]} */
    this.bekleyen = []
    this.calisan = 0
  }

  /** @param {(is: any) => Promise<unknown>} calistir @param {Record<string, unknown>} [ek] */
  ekle(calistir, ek = {}) {
    const is = {
      id: randomUUID(),
      durum: /** @type {IsDurumu} */ ('scraping'),
      kuyrukta: true,
      olusturma: Date.now(),
      bitis: /** @type {number | null} */ (null),
      sonuc: /** @type {unknown} */ (null),
      hata: /** @type {string | null} */ (null),
      iptal: new AbortController(),
      ...ek,
    }
    this.isler.set(is.id, is)
    this.bekleyen.push({ is, calistir })
    this.pompala()
    return is
  }

  pompala() {
    while (this.calisan < this.esZamanli && this.bekleyen.length) {
      const { is, calistir } = /** @type {{ is: any, calistir: (is: any) => Promise<unknown> }} */ (
        this.bekleyen.shift()
      )
      if (is.durum === 'cancelled') continue
      this.calisan++
      is.kuyrukta = false
      Promise.resolve()
        .then(() => calistir(is))
        .then(
          (sonuc) => {
            if (is.durum !== 'cancelled') Object.assign(is, { durum: 'completed', sonuc })
          },
          (hata) => {
            if (is.durum !== 'cancelled') Object.assign(is, { durum: 'failed', hata: String(hata?.message ?? hata) })
          },
        )
        .finally(() => {
          is.bitis = Date.now()
          this.calisan--
          this.pompala()
        })
    }
  }

  /** @param {string} id */
  al(id) {
    return this.isler.get(id) ?? null
  }

  /** @param {string} id */
  iptalEt(id) {
    const is = this.al(id)
    if (!is || is.durum !== 'scraping') return is
    is.durum = 'cancelled'
    is.iptal.abort()
    return is
  }
}

class IstemciHatasi extends Error {
  /** @param {number} durum @param {string} mesaj */
  constructor(durum, mesaj) {
    super(mesaj)
    this.durum = durum
  }
}

/** @param {import('node:http').IncomingMessage} istek @param {number} sinir */
async function govdeOku(istek, sinir) {
  const parcalar = []
  let boyut = 0
  for await (const parca of istek) {
    boyut += parca.length
    if (boyut > sinir) throw new IstemciHatasi(413, 'İstek gövdesi çok büyük')
    parcalar.push(parca)
  }
  try {
    return JSON.parse(Buffer.concat(parcalar).toString('utf8') || '{}')
  } catch {
    throw new IstemciHatasi(400, 'Geçersiz JSON')
  }
}

/** @param {unknown} url @param {boolean} yerelAgIzni */
function urlDogrula(url, yerelAgIzni) {
  if (typeof url !== 'string') throw new IstemciHatasi(400, '"url" alanı zorunlu')
  let u
  try {
    u = new URL(url)
  } catch {
    throw new IstemciHatasi(400, `Geçersiz URL: ${url}`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new IstemciHatasi(400, 'Yalnızca http/https')
  if (!yerelAgIzni && ozelAdresMi(u.hostname)) throw new IstemciHatasi(403, 'Özel ağ adreslerine izin yok (SSRF)')
  return u.href
}

/**
 * Tek sayfa kazıma: `POST /v2/scrape` ve `node cli.js kazi` bu işlevi paylaşır. Adres de yönlendirme hedefleri de
 * `urlDogrula`dan geçer. robots.txt'ye bakılmaz; ona tarayıcı (`Tarayici`) bakar.
 * @param {unknown} url
 * @param {{ yerelAgIzni?: boolean, onlyMainContent?: boolean, fetch?: typeof fetch }} [secenekler]
 */
export async function tekSayfaKazi(url, { yerelAgIzni = false, onlyMainContent = true, fetch } = {}) {
  const kaynak = urlDogrula(url, yerelAgIzni)
  const cevap = await guvenliGetir(kaynak, (adres) => urlDogrula(adres.href, yerelAgIzni), {
    fetch,
    headers: { 'user-agent': KULLANICI_AJANI },
    signal: AbortSignal.timeout(15000),
  })
  const sayfa = sayfayiIsle(await cevap.text(), cevap.url || kaynak, { onlyMainContent })
  return { url: kaynak, statusCode: cevap.status, sayfa }
}

/** @param {Record<string, unknown>} govde */
function taramaSecenekleri(govde) {
  const sayi = (/** @type {string} */ ad, /** @type {number} */ en, /** @type {number} */ varsayilan) => {
    const deger = govde[ad] ?? varsayilan
    if (typeof deger !== 'number' || !Number.isInteger(deger) || deger < 0 || deger > en) {
      throw new IstemciHatasi(400, `"${ad}" 0 ile ${en} arasında tam sayı olmalı`)
    }
    return deger
  }
  const dizi = (/** @type {string} */ ad) => {
    const deger = govde[ad] ?? []
    if (!Array.isArray(deger) || !deger.every((x) => typeof x === 'string')) {
      throw new IstemciHatasi(400, `"${ad}" metin dizisi olmalı`)
    }
    return deger
  }
  const gecikme = govde.delay ?? 0
  if (typeof gecikme !== 'number' || gecikme < 0 || gecikme > 60) {
    throw new IstemciHatasi(400, '"delay" 0-60 saniye olmalı') // Firecrawl'daki sınırla aynı
  }
  return {
    limit: sayi('limit', 10000, 50),
    maxDepth: sayi('maxDepth', 100, 10),
    maxDiscoveryDepth: govde.maxDiscoveryDepth === undefined ? Infinity : sayi('maxDiscoveryDepth', 100, 0),
    includePaths: dizi('includePaths'),
    excludePaths: dizi('excludePaths'),
    allowBackwardCrawling: govde.allowBackwardCrawling === true || govde.crawlEntireDomain === true,
    allowSubdomains: govde.allowSubdomains === true,
    ignoreRobotsTxt: govde.ignoreRobotsTxt === true,
    sitemap: ['include', 'skip', 'only'].includes(/** @type {string} */ (govde.sitemap)) ? govde.sitemap : 'include',
    delay: gecikme,
  }
}

/**
 * @param {{ kuyruk?: IsKuyrugu, yerelAgIzni?: boolean, govdeSiniri?: number, tarayiciEk?: object }} [ayarlar]
 *   yerelAgIzni: yalnızca testlerde ve kendi ağınızda true yapın.
 */
export function apiSunucusu(ayarlar = {}) {
  const kuyruk = ayarlar.kuyruk ?? new IsKuyrugu()
  const yerelAgIzni = ayarlar.yerelAgIzni ?? false
  const govdeSiniri = ayarlar.govdeSiniri ?? 1_000_000

  /** @param {import('node:http').ServerResponse} yanit @param {number} durum @param {unknown} veri */
  const json = (yanit, durum, veri) => {
    const metin = JSON.stringify(veri)
    yanit.writeHead(durum, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(metin),
    })
    yanit.end(metin)
  }

  const sunucu = createServer(async (istek, yanit) => {
    try {
      const adres = new URL(istek.url ?? '/', 'http://yerel')
      const [surum, kaynak, id, alt] = adres.pathname.split('/').filter(Boolean)
      if (surum !== 'v2') throw new IstemciHatasi(404, 'Bulunamadı')

      if (istek.method === 'POST' && kaynak === 'scrape' && !id) {
        const govde = await govdeOku(istek, govdeSiniri)
        const { url, statusCode, sayfa } = await tekSayfaKazi(govde.url, {
          yerelAgIzni,
          onlyMainContent: govde.onlyMainContent !== false,
        })
        const veri = { markdown: sayfa.markdown, metadata: { ...sayfa.metadata, sourceURL: url, statusCode } }
        return json(yanit, 200, {
          success: true,
          data:
            Array.isArray(govde.formats) && govde.formats.includes('links') ? { ...veri, links: sayfa.links } : veri,
        })
      }

      if (istek.method === 'POST' && kaynak === 'crawl' && !id) {
        const govde = await govdeOku(istek, govdeSiniri)
        const url = urlDogrula(govde.url, yerelAgIzni)
        const secenekler = taramaSecenekleri(govde)
        const is = kuyruk.ekle(async (/** @type {any} */ is) => {
          is.tarayici = new Tarayici(url, {
            ...secenekler,
            ...ayarlar.tarayiciEk,
            allowPrivateNetwork: yerelAgIzni,
            signal: is.iptal.signal,
          })
          return is.tarayici.calistir()
        })
        const taban = `http://${istek.headers.host ?? 'localhost'}`
        return json(yanit, 200, { success: true, id: is.id, url: `${taban}/v2/crawl/${is.id}` })
      }

      if (kaynak === 'crawl' && id) {
        const is = kuyruk.al(id)
        if (!is) throw new IstemciHatasi(404, 'Job not found')
        const tarayici = is.tarayici
        if (istek.method === 'DELETE' && !alt) {
          if (is.durum !== 'scraping') throw new IstemciHatasi(409, 'Crawl is already completed')
          kuyruk.iptalEt(id)
          return json(yanit, 200, { status: 'cancelled' })
        }
        if (istek.method === 'GET' && alt === 'errors') {
          return json(yanit, 200, { errors: tarayici?.hatalar ?? [], robotsBlocked: tarayici?.robotsEngelledi ?? [] })
        }
        if (istek.method === 'GET' && !alt) {
          return json(yanit, 200, {
            success: true,
            status: is.durum,
            total: tarayici?.gorulen.size ?? 0,
            completed: tarayici?.belgeler.length ?? 0,
            expiresAt: new Date(is.olusturma + kuyruk.saklamaMs).toISOString(),
            next: null,
            data: tarayici?.belgeler ?? [],
            ...(is.hata ? { error: is.hata } : {}),
          })
        }
      }
      throw new IstemciHatasi(404, 'Bulunamadı')
    } catch (hata) {
      const durum = hata instanceof IstemciHatasi ? hata.durum : 500
      const mesaj = hata instanceof Error ? hata.message : String(hata)
      json(yanit, durum, { success: false, error: mesaj })
    }
  })
  return { sunucu, kuyruk }
}
