// Çalıştır: node --test sadaka-tasi/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TL,
  VARSAYILAN_KURALLAR as K,
  KuralHatasi,
  dagit,
  paylariBol,
  paraOku,
  paraYaz,
  paraKisa,
  ayEkle,
  ayFarki,
  ayAdi,
  limitDetay,
  etkiHesapla,
  yeniDurum,
  uyeEkle,
  uyeGuncelle,
  uyeLimiti,
  talepDogrula,
  talepOlustur,
  talepKararVer,
  belgeEkle,
  itirazEt,
  geriCek,
  ayiKapat,
  bakiyeler,
  butceKalan,
  rezervHedefi,
  projeksiyon,
  topla,
} from './kurallar.mjs'
import { ornekDurum, DEMO_BUGUN } from './ornek.mjs'

/** Ayları sırayla doldurulmuş ödeme listesi. */
function odemeler(bas, adet, tutar) {
  return Array.from({ length: adet }, (_, i) => ({ ay: ayEkle(bas, i), tutar }))
}

function ayIlerlet(s, n) {
  for (let i = 0; i < n; i++) s = ayiKapat(s)
  return s
}

test('para okuma Türkçe yazımı önceler', () => {
  assert.equal(paraOku('1.250'), TL(1250))
  assert.equal(paraOku('1.250,50'), 125050)
  assert.equal(paraOku('12,5'), 1250)
  assert.equal(paraOku('12.50'), 1250)
  assert.equal(paraOku(' 3 000 TL '), TL(3000))
  assert.equal(paraOku('₺750'), TL(750))
  assert.equal(paraOku(''), null)
  assert.equal(paraOku('abc'), null)
  assert.equal(paraOku('-5'), null)
  assert.equal(paraOku('1,234'), null)
})

test('para yazımı', () => {
  assert.equal(paraYaz(TL(1250)), '1.250 TL')
  assert.equal(paraYaz(125075), '1.250,75 TL')
  assert.equal(paraYaz(-TL(40)), '−40 TL')
  assert.equal(paraYaz(TL(40), { isaret: true }), '+40 TL')
  assert.equal(paraKisa(TL(2_140_000)), '2,1 milyon TL')
  assert.equal(paraKisa(TL(412_300)), '412 bin TL')
  assert.equal(paraKisa(TL(9_500)), '9.500 TL')
})

test('dağıtım kuruşu kaybetmez, en büyük kalana verir', () => {
  assert.deepEqual(dagit(100, { a: 1, b: 1, c: 1 }), { a: 34, b: 33, c: 33 })
  assert.deepEqual(dagit(0, { a: 1 }), { a: 0 })
  assert.deepEqual(dagit(10, {}), {})
  for (const tutar of [1, 7, 99, 12345, 100001]) {
    const p = paylariBol(tutar)
    assert.equal(p.sadaka + p.havuz + p.isletme, tutar)
  }
  assert.deepEqual(paylariBol(TL(100)), { sadaka: TL(20), havuz: TL(70), isletme: TL(10) })
})

test('ay hesapları', () => {
  assert.equal(ayEkle('2026-11', 2), '2027-01')
  assert.equal(ayEkle('2026-01', -1), '2025-12')
  assert.equal(ayFarki('2025-12', '2026-02'), 2)
  assert.equal(ayFarki('2026-02', '2025-12'), -2)
  assert.equal(ayAdi('2026-11'), 'Kasım 2026')
  assert.equal(ayAdi('2026-08', { kisa: true }), 'Ağu 26')
  assert.throws(() => ayEkle('2026-13', 1))
})

test('tavan: bekleme ve basamaklar; aidat tutarına bağlı değil', () => {
  const uye = { id: 'u', durum: 'aktif', odemeler: odemeler('2026-01', 2, TL(500)) }
  let l = limitDetay(uye, [], '2026-02')
  assert.equal(l.beklemeKalanAy, 1)
  assert.equal(l.limit, 0)
  assert.deepEqual(l.sonrakiTavan, { kalanAy: 1, tavan: TL(10_000) })

  uye.odemeler = odemeler('2026-01', 3, TL(500))
  l = limitDetay(uye, [], '2026-03')
  assert.equal(l.beklemeKalanAy, 0)
  assert.equal(l.limit, TL(10_000))
  assert.deepEqual(l.sonrakiTavan, { kalanAy: 9, tavan: TL(20_000) })

  const azOdeyen = { id: 'v', durum: 'aktif', odemeler: odemeler('2026-01', 3, K.asgariAidat) }
  assert.equal(limitDetay(azOdeyen, [], '2026-03').limit, l.limit, 'daha çok ödemek tavanı yükseltmez')

  uye.odemeler = odemeler('2026-01', 12, TL(500))
  l = limitDetay(uye, [], '2026-12')
  assert.equal(l.limit, TL(20_000))
  assert.equal(l.sonrakiTavan, null)

  // Aidat bu ay henüz alınmadıysa geçen aya kadar olan seri sayılır.
  l = limitDetay(uye, [], '2027-01')
  assert.equal(l.ardisikAy, 12)
  assert.equal(l.beklemeKalanAy, 0)
})

test('tavan: ara verip dönen üyede bekleme yeniden işler', () => {
  const uye = {
    id: 'u',
    durum: 'aktif',
    odemeler: [...odemeler('2026-01', 6, TL(300)), ...odemeler('2026-08', 2, TL(300))],
  }
  let l = limitDetay(uye, [], '2026-09')
  assert.equal(l.ardisikAy, 2)
  assert.equal(l.beklemeKalanAy, 1)
  assert.equal(l.limit, 0)
  uye.odemeler.push({ ay: '2026-10', tutar: TL(300) })
  l = limitDetay(uye, [], '2026-10')
  assert.equal(l.limit, TL(10_000))

  uye.durum = 'ara'
  assert.equal(limitDetay(uye, [], '2026-10').limit, 0)
})

test('tavan: onaylanan yardım 12 ay düşülür, sonra tavana döner', () => {
  const uye = { id: 'u', durum: 'aktif', odemeler: odemeler('2025-01', 30, TL(500)) }
  const talepler = [
    { uyeId: 'u', durum: 'odendi', onaylanan: TL(4000), odenen: TL(4000), kararAy: '2026-01', tutar: TL(4000) },
  ]
  let l = limitDetay(uye, talepler, '2026-06')
  assert.equal(l.kullanilan, TL(4000))
  assert.equal(l.kullanilabilir, TL(16_000))
  assert.deepEqual(l.geriDonusler, [{ ay: '2027-01', tutar: TL(4000) }])
  l = limitDetay(uye, talepler, '2027-01')
  assert.equal(l.kullanilan, 0)
  assert.equal(l.kullanilabilir, TL(20_000))
})

test('üyelik: ilk aidat katılırken alınır ve doğru bölünür', () => {
  let s = yeniDurum({ ay: '2026-01' })
  assert.throws(() => uyeEkle(s, { aylikPay: TL(100) }), KuralHatasi)
  const r = uyeEkle(s, { aylikPay: TL(500), alan: 'egitim', ben: true })
  s = r.durum
  assert.equal(s.benId, r.uyeId)
  assert.deepEqual(bakiyeler(s), { sadaka: TL(100), havuz: TL(350), isletme: TL(50) })
  assert.equal(s.uyeler[0].odemeler.length, 1)
})

test('talep: bekleme, tek açık talep, tavan ve inceleme yolu', () => {
  let s = yeniDurum({ ay: '2026-01' })
  const r = uyeEkle(s, { aylikPay: TL(500) })
  s = r.durum
  const id = r.uyeId
  const girdi = { uyeId: id, kategori: 'saglik', tutar: TL(1000), aciklama: 'Diş tedavisi faturası' }

  let d = talepDogrula(s, girdi)
  assert.equal(d.gecerli, false)
  assert.match(d.hatalar[0], /Bekleme süreniz 2 ay sonra/)

  s = ayIlerlet(s, 2)
  assert.equal(uyeLimiti(s, id).limit, TL(10_000))

  d = talepDogrula(s, { ...girdi, tutar: TL(10_500) })
  assert.ok(d.hatalar.some((h) => h.includes('kalan yardım tavanınızın (10.000 TL)')))
  assert.equal(talepDogrula(s, { ...girdi, tutar: TL(100) }).gecerli, false)
  assert.equal(talepDogrula(s, { ...girdi, aciklama: 'kısa' }).gecerli, false)
  assert.equal(talepDogrula(s, { ...girdi, kategori: 'tatil' }).gecerli, false)
  assert.equal(talepDogrula(s, { ...girdi, tutar: TL(5000) }).yol, 'hizli')
  assert.equal(talepDogrula(s, { ...girdi, tutar: TL(5100) }).yol, 'kurul')

  const t = talepOlustur(s, girdi)
  s = t.durum
  assert.equal(uyeLimiti(s, id).incelemede, TL(1000))
  assert.throws(() => talepOlustur(s, girdi), /İncelenen bir talebiniz var/)
  s = geriCek(s, t.talepId)
  assert.equal(s.talepler[0].durum, 'geri-cekildi')
  assert.ok(talepOlustur(s, girdi))
})

test('karar: onay bütçe kadar öder, kalanı sıraya girer ve sonraki aylarda ödenir', () => {
  let s = yeniDurum({ ay: '2026-01' })
  const r = uyeEkle(s, { aylikPay: TL(500) })
  s = ayIlerlet(r.durum, 2)
  // Tek üyeli küçük havuz: 3 × 350 = 1.050 TL; ayın ödeme payı %30 → 315 TL
  assert.equal(bakiyeler(s).havuz, TL(1050))
  assert.equal(butceKalan(s), TL(315))
  const t = talepOlustur(s, {
    uyeId: r.uyeId,
    kategori: 'kaza',
    tutar: TL(1000),
    aciklama: 'Kolum kırıldı, alçı ve ilaç',
  })
  s = talepKararVer(t.durum, t.talepId, { tur: 'onay' })
  let talep = s.talepler[0]
  assert.equal(talep.durum, 'sirada')
  assert.equal(talep.odenen, TL(315))
  assert.equal(butceKalan(s), 0)
  for (let i = 0; i < 6 && talep.durum !== 'odendi'; i++) {
    s = ayiKapat(s)
    talep = s.talepler[0]
    assert.ok(bakiyeler(s).havuz >= 0)
  }
  assert.equal(talep.durum, 'odendi')
  assert.equal(talep.odenen, TL(1000))
  const destek = -topla(s.defter.filter((d) => d.tur === 'destek').map((d) => d.tutar))
  assert.equal(destek, TL(1000))
})

test('karar: kısmi onay, ek belge, gerekçeli ret ve tek itiraz', () => {
  let s = yeniDurum({ ay: '2026-01' })
  const r = uyeEkle(s, { aylikPay: TL(500) })
  s = ayIlerlet(r.durum, 2)
  const girdi = { uyeId: r.uyeId, kategori: 'onarim', tutar: TL(2000), aciklama: 'Kombi arızası, usta teklifi ekte' }
  let t = talepOlustur(s, girdi)
  assert.throws(() => talepKararVer(t.durum, t.talepId, { tur: 'onay', tutar: TL(2500) }), KuralHatasi)
  s = talepKararVer(t.durum, t.talepId, { tur: 'belge', not: 'Usta faturası' })
  assert.equal(s.talepler[0].durum, 'belge')
  assert.throws(() => talepKararVer(s, t.talepId, { tur: 'onay' }), KuralHatasi)
  s = belgeEkle(s, t.talepId, ['fatura.pdf'])
  assert.equal(s.talepler[0].durum, 'inceleme')
  assert.throws(() => talepKararVer(s, t.talepId, { tur: 'red' }), /gerekçe/)
  s = talepKararVer(s, t.talepId, { tur: 'red', gerekce: 'Belgeler yetmedi' })
  assert.equal(s.talepler[0].durum, 'uygun-degil')
  assert.equal(uyeLimiti(s, r.uyeId).kullanilan, 0, 'uygun görülmeyen talep limitten düşmez')
  s = itirazEt(s, t.talepId, 'Fatura eklendi')
  assert.equal(s.talepler[0].durum, 'inceleme')
  s = talepKararVer(s, t.talepId, { tur: 'onay', tutar: TL(1200) })
  assert.equal(s.talepler[0].onaylanan, TL(1200))
  assert.equal(uyeLimiti(s, r.uyeId).kullanilan, TL(1200))
  s = talepKararVer(talepOlustur(s, { ...girdi, tutar: TL(1000) }).durum, 'T-0003', { tur: 'red', gerekce: 'x' })
  s = itirazEt(s, 'T-0003', '')
  s = talepKararVer(s, 'T-0003', { tur: 'red', gerekce: 'x' })
  assert.throws(() => itirazEt(s, 'T-0003', ''), /itiraz hakkı/)
})

test('ay sonu: rezerv üstü sadakaya gider, sadaka ve işletme hesabı sıfırlanır', () => {
  let s = yeniDurum({ ay: '2026-01' })
  for (const [pay, alan] of [
    [TL(1000), 'gida'],
    [TL(500), 'egitim'],
    [TL(500), 'gida'],
  ]) {
    s = uyeEkle(s, { aylikPay: pay, alan }).durum
  }
  for (let i = 0; i < 14; i++) {
    const once = s
    s = ayiKapat(s)
    const rapor = s.raporlar.at(-1)
    assert.equal(rapor.ay, once.ay)
    const kapanis = s.defter.filter((d) => d.ay === once.ay)
    const net = (kova) => topla(kapanis.filter((d) => d.kova === kova).map((d) => d.tutar))
    // Kapanan ayın sadaka ve işletme hesabı sıfıra iner (her kuruş dağıtıldı ya da harcandı).
    const oncekiler = s.defter.filter((d) => ayFarki(d.ay, once.ay) > 0)
    const bakiye = (kova) => topla(oncekiler.filter((d) => d.kova === kova).map((d) => d.tutar)) + net(kova)
    assert.equal(bakiye('sadaka'), 0)
    assert.equal(bakiye('isletme'), 0)
    assert.ok(rapor.havuzSonu <= Math.max(rapor.rezervHedefi, 0) + rapor.bekleyen || rapor.aktarim === 0)
    assert.equal(rapor.sadaka, topla(Object.values(rapor.alanlar)))
  }
  const son = s.raporlar.at(-1)
  assert.equal(son.havuzSonu, son.rezervHedefi, 'destek yokken havuz rezerv hedefinde durur')
  assert.ok(son.aktarim > 0)
  // Gıda tercihi payların 3/4'ü: dağıtımın da yaklaşık 3/4'ü
  assert.ok(Math.abs(son.alanlar.gida / son.sadaka - 0.75) < 0.001)
  assert.equal(rezervHedefi(s), K.rezervKati * s.butce.havuzGirisi)
})

test('ay başı: sıradaki borçlar bütçe yetmezse oransal ödenir', () => {
  let s = yeniDurum({ ay: '2026-01' })
  const a = uyeEkle(s, { aylikPay: TL(1000) })
  const b = uyeEkle(a.durum, { aylikPay: TL(1000) })
  s = ayIlerlet(b.durum, 2)
  const ta = talepOlustur(s, { uyeId: a.uyeId, kategori: 'saglik', tutar: TL(3000), aciklama: 'Ameliyat masrafı' })
  const tb = talepOlustur(ta.durum, {
    uyeId: b.uyeId,
    kategori: 'cenaze',
    tutar: TL(1000),
    aciklama: 'Babamın cenazesi',
  })
  s = talepKararVer(tb.durum, ta.talepId, { tur: 'onay' })
  s = talepKararVer(s, tb.talepId, { tur: 'onay' })
  const odenen = (st) => st.talepler.map((t) => t.odenen)
  const once = odenen(s)
  s = ayiKapat(s)
  const sonra = odenen(s)
  const artis = [sonra[0] - once[0], sonra[1] - once[1]]
  const kalanOnce = [TL(3000) - once[0], TL(1000) - once[1]]
  if (s.talepler.every((t) => t.durum === 'sirada')) {
    // Oransal: artışlar, kalan borçlarla orantılı (kuruş yuvarlaması dışında)
    assert.ok(Math.abs(artis[0] / artis[1] - kalanOnce[0] / kalanOnce[1]) < 0.01)
  }
  assert.ok(sonra[0] > once[0] && sonra[1] >= once[1])
})

test('üyelik: ara ver ve dön; dönüşte bu ayın payı alınır, bekleme yeniden işler', () => {
  let s = yeniDurum({ ay: '2026-01' })
  const r = uyeEkle(s, { aylikPay: TL(300) })
  s = ayIlerlet(r.durum, 5)
  assert.ok(uyeLimiti(s, r.uyeId).limit > 0)
  s = uyeGuncelle(s, r.uyeId, { durum: 'ara' })
  s = ayIlerlet(s, 2)
  assert.equal(s.uyeler[0].odemeler.length, 6)
  s = uyeGuncelle(s, r.uyeId, { durum: 'aktif', aylikPay: TL(400), alan: 'afet' })
  assert.equal(s.uyeler[0].odemeler.length, 7)
  assert.equal(s.uyeler[0].odemeler.at(-1).tutar, TL(400))
  assert.equal(uyeLimiti(s, r.uyeId).beklemeKalanAy, 2)
  assert.throws(() => uyeGuncelle(s, r.uyeId, { aylikPay: TL(10) }), KuralHatasi)
})

test('etki: katkının nereye gittiği', () => {
  const uye = { id: 'u', odemeler: odemeler('2026-01', 10, TL(500)) }
  const e = etkiHesapla(uye, [{ uyeId: 'u', odenen: TL(1200) }])
  assert.deepEqual(e, { toplam: TL(5000), sadaka: TL(1000), havuz: TL(3500), isletme: TL(500), alinan: TL(1200) })
})

test('örnek veri: bugüne kadar tutarlı bir sandık üretir', () => {
  const s = ornekDurum()
  assert.equal(s.ay, DEMO_BUGUN)
  const b = bakiyeler(s)
  assert.ok(b.havuz > 0)
  assert.ok(s.uyeler.length >= 5)
  assert.ok(s.talepler.some((t) => t.durum === 'inceleme'))
  assert.ok(s.talepler.some((t) => t.durum === 'odendi'))
  for (const r of s.raporlar) {
    assert.ok(r.havuzSonu >= 0)
    assert.equal(r.sadaka, topla(Object.values(r.alanlar)))
  }
  // Her bireysel talebin ödenen tutarı defterdeki destek kayıtlarına eşittir.
  for (const t of s.talepler) {
    const defter = 0 - topla(s.defter.filter((d) => d.ref === t.id).map((d) => d.tutar))
    assert.equal(defter, t.odenen, t.id)
  }
  // Her üyenin ödemeleri ayrı aylara aittir.
  for (const u of s.uyeler) assert.equal(new Set(u.odemeler.map((o) => o.ay)).size, u.odemeler.length)
  // Aynı tohumla aynı sandık
  assert.deepEqual(ornekDurum(), s)
})

test('projeksiyon: her kuruşun hesabı tutar; afet kuyruğu zamanla erir', () => {
  const g = {
    ay: 36,
    baslangicUye: 200,
    aylikYeniUye: 120,
    ayrilmaOrani: 0.02,
    ortalamaPay: TL(350),
    yillikTalepOrani: 0.1,
    ortalamaTalep: TL(7000),
  }
  const p = projeksiyon(g)
  assert.equal(p.seri.length, 36)
  assert.equal(p.toplam.katki, p.toplam.sadaka + p.toplam.destek + p.toplam.isletme + p.toplam.havuzSonu)
  for (const r of p.seri) assert.ok(r.havuz >= 0)

  const afetli = projeksiyon({ ...g, afet: { ay: 18, oran: 0.2, ortalamaTalep: TL(15000) } })
  const afetAyi = afetli.seri[17]
  assert.ok(afetAyi.kuyruk > 0, 'afet ayında ihtiyaç aylık ödeme payını aşar')
  assert.equal(afetli.toplam.kuyrukSonu, 0, 'birikmiş ihtiyaç 36. aya kadar ödenir')
  assert.equal(
    afetli.toplam.katki,
    afetli.toplam.sadaka + afetli.toplam.destek + afetli.toplam.isletme + afetli.toplam.havuzSonu,
  )
  assert.ok(afetli.toplam.sadaka < p.toplam.sadaka)
})
