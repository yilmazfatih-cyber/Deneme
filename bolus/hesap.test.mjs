// Çalıştır: node --test bolus/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseAmount,
  formatAmount,
  distribute,
  splitEqual,
  splitExact,
  splitPercent,
  splitShares,
  computeShares,
  validatePayers,
  netBalances,
  pairwiseDebts,
  simplifyDebts,
  totals,
} from './hesap.mjs'

test('parseAmount Türkçe ve İngilizce biçimleri okur', () => {
  assert.equal(parseAmount('12,50'), 1250)
  assert.equal(parseAmount('12.50'), 1250)
  assert.equal(parseAmount('1.250,75'), 125075)
  assert.equal(parseAmount('1,250.75'), 125075)
  assert.equal(parseAmount(' 300 ₺ '), 30000)
  assert.equal(parseAmount('0,1'), 10)
  assert.equal(parseAmount(''), null)
  assert.equal(parseAmount('abc'), null)
  assert.equal(parseAmount('1,234'), null) // üç ondalık geçersiz
  assert.equal(parseAmount(12.5), 1250)
})

test('formatAmount tr-TR para biçimi', () => {
  assert.match(formatAmount(125075), /1\.250,75/)
  assert.ok(formatAmount(-500).startsWith('-'))
  assert.ok(formatAmount(500, 'TRY', { sign: true }).startsWith('+'))
})

test('distribute toplamı kuruşu kuruşuna korur', () => {
  const r = distribute(1000, { a: 1, b: 1, c: 1 })
  assert.equal(r.a + r.b + r.c, 1000)
  assert.deepEqual(Object.values(r).sort(), [333, 333, 334])
  const r2 = distribute(100, { a: 1, b: 2 })
  assert.deepEqual(r2, { a: 33, b: 67 })
})

test('splitEqual artan kuruşları dağıtır', () => {
  const r = splitEqual(1001, ['a', 'b', 'c', 'd'])
  assert.equal(
    Object.values(r).reduce((x, y) => x + y),
    1001,
  )
  assert.equal(Object.values(r).filter((v) => v === 251).length, 1)
})

test('splitExact toplam uyuşmazsa hata verir', () => {
  assert.deepEqual(splitExact(1000, { a: 400, b: 600, c: 0 }), { a: 400, b: 600 })
  assert.throws(() => splitExact(1000, { a: 400, b: 500 }), /eşit değil/)
})

test('splitPercent 100 olmalı', () => {
  assert.deepEqual(splitPercent(1000, { a: 50, b: 50 }), { a: 500, b: 500 })
  assert.deepEqual(splitPercent(1000, { a: '33.33', b: '66.67' }), { a: 333, b: 667 })
  assert.throws(() => splitPercent(1000, { a: 60, b: 50 }), /100 olmalı/)
})

test('splitShares hisselere göre böler', () => {
  assert.deepEqual(splitShares(3000, { a: 2, b: 1 }), { a: 2000, b: 1000 })
  assert.throws(() => splitShares(3000, { a: 0 }), /hisse/i)
})

test('computeShares türe göre yönlendirir', () => {
  assert.deepEqual(computeShares({ amount: 1000, splitType: 'equal', splitInput: { a: true, b: true, c: false } }), {
    a: 500,
    b: 500,
  })
})

test('validatePayers', () => {
  assert.ok(validatePayers(1000, { a: 1000 }))
  assert.throws(() => validatePayers(1000, { a: 600, b: 300 }), /eşit değil/)
})

const giderler = [
  // Ali 300 ödedi, üçe bölündü
  { kind: 'expense', amount: 30000, payers: { ali: 30000 }, shares: { ali: 10000, ayse: 10000, can: 10000 } },
  // Ayşe 90 ödedi, Ayşe + Can
  { kind: 'expense', amount: 9000, payers: { ayse: 9000 }, shares: { ayse: 4500, can: 4500 } },
  // Can Ali'ye 50 ödedi
  { kind: 'payment', amount: 5000, payers: { can: 5000 }, shares: { ali: 5000 } },
]

test('netBalances', () => {
  const net = netBalances(giderler, ['ali', 'ayse', 'can'])
  assert.deepEqual(net, { ali: 15000, ayse: -5500, can: -9500 })
  assert.equal(
    Object.values(net).reduce((a, b) => a + b),
    0,
  )
})

test('pairwiseDebts çiftleri netleştirir', () => {
  const d = pairwiseDebts(giderler)
  const find = (f, t) => d.find((x) => x.from === f && x.to === t)?.amount
  assert.equal(find('ayse', 'ali'), 10000)
  assert.equal(find('can', 'ali'), 5000) // 100 − 50 ödeme
  assert.equal(find('can', 'ayse'), 4500)
  assert.equal(d.length, 3)
})

test('pairwiseDebts birden çok ödeyende oranla böler', () => {
  const d = pairwiseDebts([{ amount: 10000, payers: { a: 7500, b: 2500 }, shares: { a: 2500, b: 2500, c: 5000 } }])
  // Harcama içinde net: a +50 (75 ödedi, payı 25), b 0, c −50 → yalnızca c→a 50
  const find = (f, t) => d.find((x) => x.from === f && x.to === t)?.amount
  assert.equal(find('c', 'a'), 5000)
  assert.equal(d.length, 1)
  // İki alacaklı: a 60 ödedi, b 40 ödedi, pay c 100 → c→a 60, c→b 40
  const d2 = pairwiseDebts([{ amount: 10000, payers: { a: 6000, b: 4000 }, shares: { c: 10000 } }])
  assert.deepEqual(
    d2.sort((x, y) => x.to.localeCompare(y.to)),
    [
      { from: 'c', to: 'a', amount: 6000 },
      { from: 'c', to: 'b', amount: 4000 },
    ],
  )
})

test('simplifyDebts en az ödemeyle kapatır', () => {
  const net = netBalances(giderler, ['ali', 'ayse', 'can'])
  const s = simplifyDebts(net)
  assert.equal(s.length, 2)
  assert.deepEqual(s, [
    { from: 'can', to: 'ali', amount: 9500 },
    { from: 'ayse', to: 'ali', amount: 5500 },
  ])
  // Uygulanınca herkes sıfırlanır
  const after = { ...net }
  for (const t of s) {
    after[t.from] += t.amount
    after[t.to] -= t.amount
  }
  assert.ok(Object.values(after).every((v) => v === 0))
})

test('simplifyDebts zincirleri kısaltır', () => {
  // a→b 100, b→c 100 → sadece a→c 100
  const s = simplifyDebts({ a: -10000, b: 0, c: 10000 })
  assert.deepEqual(s, [{ from: 'a', to: 'c', amount: 10000 }])
})

test('totals ödemeleri saymaz', () => {
  const t = totals(giderler)
  assert.equal(t.total, 39000)
  assert.equal(t.paid.ali, 30000)
  assert.equal(t.share.can, 14500)
})

import { normalizeGroup, formatNumber, formatDate } from './hesap.mjs'

test('pairwiseDebts çok ödeyende netBalances ile tutarlı (1 kuruş artık kalmaz)', () => {
  const entries = [
    { amount: 10000, payers: { ali: 5000, ayse: 5000 }, shares: splitEqual(10000, ['ali', 'ayse', 'can']) },
  ]
  const net = netBalances(entries, ['ali', 'ayse', 'can'])
  const after = { ...net }
  for (const d of pairwiseDebts(entries)) {
    after[d.from] += d.amount
    after[d.to] -= d.amount
  }
  assert.ok(
    Object.values(after).every((v) => v === 0),
    JSON.stringify({ net, after }),
  )
})

test('pairwiseDebts rastgele çok ödeyenli girdilerde her zaman kapanır', () => {
  let seed = 7
  const rnd = (n) => (seed = (seed * 48271) % 2147483647) % n
  const ids = ['a', 'b', 'c', 'd']
  for (let t = 0; t < 300; t++) {
    const entries = []
    for (let k = 0; k < 1 + rnd(4); k++) {
      const amount = 1 + rnd(5000)
      const payerIds = ids.filter(() => rnd(2)).concat(ids[rnd(4)])
      const w = {}
      for (const p of new Set(payerIds)) w[p] = 1 + rnd(5)
      const payers = distribute(amount, w)
      const sharers = ids.filter(() => rnd(3) > 0).concat(ids[rnd(4)])
      const shares = splitEqual(amount, [...new Set(sharers)])
      entries.push({ amount, payers, shares })
    }
    const net = netBalances(entries, ids)
    const after = { ...net }
    for (const d of pairwiseDebts(entries)) {
      assert.ok(d.amount > 0)
      after[d.from] += d.amount
      after[d.to] -= d.amount
    }
    assert.ok(
      Object.values(after).every((v) => v === 0),
      JSON.stringify({ entries, net, after }),
    )
  }
})

test('distribute geçersiz girdide donmaz, hata verir', () => {
  assert.throws(() => distribute(12.5, { a: 1, b: 1 }), /tam sayı/)
  assert.deepEqual(distribute(100, { a: Infinity }), {})
  assert.deepEqual(distribute(100, { a: 1, b: NaN, c: -1 }), { a: 100 })
})

test('hata metinleri Türkçe sayı biçiminde', () => {
  assert.throws(() => splitExact(10000, { a: 1250 }), /12,50.*100,00/)
  assert.throws(() => splitPercent(1000, { a: 33.33, b: 33.33, c: 33.33 }), /99,99/)
  assert.equal(formatNumber(125075), '1.250,75')
})

test('formatDate geçersiz tarihte boş döner', () => {
  assert.equal(formatDate('2026-11-02"><img src=x>'), '')
  assert.equal(formatDate(undefined), '')
  assert.ok(formatDate('2026-11-02').includes('2026'))
})

test('normalizeGroup bozuk veriyi temizler', () => {
  assert.throws(() => normalizeGroup({ name: 'Ev' }), /tanınmadı/)
  assert.throws(() => normalizeGroup({ id: '"><img>' }), /tanınmadı/)
  const g = normalizeGroup({
    id: 'g1',
    name: '  Ev  ',
    currency: '<img src=x onerror=alert(1)>',
    meId: 'zzz',
    members: [
      { id: 'a', name: 'Ali' },
      { id: 'b', name: 'Ayşe' },
      { id: 'bad id', name: 'X' },
      { id: 'a', name: 'Dup' },
      'junk',
    ],
    entries: [
      {
        id: 'e1',
        amount: 1000,
        date: '2026-01-05',
        payers: { a: 1000 },
        shares: { a: 500, b: 500 },
        splitType: 'equal',
        splitInput: { a: true, b: true },
      },
      {
        id: 'e2',
        amount: 1000,
        date: 'x"><s>',
        payers: { a: 1000 },
        shares: { a: 500, b: 500 },
        splitType: 'weird',
        splitInput: 5,
      },
      { id: 'e3', amount: 12.5, payers: { a: 12.5 }, shares: { b: 12.5 } },
      { id: 'e4', amount: 1000, payers: { a: 500 }, shares: { b: 1000 } },
      { id: 'e5', kind: 'payment', amount: 300, payers: { a: 300 }, shares: { b: 300 }, date: '2026-02-02' },
      {
        id: 'e6',
        amount: 1000,
        payers: { a: 1000 },
        shares: { b: 1000, ghost: 0 },
        splitType: 'equal',
        splitInput: { b: true, ghost: true },
      },
    ],
    deleted: { e9: 123, '"><': 1, e8: 'no' },
  })
  assert.equal(g.name, 'Ev')
  assert.equal(g.currency, 'TRY')
  assert.equal(g.meId, null)
  assert.deepEqual(
    g.members.map((m) => m.id),
    ['a', 'b'],
  )
  assert.deepEqual(
    g.entries.map((e) => e.id),
    ['e1', 'e2', 'e5', 'e6'],
  )
  const e2 = g.entries[1]
  assert.match(e2.date, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(e2.splitType, 'exact')
  assert.deepEqual(e2.splitInput, { a: 500, b: 500 })
  assert.equal(g.entries[2].kind, 'payment')
  // e6: splitInput'taki hayalet üye atılır, kalan eşit bölüşme shares ile uyuşur
  assert.equal(g.entries[3].splitType, 'equal')
  assert.deepEqual(g.entries[3].splitInput, { b: true })
  assert.deepEqual(g.entries[3].shares, { b: 1000 })
  assert.deepEqual(g.deleted, { e9: 123 })
})
