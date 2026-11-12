import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tarayiciDeposu, uygulama, varsayilanDurum } from '../app.js'

/** Vue'nun kullandığımız dört işlevinin en küçük taklidi; watch geri çağrısı elle tetiklenmek üzere saklanır. */
function sahteVue() {
  const izleyiciler = []
  return {
    izleyiciler,
    ref: (value) => ({ value }),
    reactive: (nesne) => nesne,
    computed: (fn) => ({
      get value() {
        return fn()
      },
    }),
    watch: (_kaynak, geriCagri) => izleyiciler.push(geriCagri),
  }
}

function bellekDeposu(baslangic = null) {
  const kayitlar = []
  let silme = 0
  return {
    kayitlar,
    silmeSayisi: () => silme,
    oku: () => baslangic,
    yaz: (veri) => kayitlar.push(JSON.parse(JSON.stringify(veri))),
    sil: () => silme++,
  }
}

test('996 örneği yüklenince sonuç ve CSV hazır', () => {
  const durum = uygulama(sahteVue(), bellekDeposu()).setup()
  durum.ornekYukle()
  assert.equal(durum.sonuc.value.fcDk, 21 * 60)
  assert.equal(durum.sonuc.value.ucret.saatUcreti, Math.round((30000 / 225) * 100) / 100)
  assert.ok(durum.csvMetni().startsWith('\ufeffHafta;Gün;'))
})

test('hafta ekleme ve silme seçili sekmeyi geçerli tutar', () => {
  const durum = uygulama(sahteVue(), bellekDeposu()).setup()
  durum.haftaEkle()
  durum.haftaEkle()
  assert.equal(durum.secili.value, 2)
  durum.haftaSil(2)
  assert.equal(durum.haftalar.value.length, 2)
  assert.equal(durum.secili.value, 1)
  durum.temizle()
  durum.haftaSil(0) // son hafta silinmez
  assert.equal(durum.haftalar.value.length, 1)
})

test('bozuk ya da eski kayıt düzeltilerek yüklenir; bilinmeyen alanlar taşınmaz', () => {
  const kayit = {
    ayarlar: { aylikBrut: 45000, yabanci: 'x' },
    haftalar: [{ gunler: [{ calisti: true, ubgt: true, fazlalik: 1 }] }],
  }
  const durum = uygulama(sahteVue(), bellekDeposu(kayit)).setup()
  assert.equal(durum.haftalar.value[0].gunler.length, 7)
  assert.equal(durum.sonuc.value.netDk, 8 * 60) // eksik alanlar varsayılanla (09:00-18:00, 60 dk) doldu
  assert.equal(durum.ayarlar.aylikBrut, 45000)
  assert.equal(durum.ayarlar.gunlukAsimFazlaCalisma, true) // eski kayıtta olmayan yeni ayar varsayılanı alır
  assert.ok(!('yabanci' in durum.ayarlar))
  assert.ok(!('fazlalik' in durum.haftalar.value[0].gunler[0]))
  assert.equal(durum.haftalar.value[0].gunler[0].ubgt, 1) // eski true -> tam gün
})

test('başlangıç durumu saklanmaz; değişiklik saklanır', () => {
  const vue = sahteVue()
  const depo = bellekDeposu()
  const durum = uygulama(vue, depo).setup()
  const kaydet = vue.izleyiciler[0]
  kaydet()
  assert.equal(depo.kayitlar.length, 0)
  assert.equal(depo.silmeSayisi(), 1)
  durum.ornekYukle()
  kaydet()
  assert.equal(depo.kayitlar.length, 1)
  assert.equal(depo.kayitlar[0].haftalar[0].gunler[0].bitis, '21:00')
})

test('"Bu cihazdaki kaydı sil" kaydı siler ve formu sıfırlar; vazgeçilirse dokunmaz', () => {
  const kayit = { ayarlar: { aylikBrut: 45000 }, haftalar: [{ gunler: [{ calisti: true }] }] }
  const depo = bellekDeposu(kayit)
  const durum = uygulama(sahteVue(), depo).setup()
  const eski = globalThis.confirm
  try {
    globalThis.confirm = () => false
    durum.kaydiSil()
    assert.equal(durum.ayarlar.aylikBrut, 45000)
    assert.equal(depo.silmeSayisi(), 0)
    globalThis.confirm = () => true
    durum.kaydiSil()
  } finally {
    if (eski === undefined) delete globalThis.confirm
    else globalThis.confirm = eski
  }
  assert.equal(depo.silmeSayisi(), 1)
  assert.deepEqual({ ...durum.ayarlar }, varsayilanDurum().ayarlar)
  assert.equal(durum.sonuc.value.netDk, 0)
})

test('dönem tarihi girilince hafta aralığı gösterilir', () => {
  const durum = uygulama(sahteVue(), bellekDeposu()).setup()
  assert.equal(durum.haftaAraligi(0), '')
  durum.ayarlar.donemBaslangic = '2026-11-09'
  assert.equal(durum.haftaAraligi(0), '09.11.2026 – 15.11.2026')
})

test('tarayıcı deposu erişilemezse sessizce devre dışı kalır', () => {
  const bozuk = {
    getItem: () => {
      throw new Error('engelli')
    },
    setItem: () => {
      throw new Error('engelli')
    },
    removeItem: () => {
      throw new Error('engelli')
    },
  }
  const depo = tarayiciDeposu(bozuk)
  assert.equal(depo.oku(), null)
  assert.doesNotThrow(() => depo.yaz({ a: 1 }))
  assert.doesNotThrow(() => depo.sil())
  assert.equal(tarayiciDeposu(null).oku(), null)
})

test('localStorage özelliğine erişim hata fırlatsa da uygulama açılır', () => {
  const eski = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('SecurityError: site verisi engelli')
    },
  })
  try {
    const depo = tarayiciDeposu()
    assert.equal(depo.oku(), null)
    assert.doesNotThrow(() => uygulama(sahteVue()).setup())
  } finally {
    if (eski) Object.defineProperty(globalThis, 'localStorage', eski)
    else delete globalThis.localStorage
  }
})
