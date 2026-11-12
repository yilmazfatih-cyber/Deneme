import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ref, reactive } from '../src/asama1_reaktivite.js'
import { h } from '../src/asama2_vnode_patch.js'
import { createRendererWithComponents, nextTick, onMounted, onUnmounted } from '../src/asama4_bilesen.js'
import { createNodeOps, createRoot, serialize, bul, tetikle } from '../src/test_nodeops.js'

function kur() {
  const nodeOps = createNodeOps()
  const kok = createRoot()
  return { nodeOps, kok, ...createRendererWithComponents(nodeOps) }
}

test('şablonlu bileşen: değişiklik hemen değil, nextTick sonrasında DOM’a yansır', async () => {
  const { kok, createApp } = kur()
  const Sayac = {
    setup() {
      const sayac = ref(0)
      return { sayac }
    },
    template: `<button id="b" @click="sayac++">Sayı: {{ sayac }}</button>`,
  }
  createApp(Sayac).mount(kok)
  assert.equal(serialize(kok), '<button id="b">Sayı: 0</button>')
  tetikle(bul(kok, 'b'), 'click')
  assert.equal(serialize(kok), '<button id="b">Sayı: 0</button>', 'henüz kuyrukta')
  await nextTick()
  assert.equal(serialize(kok), '<button id="b">Sayı: 1</button>')
})

test('aynı tick’teki çok sayıda değişiklik tek render (queueJob tekilleştirir)', async () => {
  const { kok, createApp } = kur()
  let render = 0
  const Kart = {
    setup() {
      return { s: reactive({ a: 0, b: 0 }) }
    },
    render(ctx) {
      render++
      return h('p', null, `${ctx.s.a}/${ctx.s.b}`)
    },
  }
  const ornek = createApp(Kart).mount(kok)
  const s = ornek.setupState.s
  s.a++
  s.b++
  s.a++
  await nextTick()
  assert.equal(serialize(kok), '<p>2/1</p>')
  assert.equal(render, 2)
})

test('props aşağı, olaylar yukarı: emit ebeveynin işleyicisini çağırır', async () => {
  const { kok, createApp } = kur()
  const Oge = {
    props: ['ad', 'secili'],
    setup(props, { emit }) {
      return { sec: () => emit('sec', props.ad) }
    },
    template: `<li :id="ad" :class="secili ? 'aktif' : 'pasif'" @click="sec">{{ ad }}</li>`,
  }
  const Liste = {
    components: { Oge },
    setup() {
      const secilen = ref(null)
      const adlar = reactive(['elma', 'armut'])
      return { secilen, adlar, sec: (ad) => (secilen.value = ad) }
    },
    template: `<ul><Oge v-for="ad in adlar" :key="ad" :ad="ad" :secili="ad === secilen" @sec="sec" /></ul>`,
  }
  const ornek = createApp(Liste).mount(kok)
  assert.equal(serialize(kok), '<ul><li class="pasif" id="elma">elma</li><li class="pasif" id="armut">armut</li></ul>')
  tetikle(bul(kok, 'armut'), 'click')
  await nextTick()
  assert.equal(serialize(kok), '<ul><li class="pasif" id="elma">elma</li><li class="aktif" id="armut">armut</li></ul>')
  ornek.setupState.adlar.unshift('kiraz')
  await nextTick()
  assert.match(serialize(kok), /^<ul><li class="pasif" id="kiraz">kiraz<\/li>/)
})

test('ebeveyn ve çocuk aynı tick’te değişirse çocuk bir kez render edilir (ebeveyn önce)', async () => {
  const { kok, createApp } = kur()
  const gunluk = []
  const yerel = ref('x')
  const Cocuk = {
    props: ['etiket'],
    render(ctx) {
      gunluk.push('çocuk')
      return h('span', null, `${ctx.etiket}-${yerel.value}`)
    },
  }
  const ust = ref('A')
  const Ebeveyn = {
    render() {
      gunluk.push('ebeveyn')
      return h('div', null, [h(Cocuk, { etiket: ust.value })])
    },
  }
  createApp(Ebeveyn).mount(kok)
  gunluk.length = 0
  yerel.value = 'y' // önce çocuğun işi kuyruğa girer
  ust.value = 'B' // sonra ebeveynin
  await nextTick()
  assert.deepEqual(gunluk, ['ebeveyn', 'çocuk'])
  assert.equal(serialize(kok), '<div><span>B-y</span></div>')
})

test('yaşam döngüsü: mounted önce çocukta; v-if ile sökülen bileşenin effect’i durur', async () => {
  const { kok, createApp } = kur()
  const gunluk = []
  const ortak = ref(0)
  let cocukRender = 0
  const Cocuk = {
    setup() {
      onMounted(() => gunluk.push('çocuk mounted'))
      onUnmounted(() => gunluk.push('çocuk unmounted'))
      return () => {
        cocukRender++
        return h('i', null, String(ortak.value))
      }
    },
  }
  const Ebeveyn = {
    components: { Cocuk },
    setup() {
      onMounted(() => gunluk.push('ebeveyn mounted'))
      return { goster: ref(true) }
    },
    template: `<section><Cocuk v-if="goster" /><p v-else>yok</p></section>`,
  }
  const ornek = createApp(Ebeveyn).mount(kok)
  assert.deepEqual(gunluk, ['çocuk mounted', 'ebeveyn mounted'])

  ornek.setupState.goster = false
  await nextTick()
  assert.equal(serialize(kok), '<section><p>yok</p></section>')
  assert.deepEqual(gunluk.slice(2), ['çocuk unmounted'])

  const once = cocukRender
  ortak.value++ // sökülen çocuk okuyordu; effect durduğu için render yok
  await nextTick()
  assert.equal(cocukRender, once)
})

test('nextTick(fn) DOM güncellemesinden sonra çalışır', async () => {
  const { kok, createApp } = kur()
  const mesaj = ref('ilk')
  createApp({ render: () => h('p', null, mesaj.value) }).mount(kok)
  mesaj.value = 'son'
  let gorulen
  await nextTick(() => (gorulen = serialize(kok)))
  assert.equal(gorulen, '<p>son</p>')
})
