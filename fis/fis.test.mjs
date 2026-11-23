// Çalıştır: node --test fis/fis.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  newId,
  subtotal,
  normalizeBill,
  normalizeResp,
  encodeBill,
  decodeBill,
  encodeResp,
  decodeResp,
  encodeAll,
  decodeAll,
  parseHash,
  buildUrl,
  nameKey,
  upsertResp,
  calc,
  report,
  parseReceiptText,
  formatMoney,
  parseMoney,
} from './fis.mjs'
import { ORNEK_FIS } from './ornek.mjs'

// Gerçek fişin iPhone "Metni Kopyala" çıktısı (satır başına bir kalem).
const FIS_METNI = `SARAY MUHALLEBICISI (HILLTOWN)
Garson : HALILCAN K.   Kisi : 10
Servis Tipi : Masa Servis   Cek #39
Acilis 18.11.2026 11:44
Masa : L1
Urun Adi  Miktar  Brm Fyt  Tutar
Kucuk Pasta Cilekli 1 1400.00 1400.00
1 X (+) N: VISNE CIKO 1 0.00 0.00
Ayran Paket 1 120.00 120.00
1 X (+) ALDIM 1 0.00 0.00
Doner Porsiyon 1 700.00 700.00
DONER HUMUS SALATA 100 GR 2 785.00 1570.00
Ayran Paket 2 120.00 240.00
Az Mercimek Corba 3 165.00 495.00
Sise Coca-Cola 1 110.00 110.00
KOFTE HUMUS SALATA 1 600.00 600.00
TAVUK SIS HUMUS SALATA 4 600.00 2400.00
Mercimek Corba 1 200.00 200.00
CITIR TAV.SEZAR SALATA 2 600.00 1200.00
1.5 Doner Porsiyon 1 920.00 920.00
Tavuklu Durum 1 465.00 465.00
IZGARA TAVUK SALATASI 1 600.00 600.00
Sise Cola Zero 1 110.00 110.00
Az Corba 1 165.00 165.00
Corba 1 200.00 200.00
YIYECEK 10915.00
ICECEK 580.00
ARA TOP. 11495.00
INDIRIM -1724.25
* Polisan > AVM PERSONELI
TUTAR 9770.75
* Mali Degeri Yoktur *
`

/** Tohumlu PRNG (mulberry32): başarısız senaryo tohumla yeniden üretilebilir. */
function prng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rint = (rnd, min, max) => min + Math.floor(rnd() * (max - min + 1))
const sumDue = (r) => r.people.reduce((a, p) => a + p.due, 0)
/** Her kalemi tam adetle seçen yanıt. */
const hepsi = (bill, name = 'Hepsi') => ({ name, picks: Object.fromEntries(bill.items.map((it, i) => [i, it.qty])) })

// ---------- örnek fiş ----------

test('ORNEK_FIS geçerli bir fiştir ve tutarları fişle aynıdır', () => {
  assert.equal(ORNEK_FIS.id, 'saray39')
  assert.equal(ORNEK_FIS.people, 10)
  assert.equal(ORNEK_FIS.note, '')
  assert.equal(ORNEK_FIS.items.length, 16)
  assert.equal(subtotal(ORNEK_FIS), 1149500)
  assert.equal(ORNEK_FIS.total, 977075)
  assert.deepEqual(normalizeBill(ORNEK_FIS), ORNEK_FIS)
})

test('newId 8 karakter base36 üretir', () => {
  const seen = new Set()
  for (let i = 0; i < 200; i++) {
    const id = newId()
    assert.match(id, /^[0-9a-z]{8}$/)
    seen.add(id)
  }
  assert.ok(seen.size > 190)
})

// ---------- normalize ----------

test('normalizeBill alanları kırpar, sınırlar, geçersiz kalemleri atar', () => {
  const b = normalizeBill({
    id: 'abc',
    title: '  Çok   uzun ' + 'x'.repeat(200),
    meta: 5,
    people: 1000,
    total: 999999999,
    note: 'TR00\n0001\t' + 'n'.repeat(500),
    items: [
      { name: '  Çay  ', qty: 2, unit: 1500 },
      { name: 'bozuk adet', qty: 0, unit: 100 },
      { name: 'bozuk adet', qty: 100, unit: 100 },
      { name: 'kesirli', qty: 1.5, unit: 100 },
      { name: 'bedava', qty: 1, unit: 0 },
      { name: 'metin', qty: '2', unit: '100' },
      null,
      { name: '', qty: 1, unit: 250 },
      { name: 'a'.repeat(100), qty: 99, unit: 1 },
    ],
  })
  assert.equal(b.id, 'abc')
  assert.equal(Array.from(b.title).length, 80)
  assert.ok(b.title.startsWith('Çok uzun x'))
  assert.equal(b.meta, '')
  assert.equal(b.people, 0)
  assert.equal(b.note.length, 200)
  assert.ok(b.note.startsWith('TR00 0001 n'))
  assert.deepEqual(b.items, [
    { name: 'Çay', qty: 2, unit: 1500 },
    { name: 'Kalem', qty: 1, unit: 250 },
    { name: 'a'.repeat(60), qty: 99, unit: 1 },
  ])
  assert.equal(b.total, 3000 + 250 + 99) // subtotal'dan büyük total -> subtotal
})

test('normalizeBill: total geçersizse subtotal; kalem yoksa null; id yoksa yeni id', () => {
  const items = [{ name: 'Su', qty: 1, unit: 1000 }]
  assert.equal(normalizeBill({ id: 'a', items, total: 0 }).total, 1000)
  assert.equal(normalizeBill({ id: 'a', items, total: -5 }).total, 1000)
  assert.equal(normalizeBill({ id: 'a', items, total: 12.5 }).total, 1000)
  assert.equal(normalizeBill({ id: 'a', items, total: '900' }).total, 1000)
  assert.equal(normalizeBill({ id: 'a', items, total: 900 }).total, 900)
  assert.equal(normalizeBill({ id: 'a', items: [] }), null)
  assert.equal(normalizeBill({ id: 'a', items: [{ name: 'x', qty: 0, unit: 1 }] }), null)
  assert.match(normalizeBill({ items }).id, /^[0-9a-z]{8}$/)
  assert.match(normalizeBill({ id: 'boşluk var', items }).id, /^[0-9a-z]{8}$/)
  for (const x of [null, undefined, 5, 'x', [], {}, { items: 'x' }, () => 1]) assert.equal(normalizeBill(x), null)
})

test('normalizeBill en çok 99 kalem tutar ve dev dizide takılmaz', () => {
  const items = Array.from({ length: 100000 }, (_, i) => ({ name: 'K' + i, qty: 1, unit: 100 }))
  const b = normalizeBill({ id: 'a', items })
  assert.equal(b.items.length, 99)
  assert.equal(b.items[98].name, 'K98')
})

test('normalizeResp adı ve seçimleri fişe göre kırpar', () => {
  const r = normalizeResp(ORNEK_FIS, {
    name: '   Ayşe   Gül  ' + 'z'.repeat(50),
    picks: { 0: 1, 1: 7, 7: 3, 99: 1, 16: 1, '-1': 1, 2: 0, 3: -2, 4: 1.5, 5: '1', abc: 1, __proto__: 4 },
  })
  assert.equal(Array.from(r.name).length, 24)
  assert.ok(r.name.startsWith('Ayşe Gül z'))
  assert.deepEqual(r.picks, { 0: 1, 1: 3, 7: 3 })
  assert.equal(normalizeResp(ORNEK_FIS, { name: '   ', picks: { 0: 1 } }), null)
  assert.equal(normalizeResp(ORNEK_FIS, { picks: { 0: 1 } }), null)
  assert.equal(normalizeResp(ORNEK_FIS, null), null)
  assert.equal(normalizeResp(ORNEK_FIS, 'Ali'), null)
  assert.deepEqual(normalizeResp(ORNEK_FIS, { name: 'Ali' }), { name: 'Ali', picks: {} })
  assert.deepEqual(normalizeResp(ORNEK_FIS, { name: 'Ali', picks: 'x' }), { name: 'Ali', picks: {} })
  // çift listesi de kabul edilir
  assert.deepEqual(normalizeResp(ORNEK_FIS, { name: 'Ali', picks: [[1, 2], [50, 1], 'x', [0]] }), {
    name: 'Ali',
    picks: { 1: 2 },
  })
})

test('prototip kirletme anahtarları zararsızdır', () => {
  const kotu = JSON.parse('{"name":"Ali","picks":{"__proto__":{"0":1},"constructor":2,"1":1},"__proto__":{"x":1}}')
  const r = normalizeResp(ORNEK_FIS, kotu)
  assert.deepEqual(r, { name: 'Ali', picks: { 1: 1 } })
  assert.equal(Object.getPrototypeOf(r.picks), Object.prototype)
  assert.equal({}.x, undefined)
  const b = normalizeBill(
    JSON.parse('{"__proto__":{"id":"zz"},"id":"a","items":[{"name":"__proto__","qty":1,"unit":5}]}'),
  )
  assert.equal(b.items[0].name, '__proto__')
  assert.deepEqual(parseHash('#__proto__=1&constructor=2&b=x'), { b: 'x' })
})

// ---------- kodlama ----------

test('fiş gidiş-dönüş: örnek fiş, Türkçe karakterler ve emoji', () => {
  const code = encodeBill(ORNEK_FIS)
  assert.match(code, /^[A-Za-z0-9_-]+$/)
  assert.deepEqual(decodeBill(code), ORNEK_FIS)

  const tr = {
    id: 'tr_1-X',
    title: 'Çiğköfteci İĞÜŞÖÇ ığüşöç 🍰👨‍👩‍👧',
    meta: 'Masa 5 · “tırnak” \\ / "çift"',
    people: 3,
    total: 4321,
    note: '',
    items: [
      { name: 'Şiş köfte 🍢', qty: 2, unit: 2000 },
      { name: 'ıspanaklı gözleme İ', qty: 1, unit: 999 },
    ],
  }
  assert.deepEqual(decodeBill(encodeBill(tr)), tr)
  // standart base64 (+ / =) olarak gelirse de okunur
  const std = encodeBill(tr).replace(/-/g, '+').replace(/_/g, '/')
  assert.deepEqual(decodeBill(std + '='.repeat((4 - (std.length % 4)) % 4)), tr)
})

test('fiş gidiş-dönüş: 99 kalem, boş not, her bayt uzunluğu', () => {
  const big = {
    id: 'big99',
    title: 'Büyük masa',
    meta: '',
    people: 99,
    total: 1,
    note: '',
    items: Array.from({ length: 99 }, (_, i) => ({
      name: 'Kalem ğ' + 'ş'.repeat(i % 7),
      qty: (i % 99) + 1,
      unit: 100 + i,
    })),
  }
  assert.deepEqual(decodeBill(encodeBill(big)), big)
  // dolgu uzunluğunun üç hali de (bayt % 3) bozulmadan gidip gelmeli
  for (let n = 0; n < 12; n++) {
    const b = { ...big, title: 'a'.repeat(n), items: big.items.slice(0, 2) }
    assert.deepEqual(decodeBill(encodeBill(b)), b)
  }
  assert.equal(encodeBill({ id: 'x', items: [] }), '')
  assert.equal(encodeBill(null), '')
})

test('yanıt gidiş-dönüş ve kimlik denetimi', () => {
  const resp = { name: 'İpek Öztürk', picks: { 0: 1, 7: 2, 1: 3 } }
  const code = encodeResp(ORNEK_FIS, resp)
  assert.match(code, /^[A-Za-z0-9_-]+$/)
  assert.deepEqual(decodeResp(ORNEK_FIS, code), resp)
  assert.equal(decodeResp({ ...ORNEK_FIS, id: 'baska' }, code), null)
  assert.equal(encodeResp(ORNEK_FIS, { name: '', picks: {} }), '')
  // hiçbir şey seçmeyen de geçerlidir
  assert.deepEqual(decodeResp(ORNEK_FIS, encodeResp(ORNEK_FIS, { name: 'Can', picks: {} })), { name: 'Can', picks: {} })
  // fiş kodu yanıt diye, yanıt kodu fiş diye çözülmez
  assert.equal(decodeResp(ORNEK_FIS, encodeBill(ORNEK_FIS)), null)
  assert.equal(decodeBill(code), null)
})

test('tüm yanıtlar gidiş-dönüş; geçersizler atılır; en çok 99', () => {
  const resps = [
    { name: 'Ayşe', picks: { 0: 1, 1: 1 } },
    { name: 'Çağrı 🙂', picks: {} },
    { name: 'Işıl', picks: { 15: 1 } },
  ]
  const code = encodeAll(ORNEK_FIS, [...resps, { name: '', picks: {} }, null])
  assert.deepEqual(decodeAll(ORNEK_FIS, code), resps)
  assert.deepEqual(decodeAll({ ...ORNEK_FIS, id: 'baska' }, code), [])
  assert.deepEqual(decodeAll(ORNEK_FIS, encodeAll(ORNEK_FIS, [])), [])
  assert.deepEqual(decodeAll(ORNEK_FIS, encodeAll(ORNEK_FIS, null)), [])
  // Kişi sayısı sınırı (99) kadar yanıt sonuç bağlantısına sığar; fazlası kesilir.
  const cok = Array.from({ length: 120 }, (_, i) => ({ name: 'Kişi ' + i, picks: { 0: 1 } }))
  assert.equal(decodeAll(ORNEK_FIS, encodeAll(ORNEK_FIS, cok)).length, 99)
  // aynı ad iki kez gelirse sonuncusu kalır
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url')
  const cift = b64([1, 'saray39', [['Ali', [[0, 1]]], ['ALİ', [[2, 1]]], 5, ['', []], ['Veli', 'x']]])
  assert.deepEqual(decodeAll(ORNEK_FIS, cift), [
    { name: 'ALİ', picks: { 2: 1 } },
    { name: 'Veli', picks: {} },
  ])
})

test('bozuk girdi: çözücüler null / [] döner, asla throw etmez', () => {
  const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')
  const iyi = encodeBill(ORNEK_FIS)
  const item = ['Su', 1, 100]
  const kotu = [
    '',
    ' ',
    'merhaba dünya',
    '!!!!',
    'a',
    'abcde',
    '%%%',
    iyi.slice(0, 50), // kesik base64
    iyi.slice(0, -7),
    iyi.slice(3),
    iyi + 'A!',
    b64('{'),
    b64('null'),
    b64('42'),
    b64('"metin"'),
    b64({ id: 'a' }),
    b64([]),
    b64([2, 'a', 't', 'm', 1, 100, '', [item]]), // yanlış sürüm
    b64(['1', 'a', 't', 'm', 1, 100, '', [item]]),
    b64([1, 'a', 't', 'm', 1, 100, '']), // kalem alanı yok
    b64([1, 'a', 't', 'm', 1, 100, '', 'x']),
    b64([1, 'a', 't', 'm', 1, 100, '', []]),
    b64([1, 'a', 't', 'm', 1, 100, '', [['Su', 0, 100]]]),
    b64([1, '', 't', 'm', 1, 100, '', [item]]), // kimlik yok
    b64([1, 'a b', 't', 'm', 1, 100, '', [item]]),
    b64([1, 7, 't', 'm', 1, 100, '', [item]]),
    Buffer.from([0xff, 0xfe, 0x80, 0x5b]).toString('base64url'), // geçersiz UTF-8
    'A'.repeat(100001),
    null,
    undefined,
    42,
    {},
    [],
  ]
  for (const k of kotu) {
    assert.equal(decodeBill(k), null, String(k).slice(0, 40))
    assert.equal(decodeResp(ORNEK_FIS, k), null)
    assert.deepEqual(decodeAll(ORNEK_FIS, k), [])
  }
  // türleri yanlış ama biçimi doğru girdi: kırpılarak okunur
  const b = decodeBill(b64([1, 'a', 5, null, 'x', -3, {}, [item, 'x', [1, 0, 3], ['Çay', 2, 50, 'fazla']]]))
  assert.deepEqual(b, {
    id: 'a',
    title: '',
    meta: '',
    people: 0,
    total: 200,
    note: '',
    items: [
      { name: 'Su', qty: 1, unit: 100 },
      { name: 'Çay', qty: 2, unit: 50 },
    ],
  })
  assert.equal(decodeResp(ORNEK_FIS, b64([1, 'saray39', '', [[0, 1]]])), null)
  assert.equal(decodeResp(ORNEK_FIS, b64([1, 'saray39', 'Ali', 'x'])), null)
  assert.equal(decodeResp(null, b64([1, 'saray39', 'Ali', []])), null)
  assert.deepEqual(decodeResp(ORNEK_FIS, b64([1, 'saray39', 'Ali', [[0, 9], [77, 1], 'x', [1, 'y']]])), {
    name: 'Ali',
    picks: { 0: 1 },
  })
})

test('bozuk girdi: rastgele dizgiler ve rastgele baytlar', () => {
  const rnd = prng(20261118)
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_+/=%&# ğş\u0000'
  for (let i = 0; i < 500; i++) {
    let s = ''
    const len = rint(rnd, 0, 120)
    for (let j = 0; j < len; j++) s += abc[rint(rnd, 0, abc.length - 1)]
    assert.equal(decodeBill(s), null, s)
    assert.equal(decodeResp(ORNEK_FIS, s), null, s)
    assert.deepEqual(decodeAll(ORNEK_FIS, s), [], s)
    const bytes = Buffer.from(Array.from({ length: rint(rnd, 0, 80) }, () => rint(rnd, 0, 255))).toString('base64url')
    assert.doesNotThrow(() => decodeBill(bytes))
    assert.doesNotThrow(() => decodeResp(ORNEK_FIS, bytes))
    assert.doesNotThrow(() => decodeAll(ORNEK_FIS, bytes))
    assert.doesNotThrow(() => parseReceiptText(s))
    assert.doesNotThrow(() => parseMoney(s))
    assert.doesNotThrow(() => parseHash(s))
  }
  // geçerli kodun her kesik hali: ya null ya da geçerli bir fiş
  const iyi = encodeBill(ORNEK_FIS)
  for (let n = 0; n < iyi.length; n += 3) {
    const b = decodeBill(iyi.slice(0, n))
    assert.ok(b === null || normalizeBill(b) !== null)
  }
})

// ---------- bağlantı ----------

test('parseHash ve buildUrl', () => {
  assert.deepEqual(parseHash(''), {})
  assert.deepEqual(parseHash('#'), {})
  assert.deepEqual(parseHash('#b=AbC-_1'), { b: 'AbC-_1' })
  assert.deepEqual(parseHash('b=AbC&r=XyZ'), { b: 'AbC', r: 'XyZ' })
  assert.deepEqual(parseHash('#b=AbC&s=Q&x=1&b=ikinci&r='), { b: 'AbC', s: 'Q' })
  assert.deepEqual(parseHash('https://ornek.dev/fis/#b=AbC&r=XyZ'), { b: 'AbC', r: 'XyZ' })
  assert.deepEqual(parseHash(null), {})
  assert.deepEqual(parseHash('#b=%zz'), {})

  const base = 'https://yilmazfatih-cyber.github.io/Deneme/fis/'
  assert.equal(buildUrl(base, { b: 'B' }), base + '#b=B')
  assert.equal(buildUrl(base, { b: 'B', r: 'R' }), base + '#b=B&r=R')
  assert.equal(buildUrl(base, { b: 'B', s: 'S' }), base + '#b=B&s=S')
  assert.equal(buildUrl(base + '#eski=1', { b: 'B' }), base + '#b=B')
  assert.equal(buildUrl(base, {}), base)

  const b = encodeBill(ORNEK_FIS)
  const r = encodeResp(ORNEK_FIS, { name: 'Ayşe', picks: { 0: 1 } })
  const url = buildUrl(base, { b, r })
  const parts = parseHash(new URL(url).hash)
  assert.deepEqual(parts, { b, r })
  const bill = decodeBill(parts.b)
  assert.deepEqual(decodeResp(bill, parts.r), { name: 'Ayşe', picks: { 0: 1 } })
})

// ---------- adlar ----------

test('nameKey ve upsertResp: büyük/küçük harf, İ/i, boşluk', () => {
  assert.equal(nameKey('  AYŞE   Gül '), 'ayşe gül')
  assert.equal(nameKey('İPEK'), nameKey('ipek'))
  assert.equal(nameKey('IŞIL'), nameKey('ışıl'))
  assert.notEqual(nameKey('Işıl'), nameKey('İşil'))
  assert.equal(nameKey(null), '')

  const a = [
    { name: 'İpek', picks: { 0: 1 } },
    { name: 'Ali', picks: {} },
  ]
  const b = upsertResp(a, { name: ' ipek ', picks: { 2: 1 } })
  assert.notEqual(b, a)
  assert.equal(a[0].picks[0], 1) // girdi değişmedi
  assert.deepEqual(b, [
    { name: ' ipek ', picks: { 2: 1 } },
    { name: 'Ali', picks: {} },
  ])
  const c = upsertResp(b, { name: 'ALİ', picks: { 1: 1 } })
  assert.equal(c.length, 2)
  assert.equal(c[1].name, 'ALİ')
  const d = upsertResp(c, { name: 'Veli', picks: {} })
  assert.deepEqual(
    d.map((r) => r.name),
    [' ipek ', 'ALİ', 'Veli'],
  )
  assert.deepEqual(upsertResp(null, { name: 'Ali', picks: {} }), [{ name: 'Ali', picks: {} }])
  assert.deepEqual(upsertResp(a, null), a)
  assert.deepEqual(upsertResp(a, { name: '  ', picks: {} }), a)
})

// ---------- calc ----------

test('calc: tek kişi her şeyi alırsa tam tutarı öder', () => {
  const r = calc(ORNEK_FIS, [hepsi(ORNEK_FIS)])
  assert.equal(r.people[0].due, 977075)
  assert.equal(r.left, 0)
  assert.deepEqual(
    r.units,
    ORNEK_FIS.items.map((it) => it.qty),
  )
  assert.equal(r.people[0].items.length, 16)
  assert.deepEqual(r.people[0].items[0], { index: 0, units: 1, amount: 119000 })
})

test('calc: yanıt yokken hepsi açıkta', () => {
  const r = calc(ORNEK_FIS, [])
  assert.deepEqual(r.people, [])
  assert.equal(r.left, 977075)
  assert.deepEqual(r.units, new Array(16).fill(0))
  assert.equal(calc(ORNEK_FIS, null).left, 977075)
})

test('calc: ortak kalem bölüşümü (tek pastayı 10 kişi işaretler)', () => {
  const resps = Array.from({ length: 10 }, (_, i) => ({ name: 'K' + i, picks: { 0: 1 } }))
  const r = calc(ORNEK_FIS, resps)
  assert.equal(r.units[0], 10)
  // 1400 ₺ * 0,85 = 1190 ₺ -> kişi başı 119,00 ₺
  for (const p of r.people) assert.equal(p.due, 11900)
  assert.equal(sumDue(r), 119000)
  assert.equal(r.left, 977075 - 119000)
  assert.equal(sumDue(r) + r.left, ORNEK_FIS.total)
})

test('calc: bölünmeyen ortak kalemde kuruşlar en büyük kalanla dağılır', () => {
  const bill = {
    id: 'x',
    title: '',
    meta: '',
    people: 3,
    total: 1000,
    note: '',
    items: [{ name: 'Pasta', qty: 1, unit: 1000 }],
  }
  const r = calc(bill, [
    { name: 'A', picks: { 0: 1 } },
    { name: 'B', picks: { 0: 1 } },
    { name: 'C', picks: { 0: 1 } },
  ])
  assert.deepEqual(
    r.people.map((p) => p.due),
    [334, 333, 333],
  )
  assert.equal(r.left, 0)
  assert.deepEqual(
    r.people.map((p) => p.items[0].amount),
    [333, 333, 333],
  )
})

test('calc: kısmi adet (4 adetten 3 alınırsa 1 adet sahipsiz)', () => {
  const r = calc(ORNEK_FIS, [
    { name: 'A', picks: { 7: 2 } },
    { name: 'B', picks: { 7: 1 } },
  ])
  assert.equal(r.units[7], 3)
  // 600 ₺ * 0,85 = 510 ₺ / adet
  assert.equal(r.people[0].due, 102000)
  assert.equal(r.people[1].due, 51000)
  assert.equal(r.left, 977075 - 153000)
  // adet aşılırsa payda işaretlenen adet olur: 4 adeti 5 işaret böler
  const r2 = calc(ORNEK_FIS, [
    { name: 'A', picks: { 7: 4 } },
    { name: 'B', picks: { 7: 1 } },
  ])
  assert.equal(r2.units[7], 5)
  assert.equal(r2.people[0].due, 163200) // 2040 ₺ * 4/5
  assert.equal(r2.people[1].due, 40800)
})

test('calc: indirimli toplam orantılı dağılır ve tam tutar', () => {
  const bill = {
    id: 'x',
    title: '',
    meta: '',
    people: 2,
    total: 9999,
    note: '',
    items: [
      { name: 'A', qty: 1, unit: 7000 },
      { name: 'B', qty: 1, unit: 3001 },
      { name: 'C', qty: 3, unit: 333 },
    ],
  }
  const r = calc(bill, [
    { name: 'Bir', picks: { 0: 1, 2: 1 } },
    { name: 'İki', picks: { 1: 1, 2: 2 } },
  ])
  assert.equal(r.left, 0)
  assert.equal(sumDue(r), 9999)
  const f = 9999 / subtotal(bill)
  assert.ok(Math.abs(r.people[0].due - 7333 * f) < 1)
  assert.ok(Math.abs(r.people[1].due - 3667 * f) < 1)
  // indirim yokken herkes kendi yediğini öder
  const r2 = calc({ ...bill, total: subtotal(bill) }, [
    { name: 'Bir', picks: { 0: 1, 2: 1 } },
    { name: 'İki', picks: { 1: 1, 2: 2 } },
  ])
  assert.deepEqual(
    r2.people.map((p) => p.due),
    [7333, 3667],
  )
})

test('calc: geçersiz seçimler yok sayılır, bozuk girdide throw etmez', () => {
  const r = calc(ORNEK_FIS, [{ name: 'A', picks: { 0: 5, 99: 1, 2: -1, 3: 0.5, x: 1 } }, null, { name: 'B' }, 'x'])
  assert.equal(r.people.length, 4)
  assert.equal(r.units[0], 1) // adet kalemin adedine indirildi
  assert.equal(r.people[0].due, 119000)
  assert.equal(sumDue(r) + r.left, ORNEK_FIS.total)
  assert.deepEqual(calc(null, null), { people: [], units: [], left: 0 })
  assert.deepEqual(calc({ items: [] }, [{ name: 'A', picks: { 0: 1 } }]).people[0].due, 0)
})

test('calc değişmezleri: 200 rastgele senaryo', () => {
  const TOHUM = 977075
  for (let s = 0; s < 200; s++) {
    const rnd = prng(TOHUM + s)
    const items = Array.from({ length: rint(rnd, 1, 14) }, (_, i) => ({
      name: 'K' + i,
      qty: rint(rnd, 1, rnd() < 0.2 ? 99 : 6),
      unit: rint(rnd, 1, rnd() < 0.5 ? 999 : 250000),
    }))
    const sub = items.reduce((a, it) => a + it.qty * it.unit, 0)
    const total = rnd() < 0.3 ? sub : rint(rnd, 1, sub)
    const bill = normalizeBill({ id: 's' + s, title: '', meta: '', people: 0, total, note: '', items })
    const resps = Array.from({ length: rint(rnd, 0, 14) }, (_, p) => {
      const picks = {}
      items.forEach((it, i) => {
        if (rnd() < 0.45) picks[i] = rint(rnd, 1, it.qty)
      })
      return { name: 'P' + p, picks }
    })
    // senaryoların bir kısmında her kalem kesin sahipli olsun
    if (s % 3 === 0) resps.push(hepsi(bill, 'Tam'))
    const etiket = `tohum=${TOHUM + s}`

    const r = calc(bill, resps)
    assert.equal(sumDue(r) + r.left, bill.total, etiket)
    assert.equal(r.people.length, resps.length, etiket)
    assert.ok(Number.isInteger(r.left) && r.left >= 0, etiket)
    const units = items.map((_, i) => resps.reduce((a, x) => a + (x.picks[i] ?? 0), 0))
    assert.deepEqual(r.units, units, etiket)
    const sahipli = items.every((it, i) => units[i] >= it.qty)
    if (sahipli) assert.equal(r.left, 0, etiket)
    if (s % 3 === 0) assert.ok(sahipli, etiket)
    r.people.forEach((p, k) => {
      assert.ok(Number.isInteger(p.due) && p.due >= 0, etiket)
      // due, kesin paydan 1 kuruştan az sapar; kalem tutarlarının toplamı da due'ya yakındır
      let exact = 0
      for (const [i, n] of Object.entries(resps[k].picks)) {
        exact += (items[i].qty * items[i].unit * n * bill.total) / (Math.max(units[i], items[i].qty) * sub)
      }
      assert.ok(Math.abs(p.due - exact) < 1.001, etiket)
      const amounts = p.items.reduce((a, x) => a + x.amount, 0)
      assert.ok(Math.abs(amounts - p.due) <= p.items.length / 2 + 1, etiket)
      assert.deepEqual(
        p.items.map((x) => [String(x.index), x.units]),
        Object.entries(resps[k].picks),
        etiket,
      )
    })
    const rep = report(bill, resps)
    assert.equal(rep.left, r.left, etiket)
    assert.equal(rep.complete, sahipli, etiket)
  }
})

// ---------- report ----------

test('report: eksikler, ortak kalemler ve tamamlanma', () => {
  const bos = report(ORNEK_FIS, [])
  assert.equal(bos.answered, 0)
  assert.equal(bos.expected, 10)
  assert.equal(bos.waiting, 10)
  assert.equal(bos.unclaimed.length, 16)
  assert.equal(bos.left, 977075)
  assert.equal(bos.complete, false)
  assert.equal(
    bos.unclaimed.reduce((a, u) => a + u.amount, 0),
    977075,
  )

  const resps = [
    hepsi(ORNEK_FIS, 'Toplayıcı'),
    { name: 'Ayşe', picks: { 0: 1 } },
    { name: 'Ali', picks: { 0: 1, 7: 1 } },
  ]
  const tam = report(ORNEK_FIS, resps)
  assert.equal(tam.answered, 3)
  assert.equal(tam.waiting, 7)
  assert.deepEqual(tam.unclaimed, [])
  assert.deepEqual(tam.shared, [
    { index: 0, name: 'Küçük Pasta Çilekli (Vişne Çiko)', units: 3, qty: 1 },
    { index: 7, name: 'Tavuk Şiş Humus Salata', units: 5, qty: 4 },
  ])
  assert.equal(tam.left, 0)
  assert.equal(tam.complete, true)

  // Tavuk Şiş'ten 3 adet alınmış, gerisi tam: 1 adet sahipsiz (510,00 ₺)
  const eksik = hepsi(ORNEK_FIS, 'Biri')
  eksik.picks[7] = 3
  const rep = report(ORNEK_FIS, [eksik])
  assert.deepEqual(rep.unclaimed, [{ index: 7, name: 'Tavuk Şiş Humus Salata', missing: 1, amount: 51000 }])
  assert.equal(rep.left, 51000)
  assert.equal(rep.complete, false)
  assert.deepEqual(rep.shared, [])

  // beklenenden fazla yanıt: waiting eksiye düşmez; kişi sayısı bilinmiyorsa 0
  const cok = Array.from({ length: 12 }, (_, i) => ({ name: 'K' + i, picks: {} }))
  assert.equal(report(ORNEK_FIS, cok).waiting, 0)
  assert.equal(report({ ...ORNEK_FIS, people: 0 }, []).waiting, 0)
  assert.doesNotThrow(() => report(null, null))
})

// ---------- para ----------

test('formatMoney', () => {
  assert.equal(formatMoney(977075), '9.770,75 ₺')
  assert.equal(formatMoney(0), '0,00 ₺')
  assert.equal(formatMoney(5), '0,05 ₺')
  assert.equal(formatMoney(51000), '510,00 ₺')
  assert.equal(formatMoney(100000), '1.000,00 ₺')
  assert.equal(formatMoney(123456789), '1.234.567,89 ₺')
  assert.equal(formatMoney(-172425), '-1.724,25 ₺')
  assert.equal(formatMoney(NaN), '0,00 ₺')
  assert.equal(formatMoney(undefined), '0,00 ₺')
})

test('parseMoney', () => {
  assert.equal(parseMoney('1.570,00'), 157000)
  assert.equal(parseMoney('1570.00'), 157000)
  assert.equal(parseMoney('1570'), 157000)
  assert.equal(parseMoney('9 770,75 ₺'), 977075)
  assert.equal(parseMoney('9.770,75 TL'), 977075)
  assert.equal(parseMoney('1,570.00'), 157000)
  assert.equal(parseMoney('12,5'), 1250)
  assert.equal(parseMoney('0,05'), 5)
  assert.equal(parseMoney('0'), 0)
  assert.equal(parseMoney('1.570'), 157000) // 3'lü grup binliktir
  assert.equal(parseMoney('1.234.567,89'), 123456789)
  assert.equal(parseMoney(12.5), 1250)
  for (const k of [
    '',
    '  ',
    'abc',
    '12,345,6',
    '1.570.00',
    '1,234,56',
    '0.500',
    '1..2',
    ',50',
    '-5',
    '1e3',
    '12,3,4',
    '1.23.456',
    '₺',
    null,
    {},
    NaN,
  ]) {
    assert.equal(parseMoney(k), null, String(k))
  }
  for (const n of [0, 1, 99, 100, 977075, 123456789]) assert.equal(parseMoney(formatMoney(n)), n)
})

// ---------- fiş metni ----------

test('parseReceiptText: gerçek fiş metni', () => {
  const r = parseReceiptText(FIS_METNI)
  assert.equal(r.items.length, 17)
  assert.equal(
    r.items.reduce((a, it) => a + it.qty * it.unit, 0),
    1149500,
  )
  assert.equal(r.subtotal, 1149500)
  assert.equal(r.total, 977075)
  assert.deepEqual(r.items[0], { name: 'Kucuk Pasta Cilekli', qty: 1, unit: 140000 })
  assert.deepEqual(r.items[3], { name: 'DONER HUMUS SALATA 100 GR', qty: 2, unit: 78500 })
  assert.deepEqual(r.items[4], { name: 'Ayran Paket', qty: 2, unit: 12000 })
  assert.deepEqual(r.items[10], { name: 'CITIR TAV.SEZAR SALATA', qty: 2, unit: 60000 })
  assert.deepEqual(r.items[11], { name: '1.5 Doner Porsiyon', qty: 1, unit: 92000 })
  assert.deepEqual(r.items[16], { name: 'Corba', qty: 1, unit: 20000 })
  assert.ok(r.items.every((it) => !/VISNE|ALDIM|YIYECEK|ICECEK|TUTAR|INDIRIM/.test(it.name)))
  // çıktı doğrudan fişe dönüşebilir
  const bill = normalizeBill({ id: 'metin', total: r.total, items: r.items })
  assert.equal(bill.items.length, 17)
  assert.equal(bill.total, 977075)
  // Windows satır sonları ve sekmeler de aynı sonucu verir
  assert.deepEqual(parseReceiptText(FIS_METNI.replace(/\n/g, '\r\n').replace(/ (?=\d)/g, '\t')), r)
})

test('parseReceiptText: diğer satır biçimleri', () => {
  const r = parseReceiptText(
    [
      'KÖŞE LOKANTASI',
      'Tarih: 01.02.2026 Saat: 20:15',
      'Tel 0212 555 00 00',
      '2 x Ayran 240,00',
      '3x Çay 45,00',
      'Künefe 180,00',
      'Karışık Izgara 1.250,50',
      'Su 0,00',
      'Şiş Kebap 2 450,00 900,00 ₺',
      'İskender 320,00 320,00',
      'KDV %10 250,00',
      'TOPLAM KDV 250,00',
      'TOPLAM 2.935,50',
      'GENEL TOPLAM 2.800,00',
      'KREDI KARTI 2.800,00',
    ].join('\n'),
  )
  assert.deepEqual(r.items, [
    { name: 'Ayran', qty: 2, unit: 12000 },
    { name: 'Çay', qty: 3, unit: 1500 },
    { name: 'Künefe', qty: 1, unit: 18000 },
    { name: 'Karışık Izgara', qty: 1, unit: 125050 },
    { name: 'Şiş Kebap', qty: 2, unit: 45000 },
    { name: 'İskender', qty: 1, unit: 32000 },
  ])
  assert.equal(r.total, 280000)
  assert.equal(r.subtotal, null)
})

test('parseReceiptText: hiçbir şey bulunamazsa boş döner', () => {
  const bos = { items: [], total: null, subtotal: null }
  assert.deepEqual(parseReceiptText(''), bos)
  assert.deepEqual(parseReceiptText('merhaba\ndünya\n12345'), bos)
  for (const x of [null, undefined, 5, {}, []]) assert.deepEqual(parseReceiptText(x), bos)
  // çok uzun metin: en çok 99 kalem
  const uzun = Array.from({ length: 5000 }, (_, i) => `Kalem ${i} 1 10.00 10.00`).join('\n')
  assert.ok(parseReceiptText(uzun).items.length <= 99)
})

test('yön değiştiren ve görünmez karakterler adlardan atılır', () => {
  // U+202E (sağdan sola zorla) adın yanındaki tutarı ekranda ters çevirebilir.
  const r = normalizeResp(ORNEK_FIS, { name: '\u202eAli\u2066\u200b \u200fVeli\ufeff', picks: { 0: 1 } })
  assert.equal(r.name, 'Ali Veli')
  assert.equal(normalizeResp(ORNEK_FIS, { name: '\u202e\u200b\u2069', picks: {} }), null)
  assert.equal(nameKey('\u202eALİ'), nameKey('ali'))
  const b = normalizeBill({ ...ORNEK_FIS, title: 'Lokanta\u202e', items: [{ name: 'Çay\u202d', qty: 1, unit: 100 }] })
  assert.equal(b.title, 'Lokanta')
  assert.equal(b.items[0].name, 'Çay')
  // emoji birleştirici (ZWJ) korunur
  assert.equal(normalizeResp(ORNEK_FIS, { name: '👩‍👧', picks: {} }).name, '👩‍👧')
})

test('99 kişilik sonuç: Σ due + left === total ve kimse düşmez', () => {
  const resps = Array.from({ length: 99 }, (_, i) => ({ name: 'K' + i, picks: { [i % 16]: 1 } }))
  const back = decodeAll(ORNEK_FIS, encodeAll(ORNEK_FIS, resps))
  assert.equal(back.length, 99)
  const c = calc(ORNEK_FIS, back)
  assert.equal(c.people.reduce((a, p) => a + p.due, 0) + c.left, ORNEK_FIS.total)
})

// ---------- bağlantı sıkıştırma ----------

/** Sıkıştırmasız (eski) kod: base64url(JSON). Çözücü ikisini de okumalı. */
function duzKod(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

test('sıkıştırma: örnek fişin misafir bağlantısı kısalır ve aynen geri açılır', () => {
  const kod = encodeBill(ORNEK_FIS)
  assert.equal(kod[0], 'z')
  assert.deepEqual(decodeBill(kod), ORNEK_FIS)
  const duz = duzKod([
    1,
    ORNEK_FIS.id,
    ORNEK_FIS.title,
    ORNEK_FIS.meta,
    ORNEK_FIS.people,
    ORNEK_FIS.total,
    ORNEK_FIS.note,
    ORNEK_FIS.items.map((it) => [it.name, it.qty, it.unit]),
  ])
  assert.ok(kod.length < duz.length * 0.7, `sıkıştırılmış ${kod.length}, düz ${duz.length}`)
  // Gerçek adresle tam bağlantı QR sürüm 16 sınırının (586 bayt, L düzeyi) altında kalmalı: 81 modül.
  const url = buildUrl('https://yilmazfatih-cyber.github.io/Deneme/fis/', { b: kod })
  assert.ok(url.length <= 586, `bağlantı ${url.length} karakter`)
})

test('sıkıştırma: düz (sıkıştırmasız) kodlar da okunur', () => {
  const duz = duzKod([1, 'abc123', 'Kafe', '', 2, 5000, '', [['Çay', 2, 2500]]])
  assert.equal(duz[0], 'W')
  const bill = decodeBill(duz)
  assert.equal(bill.title, 'Kafe')
  assert.equal(bill.items[0].name, 'Çay')
  assert.deepEqual(decodeResp(bill, duzKod([1, 'abc123', 'Işıl', [[0, 1]]])), { name: 'Işıl', picks: { 0: 1 } })
})

test('sıkıştırma: kısa veride düz kod seçilir, yanıt ve sonuç da gidip gelir', () => {
  const bill = normalizeBill({ id: 'k1', title: 'K', total: 100, items: [{ name: 'Su', qty: 1, unit: 100 }] })
  const r = encodeResp(bill, { name: 'A', picks: { 0: 1 } })
  assert.equal(r[0], 'W') // 20 baytlık veri sıkışınca uzar; düz kalır
  assert.deepEqual(decodeResp(bill, r), { name: 'A', picks: { 0: 1 } })
  const resps = Array.from({ length: 10 }, (_, i) => ({ name: `Kişi ${i + 1}`, picks: { 0: 1 } }))
  assert.deepEqual(decodeAll(bill, encodeAll(bill, resps)), resps)
})

test('sıkıştırma: açılınca şişen ve bozuk sıkıştırılmış kodlar reddedilir', async () => {
  const { deflateSync } = await import('./vendor/fflate.mjs')
  const b64 = (bytes) => Buffer.from(bytes).toString('base64url')
  // 5 MB'lik geçerli JSON (dev bir başlık) birkaç KB'ye sıkışır; açılırken sınırı aşar, null dönmeli.
  const dev = new TextEncoder().encode(JSON.stringify([1, 'x', 'A'.repeat(5_000_000), '', 0, 1, '', [['a', 1, 1]]]))
  const bomba = 'z' + b64(deflateSync(dev, { level: 9 }))
  assert.ok(bomba.length < 64_000)
  assert.equal(decodeBill(bomba), null)
  const iyi = encodeBill(ORNEK_FIS)
  assert.equal(decodeBill(iyi.slice(0, 40)), null) // kesik
  assert.equal(decodeBill('z'), null)
  assert.equal(decodeBill('z' + 'A'.repeat(500)), null)
  assert.equal(decodeBill('z' + iyi.slice(1).split('').reverse().join('')), null)
  assert.deepEqual(decodeAll(ORNEK_FIS, bomba), [])
  assert.equal(decodeResp(ORNEK_FIS, bomba), null)
})
