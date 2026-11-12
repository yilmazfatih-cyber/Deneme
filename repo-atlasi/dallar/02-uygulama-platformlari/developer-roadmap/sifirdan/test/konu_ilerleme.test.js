import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { konuAyristir, konuDogrula, konuHtml, konuYaz } from '../asama3_konu.js'
import {
  birlestir,
  bosIlerleme,
  durumlar,
  geriYukle,
  ilerlemeUygula,
  ozet,
  serilestir,
  siradakiler,
} from '../asama4_ilerleme.js'

const ORNEK = fileURLToPath(new URL('../ornek', import.meta.url))
const belge = JSON.parse(fs.readFileSync(path.join(ORNEK, 'kabuk.json'), 'utf8'))

test('konu dosyası ayrıştırılır; İngilizce başlıklı biçim de tanınır', () => {
  const k = konuAyristir(fs.readFileSync(path.join(ORNEK, 'content', 'betik-yazma@K5betikYazma000000001.md'), 'utf8'))
  assert.equal(k.baslik, 'Betik Yazma')
  assert.match(k.aciklama, /set -euo pipefail/)
  assert.deepEqual(
    k.kaynaklar.map((x) => x.tur),
    ['official', 'opensource'],
  )
  const en = konuAyristir(
    '# CORS\n\nCross-origin rules.\n\nVisit the following resources to learn more:\n\n- [@article@MDN \\[CORS\\]](https://developer.mozilla.org/x)\n',
  )
  assert.deepEqual(en.kaynaklar, [{ tur: 'article', baslik: 'MDN [CORS]', url: 'https://developer.mozilla.org/x' }])
})

test('yaz → ayrıştır gidiş-dönüşü aynı konuyu verir (köşeli parantez kaçışı dahil)', () => {
  const konu = {
    baslik: 'Diziler',
    aciklama: 'Diziler `[1, 2]` gibi yazılır.',
    kaynaklar: [
      { tur: 'official', baslik: 'Belge [v2] <yeni>', url: 'https://ornek.dev/a' },
      { tur: 'video', baslik: 'Video\\ders', url: 'https://ornek.dev/b' },
    ],
  }
  assert.deepEqual(konuAyristir(konuYaz(konu)), konu)
})

test('konu kuralları: en fazla 8 bağlantı, tür sırası, https, yasak alan, tekrar', () => {
  const kaynak = (tur, url) => ({ tur, baslik: 't', url })
  const hatalar = konuDogrula({
    baslik: 'X',
    aciklama: 'y',
    kaynaklar: [
      kaynak('video', 'https://a.dev/1'),
      kaynak('article', 'https://a.dev/2'),
      kaynak('article', 'http://a.dev/3'),
      kaynak('book', 'https://www.geeksforgeeks.org/x'),
      kaynak('book', 'https://a.dev/1'),
      kaynak('book', 'https://a.dev/5'),
      kaynak('book', 'https://a.dev/6'),
      kaynak('book', 'https://a.dev/7'),
      kaynak('book', 'https://a.dev/8'),
    ],
  }).join('\n')
  assert.match(hatalar, /en fazla 8 kaynak/)
  assert.match(hatalar, /@article@ daha önce gelmeli/)
  assert.match(hatalar, /yalnızca https: http:\/\/a\.dev\/3/)
  assert.match(hatalar, /kabul edilmiyor: www\.geeksforgeeks\.org/)
  assert.match(hatalar, /aynı bağlantı iki kez/)
  assert.deepEqual(konuDogrula({ baslik: '', aciklama: '', kaynaklar: [] }), [
    'başlık ("# …") yok',
    'açıklama paragrafı yok',
  ])
})

test("konu HTML'i güvenli: ham HTML ve javascript: bağlantısı etkisiz kalır", () => {
  const html = konuHtml({
    baslik: 'x',
    aciklama:
      'Kalın **yazı**, `kod` ve <img src=x onerror=alert(1)> ile [kötü](javascript:alert(1)) [iyi](https://iyi.dev).',
    kaynaklar: [{ tur: 'article', baslik: '<b>başlık</b>', url: 'javascript:alert(1)' }],
  })
  assert.ok(!html.includes('<img'))
  assert.ok(!html.includes('href="javascript:'))
  assert.match(html, /<strong>yazı<\/strong>/)
  assert.match(html, /<code>kod<\/code>/)
  assert.match(html, /<a href="https:\/\/iyi.dev" rel="noopener">iyi<\/a>/)
  assert.match(html, /<a href="#" rel="noopener">&lt;b&gt;başlık&lt;\/b&gt;<\/a>/)
})

test('ilerleme indirgeyicisi saf; değişmeyen eylem aynı nesneyi döndürür', () => {
  const bos = bosIlerleme('kabuk')
  const a = ilerlemeUygula(bos, { tur: 'isaretle', dugum: 'K1kabukNedir000000001', durum: 'done', zaman: 1 })
  assert.deepEqual(bos.kayitlar, {}, 'eski durum değişmedi')
  assert.equal(ilerlemeUygula(a, { tur: 'isaretle', dugum: 'K1kabukNedir000000001', durum: 'done', zaman: 2 }), a)
  const b = ilerlemeUygula(a, { tur: 'temizle', dugum: 'K1kabukNedir000000001', zaman: 3 })
  assert.deepEqual(durumlar(b), {})
  assert.deepEqual(b.kayitlar.K1kabukNedir000000001, { durum: null, zaman: 3 }, 'silme işareti kalır')
  assert.throws(
    () => ilerlemeUygula(bos, { tur: 'isaretle', dugum: 'x', durum: 'bitti', zaman: 1 }),
    /Bilinmeyen durum/,
  )
})

test('özet ve sıradaki konular', () => {
  let p = bosIlerleme('kabuk')
  const isaretle = (dugum, durum) => (p = ilerlemeUygula(p, { tur: 'isaretle', dugum, durum, zaman: 1 }))
  assert.deepEqual(siradakiler(belge, p), ['K1kabukNedir000000001'], 'başlangıçta yalnızca ilk konu açık')
  isaretle('K1kabukNedir000000001', 'done')
  isaretle('K2dosyaSistemi0000001', 'done')
  isaretle('S1izinler000000000001', 'skipped')
  isaretle('K3boruYonlendirme0001', 'learning')
  assert.deepEqual(ozet(belge, p), { toplam: 11, bitti: 2, ogreniliyor: 1, atlandi: 1, yuzde: 20 })
  assert.deepEqual(siradakiler(belge, p), ['S2baglantilar00000001', 'K3boruYonlendirme0001'])
})

test('serileştirme: gidiş-dönüş, bozuk ve yabancı veriyi reddetme, bilinmeyen düğümü atma', () => {
  let p = bosIlerleme('kabuk')
  p = ilerlemeUygula(p, { tur: 'isaretle', dugum: 'K1kabukNedir000000001', durum: 'done', zaman: 5 })
  assert.deepEqual(geriYukle(serilestir(p), belge), p)
  assert.throws(() => geriYukle('{bozuk', belge), /JSON değil/)
  assert.throws(() => geriYukle('{"surum":99,"yolHaritasi":"kabuk"}', belge), /Desteklenmeyen/)
  assert.throws(() => geriYukle(serilestir(bosIlerleme('react')), belge), /başka bir yol haritasına/)
  const yabanci = JSON.stringify({
    surum: 1,
    yolHaritasi: 'kabuk',
    kayitlar: { olmayanDugum: { durum: 'done', zaman: 1 }, K1kabukNedir000000001: { durum: 'uydurma', zaman: 1 } },
  })
  assert.deepEqual(geriYukle(yabanci, belge).kayitlar, {})
})

test('iki cihazın ilerlemesi birleşir: yeni olan kazanır, temizleme de yayılır', () => {
  const k = 'K1kabukNedir000000001'
  const m = 'K2dosyaSistemi0000001'
  let telefon = bosIlerleme('kabuk')
  let dizustu = bosIlerleme('kabuk')
  telefon = ilerlemeUygula(telefon, { tur: 'isaretle', dugum: k, durum: 'done', zaman: 10 })
  dizustu = ilerlemeUygula(dizustu, { tur: 'isaretle', dugum: k, durum: 'learning', zaman: 5 })
  dizustu = ilerlemeUygula(dizustu, { tur: 'isaretle', dugum: m, durum: 'done', zaman: 6 })
  telefon = ilerlemeUygula(telefon, { tur: 'isaretle', dugum: m, durum: 'done', zaman: 7 })
  telefon = ilerlemeUygula(telefon, { tur: 'temizle', dugum: m, zaman: 8 })
  const sonuc = birlestir(dizustu, telefon)
  assert.deepEqual(durumlar(sonuc), { [k]: 'done' })
  assert.deepEqual(birlestir(telefon, dizustu), sonuc, 'sıra fark etmez')
  assert.throws(() => birlestir(bosIlerleme('a'), bosIlerleme('b')), /Farklı yol haritaları/)
})
