/**
 * Niyet çözümleyici birim testleri (saf): düzleştirme, ekler, sayılar, dönemler, ifade sırası, `without`, kalan metin.
 * Sözlük gerçek etiket sözlüğüyle (content/tagging/vocabulary.json) ve onsuz (etiketleme servisi yok) kurulur.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { zVocabulary } from '../../shared/tagging-schema'
import {
  buildIntentLexicon,
  decadeName,
  fold,
  stemsOf,
  type IntentLexicon,
} from '../src/services/search/intent/lexicon'
import { parseQuery } from '../src/services/search/intent/parse'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const VOCABULARY = zVocabulary.parse(
  JSON.parse(readFileSync(join(ROOT, 'content', 'tagging', 'vocabulary.json'), 'utf8')),
)
const LEX = buildIntentLexicon({
  vocabulary: VOCABULARY,
  countries: new Set(['TR', 'NL', 'US', 'DE', 'FR']),
  year: 2026,
})
/** Etiketleme servisi yok: yalnız taksonomi ve TR */
const BARE = buildIntentLexicon({ vocabulary: null, countries: new Set(), year: 2026 })

const kinds = (q: string, lex: IntentLexicon = LEX) => parseQuery(q, lex).intents.map((i) => i.kind)
const labels = (q: string, lex: IntentLexicon = LEX) => parseQuery(q, lex).intents.map((i) => i.label)
const one = (q: string, lex: IntentLexicon = LEX) => {
  const p = parseQuery(q, lex)
  expect(p.intents, q).toHaveLength(1)
  return p.intents[0]
}

describe('normalleştirme', () => {
  it('Türkçe küçük harf + ASCII düzleştirme + kesme işareti', () => {
    expect(fold('DÜŞÜNDÜRÜCÜ')).toBe('dusundurucu')
    expect(fold('İzlenecek')).toBe('izlenecek')
    expect(fold("80'lerden")).toBe('80lerden')
    expect(fold('Çocuklar’a')).toBe('cocuklara')
  })
  it('ASCII yazım aynı niyete düşer', () => {
    for (const q of ['düşündürücü', 'dusundurucu', 'DÜŞÜNDÜRÜCÜ', 'Dusundurucu'])
      expect(one(q)?.label, q).toBe('Ton: Düşündürücü')
    expect(labels('kisa dusundurucu bilim kurgu')).toEqual([
      'Süre: 40 dakikadan kısa',
      'Ton: Düşündürücü',
      'Tür: Bilim Kurgu',
    ])
  })
  it('ekler kökle eşleşir (çoğul, iyelik, belirtme, yönelme, ayrılma; k → ğ yumuşaması)', () => {
    expect(stemsOf('cocugu')).toContain('cocuk')
    for (const q of ['komedi', 'komediler', 'komedileri', 'komediyi', 'komedilerden'])
      expect(one(q)?.label, q).toBe('Tür: Komedi')
    for (const q of ['belgesel', 'belgeseller', 'belgeselleri']) expect(one(q)?.label, q).toBe('Tür: Belgesel')
    for (const q of ['film', 'filmler', 'filmi', 'filmleri']) expect(one(q)?.label, q).toBe('Biçim: Film')
    for (const q of ['dizi', 'diziler', 'dizisi', 'dizileri']) expect(one(q)?.label, q).toBe('Biçim: Dizi')
    for (const q of ['çocuk', 'çocuklar', 'çocuklara', 'çocuğu', 'çocuklar için'])
      expect(one(q)?.label, q).toBe('İzleyici: Çocuklar')
    for (const q of ['aile', 'ailece', 'aile için']) expect(one(q)?.label, q).toBe('İzleyici: Aile')
  })
  it('tür yazımları ve eş anlamlılar', () => {
    for (const q of ['bilim kurgu', 'bilimkurgu', 'bilim-kurgu', 'Bilim Kurgu filmleri'])
      expect(parseQuery(q, LEX).intents[0]?.label, q).toBe('Tür: Bilim Kurgu')
    expect(one('çizgi film')?.label).toBe('Tür: Animasyon')
    expect(one('animasyonlar')?.label).toBe('Tür: Animasyon')
    expect(one('drama')?.label).toBe('Tür: Dram')
    expect(one('polisiye')?.label).toBe('Tür: Suç')
  })
})

describe('süre', () => {
  it('çıplak sözcükler: kısa < 40 dk, uzun ≥ 60 dk', () => {
    expect(one('kısa')).toMatchObject({
      kind: 'DURATION',
      label: 'Süre: 40 dakikadan kısa',
      short: 'Kısa',
      spec: { min: null, max: 40, bare: 'short' },
    })
    expect(one('uzun')).toMatchObject({ label: 'Süre: 1 saat ve üzeri', spec: { min: 60, max: null, bare: 'long' } })
  })
  it('sayılı biçimler', () => {
    expect(one('90 dakikadan kısa')).toMatchObject({
      matched: '90 dakikadan kısa',
      label: 'Süre: 90 dakikadan kısa',
      spec: { min: null, max: 90 },
    })
    expect(one('1 saatten kısa')).toMatchObject({ label: 'Süre: 1 saatten kısa', spec: { max: 60 } })
    expect(one("90 dk'dan kısa")).toMatchObject({ matched: "90 dk'dan kısa", spec: { max: 90 } })
    expect(one('90dk dan az')?.spec).toMatchObject({ max: 90 })
    expect(one('2 saatten uzun')).toMatchObject({ label: 'Süre: 2 saatten uzun' })
    expect(one('2 saatlik')).toMatchObject({ label: 'Süre: yaklaşık 2 saat', spec: { min: 90 } })
    expect(one('yarım saat')).toMatchObject({ label: 'Süre: yaklaşık yarım saat' })
    expect(one('yarım saatlik')?.spec).toMatchObject({ min: 22.5 })
    expect(one('1,5 saatlik')).toMatchObject({ label: 'Süre: yaklaşık 1,5 saat', matched: '1,5 saatlik' })
    expect(one('bir buçuk saat')?.label).toBe('Süre: yaklaşık 1,5 saat')
    expect(one('en fazla 45 dakika')).toMatchObject({ label: 'Süre: en fazla 45 dakika', spec: { max: 45.01 } })
    expect(one('40 dakika altı')?.spec).toMatchObject({ max: 40 })
    expect(one('1 saat ve üzeri')?.spec).toMatchObject({ min: 60, max: null })
  })
  it('sayı süre değilse süre sayılmaz', () => {
    expect(kinds('2400 yıllık')).toEqual([])
    expect(kinds('20')).toEqual([])
  })
})

describe('dönem', () => {
  it("on yıllar: 90'lar, 80lerden, 1980'li yıllar", () => {
    expect(one("90'lar")).toMatchObject({ kind: 'ERA', label: "Dönem: 1990'lar", spec: { from: 1990, to: 1999 } })
    expect(one('80lerden')).toMatchObject({ label: "Dönem: 1980'ler", spec: { from: 1980, to: 1989 } })
    expect(one("1980'li yıllar")).toMatchObject({ matched: "1980'li yıllar", label: "Dönem: 1980'ler" })
    expect(one('2010lar')?.label).toBe("Dönem: 2010'lar")
    expect(one("20'ler")?.spec).toMatchObject({ from: 2020 })
    expect(decadeName(1920)).toBe("1920'ler")
    expect(decadeName(1930)).toBe("1930'lar")
  })
  it('… sonrası / … öncesi', () => {
    expect(one('2010 sonrası')).toMatchObject({ label: 'Dönem: 2010 ve sonrası', spec: { from: 2010, to: null } })
    expect(one("2010'dan sonra")?.spec).toMatchObject({ from: 2010 })
    expect(one('2010 ve sonrası')?.matched).toBe('2010 ve sonrası')
    expect(one("2000'den önce")).toMatchObject({ label: 'Dönem: 2000 öncesi', spec: { from: null, to: 1999 } })
  })
  it('eski / yeni', () => {
    expect(one('eski')).toMatchObject({ label: 'Dönem: 2000 öncesi', short: 'Eski' })
    expect(one('yeni')).toMatchObject({ label: 'Dönem: 2022 ve sonrası', spec: { from: 2022 } })
  })
})

describe('köken, ton, canlı', () => {
  it('yerli/türk her zaman; ülke adları yalnız katalogda varsa', () => {
    expect(one('yerli')).toMatchObject({ kind: 'ORIGIN', label: 'Köken: Yerli', spec: { countries: ['TR'] } })
    expect(one('türk')?.label).toBe('Köken: Yerli')
    expect(one('hollanda yapımı')).toMatchObject({ matched: 'hollanda yapımı', label: 'Köken: Hollanda' })
    expect(one('fransız')?.spec).toEqual({ kind: 'ORIGIN', countries: ['FR'] })
    expect(kinds('japon')).toEqual([])
    expect(kinds('hollanda', BARE)).toEqual([])
    expect(kinds('yerli', BARE)).toEqual(['ORIGIN'])
  })
  it('ton: taksonomi ruh hâlleri + etiket sözlüğünün niteleyicileri tek kavramda', () => {
    expect(one('düşündürücü')?.spec).toEqual({ kind: 'MOOD', moods: ['dusundurucu'], tags: ['d:dusundurucu'] })
    expect(one('eğlenceli')?.spec).toEqual({ kind: 'MOOD', moods: ['eglenceli'], tags: ['f:ek-sifatlar:eglenceli'] })
    expect(one('komik')).toMatchObject({ label: 'Ton: Komik', spec: { moods: [], tags: ['d:komik'] } })
    expect(one('ağır tempolu')?.label).toBe('Ton: Ağır Tempolu')
    expect(one('hafif')).toMatchObject({ label: 'Ton: Hafif', spec: { moods: ['eglenceli', 'sakin'] } })
    expect(one('gerilimli')?.label).toBe('Ton: Gerilimli')
    expect(one('karanlık')?.label).toBe('Ton: Karanlık')
    expect(one('ödüllü')?.label).toBe('Nitelik: Ödüllü')
  })
  it('etiketleme servisi yoksa yalnız taksonomi ruh hâlleri', () => {
    expect(one('düşündürücü', BARE)?.spec).toEqual({ kind: 'MOOD', moods: ['dusundurucu'], tags: [] })
    expect(kinds('komik', BARE)).toEqual([])
    expect(one('hafif', BARE)?.spec).toEqual({ kind: 'MOOD', moods: ['eglenceli', 'sakin'], tags: [] })
  })
  it('tür adı tondan önce gelir: "romantik" tür, "gerilim" tür, "gerilimli" ton', () => {
    expect(one('romantik')?.kind).toBe('GENRE')
    expect(one('gerilim')?.label).toBe('Tür: Gerilim')
    expect(one('gerilimli')?.kind).toBe('MOOD')
  })
  it('canlı / şimdi / bu akşam', () => {
    expect(one('canlı')).toMatchObject({ kind: 'LIVE', spec: { when: 'now' } })
    expect(one('şimdi')?.spec).toEqual({ kind: 'LIVE', when: 'now' })
    expect(one('bu akşam')).toMatchObject({ matched: 'bu akşam', label: 'Yayın: Bu akşam', spec: { when: 'tonight' } })
  })
})

describe('ifadeler, sıra ve kalan metin', () => {
  it('en uzun ifade önce: "kısa film" tür, "çocuk ve aile" tür, "sessiz film" tür', () => {
    expect(labels('kısa film')).toEqual(['Tür: Kısa Film'])
    expect(labels('kısa filmler')).toEqual(['Tür: Kısa Film'])
    expect(labels('çocuk ve aile')).toEqual(['Tür: Çocuk ve Aile'])
    expect(labels('kısa komedi filmi')).toEqual(['Süre: 40 dakikadan kısa', 'Tür: Komedi', 'Biçim: Film'])
  })
  it('niyetler sorgudaki sırayla döner', () => {
    expect(kinds('bilim kurgu kısa düşündürücü')).toEqual(['GENRE', 'DURATION', 'MOOD'])
    expect(kinds('80lerden korku filmi')).toEqual(['ERA', 'GENRE', 'TYPE'])
    expect(kinds('eğlenceli çocuk dizisi')).toEqual(['MOOD', 'AUDIENCE', 'TYPE'])
  })
  it('matched yazıldığı gibi; without o parça çıkarılmış, boşlukları düzeltilmiş sorgu', () => {
    const p = parseQuery('Kısa  DÜŞÜNDÜRÜCÜ bilim kurgu', LEX)
    expect(p.intents.map((i) => [i.matched, i.without])).toEqual([
      ['Kısa', 'DÜŞÜNDÜRÜCÜ bilim kurgu'],
      ['DÜŞÜNDÜRÜCÜ', 'Kısa bilim kurgu'],
      ['bilim kurgu', 'Kısa DÜŞÜNDÜRÜCÜ'],
    ])
    expect(p.remainder).toBe('')
    expect(one('komedi')?.without).toBe('')
    expect(parseQuery('90 dakikadan kısa komedi', LEX).intents[0]?.without).toBe('komedi')
  })
  it('dolgu sözcükleri kalan metne girmez; kalan sözcükler metin eşleşmesine gider', () => {
    const a = parseQuery('ailece izlenecek bir animasyon', LEX)
    expect(a.intents.map((i) => i.label)).toEqual(['İzleyici: Aile', 'Tür: Animasyon'])
    expect(a.remainder).toBe('')
    expect(a.remainderTokens).toEqual([])
    const k = parseQuery('Keaton komedileri', LEX)
    expect(k.remainder).toBe('Keaton')
    expect(k.remainderTokens).toEqual(['keaton'])
    expect(k.intents[0]?.without).toBe('Keaton')
  })
  it('aynı niyet iki kez gelmez', () => {
    expect(labels('komedi komediler')).toEqual(['Tür: Komedi'])
  })
  it('çözülecek bir şey yoksa niyet yok, kalan sorgunun kendisi', () => {
    for (const q of ['şahsiyet', 'kara sevda', 'masterchef', 'izlenecek', '']) {
      const p = parseQuery(q, LEX)
      expect(p.intents, q).toEqual([])
      expect(p.remainder, q).toBe(q)
    }
  })
})
