import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, createRenderer, getSequence, Text } from '../src/asama2_vnode_patch.js'
import { createNodeOps, createRoot, serialize } from '../src/test_nodeops.js'

function kur() {
  const nodeOps = createNodeOps()
  const kok = createRoot()
  const { render } = createRenderer(nodeOps)
  return { nodeOps, kok, render }
}

const liste = (ids) =>
  h(
    'ul',
    null,
    ids.map((id) => h('li', { key: id, id }, id)),
  )

test('getSequence: en uzun artan alt dizinin indeksleri, 0 (yeni) atlanır', () => {
  assert.deepEqual(getSequence([2, 3, 1, 5]), [0, 1, 3]) // 2,3,5
  assert.deepEqual(getSequence([5, 3, 4, 0]), [1, 2]) // 3,4
  assert.deepEqual(getSequence([0, 0]), [])
  assert.deepEqual(getSequence([4, 1, 2, 3]), [1, 2, 3])
})

test('ilk render: alt ağaç ekran dışında kurulur, tek ekleme ile bağlanır', () => {
  const { nodeOps, kok, render } = kur()
  render(h('div', { id: 'kart' }, [h('h1', null, 'Başlık'), 'düz metin', liste(['a'])]), kok)
  assert.equal(serialize(kok), '<div id="kart"><h1>Başlık</h1>düz metin<ul><li id="a">a</li></ul></div>')
  assert.deepEqual(
    nodeOps.ops.filter((op) => op.startsWith('ekle')),
    ['ekle div#kart'],
  )
})

test('props ve metin farkı: yalnızca değişen yazılır', () => {
  const { nodeOps, kok, render } = kur()
  render(h('p', { id: 'p', class: 'eski', title: 'x' }, 'merhaba'), kok)
  nodeOps.ops.length = 0
  render(h('p', { id: 'p', class: 'yeni' }, 'merhaba dünya'), kok)
  assert.deepEqual(nodeOps.ops, ['prop p#p class=yeni', 'prop p#p title=null', 'eleman-metni p#p -> "merhaba dünya"'])
})

test('anahtarlı fark, 1–4. adımlar: baştan/sondan eşleşenler yamalanır, ortası eklenir ya da silinir', () => {
  const { nodeOps, kok, render } = kur()
  render(liste(['a', 'b', 'f', 'g']), kok)
  nodeOps.ops.length = 0
  render(liste(['a', 'b', 'c', 'd', 'f', 'g']), kok) // 3. adım: ekle
  assert.deepEqual(
    nodeOps.ops.filter((op) => !op.startsWith('oluştur')),
    ['ekle li#c', 'ekle li#d'],
  )
  nodeOps.ops.length = 0
  render(liste(['a', 'g']), kok) // 4. adım: sil
  assert.deepEqual(nodeOps.ops, ['sil li#b', 'sil li#c', 'sil li#d', 'sil li#f'])
  assert.equal(serialize(kok), '<ul><li id="a">a</li><li id="g">g</li></ul>')
})

test('5. adım ve LIS: a b [c d e] f g → a b [e c d h] f g yalnızca e taşınır, h eklenir', () => {
  const { nodeOps, kok, render } = kur()
  render(liste(['a', 'b', 'c', 'd', 'e', 'f', 'g']), kok)
  const ilk = [...kok.children[0].children]
  nodeOps.ops.length = 0
  render(liste(['a', 'b', 'e', 'c', 'd', 'h', 'f', 'g']), kok)
  assert.equal(
    serialize(kok),
    '<ul><li id="a">a</li><li id="b">b</li><li id="e">e</li><li id="c">c</li><li id="d">d</li><li id="h">h</li><li id="f">f</li><li id="g">g</li></ul>',
  )
  assert.deepEqual(
    nodeOps.ops.filter((op) => op.startsWith('ekle') || op.startsWith('taşı')),
    ['ekle li#h', 'taşı li#e'],
  )
  // React'in lastPlacedIndex yöntemi burada c ve d'yi taşırdı (2 taşıma); LIS c,d'yi yerinde bırakır.
  assert.ok(ilk.every((n) => kok.children[0].children.includes(n)))
})

test('son öğeyi başa almak: React 4 taşıma, Vue 1 taşıma', () => {
  const { nodeOps, kok, render } = kur()
  render(liste(['a', 'b', 'c', 'd', 'e']), kok)
  nodeOps.ops.length = 0
  render(liste(['e', 'a', 'b', 'c', 'd']), kok)
  assert.deepEqual(nodeOps.ops, ['taşı li#e'])
})

test('tamamen ters çevirme: LIS uzunluğu 1, n-1 taşıma', () => {
  const { nodeOps, kok, render } = kur()
  render(liste(['a', 'b', 'c', 'd']), kok)
  nodeOps.ops.length = 0
  render(liste(['d', 'c', 'b', 'a']), kok)
  assert.equal(serialize(kok), '<ul><li id="d">d</li><li id="c">c</li><li id="b">b</li><li id="a">a</li></ul>')
  assert.equal(nodeOps.ops.filter((op) => op.startsWith('taşı')).length, 3)
})

test('tür değişirse düğüm yeniden kurulur, aynı yere konur; Text vnode metni güncellenir', () => {
  const { nodeOps, kok, render } = kur()
  render(h('div', null, [h('p', { key: 'x' }, 'p'), h(Text, null, 'son')]), kok)
  nodeOps.ops.length = 0
  render(h('div', null, [h('section', { key: 'x' }, 'p'), h(Text, null, 'SON')]), kok)
  assert.equal(serialize(kok), '<div><section>p</section>SON</div>')
  // Önce 2. adım (sondan eşleşen Text yamalanır), sonra 5. adım (key x: p → section yeniden kurulur).
  assert.deepEqual(nodeOps.ops, ['metin "son" -> "SON"', 'sil p', 'oluştur section', 'ekle section'])
})

test('render(null) her şeyi söker', () => {
  const { kok, render } = kur()
  render(liste(['a', 'b']), kok)
  render(null, kok)
  assert.equal(serialize(kok), '')
})
