import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../src/eleman.js'
import { createTestHost, createContainer, serialize } from '../src/test_host.js'
import { createRoot, FunctionComponent, HostComponent, HostRoot, HostText } from '../src/asama3_fiber.js'
import { createScheduler, sahteSaat } from '../src/zamanlayici.js'

function kur() {
  const saat = sahteSaat()
  const scheduler = createScheduler({ now: saat.now, frameMs: 5 })
  const host = createTestHost()
  const kok = createContainer()
  const root = createRoot(kok, { host, scheduler })
  return { saat, scheduler, host, kok, root }
}

const liste = (ids) =>
  h(
    'ul',
    null,
    ids.map((id) => h('li', { key: id, id }, id.toUpperCase())),
  )

test('fiber ağacı: child / sibling / return bağlarıyla gezilen bir bağlı liste', () => {
  const { root } = kur()
  const App = () => h('ul', null, h('li', null, 'a'), h('li', null, 'b'))
  root.renderSync(h(App))
  const kokFiber = root._root.current
  const app = kokFiber.child
  const ul = app.child
  const li1 = ul.child
  const li2 = li1.sibling
  assert.deepEqual(
    [kokFiber.tag, app.tag, ul.tag, li1.tag, li1.child.tag],
    [HostRoot, FunctionComponent, HostComponent, HostComponent, HostText],
  )
  assert.equal(li2.return, ul)
  assert.equal(li2.sibling, null)
  assert.equal(ul.stateNode.type, 'ul') // host fiber'ı gerçek düğümü tutar
})

test('ilk montaj: render aşaması ekranı değiştirmez, commit kökü tek hamlede bağlar', () => {
  const { host, kok, root } = kur()
  root.renderSync(liste(['a', 'b']))
  assert.equal(serialize(kok), '<ul><li id="a">A</li><li id="b">B</li></ul>')
  assert.deepEqual(
    host.ops.filter((op) => op.endsWith('-> KÖK')),
    ['ekle ul -> KÖK'],
  )
  assert.equal(host.ops.at(-1), 'ekle ul -> KÖK')
})

test('zaman dilimleme: 5 ms dolunca iş bırakılır, ekran yarım ağaç görmez', () => {
  const { saat, scheduler, kok, root } = kur()
  const Yavas = ({ ad }) => {
    saat.ilerlet(1) // her bileşen 1 ms "harcar"
    return h('li', { id: ad }, ad)
  }
  const App = () =>
    h(
      'ul',
      null,
      Array.from({ length: 12 }, (_, i) => h(Yavas, { key: i, ad: `o${i}` })),
    )
  root.render(h(App))
  assert.equal(scheduler.bekleyen, 1)

  scheduler.runNext() // ilk dilim
  assert.equal(kok.children.length, 0, 'commit olmadı')
  assert.notEqual(root._root.wip, null, 'iş yarıda bırakıldı')

  scheduler.flushAll()
  assert.equal(kok.children[0].children.length, 12)
  assert.equal(root._root.istatistik.dilim, 3) // 12 ms iş / 5 ms dilim
  assert.equal(root._root.istatistik.commit, 1)
})

test('kesinti: render sürerken gelen yeni güncelleme yarım işi çöpe atar', () => {
  const { saat, scheduler, host, kok, root } = kur()
  let cagri = 0
  const Yavas = ({ ad }) => {
    cagri++
    saat.ilerlet(1)
    return h('li', { id: ad }, ad)
  }
  const Liste = ({ ids }) =>
    h(
      'ul',
      null,
      ids.map((ad) => h(Yavas, { key: ad, ad })),
    )
  root.render(h(Liste, { ids: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'] }))
  scheduler.runNext() // A'nın yarısı render edildi
  root.render(h(Liste, { ids: ['b1', 'b2', 'b3'] }))
  scheduler.flushAll()

  assert.equal(serialize(kok), '<ul><li id="b1">b1</li><li id="b2">b2</li><li id="b3">b3</li></ul>')
  assert.equal(root._root.istatistik.commit, 1)
  assert.ok(cagri > 3, 'atılan A render çağrıları da sayıldı: render aşaması tekrar edilebilir, saf olmalı')
  assert.ok(host.ops.includes('oluştur li#a1'), 'A düğümleri ekran dışında oluşmuştu')
  assert.equal(host.ops.filter((op) => /li#a\d -> ul/.test(op)).length, 0, 'ama hiçbiri bağlanmadı')
})

test('renderSync (workLoopSync) zaman dilimine bakmaz', () => {
  const { saat, scheduler, kok, root } = kur()
  const Yavas = ({ ad }) => {
    saat.ilerlet(3)
    return h('li', null, ad)
  }
  root.renderSync(
    h(
      'ol',
      null,
      ['x', 'y', 'z'].map((ad) => h(Yavas, { key: ad, ad })),
    ),
  )
  assert.equal(serialize(kok), '<ol><li>x</li><li>y</li><li>z</li></ol>')
  assert.equal(scheduler.bekleyen, 0)
})

test('anahtarlı yeniden sıralama fiber üzerinde: Placement bayrağı ve taşıma', () => {
  const { host, kok, root } = kur()
  root.renderSync(liste(['a', 'b', 'c']))
  host.ops.length = 0
  root.renderSync(liste(['c', 'a', 'b']))
  assert.equal(serialize(kok), '<ul><li id="c">C</li><li id="a">A</li><li id="b">B</li></ul>')
  assert.deepEqual(host.ops, ['taşı li#a -> ul', 'taşı li#b -> ul'])
})

test('tek commit içinde silme, güncelleme ve ekleme', () => {
  const { host, kok, root } = kur()
  root.renderSync(liste(['a', 'b', 'c']))
  host.ops.length = 0
  root.renderSync(
    h(
      'ul',
      null,
      h('li', { key: 'a', id: 'a' }, 'A'),
      h('li', { key: 'c', id: 'c' }, 'C2'),
      h('li', { key: 'd', id: 'd' }, 'D'),
    ),
  )
  assert.equal(serialize(kok), '<ul><li id="a">A</li><li id="c">C2</li><li id="d">D</li></ul>')
  const mutasyonlar = host.ops.filter((op) => !op.startsWith('oluştur') && !op.startsWith('ilk-ekle'))
  assert.deepEqual(mutasyonlar, ['sil li#b', 'metin "C" -> "C2"', 'ekle li#d -> ul'])
})

test('getHostSibling bileşenlerin içine iner: araya eklenen bileşen doğru yere girer', () => {
  const { host, kok, root } = kur()
  const Satir = ({ ad }) => [h('dt', { id: `dt-${ad}` }, ad), h('dd', { id: `dd-${ad}` }, '…')]
  const sozluk = (adlar) =>
    h(
      'dl',
      null,
      adlar.map((ad) => h(Satir, { key: ad, ad })),
    )
  root.renderSync(sozluk(['a', 'c']))
  host.ops.length = 0
  root.renderSync(sozluk(['a', 'b', 'c']))
  assert.equal(
    serialize(kok),
    '<dl><dt id="dt-a">a</dt><dd id="dd-a">…</dd><dt id="dt-b">b</dt><dd id="dd-b">…</dd><dt id="dt-c">c</dt><dd id="dd-c">…</dd></dl>',
  )
  assert.deepEqual(
    host.ops.filter((op) => op.startsWith('ekle')),
    ['ekle dt#dt-b -> dl (önüne: dt#dt-c)', 'ekle dd#dd-b -> dl (önüne: dt#dt-c)'],
  )

  root.renderSync(sozluk(['c', 'b', 'a']))
  assert.equal(
    serialize(kok),
    '<dl><dt id="dt-c">c</dt><dd id="dd-c">…</dd><dt id="dt-b">b</dt><dd id="dd-b">…</dd><dt id="dt-a">a</dt><dd id="dd-a">…</dd></dl>',
  )
})

test('unmount: kök boşalır', () => {
  const { kok, root } = kur()
  root.renderSync(liste(['a']))
  root.unmount()
  assert.equal(serialize(kok), '')
})
