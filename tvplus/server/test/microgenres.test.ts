/**
 * Mikro türler: nitelik çıkarımı, tanım sayımı (0–3 yuva, sıfat çifti), minTitles, aynı küme ayıklaması, kararlı
 * kimlik, ad kurma (her yuva türü ve birleşimleri), katmanlar, benzerlik ağırlığı, etiket değişince yeniden üretim, uçlar.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { zTitle, type ContentTitle } from '../../shared/content-schema'
import type {
  EffectiveTags,
  Microgenre,
  MicrogenreDefinition,
  MicrogenreList,
  TagSheet,
} from '../../shared/intelligence'
import { zVocabulary, type MicrogenreSlot, type TagVocabulary } from '../../shared/tagging-schema'
import type { TaggingService } from '../src/kernel/intelligence'
import {
  canonicalDefinition,
  generateMicrogenres,
  microgenreId,
  possibleDefinitions,
  sha256Hex,
} from '../src/services/microgenres/generate'
import { excludedForCore, nameOf } from '../src/services/microgenres/naming'
import { createRegistry, extractQualities, recurringPeople, type Quality } from '../src/services/microgenres/qualities'
import { createMicrogenreCore } from '../src/services/microgenres/service'
import { similarTitles } from '../src/services/microgenres/similarity'
import { descriptorsOf, indexVocabulary } from '../src/services/tagging/vocabulary'
import { createTestApp } from './helpers'

const VOCAB: TagVocabulary = zVocabulary.parse(
  JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'tagging', 'vocabulary.json'), 'utf8')),
)
const INDEX = indexVocabulary(VOCAB)

/* ───────────── küçük katalog kurucu ───────────── */

interface Spec {
  id: number
  type?: 'MOVIE' | 'SHOW'
  genres: string[]
  year?: number
  countries?: string[]
  cast?: string[]
  directors?: string[]
  scales?: Record<string, number>
  facets?: Record<string, string[]>
}

function mkTitle(s: Spec): ContentTitle {
  const type = s.type ?? 'MOVIE'
  return zTitle.parse({
    videoId: s.id,
    slug: `t-${s.id}`,
    type,
    title: `Başlık ${s.id}`,
    year: s.year ?? 2015,
    synopsis: 'Yirmi karakterden uzun bir deneme özeti.',
    shortSynopsis: 'Kısa.',
    genres: s.genres,
    cast: s.cast ?? [],
    directors: s.directors ?? [],
    maturity: { rating: 'GENEL' },
    origin: { countries: s.countries ?? [], languages: [] },
    license: { name: 'CC BY', attribution: 'x' },
    ...(type === 'MOVIE'
      ? { sources: [{ type: 'YOUTUBE', videoId: 'aqz-KE-bpKQ' }] }
      : {
          seasons: [
            {
              number: 1,
              episodes: [
                {
                  videoId: s.id * 10 + 1,
                  number: 1,
                  title: 'B1',
                  synopsis: 'Bölüm özeti.',
                  sources: [{ type: 'YOUTUBE', videoId: 'aqz-KE-bpKQ' }],
                },
              ],
            },
          ],
        }),
  })
}

function mkTags(s: Spec): EffectiveTags {
  const scales = s.scales ?? {}
  return {
    titleId: s.id,
    rubricVersion: VOCAB.version,
    basis: 'SAMPLE',
    sheetCount: 0,
    agreement: null,
    scales,
    facets: s.facets ?? {},
    descriptors: descriptorsOf(INDEX, scales),
  }
}

const gen = (specs: Spec[], minTitles = 2, vocabulary: TagVocabulary = VOCAB) =>
  generateMicrogenres({
    index: indexVocabulary(vocabulary),
    titles: specs.map((s) => ({ title: mkTitle(s), tags: mkTags(s) })),
    minTitles,
    now: () => new Date('2026-11-13T00:00:00Z'),
  })
const names = (g: ReturnType<typeof gen>) => g.items.map((m) => m.name)
const byName = (g: ReturnType<typeof gen>, name: string): Microgenre => {
  const m = g.items.find((x) => x.name === name)
  if (!m) throw new Error(`"${name}" yok; olanlar:\n${names(g).join('\n')}`)
  return m
}

/* ───────────── nitelikler ───────────── */

describe('nitelik çıkarımı', () => {
  it('niteleyiciler, ifadeli yüz değerleri, bölge, dönem ve yinelenen kişiler', () => {
    const reg = createRegistry(INDEX)
    const titles = [
      mkTitle({
        id: 1,
        genres: ['komedi', 'dram'],
        year: 1925,
        countries: ['TR', 'US'],
        cast: ['Ayşe Yılmaz', 'Tek Sefer'],
      }),
      mkTitle({ id: 2, genres: ['dram'], cast: ['ayşe  yılmaz'] }),
    ]
    const people = recurringPeople(titles)
    expect([...people]).toEqual([['ayse-yilmaz', 'Ayşe Yılmaz']])
    const q = extractQualities(
      INDEX,
      reg,
      titles[0]!,
      mkTags({
        id: 1,
        genres: [],
        scales: { romantizm: 4, mizah: 5 },
        facets: { mekan: ['uzay'], 'ek-sifatlar': ['kult'], bicim: ['dizi'] },
      }),
      people,
    )
    expect(q.cores).toEqual(['komedi', 'dram'])
    const got = q.quals.map((id) => `${reg.get(id).slot}:${reg.get(id).key}`).sort()
    expect(got).toEqual(
      [
        'ADJECTIVE:romantik',
        'ADJECTIVE:komik',
        'ADJECTIVE:ek-sifatlar:kult',
        'SETTING:mekan:uzay',
        'REGION:yerli',
        'REGION:amerikan',
        'ERA:1920ler',
        'PERSON:ayse-yilmaz',
      ].sort(),
    )
    // "dizi" değerinin hazır ifadesi yok → nitelik olmaz; "Tek Sefer" tek başlıkta → kişi olmaz
  })
})

/* ───────────── sayım ───────────── */

describe('tanım sayımı', () => {
  const dark = (id: number, extra: Partial<Spec> = {}): Spec => ({
    id,
    type: 'SHOW',
    genres: ['suc'],
    countries: ['SE'],
    scales: { 'karanlik-ton': 4 },
    facets: { kaynak: ['gercek-olay'] },
    ...extra,
  })

  /** 1–2 her şeyi taşır; 3, 5, 6 ikili alt tanımları ayırır (yoksa aynı küme ayıklamasıyla sade ad kalırdı). */
  const crime = (): Spec[] => [
    dark(1),
    dark(2),
    dark(3, { facets: {} }),
    dark(5, { countries: ['GB'] }),
    dark(6, { scales: {} }),
  ]

  it('en az minTitles başlık; 0–3 yuva; yuva başına bir değer', () => {
    const g = gen(crime())
    const full = byName(g, 'Gerçek Olaylardan Uyarlanan Karanlık İskandinav Suç Dizileri')
    expect(full).toMatchObject({ size: 2, specificity: 3, titleIds: [1, 2] })
    expect(byName(g, 'Karanlık İskandinav Suç Dizileri').titleIds).toEqual([1, 2, 3])
    expect(byName(g, 'Gerçek Olaylardan Uyarlanan Karanlık Suç Dizileri').titleIds).toEqual([1, 2, 5])
    expect(byName(g, 'Gerçek Olaylardan Uyarlanan İskandinav Suç Dizileri').titleIds).toEqual([1, 2, 6])
    expect(Math.max(...g.items.map((m) => m.specificity))).toBe(3)
    for (const m of g.items) {
      const slots = m.definition.slots.map((x) => x.slot).filter((x) => x !== 'ADJECTIVE')
      expect(new Set(slots).size).toBe(slots.length)
      expect(m.size).toBeGreaterThanOrEqual(2)
    }
    const strict = gen(crime(), 3)
    expect(names(strict)).not.toContain('Gerçek Olaylardan Uyarlanan Karanlık İskandinav Suç Dizileri')
    expect(names(strict)).toContain('Karanlık İskandinav Suç Dizileri')
    expect(strict.items.every((m) => m.size >= 3)).toBe(true)
  })

  it('dört yuvalı tanım kurulmaz; sıfat yuvasında en çok iki değer (ayıklamasız tam sayım)', () => {
    const s = (id: number): Spec => ({
      id,
      genres: ['dram'],
      year: 1975,
      countries: ['FR'],
      scales: { 'karanlik-ton': 5, romantizm: 5, duygusallik: 5 },
      facets: { mekan: ['buyuksehir'] },
    })
    const raw = generateMicrogenres({
      index: INDEX,
      titles: [s(1), s(2)].map((x) => ({ title: mkTitle(x), tags: mkTags(x) })),
      minTitles: 2,
      dedupe: false,
    })
    // sıfat (1 + 3x + 3x²) · bölge, mekân, dönem (1 + x)³ → x⁰..x³: 1 + 6 + 15 + 19 = 41 tanım (hepsi film)
    expect(raw.items).toHaveLength(41)
    expect(raw.stats.bySpecificity).toEqual({ '0': 1, '1': 6, '2': 15, '3': 19 })
    for (const m of raw.items) {
      expect(m.definition.type).toBe('MOVIE')
      expect(m.definition.slots.filter((x) => x.slot === 'ADJECTIVE').length).toBeLessThanOrEqual(2)
    }
    expect(raw.items.map((m) => m.name)).toContain("1970'lerden Büyükşehirde Geçen Fransız Dram Filmleri")
    expect(raw.items.map((m) => m.name)).toContain('Duygusal Karanlık Fransız Dram Filmleri')
    // aynı iki başlık: ayıklamayla tek, en sade ad kalır
    expect(names(gen([s(1), s(2)]))).toEqual(['Dram Filmleri'])
  })

  it('aynı başlık kümesi → en okunur tanım (az yuva, sözlükte önce gelen tür, kısa ad)', () => {
    const s = (id: number): Spec => ({ id, genres: ['klasik', 'komedi'], year: 1925, countries: ['US'] })
    const g = gen([s(1), s(2)])
    // komedi, klasikten önce gelir; yuvasız tanım yuvalılarını yener
    expect(names(g)).toEqual(['Komedi Filmleri'])
    expect(g.items[0]!.titleIds).toEqual([1, 2])
  })

  it('karışık katalogda film/dizi biçimleri ayrı ayrı kurulur', () => {
    const g = gen([
      { id: 1, genres: ['dram'] },
      { id: 2, genres: ['dram'] },
      { id: 3, type: 'SHOW', genres: ['dram'] },
      { id: 4, type: 'SHOW', genres: ['dram'] },
    ])
    expect(names(g).sort()).toEqual(['Dram Dizileri', 'Dram Filmleri', 'Dramlar'])
    expect(byName(g, 'Dramlar').definition.type).toBeNull()
  })

  it('kimlik kararlı: aynı tanım aynı kimlik; ad değişse de değişmez; yuva sırası kimliği etkilemez', () => {
    const specs = crime()
    const a = gen(specs)
    const b = gen(specs)
    expect(a.items.map((m) => m.id)).toEqual(b.items.map((m) => m.id))
    const m = byName(a, 'Gerçek Olaylardan Uyarlanan Karanlık İskandinav Suç Dizileri')
    expect(m.id).toMatch(/^mg_[0-9a-f]{12}$/)
    expect(m.id).toBe(microgenreId(m.definition))
    expect(microgenreId({ ...m.definition, slots: [...m.definition.slots].reverse() })).toBe(m.id)

    const renamed = structuredClone(VOCAB)
    renamed.naming.regions.find((r) => r.key === 'iskandinav')!.adjective = 'Kuzey Avrupa'
    renamed.naming.order = [...renamed.naming.order].reverse()
    const c = gen(specs, 2, renamed)
    const same = c.byId.get(m.id)!
    expect(same.name).not.toBe(m.name)
    expect(same.name).toContain('Kuzey Avrupa')
  })

  it('kimlik çakışırsa kanonik biçimi sonra gelen daha uzun önek alır', () => {
    const g = generateMicrogenres({
      index: INDEX,
      titles: crime().map((x) => ({ title: mkTitle(x), tags: mkTags(x) })),
      minTitles: 2,
      hash: (c) => `000000000000${sha256Hex(c)}`,
    })
    const ids = g.items.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    const sorted = [...g.items].sort((x, y) =>
      canonicalDefinition(x.definition) < canonicalDefinition(y.definition) ? -1 : 1,
    )
    expect(sorted[0]!.id).toBe('mg_000000000000')
    expect(sorted[1]!.id).toMatch(/^mg_000000000000[0-9a-f]{4}$/)
  })

  it('kuramsal tanım uzayı sözlükten hesaplanır', () => {
    const v = structuredClone(VOCAB)
    v.facets = v.facets.filter((f) => f.key === 'mekan').map((f) => ({ ...f, values: f.values.slice(0, 2) }))
    v.scales = v.scales.map((s, i) => ({ ...s, descriptors: i === 0 ? s.descriptors.slice(0, 1) : [] }))
    v.naming.regions = v.naming.regions.slice(0, 1)
    v.naming.eras = []
    v.naming.genreNouns = { dram: v.naming.genreNouns['dram']!, komedi: v.naming.genreNouns['komedi']! }
    // mekân (1+2x) · sıfat (1+x) · bölge (1+x) = 1 + 4x + 5x² + 2x³ → 12 ; × 2 tür × 3 (karışık/film/dizi)
    expect(possibleDefinitions(indexVocabulary(v))).toBe(72)
    expect(possibleDefinitions(INDEX)).toBeGreaterThan(1_000_000)
  })
})

/* ───────────── adlar ───────────── */

describe('adlandırma', () => {
  const reg = createRegistry(INDEX)
  const q = (slot: MicrogenreSlot, key: string) => {
    const x = reg.find(slot, key)
    if (!x) throw new Error(`${slot}:${key} yok`)
    return x
  }
  const chaplin = reg.add('PERSON', 'charlie-chaplin', 'Charlie Chaplin', 0)

  it('her yuva türü ve birleşimleri doğal Türkçe adlar kurar (sözlükteki hazır biçimlerle)', () => {
    const cases: [string, MicrogenreDefinition['type'], Quality[], string][] = [
      ['komedi', 'MOVIE', [q('FORMAT', 'bicim:sessiz'), q('ERA', '1920ler')], "1920'lerden Sessiz Komedi Filmleri"],
      ['komedi', null, [chaplin], 'Charlie Chaplin Komedileri'],
      ['komedi', 'MOVIE', [chaplin], 'Charlie Chaplin Komedi Filmleri'],
      ['kisa-film', 'MOVIE', [chaplin], 'Charlie Chaplin Kısa Filmleri'],
      [
        'belgesel',
        null,
        [q('ADJECTIVE', 'dusundurucu'), q('SUBJECT', 'konu:uzay-kesfi')],
        'Uzay Keşfi Hakkında Düşündürücü Belgeseller',
      ],
      [
        'suc',
        'SHOW',
        [q('REGION', 'iskandinav'), q('ADJECTIVE', 'karanlik'), q('SOURCE', 'kaynak:gercek-olay')],
        'Gerçek Olaylardan Uyarlanan Karanlık İskandinav Suç Dizileri',
      ],
      [
        'animasyon',
        'SHOW',
        [q('LEAD', 'ana-karakter:hayvan'), q('AGE', 'yas-grubu:8-10')],
        '8–10 Yaş için Hayvan Kahramanlı Animasyon Dizileri',
      ],
      [
        'animasyon',
        'MOVIE',
        [q('AGE', 'yas-grubu:cocuk'), q('ERA', '2020ler')],
        "2020'lerden Çocuklar için Animasyon Filmleri",
      ],
      [
        'dram',
        'SHOW',
        [q('SETTING', 'mekan:istanbul'), q('PERIOD', 'donem:osmanli')],
        "Osmanlı Döneminde Geçen İstanbul'da Geçen Dram Dizileri",
      ],
      [
        'bilim-kurgu',
        'MOVIE',
        [q('SETTING', 'mekan:uzay'), q('SOURCE', 'kaynak:kitap')],
        'Kitaptan Uyarlanan Uzayda Geçen Bilim Kurgu Filmleri',
      ],
      [
        'bilim-kurgu',
        null,
        [q('ADJECTIVE', 'karanlik'), q('ADJECTIVE', 'ek-sifatlar:kult')],
        'Kült Karanlık Bilim Kurgu Filmleri ve Dizileri',
      ],
      [
        'animasyon',
        'MOVIE',
        [q('REGION', 'hollanda'), q('FORMAT', 'bicim:kisa-film')],
        'Hollanda Yapımı Kısa Animasyon Filmleri',
      ],
      // tamlama isteyen bölge: "Kore Dramları", "Japon Animasyonları"; sıfat gibi olan: "Yerli Dramlar"
      ['dram', null, [q('ADJECTIVE', 'ucu-acik'), q('REGION', 'kore')], 'Ucu Açık Kore Dramları'],
      ['animasyon', null, [q('REGION', 'japon')], 'Japon Animasyonları'],
      ['fantastik', 'MOVIE', [q('REGION', 'fransiz')], 'Fransız Fantastik Filmleri'],
      ['dram', null, [q('REGION', 'yerli')], 'Yerli Dramlar'],
      ['komedi', null, [q('REGION', 'hollanda')], 'Hollanda Yapımı Komediler'],
      [
        'yasam',
        'SHOW',
        [q('FORMAT', 'bicim:soylesi'), q('SUBJECT', 'konu:edebiyat')],
        'Edebiyat Hakkında Söyleşi Biçimindeki Yaşam ve Kültür Programları',
      ],
      ['romantik', 'MOVIE', [q('ADJECTIVE', 'komik')], 'Komik Romantik Filmler'],
    ]
    for (const [core, type, quals, expected] of cases) expect(nameOf(INDEX, core, type, quals)).toBe(expected)
  })

  it('birbirini söyleyen nitelikler (naming.redundantPairs) aynı adda birleşmez', () => {
    const specs: Spec[] = [1, 2].map((id) => ({
      id,
      genres: ['komedi'],
      facets: { bicim: ['sessiz'], 'ek-sifatlar': ['diyalogsuz', 'kult'] },
    }))
    const raw = (vocabulary: TagVocabulary) =>
      generateMicrogenres({
        index: indexVocabulary(vocabulary),
        titles: specs.map((x) => ({ title: mkTitle(x), tags: mkTags(x) })),
        minTitles: 2,
        dedupe: false,
      }).items.map((m) => m.name)
    const withRule = raw(VOCAB)
    expect(withRule).toContain('Kült Sessiz Komedi Filmleri')
    expect(withRule).toContain('Kült Diyalogsuz Komedi Filmleri')
    expect(withRule.some((n) => n.includes('Diyalogsuz') && n.includes('Sessiz'))).toBe(false)
    const v = structuredClone(VOCAB)
    v.naming.redundantPairs = []
    expect(raw(v)).toContain('Diyalogsuz Sessiz Komedi Filmleri')
  })

  it('tür adında söylenen ya da aynı kökten nitelik o türle kullanılmaz', () => {
    const ex = (core: string) => {
      const ids = excludedForCore(INDEX, core, reg.list)
      return reg.list.filter((x) => ids.has(x.id)).map((x) => `${x.slot}:${x.key}`)
    }
    expect(ex('komedi')).toEqual(
      expect.arrayContaining(['ADJECTIVE:komik', 'ADJECTIVE:esprili', 'ADJECTIVE:ek-sifatlar:eglenceli']),
    )
    expect(ex('romantik')).toContain('ADJECTIVE:romantik')
    expect(ex('sessiz-sinema')).toEqual(
      expect.arrayContaining(['FORMAT:bicim:sessiz', 'ADJECTIVE:ek-sifatlar:diyalogsuz']),
    )
    expect(ex('kisa-film')).toContain('FORMAT:bicim:kisa-film')
    expect(ex('yerli')).toContain('REGION:yerli')
    // kök yinelemesi: "Müzik Tarihi Hakkında Tarih …", "Çocuk Kahramanlı Çocuk ve Aile …", "Doğa ve Çevre Hakkında Doğa ve Bilim …"
    expect(ex('tarih')).toContain('SUBJECT:konu:muzik-tarihi')
    expect(ex('cocuk-aile')).toEqual(expect.arrayContaining(['LEAD:ana-karakter:cocuk', 'AGE:yas-grubu:cocuk']))
    expect(ex('doga-bilim')).toContain('SUBJECT:konu:doga-cevre')
    expect(ex('dram')).toEqual([])
    expect(ex('komedi')).not.toContain('PERSON:charlie-chaplin')
  })

  it('üretimde: kişi yuvası tek başına; ad tanımın yuva sırasıyla; yinelemeli ad oluşmaz', () => {
    const silent = (id: number, year: number, person = true): Spec => ({
      id,
      genres: ['komedi', 'sessiz-sinema'],
      year,
      countries: ['US'],
      cast: person ? ['Charlie Chaplin'] : [],
      scales: { mizah: 5 },
      facets: { bicim: ['sessiz'] },
    })
    const g = gen([
      silent(1, 1921),
      silent(2, 1925),
      { ...silent(3, 1931), type: 'SHOW' },
      silent(4, 1926, false),
      { id: 5, genres: ['komedi'], year: 1924, countries: ['US'] },
      { id: 6, genres: ['komedi'], year: 1995 },
      silent(7, 1915, false),
      { id: 8, genres: ['dram', 'sessiz-sinema'], year: 1927, facets: { bicim: ['sessiz'] } },
    ])
    const all = names(g)
    expect(all).toContain("1920'lerden Sessiz Komedi Filmleri")
    expect(all).toContain('Charlie Chaplin Komedileri')
    expect(all).toContain('Charlie Chaplin Komedi Filmleri')
    expect(all.some((n) => /Komik Komedi|Sessiz Sessiz|Sessiz Filmleri? .*Sessiz/.test(n))).toBe(false)
    expect(
      g.items.filter((m) => m.definition.slots.some((x) => x.slot === 'PERSON')).every((m) => m.specificity === 1),
    ).toBe(true)
    expect(byName(g, "1920'lerden Sessiz Komedi Filmleri").definition).toEqual({
      core: 'komedi',
      type: 'MOVIE',
      slots: [
        { slot: 'ERA', key: '1920ler' },
        { slot: 'FORMAT', key: 'bicim:sessiz' },
      ],
    })
  })
})

/* ───────────── katmanlar ve benzerlik ───────────── */

describe('katmanlar ve benzerlik', () => {
  it('VISIBLE: en az 4 başlık ve en çok 2 yuva; gerisi HIDDEN', () => {
    const s = (id: number, dark: boolean, emo: boolean, kr: boolean): Spec => ({
      id,
      genres: ['dram'],
      countries: kr ? ['KR'] : [],
      scales: { ...(dark ? { 'karanlik-ton': 4 } : {}), ...(emo ? { duygusallik: 4 } : {}) },
    })
    const g = gen([
      s(1, true, true, true),
      s(2, true, true, true),
      s(3, true, true, false),
      s(4, true, false, false),
      s(5, false, false, false),
      s(6, false, false, false),
      s(7, false, true, true),
      s(8, true, false, true),
    ])
    expect(byName(g, 'Dram Filmleri')).toMatchObject({ size: 8, layer: 'VISIBLE' })
    expect(byName(g, 'Karanlık Dram Filmleri')).toMatchObject({ size: 5, specificity: 1, layer: 'VISIBLE' })
    expect(byName(g, 'Kore Dram Filmleri')).toMatchObject({ size: 4, layer: 'VISIBLE' })
    expect(byName(g, 'Duygusal Karanlık Dram Filmleri')).toMatchObject({ size: 3, specificity: 2, layer: 'HIDDEN' })
    expect(byName(g, 'Duygusal Karanlık Kore Dram Filmleri')).toMatchObject({
      size: 2,
      specificity: 3,
      layer: 'HIDDEN',
    })
    for (const m of g.items) expect(m.layer).toBe(m.size >= 4 && m.specificity <= 2 ? 'VISIBLE' : 'HIDDEN')
    expect(g.stats.visible + g.stats.hidden).toBe(g.stats.total)
    expect(g.stats.bySpecificity['0']).toBe(1)
    expect(g.stats.coveredTitles).toBe(8)
  })

  it('nadir ortak mikro tür daha ağır sayılır; ortaklar en ağır önce döner', () => {
    // 1 ile 2 nadir bir mikro türü paylaşır; 1 ile 3 yalnız herkesin olduğu geniş türü ve orta genişlikte birini
    const specs: Spec[] = [
      { id: 1, genres: ['dram'], countries: ['JP'], facets: { mekan: ['hastane'] } },
      { id: 2, genres: ['dram'], facets: { mekan: ['hastane'] } },
      { id: 3, genres: ['dram'], countries: ['JP'] },
      { id: 4, genres: ['dram'], countries: ['JP'] },
      { id: 5, genres: ['dram'] },
      { id: 6, genres: ['dram'] },
      { id: 7, genres: ['dram'] },
    ]
    const g = gen(specs)
    const sim = similarTitles(g, 1, 10)
    expect(sim.map((s) => s.titleId).slice(0, 1)).toEqual([2])
    const hospital = byName(g, 'Hastanede Geçen Dram Filmleri')
    expect(sim[0]!.shared[0]).toBe(hospital.id)
    // herkesi kapsayan "Dram Filmleri" ağırlığı 0: yalnız onu paylaşanlar listede yok
    expect(sim.map((s) => s.titleId)).not.toContain(5)
    expect(sim.find((s) => s.titleId === 3)!.score).toBeLessThan(sim[0]!.score)
    for (const s of sim) expect(s.score).toBeGreaterThan(0)
    expect(similarTitles(g, 999, 5)).toEqual([])
  })
})

/* ───────────── tembel üretim ───────────── */

describe('yeniden üretim', () => {
  it('etiket revizyonu ya da katalog değişince yeniden üretir; değişmezse önbellekten', () => {
    let rev = 1
    let dark = false
    const titles: ContentTitle[] = [1, 2, 3].map((id) => mkTitle({ id, genres: ['dram'] }))
    let list: readonly ContentTitle[] = titles
    const tagging: TaggingService = {
      vocabulary: () => VOCAB,
      effective: (id) => mkTags({ id, genres: [], scales: dark && id <= 3 ? { 'karanlik-ton': 5 } : {} }),
      sheets: (): TagSheet[] => [],
      revision: () => rev,
    }
    const core = createMicrogenreCore({ tagging: () => tagging, titles: () => list })
    const r1 = core.revision()
    const g1 = core.generation()
    expect(core.generation()).toBe(g1)
    expect(core.all().map((m) => m.name)).toEqual(['Dram Filmleri'])
    dark = true
    expect(core.generation()).toBe(g1) // revizyon değişmeden yeniden üretmez
    rev++
    expect(core.all().map((m) => m.name)).toEqual(['Dram Filmleri']) // hepsi karanlık → aynı küme, sade ad
    expect(core.revision()).toBe(r1 + 1)
    list = [...titles, mkTitle({ id: 4, genres: ['dram'] })]
    expect(core.all().map((m) => m.name)).toContain('Karanlık Dram Filmleri')
    expect(core.revision()).toBe(r1 + 2)
  })
})

/* ───────────── uçlar (gerçek katalog) ───────────── */

describe('mikro tür uçları', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await createTestApp()
  })
  afterAll(async () => {
    await app.close()
  })
  const list = async (qs: string) => {
    const r = await app.inject({ method: 'GET', url: `/api/studio/microgenres${qs}` })
    expect(r.statusCode, r.body).toBe(200)
    return r.json<MicrogenreList>()
  }

  it('liste: süzgeçler, Türkçe harf duyarsız arama, sayfalama', async () => {
    const all = await list('?first=500')
    expect(all.total).toBe(app.services.microgenres.stats().total)
    expect(all.stats.coveredTitles).toBe(app.services.catalog.allTitles().length)
    const komedi = await list('?core=komedi&first=500')
    expect(komedi.items.every((m) => m.definition.core === 'komedi')).toBe(true)
    const person = await list('?slot=PERSON')
    expect(person.items.map((m) => m.name)).toContain('Buster Keaton Komedi Filmleri')
    const q = await list('?q=KULT')
    expect(q.items.length).toBeGreaterThan(0)
    expect(q.items.every((m) => m.name.includes('Kült') || m.name.includes('Kültür'))).toBe(true)
    const vis = await list('?layer=VISIBLE&minSize=5&first=500')
    expect(vis.items.every((m) => m.layer === 'VISIBLE' && m.size >= 5)).toBe(true)
    const p1 = await list('?first=3&offset=0')
    const p2 = await list('?first=3&offset=3')
    expect(p1.items).toHaveLength(3)
    expect(p2.items[0]!.id).toBe(all.items[3]!.id)
    for (const bad of ['?core=uydurma', '?slot=X', '?layer=ALL', '?first=0', '?minSize=-1', '?bilinmeyen=1'])
      expect((await app.inject({ method: 'GET', url: `/api/studio/microgenres${bad}` })).statusCode, bad).toBe(400)
  })

  it('tek mikro tür ve başlığın mikro türleri (en dar önce)', async () => {
    const mine = await app.inject({ method: 'GET', url: '/api/studio/microgenres/by-title/80010001' })
    expect(mine.statusCode).toBe(200)
    const items = mine.json<Microgenre[]>()
    expect(items.length).toBeGreaterThan(0)
    for (let i = 1; i < items.length; i++) expect(items[i]!.specificity).toBeLessThanOrEqual(items[i - 1]!.specificity)
    const one = await app.inject({ method: 'GET', url: `/api/studio/microgenres/${items[0]!.id}` })
    expect(one.json<Microgenre>().titleIds).toContain(80010001)
    expect((await app.inject({ method: 'GET', url: '/api/studio/microgenres/mg_ffffffffffff' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/studio/microgenres/xyz' })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: '/api/studio/microgenres/by-title/123' })).statusCode).toBe(404)
  })

  it('benzer başlıklar ortak mikro tür kimlikleriyle döner; fiş onaylanınca yeniden üretilir', async () => {
    const mg = app.services.microgenres
    const sim = mg.similarTitles(80020004, 5) // Sherlock Jr.
    expect(sim.length).toBeGreaterThan(0)
    expect(sim.map((s) => s.titleId)).toContain(80020006) // The General: Buster Keaton, sessiz, kült komedi
    for (const s of sim)
      for (const id of s.shared) expect(mg.get(id)?.titleIds).toEqual(expect.arrayContaining([80020004, s.titleId]))

    // REST: aynı sonuç, varsayılan 12, sınır ve hatalar
    const viaRest = await app.inject({ method: 'GET', url: '/api/studio/microgenres/similar/80020004?first=5' })
    expect(viaRest.statusCode).toBe(200)
    expect(viaRest.json()).toEqual(sim)
    const def = await app.inject({ method: 'GET', url: '/api/studio/microgenres/similar/80020004' })
    expect(def.json<unknown[]>().length).toBeLessThanOrEqual(12)
    expect(def.json<{ titleId: number; score: number; shared: string[] }[]>()[0]).toMatchObject({
      titleId: expect.any(Number),
      score: expect.any(Number),
      shared: expect.any(Array),
    })
    for (const [url, code] of [
      ['/api/studio/microgenres/similar/123', 404],
      ['/api/studio/microgenres/similar/abc', 400],
      ['/api/studio/microgenres/similar/80020004?first=0', 400],
      ['/api/studio/microgenres/similar/80020004?first=500', 400],
      ['/api/studio/microgenres/similar/80020004?x=1', 400],
    ] as const)
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(code)

    const rev = mg.revision()
    const sheet = { watched: true, scales: { romantizm: 5 }, facets: { mekan: ['tren'] } }
    for (const id of [80020004, 80020007]) {
      await app.inject({ method: 'PUT', url: `/api/studio/tagging/titles/${id}/sheets/etiket-01`, payload: sheet })
      await app.inject({ method: 'POST', url: `/api/studio/tagging/titles/${id}/sheets/etiket-01/approve` })
    }
    expect(mg.revision()).toBe(rev + 1)
    // iki fiş de romantizm 5 + tren: "Romantik Komedi Filmleri" yalnız bu ikisini kapsar; aynı kümeyi veren
    // "Trende Geçen Romantik Komedi Filmleri" ayıklanır (daha çok yuva)
    const romantic = mg.ofTitle(80020007).find((m) => m.name === 'Romantik Komedi Filmleri')
    expect(romantic?.titleIds.sort()).toEqual([80020004, 80020007])
    expect(mg.all().some((m) => m.name === 'Trende Geçen Romantik Komedi Filmleri')).toBe(false)
  })
})
