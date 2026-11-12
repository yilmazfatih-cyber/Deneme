import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  dizinTablosu,
  dogrula,
  katkidaBulunanlar,
  rfc822,
  rssOlustur,
  sayiyiOlustur,
  tiklamaBaglantisi,
  turkceTarih,
  xmlKacis,
} from '../aylik.js'
import { calistir } from '../cli.js'

const VERI = fileURLToPath(new URL('../veri/', import.meta.url))
const oku = (ad) => JSON.parse(readFileSync(join(VERI, ad), 'utf8'))
const sayi1 = oku('sayi-001.json')
const sayi2 = oku('sayi-002.json')

/** @param {Partial<import('../aylik.js').Proje>} ek */
const proje = (ek = {}) => ({
  url: 'https://github.com/ornek/depo',
  kategori: 'Go',
  baslik: 'Kısa başlık',
  aciklama: 'Otuz iki karakterden uzun, kurallara uyan bir açıklama.',
  ...ek,
})

describe('dogrula', () => {
  it('örnek sayılar temiz', () => {
    assert.deepEqual(dogrula(sayi1), [])
    assert.deepEqual(dogrula(sayi2), [])
  })

  it('başvuru formu sınırlarını uygular', () => {
    const hatalar = dogrula({
      sayi: 3,
      tarih: '2026-11-28',
      projeler: [
        proje({ url: 'https://gitlab.com/a/b' }),
        proje({ url: 'https://github.com/a/c', kategori: 'Fortran' }),
        proje({ url: 'https://github.com/a/d', baslik: 'x'.repeat(51) }),
        proje({ url: 'https://github.com/a/e', aciklama: 'Çok kısa.' }),
      ],
    })
    assert.equal(hatalar.length, 4)
    assert.match(hatalar[0], /yalnızca https:\/\/github\.com/)
    assert.match(hatalar[1], /bilinmeyen kategori 'Fortran'/)
    assert.match(hatalar[2], /başlık 1-50/)
    assert.match(hatalar[3], /açıklama 32-256/)
  })

  it('aynı proje ne aynı sayıda ne de sonraki sayıda tekrar edebilir', () => {
    const tekrar = {
      sayi: 3,
      tarih: '2026-11-28',
      projeler: [proje(), proje({ url: 'https://github.com/ORNEK/depo' })],
    }
    assert.match(dogrula(tekrar).join(), /bu sayıda iki kez var/)
    const onceki = new Map([['https://github.com/microsoft/markitdown', 1]])
    const yeni = { sayi: 3, tarih: '2026-11-28', projeler: [proje({ url: 'https://github.com/microsoft/markitdown' })] }
    assert.match(dogrula(yeni, onceki).join(), /daha önce Sayı 001'de yer aldı/)
  })

  it('bozuk üst alanlar', () => {
    assert.deepEqual(dogrula({ sayi: 0, tarih: '28.10.2026', projeler: [] }), [
      'sayi pozitif tam sayı olmalı',
      'tarih YYYY-AA-GG olmalı',
      'en az bir proje gerekli',
    ])
  })
})

describe('sayiyiOlustur', () => {
  const metin = sayiyiOlustur(sayi1)

  it('kategoriler sabit sırada, numaralar kesintisiz', () => {
    const basliklar = metin.split('\n').filter((s) => s.startsWith('### '))
    assert.deepEqual(basliklar, ['### Go', '### Python', '### Diğer', '### Kitap'])
    const numaralar = metin.match(/^\d+\. /gm).map((n) => Number.parseInt(n, 10))
    assert.deepEqual(numaralar, [1, 2, 3, 4, 5])
  })

  it('kategori içinde öneri sırası korunur ve öneren anılır', () => {
    assert.ok(metin.indexOf('[markitdown]') < metin.indexOf('[yt-dlp]'))
    assert.match(metin, /Öneren: \[@ornek-ayse\]\(https:\/\/github\.com\/ornek-ayse\)/)
  })

  it('Türkçe tarih ve başlık', () => {
    assert.match(metin, /^# Açık Kaynak Aylık — Sayı 001$/m)
    assert.match(metin, /Yayın tarihi: 28 Eylül 2026/)
    assert.equal(turkceTarih('2026-02-01'), '1 Şubat 2026')
  })

  it('tıklama sayacı hedefi kodlar', () => {
    const izli = sayiyiOlustur(sayi1, { izlemeOneki: 'https://bulten.example/tikla' })
    assert.ok(izli.includes('https://bulten.example/tikla?hedef=https%3A%2F%2Fgithub.com%2Follama%2Follama'))
    assert.equal(tiklamaBaglantisi('https://github.com/a/b', undefined), 'https://github.com/a/b')
  })

  it('sponsor ve lisans satırları', () => {
    const s = sayiyiOlustur(sayi1, {
      sponsorlar: [{ ad: 'Örnek A.Ş.', url: 'https://ornek.example' }],
      lisans: 'CC BY-NC-ND 4.0',
    })
    assert.match(s, /## Sponsorlar\n\n- \[Örnek A\.Ş\.\]\(https:\/\/ornek\.example\)/)
    assert.match(s, /CC BY-NC-ND 4\.0 lisansıyla/)
  })
})

describe('rssOlustur', () => {
  const rss = rssOlustur([sayi1, sayi2], { site: 'https://bulten.example/', ad: 'Ar & Ge <Aylık>' })

  it('en yeni sayı önce, tarih RFC 822', () => {
    assert.ok(rss.indexOf('Sayı 002') < rss.indexOf('Sayı 001'))
    assert.match(rss, /<pubDate>Wed, 28 Oct 2026 09:00:00 GMT<\/pubDate>/)
    assert.match(rss, /<lastBuildDate>Wed, 28 Oct 2026 09:00:00 GMT<\/lastBuildDate>/)
    assert.equal(rfc822('2026-09-28'), 'Mon, 28 Sep 2026 09:00:00 GMT')
  })

  it('XML özel karakterleri kaçışlanır, yapı dengeli', () => {
    assert.match(rss, /<title>Ar &amp; Ge &lt;Aylık&gt;<\/title>/)
    assert.equal(xmlKacis(`"a" & 'b'`), '&quot;a&quot; &amp; &apos;b&apos;')
    assert.equal((rss.match(/<item>/g) ?? []).length, 2)
    assert.equal((rss.match(/<\/item>/g) ?? []).length, 2)
    assert.ok(rss.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">'))
  })

  it('aynı veri aynı akışı üretir (zaman damgası yok)', () => {
    assert.equal(rss, rssOlustur([sayi2, sayi1], { site: 'https://bulten.example', ad: 'Ar & Ge <Aylık>' }))
  })
})

describe('dizinTablosu ve katkidaBulunanlar', () => {
  it('satır başına 5 sayı, en yeni önce', () => {
    const sayilar = Array.from({ length: 7 }, (_, i) => ({ sayi: i + 1, tarih: '2026-01-28', projeler: [] }))
    const satirlar = dizinTablosu(sayilar).trim().split('\n')
    assert.equal(satirlar.length, 4) // başlık + ayırıcı + 2 satır
    assert.ok(satirlar[2].startsWith('| [Sayı 007](icerik/sayi-007.md) |'))
    assert.equal(satirlar[3], '| [Sayı 002](icerik/sayi-002.md) | [Sayı 001](icerik/sayi-001.md) |')
  })

  it('öneri sayısına göre sıralar', () => {
    assert.deepEqual(katkidaBulunanlar([sayi1, sayi2]), [
      { kisi: 'ornek-ayse', adet: 3 },
      { kisi: 'ornek-mehmet', adet: 1 },
      { kisi: 'ornek-zeynep', adet: 1 },
    ])
  })
})

describe('cli', () => {
  it('örnek veriden dosyaları üretir', () => {
    const cikti = mkdtempSync(join(tmpdir(), 'bulten-'))
    try {
      const kod = calistir([VERI, cikti, '--site', 'https://bulten.example'], () => {})
      assert.equal(kod, 0)
      assert.deepEqual(readdirSync(join(cikti, 'icerik')).sort(), ['sayi-001.md', 'sayi-002.md'])
      assert.match(
        readFileSync(join(cikti, 'README.md'), 'utf8'),
        /\[@ornek-ayse\]\(https:\/\/github\.com\/ornek-ayse\) \(3\)/,
      )
      assert.match(readFileSync(join(cikti, 'rss.xml'), 'utf8'), /<rss version="2.0">/)
    } finally {
      rmSync(cikti, { recursive: true, force: true })
    }
  })

  it('önceki sayıda yer alan proje tekrar gelirse hiçbir şey yazmaz', () => {
    const kok = mkdtempSync(join(tmpdir(), 'bulten-'))
    try {
      const veri = join(kok, 'veri')
      cpSync(VERI, veri, { recursive: true })
      const tekrar = { sayi: 3, tarih: '2026-11-28', projeler: [sayi1.projeler[0]] }
      writeFileSync(join(veri, 'sayi-003.json'), JSON.stringify(tekrar))
      const hatalar = []
      const kod = calistir(
        [veri, join(kok, 'cikti')],
        () => {},
        (h) => hatalar.push(h),
      )
      assert.equal(kod, 1)
      assert.match(hatalar.join('\n'), /Sayı 003: .*daha önce Sayı 001'de yer aldı/)
      assert.deepEqual(readdirSync(kok), ['veri'])
    } finally {
      rmSync(kok, { recursive: true, force: true })
    }
  })
})
