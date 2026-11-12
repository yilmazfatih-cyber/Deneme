// Aşama 2 — robots.txt (RFC 9309'un sade bir alt kümesi).
//
// Firecrawl robots.txt'yi varsayılan olarak UYGULAR (ignoreRobotsTxt: false).
// Ayrıştırma JS'de 'robots-parser', Rust tarafında 'texting_robots' ile yapılır.
// Kurallar:
//   * Gruplar 'User-agent:' satırlarıyla başlar; ardışık User-agent satırları aynı gruptur.
//   * Ajanımızın ürün adını içeren grup varsa o, yoksa '*' grubu geçerlidir.
//   * Yola uyan kurallardan EN UZUN desen kazanır; eşitlikte Allow kazanır.
//   * '*' herhangi bir karakter dizisi, sondaki '$' yolun sonu demektir.
//   * Crawl-delay standart dışıdır ama yaygındır; nazik tarayıcı ona uyar.

/** @typedef {{ izin: boolean, desen: string, regex: RegExp }} Kural */
/** @typedef {{ ajanlar: string[], kurallar: Kural[], gecikme: number | null }} Grup */

/** @param {string} desen */
function desenRegex(desen) {
  const sonaBagli = desen.endsWith('$')
  const govde = sonaBagli ? desen.slice(0, -1) : desen
  const kacisli = govde
    .split('*')
    .map((parca) => parca.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${kacisli}${sonaBagli ? '$' : ''}`)
}

export class Robots {
  /** @param {Grup[]} gruplar @param {string[]} siteHaritalari */
  constructor(gruplar, siteHaritalari) {
    this.gruplar = gruplar
    this.siteHaritalari = siteHaritalari
  }

  /** @param {string} kullaniciAjani */
  grup(kullaniciAjani) {
    const urun = kullaniciAjani.toLowerCase().split('/')[0].trim()
    const ozel = this.gruplar.filter((g) => g.ajanlar.some((a) => a !== '*' && urun.includes(a)))
    const secilen = ozel.length ? ozel : this.gruplar.filter((g) => g.ajanlar.includes('*'))
    if (!secilen.length) return null
    // Aynı ajana ait birden fazla grup birleştirilir
    return {
      kurallar: secilen.flatMap((g) => g.kurallar),
      gecikme: secilen.map((g) => g.gecikme).find((g) => g !== null) ?? null,
    }
  }

  /** @param {string} url @param {string} kullaniciAjani */
  izinliMi(url, kullaniciAjani) {
    const u = new URL(url)
    if (u.pathname === '/robots.txt') return true
    const grup = this.grup(kullaniciAjani)
    if (!grup) return true
    const yol = u.pathname + u.search
    /** @type {{ izin: boolean, uzunluk: number } | null} */
    let enIyi = null
    for (const kural of grup.kurallar) {
      if (!kural.regex.test(yol)) continue
      const uzunluk = kural.desen.length
      if (!enIyi || uzunluk > enIyi.uzunluk || (uzunluk === enIyi.uzunluk && kural.izin)) {
        enIyi = { izin: kural.izin, uzunluk }
      }
    }
    return enIyi ? enIyi.izin : true
  }

  /** @param {string} kullaniciAjani @returns {number | null} saniye */
  gecikme(kullaniciAjani) {
    return this.grup(kullaniciAjani)?.gecikme ?? null
  }
}

/** @param {string} metin */
export function robotsAyristir(metin) {
  /** @type {Grup[]} */
  const gruplar = []
  /** @type {string[]} */
  const siteHaritalari = []
  /** @type {Grup | null} */
  let grup = null
  let oncekiAjanSatiri = false
  for (const hamSatir of metin.split(/\r?\n/)) {
    const satir = hamSatir.replace(/#.*$/, '').trim()
    const ikiNokta = satir.indexOf(':')
    if (ikiNokta === -1) continue
    const alan = satir.slice(0, ikiNokta).trim().toLowerCase()
    const deger = satir.slice(ikiNokta + 1).trim()
    if (alan === 'user-agent') {
      if (!grup || !oncekiAjanSatiri) {
        grup = { ajanlar: [], kurallar: [], gecikme: null }
        gruplar.push(grup)
      }
      grup.ajanlar.push(deger.toLowerCase())
      oncekiAjanSatiri = true
      continue
    }
    oncekiAjanSatiri = false
    if (alan === 'sitemap') {
      siteHaritalari.push(deger)
    } else if (grup && (alan === 'allow' || alan === 'disallow')) {
      if (deger) grup.kurallar.push({ izin: alan === 'allow', desen: deger, regex: desenRegex(deger) })
      // Boş 'Disallow:' "her şeye izin" demektir: kural eklemeye gerek yok
    } else if (grup && alan === 'crawl-delay') {
      const saniye = Number(deger)
      if (Number.isFinite(saniye) && saniye >= 0) grup.gecikme = saniye
    }
  }
  return new Robots(gruplar, siteHaritalari)
}
