import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HashTable, charCodeSum, fnv1a } from '../src/hash-table.js'

test('set, get, has, delete', () => {
  const table = new HashTable()
  table.set('elma', 3).set('armut', 5).set('elma', 4)
  assert.equal(table.get('elma'), 4)
  assert.equal(table.size, 2)
  assert.equal(table.has('armut'), true)
  assert.equal(table.delete('armut'), true)
  assert.equal(table.delete('armut'), false)
  assert.equal(table.get('armut'), undefined)
  assert.equal(table.size, 1)
})

test('doluluk 0.75i geçince kova sayısı ikiye katlanır ve hiçbir şey kaybolmaz', () => {
  const table = new HashTable(4)
  for (let i = 0; i < 100; i += 1) table.set(`anahtar-${i}`, i)
  assert.ok(table.loadFactor <= 0.75)
  assert.equal(table.capacity, 256)
  for (let i = 0; i < 100; i += 1) assert.equal(table.get(`anahtar-${i}`), i)
  assert.equal(table.keys().length, 100)
  assert.equal(
    table.values().reduce((a, b) => a + b, 0),
    4950,
  )
})

test('çakışmalar zincirde çözülür (her şeyi aynı kovaya atan hash ile)', () => {
  const table = new HashTable(8, () => 0)
  table.set('a', 1).set('b', 2).set('c', 3)
  assert.equal(table.get('b'), 2)
  assert.equal(table.delete('a'), true)
  assert.deepEqual(table.keys(), ['b', 'c'])
  assert.equal(Math.max(...table.bucketSizes()), 2)
})

test('karakter toplamı anagramlarda çakışır, FNV-1a çakışmaz', () => {
  assert.equal(charCodeSum('kalem'), charCodeSum('melak'))
  assert.notEqual(fnv1a('kalem'), fnv1a('melak'))
  assert.equal(fnv1a(''), 0x811c9dc5)
})

test('metin olmayan anahtar ve geçersiz kapasite reddedilir', () => {
  assert.throws(() => new HashTable().set(42, 'x'), TypeError)
  assert.throws(() => new HashTable(0), RangeError)
})
