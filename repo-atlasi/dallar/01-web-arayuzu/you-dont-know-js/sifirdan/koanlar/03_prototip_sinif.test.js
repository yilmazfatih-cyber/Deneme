// Koan 3 — Prototipler, sınıflar ve davranış devri (delegation)
// Kitap: "Objects & Classes" (2. baskı) Bölüm 2 "How Objects Work", Bölüm 3 "Classy Objects", Bölüm 5 "Delegation"
//        1. baskı: "this & Object Prototypes" Bölüm 5 "Prototypes" (gölgeleme kuralları)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __ } from './_yardimci.js'

test('[OC 2] [[Prototype]] zinciri: bulunamayan özellik bağlı nesnede aranır', () => {
  const hayvan = { sesCikar: () => '...', bacak: 4 }
  const kedi = Object.create(hayvan)
  kedi.ad = 'Pamuk'
  assert.equal(kedi.bacak, __(4))
  assert.equal(Object.hasOwn(kedi, 'bacak'), __(false))
  assert.equal('bacak' in kedi, __(true)) // in zinciri de tarar
  assert.equal(Object.getPrototypeOf(kedi), __(hayvan))
})

test('[OC 2] atama gölgeler: zincirdeki değer değişmez, nesneye kendi özelliği eklenir', () => {
  const ust = { renk: 'gri' }
  const alt = Object.create(ust)
  alt.renk = 'beyaz'
  assert.equal(ust.renk, __('gri'))
  assert.equal(Object.hasOwn(alt, 'renk'), __(true))
})

test('[1. baskı TOP 5] zincirde yazılamaz (writable: false) özellik varsa atama katı kipte hata verir', () => {
  const ust = {}
  Object.defineProperty(ust, 'sabit', { value: 1, writable: false })
  const alt = Object.create(ust)
  assert.throws(() => {
    alt.sabit = 2 // gölgeleme bile yapılamaz!
  }, __(TypeError))
  assert.equal(Object.hasOwn(alt, 'sabit'), __(false))
})

test('[OC 3] class bir fonksiyondur; yöntemler prototiptedir ve sayılamaz', () => {
  class Nokta {
    constructor(x) {
      this.x = x
    }
    uzaklik() {
      return Math.abs(this.x)
    }
  }
  assert.equal(typeof Nokta, __('function'))
  assert.equal(Object.hasOwn(Nokta.prototype, 'uzaklik'), __(true))
  assert.deepEqual(Object.keys(new Nokta(3)), __(['x']))
  assert.throws(() => Nokta(1), __(TypeError)) // new olmadan çağrılamaz
})

test('[OC 3] extends ve super: iki zincir kurulur (örnekler ve statikler)', () => {
  class Arac {
    static tur() {
      return 'araç'
    }
    tanit() {
      return 'Ben bir araç'
    }
  }
  class Bisiklet extends Arac {
    tanit() {
      return `${super.tanit()}, pedallıyım`
    }
  }
  const b = new Bisiklet()
  assert.equal(b.tanit(), __('Ben bir araç, pedallıyım'))
  assert.equal(b instanceof Arac, __(true))
  assert.equal(Object.getPrototypeOf(Bisiklet.prototype), __(Arac.prototype))
  assert.equal(Object.getPrototypeOf(Bisiklet), __(Arac)) // statik kalıtım
  assert.equal(Bisiklet.tur(), __('araç'))
})

test('[OC 3] "kalıtım" kopyalama değil paylaşımdır: sonradan eklenen yöntem eski örneklerde de görünür', () => {
  class Kus {}
  const serce = new Kus()
  Kus.prototype.uc = () => 'uçuyor'
  assert.equal(serce.uc(), __('uçuyor'))
})

test('[OC 3] özel alanlar (#) dışarıdan erişilemez; #alan in nesne ile marka denetimi', () => {
  class Hesap {
    #bakiye = 100
    static gercekMi(nesne) {
      return #bakiye in nesne
    }
    bakiye() {
      return this.#bakiye
    }
  }
  const h = new Hesap()
  assert.equal(h.bakiye(), __(100))
  assert.equal(h['#bakiye'], __(undefined))
  assert.equal(Hesap.gercekMi(h), __(true))
  assert.equal(Hesap.gercekMi({}), __(false))
})

test('[OC 5] davranış devri (OLOO): sınıfsız, nesneden nesneye bağlantı', () => {
  const Gorev = {
    kur(ad) {
      this.ad = ad
      return this
    },
    ozet() {
      return `Görev: ${this.ad}`
    },
  }
  const AcilGorev = Object.create(Gorev)
  AcilGorev.ozet = function () {
    return `${Gorev.ozet.call(this)} (ACİL)`
  }
  const g = Object.create(AcilGorev).kur('Fatura öde')
  assert.equal(g.ozet(), __('Görev: Fatura öde (ACİL)'))
  assert.equal(Gorev.isPrototypeOf(g), __(true))
})

test('[OC 2] Object.freeze sığdır: iç nesne hâlâ değişebilir', () => {
  const ayar = Object.freeze({ tema: 'koyu', renkler: { ana: 'mavi' } })
  assert.throws(() => {
    ayar.tema = 'açık'
  }, __(TypeError))
  ayar.renkler.ana = 'yeşil'
  assert.equal(ayar.renkler.ana, __('yeşil'))
  assert.equal(Object.isFrozen(ayar.renkler), __(false))
})
