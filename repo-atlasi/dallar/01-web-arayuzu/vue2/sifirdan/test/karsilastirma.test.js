// Aynı senaryolar, Vue 3 mini'sinin Proxy reaktivitesiyle (../../vue3-core/sifirdan). Vue 2'de "tuzak" olan her şey
// burada kendiliğinden çalışır; çünkü Proxy özelliği değil, nesnenin TÜM işlemlerini (get/set/has/deleteProperty/ownKeys) yakalar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reactive, effect, toRaw } from '../../../vue3-core/sifirdan/src/asama1_reaktivite.js'
import { observe } from '../src/vue2_gozlemci.js'

test('sonradan eklenen özellik: Vue 3’te set() gerekmez', () => {
  const kullanici = reactive({ ad: 'Ali' })
  let goruntu
  effect(() => (goruntu = `${kullanici.ad}/${kullanici.soyad ?? '-'}`))
  kullanici.soyad = 'Kaya'
  assert.equal(goruntu, 'Ali/Kaya')
})

test('dizi indeksine atama ve length ile kısaltma: Vue 3’te izlenir', () => {
  const liste = reactive(['a', 'b', 'c'])
  let goruntu
  effect(() => (goruntu = liste.join(',')))
  liste[0] = 'X'
  assert.equal(goruntu, 'X,b,c')
  liste.length = 1
  assert.equal(goruntu, 'X')
})

test('delete ve Object.keys: Vue 3’te izlenir', () => {
  const ayar = reactive({ tema: 'koyu', dil: 'tr' })
  let goruntu
  effect(() => (goruntu = Object.keys(ayar).join(',')))
  delete ayar.tema
  assert.equal(goruntu, 'dil')
})

test('ham nesneye dokunulmaz; dönüştürme tembeldir', () => {
  const ham3 = { not: { deger: 90 } }
  const r = reactive(ham3)
  assert.notEqual(r, ham3, 'Vue 3: reactive() yeni bir Proxy döndürür')
  assert.equal(Object.getOwnPropertyDescriptor(ham3, 'not').get, undefined, 'ham nesnede getter yok')
  assert.equal(toRaw(r), ham3)

  const ham2 = { not: { deger: 90 } }
  observe(ham2)
  assert.equal(typeof Object.getOwnPropertyDescriptor(ham2, 'not').get, 'function', 'Vue 2: aynı nesne yerinde değişti')
  assert.ok(ham2.not.__ob__, 'Vue 2: iç nesne de baştan dönüştürüldü')
})
