// Aşama 5 — tarayıcı (crawler): sınır kuyruğu (frontier), süzgeçler, nezaket, robots.
//
// Firecrawl'da tarama TEK bir döngü değildir: her sayfa kuyrukta ayrı bir iştir.
// Bir sayfa kazındığında işçi bağlantıları çıkarır (extractLinksFromContent), süzer
// (filterLinks), Redis'te kilitler (lockURL = SADD crawl:<id>:visited) ve yeni işler
// ekler (services/worker/scrape-worker.ts). Biz aynı adımları tek süreçte, bir
// dizi kuyruk + işçi havuzu ile yapıyoruz; mantık aynı, ölçek değil.

import { setTimeout as bekle } from 'node:timers/promises'
import {
  ayniSiteMi,
  benzerlikAnahtari,
  dosyaMi,
  geriyeMi,
  normalizeEt,
  ozelAdresMi,
  urlDerinligi,
} from './asama1_url.js'
import { robotsAyristir } from './asama2_robots.js'
import { sayfayiIsle } from './asama4_markdown.js'

export const KULLANICI_AJANI = 'MiniCrawl/0.1 (egitim amacli; +https://github.com/firecrawl/firecrawl)'

/** Firecrawl'daki DenialReason'ın karşılığı: neden reddedildiğini SÖYLE (kullanıcı ayarı düzeltebilsin). */
export const RED = {
  OZEL_AG: 'Özel/yerel ağ adresi (SSRF koruması; allowPrivateNetwork kapalı)',
  DIS: 'Başka bir siteye ait (yalnızca aynı site taranır)',
  KESIF: 'Bağlantı adımı maxDiscoveryDepth sınırını aşıyor',
  DERINLIK: 'Yol derinliği maxDepth sınırını aşıyor',
  GERIYE: 'Başlangıç yolunun dışında (allowBackwardCrawling kapalı)',
  DOSYA: 'HTML olmayan dosya uzantısı',
  DAHIL: 'includePaths desenlerinden hiçbirine uymuyor',
  HARIC: 'excludePaths desenlerinden birine uyuyor',
  ROBOTS: 'robots.txt bu yolu yasaklıyor (ignoreRobotsTxt kapalı)',
  SINIR: 'limit doldu',
}

const VARSAYILAN = {
  limit: 50,
  maxDepth: 10,
  maxDiscoveryDepth: Infinity,
  includePaths: [],
  excludePaths: [],
  allowBackwardCrawling: false,
  allowSubdomains: false,
  ignoreRobotsTxt: false,
  ignoreQueryParameters: false,
  deduplicateSimilarURLs: true,
  sitemap: 'include',
  delay: 0,
  concurrency: 4,
  timeoutMs: 10000,
  onlyMainContent: true,
  allowPrivateNetwork: false,
  userAgent: KULLANICI_AJANI,
}

export class Tarayici {
  /** @param {string} baslangicUrl @param {Partial<typeof VARSAYILAN> & { fetch?: typeof fetch, signal?: AbortSignal }} [secenekler] */
  constructor(baslangicUrl, secenekler = {}) {
    this.s = { ...VARSAYILAN, ...secenekler }
    this.fetch = secenekler.fetch ?? globalThis.fetch
    this.baslangic = new URL(normalizeEt(baslangicUrl, this.s))
    this.dahil = this.s.includePaths.map((d) => new RegExp(d))
    this.haric = this.s.excludePaths.map((d) => new RegExp(d))
    /** @type {{ url: string, kesif: number }[]} */
    this.kuyruk = []
    this.gorulen = new Set()
    /** @type {object[]} */
    this.belgeler = []
    /** @type {Map<string, string>} */
    this.reddedilenler = new Map()
    /** @type {{ url: string, error: string }[]} */
    this.hatalar = []
    /** @type {Map<string, Promise<import('./asama2_robots.js').Robots | null>>} */
    this.robotsSozleri = new Map()
    /** @type {Map<string, import('./asama2_robots.js').Robots | null>} */
    this.robotsHazir = new Map()
    /** @type {Map<string, number>} */
    this.sonrakiIzin = new Map()
    this.aktif = 0
    /** @type {(() => void)[]} */
    this.uyuyanlar = []
  }

  get iptalEdildi() {
    return Boolean(this.s.signal?.aborted)
  }

  get robotsEngelledi() {
    return [...this.reddedilenler].filter(([, neden]) => neden === RED.ROBOTS).map(([url]) => url)
  }

  /** @param {{ onSayfa?: (belge: object) => void }} [kancalar] */
  async calistir(kancalar = {}) {
    if (!this.s.allowPrivateNetwork && ozelAdresMi(this.baslangic.hostname)) {
      throw new Error(RED.OZEL_AG)
    }
    await this.robotsAl(this.baslangic.origin)
    this.dene(this.baslangic.href, 0, true)
    if (this.s.sitemap !== 'skip') {
      for (const url of await this.siteHaritasiUrlleri()) this.dene(url, 1)
    }
    await Promise.all(Array.from({ length: this.s.concurrency }, () => this.isci(kancalar.onSayfa)))
    return {
      belgeler: this.belgeler,
      reddedilenler: Object.fromEntries(this.reddedilenler),
      robotsEngelledi: this.robotsEngelledi,
      hatalar: this.hatalar,
    }
  }

  // --- kuyruk ve işçiler ---------------------------------------------------------------
  /** @param {((belge: object) => void) | undefined} onSayfa */
  async isci(onSayfa) {
    while (!this.iptalEdildi) {
      const is = this.kuyruk.shift()
      if (!is) {
        if (this.aktif === 0) return // kuyruk boş ve kimse çalışmıyor: tarama bitti
        await new Promise((uyan) => this.uyuyanlar.push(() => uyan(undefined)))
        continue
      }
      this.aktif++
      try {
        await this.sayfaIsle(is, onSayfa)
      } catch (hata) {
        this.hatalar.push({ url: is.url, error: String(hata instanceof Error ? hata.message : hata) })
      } finally {
        this.aktif--
        this.uyuyanlar.splice(0).forEach((uyan) => uyan())
      }
    }
  }

  /**
   * Bir URL'yi kuyruğa almayı dene. Reddedilirse nedenini kaydet.
   * @param {string} ham @param {number} kesif @param {boolean} [ilk]
   */
  dene(ham, kesif, ilk = false) {
    let url
    try {
      url = new URL(normalizeEt(ham, this.s))
    } catch {
      return false
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const neden = this.redNedeni(url, kesif, ilk)
    if (neden) {
      if (!this.reddedilenler.has(url.href)) this.reddedilenler.set(url.href, neden)
      return false
    }
    const anahtar = this.s.deduplicateSimilarURLs ? benzerlikAnahtari(url.href) : url.href
    if (this.gorulen.has(anahtar)) return false
    if (this.gorulen.size >= this.s.limit) {
      this.reddedilenler.set(url.href, RED.SINIR)
      return false
    }
    this.gorulen.add(anahtar) // Firecrawl'da: Redis SADD (atomik "kilit")
    this.kuyruk.push({ url: url.href, kesif })
    return true
  }

  /** @param {URL} url @param {number} kesif @param {boolean} ilk @returns {string | null} */
  redNedeni(url, kesif, ilk) {
    if (!this.s.allowPrivateNetwork && ozelAdresMi(url.hostname)) return RED.OZEL_AG
    if (!ayniSiteMi(this.baslangic, url, this.s)) return RED.DIS
    if (kesif > this.s.maxDiscoveryDepth) return RED.KESIF
    if (urlDerinligi(url) - urlDerinligi(this.baslangic) > this.s.maxDepth) return RED.DERINLIK
    if (!ilk && !this.s.allowBackwardCrawling && geriyeMi(this.baslangic, url)) return RED.GERIYE
    if (dosyaMi(url)) return RED.DOSYA
    if (!ilk && this.dahil.length && !this.dahil.some((r) => r.test(url.pathname))) return RED.DAHIL
    if (this.haric.some((r) => r.test(url.pathname))) return RED.HARIC
    const robots = this.robotsHazir.get(url.origin)
    if (robots && !robots.izinliMi(url.href, this.s.userAgent)) return RED.ROBOTS
    return null
  }

  // --- nezaket ve robots.txt ------------------------------------------------------------
  /**
   * Aynı host'a iki istek arasında en az 'delay' (ya da robots Crawl-delay) kadar bekle.
   * Yer ayırtma yöntemi: her istek bir sonraki için "en erken zaman"ı ileri iter.
   * @param {URL} url
   */
  async siraBekle(url) {
    const robots = this.robotsHazir.get(url.origin)
    const gecikmeMs = Math.max(this.s.delay, robots?.gecikme(this.s.userAgent) ?? 0) * 1000
    const simdi = Date.now()
    const zaman = Math.max(simdi, this.sonrakiIzin.get(url.host) ?? 0)
    this.sonrakiIzin.set(url.host, zaman + gecikmeMs) // JS tek iş parçacıklı: bu satır atomiktir
    if (zaman > simdi) await bekle(zaman - simdi)
  }

  /** @param {string} origin */
  robotsAl(origin) {
    if (!this.robotsSozleri.has(origin)) {
      const soz = this.s.ignoreRobotsTxt ? Promise.resolve(null) : this.robotsGetir(origin)
      this.robotsSozleri.set(
        origin,
        soz.then((robots) => {
          this.robotsHazir.set(origin, robots)
          return robots
        }),
      )
    }
    return /** @type {Promise<import('./asama2_robots.js').Robots | null>} */ (this.robotsSozleri.get(origin))
  }

  /** @param {string} origin */
  async robotsGetir(origin) {
    try {
      const yanit = await this.getir(`${origin}/robots.txt`)
      if (!yanit.ok) return null // 404: kural yok, her şey serbest
      return robotsAyristir(await yanit.text())
    } catch {
      return null
    }
  }

  async siteHaritasiUrlleri() {
    const robots = this.robotsHazir.get(this.baslangic.origin)
    const robotsHaritalari = (robots?.siteHaritalari ?? []).map((h) => new URL(h, this.baslangic.origin).href)
    const adaylar = new Set([`${this.baslangic.origin}/sitemap.xml`, ...robotsHaritalari])
    const urller = []
    for (const harita of adaylar) {
      try {
        const yanit = await this.getir(harita)
        if (!yanit.ok) continue
        const xml = await yanit.text()
        urller.push(...[...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]))
      } catch {
        // site haritası olmayabilir
      }
    }
    return urller
  }

  /** @param {string} url */
  async getir(url) {
    const sinyaller = [AbortSignal.timeout(this.s.timeoutMs)]
    if (this.s.signal) sinyaller.push(this.s.signal)
    return this.fetch(url, {
      headers: { 'user-agent': this.s.userAgent, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.any(sinyaller),
    })
  }

  // --- tek sayfa -----------------------------------------------------------------------
  /** @param {{ url: string, kesif: number }} is @param {((belge: object) => void) | undefined} onSayfa */
  async sayfaIsle(is, onSayfa) {
    const url = new URL(is.url)
    const robots = await this.robotsAl(url.origin)
    if (robots && !robots.izinliMi(url.href, this.s.userAgent)) {
      this.reddedilenler.set(url.href, RED.ROBOTS)
      return
    }
    await this.siraBekle(url)
    if (this.iptalEdildi) return
    const yanit = await this.getir(url.href)
    const tur = yanit.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml/.test(tur)) {
      await yanit.body?.cancel()
      this.hatalar.push({ url: url.href, error: `HTML değil: ${tur || 'bilinmiyor'}` })
      return
    }
    const sonUrl = yanit.url || url.href
    const sayfa = sayfayiIsle(await yanit.text(), sonUrl, this.s)
    const belge = {
      markdown: sayfa.markdown,
      links: sayfa.links,
      metadata: { ...sayfa.metadata, sourceURL: url.href, url: sonUrl, statusCode: yanit.status },
    }
    this.belgeler.push(belge)
    onSayfa?.(belge)
    if (!yanit.ok || this.s.sitemap === 'only') return // hata sayfalarının bağlantıları izlenmez
    for (const link of sayfa.links) this.dene(link, is.kesif + 1)
  }
}
