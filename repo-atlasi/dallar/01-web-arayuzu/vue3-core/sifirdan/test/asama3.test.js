import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, compile } from '../src/asama3_derleyici.js'
import { createRenderer } from '../src/asama2_vnode_patch.js'
import { reactive, effect } from '../src/asama1_reaktivite.js'
import { createNodeOps, createRoot, serialize, bul, tetikle } from '../src/test_nodeops.js'

test('parse: etiket, nitelik, direktif, metin ve {{ }} düğümleri', () => {
  const ast = parse('<p class="not" :title="baslik" @click="sec(1)">Merhaba {{ ad }}!</p>')
  const p = ast.children[0]
  assert.equal(p.type, 'Element')
  assert.equal(p.tag, 'p')
  assert.deepEqual(p.props, [
    { type: 'Attribute', name: 'class', value: 'not' },
    { type: 'Directive', name: 'bind', arg: 'title', exp: 'baslik' },
    { type: 'Directive', name: 'on', arg: 'click', exp: 'sec(1)' },
  ])
  assert.deepEqual(
    p.children.map((c) => c.type),
    ['Text', 'Interpolation', 'Text'],
  )
  assert.equal(p.children[1].content, 'ad')
})

test('codegen: with (_ctx), patch bayrakları ve statik önbellek görünür', () => {
  const render = compile(`
    <div class="kart">
      <h1>Sabit başlık</h1>
      <p :class="durum">{{ mesaj }}</p>
    </div>`)
  assert.match(render.kod, /with \(_ctx\)/)
  assert.match(render.kod, /_cache\[0\] \|\| \(_cache\[0\] = _h\("h1", null, "Sabit başlık"\)\)/)
  assert.match(render.kod, /_toDisplayString\(mesaj\), 3 \/\* TEXT, CLASS \*\//)
})

/** Derlenmiş render'ı reaktif bir bağlamla çalıştıran küçük düzenek (bileşensiz). */
function bagla(sablon, durum) {
  const nodeOps = createNodeOps()
  const kok = createRoot()
  const { render } = createRenderer(nodeOps)
  const ctx = reactive(durum)
  const renderFn = compile(sablon)
  const cache = []
  effect(() => render(renderFn(ctx, cache), kok))
  return { nodeOps, kok, ctx }
}

test('uçtan uca: durum değişince yalnızca dinamik metin güncellenir, statik alt ağaca dokunulmaz', () => {
  const { nodeOps, kok, ctx } = bagla(
    `<section><header><b>Statik</b> kısım</header><p id="m">{{ mesaj }} ({{ sayi }})</p></section>`,
    { mesaj: 'Merhaba', sayi: 1 },
  )
  assert.equal(serialize(kok), '<section><header><b>Statik</b> kısım</header><p id="m">Merhaba (1)</p></section>')
  nodeOps.ops.length = 0
  ctx.sayi = 2
  assert.deepEqual(nodeOps.ops, ['eleman-metni p#m -> "Merhaba (2)"'])
})

test('v-if / v-else-if / v-else zinciri tek üçlü ifadeye dönüşür; dallar ayrı key alır', () => {
  const { kok, ctx } = bagla(
    `<div><p v-if="puan >= 85">Pekiyi</p><p v-else-if="puan >= 50">Geçti</p><p v-else>Kaldı</p></div>`,
    { puan: 90 },
  )
  assert.equal(serialize(kok), '<div><p>Pekiyi</p></div>')
  ctx.puan = 60
  assert.equal(serialize(kok), '<div><p>Geçti</p></div>')
  ctx.puan = 10
  assert.equal(serialize(kok), '<div><p>Kaldı</p></div>')
})

test('v-if dalı yoksa yorum düğümü yer tutar', () => {
  const { kok, ctx } = bagla(`<div><span v-if="acik">açık</span><i>son</i></div>`, { acik: false })
  assert.equal(serialize(kok), '<div><!--v-if--><i>son</i></div>')
  ctx.acik = true
  assert.equal(serialize(kok), '<div><span>açık</span><i>son</i></div>')
})

test('v-for + :key: dizi değişimi LIS ile en az taşımayla yansır', () => {
  const { nodeOps, kok, ctx } = bagla(
    `<ul><li v-for="(m, i) in meyveler" :key="m" :id="m">{{ i + 1 }}. {{ m }}</li></ul>`,
    { meyveler: ['elma', 'armut', 'kiraz'] },
  )
  assert.equal(
    serialize(kok),
    '<ul><li id="elma">1. elma</li><li id="armut">2. armut</li><li id="kiraz">3. kiraz</li></ul>',
  )
  nodeOps.ops.length = 0
  ctx.meyveler = ['kiraz', 'elma', 'armut']
  assert.equal(nodeOps.ops.filter((op) => op.startsWith('taşı')).length, 1)
  assert.equal(
    serialize(kok),
    '<ul><li id="kiraz">1. kiraz</li><li id="elma">2. elma</li><li id="armut">3. armut</li></ul>',
  )
})

test('@click: yöntem adı doğrudan, satır içi ifade ($event) => { ... } olarak bağlanır', () => {
  let bagRef
  const { kok, ctx } = bagla(
    `<div><button id="a" @click="sayac++">+1</button><button id="b" @click="sifirla">0</button><b>{{ sayac }}</b></div>`,
    {
      sayac: 0,
      // Doğrudan bağlanan yöntem `this` almaz (Composition API'de de kapanış kullanılır).
      sifirla: () => {
        bagRef.sayac = 0
      },
    },
  )
  bagRef = ctx
  tetikle(bul(kok, 'a'), 'click')
  tetikle(bul(kok, 'a'), 'click')
  assert.equal(ctx.sayac, 2)
  assert.match(serialize(kok), /<b>2<\/b>/)
  tetikle(bul(kok, 'b'), 'click')
  assert.match(serialize(kok), /<b>0<\/b>/)
})

test('desteklenmeyen şeyler açıkça hata verir', () => {
  assert.throws(() => compile('<input v-model="x">'), /v-model/)
  assert.throws(() => compile('<p>a</p><p>b</p>'), /tek kök/)
  assert.throws(() => compile('<p v-else>x</p>'), /v-if olmadan/)
})
