import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Trie } from '../src/trie.js'

const words = ['kitap', 'kitaplık', 'kira', 'kiraz', 'şeker', 'şehir']

test('insert, has, startsWith', () => {
  const trie = new Trie()
  for (const word of words) trie.insert(word)
  trie.insert('kitap')
  assert.equal(trie.size, 6)
  assert.equal(trie.has('kitap'), true)
  assert.equal(trie.has('kit'), false, 'önek tek başına kelime değildir')
  assert.equal(trie.startsWith('kit'), true)
  assert.equal(trie.startsWith('şe'), true)
  assert.equal(trie.startsWith('x'), false)
})

test('wordsWithPrefix sıralı ve sınırlı sonuç verir', () => {
  const trie = new Trie()
  for (const word of words) trie.insert(word)
  assert.deepEqual(trie.wordsWithPrefix('ki'), ['kira', 'kiraz', 'kitap', 'kitaplık'])
  assert.deepEqual(trie.wordsWithPrefix('ki', 2), ['kira', 'kiraz'])
  assert.deepEqual(trie.wordsWithPrefix('şe'), ['şehir', 'şeker'])
  assert.deepEqual(trie.wordsWithPrefix('yok'), [])
})

test('delete yalnızca kelimeyi siler, paylaşılan öneki korur ve boş dalları budar', () => {
  const trie = new Trie()
  for (const word of words) trie.insert(word)
  assert.equal(trie.delete('kitap'), true)
  assert.equal(trie.has('kitap'), false)
  assert.equal(trie.has('kitaplık'), true)
  assert.equal(trie.delete('kitaplık'), true)
  assert.equal(trie.startsWith('kit'), false, 'artık kimseye hizmet etmeyen dal budanmalı')
  assert.equal(trie.startsWith('kir'), true)
  assert.equal(trie.delete('ki'), false)
  assert.equal(trie.size, 4)
})

test('Türkçe büyük/küçük harf: eşitlemeyi çağıran yapar', () => {
  const trie = new Trie()
  trie.insert('ışık'.toLocaleLowerCase('tr-TR'))
  assert.equal(trie.has('IŞIK'.toLocaleLowerCase('tr-TR')), true)
  assert.equal(trie.has('IŞIK'.toLowerCase()), false, 'dilden bağımsız toLowerCase "I"yı "i" yapar')
  assert.throws(() => trie.insert(''), TypeError)
})
