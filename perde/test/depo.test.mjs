import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore, MAX_AUTO_VERSIONS } from '../public/depo.mjs'
import { createSSEParser } from '../public/akis.mjs'

function fakeStorage(limit = Infinity) {
  const m = new Map()
  return {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      if ([...m.values()].join('').length + v.length > limit) throw new Error('QuotaExceededError')
      m.set(k, v)
    },
    removeItem: (k) => void m.delete(k),
  }
}

test('proje oluştur / kaydet / yükle / sil', () => {
  const s = createStore(fakeStorage(), () => 1000)
  assert.equal(s.currentId(), null)
  const a = s.create({ title: 'Birinci', elements: [{ type: 'scene', text: 'İÇ. EV - GÜN' }] })
  const b = s.create({ title: '  ' })
  assert.equal(b.title, 'Adsız senaryo')
  assert.deepEqual(
    s.list().map((p) => p.title),
    ['Birinci', 'Adsız senaryo'],
  )
  assert.equal(s.currentId(), a.id)
  s.setCurrent(b.id)
  assert.equal(s.currentId(), b.id)
  assert.deepEqual(s.load(a.id).elements, [{ type: 'scene', text: 'İÇ. EV - GÜN' }])
  s.remove(b.id)
  assert.equal(s.currentId(), a.id)
  assert.equal(s.load(b.id), null)
})

test('sürümler: elle kaydedilenler asla atılmaz, otomatikler sınırlanır', () => {
  let t = 0
  const s = createStore(fakeStorage(), () => ++t)
  const p = s.create({ title: 'X', elements: [{ type: 'action', text: 'a' }] })
  s.addVersion(p, 'Elle', false)
  for (let i = 0; i < MAX_AUTO_VERSIONS + 5; i++) s.addVersion(p, 'oto ' + i, true)
  assert.equal(p.versions.filter((v) => v.auto).length, MAX_AUTO_VERSIONS)
  assert.equal(p.versions.filter((v) => !v.auto).length, 1)
  assert.equal(p.versions[0].label, 'oto ' + (MAX_AUTO_VERSIONS + 4), 'en yeni başta')
  // anlık görüntü sonradan değişen modelden bağımsız
  p.elements[0].text = 'değişti'
  assert.equal(p.versions.at(-1).elements[0].text, 'a')
  s.removeVersion(p, p.versions[0].id)
  assert.equal(p.versions.length, MAX_AUTO_VERSIONS)
})

test('kota dolunca save false döner (sessizce yutmaz)', () => {
  const s = createStore(fakeStorage(400))
  const p = s.create({ title: 'K' })
  p.elements = [{ type: 'action', text: 'x'.repeat(2000) }]
  assert.equal(s.save(p), false)
})

test('SSE ayrıştırıcı parça sınırlarında doğru çalışır', () => {
  const got = []
  const p = createSSEParser((e) => got.push(e))
  const payload = 'data: {"type":"text","text":"Şevket"}\n\ndata: {"type":"done"}\n\n'
  for (const ch of payload) p.feed(ch)
  assert.deepEqual(got, [{ type: 'text', text: 'Şevket' }, { type: 'done' }])
  p.feed(': yorum\n\ndata: bozuk\n\n')
  assert.equal(got.length, 2)
})
