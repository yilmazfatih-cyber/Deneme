// Yönlendirme denetimi: herkese açık görünen bir sayfa özel bir adrese yönlendirirse oraya istek atılmaz.
// Ağ kullanılmaz; `fetch` yerine sahte bir işlev verilir.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { guvenliGetir, Tarayici } from '../asama5_tarayici.js'
import { tekSayfaKazi } from '../asama6_api.js'

/** Sahte site: /eski bulut meta veri adresine, /tasindi aynı sitedeki /yeni'ye, /dongu kendine yönlendirir. */
function sahteSite() {
  /** @type {string[]} */
  const istenenler = []
  const yonlendir = (/** @type {number} */ kod, /** @type {string} */ hedef) =>
    new Response(null, { status: kod, headers: { location: hedef } })
  /** Tek bir isteği yanıtlar; yönlendirmeyi izlemez. */
  const yanitla = (/** @type {string} */ url) => {
    istenenler.push(url)
    if (url === 'https://ornek.com/eski') return yonlendir(302, 'http://169.254.169.254/latest/meta-data')
    if (url === 'https://ornek.com/tasindi') return yonlendir(301, '/yeni')
    if (url === 'https://ornek.com/dongu') return yonlendir(302, '/dongu')
    return new Response('<main><h1>Yeni</h1></main>', { headers: { 'content-type': 'text/html' } })
  }
  /**
   * Gerçek fetch gibi davranır: `redirect: 'manual'` verilmezse Location'ı kendisi izler (en çok 20 adım).
   * Böylece yönlendirmeyi denetimsiz izleyen bir kod da her adımı `istenenler`e yazar ve testler onu yakalar.
   * @param {string | URL | Request} adres
   * @param {RequestInit} [secenekler]
   */
  const fetch = async (adres, secenekler) => {
    let url = String(adres)
    let yanit = yanitla(url)
    if (secenekler?.redirect === 'manual') return yanit
    for (let adim = 0; yanit.status >= 300 && yanit.status < 400; adim++) {
      if (adim === 20) throw new TypeError('fetch failed: çok fazla yönlendirme')
      url = new URL(String(yanit.headers.get('location')), url).href
      yanit = yanitla(url)
    }
    return yanit
  }
  return { fetch, istenenler }
}

describe('Yönlendirme denetimi (sahte fetch, ağ yok)', () => {
  test('tek sayfa kazıma: özel adrese giden yönlendirme reddedilir, öteki izlenir', async () => {
    const { fetch, istenenler } = sahteSite()
    await assert.rejects(tekSayfaKazi('https://ornek.com/eski', { fetch }), /SSRF/)
    assert.deepEqual(istenenler, ['https://ornek.com/eski'], 'meta veri adresine istek gitmemeli')
    const { sayfa } = await tekSayfaKazi('https://ornek.com/tasindi', { fetch })
    assert.equal(sayfa.markdown, '# Yeni\n')
    assert.deepEqual(istenenler.slice(1), ['https://ornek.com/tasindi', 'https://ornek.com/yeni'])
  })

  test('tarayıcı: yönlendirme hedefi de denetlenir', async () => {
    const { fetch, istenenler } = sahteSite()
    const tarayici = new Tarayici('https://ornek.com/eski', { fetch, ignoreRobotsTxt: true, sitemap: 'skip' })
    const sonuc = await tarayici.calistir()
    assert.equal(sonuc.belgeler.length, 0)
    assert.match(sonuc.hatalar[0].error, /SSRF/)
    assert.ok(!istenenler.some((u) => u.includes('169.254')))
  })

  test('yönlendirme döngüsü 20 adımda kesilir', async () => {
    const { fetch, istenenler } = sahteSite()
    await assert.rejects(
      guvenliGetir('https://ornek.com/dongu', () => {}, { fetch }),
      /yönlendirme/,
    )
    assert.equal(istenenler.length, 21)
  })
})
