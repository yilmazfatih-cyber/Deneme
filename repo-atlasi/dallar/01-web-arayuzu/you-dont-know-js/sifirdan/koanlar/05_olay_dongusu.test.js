// Koan 5 — Olay döngüsü, promise'ler, async/await
// 2. baskıda "Sync & Async" kitabı iptal edildi (sync-async/ yalnızca bir TODO bölümü içerir); bu yüzden kaynak:
//   1. baskı "Async & Performance" Bölüm 1 "Asynchrony: Now & Later" (olay döngüsü, işler/jobs),
//   Bölüm 3 "Promises", Bölüm 4 "Generators" → 1st-ed dalı, "async & performance/ch1.md … ch4.md"
// Node'a özgü kısımlar (process.nextTick) ayrıca işaretlendi.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __ } from './_yardimci.js'

const makroGorev = () => new Promise((coz) => setTimeout(coz, 0))

test('[AP1 1] tamamlanana dek çalış: zamanlayıcı, senkron kod bitmeden araya giremez', async () => {
  const gunluk = []
  setTimeout(() => gunluk.push('zamanlayıcı'), 0)
  const bitis = Date.now() + 20
  while (Date.now() < bitis) {
    // 20 ms meşgul bekleme: yine de zamanlayıcı bölemez
  }
  gunluk.push('senkron bitti')
  await makroGorev()
  assert.deepEqual(gunluk, __(['senkron bitti', 'zamanlayıcı']))
})

test('[AP1 1] mikro görevler (promise işleri) makro görevlerden (zamanlayıcılar) önce boşaltılır', async () => {
  const gunluk = []
  setTimeout(() => gunluk.push('setTimeout'), 0)
  Promise.resolve().then(() => gunluk.push('then 1'))
  queueMicrotask(() => gunluk.push('queueMicrotask'))
  Promise.resolve()
    .then(() => gunluk.push('then 2a'))
    .then(() => gunluk.push('then 2b'))
  gunluk.push('senkron')
  await makroGorev()
  assert.deepEqual(gunluk, __(['senkron', 'then 1', 'queueMicrotask', 'then 2a', 'then 2b', 'setTimeout']))
})

test('[AP1 3] await her zaman bekletir; değer promise olmasa bile devamı mikro göreve kalır', async () => {
  const gunluk = []
  async function f() {
    gunluk.push('f başladı')
    await 42
    gunluk.push('await sonrası')
  }
  const p = f()
  gunluk.push('f döndü')
  await p
  assert.deepEqual(gunluk, __(['f başladı', 'f döndü', 'await sonrası']))
})

test('[AP1 3] thenable benimseme ve Promise.resolve’un aynı promise’i döndürmesi', async () => {
  const thenable = {
    then(coz) {
      coz('thenable değeri')
    },
  }
  assert.equal(await Promise.resolve(thenable), __('thenable değeri'))
  const p = Promise.resolve(1)
  assert.equal(Promise.resolve(p) === p, __(true))
  assert.equal(await new Promise((coz) => coz(Promise.resolve('iç içe'))), __('iç içe')) // durum benimsenir
})

test('[AP1 3] hata yayılımı: async içindeki throw reddedilmiş promise’tir; try/catch await ile çalışır', async () => {
  async function patlar() {
    throw new RangeError('sınır dışı')
  }
  await assert.rejects(patlar(), __(RangeError))
  let yakalanan
  try {
    await patlar()
  } catch (hata) {
    yakalanan = hata.message
  }
  assert.equal(yakalanan, __('sınır dışı'))
})

test('[AP1 3] birleştiriciler: all hızlı başarısız olur, allSettled hepsini toplar, any ilk başarılıyı alır', async () => {
  const iyi = (v) => Promise.resolve(v)
  const kotu = (m) => Promise.reject(new Error(m))
  await assert.rejects(Promise.all([iyi(1), kotu('x'), iyi(3)]), /x/)
  const durumlar = await Promise.allSettled([iyi(1), kotu('y')])
  assert.deepEqual(
    durumlar.map((d) => d.status),
    __(['fulfilled', 'rejected']),
  )
  assert.equal(await Promise.any([kotu('a'), iyi('b')]), __('b'))
  await assert.rejects(Promise.any([kotu('a')]), __(AggregateError))
})

test('[AP1 3] art arda await sıralıdır; Promise.all ile işler aynı anda yürür', async () => {
  let aktif = 0
  let enFazla = 0
  const is = async () => {
    aktif++
    enFazla = Math.max(enFazla, aktif)
    await makroGorev()
    aktif--
  }
  await is()
  await is()
  await is()
  const sirali = enFazla
  enFazla = 0
  await Promise.all([is(), is(), is()])
  assert.equal(sirali, __(1))
  assert.equal(enFazla, __(3))
})

test('[AP1 4] async/await = üreteç + promise: küçük bir yürütücü', async () => {
  // async function'ın kabaca yaptığı: yield edilen promise'i bekle, sonucu üretece geri ver.
  function calistir(uretec) {
    const it = uretec()
    return new Promise((coz, red) => {
      function adim(yontem, deger) {
        let sonuc
        try {
          sonuc = it[yontem](deger)
        } catch (hata) {
          return red(hata)
        }
        if (sonuc.done) return coz(sonuc.value)
        Promise.resolve(sonuc.value).then(
          (v) => adim('next', v),
          (h) => adim('throw', h),
        )
      }
      adim('next')
    })
  }
  const sonuc = await calistir(function* () {
    const a = yield Promise.resolve(2)
    const b = yield 3
    return a * b
  })
  assert.equal(sonuc, __(6))
})

test('[Node’a özgü] process.nextTick kuyruğu, makro görevden çıkışta promise işlerinden önce boşaltılır', async () => {
  const gunluk = []
  await new Promise((coz) =>
    setTimeout(() => {
      Promise.resolve().then(() => gunluk.push('promise'))
      process.nextTick(() => gunluk.push('nextTick'))
      setTimeout(coz, 0)
    }, 0),
  )
  assert.deepEqual(gunluk, __(['nextTick', 'promise']))
})

test('[Node’a özgü] ama bir mikro görevin İÇİNDEN planlanırsa önce kalan mikro görevler biter', async () => {
  const gunluk = []
  await Promise.resolve().then(() => {
    process.nextTick(() => gunluk.push('nextTick'))
    queueMicrotask(() => gunluk.push('mikro'))
  })
  await makroGorev()
  assert.deepEqual(gunluk, __(['mikro', 'nextTick']))
})
