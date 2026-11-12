// Koan 6 — ES modülleri (ESM)
// Kitap: "Scope & Closures" (2. baskı) Bölüm 8 "The Module Pattern" → "Modern ES Modules (ESM)" bölümü;
//        "Get Started" Bölüm 2 "How We Organize in JS → Modules"; 1. baskı "ES6 & Beyond" Bölüm 3 "Organization"
// Örnek modüller: koanlar/ornek_moduller/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __ } from './_yardimci.js'
import sifirla, { sayac, arttir } from './ornek_moduller/sayac.js'
import * as sayacModulu from './ornek_moduller/sayac.js'

test('[SC 8] canlı bağlama: içe aktarılan değişken, dışa aktaranın güncel değerini gösterir', () => {
  sifirla()
  arttir()
  arttir()
  assert.equal(sayac, __(2)) // kopya olsaydı 0 kalırdı
})

test('[SC 8] içe aktarılan bağlama atanamaz (salt okunur görünüm)', () => {
  assert.throws(() => {
    sayac = 99 // içe aktarılan bağlamaya atama: çalışma zamanında TypeError
  }, __(TypeError))
})

test('[SC 8] modül tekildir: statik ve dinamik içe aktarma aynı örneği paylaşır', async () => {
  sifirla()
  const dinamik = await import('./ornek_moduller/sayac.js')
  dinamik.arttir()
  assert.equal(sayac, __(1))
  assert.equal(dinamik, __(sayacModulu)) // aynı ad alanı nesnesi
  assert.equal(typeof dinamik.default, __('function')) // default dışa aktarım
})

test('[ES6 3] ad alanı nesnesi genişletilemez ve değiştirilemez', () => {
  assert.equal(Object.isExtensible(sayacModulu), __(false))
  assert.throws(() => {
    sayacModulu.yeni = 1
  }, __(TypeError))
  assert.equal(sayacModulu[Symbol.toStringTag], __('Module'))
})

test('[GS 2] modül kodu katı kipte çalışır: bildirilmemiş değişkene atama hata', () => {
  assert.throws(() => {
    bildirilmemisDegisken = 1 // katı kip: örtük global oluşturulmaz
  }, __(ReferenceError))
})

test('[ES6 3] değerlendirme sırası: önce bağımlılıklar (derinlik öncelikli), sonra modülün kendisi', async () => {
  globalThis.__modulSirasi = []
  await import('./ornek_moduller/sira_a.js')
  assert.deepEqual(globalThis.__modulSirasi, __(['b', 'a']))
})

test('[SC 5 + ES6 3] döngüsel içe aktarma: henüz değerlendirilmemiş modülün let’i TDZ’dedir', async () => {
  await import('./ornek_moduller/dongu_a.js')
  const b = await import('./ornek_moduller/dongu_b.js')
  assert.equal(b.bSonuc, __('ReferenceError'))
})
