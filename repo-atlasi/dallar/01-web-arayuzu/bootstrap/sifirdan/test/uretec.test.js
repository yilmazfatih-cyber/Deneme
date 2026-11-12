import { test } from 'node:test'
import assert from 'node:assert/strict'
import { v5Tokenlar, v6Tokenlar, yardimciHaritasi } from '../src/tokenlar.js'
import { cssUret, gridUret, sinifAdi, yardimcilarUret, yardimciUret } from '../src/uretec.js'
import { yazdir, kacis } from '../src/css.js'

test('sınıf adlandırma: v5 "infix" (col-md-6) ve v6 "prefix" (md:col-6)', () => {
  assert.equal(sinifAdi(v5Tokenlar, 'md', 'col', 6), 'col-md-6')
  assert.equal(sinifAdi(v5Tokenlar, 'xs', 'col', 6), 'col-6')
  assert.equal(sinifAdi(v5Tokenlar, 'lg', 'd', 'none'), 'd-lg-none')
  assert.equal(sinifAdi(v6Tokenlar, 'md', 'col', 6), 'md:col-6')
  assert.equal(sinifAdi(v6Tokenlar, '2xl', 'd', 'none'), '2xl:d-none')
  assert.equal(kacis('md:col-6'), 'md\\:col-6')
  assert.equal(kacis('2xl:d-none'), '\\32 xl\\:d-none') // rakamla başlayan tanımlayıcı
})

test('grid: 12 sütun, her kırılım noktası için genişlikler ve mobil önce medya sorguları', () => {
  const css = yazdir(gridUret(v5Tokenlar))
  assert.match(css, /\.col-6 \{\n {2}flex: 0 0 auto;\n {2}width: 50%;\n\}/)
  assert.match(css, /\.col-4 \{\n {2}flex: 0 0 auto;\n {2}width: 33\.33333333%;/)
  assert.match(css, /@media \(min-width: 768px\) \{\n {2}\.col-md \{/)
  assert.match(css, /--bs-gutter-x: 1\.5rem/)
  assert.doesNotMatch(css, /\.offset-0 /, 'tabanda işe yaramayan offset-0 yok')
  assert.match(css, /\.offset-md-0 \{/)
  // mobil önce: taban kurallar kırılım noktalarından önce gelir
  assert.ok(css.indexOf('.col-6 {') < css.indexOf('@media (min-width: 576px)'))
  const sutunSinifi = (css.match(/^\s*\.col(-[a-z]+)?-\d+ \{/gm) || []).length
  assert.equal(sutunSinifi, 12 * Object.keys(v5Tokenlar.breakpoints).length)
})

test('v6 lehçesi: öneksiz değişken, mantıksal özellik, aralık sözdizimli medya sorgusu', () => {
  const css = yazdir(gridUret(v6Tokenlar))
  assert.match(css, /--gutter-x: 1\.5rem/)
  assert.match(css, /margin-inline: calc\(-\.5 \* var\(--gutter-x\)\)/)
  assert.match(css, /@media \(width >= 1024px\) \{\n {2}\.lg\\:col \{/)
  assert.match(css, /\.\\32 xl\\:col-12 \{/)
})

test('belirteç değişince sistem değişir: 5 sütunlu grid', () => {
  const css = yazdir(gridUret({ ...v5Tokenlar, gridSutun: 5, breakpoints: { xs: 0 } }))
  assert.match(css, /\.col-1 \{\n {2}flex: 0 0 auto;\n {2}width: 20%;/)
  assert.doesNotMatch(css, /\.col-6 /)
})

test('yardımcı API: liste, harita, null anahtar, çoklu özellik', () => {
  const harita = yardimciHaritasi(v5Tokenlar)
  const css = yazdir(yardimciUret(v5Tokenlar, harita.shadow, 'xs'))
  assert.match(css, /^\.shadow \{\n {2}box-shadow: 0 \.5rem 1rem rgba\(0, 0, 0, \.15\) !important;/m)
  assert.match(css, /^\.shadow-sm \{/m)
  const mx = yazdir(yardimciUret(v5Tokenlar, harita['margin-x'], 'md'))
  assert.match(mx, /\.mx-md-3 \{\n {2}margin-right: 1rem !important;\n {2}margin-left: 1rem !important;\n\}/)
  const d = yazdir(yardimciUret(v6Tokenlar, yardimciHaritasi(v6Tokenlar).display, 'md'))
  assert.match(d, /\.md\\:d-none \{\n {2}display: none;\n\}/, 'v6: !important yok')
})

test('yalnızca responsive: true olanlar kırılım noktalarında üretilir; print varyantı en sonda', () => {
  const css = yazdir(yardimcilarUret(v5Tokenlar, yardimciHaritasi(v5Tokenlar)))
  assert.match(css, /\.d-md-flex \{/)
  assert.doesNotMatch(css, /\.opacity-md-50/, 'opacity responsive değil')
  assert.match(css, /@media print \{\n {2}\.d-print-none \{/)
  assert.ok(css.lastIndexOf('@media print') > css.lastIndexOf('@media (min-width: 1400px)'))
})

test('tam çıktı: v6 @layer ile, v5 düz', () => {
  const v6 = cssUret(v6Tokenlar, yardimciHaritasi(v6Tokenlar))
  assert.ok(v6.startsWith('@layer layout, utilities;\n@layer layout {'))
  assert.match(v6, /@layer utilities \{/)
  const v5 = cssUret(v5Tokenlar, yardimciHaritasi(v5Tokenlar))
  assert.doesNotMatch(v5, /@layer/)
  assert.match(v5, /@media \(min-width: 1400px\) \{\n {2}\.container \{\n {4}max-width: 1320px;/)
})
