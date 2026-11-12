// Vue 2'nin "reaktivite uyarıları" (v2.vuejs.org → Reactivity in Depth → Change Detection Caveats), çalışan testler olarak.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { yeniVue, observe, set, del, nextTick, arrayMethods, Watcher } from '../src/vue2_gozlemci.js'

test('temel akış: data → getter/setter → render watcher → kuyruk → nextTick', async () => {
  const vm = yeniVue({ data: () => ({ ad: 'Ayşe', yas: 30 }), render: (vm) => `<p>${vm.ad} (${vm.yas})</p>` })
  assert.equal(vm.$el, '<p>Ayşe (30)</p>')
  vm.ad = 'Fatma'
  vm.yas = 31
  vm.ad = 'Zehra'
  assert.equal(vm.$el, '<p>Ayşe (30)</p>', 'senkron değil')
  await nextTick()
  assert.equal(vm.$el, '<p>Zehra (31)</p>')
  assert.equal(vm.$sayac.render, 2, 'üç atama, tek yeniden render')
})

test('tuzak 1: sonradan eklenen özellik reaktif değildir → Vue.set gerekir', async () => {
  const vm = yeniVue({
    data: () => ({ kullanici: { ad: 'Ali' } }),
    render: (vm) => `${vm.kullanici.ad}/${vm.kullanici.soyad ?? '-'}`,
  })
  vm.kullanici.soyad = 'Kaya' // getter/setter yok: kimse haber almaz
  await nextTick()
  assert.equal(vm.$el, 'Ali/-')
  set(vm.kullanici, 'telefon', '555') // defineReactive + nesnenin __ob__.dep'ini tetikler
  await nextTick()
  assert.equal(vm.$el, 'Ali/Kaya', 'render yeniden koştu; soyad artık görünür (ama hâlâ reaktif değil)')
})

test('tuzak 2: dizi indeksine doğrudan atama reaktif değildir → set ya da splice', async () => {
  const vm = yeniVue({ data: () => ({ liste: ['a', 'b'] }), render: (vm) => vm.liste.join(',') })
  vm.liste[0] = 'X'
  await nextTick()
  assert.equal(vm.$el, 'a,b', 'indekslerin getter/setter’ı yok')
  vm.liste.splice(0, 1, 'Y') // yamalanmış yöntem: dizinin Dep'ini tetikler
  await nextTick()
  assert.equal(vm.$el, 'Y,b')
  set(vm.liste, 1, 'Z')
  await nextTick()
  assert.equal(vm.$el, 'Y,Z')
})

test('tuzak 3: length ile kısaltma reaktif değildir → splice', async () => {
  const vm = yeniVue({ data: () => ({ liste: [1, 2, 3] }), render: (vm) => String(vm.liste.length) })
  vm.liste.length = 1
  await nextTick()
  assert.equal(vm.$el, '3')
  vm.liste.splice(0)
  await nextTick()
  assert.equal(vm.$el, '0')
})

test('tuzak 4: delete reaktif değildir → Vue.delete', async () => {
  const vm = yeniVue({
    data: () => ({ ayar: { tema: 'koyu', dil: 'tr' } }),
    render: (vm) => Object.keys(vm.ayar).join(','),
  })
  delete vm.ayar.tema
  await nextTick()
  assert.equal(vm.$el, 'tema,dil')
  del(vm.ayar, 'dil')
  await nextTick()
  assert.equal(vm.$el, '', 'del tetikledi; önceki sessiz delete de ancak şimdi göründü')
})

test('tuzak 5: kök $data’ya çalışma zamanında özellik eklenemez', () => {
  const vm = yeniVue({ data: () => ({ a: 1 }), render: () => '' })
  assert.throws(() => set(vm._data, 'b', 2), /Kök \$data/)
})

test('tuzak 6: Map ve Set gözlemlenmez', async () => {
  const vm = yeniVue({ data: () => ({ etiketler: new Set(['js']) }), render: (vm) => String(vm.etiketler.size) })
  vm.etiketler.add('vue')
  await nextTick()
  assert.equal(vm.$el, '1')
  assert.equal(observe(new Map()), undefined)
})

test('defineProperty ham nesneyi yerinde değiştirir; diziye özel prototip takılır', () => {
  const ham = { ad: 'Elif', not: { deger: 90 }, liste: [1] }
  const ob = observe(ham)
  assert.equal(typeof Object.getOwnPropertyDescriptor(ham, 'ad').get, 'function')
  assert.equal(ham.__ob__, ob)
  assert.equal(Object.keys(ham).includes('__ob__'), false, '__ob__ sayılamaz (enumerable değil)')
  assert.ok(ham.not.__ob__, 'derin nesneler de HEMEN gözlemlendi (hevesli dönüştürme)')
  assert.equal(Object.getPrototypeOf(ham.liste), arrayMethods)
  assert.notEqual(Object.getPrototypeOf(ham.liste), Array.prototype)
})

test('computed: tembel ve önbellekli; render watcher computed’ın bağımlılıklarına abone olur', async () => {
  let hesap = 0
  const vm = yeniVue({
    data: () => ({ fiyat: 10, adet: 2, not: '' }),
    computed: {
      toplam(vm) {
        hesap++
        return vm.fiyat * vm.adet
      },
    },
    render: (vm) => `${vm.toplam} TL ${vm.not}`,
  })
  assert.equal(vm.$el, '20 TL ')
  vm.not = 'kdv dahil' // computed'ı ilgilendirmez
  await nextTick()
  assert.equal(vm.$el, '20 TL kdv dahil')
  assert.equal(hesap, 1, 'toplam yeniden hesaplanmadı')
  vm.adet = 3
  await nextTick()
  assert.equal(vm.$el, '30 TL kdv dahil')
  assert.equal(hesap, 2)
})

test('watcher bağımlılık temizliği: deps/newDeps takası', () => {
  const veri = { goster: true, mesaj: 'a' }
  observe(veri)
  let calisma = 0
  const w = new Watcher(
    () => {
      calisma++
      return veri.goster ? veri.mesaj : '-'
    },
    () => {},
    { sync: true },
  )
  veri.goster = false
  veri.mesaj = 'b' // artık bağımlılık değil
  assert.equal(calisma, 2)
  assert.equal(w.deps.length, 1)
})
