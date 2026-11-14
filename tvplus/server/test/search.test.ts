/**
 * Arama çekirdeği birim testleri: saf işlevler + satır içi örnek veri (katalog servisine bağlı değil).
 */
import { describe, expect, it } from 'vitest'
import { LIVE_SECTION_TTL_SEC, SEARCH_TTL_SEC } from '../../shared/constants'
import { GENRES } from '../../shared/taxonomy'
import { parseTctx } from '../../shared/tctx'
import { norm, stableId } from '../../shared/text'
import { negotiateCapabilities } from '../src/services/search/capabilities'
import { allowedEdits, correctQuery, correctToken, damerauLevenshtein } from '../src/services/search/fuzzy'
import { matchAll, SCORE, tokenize } from '../src/services/search/match'
import { buildSearchPage, type SearchRequestContext } from '../src/services/search/page'
import { buildSearchIndex, type SearchIndex } from '../src/services/search/searchIndex'
import type {
  SearchOptionsInput,
  SearchPageCapabilitiesInput,
  SearchPageResult,
  SearchSectionResult,
} from '../src/services/search/types'
import {
  CHANNELS,
  COLLECTIONS,
  FULL_CAPS,
  kinds,
  NO_LIVE_CAPS,
  NOW,
  OLD_CAPS,
  peopleOf,
  title,
  TITLES,
  AIRINGS,
} from './search-fixtures'

const INDEX: SearchIndex = buildSearchIndex(
  { titles: TITLES, collections: COLLECTIONS, people: peopleOf(TITLES), channels: CHANNELS, airings: AIRINGS },
  NOW,
)

/* ───────────── Yardımcılar ───────────── */

interface RunOpts {
  caps?: SearchPageCapabilitiesInput
  filters?: SearchOptionsInput['filters']
  pageSize?: number
  kids?: boolean
  index?: SearchIndex
  entitled?: (videoId: number) => boolean
  exactTerm?: boolean
}
let reqSeq = 0
function run(term: string, o: RunOpts = {}): SearchPageResult {
  const kidsProfile = o.kids ?? false
  const byId = new Map(TITLES.map((t) => [t.videoId, t]))
  const ctx: SearchRequestContext = {
    term,
    options: {
      pageCapabilities: o.caps ?? FULL_CAPS,
      filters: o.filters ?? null,
      pageSize: o.pageSize ?? null,
      exactTerm: o.exactTerm ?? null,
    },
    now: NOW,
    requestId: `istek-${++reqSeq}`,
    kids: kidsProfile,
    isTitleVisible: (id) => (kidsProfile ? (byId.get(id)?.kids ?? false) : true),
    isEntitled: o.entitled ?? ((id) => byId.get(id)?.availability.requiredProduct == null),
    recentSearches: ['şahsiyet', 'kanal d'],
  }
  return buildSearchPage(o.index ?? INDEX, ctx)
}
const section = (p: SearchPageResult, type: SearchSectionResult['sectionType']) =>
  p.sections.find((s) => s.sectionType === type)
const names = (s: SearchSectionResult | undefined) => (s ? s.entities.map((e) => e.displayString) : [])
const allEntities = (p: SearchPageResult) => p.sections.flatMap((s) => s.entities)

/* ───────────── Testler ───────────── */

describe('Türkçe düzleştirme', () => {
  it('büyük/küçük harf ve Türkçe harfler eşleşmeyi değiştirmez', () => {
    for (const q of ['Şahsiyet', 'şahsiyet', 'ŞAHSİYET', 'sahsiyet', 'SAHSIYET']) {
      const g = section(run(q), 'SearchGallerySection')
      expect(g?.entities[0]?.displayString, q).toBe('Şahsiyet')
      expect(g?.entities[0]?.score).toBe(100)
    }
  })
  it('"cocuk" Çocuk kanalını bulur', () => {
    expect(names(section(run('trt cocuk'), 'SearchLiveSection'))[0]).toBe('TRT Çocuk')
  })
})

describe('puanlama', () => {
  const mini = buildSearchIndex(
    {
      titles: [
        title({ videoId: 1, title: 'Kaynak', popularity: 99 }),
        title({ videoId: 2, title: 'Kırık Ayna', popularity: 98 }),
        title({ videoId: 3, title: 'Aynalar', popularity: 97 }),
        title({ videoId: 4, title: 'Ayna', popularity: 1 }),
        title({ videoId: 5, title: 'Uzun Bir Gece Ayna', popularity: 50 }),
      ],
      collections: [],
      people: [],
      channels: [],
      airings: [],
    },
    NOW,
  )
  it('tam ad > önek > kelime başı > kelime içi', () => {
    const m = matchAll(
      mini.docs.filter((d) => d.type === 'video'),
      tokenize('ayna'),
    )
    expect(m.map((x) => [x.doc.displayString, x.score])).toEqual([
      ['Ayna', SCORE.EXACT],
      ['Aynalar', SCORE.PREFIX],
      ['Kırık Ayna', 62],
      ['Uzun Bir Gece Ayna', 60],
      ['Kaynak', SCORE.INSIDE],
    ])
  })
  it('kelime başı puanı 56–62 aralığında kalır', () => {
    for (const m of matchAll(mini.docs, tokenize('ayna'))) {
      if (m.score < SCORE.PREFIX && m.score > SCORE.INSIDE) {
        expect(m.score).toBeGreaterThanOrEqual(56)
        expect(m.score).toBeLessThanOrEqual(62)
      }
    }
  })
  it('kişi/anahtar kelime/tür ikincil ağırlıkla sayılır; öneride STORY_ART, galeride her zaman BOXART', () => {
    const p = run('haluk')
    const g = section(p, 'SearchGallerySection')
    expect(g?.entities[0]?.displayString).toBe('Şahsiyet')
    expect(g?.entities[0]?.score).toBeLessThan(SCORE.PREFIX)
    // Galeri 2:3 afiş hücresi çizer → eşleşme kişi üzerinden olsa da BOXART
    expect(g?.entities[0]?.artworkType).toBe('BOXART')
    const suggestion = section(p, 'SearchListSection')?.entities.find((e) => e.treatment === 'standardSuggestion')
    expect(suggestion?.artworkType).toBe('STORY_ART')
    expect(names(section(p, 'SearchListSection'))).toContain('Haluk Bilginer')
    expect(section(run('şahsiyet'), 'SearchGallerySection')?.entities[0]?.artworkType).toBe('BOXART')
  })
  it('galerideki her varlığın bağlamsal görseli BOXART', () => {
    for (const q of ['haluk', 'yerli', 'yemek', 'dram', 'sahsyiet', '']) {
      const g = run(q).sections.find((s) => s.sectionType === 'SearchGallerySection')
      expect(g?.entities.length, q).toBeGreaterThan(0)
      expect(
        g?.entities.every((e) => e.artworkType === 'BOXART'),
        q,
      ).toBe(true)
    }
  })
  it('eşitlikte popülerlik kazanır', () => {
    // "yerli" türü üç başlıkta eşit puan verir → popülerlik sırası
    const g = section(run('yerli'), 'SearchGallerySection')
    expect(names(g)).toEqual(['Şahsiyet', 'Bir Başkadır', 'Kurtlar Vadisi'])
  })
  it('çok kelimede her kelime eşleşmeli (VE)', () => {
    expect(matchAll(INDEX.docs, tokenize('kara sevda')).map((m) => m.doc.displayString)).toEqual(['Kara Sevda'])
    expect(matchAll(INDEX.docs, tokenize('kara vadisi'))).toEqual([])
    const both = matchAll(INDEX.docs, tokenize('kurtlar necati'))
    expect(both.map((m) => m.doc.displayString)).toEqual(['Kurtlar Vadisi'])
  })
  it('tam çok kelimeli ad 100 alır', () => {
    expect(matchAll(INDEX.docs, tokenize('Kara Sevda'))[0]?.score).toBe(100)
  })
})

describe('yazım düzeltmesi', () => {
  const vocab = INDEX.vocab
  it('Damerau–Levenshtein: yer değiştirme 1 düzenlemedir', () => {
    expect(damerauLevenshtein('sahsiyet', 'shasiyet')).toBe(1)
    expect(damerauLevenshtein('kitap', 'kitab')).toBe(1)
    expect(damerauLevenshtein('abc', 'abc')).toBe(0)
    expect(damerauLevenshtein('kedi', 'kopek')).toBe(4)
    expect(damerauLevenshtein('', 'abc')).toBe(3)
  })
  it('izinli düzenleme sayısı kelime uzunluğuna bağlı', () => {
    expect([1, 3, 4, 7, 8, 12].map(allowedEdits)).toEqual([0, 0, 1, 1, 2, 2])
  })
  it('8+ harfte iki hata düzeltilir', () => {
    expect(correctToken('sahsyiet', vocab, false)).toMatchObject({ value: 'sahsiyet', kind: 'edit' })
    expect(correctToken('sxhsiyxt', vocab, false)).toMatchObject({ value: 'sahsiyet', kind: 'edit', distance: 2 })
  })
  it('4–7 harfte bir hata düzeltilir, iki hata düzeltilmez', () => {
    expect(correctToken('sevad', vocab, false).value).toBe('sevda')
    expect(correctToken('svead', vocab, false).kind).toBe('none')
  })
  it('3 harf ve altı asla düzeltilmez', () => {
    expect(correctToken('trx', vocab, false).kind).toBe('none')
  })
  it('ilk harf aynı olmalı', () => {
    expect(correctToken('xahsiyet', vocab, false).kind).toBe('none')
  })
  it('rakam içeren ve sözlükte olan kelimeler düzeltilmez', () => {
    expect(correctToken('trt2', vocab, true).kind).toBe('none')
    expect(correctToken('sahil', vocab, true)).toMatchObject({ value: 'sahil', kind: 'none' }) // "sahsiyet"e çekilmez
    expect(correctToken('kara', vocab, false).kind).toBe('none')
  })
  it('son kelimede önek toleransı: "mastrc" → "masterchef"', () => {
    expect(correctToken('mastrc', vocab, true)).toMatchObject({ value: 'masterchef', kind: 'prefix' })
    // Önek toleransı yalnız son kelimede
    expect(correctToken('mastrc', vocab, false).kind).toBe('none')
  })
  it('boşluk onarımı: "kanald" → "kanal d"', () => {
    expect(correctToken('kanald', vocab, true)).toMatchObject({ value: 'kanal d', kind: 'split' })
    expect(correctQuery(['kanald'], vocab).tokens).toEqual(['kanal', 'd'])
  })
  it('sonuçsuz sorgu düzeltilir: CORRECTED, tüm varlıklar fuzzy', () => {
    const p = run('sahsyiet')
    expect(p.isFallback).toBe(false)
    expect(p.correction).toEqual({ mode: 'CORRECTED', originalTerm: 'sahsyiet', correctedTerm: 'sahsiyet' })
    expect(section(p, 'SearchGallerySection')?.entities[0]?.displayString).toBe('Şahsiyet')
    expect(allEntities(p).every((e) => e.fuzzy)).toBe(true)
  })
  it('"kanald" Kanal D kanalını bulur', () => {
    const p = run('kanald')
    expect(p.correction?.correctedTerm).toBe('kanal d')
    expect(names(section(p, 'SearchLiveSection'))[0]).toBe('Kanal D')
  })
  it('"mastrc" MasterChef\'i bulur', () => {
    const p = run('mastrc')
    expect(p.correction?.mode).toBe('CORRECTED')
    expect(names(section(p, 'SearchGallerySection'))).toEqual(['MasterChef Türkiye'])
  })
  it('zayıf sonuçta MIXED: doğrudan eşleşmeler önce, düzeltilenler sonra', () => {
    const mini = buildSearchIndex(
      {
        titles: [
          title({ videoId: 1, title: 'Kaynak', popularity: 10 }),
          title({ videoId: 2, title: 'Aynı Yol', popularity: 90 }),
        ],
        collections: [],
        people: [],
        channels: [],
        airings: [],
      },
      NOW,
    )
    const p = run('ayna', { index: mini })
    expect(p.correction).toEqual({ mode: 'MIXED', originalTerm: 'ayna', correctedTerm: 'ayni' })
    const g = section(p, 'SearchGallerySection')
    expect(g?.entities.map((e) => [e.displayString, e.fuzzy])).toEqual([
      ['Kaynak', false],
      ['Aynı Yol', true],
    ])
  })
  it('güçlü sonuçta düzeltme denenmez', () => {
    expect(run('sahil').correction).toBeNull()
  })
  it('exactTerm: sonuçsuz terim düzeltilmez, yedek sayfa döner', () => {
    expect(run('sahsyiet').correction?.mode).toBe('CORRECTED')
    const p = run('sahsyiet', { exactTerm: true })
    expect(p.correction).toBeNull()
    expect(p.isFallback).toBe(true)
    expect(p.searchTerm).toBe('sahsyiet')
    expect(allEntities(p).some((e) => e.fuzzy)).toBe(false)
    // "Bunun yerine … ara" döngüsü yok: aynı çağrı yine düzeltmesiz
    expect(run('sahsyiet', { exactTerm: true }).correction).toBeNull()
  })
  it('exactTerm: zayıf doğrudan sonuçlar MIXED olmadan döner', () => {
    const mini = buildSearchIndex(
      {
        titles: [
          title({ videoId: 1, title: 'Kaynak', popularity: 10 }),
          title({ videoId: 2, title: 'Aynı Yol', popularity: 90 }),
        ],
        collections: [],
        people: [],
        channels: [],
        airings: [],
      },
      NOW,
    )
    expect(run('ayna', { index: mini }).correction?.mode).toBe('MIXED')
    const p = run('ayna', { index: mini, exactTerm: true })
    expect(p.correction).toBeNull()
    expect(p.isFallback).toBe(false)
    expect(names(section(p, 'SearchGallerySection'))).toEqual(['Kaynak'])
    expect(allEntities(p).every((e) => !e.fuzzy)).toBe(true)
  })
  it('exactTerm: güçlü doğrudan sonuçlar aynen döner', () => {
    const p = run('sahil', { exactTerm: true })
    expect(p.correction).toBeNull()
    expect(section(p, 'SearchGallerySection')?.entities[0]?.displayString).toBe('Sahil')
  })
})

describe('yetenek pazarlığı', () => {
  it('tam istemci: canlı → öneriler → galeri sırası ve doğru çizim biçimleri', () => {
    const p = run('masterchef')
    expect(p.sections.map((s) => [s.sectionType, s.id, s.displayString])).toEqual([
      ['SearchLiveSection', 'canli', 'Şu an canlı'],
      ['SearchListSection', 'oneriler', 'Keşfetmeye devam et'],
      ['SearchGallerySection', 'galeri', 'Film ve Diziler'],
    ])
    const live = section(p, 'SearchLiveSection')
    expect(live?.entities[0]).toMatchObject({
      kind: 'PROGRAM_AIRING',
      treatment: 'standardAiringRow',
      unifiedEntityId: 'Airing:a3',
    })
    expect(live?.entities[0]?.ref).toMatchObject({ type: 'airing', airing: { airingId: 'a3' } })
    const list = section(p, 'SearchListSection')
    expect(list?.entities[0]).toMatchObject({
      kind: 'VIDEO',
      treatment: 'standardSuggestion',
      unifiedEntityId: 'Video:80030002',
    })
    const g = section(p, 'SearchGallerySection')
    expect(g?.entities[0]).toMatchObject({
      kind: 'VIDEO',
      treatment: 'standardBoxshot',
      ref: { type: 'video', videoId: 80030002 },
    })
    expect(g?.totalCount).toBe(1)
  })
  it('öneriler: koleksiyon, tür ve kişi + en çok 5 başlık önerisi', () => {
    const list = section(run('yerli'), 'SearchListSection')
    const byTreatment = (t: string) => list?.entities.filter((e) => e.treatment === t) ?? []
    expect(
      byTreatment('standardDestination')
        .map((e) => e.unifiedEntityId)
        .sort(),
    ).toEqual(['Collection:9001', `Genre:${GENRES.yerli.genreId}`].sort())
    expect(byTreatment('standardSuggestion').length).toBeLessThanOrEqual(5)
    const kisi = section(run('necati'), 'SearchListSection')?.entities.find((e) => e.kind === 'PERSON')
    expect(kisi?.ref).toEqual({ type: 'person', personId: stableId(norm('Necati Şaşmaz')), name: 'Necati Şaşmaz' })
    expect(kisi?.treatment).toBe('standardPersonChip')
  })
  it('eski istemci (yalnız galeri/boxshot/VIDEO) daha küçük ama geçerli yanıt alır', () => {
    const p = run('masterchef', { caps: OLD_CAPS })
    expect(p.sections.map((s) => s.sectionType)).toEqual(['SearchGallerySection'])
    expect(allEntities(p).every((e) => e.kind === 'VIDEO' && e.treatment === 'standardBoxshot')).toBe(true)
    expect(p.sections[0]?.entities[0]?.track.row).toBe(0)
    expect(p.expires.getTime()).toBe(NOW.getTime() + SEARCH_TTL_SEC * 1000)
    // Yalnız kanalla eşleşen sorgu eski istemcide çıkmaz sokak olmaz: Popüler yedeği
    const k = run('kanal d', { caps: OLD_CAPS })
    expect(k.isFallback).toBe(true)
    expect(k.sections.map((s) => s.id)).toEqual(['populer'])
  })
  it('canlı bölüm bildirmeyen istemciye kanal/yayın dönmez', () => {
    const p = run('masterchef', { caps: NO_LIVE_CAPS })
    expect(section(p, 'SearchLiveSection')).toBeUndefined()
    expect(allEntities(p).some((e) => e.kind === 'CHANNEL' || e.kind === 'PROGRAM_AIRING')).toBe(false)
    expect(p.sections[0]?.sectionType).toBe('SearchListSection')
    expect(p.sections[0]?.entities[0]?.track.row).toBe(0)
  })
  it('yanlış tür bildiren biçim kullanılmaz; hiç bildirim yoksa bölüm de yok', () => {
    const caps = negotiateCapabilities({
      capabilitiesBySection: {
        searchLive: {
          capabilitiesBySectionTreatment: {
            standard: { capabilitiesByEntityTreatment: { standardChannelTile: kinds('VIDEO') } },
          },
        },
      },
    })
    expect([...(caps.get('searchLive') ?? [])]).toEqual([])
    expect(negotiateCapabilities(null).size).toBe(0)
    const p = run('sahsiyet', { caps: { capabilitiesBySection: {} } })
    expect(p.sections).toEqual([])
  })
})

describe('canlı bölüm', () => {
  it('canlı ya da 24 saat içinde başlayan yayınlar; tekrarlar tekilleşir', () => {
    const live = section(run('arka sokaklar'), 'SearchLiveSection')
    expect(live?.entities.map((e) => e.unifiedEntityId)).toEqual(['Airing:a1'])
    // Bitmiş ve 24 saatten sonraki yayınlar hiç dönmez (sorgu yedeğe düşer)
    for (const q of ['ana haber', 'gece haberleri']) {
      const p = run(q)
      expect(p.isFallback, q).toBe(true)
      expect(
        allEntities(p).some((e) => e.kind === 'PROGRAM_AIRING'),
        q,
      ).toBe(false)
    }
  })
  it('kanal numarası metin olarak aranır', () => {
    expect(names(section(run('20'), 'SearchLiveSection'))).toEqual(['Haber Global'])
  })
})

describe('galeri süzgeçleri ve sıralama', () => {
  const g = (o: RunOpts) => names(section(run('', o), 'SearchGallerySection'))
  it('tür (film | dizi)', () => {
    expect(g({ filters: { kind: 'film' } }).sort()).toEqual(['Sahil', 'Sintel'])
    expect(g({ filters: { kind: 'dizi' } })).not.toContain('Sahil')
  })
  it('yıl kümeleri: 2020 = 2020+, 2010 = 2010–2019, old = 2010 öncesi', () => {
    expect(g({ filters: { year: '2020' } }).sort()).toEqual(['Bir Başkadır', 'MasterChef Türkiye'].sort())
    expect(g({ filters: { year: '2010' } }).sort()).toEqual(
      ['Kara Sevda', 'Pepee', 'Sahil', 'Sintel', 'Şahsiyet'].sort(),
    )
    expect(g({ filters: { year: 'old' } })).toEqual(['Kurtlar Vadisi'])
  })
  it('genreIds', () => {
    expect(g({ filters: { genreIds: [GENRES.animasyon.genreId, GENRES.romantik.genreId] } }).sort()).toEqual([
      'Kara Sevda',
      'Sintel',
    ])
  })
  it('yalnızca paketimdekiler', () => {
    expect(g({ filters: { entitledOnly: true } })).not.toContain('Sintel')
    expect(g({ filters: { entitledOnly: false } })).toContain('Sintel')
  })
  it('süzgeçler yalnız galeriye uygulanır', () => {
    const p = run('masterchef', { filters: { kind: 'film' } })
    expect(section(p, 'SearchGallerySection')).toBeUndefined()
    expect(section(p, 'SearchListSection')?.entities.length).toBeGreaterThan(0)
  })
  it('sıralama: az Türkçe harf sırasıyla (S < Ş)', () => {
    expect(g({ filters: { sort: 'az' } })).toEqual([
      'Bir Başkadır',
      'Kara Sevda',
      'Kurtlar Vadisi',
      'MasterChef Türkiye',
      'Pepee',
      'Sahil',
      'Sintel',
      'Şahsiyet',
    ])
  })
  it('sıralama: new yıl, sonra eklenme tarihi', () => {
    const list = g({ filters: { sort: 'new' } })
    expect(list.slice(0, 2)).toEqual(['MasterChef Türkiye', 'Bir Başkadır'])
    expect(list.at(-1)).toBe('Kurtlar Vadisi')
  })
  it('sayfa boyutu ve totalCount', () => {
    const s = section(run('', { pageSize: 3 }), 'SearchGallerySection')
    expect(s?.entities.length).toBe(3)
    expect(s?.totalCount).toBe(TITLES.length)
    expect(section(run(''), 'SearchGallerySection')?.entities.length).toBe(TITLES.length) // varsayılan 48
  })
})

describe('yedek sayfa (çıkmaz sokak yok)', () => {
  it('boş terim: Şu an canlı + Popüler, isFallback', () => {
    const p = run('   ')
    expect(p.isFallback).toBe(true)
    expect(p.correction).toBeNull()
    expect(p.sections.map((s) => [s.sectionType, s.displayString])).toEqual([
      ['SearchLiveSection', 'Şu an canlı'],
      ['SearchGallerySection', 'Popüler'],
    ])
    expect(names(section(p, 'SearchLiveSection'))[0]).toBe('Kanal D') // favori önce
    expect(names(section(p, 'SearchGallerySection')).slice(0, 3)).toEqual([
      'Şahsiyet',
      'Bir Başkadır',
      'MasterChef Türkiye',
    ])
    expect(section(p, 'SearchGallerySection')?.entities[0]?.artworkType).toBe('BOXART')
    expect(p.recentSearches).toEqual(['şahsiyet', 'kanal d'])
  })
  it('düzeltmeye rağmen sonuç yoksa yedek', () => {
    const p = run('qqqqzzzz')
    expect(p.isFallback).toBe(true)
    expect(p.searchTerm).toBe('qqqqzzzz')
    expect(p.sections.length).toBe(2)
  })
  it('kanal kutucuğu çizemeyen istemciye canlı yayın satırları', () => {
    const caps: SearchPageCapabilitiesInput = {
      capabilitiesBySection: {
        searchLive: {
          capabilitiesBySectionTreatment: {
            standard: { capabilitiesByEntityTreatment: { standardAiringRow: kinds('PROGRAM_AIRING') } },
          },
        },
      },
    }
    const p = run('', { caps })
    expect(
      section(p, 'SearchLiveSection')
        ?.entities.map((e) => e.unifiedEntityId)
        .sort(),
    ).toEqual(['Airing:a1', 'Airing:a4'])
  })
})

describe('yaşam süreleri ve izler', () => {
  it('canlı bölüm 60 sn, katalog bölümleri 8 sa; sayfa en kısasını alır', () => {
    const p = run('masterchef')
    expect(section(p, 'SearchLiveSection')?.expires.getTime()).toBe(NOW.getTime() + LIVE_SECTION_TTL_SEC * 1000)
    expect(section(p, 'SearchListSection')?.expires.getTime()).toBe(NOW.getTime() + SEARCH_TTL_SEC * 1000)
    expect(section(p, 'SearchGallerySection')?.expires.getTime()).toBe(NOW.getTime() + SEARCH_TTL_SEC * 1000)
    expect(p.expires.getTime()).toBe(NOW.getTime() + LIVE_SECTION_TTL_SEC * 1000)
  })
  it('track: satır = bölüm sırası, tctx çözülebilir, trackId terime göre kararlı', () => {
    const a = run('Şahsiyet')
    const b = run('sahsiyet')
    expect(a.trackId).toBe(b.trackId)
    expect(a.requestId).not.toBe(b.requestId)
    expect(run('sahil').trackId).not.toBe(a.trackId)
    a.sections.forEach((s, row) =>
      s.entities.forEach((e, pos) => {
        expect(e.track).toMatchObject({ row, pos, rowId: s.id, trackId: a.trackId, entityId: e.unifiedEntityId })
        expect(parseTctx(e.track.tctx)).toEqual({
          row,
          rank: pos,
          rowId: s.id,
          trackId: a.trackId,
          entityId: e.unifiedEntityId,
        })
      }),
    )
  })
  it('video dışı varlıklarda bağlamsal görsel yok', () => {
    const p = run('kanal d')
    expect(
      allEntities(p)
        .filter((e) => e.kind !== 'VIDEO')
        .every((e) => e.artworkType === null),
    ).toBe(true)
  })
})

describe('çocuk profili', () => {
  it('yalnız çocuk kanalları ve görünür başlıklar', () => {
    const p = run('trt', { kids: true })
    expect(names(section(p, 'SearchLiveSection'))).toEqual(['TRT Çocuk'])
    const f = run('', { kids: true })
    expect(names(section(f, 'SearchLiveSection'))).toEqual(['TRT Çocuk'])
    expect(names(section(f, 'SearchGallerySection'))).toEqual(['Pepee'])
  })
  it('yetişkin kanalındaki yayın ve görünmeyen başlıklar çıkmaz', () => {
    expect(run('arka sokaklar', { kids: true }).isFallback).toBe(true)
    expect(run('şahsiyet', { kids: true }).isFallback).toBe(true)
    // Kişi ve koleksiyon da yalnız görünür başlıklar üzerinden
    expect(allEntities(run('haluk', { kids: true })).some((e) => e.kind === 'PERSON')).toBe(false)
  })
})
