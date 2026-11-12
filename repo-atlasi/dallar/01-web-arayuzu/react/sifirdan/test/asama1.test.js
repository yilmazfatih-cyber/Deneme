import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, Fragment, METIN, ELEMAN } from '../src/eleman.js'
import { createTestHost, createContainer, serialize } from '../src/test_host.js'
import { render } from '../src/asama1_render.js'

test('createElement: key props içine girmez, metin çocuklar METIN elemanına dönüşür', () => {
  const el = h('li', { key: 7, id: 'a' }, 'Elma', null, false, 3)
  assert.equal(el.$$typeof, ELEMAN)
  assert.equal(el.key, '7')
  assert.equal('key' in el.props, false)
  assert.deepEqual(
    el.props.children.map((c) => [c.type, c.props.nodeValue]),
    [
      [METIN, 'Elma'],
      [METIN, '3'],
    ],
  )
})

test('ilk montaj: ağaç ekran dışında kurulur, görünür ağaca tek hamlede bağlanır', () => {
  const host = createTestHost()
  const kok = createContainer()
  const Selam = ({ ad }) => h('p', { id: 'selam' }, 'Merhaba ', ad)
  render(h('div', { id: 'uygulama' }, h(Selam, { ad: 'Ayşe' }), h('ul', null, h('li', null, 'bir'))), kok, host)

  assert.equal(serialize(kok), '<div id="uygulama"><p id="selam">Merhaba Ayşe</p><ul><li>bir</li></ul></div>')
  assert.deepEqual(
    host.ops.filter((op) => op.endsWith('-> KÖK')),
    ['ekle div#uygulama -> KÖK'],
  )
  assert.equal(host.ops.at(-1), 'ekle div#uygulama -> KÖK') // son iş: tek bağlama
})

test('Fragment ve dizi döndüren bileşen sarmalayıcısız kardeşler üretir', () => {
  const host = createTestHost()
  const kok = createContainer()
  const Satirlar = () => [h('dt', null, 'kedi'), h('dd', null, 'miyav')]
  render(h(Fragment, null, h(Satirlar), h('hr')), kok, host)
  assert.equal(serialize(kok), '<dt>kedi</dt><dd>miyav</dd><hr></hr>')
})

test('çekirdek platformu bilmez: aynı eleman başka bir host ile metne dönüşür', () => {
  // Bu host DOM benzeri ağaç değil, düz metin satırları üretir (ör. bir terminal renderer'ı).
  const satirlar = []
  const metinHost = {
    createInstance: (type) => ({ type, cocuklar: [] }),
    createTextInstance: (text) => ({ text }),
    appendInitialChild: (p, c) => p.cocuklar.push(c),
    appendChildToContainer: (kap, c) => kap.push(c),
  }
  const yaz = (n, girinti = '') => {
    if ('text' in n) return satirlar.push(girinti + n.text)
    satirlar.push(`${girinti}[${n.type}]`)
    n.cocuklar.forEach((c) => yaz(c, girinti + '  '))
  }
  const kap = []
  render(h('menu', null, h('item', null, 'Kaydet'), h('item', null, 'Çık')), kap, metinHost)
  kap.forEach((n) => yaz(n))
  assert.deepEqual(satirlar, ['[menu]', '  [item]', '    Kaydet', '  [item]', '    Çık'])
})
