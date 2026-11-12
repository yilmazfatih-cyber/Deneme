import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  ayarlariDuzelt,
  bosHafta,
  csvHucresi,
  csvOlustur,
  dakikaya,
  donemiHesapla,
  enAzYasalMola,
  geceDonemiUygunMu,
  gunuHesapla,
  haftayiDuzelt,
  haftayiHesapla,
  ornek996Haftasi,
  saatMetni,
  tarihe,
  tarihMetni,
  yasalAraDinlenme,
} from '../motor.js'

const gun = (baslangic, bitis, molaDk = 60, ek = {}) => ({
  calisti: true,
  baslangic,
  bitis,
  molaDk,
  ubgt: 0,
  ...ek,
})
const IZIN = bosHafta().gunler[0]
const hafta = (...gunler) => ({ gunler: [...gunler, ...bosHafta().gunler].slice(0, 7) })
const tekrar = (n, g) => Array.from({ length: n }, () => g)
const kodlar = (ihlaller) => ihlaller.map((x) => x.kod)
const BES_GUN = tekrar(5, gun('09:00', '18:00'))
const notVar = (s, parca) => s.notlar.some((n) => n.includes(parca))
const uyariVar = (s, parca) => s.uyarilar.some((n) => n.includes(parca))

describe('temel dönüşümler', () => {
  test('saat metni ve dakika', () => {
    assert.equal(dakikaya('09:30'), 570)
    assert.equal(dakikaya('24:00'), 1440)
    assert.ok(Number.isNaN(dakikaya('25:00')))
    assert.ok(Number.isNaN(dakikaya('9.30')))
    assert.equal(saatMetni(570), '9 sa 30 dk')
    assert.equal(saatMetni(480), '8 sa')
  })

  test('md. 68 ara dinlenmesi eşikleri', () => {
    assert.deepEqual([0, 240, 241, 450, 451].map(yasalAraDinlenme), [0, 15, 30, 30, 60])
  })

  test('tarih yalnız takvim günüdür: saat dilimi ve "bugün" kullanılmaz', () => {
    assert.equal(tarihe('2026-11-09'), Date.UTC(2026, 10, 9))
    assert.ok(Number.isNaN(tarihe('2026-02-30')))
    assert.ok(Number.isNaN(tarihe('09.11.2026')))
    assert.equal(tarihMetni(Date.UTC(2026, 0, 5)), '05.01.2026')
  })
})

describe('günlük hesap', () => {
  test('09:00-18:00, 1 saat mola: 8 saat, ihlal yok', () => {
    const g = gunuHesapla(gun('09:00', '18:00'))
    assert.equal(g.netDk, 480)
    assert.deepEqual(g.ihlaller, [])
  })

  test('eksik mola md. 68 ihlalidir', () => {
    const g = gunuHesapla(gun('09:00', '18:00', 30))
    assert.equal(g.netDk, 510)
    assert.deepEqual(kodlar(g.ihlaller), ['ARA_DINLENME'])
    assert.match(g.ihlaller[0].mesaj, /en az 60 dk/)
  })

  test('"en az yasal" yöntemi verilmeyen molayı yine de düşer ama ihlali gösterir', () => {
    const g = gunuHesapla(gun('09:00', '18:00', 0), { molaYontemi: 'en-az-yasal' })
    assert.equal(g.dusulenMolaDk, 60)
    assert.equal(g.netDk, 480)
    assert.deepEqual(kodlar(g.ihlaller), ['ARA_DINLENME'])
  })

  test('"en az yasal" mola md. 68 ile tutarlı en kısa süredir (bantlarda basamak yok)', () => {
    for (let brut = 1; brut <= 1600; brut++) {
      const mola = enAzYasalMola(brut)
      const net = brut - mola
      assert.ok(net === 0 || yasalAraDinlenme(net) <= mola, `brüt ${brut}: ${mola} dk yetmez`)
      const daha = mola - 1
      if (daha >= 0 && brut - daha > 0) {
        assert.ok(yasalAraDinlenme(brut - daha) > daha, `brüt ${brut}: ${daha} dk de yeterdi`)
      }
    }
    const y = { molaYontemi: 'en-az-yasal' }
    assert.equal(gunuHesapla(gun('08:00', '16:01', 0), y).netDk, 450) // eskiden 421 (60 dk düşülüyordu)
    assert.equal(gunuHesapla(gun('09:00', '13:20', 0), y).netDk, 240) // eskiden 230
    assert.equal(gunuHesapla(gun('08:00', '17:00', 0), y).netDk, 480)
  })

  test('11 saati aşan gün md. 63 ihlalidir; tam 11 saat değildir', () => {
    assert.deepEqual(kodlar(gunuHesapla(gun('08:00', '21:00')).ihlaller), ['GUNLUK_11'])
    assert.deepEqual(gunuHesapla(gun('09:00', '21:00')).ihlaller, [])
    assert.equal(gunuHesapla(gun('08:00', '21:00')).asimDk, 60)
  })

  test('gece yarısını aşan vardiya ve md. 69 gece sınırı', () => {
    const kisa = gunuHesapla(gun('22:00', '06:00'))
    assert.equal(kisa.netDk, 420)
    assert.equal(kisa.geceDk, 480)
    assert.ok(kisa.geceCalismasi)
    assert.deepEqual(kisa.ihlaller, [])
    const uzun = gunuHesapla(gun('20:00', '06:00'))
    assert.deepEqual(kodlar(uzun.ihlaller), ['GECE_7_5'])
    assert.equal(uzun.asimDk, 90) // net 9 sa - 7,5 sa
    const aksam = gunuHesapla(gun('14:00', '23:00'))
    assert.equal(aksam.geceDk, 180)
    assert.equal(aksam.geceCalismasi, false)
  })

  test('eksik ayarla çağrılsa da gece denetimi kapanmaz', () => {
    assert.deepEqual(kodlar(gunuHesapla(gun('20:00', '06:00'), { molaYontemi: 'girilen' }).ihlaller), ['GECE_7_5'])
  })

  test('hatalı saat çökertmez ve hesaba katılmaz', () => {
    for (const g of [gunuHesapla(gun('9.00', '18:00')), gunuHesapla(gun('24:00', '08:00'))]) {
      assert.equal(g.netDk, 0)
      assert.equal(g.hatalar.length, 1)
    }
  })

  test('başlangıç ve bitiş aynıysa 24 saatlik nöbettir', () => {
    const n = gunuHesapla(gun('08:00', '08:00', 180))
    assert.deepEqual(n.hatalar, [])
    assert.equal(n.brutDk, 1440)
    assert.equal(n.netDk, 1260)
    assert.ok(n.nobet24)
    assert.equal(n.asimDk, 600)
    assert.ok(kodlar(n.ihlaller).includes('GUNLUK_11'))
  })
})

describe('ayarların doğrulanması', () => {
  test('md. 69 gece dönemi çerçevesi', () => {
    assert.ok(geceDonemiUygunMu('20:00', '06:00'))
    assert.ok(geceDonemiUygunMu('19:30', '06:30'))
    assert.ok(!geceDonemiUygunMu('22:00', '06:00')) // 20:00'den geç başlıyor
    assert.ok(!geceDonemiUygunMu('19:00', '07:00')) // 12 saat
    assert.ok(!geceDonemiUygunMu('', '06:00'))
  })

  test('yasaya aykırı ya da boş gece dönemi uyarı verir ve 20:00-06:00 ile hesaplanır', () => {
    const h = [hafta(gun('17:00', '03:00'))]
    for (const ayar of [{ geceBaslangic: '22:00' }, { geceBaslangic: '' }, { geceBitis: '' }]) {
      const s = donemiHesapla(h, ayar)
      assert.ok(uyariVar(s, 'md. 69'), JSON.stringify(ayar))
      assert.deepEqual(kodlar(s.ihlaller), ['GECE_7_5'])
      assert.equal(s.ayarlar.geceBaslangic, '20:00')
    }
    assert.deepEqual(donemiHesapla(h).uyarilar, [])
  })

  test('45 saatin altındaki sözleşmede 225 böleni uyarı verir; bölen ayarlanabilir', () => {
    const h = [hafta(...tekrar(5, gun('09:00', '15:30', 30)))] // 30 saat
    const varsayilan = donemiHesapla(h, { aylikBrut: 15000, sozlesmeHaftalikSaat: 20 })
    assert.equal(varsayilan.ucret.saatUcreti, 66.67)
    assert.ok(uyariVar(varsayilan, '5 × 20 = 100'))
    const s = donemiHesapla(h, { aylikBrut: 15000, sozlesmeHaftalikSaat: 20, saatBoleni: 100 })
    assert.equal(s.ucret.saatUcreti, 150)
    assert.equal(s.ucret.fazlaSurelerle, 1875) // 10 sa x 150 x 1,25
    assert.ok(!uyariVar(s, '225'))
  })

  test('geçersiz sayılar varsayılana döner', () => {
    const { ayarlar, uyarilar } = ayarlariDuzelt({ aylikBrut: 'abc', oncekiFazlaCalismaSaat: Infinity, saatBoleni: 0 })
    assert.equal(ayarlar.aylikBrut, 0)
    assert.equal(ayarlar.oncekiFazlaCalismaSaat, 0)
    assert.equal(ayarlar.saatBoleni, 225)
    assert.ok(uyarilar.some((x) => x.includes('böleni')))
  })

  test('pazartesi olmayan dönem başlangıcı o haftanın pazartesisine çekilir', () => {
    const { ayarlar, uyarilar } = ayarlariDuzelt({ donemBaslangic: '2026-11-12' })
    assert.equal(tarihMetni(ayarlar.pazartesi), '09.11.2026')
    assert.ok(uyarilar.some((x) => x.includes('09.11.2026')))
    assert.ok(ayarlariDuzelt({ donemBaslangic: '2026-13-01' }).uyarilar.some((x) => x.includes('geçersiz')))
  })
})

describe('haftalık ve dönemsel hesap', () => {
  test('45 saati aşan süre fazla çalışmadır (md. 41)', () => {
    assert.equal(haftayiHesapla(hafta(...BES_GUN)).fcDk, 0)
    const alti = haftayiHesapla(hafta(...BES_GUN, gun('09:00', '18:00')))
    assert.equal(alti.netDk, 48 * 60)
    assert.equal(alti.fcDk, 3 * 60)
  })

  test('sözleşme 40 saatse 40-45 arası fazla sürelerle çalışmadır', () => {
    const ayar = { sozlesmeHaftalikSaat: 40 }
    const kirkSekiz = haftayiHesapla(hafta(...BES_GUN, gun('09:00', '18:00')), ayar)
    assert.equal(kirkSekiz.fscDk, 5 * 60)
    assert.equal(kirkSekiz.fcDk, 3 * 60)
  })

  test('günlük 11 saat ve gece 7,5 saat aşımı fazla çalışmadır; büyük olan alınır (Yargıtay uygulaması)', () => {
    const on2 = gun('07:00', '20:00') // net 12 saat
    const s05 = donemiHesapla([hafta(on2, ...tekrar(4, gun('09:00', '18:00')))], { aylikBrut: 22500 })
    assert.deepEqual([s05.fcDk, s05.ucret.fazlaCalisma], [60, 150]) // haftalık 44 saat: eskiden 0
    const s24 = donemiHesapla([hafta(...tekrar(4, on2))], { aylikBrut: 30000 })
    assert.deepEqual([s24.fcDk, s24.ucret.fazlaCalisma], [240, 800]) // max(48-45, 4 x 1) = 4 saat
    const s24b = donemiHesapla([hafta(...tekrar(3, on2))], { aylikBrut: 30000 })
    assert.deepEqual([s24b.fcDk, s24b.ucret.fazlaCalisma], [180, 600])
    const gece = donemiHesapla([hafta(...tekrar(5, gun('22:00', '07:00')))])
    assert.equal(gece.fcDk, 150) // 5 x (8 - 7,5) saat
    assert.ok(notVar(gece, 'Yargıtay uygulaması'))
    const kapali = donemiHesapla([hafta(...tekrar(4, on2))], { aylikBrut: 30000, gunlukAsimFazlaCalisma: false })
    assert.equal(kapali.fcDk, 180)
    assert.ok(notVar(kapali, 'yalnız ihlal olarak gösterildi'))
  })

  test('günlük aşımı ödenen saat fazla sürelerle çalışmada ikinci kez sayılmaz', () => {
    const s = donemiHesapla([hafta(...tekrar(3, gun('07:00', '20:00')))], { sozlesmeHaftalikSaat: 30 })
    assert.deepEqual([s.fcDk, s.fscDk], [180, 180]) // 36 saat: 3 fazla çalışma + 3 fazla sürelerle (30-33)
  })

  test('yedi gün çalışmak hafta tatili ihlalidir (md. 46) ve alacak kalemi olmadığı not edilir', () => {
    const yedi = haftayiHesapla(hafta(...tekrar(7, gun('09:00', '17:00'))))
    assert.deepEqual(kodlar(yedi.ihlaller), ['HAFTA_TATILI'])
    assert.equal(haftayiHesapla(hafta(...BES_GUN, gun('09:00', '18:00'))).enUzunDinlenmeDk, 30 * 60)
    const s = donemiHesapla([hafta(...tekrar(7, gun('09:00', '15:30', 30)))], { aylikBrut: 30000 })
    assert.equal(s.ucret.toplam, 0)
    assert.ok(notVar(s, 'Hafta tatilinde çalışılan gün için ayrıca ücret istenebilir'))
  })

  test('pazar gecesi vardiyası sonraki haftanın pazartesisine taşar; taşan saatler dinlenme sayılmaz (md. 46)', () => {
    const h1 = hafta(gun('08:00', '17:00'), gun('08:00', '17:00'), IZIN, IZIN, IZIN, IZIN, gun('20:00', '08:00'))
    const h2 = hafta(IZIN, ...tekrar(6, gun('07:00', '16:00')))
    const s = donemiHesapla([h1, h2])
    assert.equal(s.haftalar[1].enUzunDinlenmeDk, 23 * 60) // pazartesi 08:00 - salı 07:00; eskiden 31 saat
    assert.ok(s.ihlaller.some((x) => x.kod === 'HAFTA_TATILI' && x.hafta === 2))
  })

  test('1. haftadan önce başlayan vardiyanın bitişi girilebilir', () => {
    const h = [hafta(IZIN, ...tekrar(6, gun('07:00', '16:00')))]
    assert.ok(!kodlar(donemiHesapla(h).ihlaller).includes('HAFTA_TATILI')) // pazartesi 00:00'dan 31 saat
    const s = donemiHesapla(h, { devirBitis: '08:00' })
    assert.equal(s.haftalar[0].enUzunDinlenmeDk, 23 * 60)
    assert.ok(kodlar(s.ihlaller).includes('HAFTA_TATILI'))
  })

  test('çakışan vardiyalar iki kez sayılmaz; giriş hatası olarak bildirilir', () => {
    const s = donemiHesapla([hafta(gun('20:00', '08:00'), gun('07:00', '16:00'))])
    assert.equal(s.netDk, 660) // yalnız pazartesi; eskiden 1140
    assert.equal(s.hataSayisi, 1)
    assert.match(s.haftalar[0].gunler[1].hatalar[0], /1 sa çakışıyor/)
    assert.ok(uyariVar(s, '1. hafta Salı'))
  })

  test('denkleştirmede ortalama 45 saati aşmazsa fazla çalışma yoktur (md. 63)', () => {
    const elli = hafta(...tekrar(5, gun('08:00', '19:00')))
    const kirk = hafta(...tekrar(5, gun('09:00', '17:00')))
    assert.equal(donemiHesapla([elli, kirk]).fcDk, 5 * 60)
    assert.equal(donemiHesapla([elli, kirk], { denklestirme: true }).fcDk, 0)
  })

  test('denkleştirmede de günlük 11 saati aşan süre fazla çalışmadır', () => {
    const uzun = hafta(gun('08:00', '20:30'), ...tekrar(4, gun('08:00', '20:00'))) // 55,5 saat
    const kisa = hafta(...tekrar(5, gun('09:00', '16:54'))) // 34,5 saat
    const s = donemiHesapla([uzun, kisa], { denklestirme: true })
    assert.equal(s.netDk, 90 * 60)
    assert.equal(s.fcDk, 30)
  })

  test('denkleştirme dönemi 2 ayı (8 haftayı) ve 4 ayı (17 haftayı) aşınca uyarır', () => {
    const w = hafta(...BES_GUN)
    const ayar = { denklestirme: true }
    assert.ok(!uyariVar(donemiHesapla(tekrar(8, w), ayar), 'aydan uzun'))
    assert.ok(uyariVar(donemiHesapla(tekrar(9, w), ayar), '2 aydan uzun')) // 63 gün > 62
    assert.ok(uyariVar(donemiHesapla(tekrar(18, w), ayar), '4 aydan uzun'))
  })

  test('ücret: saat ücreti brüt/225, %50, %25 ve UBGT için bir günlük ücret', () => {
    const ubgtli = hafta(...BES_GUN.slice(0, 4), gun('09:00', '18:00', 60, { ubgt: 1 }), gun('09:00', '18:00'))
    const s = donemiHesapla([ubgtli], { aylikBrut: 22500, sozlesmeHaftalikSaat: 40 })
    assert.deepEqual(s.ucret, { saatUcreti: 100, fazlaCalisma: 450, fazlaSurelerle: 625, ubgt: 750, toplam: 1825 })
    assert.equal(s.serbestZamanDk, 3 * 90 + 5 * 75)
    assert.ok(notVar(s, 'serbest zamana çevrilmez'))
    assert.ok(notVar(s, 'md. 44'))
  })

  test('UBGT: yarım günde 13:00 sonrası çalışma yarım gün sayılır; eski kayıttaki true tam gündür', () => {
    const yarim = donemiHesapla([hafta(gun('08:00', '17:00', 60, { ubgt: 0.5 }))], { aylikBrut: 30000 })
    assert.equal(yarim.ucret.ubgt, 500)
    const sabah = donemiHesapla([hafta(gun('08:00', '13:00', 30, { ubgt: 0.5 }))], { aylikBrut: 30000 })
    assert.equal(sabah.ucret.ubgt, 0)
    assert.ok(notVar(sabah, "13:00'ten önce bittiği için"))
    assert.equal(haftayiDuzelt(hafta(gun('09:00', '18:00', 60, { ubgt: true }))).gunler[0].ubgt, 1)
  })

  test('yıllık 270 saat sınırı (md. 41); aşan saatler de ücrete girer', () => {
    const s = donemiHesapla([ornek996Haftasi()], { oncekiFazlaCalismaSaat: 260 })
    assert.ok(kodlar(s.ihlaller).includes('YILLIK_270'))
    assert.ok(notVar(s, '270 saati aşan fazla çalışma da hesaba katıldı'))
    assert.equal(s.fcDk, 21 * 60)
  })

  test('996 haftası: 66 saat net, 21 saat fazla çalışma, sınır 13. haftada aşılır', () => {
    const s = donemiHesapla([ornek996Haftasi()], { aylikBrut: 45000 })
    assert.equal(s.netDk, 66 * 60)
    assert.equal(s.fcDk, 21 * 60)
    assert.deepEqual(s.ihlaller, [])
    assert.equal(s.ucret.fazlaCalisma, 6300)
    assert.ok(notVar(s, '13. haftada'))
  })

  test('270 saat notu takvimde olmayan hafta yazmaz', () => {
    const elli = [hafta(...tekrar(5, gun('08:00', '19:00')))] // haftada 5 saat: 52 haftada 260 < 270
    const s = donemiHesapla(elli)
    assert.ok(notVar(s, 'aşılmaz'))
    assert.ok(!s.notlar.some((n) => /\d+\. haftada aşılır/.test(n))) // eskiden "55. haftada aşılır"
    const on = [hafta(...tekrar(5, gun('08:00', '20:00')))] // haftada 10 saat
    assert.ok(notVar(donemiHesapla(on, { oncekiFazlaCalismaSaat: 200 }), 'yıl sonuna kalan hafta'))
  })

  test('dönem başlangıç tarihiyle 270 saat notu yıl sonunu hesaba katar', () => {
    const on = [hafta(...tekrar(5, gun('08:00', '20:00')))]
    const ocak = donemiHesapla(on, { oncekiFazlaCalismaSaat: 200, donemBaslangic: '2026-01-05' })
    assert.ok(notVar(ocak, '8. haftasında (23.02.2026 ile başlayan hafta) aşılır'))
    const aralik = donemiHesapla(on, { oncekiFazlaCalismaSaat: 200, donemBaslangic: '2026-12-07' })
    assert.ok(notVar(aralik, 'bu takvim yılında aşılmaz'))
    assert.ok(notVar(aralik, '235,7 saat'))
    const tasan = donemiHesapla(tekrar(5, on[0]), { donemBaslangic: '2026-12-07' })
    assert.ok(uyariVar(tasan, 'yıl sonunu aşıyor'))
  })

  test('45 saati aşan sözleşme süresi uyarı verir ve 45 alınır', () => {
    const s = donemiHesapla([hafta(...BES_GUN)], { sozlesmeHaftalikSaat: 50 })
    assert.equal(s.ayarlar.sozlesmeHaftalikSaat, 45)
    assert.deepEqual(kodlar(s.ihlaller), ['SOZLESME_45'])
  })
})

describe('CSV', () => {
  test('hücre kaçışı ve formül enjeksiyonu önlemi', () => {
    assert.equal(csvHucresi('düz'), 'düz')
    assert.equal(csvHucresi('a;b'), '"a;b"')
    assert.equal(csvHucresi('"tırnak"'), '"""tırnak"""')
    assert.equal(csvHucresi('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"')
  })

  test('satırlar, ondalık virgül, düşülen mola ve özet', () => {
    const haftalar = [hafta(...BES_GUN, gun('09:00', '18:00', 30))]
    const csv = csvOlustur(haftalar, donemiHesapla(haftalar, { aylikBrut: 22500 }))
    const satirlar = csv.trimEnd().split('\r\n')
    assert.equal(
      satirlar[0],
      'Hafta;Gün;Tarih;Çalıştı;Başlangıç;Bitiş;Girilen mola (dk);Düşülen mola (dk);Net (saat);Gece (saat);' +
        'Günlük aşım (saat);UBGT;İhlaller ve hatalar',
    )
    assert.equal(satirlar[1], '1;Pazartesi;;Evet;09:00;18:00;60;60;8,00;0,00;0,00;Hayır;')
    assert.match(satirlar[6], /^1;Cumartesi;;Evet;09:00;18:00;30;30;8,50;0,00;0,00;Hayır;"md\. 68: /)
    assert.ok(satirlar.includes('Fazla çalışma (saat, %50);3,50'))
    assert.ok(satirlar.some((x) => x.startsWith('Bu iki ücret yerine işçi isterse serbest zaman')))
    assert.ok(satirlar.at(-1).startsWith('"Hukuki tavsiye değildir;')) // ';' içerdiği için tırnaklı
  })

  test('"en az yasal" yönteminde girilen ve düşülen mola ayrı sütunlardadır; tarih yazılır', () => {
    const haftalar = [hafta(gun('08:00', '17:00', 0), gun('07:00', '16:00'))]
    const ayar = { molaYontemi: 'en-az-yasal', donemBaslangic: '2026-11-09' }
    const satirlar = csvOlustur(haftalar, donemiHesapla(haftalar, ayar)).split('\r\n')
    assert.match(satirlar[1], /^1;Pazartesi;09\.11\.2026;Evet;08:00;17:00;0;60;8,00;0,00;0,00;Hayır;"md\. 68: /)
    assert.match(satirlar[2], /^1;Salı;10\.11\.2026;Evet;07:00;16:00;60;60;8,00;/)
  })

  test('giriş hataları gün satırına ve uyarı satırına yazılır', () => {
    const haftalar = [hafta(gun('08:00', '17:00'))]
    const satirlar = csvOlustur(haftalar, donemiHesapla(haftalar, { devirBitis: '09:00' })).split('\r\n')
    assert.match(satirlar[1], /^1;Pazartesi;;Evet;08:00;17:00;60;;0,00;0,00;0,00;Hayır;"Giriş hatası: önceki /)
    assert.ok(satirlar.some((x) => x.startsWith('Uyarı;"1. hafta Pazartesi: önceki vardiyayla 1 sa çakışıyor')))
  })
})
