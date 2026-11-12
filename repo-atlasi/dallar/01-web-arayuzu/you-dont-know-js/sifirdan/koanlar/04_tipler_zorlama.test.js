// Koan 4 — Tipler ve zorlama (coercion)
// Kitap: "Types & Grammar" (2. baskı, taslak) Bölüm 1 "Primitive Values", 2 "Primitive Behaviors", 4 "Coercing Values"
//        "Get Started" Bölüm 2 "Comparisons" → get-started/ch2.md
// Türkçe için ek: büyük/küçük harf ve sıralama yerele (locale) bağlıdır — bu atlasın Köprü uygulaması da bunu yaşar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __ } from './_yardimci.js'

test('[TG 1] typeof: bilinen tuhaflıklar', () => {
  assert.equal(typeof null, __('object')) // tarihsel hata, düzeltilemiyor
  assert.equal(typeof [], __('object'))
  assert.equal(Array.isArray([]), __(true))
  assert.equal(typeof function () {}, __('function'))
  assert.equal(typeof 10n, __('bigint'))
  assert.equal(typeof Symbol('x'), __('symbol'))
})

test('[TG 1] NaN kendine eşit değildir; -0 vardır', () => {
  assert.equal(NaN === NaN, __(false))
  assert.equal(Number.isNaN('abc'), __(false))
  assert.equal(isNaN('abc'), __(true)) // eski isNaN önce sayıya zorlar
  assert.equal(Object.is(NaN, NaN), __(true))
  assert.equal(0 === -0, __(true))
  assert.equal(Object.is(0, -0), __(false))
  assert.equal(1 / -0, __(-Infinity))
})

test('[TG 2] kayan nokta: 0.1 + 0.2, güvenli tamsayı sınırı, BigInt karışmaz', () => {
  assert.equal(0.1 + 0.2 === 0.3, __(false))
  assert.equal(Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON, __(true))
  assert.equal(Number.MAX_SAFE_INTEGER + 2 === Number.MAX_SAFE_INTEGER + 1, __(true))
  assert.throws(() => 1n + 1, __(TypeError))
  assert.equal(2n ** 64n, __(18446744073709551616n))
})

test('[TG 2] ilkel değerler değişmezdir; katı kipte özellik eklemek hata verir', () => {
  const s = 'kedi'
  assert.equal(s.toUpperCase(), __('KEDI')) // yeni dize döner (noktasız I: yerel bilgisi yok)
  assert.equal(s, __('kedi'))
  assert.throws(() => {
    s.renk = 'tekir'
  }, __(TypeError))
})

test('[TG 4] ToBoolean: yanlışsı (falsy) değerlerin tam listesi', () => {
  const yanlislar = [false, 0, -0, 0n, '', null, undefined, NaN]
  assert.equal(
    yanlislar.every((v) => !v),
    __(true),
  )
  const dogrular = ['0', 'false', [], {}, new Boolean(false), ' ']
  assert.equal(
    dogrular.every((v) => !!v),
    __(true),
  )
})

test('[TG 4, GS 2] == zorlar, === zorlamaz', () => {
  assert.equal('' == 0, __(true))
  assert.equal('0' == false, __(true))
  assert.equal(null == undefined, __(true))
  assert.equal(null == 0, __(false)) // null yalnızca undefined'a == eşittir
  assert.equal(null >= 0, __(true)) // ama ilişkisel karşılaştırma sayıya çevirir: 0 >= 0
  assert.equal([] == ![], __(true)) // ![] → false → 0 ; [] → '' → 0
  assert.equal('2' > '10', __(true)) // iki dize: sözlük sırası
  assert.equal('2' > 10, __(false)) // biri sayı: sayıya çevrilir
})

test('[TG 4] ToPrimitive: + işleci, valueOf/toString ve Symbol.toPrimitive', () => {
  assert.equal([] + {}, __('[object Object]'))
  assert.equal([1, 2] + [3], __('1,23'))
  const para = {
    valueOf: () => 42,
    toString: () => '42 TL',
  }
  assert.equal(para + 1, __(43))
  assert.equal(`${para}`, __('42 TL'))
  const ipucu = {
    [Symbol.toPrimitive](hint) {
      return hint
    },
  }
  assert.equal(+ipucu, __(NaN))
  assert.equal(`${ipucu}`, __('string'))
  assert.equal(ipucu + '', __('default'))
  assert.equal(+new Date(0), __(0))
})

test('[TG 2] parseInt ayrıştırır, Number zorlar', () => {
  assert.equal(parseInt('42px', 10), __(42))
  assert.equal(Number('42px'), __(NaN))
  assert.equal(Number(''), __(0))
  assert.equal(Number(' 12 '), __(12))
  assert.equal(parseInt(0.0000005, 10), __(5)) // String(5e-7) === '5e-7'
})

test('[TG 2] dize uzunluğu UTF-16 kod birimidir; Türkçe büyük/küçük harf yerele bağlıdır', () => {
  assert.equal('👍'.length, __(2))
  assert.equal([...'👍'].length, __(1)) // kod noktası
  const aile = '👨\u200d👩\u200d👧'
  const grafemler = [...new Intl.Segmenter('tr', { granularity: 'grapheme' }).segment(aile)]
  assert.equal(grafemler.length, __(1)) // ekranda tek karakter
  assert.equal('istanbul'.toUpperCase(), __('ISTANBUL'))
  assert.equal('istanbul'.toLocaleUpperCase('tr-TR'), __('İSTANBUL'))
  assert.equal('IŞIK'.toLocaleLowerCase('tr-TR'), __('ışık'))
  assert.equal('İ'.toLowerCase().length, __(2)) // i + birleşen nokta (U+0307)
})

test('[TG 2] sıralama: varsayılan sort kod birimine, localeCompare dile göre sıralar', () => {
  const harfler = ['d', 'ç', 'c', 'ö', 'o']
  assert.deepEqual([...harfler].sort(), __(['c', 'd', 'o', 'ç', 'ö']))
  assert.deepEqual(
    [...harfler].sort((a, b) => a.localeCompare(b, 'tr')),
    __(['c', 'ç', 'd', 'o', 'ö']),
  )
})
