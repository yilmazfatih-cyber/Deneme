// Koan 1 — Kapsam (scope) ve kapanış (closure)
// Kitap: You Don't Know JS Yet, "Scope & Closures" (2. baskı) → scope-closures/ch2.md … ch8.md
// Her testte önce tahmin et, sonra çalıştır. Boş sürüm için: npm run bosalt (bkz. README).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __ } from './_yardimci.js'

test('[SC 2–3] sözcüksel kapsam: iç fonksiyon dışarıdakini görür, gölgeleme en yakını seçer', () => {
  const sehir = 'Ankara'
  function disari() {
    const sehir = 'İzmir' // gölgeleme (shadowing)
    function iceri() {
      return sehir
    }
    return iceri()
  }
  assert.equal(disari(), __('İzmir'))
  assert.equal(sehir, __('Ankara'))
})

test('[SC 3] adlandırılmış fonksiyon ifadesinin adı yalnızca kendi içinde görünür', () => {
  const f = function faktoriyel(n) {
    return n <= 1 ? 1 : n * faktoriyel(n - 1)
  }
  assert.equal(f(5), __(120))
  assert.equal(typeof faktoriyel, __('undefined')) // dış kapsamda yok
})

test('[SC 5] hoisting: fonksiyon bildirimi tanımından önce çağrılabilir, var undefined gelir', () => {
  const sonuc = selam()
  function selam() {
    return 'merhaba'
  }
  assert.equal(sonuc, __('merhaba'))
  assert.equal(erkenVar, __(undefined))
  var erkenVar = 42
  assert.equal(erkenVar, __(42))
})

test('[SC 5] TDZ: let/const tanımından önce okunamaz; typeof bile hata verir', () => {
  assert.throws(() => {
    okunacak // eslint kurallı projede no-use-before-define uyarır
  }, __(ReferenceError))
  assert.throws(() => typeof tdzDegiskeni, __(ReferenceError))
  assert.equal(typeof hicTanimlanmamis, __('undefined')) // hiç bildirilmemişse typeof güvenlidir
  let okunacak = 1
  let tdzDegiskeni = 2
  assert.equal(okunacak + tdzDegiskeni, __(3))
})

test('[SC 5, SC 7] döngü kapanışları: var tek değişkendir, let her turda yeni bağlama', () => {
  const varIle = []
  for (var i = 0; i < 3; i++) varIle.push(() => i)
  const letIle = []
  for (let j = 0; j < 3; j++) letIle.push(() => j)
  assert.deepEqual(
    varIle.map((f) => f()),
    __([3, 3, 3]),
  )
  assert.deepEqual(
    letIle.map((f) => f()),
    __([0, 1, 2]),
  )
})

test('[SC 7] kapanış canlı bağlantıdır, anlık kopya değil', () => {
  let mesaj = 'ilk'
  const oku = () => mesaj
  mesaj = 'son'
  assert.equal(oku(), __('son'))
})

test('[SC 8] modül deseni: kapanışla gizli durum (yalnızca dönen API ile erişilir)', () => {
  function sayacOlustur(baslangic) {
    let deger = baslangic // dışarıdan erişilemez
    return {
      arttir: () => ++deger,
      oku: () => deger,
    }
  }
  const a = sayacOlustur(10)
  const b = sayacOlustur(0)
  a.arttir()
  a.arttir()
  b.arttir()
  assert.equal(a.oku(), __(12))
  assert.equal(b.oku(), __(1))
  assert.equal(a.deger, __(undefined))
})

test('[SC 6] blok kapsam ve IIFE ile açığa çıkmayı sınırlamak (POLE)', () => {
  const sonuc = (() => {
    const gecici = [3, 1, 2].sort()
    return gecici[0]
  })()
  {
    const blokIci = 'görünmez'
    assert.equal(blokIci.length, __(8))
  }
  assert.equal(sonuc, __(1))
  assert.equal(typeof blokIci, __('undefined'))
})

var modulDuzeyiVar = 'modül kapsamında'

test('[SC 4] ES modülünde üst düzey var, global nesneye özellik eklemez (klasik betikte eklerdi)', () => {
  assert.equal(globalThis.modulDuzeyiVar, __(undefined))
  assert.equal(modulDuzeyiVar, __('modül kapsamında'))
})
