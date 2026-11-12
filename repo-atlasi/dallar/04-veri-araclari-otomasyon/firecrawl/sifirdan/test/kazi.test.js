// `node cli.js kazi` alt süreç olarak çalıştırılır. İnternete çıkılmaz: yalnızca 127.0.0.1'deki yerel siteye bağlanır.

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { yerelSiteBaslat } from '../yardimci/yerel-site.js'

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url))

/**
 * @param {...string} argumanlar
 * @returns {Promise<{ kod: unknown, cikti: string, hataCiktisi: string }>}
 */
const kazi = (...argumanlar) =>
  new Promise((coz) => {
    execFile(process.execPath, [CLI, 'kazi', ...argumanlar], { timeout: 20000 }, (hata, cikti, hataCiktisi) =>
      coz({ kod: hata ? hata.code : 0, cikti, hataCiktisi }),
    )
  })

/** @type {{ taban: string, istekler: { yol: string }[], kapat: () => Promise<void> }} */
let site
before(async () => {
  site = await yerelSiteBaslat()
})
after(() => site.kapat())

describe('node cli.js kazi', () => {
  test('--yerel olmadan özel adres reddedilir: çıkış kodu 1, siteye istek gitmez', async () => {
    const once = site.istekler.length
    const { kod, cikti, hataCiktisi } = await kazi(`${site.taban}/hakkinda`)
    assert.equal(kod, 1)
    assert.match(hataCiktisi, /SSRF/)
    assert.match(hataCiktisi, /--yerel/)
    assert.equal(cikti, '')
    assert.equal(site.istekler.length, once)
  })

  test('--yerel ile Markdown üretir ve yönlendirmeyi izler', async () => {
    const once = site.istekler.length
    const { kod, cikti, hataCiktisi } = await kazi(`${site.taban}/eski-hakkinda`, '--yerel')
    assert.equal(kod, 0, hataCiktisi)
    assert.equal(cikti, '# Hakkında\n\nBiz kimiz?\n\n')
    assert.deepEqual(
      site.istekler.slice(once).map((i) => i.yol),
      ['/eski-hakkinda', '/hakkinda'],
    )
  })

  test('yalnızca http ve https', async () => {
    const { kod, hataCiktisi } = await kazi('ftp://127.0.0.1/dosya', '--yerel')
    assert.equal(kod, 1)
    assert.match(hataCiktisi, /Yalnızca http\/https/)
  })
})
