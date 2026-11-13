import { describe, expect, it } from 'vitest'
import { ALL_KINDS, buildDeclaration, declarationSignature, lookupTreatment, TREATMENT_NAMES, type EntityKindName } from './capabilities'
import { activeFilterCount, DEFAULT_FILTERS, filtersInput, posterArtwork, selectBanner } from './searchModel'
import { normalizeTerm, searchCacheKey, TtlCache } from './ttlCache'

describe('yetenek tablosu → bildirim → çizici', () => {
  const all = buildDeclaration(new Set(ALL_KINDS))

  it('her bölüm yalnız çizebildiği biçimleri bildirir', () => {
    expect(all).toEqual({
      capabilitiesBySection: {
        searchLive: {
          capabilitiesBySectionTreatment: {
            standard: { capabilitiesByEntityTreatment: { standardChannelTile: { canHandleEntityKinds: ['CHANNEL'] }, standardAiringRow: { canHandleEntityKinds: ['PROGRAM_AIRING'] } } },
          },
        },
        searchList: {
          capabilitiesBySectionTreatment: {
            standard: {
              capabilitiesByEntityTreatment: {
                standardSuggestion: { canHandleEntityKinds: ['VIDEO'] },
                standardPersonChip: { canHandleEntityKinds: ['PERSON'] },
                standardDestination: { canHandleEntityKinds: ['GENERIC_CONTAINER'] },
              },
            },
          },
        },
        searchGallery: { capabilitiesBySectionTreatment: { standard: { capabilitiesByEntityTreatment: { standardBoxshot: { canHandleEntityKinds: ['VIDEO'] } } } } },
      },
    })
  })

  it('tablodaki her biçim bildirimde bir kez yer alır', () => {
    const declared = Object.values(all.capabilitiesBySection).flatMap((s) => Object.keys(s!.capabilitiesBySectionTreatment.standard.capabilitiesByEntityTreatment))
    expect([...declared].sort()).toEqual([...TREATMENT_NAMES].sort())
  })

  it('bir tür kapanınca biçimi ve boş kalan bölüm bildirimden çıkar', () => {
    const noChannel = buildDeclaration(new Set<EntityKindName>(ALL_KINDS.filter((k) => k !== 'CHANNEL')))
    expect(noChannel.capabilitiesBySection.searchLive?.capabilitiesBySectionTreatment.standard.capabilitiesByEntityTreatment.standardChannelTile).toBeUndefined()
    const onlyVideo = buildDeclaration(new Set<EntityKindName>(['VIDEO']))
    expect(Object.keys(onlyVideo.capabilitiesBySection)).toEqual(['searchList', 'searchGallery'])
    expect(declarationSignature(onlyVideo)).toBe('searchList:standardSuggestion|searchGallery:standardBoxshot')
    expect(JSON.stringify(onlyVideo).length).toBeLessThan(JSON.stringify(all).length)
  })

  it('çizici araması: bilinmeyen ya da bildirilmemiş biçim null', () => {
    expect(lookupTreatment('SearchLiveSection', 'standardChannelTile', all)).toBe('standardChannelTile')
    expect(lookupTreatment('SearchLiveSection', 'standardMatchCard', all)).toBe(null)
    expect(lookupTreatment('SearchSportsSection', 'standardBoxshot', all)).toBe(null)
    expect(lookupTreatment('SearchGallerySection', 'standardChannelTile', all)).toBe(null)
    expect(lookupTreatment('SearchListSection', 'toString', all)).toBe(null)
    const noChannel = buildDeclaration(new Set<EntityKindName>(['VIDEO']))
    expect(lookupTreatment('SearchLiveSection', 'standardChannelTile', noChannel)).toBe(null)
  })
})

describe('TTL önbelleği', () => {
  const base = { profile: 'P', filters: undefined, capabilities: 'sig' }

  it('ömrü içinde isabet, sonra ıska', () => {
    const c = new TtlCache<string>()
    const key = searchCacheKey({ ...base, term: 'sintel' })
    c.set(key, 'yanit', 1_000 + 60_000, 1_000)
    expect(c.get(key, 31_000)).toEqual({ value: 'yanit', expires: 61_000, ageMs: 30_000 })
    expect(c.get(key, 61_000)).toBe(null)
    expect(c.size).toBe(0)
  })

  it('terim düzleştirilir', () => {
    expect(normalizeTerm('  SİNTEL   ve  Işık ')).toBe('sintel ve ışık')
    expect(searchCacheKey({ ...base, term: 'Sintel ' })).toBe(searchCacheKey({ ...base, term: 'sintel' }))
  })

  it('süzgeç ve yetenek bildirimi anahtarı ayırır; süzgeç anahtar sırası önemsiz', () => {
    const a = searchCacheKey({ ...base, term: 'x' })
    const b = searchCacheKey({ ...base, term: 'x', filters: { kind: 'film', year: '2020' } })
    const b2 = searchCacheKey({ ...base, term: 'x', filters: { year: '2020', kind: 'film' } })
    const c = searchCacheKey({ ...base, term: 'x', capabilities: 'baska' })
    const d = searchCacheKey({ ...base, term: 'x', profile: 'Q' })
    const e = searchCacheKey({ ...base, term: 'x', exact: true })
    expect(new Set([a, b, c, d, e]).size).toBe(5)
    expect(searchCacheKey({ ...base, term: 'x', exact: false })).toBe(a)
    expect(b).toBe(b2)
  })

  it('ömrü olmayan yanıt saklanmaz; en eski girdi taşmada düşer', () => {
    const c = new TtlCache<number>(2)
    c.set('a', 1, 100, 100)
    expect(c.size).toBe(0)
    c.set('a', 1, 1000, 0)
    c.set('b', 2, 1000, 0)
    c.get('a', 1)
    c.set('c', 3, 1000, 0)
    expect(c.get('b', 1)).toBe(null)
    expect(c.get('a', 1)?.value).toBe(1)
  })

  it('koşullu silme', () => {
    const c = new TtlCache<number>()
    c.set('P||x', 1, 1000, 0)
    c.set('P|a|x', 2, 1000, 0)
    c.deleteWhere((k) => k.split('|')[1] === '')
    expect(c.get('P||x', 1)).toBe(null)
    expect(c.get('P|a|x', 1)?.value).toBe(2)
  })
})

describe('düzeltme şeridi', () => {
  it('CORRECTED', () => {
    expect(selectBanner({ searchTerm: 'sitnel', isFallback: false, correction: { mode: 'CORRECTED', originalTerm: 'sitnel', correctedTerm: 'sintel' } })).toEqual({
      kind: 'corrected',
      corrected: 'sintel',
      original: 'sitnel',
    })
  })
  it('MIXED', () => {
    expect(selectBanner({ searchTerm: 'kuzgn', isFallback: false, correction: { mode: 'MIXED', originalTerm: 'kuzgn', correctedTerm: 'kuzgun' } })).toEqual({ kind: 'mixed', corrected: 'kuzgun' })
  })
  it('yedek sayfa: terim varsa "sonuç yok", boş terimde şerit yok', () => {
    expect(selectBanner({ searchTerm: 'xqzzv', isFallback: true, correction: null })).toEqual({ kind: 'fallback', term: 'xqzzv' })
    expect(selectBanner({ searchTerm: '  ', isFallback: true, correction: null })).toBe(null)
    expect(selectBanner({ searchTerm: 'sintel', isFallback: false, correction: null })).toBe(null)
  })
})

describe('süzgeçler ve görsel', () => {
  it('varsayılanlar gönderilmez, sayım sıralamayı saymaz', () => {
    expect(filtersInput(DEFAULT_FILTERS)).toBeUndefined()
    const f = { ...DEFAULT_FILTERS, genreIds: [9, 3], kind: 'film' as const, sort: 'az' as const }
    expect(filtersInput(f)).toEqual({ genreIds: [3, 9], kind: 'film', sort: 'az' })
    expect(activeFilterCount(f)).toBe(3)
  })
  it('bağlamsal görsel yalnız dikeyse afiş hücresine konur', () => {
    const boxart = { key: 'b', type: 'BOXART', url: '/b', width: 368, height: 552 }
    const video = { boxart } as never
    expect(posterArtwork({ contextualArtwork: { ...boxart, url: '/c' }, video })).toBe('/c')
    expect(posterArtwork({ contextualArtwork: { key: 's', type: 'STORY_ART', url: '/s', width: 608, height: 342 }, video })).toBe('/b')
  })
})
