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
  // c'nin 50'si: a'ya 37,50, b'ye 12,50. b'nin 25'i a'ya 18,75; a'nın 25'i b'ye 6,25 → b→a net 12,50
  const find = (f, t) => d.find((x) => x.from === f && x.to === t)?.amount
  assert.equal(find('c', 'a'), 3750)
  assert.equal(find('c', 'b'), 1250)
  assert.equal(find('b', 'a'), 1250)
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
