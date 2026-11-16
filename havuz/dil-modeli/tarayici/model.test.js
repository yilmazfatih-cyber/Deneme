// JS ileri geçişinin ve üretiminin Python ile eşliği (vektörler: scripts/tarayici_sinama.py).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { generateIds, generateText } from './generate.js'
import { HAS_EXAMPLE, SINAMA, loadExample, loadFixture, readJson } from './test-yardimci.js'

const TOLERANCE = 1e-3

function maxDifference(model, vectors) {
  const cache = model.newCache()
  let worst = 0
  vectors.logits.ids.forEach((token, position) => {
    const logits = model.forward(token, cache)
    const expected = vectors.logits.positions[position - (vectors.logits.ids.length - vectors.logits.positions.length)]
    if (!expected) return
    expected.forEach((value, i) => {
      worst = Math.max(worst, Math.abs(value - logits[i]))
    })
  })
  return worst
}

function checkGreedy(model, vectors) {
  for (const { prompt, penalty, steps, output } of vectors.greedy) {
    const options = { temperature: 0, repetitionPenalty: penalty, maxNewTokens: steps }
    assert.deepEqual([...generateIds(model, prompt, options)], output)
  }
}

const fixtureVectors = readJson(`${SINAMA}vektorler.json`)
const fixture = await loadFixture()

test('sınama modeli: logitler tolerans içinde (float16, GQA, ayrı çıkış)', (t) => {
  const worst = maxDifference(fixture.model, fixtureVectors)
  t.diagnostic(`en büyük logit farkı: ${worst.toExponential(2)}`)
  assert.ok(worst < TOLERANCE, `fark ${worst}`)
})

test('sınama modeli: açgözlü üretim bire bir aynı (bağlam kaydırma dahil)', () => {
  assert.ok(fixtureVectors.greedy[0].steps > fixture.model.config.max_seq_len)
  checkGreedy(fixture.model, fixtureVectors)
})

test('akış geri çağrısı metni parça parça verir', async () => {
  const { model, tokenizer } = fixture
  const prompt = fixtureVectors.greedy[0].prompt
  const pieces = []
  const result = await generateText(model, tokenizer, prompt, { temperature: 0, maxNewTokens: 30 }, (p) =>
    pieces.push(p),
  )
  const expected = tokenizer.decode(fixtureVectors.greedy[0].output.slice(0, 30))
  assert.equal(pieces.join(''), result.text)
  assert.equal(result.text, expected)
  assert.equal(result.tokens, 30)
  assert.equal(result.finishReason, 'length')
})

test('tohumlu örnekleme tekrarlanabilir', () => {
  const { model } = fixture
  const options = { temperature: 1, topK: 20, topP: 0.9, maxNewTokens: 20, seed: 7 }
  const first = [...generateIds(model, [0, 50], options)]
  assert.deepEqual([...generateIds(model, [0, 50], options)], first)
  assert.notDeepEqual([...generateIds(model, [0, 50], { ...options, seed: 8 })], first)
})

test(
  'örnek model (int8): logitler ve açgözlü üretim',
  { skip: !HAS_EXAMPLE && 'örnek model paketlenmemiş' },
  async (t) => {
    const vectors = readJson(`${SINAMA}ornek-model.json`)
    const { model, tokenizer } = await loadExample()
    const worst = maxDifference(model, vectors)
    t.diagnostic(`en büyük logit farkı: ${worst.toExponential(2)}`)
    assert.ok(worst < TOLERANCE, `fark ${worst}`)
    checkGreedy(model, vectors)
    const text = tokenizer.decode(vectors.greedy[0].output)
    t.diagnostic(`örnek çıktı: ${JSON.stringify(text)}`)
  },
)
