import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../src/eleman.js'
import { createTestHost, createContainer, serialize } from '../src/test_host.js'
import { createStackRoot } from '../src/asama2_uzlastirma.js'

const liste = (ids, anahtarli = true) =>
  h(
    'ul',
    null,
    ids.map((id) => h('li', { key: anahtarli ? id : null, id }, id.toUpperCase())),
  )

function kur() {
  const host = createTestHost()
  const kok = createContainer()
  return { host, kok, root: createStackRoot(kok, host) }
}

test('anahtarlı listede yeniden sıralama düğümleri taşır, yeniden yaratmaz', () => {
  const { host, kok, root } = kur()
  root.render(liste(['a', 'b', 'c']))
  const ilkDugumler = [...kok.children[0].children]
  host.ops.length = 0

  root.render(liste(['c', 'a', 'b']))
  assert.equal(serialize(kok), '<ul><li id="c">C</li><li id="a">A</li><li id="b">B</li></ul>')
  // lastPlacedIndex: c (eski 2) yerinde kalır; a (0) ve b (1) "geride kaldı" diye taşınır.
  assert.deepEqual(host.ops, ['taşı li#b -> ul', 'taşı li#a -> ul (önüne: li#b)'])
  assert.ok(
    kok.children[0].children.every((n) => ilkDugumler.includes(n)),
    'aynı host nesneleri kullanıldı',
  )
})

test('anahtarsız listede aynı yeniden sıralama, sıra numarasına göre içerik güncellemesine dönüşür', () => {
  const { host, kok, root } = kur()
  root.render(liste(['a', 'b', 'c'], false))
  host.ops.length = 0
  root.render(liste(['c', 'a', 'b'], false))
  assert.equal(serialize(kok), '<ul><li id="c">C</li><li id="a">A</li><li id="b">B</li></ul>')
  assert.deepEqual(host.ops, [
    'güncelle li#c',
    'metin "A" -> "C"',
    'güncelle li#a',
    'metin "B" -> "A"',
    'güncelle li#b',
    'metin "C" -> "B"',
  ])
})

test('tür değişince eski alt ağaç atılır, yenisi kurulur', () => {
  const { host, kok, root } = kur()
  root.render(h('div', null, h('p', { id: 'x' }, 'metin')))
  host.ops.length = 0
  root.render(h('div', null, h('section', { id: 'x' }, 'metin')))
  assert.equal(serialize(kok), '<div><section id="x">metin</section></div>')
  assert.deepEqual(host.ops, [
    'oluştur section#x',
    'oluştur "metin"',
    'ilk-ekle "metin" -> section#x',
    'sil p#x',
    'ekle section#x -> div',
  ])
})

test('ortadan silme ve araya ekleme: yalnızca değişen düğümlere dokunulur', () => {
  const { host, kok, root } = kur()
  root.render(liste(['a', 'b', 'c', 'd']))
  host.ops.length = 0
  root.render(liste(['a', 'x', 'c', 'd']))
  assert.equal(serialize(kok), '<ul><li id="a">A</li><li id="x">X</li><li id="c">C</li><li id="d">D</li></ul>')
  assert.deepEqual(host.ops, [
    'oluştur li#x',
    'oluştur "X"',
    'ilk-ekle "X" -> li#x',
    'sil li#b',
    'ekle li#x -> ul (önüne: li#c)',
  ])
})

test("React'in bilinen zaafı: son öğeyi başa almak n-1 taşıma ister", () => {
  const { host, kok, root } = kur()
  root.render(liste(['a', 'b', 'c', 'd', 'e']))
  host.ops.length = 0
  root.render(liste(['e', 'a', 'b', 'c', 'd']))
  assert.equal(
    serialize(kok),
    '<ul><li id="e">E</li><li id="a">A</li><li id="b">B</li><li id="c">C</li><li id="d">D</li></ul>',
  )
  // Vue 3'ün LIS tabanlı algoritması aynı değişikliği 1 taşımayla yapar (vue3-core/sifirdan testine bak).
  assert.equal(host.ops.filter((op) => op.startsWith('taşı')).length, 4)
})

test('birden çok düğüm döndüren anahtarlı bileşenler bütün hâlinde taşınır', () => {
  const { kok, root } = kur()
  const Satir = ({ ad }) => [h('dt', { id: `dt-${ad}` }, ad), h('dd', { id: `dd-${ad}` }, `${ad} açıklama`)]
  const sozluk = (adlar) =>
    h(
      'dl',
      null,
      adlar.map((ad) => h(Satir, { key: ad, ad })),
    )
  root.render(sozluk(['a', 'b']))
  root.render(sozluk(['b', 'a']))
  assert.equal(
    serialize(kok),
    '<dl><dt id="dt-b">b</dt><dd id="dd-b">b açıklama</dd><dt id="dt-a">a</dt><dd id="dd-a">a açıklama</dd></dl>',
  )
})
