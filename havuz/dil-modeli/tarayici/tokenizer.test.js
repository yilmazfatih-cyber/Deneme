// JS tokenizer'ın Python ile eşliği (vektörler: scripts/tarayici_sinama.py).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { HAS_EXAMPLE, ORNEK, SINAMA, readJson } from './test-yardimci.js'
import { pretokenize, sanitize, StreamDecoder, Tokenizer } from './tokenizer.js'

const vectors = readJson(`${SINAMA}vektorler.json`)
const tokenizer = new Tokenizer(readJson(`${SINAMA}tokenizer.json`))

test('kodlama Python ile bire bir aynı kimlikleri verir', () => {
  assert.ok(vectors.tokenizer.encode.length > 100)
  for (const { text, ids, special } of vectors.tokenizer.encode) {
    assert.deepEqual(tokenizer.encode(text), ids, JSON.stringify(text))
    assert.deepEqual(tokenizer.encode(text, { allowSpecial: true }), special, JSON.stringify(text))
  }
})

test('çözme Python ile aynı metni verir (geçersiz UTF-8 dahil)', () => {
  for (const { ids, text } of vectors.tokenizer.decode) {
    assert.equal(tokenizer.decode(ids, { skipSpecial: false }), text, JSON.stringify(ids))
  }
})

test('gidiş-dönüş ve özel belirteçler', () => {
  const text = "Iğdır'dan İzmir'e 🙂  çift boşluk\n"
  assert.equal(tokenizer.decode(tokenizer.encode(text)), text)
  const ids = tokenizer.encode('<|bas|>selam<|son|>', { allowSpecial: true })
  assert.equal(ids[0], tokenizer.specialId('<|bas|>'))
  assert.equal(ids.at(-1), tokenizer.specialId('<|son|>'))
  assert.equal(tokenizer.decode(ids), 'selam')
  assert.ok(!tokenizer.encode('<|son|>').includes(tokenizer.specialId('<|son|>')))
  assert.throws(() => tokenizer.specialId('<|yok|>'), /özel belirteci yok/)
  assert.throws(() => tokenizer.decode([tokenizer.vocabSize]), /sözlük dışında/)
})

test('ön-bölme kayıpsızdır ve vekil kod noktaları temizlenir', () => {
  for (const { text } of vectors.tokenizer.encode) assert.equal(pretokenize(text).join(''), text)
  assert.equal(sanitize('a\uD800b'), 'a�b')
  assert.equal(tokenizer.decode(tokenizer.encode('a\uD800b')), 'a�b')
})

test('akışla çözme yarım karakteri bekletir', () => {
  const ids = tokenizer.encode('🙂 ığüşöç')
  const decoder = new StreamDecoder(tokenizer)
  const pieces = ids.map((id) => decoder.push(id))
  pieces.push(decoder.flush())
  assert.equal(pieces.join(''), '🙂 ığüşöç')
  assert.equal(pieces[0], '') // emojinin ilk baytı tek başına gösterilmez
})

test("örnek modelin tokenizer'ı Python ile aynı", { skip: !HAS_EXAMPLE && 'örnek model paketlenmemiş' }, () => {
  const example = readJson(`${SINAMA}ornek-model.json`)
  const real = new Tokenizer(readJson(`${ORNEK}tokenizer.json`))
  for (const { text, ids, special } of example.tokenizer) {
    assert.deepEqual(real.encode(text), ids, JSON.stringify(text))
    assert.deepEqual(real.encode(text, { allowSpecial: true }), special)
  }
})
