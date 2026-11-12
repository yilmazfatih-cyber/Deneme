import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ParcaTablosu, satirBaslari } from '../asama1_parca_tablosu.js'

test('satır başları doğru hesaplanır', () => {
  assert.deepEqual(satirBaslari('ab\ncd\n'), [0, 3, 6])
  assert.deepEqual(satirBaslari(''), [0])
})

test('ekleme ve silme metni doğru değiştirir, özgün arabelleğe dokunmaz', () => {
  const t = new ParcaTablosu('merhaba dünya')
  t.insert(7, ' güzel')
  assert.equal(t.getValue(), 'merhaba güzel dünya')
  t.delete(0, 8)
  assert.equal(t.getValue(), 'güzel dünya')
  const ist = t.istatistik()
  assert.equal(ist.arabellekSayisi, 2, 'özgün metin + değişiklik arabelleği')
  assert.equal(ist.degisiklikArabellegi, ' güzel'.length, 'silme değişiklik arabelleğini küçültmez')
})

test('arka arkaya yazmak tek parçayı büyütür (her harfe yeni parça açılmaz)', () => {
  const t = new ParcaTablosu('abc')
  for (const [i, h] of [...'xyz'].entries()) t.insert(3 + i, h)
  assert.equal(t.getValue(), 'abcxyz')
  assert.equal(t.istatistik().parcaSayisi, 2)
})

test('satır sorguları: sayı, içerik, ofset ↔ konum', () => {
  const t = new ParcaTablosu('bir\niki\nüç')
  t.insert(4, 'ara\n')
  assert.equal(t.getValue(), 'bir\nara\niki\nüç')
  assert.equal(t.getLineCount(), 4)
  assert.deepEqual(
    [1, 2, 3, 4].map((n) => t.getLineContent(n)),
    ['bir', 'ara', 'iki', 'üç'],
  )
  assert.equal(t.getOffsetAt(3, 2), 9)
  assert.deepEqual(t.getPositionAt(9), { lineNumber: 3, column: 2 })
  assert.deepEqual(t.getPositionAt(t.getLength()), { lineNumber: 4, column: 3 })
})

test('CRLF girişi normalize edilir, istenirse geri verilir', () => {
  const t = new ParcaTablosu('a\r\nb')
  assert.equal(t.eol, '\r\n')
  assert.equal(t.getLineCount(), 2)
  assert.equal(t.getValue(t.eol), 'a\r\nb')
})

test('anlık görüntü sonraki düzenlemelerden etkilenmez', () => {
  const t = new ParcaTablosu('kaydet beni')
  const goruntu = t.createSnapshot()
  t.insert(0, 'HEMEN ')
  t.delete(6, 7)
  assert.equal(goruntu.read(), 'kaydet beni')
  assert.equal(t.getValue(), 'HEMEN beni')
})

/** Tohumlu sözde rastgele sayı üreteci (mulberry32): testler her seferinde aynı diziyi üretir. */
function rastgele(tohum) {
  return () => {
    tohum |= 0
    tohum = (tohum + 0x6d2b79f5) | 0
    let t = Math.imul(tohum ^ (tohum >>> 15), 1 | tohum)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('model tabanlı test: 2000 rastgele işlemde basit string modeliyle aynı sonuç', () => {
  const r = rastgele(42)
  const harfler = ['a', 'b', 'ç', '\n', 'ğ', ' ', '\n\n', 'İ']
  let model = 'başlangıç\nmetni\n'
  const t = new ParcaTablosu(model)
  for (let adim = 0; adim < 2000; adim++) {
    if (r() < 0.6 || model.length === 0) {
      const ofset = Math.floor(r() * (model.length + 1))
      let yazi = ''
      const n = 1 + Math.floor(r() * 4)
      for (let i = 0; i < n; i++) yazi += harfler[Math.floor(r() * harfler.length)]
      t.insert(ofset, yazi)
      model = model.slice(0, ofset) + yazi + model.slice(ofset)
    } else {
      const ofset = Math.floor(r() * model.length)
      const adet = 1 + Math.floor(r() * 5)
      t.delete(ofset, adet)
      model = model.slice(0, ofset) + model.slice(ofset + adet)
    }
    assert.equal(t.getValue(), model, `adım ${adim}`)
    const satirlar = model.split('\n')
    assert.equal(t.getLineCount(), satirlar.length)
    const n = 1 + Math.floor(r() * satirlar.length)
    assert.equal(t.getLineContent(n), satirlar[n - 1], `adım ${adim}, satır ${n}`)
    const o = Math.floor(r() * (model.length + 1))
    const k = t.getPositionAt(o)
    assert.equal(t.getOffsetAt(k.lineNumber, k.column), o, `adım ${adim}, ofset ${o}`)
  }
})
