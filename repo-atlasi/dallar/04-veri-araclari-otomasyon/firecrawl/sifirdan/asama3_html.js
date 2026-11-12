// Aşama 3 — HTML'i ağaca çevir, ana içeriği ayıkla, bağlantıları ve meta verileri topla.
//
// Firecrawl'da: apps/api/src/scraper/scrapeURL/lib/removeUnwantedElements.ts
// (onlyMainContent: header/footer/nav/aside, '.sidebar', '.cookie' ... atılır),
// bağlantı çıkarma crawler.ts içinde (Rust ve cheerio sürümleri). Biz bağımlılıksız
// küçük bir ayrıştırıcı yazıyoruz: tarayıcıların "hata affeden" HTML kurallarının
// yalnızca en sık gerekenlerini uygular.

/** @typedef {{ tur: 'metin', metin: string }} MetinDugumu */
/** @typedef {{ tur: 'eleman', ad: string, oz: Record<string, string>, cocuklar: Dugum[] }} ElemanDugumu */
/** @typedef {MetinDugumu | ElemanDugumu} Dugum */

const BOS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])
const HAM_METIN = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'template'])
const P_KAPATANLAR = new Set(['p', 'div', 'ul', 'ol', 'table', 'pre', 'blockquote', 'section', 'article', 'form'])
for (const ad of ['header', 'footer', 'nav', 'aside', 'main', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
  P_KAPATANLAR.add(ad)
const VARLIKLAR = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '©',
  reg: '®',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
}
const BASLANGIC_RE = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y
const OZELLIK_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
const BITIS_RE = /<\/\s*([a-zA-Z][\w:-]*)\s*>/y

/** HTML karakter varlıklarını çöz: &amp; &#305; &#x131; ... @param {string} metin */
export function varlikCoz(metin) {
  return metin.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (tam, govde) => {
    if (govde[0] === '#') {
      const kod = govde[1] === 'x' || govde[1] === 'X' ? parseInt(govde.slice(2), 16) : parseInt(govde.slice(1), 10)
      return Number.isFinite(kod) && kod > 0 && kod <= 0x10ffff ? String.fromCodePoint(kod) : tam
    }
    return VARLIKLAR[govde.toLowerCase()] ?? tam
  })
}

/** @param {string} ad @param {Record<string, string>} [oz] @returns {ElemanDugumu} */
const eleman = (ad, oz = {}) => ({ tur: 'eleman', ad, oz, cocuklar: [] })

/** @param {string} html @returns {ElemanDugumu} */
export function htmlAyristir(html) {
  const kok = eleman('#belge')
  /** @type {ElemanDugumu[]} */
  const yigin = [kok]
  const ust = () => yigin[yigin.length - 1]
  /** @param {string} metin */
  const metinEkle = (metin) => {
    if (metin) ust().cocuklar.push({ tur: 'metin', metin: varlikCoz(metin) })
  }
  /** @param {string} ad @param {string[]} [sinirlar] */
  const kapat = (ad, sinirlar = []) => {
    for (let i = yigin.length - 1; i > 0; i--) {
      if (sinirlar.includes(yigin[i].ad)) return
      if (yigin[i].ad === ad) {
        yigin.length = i
        return
      }
    }
  }

  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      metinEkle(html.slice(i))
      break
    }
    metinEkle(html.slice(i, lt))
    if (html.startsWith('<!--', lt)) {
      const son = html.indexOf('-->', lt + 4)
      i = son === -1 ? html.length : son + 3
      continue
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const son = html.indexOf('>', lt)
      i = son === -1 ? html.length : son + 1
      continue
    }
    BITIS_RE.lastIndex = lt
    const bitis = BITIS_RE.exec(html)
    if (bitis) {
      kapat(bitis[1].toLowerCase())
      i = BITIS_RE.lastIndex
      continue
    }
    BASLANGIC_RE.lastIndex = lt
    const bas = BASLANGIC_RE.exec(html)
    if (!bas) {
      metinEkle('<')
      i = lt + 1
      continue
    }
    i = BASLANGIC_RE.lastIndex
    const ad = bas[1].toLowerCase()
    /** @type {Record<string, string>} */
    const oz = {}
    for (const m of bas[2].matchAll(OZELLIK_RE)) oz[m[1].toLowerCase()] = varlikCoz(m[2] ?? m[3] ?? m[4] ?? '')

    // Örtük kapanışlar: açık <p> bloklardan önce, <li> yeni <li>'den önce kapanır ...
    if (P_KAPATANLAR.has(ad) && ust().ad === 'p') yigin.pop()
    if (ad === 'li') kapat('li', ['ul', 'ol'])
    else if (ad === 'td' || ad === 'th') ['td', 'th'].forEach((x) => kapat(x, ['tr', 'table']))
    else if (ad === 'tr') kapat('tr', ['table'])
    else if (ad === 'dt' || ad === 'dd') ['dt', 'dd'].forEach((x) => kapat(x, ['dl']))
    else if (ad === 'option') kapat('option', ['select'])

    const yeni = eleman(ad, oz)
    ust().cocuklar.push(yeni)
    if (BOS.has(ad) || bas[3] === '/') continue
    if (HAM_METIN.has(ad)) {
      // <script> içindeki '<' etiket değildir: kapanış etiketine kadar ham metin
      const kapanis = new RegExp(`</${ad}\\s*>`, 'ig')
      kapanis.lastIndex = i
      const k = kapanis.exec(html)
      const ic = html.slice(i, k ? k.index : html.length)
      yeni.cocuklar.push({ tur: 'metin', metin: ad === 'script' || ad === 'style' ? ic : varlikCoz(ic) })
      i = k ? k.index + k[0].length : html.length
      continue
    }
    yigin.push(yeni)
  }
  return kok
}

/** Ağaçta önce-derinlik arama. @param {Dugum} dugum @param {(d: ElemanDugumu) => boolean} kosul */
export function bul(dugum, kosul) {
  if (dugum.tur !== 'eleman') return null
  if (kosul(dugum)) return dugum
  for (const c of dugum.cocuklar) {
    const sonuc = bul(c, kosul)
    if (sonuc) return sonuc
  }
  return null
}

/** @param {Dugum} dugum @param {(d: ElemanDugumu) => boolean} kosul @param {ElemanDugumu[]} [sonuc] */
export function hepsiniBul(dugum, kosul, sonuc = []) {
  if (dugum.tur !== 'eleman') return sonuc
  if (kosul(dugum)) sonuc.push(dugum)
  for (const c of dugum.cocuklar) hepsiniBul(c, kosul, sonuc)
  return sonuc
}

/** @param {Dugum} dugum @returns {string} */
export function duzMetin(dugum) {
  if (dugum.tur === 'metin') return dugum.metin
  return dugum.cocuklar.map(duzMetin).join('')
}

const ANA_DISI_ETIKETLER = new Set(['header', 'footer', 'nav', 'aside'])
const ANA_DISI_AD =
  /^(?:header|footer|nav|navbar|navigation|menu|sidebar|side|aside|breadcrumbs?|social(?:-media|-links)?|share|ads?|advert|cookie|cookie-banner|modal|popup|overlay|widget|lang-selector|language)$/i

/** @param {ElemanDugumu} d */
function anaIcerikDisiMi(d) {
  if (ANA_DISI_ETIKETLER.has(d.ad)) return true
  if (d.oz.id && ANA_DISI_AD.test(d.oz.id)) return true
  return (d.oz.class ?? '').split(/\s+/).some((s) => ANA_DISI_AD.test(s))
}

/** @param {ElemanDugumu} d @param {(d: ElemanDugumu) => boolean} at @returns {ElemanDugumu} */
function budanmisKopya(d, at) {
  return {
    ...d,
    cocuklar: d.cocuklar
      .filter((c) => c.tur === 'metin' || !at(c))
      .map((c) => (c.tur === 'metin' ? c : budanmisKopya(c, at))),
  }
}

/**
 * Ana içerik: önce açık işaretlere bak (<main>, role=main, tek <article>),
 * yoksa <body>'den gezinme/çerçeve öğelerini at.
 * @param {ElemanDugumu} kok
 */
export function anaIcerik(kok) {
  const main = bul(kok, (d) => d.ad === 'main' || d.oz.role === 'main' || d.oz.id === 'main')
  if (main) return main
  const makaleler = hepsiniBul(kok, (d) => d.ad === 'article')
  if (makaleler.length === 1) return makaleler[0]
  const govde = bul(kok, (d) => d.ad === 'body') ?? kok
  return budanmisKopya(govde, anaIcerikDisiMi)
}

/** Sayfadaki bağlantılar (mutlak, '#' kısmı atılmış, tekrarsız). @param {ElemanDugumu} kok @param {string} sayfaUrl */
export function baglantilar(kok, sayfaUrl) {
  const base = bul(kok, (d) => d.ad === 'base' && Boolean(d.oz.href))
  const taban = base ? new URL(base.oz.href, sayfaUrl).href : sayfaUrl
  const sonuc = new Set()
  for (const a of hepsiniBul(kok, (d) => d.ad === 'a' && Boolean(d.oz.href))) {
    const href = a.oz.href.trim()
    if (/^(?:javascript|mailto|tel|data):/i.test(href)) continue
    try {
      const u = new URL(href, taban)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
      if (!(u.hash.startsWith('#/') || u.hash.startsWith('#!/'))) u.hash = ''
      sonuc.add(u.href)
    } catch {
      // geçersiz href: atla
    }
  }
  return [...sonuc]
}

/** @param {ElemanDugumu} kok */
export function metaVeri(kok) {
  /** @type {Record<string, string>} */
  const meta = {}
  const baslik = bul(kok, (d) => d.ad === 'title')
  if (baslik) meta.title = duzMetin(baslik).replace(/\s+/g, ' ').trim()
  const html = bul(kok, (d) => d.ad === 'html')
  if (html?.oz.lang) meta.language = html.oz.lang
  for (const m of hepsiniBul(kok, (d) => d.ad === 'meta' && 'content' in d.oz)) {
    const ad = m.oz.name ?? m.oz.property
    if (ad === 'description' || ad === 'robots' || ad?.startsWith('og:')) meta[ad.replace(/^og:/, 'og_')] = m.oz.content
  }
  const kanonik = bul(kok, (d) => d.ad === 'link' && (d.oz.rel ?? '').split(/\s+/).includes('canonical'))
  if (kanonik?.oz.href) meta.canonical = kanonik.oz.href
  return meta
}
