import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { AyristirmaHatasi, baslangicKodu, onBilgiAyristir, parseChallenge } from '../asama1_ayristirici.js'

const oku = (yol) =>
  fs.readFileSync(fileURLToPath(new URL(`../ornek-mufredat/challenges/blocks/${yol}`, import.meta.url)), 'utf8')

test('ön bilgi: sayı, mantıksal değer ve tırnaklı metin', () => {
  assert.deepEqual(onBilgiAyristir('id: abc\nchallengeType: 26\nisBeta: true\ntitle: "İki: nokta"'), {
    id: 'abc',
    challengeType: 26,
    isBeta: true,
    title: 'İki: nokta',
  })
})

test('gerçek biçimdeki dosya: ön bilgi, bölümler, ipuçları, tohum, çözümler', () => {
  const m = parseChallenge(oku('degiskenler/6a7b8c9d0e1f2a3b4c5d6e01.md'))
  assert.equal(m.id, '6a7b8c9d0e1f2a3b4c5d6e01')
  assert.equal(m.title, 'Değişkene Değer Ata')
  assert.equal(m.challengeType, 1)
  assert.equal(m.dashedName, 'degiskene-deger-ata')
  assert.match(m.description, /atama/)
  assert.match(m.instructions, /`yas` değişkenine/)
  assert.equal(m.hints.length, 2)
  assert.equal(m.hints[1].text, '`yas` değişkeninin değeri `30` olmalı.')
  assert.equal(m.hints[1].testString, 'assert.strictEqual(yas, 30);')
  assert.deepEqual(m.seed, [
    { lang: 'js', contents: 'let yas;\n\n// Bu satırın altına yaz', editableRegionBoundaries: [] },
  ])
  assert.deepEqual(m.solutions, [[{ lang: 'js', contents: 'let yas;\nyas = 30;' }]])
  assert.equal(baslangicKodu(m), 'let yas;\n\n// Bu satırın altına yaz')
})

test('düzenlenebilir bölge işaretleri silinir, sınırları saklanır; "---" çözümleri ayırır; kanca okunur', () => {
  const m = parseChallenge(oku('degiskenler/6a7b8c9d0e1f2a3b4c5d6e02.md'))
  assert.deepEqual(m.seed[0].editableRegionBoundaries, [1, 5])
  assert.ok(!m.seed[0].contents.includes('--fcc-editable-region--'))
  assert.equal(m.solutions.length, 2, 'iki ayrı çözüm')
  assert.match(m.hooks.beforeAll ?? '', /ornekIsimler/)
})

const sablon = (govde) => `---\nid: x1\ntitle: Deneme\nchallengeType: 1\n---\n\n${govde}\n`

test('doğrulama hataları açıklayıcı', () => {
  assert.throws(() => parseChallenge('# --description--\nmetin'), /ön bilgi bloğuyla başlamalı/)
  assert.throws(() => parseChallenge('---\nid: a\n---\n'), /"title" zorunlu/)
  assert.throws(() => parseChallenge(sablon('# --aciklama--\nx')), /Geçersiz bölüm işaretçisi/)
  assert.throws(() => parseChallenge(sablon('## --hints--\nx')), /başlık düzeyi 1 olmalı/)
  assert.throws(() => parseChallenge(sablon('# --hints--\n\nTest kodu unutulmuş.\n')), /İpucunun test kodu yok/)
  assert.throws(
    () => parseChallenge(sablon('# --hints--\n\n```js\nassert(true)\n```\n')),
    /Açıklaması olmayan test kodu/,
  )
  assert.throws(() => parseChallenge(sablon('# --seed--\n\n```js\nx\n```\n')), /seed-contents-- bölümü/)
  assert.throws(
    () => parseChallenge(sablon('# --seed--\n\n## --seed-contents--\n\n```js\n--fcc-editable-region--\nx\n```\n')),
    /kapanmamış/,
  )
  assert.throws(() => parseChallenge(sablon('# --hints--\n\nA\n\n```js\nx\n')), /Kapanmamış kod bloğu/)
  assert.throws(() => parseChallenge(sablon('--fcc-editable-region--')), /yalnızca kod bloğu içinde/)
  assert.throws(() => parseChallenge(sablon('# --hints--\n\n# --hints--\n')), AyristirmaHatasi)
})

test('kod bloğu içindeki "# --x--" satırı başlık sayılmaz', () => {
  const m = parseChallenge(
    sablon('# --hints--\n\nYorum bir başlık değildir.\n\n```py\n# --bu-bir-yorum--\nassert True\n```\n'),
  )
  assert.equal(m.hints[0].testString, '# --bu-bir-yorum--\nassert True')
})
