import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { baslangicKodu } from '../asama1_ayristirici.js'
import { cozumleriDogrula, runTests } from '../asama2_calistirici.js'
import { ilerlemeHesapla, mufredatiYukle, sertifikaDurumu, sertifikaTalepEt, tamamla } from '../asama3_mufredat.js'

const KOK = fileURLToPath(new URL('../ornek-mufredat', import.meta.url))
const mufredat = mufredatiYukle(KOK)
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-fcc-'))
after(() => fs.rmSync(gecici, { recursive: true, force: true }))

test('müfredat yüklenir: 1 süper blok, 3 blok, 4 meydan okuma, 1 sertifika', () => {
  assert.equal(mufredat.superBloklar.length, 1)
  assert.deepEqual(
    mufredat.superBloklar[0].blocks.map((b) => [b.dashedName, b.challenges.length]),
    [
      ['degiskenler', 2],
      ['lab-kdv-hesaplayici', 1],
      ['lab-palindrom-denetleyici', 1],
    ],
  )
  assert.equal(mufredat.meydanOkumalar.size, 4)
  assert.equal(mufredat.sertifikalar[0].certification, 'temel-javascript')
})

test('bakımcı testi: her meydan okumanın her çözümü kendi testlerinden geçer, başlangıç kodu geçmez', async () => {
  for (const m of mufredat.meydanOkumalar.values()) {
    for (const r of await cozumleriDogrula(m)) {
      assert.equal(r.hepsiGecti, true, `${m.title}: ${JSON.stringify(r.sonuclar.filter((s) => !s.gecti))}`)
    }
    const tohum = await runTests({ challenge: m, code: baslangicKodu(m) })
    assert.equal(tohum.hepsiGecti, false, `${m.title}: başlangıç kodu testleri geçmemeli`)
  }
})

test('ilerleme yüzdeleri', () => {
  const sonuc = ilerlemeHesapla(mufredat, ['6a7b8c9d0e1f2a3b4c5d6e01', '6a7b8c9d0e1f2a3b4c5d6e03'])
  assert.equal(sonuc[0].yuzde, 50)
  assert.deepEqual(
    sonuc[0].bloklar.map((b) => b.yuzde),
    [50, 100, 0],
  )
})

test('sertifika: eksik proje varken talep reddedilir, tamamlanınca verilir, ikinci kez verilmez', () => {
  const sertifika = mufredat.sertifikalar[0]
  let kullanici = { kullaniciAdi: 'deniz', completedChallenges: [], sertifikalar: {} }
  kullanici = tamamla(kullanici, '6a7b8c9d0e1f2a3b4c5d6e03', 1)
  kullanici = tamamla(kullanici, '6a7b8c9d0e1f2a3b4c5d6e03', 2)
  assert.equal(kullanici.completedChallenges.length, 1, 'aynı meydan okuma iki kez sayılmaz')

  const red = sertifikaTalepEt(kullanici, sertifika, 3)
  assert.deepEqual(red, {
    basarili: false,
    sebep: 'Eksik projeler var',
    eksikler: ['Türkçe Palindrom Denetleyici Yap'],
  })

  const onceki = kullanici
  kullanici = tamamla(kullanici, '6a7b8c9d0e1f2a3b4c5d6e04', 4)
  assert.equal(onceki.completedChallenges.length, 1, 'saf fonksiyon: eski nesne değişmedi')
  assert.equal(
    sertifikaDurumu(
      sertifika,
      kullanici.completedChallenges.map((c) => c.id),
    ).uygun,
    true,
  )

  const kabul = sertifikaTalepEt(kullanici, sertifika, 5)
  assert.equal(kabul.basarili, true)
  if (!kabul.basarili) return
  assert.deepEqual(kabul.kullanici.sertifikalar, { 'temel-javascript': { tarih: 5 } })
  assert.deepEqual(sertifikaTalepEt(kabul.kullanici, sertifika, 6), {
    basarili: false,
    sebep: 'Bu sertifika zaten alınmış',
  })
})

test('tutarsız müfredat yakalanır: eksik dosya, sahipsiz dosya, başlık uyuşmazlığı', () => {
  const kopya = path.join(gecici, 'bozuk')
  fs.cpSync(KOK, kopya, { recursive: true })
  const blok = path.join(kopya, 'structure', 'blocks', 'degiskenler.json')
  const json = JSON.parse(fs.readFileSync(blok, 'utf8'))
  json.challengeOrder[0].title = 'Yanlış Başlık'
  json.challengeOrder.push({ id: 'ffffffffffffffffffffffff', title: 'Hayalet' })
  fs.writeFileSync(blok, JSON.stringify(json))
  fs.writeFileSync(path.join(kopya, 'challenges', 'blocks', 'degiskenler', 'sahipsiz.md'), '---\nid: s\n---\n')
  assert.throws(
    () => mufredatiYukle(kopya),
    (e) =>
      /başlık blok sırasındakiyle uyuşmuyor/.test(e.message) &&
      /ffffffffffffffffffffffff için dosya yok/.test(e.message) &&
      /sahipsiz\.md: challengeOrder'da yok/.test(e.message),
  )
})
