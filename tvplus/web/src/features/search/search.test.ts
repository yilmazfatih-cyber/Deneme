import { describe, expect, it } from 'vitest'
import {
  ALL_KINDS,
  buildDeclaration,
  declarationSignature,
  lookupTreatment,
  TREATMENT_NAMES,
  type EntityKindName,
} from './capabilities'
import { FeedbackLedger, playTctxOfHref } from './feedbackLedger'
import { foldText, highlightPrediction } from './highlight'
import { debounceFor, initialQueryState, isCurrent, queryReducer, type QueryState } from './queryState'
import {
  pageParts,
  posterArtwork,
  rankingSummary,
  relatedLinks,
  selectBanner,
  suggestedQueries,
  type SearchEntity,
  type SearchPageData,
  type SearchSection,
} from './searchModel'
import { normalizeTerm, searchCacheKey, termOfKey, TtlCache } from './ttlCache'

const choice = (kinds: readonly EntityKindName[], predicted = true) => ({ kinds: new Set(kinds), predicted })

describe('yetenek tablosu → bildirim → çizici', () => {
  const all = buildDeclaration(choice(ALL_KINDS))

  it('her bölüm yalnız çizebildiği biçimleri bildirir; tahmin bölümü ayrı bir yetenek', () => {
    expect(declarationSignature(all)).toBe(
      'searchLive:standardChannelTile+standardAiringRow|searchList:standardPersonChip+standardDestination|' +
        'searchGallery:standardBoxshot|searchPredicted:standardBoxshot',
    )
    expect(all.capabilitiesBySection.searchPredicted).toEqual({
      capabilitiesBySectionTreatment: {
        standard: { capabilitiesByEntityTreatment: { standardBoxshot: { canHandleEntityKinds: ['VIDEO'] } } },
      },
    })
  })

  it('tablodaki her biçim bildirimde yer alır; çizmediğimiz öneri listesi bildirilmez', () => {
    const declared = new Set(
      Object.values(all.capabilitiesBySection).flatMap((s) =>
        Object.keys(s!.capabilitiesBySectionTreatment.standard.capabilitiesByEntityTreatment),
      ),
    )
    expect([...declared].sort()).toEqual([...TREATMENT_NAMES].sort())
    expect(declared.has('standardSuggestion')).toBe(false)
  })

  it('tahmin kapalıyken searchPredicted bildirilmez ve önbellek imzası değişir', () => {
    const off = buildDeclaration(choice(ALL_KINDS, false))
    expect(off.capabilitiesBySection.searchPredicted).toBeUndefined()
    expect(declarationSignature(off)).not.toBe(declarationSignature(all))
    expect(lookupTreatment('SearchPredictedSection', 'standardBoxshot', off)).toBe(null)
    expect(lookupTreatment('SearchPredictedSection', 'standardBoxshot', all)).toBe('standardBoxshot')
  })

  it('bir tür kapanınca biçimi ve boş kalan bölüm bildirimden çıkar', () => {
    const onlyVideo = buildDeclaration(choice(['VIDEO']))
    expect(Object.keys(onlyVideo.capabilitiesBySection)).toEqual(['searchGallery', 'searchPredicted'])
    expect(JSON.stringify(onlyVideo).length).toBeLessThan(JSON.stringify(all).length)
  })

  it('çizici araması: bilinmeyen ya da bildirilmemiş biçim null', () => {
    expect(lookupTreatment('SearchLiveSection', 'standardChannelTile', all)).toBe('standardChannelTile')
    expect(lookupTreatment('SearchLiveSection', 'standardMatchCard', all)).toBe(null)
    expect(lookupTreatment('SearchGallerySection', 'standardChannelTile', all)).toBe(null)
    expect(lookupTreatment('SearchListSection', 'standardSuggestion', all)).toBe(null)
    expect(lookupTreatment('SearchListSection', 'toString', all)).toBe(null)
  })
})

describe('önbellek anahtarı ve TTL', () => {
  const base = { profile: 'P', filters: null, capabilities: 'sig' }

  it('ömrü içinde isabet, sonra ıska', () => {
    const c = new TtlCache<string>()
    const key = searchCacheKey({ ...base, term: 'sintel' })
    c.set(key, 'yanit', 61_000, 1_000)
    expect(c.get(key, 31_000)).toEqual({ value: 'yanit', expires: 61_000, ageMs: 30_000 })
    expect(c.get(key, 61_000)).toBe(null)
  })

  it('terim düzleştirilir; yetenek, profil, düzeltmesiz ve açıklama kipi ayrı girdi', () => {
    expect(normalizeTerm('  SİNTEL   ve  Işık ')).toBe('sintel ve ışık')
    expect(searchCacheKey({ ...base, term: 'Sintel ' })).toBe(searchCacheKey({ ...base, term: 'sintel' }))
    const a = searchCacheKey({ ...base, term: 'x' })
    const keys = [
      a,
      searchCacheKey({ ...base, term: 'x', capabilities: 'tahminsiz' }),
      searchCacheKey({ ...base, term: 'x', profile: 'Q' }),
      searchCacheKey({ ...base, term: 'x', exact: true }),
      searchCacheKey({ ...base, term: 'x', explain: true }),
    ]
    expect(new Set(keys).size).toBe(5)
    expect(searchCacheKey({ ...base, term: 'x', exact: false, explain: false })).toBe(a)
  })

  it('canlı bölümlü kısa ömürlü yanıt erken bayatlar', () => {
    const c = new TtlCache<string>()
    c.set('canli', 'a', 60_000, 0)
    c.set('katalog', 'b', 8 * 3600_000, 0)
    expect(c.get('canli', 61_000)).toBe(null)
    expect(c.get('katalog', 61_000)?.value).toBe('b')
  })

  it('anahtardan terim geri okunur (| içeren terim dahil); terime göre silme', () => {
    const k1 = searchCacheKey({ ...base, term: 'a|b' })
    const k2 = searchCacheKey({ ...base, term: 'dünya', explain: true })
    const k3 = searchCacheKey({ ...base, term: '' })
    expect(termOfKey(k1)).toBe('a|b')
    expect(termOfKey(k2)).toBe('dünya')
    expect(termOfKey(k3)).toBe('')
    const c = new TtlCache<number>()
    c.set(k1, 1, 1000, 0)
    c.set(k2, 2, 1000, 0)
    c.deleteWhere((k) => termOfKey(k) === 'dünya')
    expect(c.get(k2, 1)).toBe(null)
    expect(c.get(k1, 1)?.value).toBe(1)
  })
})

describe('sorgu durum makinesi', () => {
  const step = (s: QueryState<string>, ...as: Parameters<typeof queryReducer<string>>[1][]) =>
    as.reduce((acc, a) => queryReducer(acc, a), s)

  it('yazarken eski sonuç ekranda kalır; yalnız son isteğin yanıtı uygulanır', () => {
    let s = step(initialQueryState<string>(), { type: 'request', key: 'si', seq: 1 })
    s = step(s, { type: 'response', key: 'si', seq: 1, data: 'si-sonuç' })
    expect(s).toMatchObject({ data: 'si-sonuç', dataKey: 'si', loading: false })
    s = step(s, { type: 'request', key: 'sin', seq: 2 }, { type: 'request', key: 'sint', seq: 3 })
    expect(s).toMatchObject({ data: 'si-sonuç', dataKey: 'si', loading: true })
    // "sin" yanıtı "sint"ten sonra geldi: düşürülür
    s = step(s, { type: 'response', key: 'sin', seq: 2, data: 'sin-sonuç' })
    expect(s.data).toBe('si-sonuç')
    expect(isCurrent(s, 2, 'sin')).toBe(false)
    s = step(s, { type: 'response', key: 'sint', seq: 3, data: 'sint-sonuç' })
    expect(s).toMatchObject({ data: 'sint-sonuç', dataKey: 'sint', loading: false, fromCache: false })
  })

  it('önbellek isabeti bekleyen isteği geçersiz kılar; eski hata da düşer', () => {
    let s = step(initialQueryState<string>(), { type: 'request', key: 'a', seq: 1 })
    s = step(s, { type: 'cache', key: 'b', seq: 2, data: 'B' })
    expect(s).toMatchObject({ data: 'B', fromCache: true, loading: false })
    s = step(s, { type: 'response', key: 'a', seq: 1, data: 'A' }, { type: 'error', seq: 1, error: new Error('x') })
    expect(s).toMatchObject({ data: 'B', error: null })
  })

  it('gecikme: ilk açılışta ve boş terimde beklenmez', () => {
    expect(debounceFor(false, 'sin', 250)).toBe(0)
    expect(debounceFor(true, '  ', 250)).toBe(0)
    expect(debounceFor(true, 'sin', 250)).toBe(250)
  })
})

describe('tahmin vurgusu', () => {
  const view = (t: string, q: string) =>
    highlightPrediction(t, q)
      .map((p) => (p.typed ? `[${p.text}]` : p.text))
      .join('')

  it('ad başında ya da kelime başında, Türkçe duyarsız', () => {
    expect(view('Sintel', 'si')).toBe('[Si]ntel')
    expect(view('TV+ Sinema', 'si')).toBe('TV+ [Si]nema')
    expect(view('Sessiz Sinema', 'si')).toBe('Sessiz [Si]nema')
    expect(view('Dünya Kupası', 'dun')).toBe('[Dün]ya Kupası')
    expect(view('İstanbul', 'ist')).toBe('[İst]anbul')
    expect(view('Işıklar', 'isi')).toBe('[Işı]klar')
  })

  it('kelime ortası eşleşmez; eşleşme yoksa tamamı tahmin', () => {
    expect(view('Basit', 'si')).toBe('Basit')
    expect(highlightPrediction('Basit', 'si')).toEqual([{ text: 'Basit', typed: false }])
    expect(highlightPrediction('Sintel', '')).toEqual([{ text: 'Sintel', typed: false }])
  })

  it('düzleştirme konumları korur', () => {
    const s = 'Çiğdem Öğüt İ'
    expect(foldText(s).length).toBe(s.length)
    expect(foldText(s)).toBe('cigdem ogut i')
  })
})

describe('geri bildirim defteri', () => {
  const sec = (id: string, ids: string[]): SearchSection =>
    ({
      __typename: 'SearchGallerySection',
      id,
      displayString: id,
      expires: '',
      entities: ids.map((u, i) => ({ unifiedEntityId: u, track: { tctx: `0,${i},${id},1,,,,,,,${u},` } })),
    }) as unknown as SearchSection

  it('konum bölüm içi sıradır; tctx ile bulunur', () => {
    const l = new FeedbackLedger()
    l.registerPage('r1', 'dünya', [
      sec('galeri', ['Video:1', 'Video:2', 'Video:3', 'Video:4']),
      sec('ilgili', ['Video:9']),
    ])
    expect(l.find('r1', 'Video:4')).toMatchObject({ position: 3, sectionId: 'galeri', term: 'dünya' })
    expect(l.find('r1', 'Video:9')).toMatchObject({ position: 0, sectionId: 'ilgili' })
    expect(l.findByTctx('0,1,galeri,1,,,,,,,Video:2,')).toMatchObject({ entityId: 'Video:2', position: 1 })
    expect(l.find('r2', 'Video:4')).toBe(null)
  })

  it('aynı yanıtta aynı eylem bir kez; yeni yanıtta yeniden', () => {
    const l = new FeedbackLedger()
    const [first] = l.registerPage('r1', 'x', [sec('galeri', ['Video:1'])])
    expect(l.claim(first!, 'CLICK')).toBe(true)
    expect(l.claim(first!, 'CLICK')).toBe(false)
    expect(l.claim(first!, 'PLAY')).toBe(true)
    const [again] = l.registerPage('r2', 'x', [sec('galeri', ['Video:1'])])
    expect(l.claim(again!, 'CLICK')).toBe(true)
    // Yeni yanıt aynı tctx'i taşıyorsa en son gösterilen kazanır
    expect(l.findByTctx(again!.tctx)?.requestId).toBe('r2')
  })

  it('defter sınırlıdır', () => {
    const l = new FeedbackLedger(3)
    l.registerPage('r', 'x', [sec('g', ['A', 'B', 'C', 'D'])])
    expect(l.find('r', 'A')).toBe(null)
    expect(l.find('r', 'D')).not.toBe(null)
  })

  it('oynat bağlantısından tctx', () => {
    expect(playTctxOfHref('#/izle/Video:80010001?tctx=0%2C3%2Cgaleri')).toBe('0,3,galeri')
    expect(playTctxOfHref('/izle/Channel:5?tctx=a')).toBe('a')
    expect(playTctxOfHref('#/baslik/1?tctx=a')).toBe(null)
    expect(playTctxOfHref('#/izle/Video:1')).toBe(null)
  })
})

describe('sayfa seçicileri', () => {
  const ent = (p: Partial<SearchEntity>): SearchEntity =>
    ({
      unifiedEntityId: 'x',
      kind: 'VIDEO',
      displayString: '',
      treatment: 'standardBoxshot',
      fuzzy: false,
      predicted: false,
      score: null,
      reason: null,
      track: { row: 0, pos: 0, rowId: 'r', trackId: 1, entityId: 'x', tctx: 't' },
      contextualArtwork: null,
      video: null,
      channel: null,
      airing: null,
      person: null,
      collection: null,
      genre: null,
      ...p,
    }) as SearchEntity
  const page: SearchPageData = {
    searchTerm: 'sintel',
    requestId: 'r',
    trackId: 1,
    expires: '',
    isFallback: false,
    recentSearches: [],
    modelVersion: 'lr-1 · 6 güncelleme',
    correction: null,
    predictions: [
      { text: 'Sintel', kind: 'TITLE', unifiedEntityId: 'Video:1', score: 0.9 },
      { text: 'Sinematograf', kind: 'PERSON', unifiedEntityId: null, score: 0.5 },
      { text: 'sinematograf', kind: 'QUERY', unifiedEntityId: null, score: 0.4 },
    ],
    sections: [
      {
        __typename: 'SearchListSection',
        id: 'oneriler',
        displayString: '',
        expires: '',
        entities: [
          ent({ unifiedEntityId: 'Person:7', person: { personId: 7, name: 'Ton Roosendaal' } }),
          ent({ unifiedEntityId: 'Genre:3', genre: { genreId: 3, name: 'Animasyon' } }),
        ],
      },
      {
        __typename: 'SearchGallerySection',
        id: 'galeri',
        displayString: 'Film ve Diziler',
        expires: '',
        entities: [ent({ unifiedEntityId: 'Video:1', score: 0.8, explain: [] })],
      },
      {
        __typename: 'SearchPredictedSection',
        id: 'ilgili',
        displayString: 'Sintel ile ilgili',
        expires: '',
        entities: [ent({ unifiedEntityId: 'Video:2', predicted: true, score: 0.4, reason: 'Sintel ile ilgili' })],
      },
    ],
  }

  it('bölümler ve "Şunlarla ilgili" bağlantıları', () => {
    const p = pageParts(page)
    expect(p.gallery?.id).toBe('galeri')
    expect(p.predicted?.displayString).toBe('Sintel ile ilgili')
    expect(p.live).toBe(null)
    expect(relatedLinks(page).map((r) => [r.label, r.to])).toEqual([
      ['Ton Roosendaal', '/kisi/7?tctx=t'],
      ['Animasyon', '/tur/3?tctx=t'],
    ])
  })

  it('"Şunu mu arıyorsun": yazılanın kendisi ve tekrarlar atılır', () => {
    expect(suggestedQueries(page).map((p) => p.text)).toEqual(['Sinematograf'])
  })

  it('sıralama özeti (devbus predict)', () => {
    expect(rankingSummary(page)).toEqual({
      term: 'sintel',
      modelVersion: 'lr-1 · 6 güncelleme',
      top: [
        { id: 'Video:1', score: 0.8, explain: [] },
        { id: 'Video:2', score: 0.4, explain: null },
      ],
    })
  })

  it('düzeltme şeridi', () => {
    expect(
      selectBanner({
        searchTerm: 'sitnel',
        isFallback: false,
        correction: { mode: 'CORRECTED', originalTerm: 'sitnel', correctedTerm: 'sintel' },
      }),
    ).toEqual({ kind: 'corrected', corrected: 'sintel', original: 'sitnel' })
    expect(selectBanner({ searchTerm: 'xqzzv', isFallback: true, correction: null })).toEqual({
      kind: 'fallback',
      term: 'xqzzv',
    })
    expect(selectBanner({ searchTerm: ' ', isFallback: true, correction: null })).toBe(null)
  })

  it('afiş görseli: bağlamsal görsel yalnız dikeyse', () => {
    const boxart = { key: 'b', type: 'BOXART', url: '/b', width: 368, height: 552 }
    const video = { boxart } as never
    expect(posterArtwork({ contextualArtwork: { ...boxart, url: '/c' }, video })).toBe('/c')
    expect(
      posterArtwork({ contextualArtwork: { key: 's', type: 'STORY_ART', url: '/s', width: 608, height: 342 }, video }),
    ).toBe('/b')
  })
})
