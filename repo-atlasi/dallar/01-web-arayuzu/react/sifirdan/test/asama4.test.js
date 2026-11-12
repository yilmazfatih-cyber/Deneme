import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../src/eleman.js'
import { createTestHost, createContainer, serialize, bul, tetikle } from '../src/test_host.js'
import { createRoot, useState, useReducer, useEffect, useRef } from '../src/asama4_hooks.js'
import { createScheduler, sahteSaat } from '../src/zamanlayici.js'

// setImmediate, tüm mikro görevler (toplu render + pasif efektler) bittikten sonra çalışır.
const bekle = () => new Promise((r) => setImmediate(r))

function kur() {
  const host = createTestHost()
  const kok = createContainer()
  return { host, kok, root: createRoot(kok, { host }) }
}

test('useState: güncelleme hemen değil, mikro görevde tek render ile uygulanır', async () => {
  const { kok, root } = kur()
  function Sayac() {
    const [n, setN] = useState(0)
    return h('button', { id: 'btn', onClick: () => setN(n + 1) }, 'Sayı: ', n)
  }
  root.renderSync(h(Sayac))
  assert.equal(serialize(kok), '<button id="btn">Sayı: 0</button>')

  tetikle(bul(kok, 'btn'), 'click')
  assert.equal(serialize(kok), '<button id="btn">Sayı: 0</button>', 'henüz render yok')
  await bekle()
  assert.equal(serialize(kok), '<button id="btn">Sayı: 1</button>')
})

test('toplu güncelleme: aynı tick içindeki üç setState tek render; bayat kapanış vs güncelleyici fonksiyon', async () => {
  const { kok, root } = kur()
  let render = 0
  function Ikili() {
    render++
    const [a, setA] = useState(0)
    const [b, setB] = useState(0)
    const ucKez = () => {
      setA(a + 1) // a bu render'daki değere "donmuş": üç kez 0 + 1
      setA(a + 1)
      setA(a + 1)
      setB((x) => x + 1) // güncelleyici fonksiyon sıradaki değeri alır: 0 → 1 → 2 → 3
      setB((x) => x + 1)
      setB((x) => x + 1)
    }
    return h('p', { id: 'p', onClick: ucKez }, `${a}/${b}`)
  }
  root.renderSync(h(Ikili))
  tetikle(bul(kok, 'p'), 'click')
  await bekle()
  assert.equal(serialize(kok), '<p id="p">1/3</p>')
  assert.equal(render, 2, 'ilk render + tek toplu render')
})

test('aynı değeri set etmek render planlamaz (eager bailout)', async () => {
  const { kok, root } = kur()
  let render = 0
  function Sabit() {
    render++
    const [x, setX] = useState('aynı')
    return h('i', { id: 'i', onClick: () => setX('aynı') }, x)
  }
  root.renderSync(h(Sabit))
  tetikle(bul(kok, 'i'), 'click')
  await bekle()
  assert.equal(render, 1)
})

test('useReducer: durum geçişleri saf bir fonksiyonda toplanır', async () => {
  const { kok, root } = kur()
  const reducer = (durum, eylem) => {
    if (eylem.tur === 'ekle') return { ...durum, ogeler: [...durum.ogeler, eylem.metin] }
    if (eylem.tur === 'temizle') return { ...durum, ogeler: [] }
    return durum
  }
  let gonder
  function Liste() {
    const [durum, dispatch] = useReducer(reducer, { ogeler: [] })
    gonder = dispatch
    return h(
      'ul',
      null,
      durum.ogeler.map((m) => h('li', { key: m }, m)),
    )
  }
  root.renderSync(h(Liste))
  gonder({ tur: 'ekle', metin: 'ekmek' })
  gonder({ tur: 'ekle', metin: 'peynir' })
  await bekle()
  assert.equal(serialize(kok), '<ul><li>ekmek</li><li>peynir</li></ul>')
  gonder({ tur: 'temizle' })
  await bekle()
  assert.equal(serialize(kok), '<ul></ul>')
})

test('useEffect: commit sonrası çalışır, önce çocuk; bağımlılık değişince önce temizlik; söküm temizliği', async () => {
  const { root } = kur()
  const gunluk = []
  function Cocuk({ ad }) {
    useEffect(() => {
      gunluk.push(`çocuk efekt ${ad}`)
      return () => gunluk.push(`çocuk temizlik ${ad}`)
    }, [ad])
    return h('span', null, ad)
  }
  function Ebeveyn({ ad }) {
    gunluk.push('ebeveyn render')
    useEffect(() => {
      gunluk.push('ebeveyn efekt')
      return () => gunluk.push('ebeveyn temizlik')
    }, [])
    return h('div', null, h(Cocuk, { ad }))
  }

  root.renderSync(h(Ebeveyn, { ad: 'x' }))
  assert.deepEqual(gunluk, ['ebeveyn render'], 'efekt render sırasında çalışmaz')
  await bekle()
  assert.deepEqual(gunluk, ['ebeveyn render', 'çocuk efekt x', 'ebeveyn efekt'])

  gunluk.length = 0
  root.renderSync(h(Ebeveyn, { ad: 'x' })) // bağımlılıklar aynı
  await bekle()
  assert.deepEqual(gunluk, ['ebeveyn render'])

  gunluk.length = 0
  root.renderSync(h(Ebeveyn, { ad: 'y' }))
  await bekle()
  assert.deepEqual(gunluk, ['ebeveyn render', 'çocuk temizlik x', 'çocuk efekt y'])

  gunluk.length = 0
  root.unmount()
  await bekle()
  assert.deepEqual(gunluk, ['ebeveyn temizlik', 'çocuk temizlik y'], 'silinen ağaçta ebeveynden çocuğa')
})

test('efekt içinden setState ikinci bir render başlatır (veri yükleme kalıbı)', async () => {
  const { kok, root } = kur()
  function Profil() {
    const [ad, setAd] = useState(null)
    useEffect(() => {
      setAd('Zeynep')
    }, [])
    return h('p', null, ad ?? 'yükleniyor…')
  }
  root.renderSync(h(Profil))
  assert.equal(serialize(kok), '<p>yükleniyor…</p>')
  await bekle()
  assert.equal(serialize(kok), '<p>Zeynep</p>')
})

test('hook kuralları: koşullu hook ve bileşen dışı çağrı hata verir', () => {
  const { root } = kur()
  function Kosullu({ goster }) {
    if (goster) useState('ilk')
    const [x] = useState('ikinci')
    return h('i', null, x)
  }
  root.renderSync(h(Kosullu, { goster: true }))
  assert.throws(() => root.renderSync(h(Kosullu, { goster: false })), /Hook sayısı değişti/)
  assert.throws(() => useState(0), /Geçersiz hook çağrısı/)
})

test('durum fiber’dadır: aynı key korur, yeni key sıfırlar', async () => {
  const { kok, root } = kur()
  function Sayac() {
    const [n, setN] = useState(0)
    return h('b', { id: 'b', onClick: () => setN((x) => x + 1) }, n)
  }
  root.renderSync(h('div', null, h(Sayac, { key: 'ali' })))
  tetikle(bul(kok, 'b'), 'click')
  await bekle()
  root.renderSync(h('div', null, h(Sayac, { key: 'ali' })))
  assert.equal(serialize(kok), '<div><b id="b">1</b></div>')
  root.renderSync(h('div', null, h(Sayac, { key: 'veli' })))
  assert.equal(serialize(kok), '<div><b id="b">0</b></div>')
})

test('kesilen render güncellemeyi kaybetmez ve iki kez uygulamaz (kuyruk commit’te temizlenir)', async () => {
  const saat = sahteSaat()
  const scheduler = createScheduler({ now: saat.now, frameMs: 2 })
  const host = createTestHost()
  const kok = createContainer()
  const root = createRoot(kok, { host, scheduler })
  function Sayac() {
    const [n, setN] = useState(0)
    return h('b', { id: 'n', onClick: () => setN((x) => x + 1) }, n)
  }
  const Yavas = ({ ad }) => {
    saat.ilerlet(1)
    return h('i', null, ad)
  }
  const App = ({ adlar }) =>
    h(
      'div',
      null,
      h(Sayac),
      adlar.map((ad) => h(Yavas, { key: ad, ad })),
    )
  root.renderSync(h(App, { adlar: ['a'] }))

  tetikle(bul(kok, 'n'), 'click') // güncelleme kuyrukta, mikro görev planlandı
  root.render(h(App, { adlar: ['a', 'b', 'c', 'd'] })) // eşzamanlı (concurrent) render
  scheduler.runNext() // yarım render: Sayac güncellemeyi işledi ama commit yok
  assert.notEqual(root._root.wip, null)
  await bekle() // senkron render yarım işi atar, her şeyi baştan ve bir kez uygular
  scheduler.flushAll() // kalan devam görevi iş bulamaz

  assert.equal(serialize(kok), '<div><b id="n">1</b><i>a</i><i>b</i><i>c</i><i>d</i></div>')
  assert.equal(root._root.istatistik.commit, 2)
})

test('useRef render tetiklemez, değeri render’lar arasında korunur; sökülen bileşenin setState’i yok sayılır', async () => {
  const { kok, root } = kur()
  let render = 0
  let disaridanSet
  function Zamanlayici() {
    render++
    const ref = useRef(0)
    const [, set] = useState(0)
    disaridanSet = set
    return h('em', { id: 'e', onClick: () => (ref.current += 1) }, `ref=${ref.current}`)
  }
  root.renderSync(h(Zamanlayici))
  tetikle(bul(kok, 'e'), 'click')
  tetikle(bul(kok, 'e'), 'click')
  await bekle()
  assert.equal(render, 1)
  root.renderSync(h(Zamanlayici))
  assert.equal(serialize(kok), '<em id="e">ref=2</em>')

  root.unmount()
  disaridanSet(99) // sökülmüş: hata yok, render yok
  await bekle()
  assert.equal(render, 2)
})
