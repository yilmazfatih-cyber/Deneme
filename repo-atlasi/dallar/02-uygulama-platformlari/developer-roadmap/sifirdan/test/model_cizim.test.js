import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dogrula, icerikFarki, konuDosyaAdi, konuDugumleri, slugify, slugifyTr } from '../asama1_model.js'
import { kacis, otomatikYerlesim, svgCiz } from '../asama2_cizim.js'
import { olustur } from '../olustur.js'

const ORNEK = fileURLToPath(new URL('../ornek', import.meta.url))
const belge = JSON.parse(fs.readFileSync(path.join(ORNEK, 'kabuk.json'), 'utf8'))
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-roadmap-'))
after(() => fs.rmSync(gecici, { recursive: true, force: true }))

test('slugify: gerçek kuralın davranışı Türkçe harfleri düşürür; slugifyTr düzeltir', () => {
  assert.equal(slugify('Metin Araçları'), 'metin-aralar')
  assert.equal(slugify('Süreçler ve İşler'), 'sreler-ve-iler')
  assert.equal(slugify('  React  Native '), 'react--native', 'her boşluk ayrı tire olur')
  assert.equal(slugifyTr('Metin Araçları'), 'metin-araclari')
  assert.equal(slugifyTr('Süreçler ve İşler'), 'surecler-ve-isler')
  assert.equal(slugifyTr('IŞIK ılık'), 'isik-ilik')
  assert.equal(slugifyTr('  React  Native '), 'react-native')
})

test('örnek yol haritası geçerli; 11 konu düğümü; dosya adları slug@id.md', () => {
  assert.deepEqual(dogrula(belge), [])
  const konular = konuDugumleri(belge)
  assert.equal(konular.length, 11, 'title ve paragraph düğümleri konu sayılmaz')
  assert.equal(konuDosyaAdi(konular[0]), 'kabuk-nedir@K1kabukNedir000000001.md')
  assert.deepEqual(icerikFarki(belge, fs.readdirSync(path.join(ORNEK, 'content'))), [])
})

test('doğrulama hataları', () => {
  const bozuk = {
    slug: 'Kabuk Yolu',
    title: '',
    nodes: [
      { id: 'a', type: 'topic', data: {} },
      { id: 'a', type: 'topic', data: { label: 'x' } },
      { id: 'b c', type: 'topic', data: { label: 'y' } },
      { id: 'd', type: 'topic', position: { x: 'sol', y: 0 }, data: { label: '🙂' } },
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'yok' },
      { id: 'e1', source: 'd', target: 'd' },
    ],
  }
  const h = dogrula(bozuk).join('\n')
  for (const beklenen of [
    'slug küçük harf',
    'title zorunlu',
    'a: konu düğümünün etiketi',
    'düğüm kimliği iki kez',
    'geçersiz düğüm kimliği: "b c"',
    'd: konum sayısal olmalı',
    'e1: hedef düğüm yok',
    'kenar kimliği iki kez',
    'düğüm kendine bağlanamaz',
    'd: etiketten slug üretilemedi',
  ]) {
    assert.ok(h.includes(beklenen), `"${beklenen}" bekleniyordu:\n${h}`)
  }
})

test('içerik farkı: etiketi değişen konu yeniden adlandırılır, silinen düğümün dosyası silinir, eksikler raporlanır', () => {
  const yeni = structuredClone(belge)
  yeni.nodes.find((n) => n.id === 'K5betikYazma000000001').data.label = 'Kabuk Betikleri'
  yeni.nodes = yeni.nodes.filter((n) => n.id !== 'S3grep000000000000001')
  yeni.nodes.push({ id: 'K8yeniKonu0000000001', type: 'topic', data: { label: 'SSH' } })
  const dosyalar = [...fs.readdirSync(path.join(ORNEK, 'content')), 'notlar.txt']
  const islemler = icerikFarki(yeni, dosyalar)
  assert.deepEqual(
    islemler.map((i) => [i.tur, i.dosya, i.yeni ?? '']),
    [
      ['yeniden-adlandir', 'betik-yazma@K5betikYazma000000001.md', 'kabuk-betikleri@K5betikYazma000000001.md'],
      ['sil', 'grep@S3grep000000000000001.md', ''],
      ['sil', 'notlar.txt', ''],
      ['eksik', 'ssh@K8yeniKonu0000000001.md', ''],
    ],
  )
  // Eski (ASCII) slug kuralıyla adlandırılmış dosyalar Türkçe kuralla "yeniden adlandırılacak" görünür.
  const eskiAdlar = konuDugumleri(belge).map((d) => konuDosyaAdi(d, slugify))
  const goc = icerikFarki(belge, eskiAdlar).filter((i) => i.tur === 'yeniden-adlandir')
  assert.deepEqual(
    goc.map((i) => i.dosya),
    [
      'balantlar-ln@S2baglantilar00000001.md',
      'boru-ve-ynlendirme@K3boruYonlendirme0001.md',
      'kabuk-zelletirme@K7ozellestirme0000001.md',
      'metin-aralar@K4metinAraclari000001.md',
      'sreler-ve-iler@K6surecler00000000001.md',
    ],
  )
})

test('SVG: düğümler, kesik kenarlar, durum sınıfları; etiketler kaçırılır', () => {
  const svg = svgCiz(belge, { durumlar: { K1kabukNedir000000001: 'done' } })
  assert.equal((svg.match(/<g class="dugum/g) ?? []).length, belge.nodes.length)
  assert.equal((svg.match(/<line class="kenar"/g) ?? []).length, belge.edges.length)
  assert.equal((svg.match(/stroke-dasharray/g) ?? []).length, 4)
  assert.match(svg, /class="dugum tur-topic durum-done" data-dugum="K1kabukNedir000000001"/)
  assert.match(svg, /data-konu="kabuk-nedir@K1kabukNedir000000001.md"/)
  assert.ok(!/data-dugum="P1ipucu00000000000001" data-konu/.test(svg), 'paragraf düğümü tıklanabilir değil')

  const kotu = svgCiz({
    slug: 'x',
    title: 'X',
    nodes: [{ id: 'k', type: 'topic', data: { label: '<script>alert("x")</script>' } }],
    edges: [],
  })
  assert.ok(!kotu.includes('<script>'))
  assert.match(kotu, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/)
  assert.equal(kacis(`a&b'"`), 'a&amp;b&#39;&quot;')
})

test('konumu olmayan düğümler katmanlı yerleşim alır, belge değişmez', () => {
  const ham = {
    slug: 'y',
    title: 'Y',
    nodes: [
      { id: 'a', type: 'topic', data: { label: 'A' } },
      { id: 'b', type: 'topic', data: { label: 'B' } },
      { id: 'c', type: 'topic', data: { label: 'C' } },
    ],
    edges: [
      { id: '1', source: 'a', target: 'b' },
      { id: '2', source: 'a', target: 'c' },
    ],
  }
  const y = otomatikYerlesim(ham)
  assert.deepEqual(
    y.nodes.map((n) => n.position),
    [
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 220, y: 80 },
    ],
  )
  assert.equal(ham.nodes[0].position, undefined, 'saf fonksiyon')
})

test('statik site: geçerli örnek tek HTML dosyası üretir; bozuk içerik derlemeyi durdurur', () => {
  const { hedef, konuSayisi } = olustur(ORNEK, path.join(gecici, 'site'))
  assert.equal(konuSayisi, 11)
  const html = fs.readFileSync(hedef, 'utf8')
  assert.match(html, /<html lang="tr">/)
  assert.match(html, /<section class="konu" id="konu-K7ozellestirme0000001" hidden><h2>Kabuk Özelleştirme<\/h2>/)

  const bozukKlasor = path.join(gecici, 'bozuk')
  fs.cpSync(ORNEK, bozukKlasor, { recursive: true })
  fs.appendFileSync(
    path.join(bozukKlasor, 'content', 'grep@S3grep000000000000001.md'),
    '- [@blog@Kişisel blogum](http://ornek.invalid/grep)\n',
  )
  assert.throws(
    () => olustur(bozukKlasor, path.join(gecici, 'site2')),
    /bilinmeyen kaynak türü @blog@[\s\S]*yalnızca https/,
  )
})
