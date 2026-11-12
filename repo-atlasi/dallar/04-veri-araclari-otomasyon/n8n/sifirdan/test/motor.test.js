import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { after, before, describe, test } from 'node:test'
import { AkisHatasi, IsAkisi, akisiCalistir, dugumCiktisi } from '../asama3_motor.js'

const ornek = JSON.parse(await readFile(new URL('../ornekler/siparis-akisi.json', import.meta.url), 'utf8'))

/** Kısa yoldan akış kur: dugumler = [ad, tip, parametreler, ek, konum], baglantilar = [kaynak, hedef, çıkış, giriş] */
function akis(/** @type {any[][]} */ dugumler, /** @type {any[][]} */ baglantilar, ayarlar = {}) {
  /** @type {Record<string, any>} */
  const connections = {}
  for (const [kaynak, hedef, cikis = 0, giris = 0] of baglantilar) {
    const main = (connections[kaynak] ??= { main: [] }).main
    while (main.length <= cikis) main.push([])
    main[cikis].push({ node: hedef, type: 'main', index: giris })
  }
  return {
    name: 'test',
    nodes: dugumler.map(([name, tip, parameters = {}, ek = {}, position = [0, 0]]) => ({
      name,
      type: `n8n-nodes-base.${tip}`,
      typeVersion: 1,
      parameters,
      position,
      ...ek,
    })),
    connections,
    settings: ayarlar,
  }
}
const kod = (/** @type {string} */ jsCode, mode = 'runOnceForAllItems') => ({ jsCode, mode })
const sirasi = async (/** @type {any} */ veri) => {
  /** @type {string[]} */
  const sira = []
  await akisiCalistir(new IsAkisi(veri), { kancalar: { dugumOncesi: (ad) => sira.push(ad) } })
  return sira
}

describe('yürütme motoru', () => {
  test('örnek sipariş akışı: dallanma, birleştirme, özet', async () => {
    const sonuc = await akisiCalistir(new IsAkisi(ornek))
    assert.equal(sonuc.status, 'success')
    assert.deepEqual(
      dugumCiktisi(sonuc, "Tutar 100'den büyük mü?", 0).map((o) => o.json.id),
      [1, 3],
    )
    assert.deepEqual(dugumCiktisi(sonuc, 'Kargo ücretsiz')[0].json.etiket, 'AYŞE - öncelikli')
    assert.deepEqual(dugumCiktisi(sonuc, 'Kargo ücretli')[1].json, {
      id: 4,
      musteri: 'ılgaz',
      tutar: 40,
      sehir: 'Iğdır',
      kargo: 30,
      toplam: 70,
    })
    assert.deepEqual(dugumCiktisi(sonuc, 'Özet')[0].json, { siparisSayisi: 4, toplamTahsilat: 550 })
    assert.ok(sonuc.gunluk.some((g) => g.mesaj === '[console] sipariş sayısı 4'))
    const kayit = sonuc.data.resultData.runData['Birleştir'][0]
    assert.deepEqual(
      kayit.source.map((/** @type {any} */ s) => s.previousNode),
      ['Kargo ücretsiz', 'Kargo ücretli'],
    )
  })

  test('v1: önce bir dal biter, kardeşlerden sol üstteki önce; v0: katman katman', async () => {
    const dugumler = [
      ['T', 'manualTrigger'],
      ['Alt', 'noOp', {}, {}, [200, 400]],
      ['Ust', 'noOp', {}, {}, [200, 100]],
      ['Alt2', 'noOp'],
      ['Ust2', 'noOp'],
    ]
    const baglar = [
      ['T', 'Alt'],
      ['T', 'Ust'],
      ['Alt', 'Alt2'],
      ['Ust', 'Ust2'],
    ]
    assert.deepEqual(await sirasi(akis(dugumler, baglar, { executionOrder: 'v1' })), [
      'T',
      'Ust',
      'Ust2',
      'Alt',
      'Alt2',
    ])
    assert.deepEqual(await sirasi(akis(dugumler, baglar, { executionOrder: 'v0' })), [
      'T',
      'Alt',
      'Ust',
      'Alt2',
      'Ust2',
    ])
  })

  test('boş çıkışın dalı çalışmaz; Merge eksik girdiyle yığın boşalınca çalışır', async () => {
    const kosul = {
      conditions: {
        conditions: [{ leftValue: '={{ $json.n }}', rightValue: 10, operator: { type: 'number', operation: 'gt' } }],
      },
    }
    const veri = akis(
      [
        ['T', 'manualTrigger'],
        ['Veri', 'code', kod('return [{ n: 1 }, { n: 2 }]')],
        ['If', 'if', kosul],
        ['Dogru', 'noOp'],
        ['Yanlis', 'noOp'],
        ['Birlestir', 'merge'],
      ],
      [
        ['T', 'Veri'],
        ['Veri', 'If'],
        ['If', 'Dogru', 0],
        ['If', 'Yanlis', 1],
        ['Dogru', 'Birlestir', 0, 0],
        ['Yanlis', 'Birlestir', 0, 1],
      ],
    )
    const sonuc = await akisiCalistir(new IsAkisi(veri))
    const runData = sonuc.data.resultData.runData
    assert.equal(runData.Dogru, undefined)
    assert.deepEqual(
      dugumCiktisi(sonuc, 'Birlestir').map((o) => o.json.n),
      [1, 2],
    )
  })

  test('Merge combineByPosition ve Set nokta gösterimi', async () => {
    const veri = akis(
      [
        ['T', 'manualTrigger'],
        ['A', 'code', kod("return [{ ad: 'Ali' }, { ad: 'Can' }]")],
        ['B', 'code', kod('return [{ yas: 30 }, { yas: 40 }, { yas: 50 }]')],
        ['M', 'merge', { mode: 'combine', combineBy: 'combineByPosition' }],
        [
          'S',
          'set',
          {
            assignments: {
              assignments: [
                { name: 'kisi.ad', type: 'string', value: '={{ $json.ad }}' },
                { name: 'kisi.yetiskin', type: 'boolean', value: '={{ $json.yas >= 18 }}' },
              ],
            },
          },
        ],
      ],
      [
        ['T', 'A'],
        ['T', 'B'],
        ['A', 'M', 0, 0],
        ['B', 'M', 0, 1],
        ['M', 'S'],
      ],
    )
    const sonuc = await akisiCalistir(new IsAkisi(veri))
    assert.deepEqual(
      dugumCiktisi(sonuc, 'S').map((o) => o.json),
      [{ kisi: { ad: 'Ali', yetiskin: true } }, { kisi: { ad: 'Can', yetiskin: true } }],
    )
  })

  test('hata yönetimi: durdurma, continueOnFail ve hata çıkışı', async () => {
    const hatali = (/** @type {object} */ ek) =>
      akis(
        [
          ['T', 'manualTrigger'],
          ['Patla', 'code', kod("throw new Error('olmadı')"), ek],
          ['Sonra', 'noOp'],
          ['HataYolu', 'noOp'],
        ],
        [
          ['T', 'Patla'],
          ['Patla', 'Sonra', 0],
          ['Patla', 'HataYolu', 1],
        ],
      )
    const dur = await akisiCalistir(new IsAkisi(hatali({})))
    assert.equal(dur.status, 'error')
    assert.deepEqual(dur.data.resultData.error, { message: 'Kod hatası: olmadı', node: 'Patla' })
    assert.equal(dur.data.resultData.runData.Sonra, undefined)

    const devam = await akisiCalistir(new IsAkisi(hatali({ continueOnFail: true })))
    assert.equal(devam.status, 'success')
    assert.deepEqual(dugumCiktisi(devam, 'Sonra')[0].json, { error: 'Kod hatası: olmadı' })

    const yol = await akisiCalistir(new IsAkisi(hatali({ onError: 'continueErrorOutput' })))
    assert.equal(yol.data.resultData.runData.Sonra, undefined)
    assert.deepEqual(dugumCiktisi(yol, 'HataYolu')[0].json, { error: 'Kod hatası: olmadı' })
  })

  test('pinData, devre dışı düğüm ve bilinmeyen tip', async () => {
    const veri = akis(
      [
        ['T', 'manualTrigger'],
        ['Kaynak', 'code', kod("throw new Error('çalışmamalı')")],
        ['Kapali', 'set', { assignments: { assignments: [{ name: 'x', value: 1 }] } }, { disabled: true }],
      ],
      [
        ['T', 'Kaynak'],
        ['Kaynak', 'Kapali'],
      ],
    )
    veri.pinData = { Kaynak: [{ json: { sabit: true } }] }
    const sonuc = await akisiCalistir(new IsAkisi(veri))
    assert.deepEqual(dugumCiktisi(sonuc, 'Kapali')[0].json, { sabit: true })
    assert.throws(() => new IsAkisi(akis([['T', 'uydurmaTip']], [])), AkisHatasi)
  })

  test('Code: öğe başına kip, sonsuz döngü ve kaçış denemeleri', async () => {
    const tek = (/** @type {string} */ jsCode, mode = 'runOnceForAllItems') =>
      akisiCalistir(
        new IsAkisi(
          akis(
            [
              ['T', 'manualTrigger'],
              ['Veri', 'code', kod('return [{ a: 1 }, { a: 2 }]')],
              ['K', 'code', kod(jsCode, mode)],
            ],
            [
              ['T', 'Veri'],
              ['Veri', 'K'],
            ],
          ),
        ),
        { zamanAsimiMs: 200 },
      )
    const herOge = await tek('return { b: $json.a * 10 }', 'runOnceForEachItem')
    assert.deepEqual(
      dugumCiktisi(herOge, 'K').map((o) => o.json.b),
      [10, 20],
    )
    for (const [kotu, beklenen] of [
      ['while (true) {}', /zaman aşımı/],
      ['await null; while (true) {}', /zaman aşımı/],
      ['return [', /Kod hatası: Unexpected/],
      ["return this.constructor.constructor('return process')()", /Kod hatası/],
      ["return eval('1 + 1')", /Code generation from strings disallowed/],
      ['return [{ p: typeof process, r: typeof require }].map(x => ({ json: x }))', null],
    ]) {
      const sonuc = await tek(/** @type {string} */ (kotu))
      if (beklenen)
        assert.match(sonuc.data.resultData.error?.message ?? '', /** @type {RegExp} */ (beklenen), String(kotu))
      else assert.deepEqual(dugumCiktisi(sonuc, 'K')[0].json, { p: 'undefined', r: 'undefined' })
    }
  })
})

describe('HTTP Request düğümü', () => {
  /** @type {import('node:http').Server} */
  let sunucu
  let taban = ''
  let sayac = 0
  before(async () => {
    sunucu = createServer(async (istek, yanit) => {
      const url = new URL(istek.url ?? '/', 'http://x')
      let govde = ''
      for await (const p of istek) govde += p
      if (url.pathname === '/dengesiz' && ++sayac < 3) {
        yanit.writeHead(503).end('meşgul')
        return
      }
      if (url.pathname === '/liste') {
        yanit.writeHead(200, { 'content-type': 'application/json' }).end('[{"id":1},{"id":2}]')
        return
      }
      yanit.writeHead(url.pathname === '/yok' ? 404 : 200, { 'content-type': 'application/json' })
      yanit.end(
        JSON.stringify({
          yontem: istek.method,
          sorgu: Object.fromEntries(url.searchParams),
          govde,
          tur: istek.headers['content-type'],
        }),
      )
    })
    await new Promise((hazir) => sunucu.listen(0, '127.0.0.1', () => hazir(undefined)))
    taban = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (sunucu.address()).port}`
  })
  after(() => new Promise((bitti) => sunucu.close(() => bitti(undefined))))

  const http = (/** @type {object} */ parametreler, /** @type {object} */ ek = {}) =>
    akisiCalistir(
      new IsAkisi(
        akis(
          [
            ['T', 'manualTrigger'],
            ['Veri', 'code', kod("return [{ sehir: 'İzmir' }, { sehir: 'Muş' }]")],
            ['H', 'httpRequest', parametreler, ek],
          ],
          [
            ['T', 'Veri'],
            ['Veri', 'H'],
          ],
        ),
      ),
    )

  test('öğe başına bir istek; ifadeli sorgu ve JSON gövde', async () => {
    const sonuc = await http({
      method: 'POST',
      url: `=${taban}/kayit`,
      sendQuery: true,
      queryParameters: { parameters: [{ name: 'il', value: '={{ $json.sehir }}' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ sehir: $json.sehir }) }}',
    })
    const ciktilar = dugumCiktisi(sonuc, 'H').map((o) => o.json)
    assert.equal(ciktilar.length, 2)
    assert.deepEqual(ciktilar[1], {
      yontem: 'POST',
      sorgu: { il: 'Muş' },
      govde: '{"sehir":"Muş"}',
      tur: 'application/json',
    })
  })

  test('dizi yanıtı öğelere bölünür; hata kodu düğüm hatasıdır; yeniden deneme', async () => {
    assert.equal(dugumCiktisi(await http({ url: `${taban}/liste` }), 'H').length, 4)
    const hata = await http({ url: `${taban}/yok` })
    assert.match(hata.data.resultData.error?.message ?? '', /HTTP 404/)
    sayac = 0
    const tekrar = await http({ url: `${taban}/dengesiz` }, { retryOnFail: true, maxTries: 3, waitBetweenTries: 10 })
    assert.equal(tekrar.status, 'success')
    assert.ok(tekrar.gunluk.some((g) => g.mesaj === 'yeniden deneme 3/3'))
  })
})
