import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseChallenge } from '../asama1_ayristirici.js'
import { assertOlustur, derinEsit, runTests } from '../asama2_calistirici.js'

const ornek = parseChallenge(`---
id: t1
title: Topla
challengeType: 1
---

# --hints--

\`topla\` bir fonksiyon olmalı.

\`\`\`js
assert.isFunction(topla);
\`\`\`

\`topla(2, 3)\` 5 olmalı.

\`\`\`js
assert.strictEqual(topla(2, 3), 5);
\`\`\`

Kodda \`+\` işleci geçmeli.

\`\`\`js
assert.match(code, /\\+/);
\`\`\`
`)

test('doğru çözüm tüm testleri geçer, konsol çıktısı yakalanır', async () => {
  const r = await runTests({
    challenge: ornek,
    code: 'function topla(a, b) { console.log("topluyorum", a, b); return a + b }',
  })
  assert.equal(r.hepsiGecti, true)
  assert.deepEqual(
    r.sonuclar.map((s) => s.gecti),
    [true, true, true],
  )
  assert.deepEqual(r.konsol, ['topluyorum 2 3'])
})

test('yanlış çözüm: hangi ipucunun neden kaldığı söylenir', async () => {
  const r = await runTests({ challenge: ornek, code: 'const topla = (a, b) => a - b' })
  assert.equal(r.hepsiGecti, false)
  assert.equal(r.sonuclar[0].gecti, true)
  assert.equal(r.sonuclar[1].gecti, false)
  assert.equal(r.sonuclar[1].hata, '-1 === 5 değil')
  assert.equal(r.sonuclar[2].gecti, false)
})

test('sözdizimi hatası tüm testleri aynı mesajla düşürür', async () => {
  const r = await runTests({ challenge: ornek, code: 'function topla(a, b { return a + b }' })
  assert.ok(r.kodHatasi?.startsWith('SyntaxError'))
  assert.ok(r.sonuclar.every((s) => !s.gecti && s.hata === r.kodHatasi))
})

test('sonsuz döngü zaman aşımına uğrar, çalıştırıcı kilitlenmez', async () => {
  const bas = Date.now()
  const r = await runTests({ challenge: ornek, code: 'while (true) {}', zamanAsimiMs: 100 })
  assert.match(r.kodHatasi ?? '', /Zaman aşımı/)
  assert.ok(Date.now() - bas < 3000)
})

test('testte sonsuz döngü ve asılı kalan Promise de zaman aşımına uğrar', async () => {
  const m = parseChallenge(
    '---\nid: t2\ntitle: T\nchallengeType: 1\n---\n\n# --hints--\n\nDöngü\n\n```js\nwhile (true) {}\n```\n\nBekleme\n\n```js\nawait new Promise(() => {});\n```\n',
  )
  const r = await runTests({ challenge: m, code: '', zamanAsimiMs: 100 })
  assert.deepEqual(
    r.sonuclar.map((s) => s.hata),
    [
      'Zaman aşımı: kodun bitmedi (sonsuz döngü olabilir mi?)',
      'Zaman aşımı: kodun bitmedi (sonsuz döngü olabilir mi?)',
    ],
  )
})

test('kancalar doğru sırada çalışır ve öğrenci kodunun değişkenlerini görür', async () => {
  const m = parseChallenge(`---
id: t3
title: Kancalar
challengeType: 1
---

# --hints--

Bir

\`\`\`js
iz.push('test1:' + sayi);
\`\`\`

İki

\`\`\`js
iz.push('test2:' + sayi);
\`\`\`

# --before-all--

\`\`\`js
var iz = ['beforeAll'];
\`\`\`

# --before-each--

\`\`\`js
iz.push('beforeEach');
\`\`\`

# --after-each--

\`\`\`js
iz.push('afterEach');
\`\`\`

# --after-all--

\`\`\`js
console.log(iz.join(','));
\`\`\`
`)
  const r = await runTests({ challenge: m, code: 'let sayi = 7; iz.push("ogrenci")' })
  assert.equal(r.hepsiGecti, true)
  assert.deepEqual(r.konsol, ['beforeAll,ogrenci,beforeEach,test1:7,afterEach,beforeEach,test2:7,afterEach'])
})

test('her çalıştırma temiz bir bağlamda: önceki öğrencinin değişkeni sızmaz', async () => {
  await runTests({ challenge: ornek, code: 'var sizinti = 1; function topla(a, b) { return a + b }' })
  const m = parseChallenge(
    '---\nid: t4\ntitle: T\nchallengeType: 1\n---\n\n# --hints--\n\nSızıntı olmamalı.\n\n```js\nassert.strictEqual(typeof sizinti, "undefined");\n```\n',
  )
  const r = await runTests({ challenge: m, code: '' })
  assert.equal(r.hepsiGecti, true)
})

test('assert: başka bağlamdan (realm) gelen dizilerle derin eşitlik', () => {
  const a = assertOlustur()
  assert.equal(derinEsit([1, { x: [2] }], [1, { x: [2] }]), true)
  assert.equal(derinEsit([1], { 0: 1 }), false)
  assert.throws(() => a.deepEqual([1, 2], [2, 1]), /derinlemesine eşit değil/)
  assert.throws(() => a(false, 'özel mesaj'), /özel mesaj/)
})
