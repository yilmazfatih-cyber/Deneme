// Aşama 4 — HTML ağacından Markdown.
//
// Firecrawl'ın asıl dönüştürücüsü üç katmanlıdır (apps/api/src/lib/html-to-markdown.ts):
// 1) ayrı bir Go HTTP servisi (apps/go-html-to-md-service), 2) aynı Go kodunun koffi
// ile yüklenen paylaşımlı kütüphanesi, 3) yedek olarak JS 'turndown'. Sonuç Rust'taki
// postProcessMarkdown'dan geçer. Biz tek katmanlı, okunabilir bir sürüm yazıyoruz.

import { anaIcerik, baglantilar, duzMetin, htmlAyristir, metaVeri } from './asama3_html.js'

/** @typedef {import('./asama3_html.js').Dugum} Dugum */
/** @typedef {import('./asama3_html.js').ElemanDugumu} ElemanDugumu */

const ATLA = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'object', 'head', 'title', 'button'])
const BLOK = new Set([
  'div',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'nav',
  'aside',
  'body',
  'html',
  'figure',
])
for (const ad of ['figcaption', 'form', 'fieldset', 'details', 'summary', 'address', 'dl', 'dt', 'dd']) BLOK.add(ad)

class Yazici {
  /** @param {string | undefined} tabanUrl */
  constructor(tabanUrl) {
    this.tabanUrl = tabanUrl
  }

  /** @param {string} url */
  mutlak(url) {
    if (!this.tabanUrl || !url) return url
    try {
      return new URL(url, this.tabanUrl).href
    } catch {
      return url
    }
  }

  /** @param {ElemanDugumu} d */
  cocuklar(d) {
    return d.cocuklar.map((c) => this.cevir(c)).join('')
  }

  /** @param {Dugum} d @returns {string} */
  cevir(d) {
    if (d.tur === 'metin') return d.metin.replace(/\s+/g, ' ')
    const ad = d.ad
    if (ATLA.has(ad)) return ''
    if (/^h[1-6]$/.test(ad)) return `\n\n${'#'.repeat(Number(ad[1]))} ${this.cocuklar(d).trim()}\n\n`
    switch (ad) {
      case 'p':
        return `\n\n${this.cocuklar(d).trim()}\n\n`
      case 'br':
        return '\n'
      case 'hr':
        return '\n\n---\n\n'
      case 'strong':
      case 'b':
        return this.sar(d, '**')
      case 'em':
      case 'i':
        return this.sar(d, '*')
      case 'del':
      case 's':
        return this.sar(d, '~~')
      case 'code':
        return `\`${duzMetin(d)}\``
      case 'a':
        return this.baglanti(d)
      case 'img': {
        const kaynak = d.oz.src ?? ''
        return kaynak ? `![${d.oz.alt ?? ''}](${this.mutlak(kaynak)})` : ''
      }
      case 'pre': {
        const kod = d.cocuklar.find((c) => c.tur === 'eleman' && c.ad === 'code')
        const dil = /language-([\w+-]+)/.exec(kod && kod.tur === 'eleman' ? (kod.oz.class ?? '') : '')
        return `\n\n\`\`\`${dil ? dil[1] : ''}\n${duzMetin(d).replace(/^\n+|\n+$/g, '')}\n\`\`\`\n\n`
      }
      case 'blockquote': {
        const ic = this.cocuklar(d)
          .trim()
          .replace(/\n{3,}/g, '\n\n')
        return `\n\n${ic
          .split('\n')
          .map((s) => `> ${s}`.trimEnd())
          .join('\n')}\n\n`
      }
      case 'ul':
      case 'ol':
        return `\n\n${this.liste(d, 0)}\n\n`
      case 'table':
        return `\n\n${this.tablo(d)}\n\n`
      default:
        return BLOK.has(ad) ? `\n\n${this.cocuklar(d)}\n\n` : this.cocuklar(d)
    }
  }

  /** @param {ElemanDugumu} d @param {string} isaret */
  sar(d, isaret) {
    const ic = this.cocuklar(d).trim()
    return ic ? `${isaret}${ic}${isaret}` : ''
  }

  /** @param {ElemanDugumu} d */
  baglanti(d) {
    const metin = this.cocuklar(d).trim()
    const href = (d.oz.href ?? '').trim()
    if (!href || /^javascript:/i.test(href)) return metin
    return `[${metin || href}](${this.mutlak(href).replace(/ /g, '%20')})`
  }

  /** @param {ElemanDugumu} d @param {number} girinti @returns {string} */
  liste(d, girinti) {
    const satirlar = []
    let sira = d.ad === 'ol' ? Number(d.oz.start ?? 1) : null
    for (const li of d.cocuklar) {
      if (li.tur !== 'eleman' || li.ad !== 'li') continue
      const isaret = sira === null ? '-' : `${sira}.`
      const metin = []
      const altlar = []
      for (const c of li.cocuklar) {
        if (c.tur === 'eleman' && (c.ad === 'ul' || c.ad === 'ol'))
          altlar.push(this.liste(c, girinti + isaret.length + 1))
        else metin.push(this.cevir(c))
      }
      satirlar.push(
        `${' '.repeat(girinti)}${isaret} ${metin
          .join('')
          .replace(/\s*\n+\s*/g, ' ')
          .trim()}`,
        ...altlar,
      )
      if (sira !== null) sira++
    }
    return satirlar.join('\n')
  }

  /** @param {ElemanDugumu} d */
  tablo(d) {
    /** @type {string[][]} */
    const satirlar = []
    /** @param {ElemanDugumu} dugum */
    const topla = (dugum) => {
      for (const c of dugum.cocuklar) {
        if (c.tur !== 'eleman') continue
        if (c.ad === 'tr') {
          const hucreler = c.cocuklar.filter((h) => h.tur === 'eleman' && (h.ad === 'td' || h.ad === 'th'))
          satirlar.push(
            hucreler.map((h) =>
              this.cocuklar(/** @type {ElemanDugumu} */ (h))
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/\|/g, '\\|'),
            ),
          )
        } else if (['thead', 'tbody', 'tfoot'].includes(c.ad)) topla(c)
      }
    }
    topla(d)
    if (!satirlar.length) return ''
    const genislik = Math.max(...satirlar.map((s) => s.length))
    const dolu = satirlar.map((s) => [...s, ...Array(genislik - s.length).fill('')])
    const satir = (/** @type {string[]} */ s) => `| ${s.join(' | ')} |`
    return [satir(dolu[0]), satir(Array(genislik).fill('---')), ...dolu.slice(1).map(satir)].join('\n')
  }
}

/** Sondaki boşlukları sil, boş satırları sıkıştır, kod bloklarına dokunma. @param {string} md */
export function markdownTemizle(md) {
  const cikti = []
  let cit = false
  let oncekiBos = true
  for (let satir of md.split('\n')) {
    if (satir.trimStart().startsWith('```')) {
      cit = !cit
      satir = satir.trim()
    } else if (!cit) {
      satir = satir.trimEnd()
      if (oncekiBos) satir = satir.trimStart()
      if (!satir && oncekiBos) continue
    }
    cikti.push(satir)
    oncekiBos = !cit && !satir
  }
  return cikti.join('\n').trim() + '\n'
}

/** @param {Dugum} dugum @param {{ tabanUrl?: string }} [secenekler] */
export function markdownaCevir(dugum, secenekler = {}) {
  return markdownTemizle(new Yazici(secenekler.tabanUrl).cevir(dugum))
}

/**
 * Tek sayfayı "kazı": HTML -> { markdown, metadata, links }.
 * @param {string} html @param {string} url @param {{ onlyMainContent?: boolean }} [secenekler]
 */
export function sayfayiIsle(html, url, secenekler = {}) {
  const kok = htmlAyristir(html)
  const govde = secenekler.onlyMainContent === false ? kok : anaIcerik(kok)
  return { markdown: markdownaCevir(govde, { tabanUrl: url }), metadata: metaVeri(kok), links: baglantilar(kok, url) }
}
