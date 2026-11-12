import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reactive, ref, computed, effect, stop, toRaw, isReactive } from '../src/asama1_reaktivite.js'

test('effect okuduğu anahtara abone olur; ilgisiz anahtar onu tetiklemez', () => {
  const durum = reactive({ ad: 'Ayşe', yas: 30 })
  const gorulen = []
  effect(() => gorulen.push(durum.ad))
  durum.yas = 31 // okunmadı → tetiklemez
  durum.ad = 'Fatma'
  durum.ad = 'Fatma' // aynı değer → tetiklemez
  assert.deepEqual(gorulen, ['Ayşe', 'Fatma'])
})

test('derinlik tembeldir ve kimlik korunur: aynı ham nesne → aynı proxy', () => {
  const ham = { adres: { il: 'İzmir' } }
  const d = reactive(ham)
  assert.equal(reactive(ham), d)
  assert.equal(isReactive(d.adres), true) // iç nesne okununca sarıldı
  assert.equal(toRaw(d.adres), ham.adres)
  let il
  effect(() => (il = d.adres.il))
  d.adres.il = 'Muğla'
  assert.equal(il, 'Muğla')
})

test('bağımlılık temizliği: koşullu daldan çıkılan anahtar artık tetiklemez', () => {
  const d = reactive({ goster: true, mesaj: 'merhaba' })
  let calisma = 0
  effect(() => {
    calisma++
    return d.goster ? d.mesaj : 'gizli'
  })
  d.goster = false // 2. çalışma: artık mesaj okunmuyor
  d.mesaj = 'değişti' // temizlik olmasaydı boşuna çalışırdı
  assert.equal(calisma, 2)
})

test('Proxy yeni anahtar eklemeyi ve silmeyi yakalar (Vue 2 bunu yapamazdı)', () => {
  const kullanici = reactive({ ad: 'Ali' })
  let anahtarlar
  effect(() => (anahtarlar = Object.keys(kullanici).join(',')))
  kullanici.soyad = 'Kaya' // yeni anahtar → ITERATE_KEY tetiklenir
  assert.equal(anahtarlar, 'ad,soyad')
  delete kullanici.ad
  assert.equal(anahtarlar, 'soyad')

  let varMi
  effect(() => (varMi = 'telefon' in kullanici)) // has tuzağı
  kullanici.telefon = '555'
  assert.equal(varMi, true)
})

test('diziler: indeksle atama, uzunluk kısaltma ve push izlenir', () => {
  const liste = reactive(['a', 'b', 'c'])
  let ikinci
  let toplam
  effect(() => (ikinci = liste[1]))
  effect(() => (toplam = liste.length))
  liste[1] = 'B' // Vue 2'de reaktif değildi
  assert.equal(ikinci, 'B')
  liste.push('d')
  assert.equal(toplam, 4)
  liste.length = 1 // silinen indeksi okuyan effect de tetiklenir
  assert.equal(ikinci, undefined)
  assert.equal(toplam, 1)
})

test('iki effect aynı diziye push etse de sonsuz döngü olmaz (izleme push sırasında durur)', () => {
  const liste = reactive([])
  effect(() => liste.push(1))
  effect(() => liste.push(2))
  assert.deepEqual(toRaw(liste), [1, 2])
})

test('ref ve computed: computed tembel ve önbellekli', () => {
  const fiyat = ref(100)
  const adet = ref(2)
  let hesap = 0
  const toplam = computed(() => {
    hesap++
    return fiyat.value * adet.value
  })
  assert.equal(hesap, 0, 'okunmadan hesaplanmaz')
  assert.equal(toplam.value, 200)
  assert.equal(toplam.value, 200)
  assert.equal(hesap, 1, 'ikinci okuma önbellekten')
  adet.value = 3
  assert.equal(hesap, 1, 'kirlendi ama okunana dek hesaplanmaz')
  let goruntu
  effect(() => (goruntu = `Toplam: ${toplam.value} TL`))
  assert.equal(goruntu, 'Toplam: 300 TL')
  fiyat.value = 50
  assert.equal(goruntu, 'Toplam: 150 TL')
})

test('reactive içindeki ref otomatik açılır; atama ref.value’ya yazar', () => {
  const sayac = ref(1)
  const d = reactive({ sayac })
  assert.equal(d.sayac, 1)
  d.sayac = 5
  assert.equal(sayac.value, 5)
})

test('scheduler: tetiklenen effect hemen çalışmaz, kuyruğa girer; stop aboneliği bitirir', () => {
  const d = reactive({ n: 0 })
  const kuyruk = new Set()
  let goruntu
  const runner = effect(() => (goruntu = d.n), { scheduler: () => kuyruk.add(runner) })
  d.n = 1
  d.n = 2
  d.n = 3
  assert.equal(goruntu, 0, 'henüz çalışmadı')
  assert.equal(kuyruk.size, 1, 'üç değişiklik tek iş')
  kuyruk.forEach((r) => r())
  kuyruk.clear()
  assert.equal(goruntu, 3)
  stop(runner)
  d.n = 4
  assert.equal(kuyruk.size, 0, 'durdurulan effect artık planlanmaz')
  assert.equal(goruntu, 3)
})

test('kendi okuduğunu yazan effect kendini sonsuza dek tetiklemez', () => {
  const d = reactive({ n: 0 })
  effect(() => {
    d.n++
  })
  assert.equal(d.n, 1)
})
