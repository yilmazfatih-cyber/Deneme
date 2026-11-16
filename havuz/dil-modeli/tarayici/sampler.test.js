// Örnekleme kuralları ve durdurma denetimi (Python'daki tests/test_sampling.py ile aynı durumlar).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { StopChecker } from './generate.js'
import { applyRepetitionPenalty, argmax, makeRandom, sampleToken } from './sampler.js'

const logitsOf = (probs) => Float32Array.from(probs.map(Math.log))

function frequencies(probs, options, draws = 20000) {
  const random = makeRandom(1)
  const counts = new Array(probs.length).fill(0)
  for (let i = 0; i < draws; i++) counts[sampleToken(logitsOf(probs), [], options, random)]++
  return counts.map((c) => c / draws)
}

test('açgözlü seçim ve yineleme cezası', () => {
  assert.equal(argmax([0.1, 0.9, 0.3]), 1)
  const logits = Float32Array.from([2, -2, 1, -1])
  applyRepetitionPenalty(logits, [0, 1, 0], 2)
  assert.deepEqual([...logits], [1, -4, 1, -1])
  assert.equal(sampleToken(Float32Array.from([2, 1, 0]), [0], { temperature: 0, repetitionPenalty: 10 }), 1)
})

test('dağılıma uyar; sıcaklık sivriltir; top-k ve top-p keser', () => {
  const probs = [0.5, 0.25, 0.15, 0.1]
  frequencies(probs, { temperature: 1 }).forEach((f, i) => assert.ok(Math.abs(f - probs[i]) < 0.015))
  const sharp = probs.map((p) => p * p)
  const total = sharp.reduce((a, b) => a + b)
  frequencies(probs, { temperature: 0.5 }).forEach((f, i) => assert.ok(Math.abs(f - sharp[i] / total) < 0.015))
  const topK = frequencies(probs, { temperature: 1, topK: 2 })
  assert.equal(topK[2] + topK[3], 0)
  assert.ok(Math.abs(topK[0] - 2 / 3) < 0.015)
  const topP = frequencies([0.15, 0.5, 0.05, 0.3], { temperature: 1, topP: 0.7 })
  assert.equal(topP[0] + topP[2], 0)
  assert.equal(frequencies([0.15, 0.5, 0.05, 0.3], { temperature: 1, topP: 0.01 })[1], 1)
})

test('aynı tohum aynı sırayı verir', () => {
  const a = makeRandom(42)
  const b = makeRandom(42)
  for (let i = 0; i < 10; i++) assert.equal(a(), b())
  assert.notEqual(makeRandom(1)(), makeRandom(2)())
})

test('durdurma yazısı: kısmi eşleşme bekletilir, bulununca kesilir', () => {
  const checker = new StopChecker(['\n\n', 'SON'])
  assert.deepEqual(checker.feed('merhaba S'), { ready: 'merhaba ', stopped: false })
  assert.deepEqual(checker.feed('O'), { ready: '', stopped: false })
  assert.deepEqual(checker.feed('ru'), { ready: 'SOru', stopped: false })
  assert.deepEqual(checker.feed(' bitti\n'), { ready: ' bitti', stopped: false })
  assert.deepEqual(checker.feed('\nsonrası'), { ready: '', stopped: true })
})
