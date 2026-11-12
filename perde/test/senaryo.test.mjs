// Çalıştır: node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeStats,
  countWords,
  cycleType,
  inferType,
  nextTypeOnEnter,
  normalizeDoc,
  parseFountain,
  parsePaste,
  sceneBounds,
  sceneNumberAt,
  splitElement,
  toFountain,
  upperTr,
} from '../public/senaryo.mjs'

const SAMPLE = [
  { type: 'scene', text: 'İÇ. ÇAY OCAĞI - GECE' },
  { type: 'action', text: 'Şevket semaverin başında bardak siler. Dışarıda yağmur.' },
  { type: 'character', text: 'ŞEVKET' },
  { type: 'dialogue', text: 'Bu saatte kim gelir ki?' },
  { type: 'character', text: 'NİLÜFER (O.S.)' },
  { type: 'parenthetical', text: 'kapıyı çalarak' },
  { type: 'dialogue', text: 'Açsana, Şevket Abi.' },
  { type: 'action', text: 'Şevket durur.\nBardak elinden kayar.' },
  { type: 'transition', text: 'KESME' },
  { type: 'scene', text: 'DIŞ. SOKAK - GÜN' },
  { type: 'action', text: 'ÇOCUKLAR koşar.' },
  { type: 'character', text: 'JOHN' },
  { type: 'dialogue', text: 'Hello there.' },
  { type: 'transition', text: 'CUT TO:' },
  { type: 'scene', text: 'INT. OFFICE - DAY' },
  { type: 'action', text: '!ünlem ile başlar' },
  { type: 'action', text: 'SİLAH SESİ' },
]

test('upperTr: i → İ, ı → I', () => {
  assert.equal(upperTr('iç'), 'İÇ')
  assert.equal(upperTr('dış'), 'DIŞ')
  assert.equal(upperTr('ığdır şişli'), 'IĞDIR ŞİŞLİ')
})

test('Fountain gidiş-dönüş Türkçe karakterlerle bozulmaz', () => {
  const text = toFountain(SAMPLE)
  const back = parseFountain(text)
  assert.deepEqual(back.elements, normalizeDoc(SAMPLE))
  // İkinci tur aynı metni üretir
  assert.equal(toFountain(back.elements), text)
})

test('Türkçe metinde zorlayıcı işaretler kullanılır, standart olanlar çıplak kalır', () => {
  const text = toFountain(SAMPLE)
  const lines = text.split('\n')
  assert.ok(lines.includes('.İÇ. ÇAY OCAĞI - GECE'), 'Türkçe sahne başlığı . ile zorlanır')
  assert.ok(lines.includes('.DIŞ. SOKAK - GÜN'))
  assert.ok(lines.includes('INT. OFFICE - DAY'), 'INT. çıplak kalır')
  assert.ok(lines.includes('@ŞEVKET'), 'Türkçe karakter @ ile zorlanır')
  assert.ok(lines.includes('@NİLÜFER (O.S.)'))
  assert.ok(lines.includes('JOHN'), 'ASCII karakter çıplak kalır')
  assert.ok(lines.includes('> KESME'), 'Türkçe geçiş > ile zorlanır')
  assert.ok(lines.includes('CUT TO:'), 'CUT TO: çıplak kalır')
  assert.ok(lines.includes('!SİLAH SESİ'), 'Büyük harfli aksiyon ! ile zorlanır')
  assert.ok(lines.includes('!!ünlem ile başlar'), '! ile başlayan aksiyon da zorlanır')
  assert.ok(lines.includes('(kapıyı çalarak)'))
  assert.ok(!lines.some((l) => /[a-zçğıöşü]/.test(l) && l.startsWith('@')), 'karakter adı büyük harf')
})

test('çıplak İÇ./DIŞ. ve int./ext. okunur; küçük harf büyütülür', () => {
  const r = parseFountain('iç. mutfak - gün\n\nAnne çay demler.\n\ndış. bahçe - gece\n\nint. mutfak - gün\n')
  assert.deepEqual(
    r.elements.map((e) => [e.type, e.text]),
    [
      ['scene', 'İÇ. MUTFAK - GÜN'],
      ['action', 'Anne çay demler.'],
      ['scene', 'DIŞ. BAHÇE - GECE'],
      ['scene', 'INT. MUTFAK - GÜN'],
    ],
  )
  const r2 = parseFountain('İÇ/DIŞ. ARABA - GÜN\n\nDıştan bakarız.')
  assert.equal(r2.elements[0].type, 'scene')
  assert.equal(r2.elements[0].text, 'İÇ/DIŞ. ARABA - GÜN')
  // "İçeri girer." sahne değil, aksiyon
  assert.equal(parseFountain('İçeri girer.').elements[0].type, 'action')
  assert.equal(parseFountain('Dış kapı çalar.').elements[0].type, 'action')
})

test('standart Fountain: karakter bloğu, parantez, çok satırlı diyalog, başlık sayfası', () => {
  const src = [
    'Title: Gece Yarısı',
    'Author: Ayşe Yılmaz',
    '',
    '.İÇ. EV - GECE',
    '',
    '@AYŞE',
    '(fısıltıyla)',
    'Birinci satır.',
    'İkinci satır.',
    '',
    '> KARARMA',
    '',
    '# Bölüm',
    '= özet',
    '===',
    '',
    'Son [[not]] aksiyon.',
  ].join('\n')
  const r = parseFountain(src)
  assert.deepEqual(r.meta, { title: 'Gece Yarısı', author: 'Ayşe Yılmaz' })
  assert.deepEqual(r.elements, [
    { type: 'scene', text: 'İÇ. EV - GECE' },
    { type: 'character', text: 'AYŞE' },
    { type: 'parenthetical', text: 'fısıltıyla' },
    { type: 'dialogue', text: 'Birinci satır.\nİkinci satır.' },
    { type: 'transition', text: 'KARARMA' },
    { type: 'action', text: 'Son  aksiyon.' },
  ])
  const out = toFountain(r.elements, r.meta)
  assert.ok(out.startsWith('Title: Gece Yarısı\nAuthor: Ayşe Yılmaz\n\n'))
  assert.deepEqual(parseFountain(out), { meta: r.meta, elements: r.elements })
})

test('CRLF ve BOM tolere edilir', () => {
  const r = parseFountain('﻿DIŞ. YOL - GÜN\r\n\r\nAraba geçer.\r\n')
  assert.equal(r.elements.length, 2)
})

test('yetim diyalog/parantez aksiyona çevrilir ve gidiş-dönüş tutarlı kalır', () => {
  const els = [
    { type: 'dialogue', text: 'Ortada kaldım.' },
    { type: 'parenthetical', text: 'yavaşça' },
    { type: 'character', text: 'ALİ' },
    { type: 'dialogue', text: 'Bir.' },
    { type: 'dialogue', text: 'İki.' },
  ]
  const norm = normalizeDoc(els)
  assert.deepEqual(norm, [
    { type: 'action', text: 'Ortada kaldım.' },
    { type: 'action', text: '(yavaşça)' },
    { type: 'character', text: 'ALİ' },
    { type: 'dialogue', text: 'Bir.\nİki.' },
  ])
  assert.deepEqual(parseFountain(toFountain(els)).elements, norm)
  assert.deepEqual(normalizeDoc(norm), norm)
})

test('diyaloğu olmayan ASCII karakter @ ile zorlanır; boş öğeler atılır', () => {
  const els = [
    { type: 'character', text: 'ALİ' },
    { type: 'action', text: 'Sessizlik.' },
    { type: 'action', text: '   ' },
  ]
  const text = toFountain(els)
  assert.ok(text.includes('@ALİ'))
  assert.deepEqual(parseFountain(text).elements, [
    { type: 'character', text: 'ALİ' },
    { type: 'action', text: 'Sessizlik.' },
  ])
})

test('Enter kuralları', () => {
  assert.equal(nextTypeOnEnter('scene'), 'action')
  assert.equal(nextTypeOnEnter('action'), 'action')
  assert.equal(nextTypeOnEnter('character'), 'dialogue')
  assert.equal(nextTypeOnEnter('parenthetical'), 'dialogue')
  assert.equal(nextTypeOnEnter('dialogue'), 'character')
  assert.equal(nextTypeOnEnter('transition'), 'scene')
})

test('splitElement: sonu boşsa kural, ortadaysa aynı tür, boş öğede aksiyona dönüş', () => {
  assert.deepEqual(splitElement({ type: 'character', text: 'ali' }, 3), {
    current: { type: 'character', text: 'ALİ' },
    next: { type: 'dialogue', text: '' },
  })
  assert.deepEqual(splitElement({ type: 'dialogue', text: 'Bir iki' }, 4), {
    current: { type: 'dialogue', text: 'Bir ' },
    next: { type: 'dialogue', text: 'iki' },
  })
  assert.deepEqual(splitElement({ type: 'dialogue', text: '' }, 0), {
    current: { type: 'action', text: '' },
    next: null,
  })
  assert.deepEqual(splitElement({ type: 'action', text: 'iç. mutfak - gün' }, 16), {
    current: { type: 'scene', text: 'İÇ. MUTFAK - GÜN' },
    next: { type: 'action', text: '' },
  })
  assert.deepEqual(splitElement({ type: 'dialogue', text: 'Merhaba' }, 0), {
    current: { type: 'dialogue', text: '' },
    next: { type: 'dialogue', text: 'Merhaba' },
  })
})

test('Tab döngüsü tüm türleri gezer ve geri döner', () => {
  const seen = new Set()
  let t = 'action'
  for (let i = 0; i < 6; i++) {
    seen.add(t)
    t = cycleType(t)
  }
  assert.equal(seen.size, 6)
  assert.equal(t, 'action')
  assert.equal(cycleType('action', true), 'scene')
  assert.equal(cycleType(cycleType('dialogue'), true), 'dialogue')
  assert.equal(cycleType('character'), 'dialogue')
})

test('inferType yalnızca tek satırlık sahne başlığı gibi aksiyonu dönüştürür', () => {
  assert.equal(inferType('action', 'iç. ev - gün'), 'scene')
  assert.equal(inferType('action', 'İçeri girer.'), 'action')
  assert.equal(inferType('dialogue', 'iç. ev'), 'dialogue')
})

test('parsePaste: tek satır null, çok satır öğelere ayrılır', () => {
  assert.equal(parsePaste('tek satır'), null)
  const els = parsePaste('ŞEVKET\nÇay hazır.\n\nNilüfer gülümser.')
  assert.deepEqual(els, [
    { type: 'character', text: 'ŞEVKET' },
    { type: 'dialogue', text: 'Çay hazır.' },
    { type: 'action', text: 'Nilüfer gülümser.' },
  ])
})

test('istatistik: sahneler, karakterler (replik), kelime, sayfa', () => {
  const s = computeStats(SAMPLE)
  assert.deepEqual(
    s.scenes.map((x) => x.heading),
    ['İÇ. ÇAY OCAĞI - GECE', 'DIŞ. SOKAK - GÜN', 'INT. OFFICE - DAY'],
  )
  const names = Object.fromEntries(s.characters.map((c) => [c.name, c.lines]))
  assert.deepEqual(names, { ŞEVKET: 1, NİLÜFER: 1, JOHN: 1 })
  assert.ok(s.words > 20)
  assert.ok(s.pages > 0 && s.pages < 2)
  assert.equal(s.elementCount, SAMPLE.length)
  assert.equal(countWords('İÇ. EV - GÜN'), 3)
  assert.equal(countWords(''), 0)
})

test('istatistik: aynı karakter uzantılarıyla tek sayılır, replikler toplanır', () => {
  const s = computeStats([
    { type: 'character', text: 'AYŞE' },
    { type: 'dialogue', text: 'Bir.' },
    { type: 'character', text: 'AYŞE (V.O.)' },
    { type: 'dialogue', text: 'İki.' },
    { type: 'action', text: 'Boş.' },
    { type: 'dialogue', text: 'Sahipsiz.' },
  ])
  assert.deepEqual(s.characters, [{ name: 'AYŞE', lines: 2, words: 2 }])
})

test('sahne yardımcıları', () => {
  assert.equal(sceneNumberAt(SAMPLE, 0), 0)
  assert.equal(sceneNumberAt(SAMPLE, 8), 0)
  assert.equal(sceneNumberAt(SAMPLE, 9), 1)
  assert.equal(sceneNumberAt([{ type: 'action' }], 0), -1)
  assert.deepEqual(sceneBounds(SAMPLE, 0), { start: 0, end: 9 })
  assert.deepEqual(sceneBounds(SAMPLE, 2), { start: 14, end: SAMPLE.length })
  assert.equal(sceneBounds(SAMPLE, 3), null)
  assert.equal(sceneBounds(SAMPLE, -1), null)
})
