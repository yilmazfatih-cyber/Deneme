// Aşama 1 — URL'ler: normalleştirme, "benzer URL" anahtarı, derinlik, kapsam, SSRF.
//
// Firecrawl'da bu işler apps/api/src/lib/crawl-redis.ts (normalizeURL,
// generateURLPermutations, lockURL) ve apps/api/src/scraper/WebScraper/
// (crawler.ts, utils/maxDepthUtils.ts) içinde yapılır; bağlantı süzme ise
// performans için Rust'a taşınmıştır (@mendable/firecrawl-rs: filterLinks).

/**
 * URL'yi karşılaştırılabilir biçime getirir.
 * URL sınıfı zaten: şemayı ve host'u küçük harfe çevirir, varsayılan portu atar,
 * '/a/../b' gibi yolları çözer.
 * @param {string} url
 * @param {{ ignoreQueryParameters?: boolean }} [secenekler]
 */
export function normalizeEt(url, secenekler = {}) {
  const u = new URL(url)
  if (secenekler.ignoreQueryParameters) u.search = ''
  // '#bolum' aynı sayfadır; ama '#/rota' ve '#!/rota' tek sayfa uygulamalarında ayrı sayfadır
  const hashRota = u.hash.length > 2 && (u.hash.startsWith('#/') || u.hash.startsWith('#!/'))
  if (!hashRota) u.hash = ''
  return u.href
}

/**
 * "Aynı içerik" sayılacak URL'ler için tek anahtar:
 * http/https, www/www'siz, '/index.html', '/index.php' ve sondaki '/' farkları yok sayılır.
 * (Firecrawl aynı fikri tüm permütasyonları üretip ilkini kilitleyerek uygular.)
 * @param {string} url
 */
export function benzerlikAnahtari(url) {
  const u = new URL(url)
  const host = u.hostname.replace(/^www\./, '')
  const yol = u.pathname.replace(/\/index\.(?:html?|php)$/i, '/').replace(/\/+$/, '') || '/'
  return `${host}${u.port ? `:${u.port}` : ''}${yol}${u.search}${u.hash}`
}

/** Yol derinliği: boş olmayan yol parçası sayısı ('index.html' sayılmaz). @param {string | URL} url */
export function urlDerinligi(url) {
  return new URL(url).pathname.split('/').filter((p) => p && !/^index\.(?:html?|php)$/i.test(p)).length
}

/** 'www.' atılmış kayıtlı alan adı (kaba yaklaşım: son iki etiket). @param {string} host */
export function kokAlanAdi(host) {
  const etiketler = host.replace(/^www\./, '').split('.')
  // Not: 'ornek.com.tr' gibi alan adlarında son iki etiket yetmez; gerçek çözüm
  // Public Suffix List'tir (Firecrawl Rust tarafında 'psl' kütüphanesini kullanır).
  return etiketler.slice(-2).join('.')
}

/**
 * @param {URL} baslangic
 * @param {URL} aday
 * @param {{ allowSubdomains?: boolean }} [secenekler]
 */
export function ayniSiteMi(baslangic, aday, secenekler = {}) {
  const a = baslangic.hostname.replace(/^www\./, '')
  const b = aday.hostname.replace(/^www\./, '')
  if (a === b && baslangic.port === aday.port) return true
  if (!secenekler.allowSubdomains) return false
  const kok = kokAlanAdi(a)
  return b === kok || b.endsWith(`.${kok}`)
}

/**
 * Başlangıç yolunun "altında" değilse geriye doğru taramadır.
 * '/blog' ile başlayan tarama '/blog/yazi'ya gider ama '/hakkinda'ya ve '/blogger'a gitmez.
 * @param {URL} baslangic
 * @param {URL} aday
 */
export function geriyeMi(baslangic, aday) {
  const kok = baslangic.pathname.replace(/\/index\.(?:html?|php)$/i, '/').replace(/\/+$/, '')
  if (!kok) return false
  return !(aday.pathname === kok || aday.pathname.startsWith(`${kok}/`))
}

const IKILI_UZANTILAR =
  /\.(?:jpe?g|png|gif|webp|svg|ico|css|js|mjs|zip|gz|tar|rar|7z|mp3|mp4|webm|avi|mov|woff2?|ttf|exe|dmg|iso)$/i

/** @param {URL} url */
export function dosyaMi(url) {
  return IKILI_UZANTILAR.test(url.pathname)
}

/**
 * SSRF koruması: kullanıcının verdiği URL ile sunucunun KENDİ iç ağına istek atmasını engelle.
 * Yalnızca doğrudan yazılmış IP'leri ve 'localhost'u yakalar; DNS ile iç IP'ye çözülen
 * adlar (DNS rebinding) için bağlantı anında IP denetimi gerekir.
 * @param {string} hostname
 */
export function ozelAdresMi(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '::' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return true
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!ipv4) return false
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}
