import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LRUCache, MapLRUCache } from '../src/lru-cache.js'

for (const Cache of [LRUCache, MapLRUCache]) {
  test(`${Cache.name}: kapasite aşılınca en uzun süredir kullanılmayan atılır`, () => {
    const cache = new Cache(2)
    assert.equal(cache.set('a', 1), undefined)
    cache.set('b', 2)
    assert.equal(cache.get('a'), 1, 'a artık en yeni')
    assert.equal(cache.set('c', 3), 'b', 'en eski b atılmalı')
    assert.equal(cache.get('b'), undefined)
    assert.deepEqual(cache.keys(), ['c', 'a'])
    assert.equal(cache.size, 2)
  })

  test(`${Cache.name}: var olan anahtarı güncellemek atma yapmaz ve tazeler`, () => {
    const cache = new Cache(2)
    cache.set('a', 1)
    cache.set('b', 2)
    assert.equal(cache.set('a', 10), undefined)
    assert.equal(cache.set('c', 3), 'b')
    assert.equal(cache.get('a'), 10)
  })

  test(`${Cache.name}: geçersiz kapasite`, () => {
    assert.throws(() => new Cache(0), RangeError)
  })
}

test('LRUCache: has sırayı değiştirmez, delete bağlantıları onarır', () => {
  const cache = new LRUCache(3)
  cache.set('x', 1)
  cache.set('y', 2)
  cache.set('z', 3)
  assert.equal(cache.has('x'), true)
  assert.equal(cache.set('w', 4), 'x', 'has() x’i tazelememeli')
  assert.equal(cache.delete('z'), true)
  assert.equal(cache.delete('z'), false)
  assert.deepEqual(cache.keys(), ['w', 'y'])
  cache.set('v', 5)
  cache.set('u', 6)
  assert.deepEqual(cache.keys(), ['u', 'v', 'w'])
})
