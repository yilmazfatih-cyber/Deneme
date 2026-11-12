// Koan 2 — `this` nereden gelir?
// Kitap: "Objects & Classes" (2. baskı) Bölüm 4 "This Works" → objects-classes/ch4.md
//        1. baskı: "this & Object Prototypes" Bölüm 1–2 (1st-ed dalı)
// Kural: `this` fonksiyonun NASIL çağrıldığına bakar, nerede tanımlandığına değil (ok fonksiyonları hariç).
// Not: ES modülleri katı kipte (strict mode) çalışır; varsayılan bağlamada `this` undefined olur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __ } from './_yardimci.js'

function adiniSoyle() {
  return this.ad
}

test('[OC 4] örtük bağlama: nesne.yontem() → this = nesne', () => {
  const kedi = { ad: 'Tekir', adiniSoyle }
  assert.equal(kedi.adiniSoyle(), __('Tekir'))
})

test('[OC 4] kaybolan bağlama: yöntemi değişkene almak bağlamı koparır', () => {
  const kedi = { ad: 'Tekir', adiniSoyle }
  const kopuk = kedi.adiniSoyle
  assert.throws(() => kopuk(), __(TypeError)) // this undefined → undefined.ad
})

test('[OC 4] açık bağlama: call/apply anlık, bind kalıcıdır', () => {
  const a = { ad: 'A' }
  const b = { ad: 'B' }
  assert.equal(adiniSoyle.call(a), __('A'))
  assert.equal(adiniSoyle.apply(b, []), __('B'))
  const aya = adiniSoyle.bind(a)
  assert.equal(aya.call(b), __('A')) // bind'i call ezemez
})

test('[OC 4] new bağlaması: yeni nesne oluşur ve bind’in this’ini bile ezer', () => {
  function Kullanici(ad) {
    this.ad = ad
  }
  const sabit = { ad: 'değişmemeli' }
  const Bagli = Kullanici.bind(sabit)
  const k = new Bagli('Deniz')
  assert.equal(k.ad, __('Deniz'))
  assert.equal(sabit.ad, __('değişmemeli'))
})

test('[OC 4] ok fonksiyonu this’i çevresinden alır; call/bind onu değiştiremez', () => {
  const sayac = {
    n: 0,
    hepsiniArttir(liste) {
      liste.forEach(() => this.n++) // ok: yöntemin this'i
      return this.n
    },
  }
  assert.equal(sayac.hepsiniArttir([1, 2, 3]), __(3))
  const ok = () => this // modül düzeyinde this
  assert.equal(ok.call({ x: 1 }), __(undefined))
})

test('[OC 4] geri çağırmalarda thisArg: map(fn, thisArg)', () => {
  const carpan = { k: 10 }
  const sonuc = [1, 2].map(function (x) {
    return x * this.k
  }, carpan)
  assert.deepEqual(sonuc, __([10, 20]))
})

test('[OC 3–4] sınıf yöntemi koparılırsa this undefined’dır (sınıf gövdesi hep katı kipte)', () => {
  class Dugme {
    constructor() {
      this.etiket = 'Kaydet'
    }
    tikla() {
      return this.etiket
    }
  }
  const d = new Dugme()
  const isleyici = d.tikla
  assert.throws(() => isleyici(), __(TypeError))
  assert.equal(d.tikla.bind(d)(), __('Kaydet'))
})

test('[OC 4] katı olmayan (sloppy) kodda varsayılan bağlama global nesnedir', () => {
  // new Function gövdesi katı kipte değildir; ES modülünün içindeki kod ise hep katıdır.
  const sloppy = new Function('return this')
  assert.equal(sloppy(), __(globalThis))
  assert.equal(
    (function () {
      return this
    })(),
    __(undefined),
  )
})
