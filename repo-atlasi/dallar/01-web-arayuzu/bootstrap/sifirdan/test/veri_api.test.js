import { test } from 'node:test'
import assert from 'node:assert/strict'
import { el, belgeOlustur } from '../src/mini_dom.js'
import { baslat, Collapse, Menu, delegeHedefi, hedefSecicisi, veriNitelikleri } from '../src/veri_api.js'

test('saf yardımcılar: delegasyon hedefi, hedef seçicisi, data-bs-* ayarları', () => {
  const ikon = el('i')
  const dugme = el('button', { 'data-bs-toggle': 'collapse', 'data-bs-target': '#a' }, ikon)
  const kok = belgeOlustur(el('div', {}, dugme))
  assert.equal(delegeHedefi(ikon, '[data-bs-toggle="collapse"]', kok), dugme)
  assert.equal(delegeHedefi(kok.children[0], '[data-bs-toggle="collapse"]', kok), null)
  assert.equal(hedefSecicisi(dugme), '#a')
  assert.equal(hedefSecicisi(el('a', { href: '#b' })), '#b')
  assert.equal(hedefSecicisi(el('a', { href: '#' })), null)
  assert.deepEqual(veriNitelikleri(el('div', { 'data-bs-parent': '#akordeon', 'data-bs-auto-close': 'false' })), {
    parent: '#akordeon',
    autoClose: false,
  })
})

function collapseSahnesi() {
  const ikon = el('span', { class: 'ikon' })
  const dugme = el(
    'button',
    { id: 'd', 'data-bs-toggle': 'collapse', 'data-bs-target': '#panel', 'aria-expanded': 'false' },
    ikon,
  )
  const panel = el('div', { id: 'panel', class: 'collapse' })
  const belge = belgeOlustur(el('main', {}, dugme, panel))
  const kapat = baslat(belge)
  return { belge, dugme, ikon, panel, kapat }
}

test('collapse: düğmenin İÇİNDEKİ öğeye tıklamak da çalışır (delegasyon), aria-expanded güncellenir', () => {
  const { ikon, dugme, panel } = collapseSahnesi()
  ikon.click()
  assert.ok(panel.classList.contains('show'))
  assert.equal(dugme.getAttribute('aria-expanded'), 'true')
  dugme.click()
  assert.ok(!panel.classList.contains('show'))
  assert.equal(dugme.getAttribute('aria-expanded'), 'false')
  assert.ok(dugme.classList.contains('collapsed'))
  assert.equal(Collapse.getInstance(panel), Collapse.getOrCreateInstance(panel), 'öğe başına tek örnek')
})

test('collapse: show.bs.collapse olayı preventDefault ile iptal edilebilir; olay sırası', () => {
  const { dugme, panel } = collapseSahnesi()
  const gunluk = []
  for (const tur of ['show', 'shown', 'hide', 'hidden'])
    panel.addEventListener(`${tur}.bs.collapse`, () => gunluk.push(tur))
  const iptal = (o) => o.preventDefault()
  panel.addEventListener('show.bs.collapse', iptal)
  dugme.click()
  assert.ok(!panel.classList.contains('show'), 'iptal edildi')
  panel.removeEventListener('show.bs.collapse', iptal)
  dugme.click()
  dugme.click()
  assert.deepEqual(gunluk, ['show', 'show', 'shown', 'hide', 'hidden'])
})

test('akordeon: data-bs-parent içinde bir panel açılınca diğeri kapanır', () => {
  const a = el('div', { id: 'a', class: 'collapse show', 'data-bs-parent': '#akordeon' })
  const b = el('div', { id: 'b', class: 'collapse', 'data-bs-parent': '#akordeon' })
  const da = el('button', { 'data-bs-toggle': 'collapse', 'data-bs-target': '#a' })
  const db = el('button', { 'data-bs-toggle': 'collapse', 'data-bs-target': '#b' })
  const belge = belgeOlustur(el('div', { id: 'akordeon' }, da, a, db, b))
  baslat(belge)
  db.click()
  assert.ok(b.classList.contains('show'))
  assert.ok(!a.classList.contains('show'))
  assert.equal(da.getAttribute('aria-expanded'), 'false')
})

function menuSahnesi(secenekler) {
  const ad = secenekler?.menuAdi ?? 'menu'
  const sinif = (secenekler?.menuSecicisi ?? '.menu').slice(1)
  const t1 = el('button', { id: 't1', 'data-bs-toggle': ad })
  const m1 = el('ul', { class: sinif }, el('li', { id: 'oge' }))
  const t2 = el('button', { id: 't2', 'data-bs-toggle': ad })
  const m2 = el('ul', { class: sinif })
  const disari = el('p', { id: 'disari' })
  const belge = belgeOlustur(el('nav', {}, t1, m1, t2, m2), disari)
  baslat(belge, secenekler)
  return { t1, m1, t2, m2, disari, belge }
}

test('menu: aynı anda tek menü açık; dışarı tıklama ve Escape kapatır', () => {
  const { t1, m1, t2, m2, disari } = menuSahnesi()
  t1.click()
  assert.ok(m1.classList.contains('show'))
  assert.equal(t1.getAttribute('aria-expanded'), 'true')
  m1.children[0].click() // menünün içine tıklamak kapatmaz
  assert.ok(m1.classList.contains('show'))
  t2.click()
  assert.ok(m2.classList.contains('show'))
  assert.ok(!m1.classList.contains('show'), 'öteki kapandı')
  disari.click()
  assert.ok(!m2.classList.contains('show'))
  t1.click()
  m1.dispatchEvent({ type: 'keydown', key: 'Escape', bubbles: true })
  assert.ok(!m1.classList.contains('show'))
  assert.equal(t1.odaklandi, true, 'odak tetikleyiciye döndü')
})

test('v5 lehçesi: data-bs-toggle="dropdown" + .dropdown-menu aynı kodla', () => {
  const { t1, m1 } = menuSahnesi({ menuAdi: 'dropdown', menuSecicisi: '.dropdown-menu' })
  t1.click()
  assert.ok(m1.classList.contains('show'))
  assert.ok(Menu.getInstance(t1))
})

test('baslat() kaldırıcı döndürür; dispose örneği kayıttan siler', () => {
  const { dugme, panel, kapat } = collapseSahnesi()
  kapat()
  dugme.click()
  assert.ok(!panel.classList.contains('show'), 'data API sökülünce tıklama etkisiz')
  const c = Collapse.getOrCreateInstance(panel)
  c.dispose()
  assert.equal(Collapse.getInstance(panel), null)
})
