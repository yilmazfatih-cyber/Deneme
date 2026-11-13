/**
 * Arama tahmin modeli testleri: öznitelikler, puanlama, çevrimiçi öğrenme (SGD + sayaçlar), kalıcılık,
 * tamamlamalar, tahmini bölüm kuralları, popularSearches kişiselleştirmesi ve gerçek GraphQL motoru üzerinden
 * recordSearchFeedback. Servisler sahte nesnelerdir; saat sabittir (NOW) → sonuçlar belirlenimcidir.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ContentTitle } from '../../shared/content-schema'
import { createGraphQLEngine, type PersistedRegistry } from '../src/graphql/engine'
import { searchResolvers } from '../src/graphql/resolvers/search'
import { loadConfig } from '../src/kernel/config'
import type { Passport, ProfileRecord } from '../src/kernel/context'
import type { AccessDecision, Services } from '../src/kernel/services'
import {
  popularSearchTitles,
  predictSearches,
  recordSearchFeedback,
  runSearch,
  type SearchFeedbackInput,
} from '../src/services/search/engine'
import { prefixMatch } from '../src/services/search/model/completions'
import {
  affinity,
  continueFeature,
  CTR_PRIOR_MEAN,
  FEATURE_NAMES,
  NEUTRAL,
  popularityFeature,
  queryKeys,
  recencyFeature,
  smoothedCtr,
  textFeature,
  type FeatureVector,
} from '../src/services/search/model/features'
import {
  BIAS_BOUNDS,
  initialModelState,
  modelVersionOf,
  predict,
  PRIOR_BIAS,
  PRIOR_WEIGHTS,
  sanitizeModelState,
  sgdStep,
  WEIGHT_BOUNDS,
} from '../src/services/search/model/model'
import { recallResponse, rememberResponse, RESPONSE_MEMO_SIZE, searchModel } from '../src/services/search/model/runtime'
import type { SearchPageResult, SearchSectionResult } from '../src/services/search/types'
import {
  AIRINGS,
  CHANNELS,
  COLLECTIONS,
  FULL_CAPS,
  kinds,
  NOW,
  OLD_CAPS,
  peopleOf,
  PREDICTED_CAPS,
  title,
  TITLES,
} from './search-fixtures'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCHEMA = readFileSync(join(ROOT, 'shared', 'graphql', 'schema.graphql'), 'utf8')

/* ───────────── Sahte servisler ───────────── */

/** Sintel'e benzeyen başlıklar ("Sintel ile ilgili" için) */
const EXTRA: ContentTitle[] = [
  title({
    videoId: 80010002,
    title: 'Elephants Dream',
    year: 2006,
    genres: ['animasyon', 'fantastik'],
    popularity: 50,
    availability: { addedAt: '2026-06-01' },
  }),
  title({
    videoId: 80010003,
    title: 'Spring',
    year: 2019,
    genres: ['animasyon', 'fantastik', 'dram'],
    popularity: 55,
    availability: { addedAt: '2026-10-01' },
  }),
]
const ALL = [...TITLES, ...EXTRA]

const profile = (guid: string, name: string, isKids = false): ProfileRecord => ({
  guid,
  accountId: 'A1',
  name,
  avatar: 'a.png',
  isKids,
  maturityLevel: isKids ? 40 : 110,
  language: 'tr',
})
const AYSE = profile('P-AYSE', 'Ayşe')
const MEHMET = profile('P-MEHMET', 'Mehmet')
const KID = profile('P-COCUK', 'Can', true)

const passportOf = (p: ProfileRecord | null): Passport => ({
  membershipStatus: 'CURRENT_MEMBER',
  account: { accountId: 'A1', planName: 'TV+ Temel', products: ['tvplus-temel'] },
  profile: p,
  esn: 'TVPWCH-MC-TEST',
  deviceId: 'cihaz',
  authURLVerified: true,
})

interface History {
  recent?: number[]
  myList?: number[]
  liked?: number[]
  disliked?: number[]
  inProgress?: number[]
  searches?: string[]
}

const access = (state: AccessDecision['state']): AccessDecision => ({
  state,
  reasonText: null,
  requiredProduct: null,
  requiredProductName: null,
  cta: null,
})

function makeServices(history: Record<string, History> = {}, plays = new Map<number, number>()): Services {
  const byId = new Map(ALL.map((t) => [t.videoId, t]))
  const h = (guid: string) => history[guid] ?? {}
  const services = {
    catalog: {
      allTitles: () => ALL,
      allCollections: () => COLLECTIONS,
      people: () => peopleOf(ALL),
      listChannels: () => CHANNELS,
      isVisibleTo: (p: ProfileRecord | null, id: number) => (p?.isKids ? (byId.get(id)?.kids ?? false) : true),
      getTitle: (id: number) => byId.get(id) ?? null,
      titleOf: (id: number) => byId.get(id) ?? null,
      collectionsOf: (id: number) => COLLECTIONS.filter((c) => c.videoIds.includes(id)),
    },
    epg: {
      airings: (channelId: number, from: Date, to: Date) =>
        AIRINGS.filter((a) => a.channelId === channelId && a.endAt > from && a.startAt < to),
    },
    entitlement: {
      accessForVideo: (_p: Passport, id: number) =>
        access(byId.get(id)?.availability.requiredProduct ? 'UPSELL' : 'PLAYABLE'),
    },
    events: { playCounts: () => plays },
    progress: {
      recentSearches: (guid: string) => h(guid).searches ?? [],
      recentTitles: (guid: string) => h(guid).recent ?? [],
      myList: (guid: string) => h(guid).myList ?? [],
      liked: (guid: string) => h(guid).liked ?? [],
      disliked: (guid: string) => h(guid).disliked ?? [],
      continueWatching: (guid: string) => (h(guid).inProgress ?? []).map((titleId) => ({ titleId, videoId: titleId })),
    },
  }
  // Sahte: yalnız aramanın kullandığı yöntemler var.
  return services as unknown as Services
}

const search = (s: Services, term: string, caps = PREDICTED_CAPS, p: ProfileRecord = AYSE) =>
  runSearch(s, passportOf(p), term, { pageCapabilities: caps }, NOW)
const sectionById = (page: SearchPageResult, id: string) => page.sections.find((s) => s.id === id)
const names = (s: SearchSectionResult | undefined) => (s ? s.entities.map((e) => e.displayString) : [])
const feedback = (s: Services, input: Partial<SearchFeedbackInput> & { unifiedEntityId: string }, p = AYSE) =>
  recordSearchFeedback(
    s,
    passportOf(p),
    { requestId: 'yok', searchTerm: '', position: 0, action: 'CLICK', ...input },
    NOW,
  )
const vec = (x: Partial<FeatureVector>): FeatureVector => ({ ...NEUTRAL, ...x })

/* ───────────── Öznitelikler ───────────── */

describe('öznitelikler (0–1)', () => {
  it('metin: eşleşme puanı / 100, sınırlı', () => {
    expect(textFeature(100)).toBe(1)
    expect(textFeature(85)).toBe(0.85)
    expect(textFeature(0)).toBe(0)
    expect(textFeature(250)).toBe(1)
  })
  it('sorgu anahtarları: sorgu (1) + 2–4 harflik önekleri (0.5); boş sorgu genel anahtar', () => {
    expect(queryKeys('Sintel')).toEqual([
      { key: 'sintel', weight: 1 },
      { key: 'si', weight: 0.5 },
      { key: 'sin', weight: 0.5 },
      { key: 'sint', weight: 0.5 },
    ])
    expect(queryKeys('Şa')).toEqual([{ key: 'sa', weight: 1 }])
    expect(queryKeys('  ')).toEqual([{ key: '', weight: 1 }])
  })
  it('tiklanma: görülmemiş çift tam ön ortalama (nötr); olumlu tepkiyle artar, olumsuzla azalır', () => {
    const keys = queryKeys('sintel')
    expect(smoothedCtr({}, keys, 'Video:1')).toBeCloseTo(CTR_PRIOR_MEAN, 10)
    const up = smoothedCtr({ sintel: { 'Video:1': [3, 0] } }, keys, 'Video:1')
    const down = smoothedCtr({ sintel: { 'Video:1': [0, 3] } }, keys, 'Video:1')
    expect(up).toBeGreaterThan(CTR_PRIOR_MEAN)
    expect(down).toBeLessThan(CTR_PRIOR_MEAN)
    // Önek sayacı yarım ağırlıkla sayılır
    const viaPrefix = smoothedCtr({ si: { 'Video:1': [3, 0] } }, keys, 'Video:1')
    expect(viaPrefix).toBeGreaterThan(CTR_PRIOR_MEAN)
    expect(viaPrefix).toBeLessThan(up)
    // Genel anahtarın ön gücü daha büyük: aynı sayılar daha az kaydırır
    expect(smoothedCtr({ '': { 'Video:1': [3, 0] } }, queryKeys(''), 'Video:1')).toBeLessThan(
      smoothedCtr({ x: { 'Video:1': [3, 0] } }, queryKeys('x'), 'Video:1'),
    )
  })
  it('populerlik: katalog + son 24 saat oynatma', () => {
    expect(popularityFeature(80, 0, 0)).toBeCloseTo(0.8)
    expect(popularityFeature(80, 10, 10)).toBeCloseTo(0.7 * 0.8 + 0.3)
    expect(popularityFeature(80, 0, 10)).toBeCloseTo(0.7 * 0.8)
  })
  it('yenilik: e^(−gün/90)', () => {
    expect(recencyFeature('2026-11-13', NOW)).toBeCloseTo(1, 1)
    expect(recencyFeature('2026-08-15', NOW)).toBeCloseTo(Math.exp(-(90.5 / 90)), 2)
    expect(recencyFeature('2030-01-01', NOW)).toBe(1)
    expect(recencyFeature('bozuk', NOW)).toBe(0)
  })
  it('begeni: kosinüs, negatif 0; devam: yarım 1 · Listem 0.5', () => {
    const f = new Map([
      ['g:dram', 2],
      ['g:suc', 2],
    ])
    expect(affinity(new Map([['g:dram', 1]]), 1, f)).toBeCloseTo(Math.SQRT1_2)
    expect(affinity(new Map([['g:dram', -1]]), 1, f)).toBe(0)
    expect(affinity(new Map(), 0, f)).toBe(0)
    expect([continueFeature(true, true), continueFeature(false, true), continueFeature(false, false)]).toEqual([
      1, 0.5, 0,
    ])
  })
})

/* ───────────── Puanlama ───────────── */

describe('puanlama', () => {
  it('olasılık 0–1, belirlenimci; ön ağırlıklarda metin baskın', () => {
    const s = initialModelState()
    const x = vec({ metin: 0.85, populerlik: 0.5 })
    expect(predict(s, x)).toBe(predict(s, x))
    expect(predict(s, x)).toBeGreaterThan(0)
    expect(predict(s, x)).toBeLessThan(1)
    // Tam eşleşen ama hiç popüler olmayan başlık, eşleşmeyen ama en popüler / en beğenilen başlıktan önde
    expect(predict(s, vec({ metin: 1 }))).toBeGreaterThan(predict(s, vec({ populerlik: 1, begeni: 1, yenilik: 1 })))
  })
  it('tekdüzelik: diğerleri eşitken metin puanı yüksek olan asla aşağıda kalmaz (her öğrenilmiş durumda)', () => {
    const s = initialModelState()
    const others = [vec({}), vec({ begeni: 1, populerlik: 1, tiklanma: 1, yenilik: 1, devam: 1 }), vec({ begeni: 0.3 })]
    // Ağırlıkları hırpalayan bir eğitim: metin yüksek öğelerde hep DISMISS
    for (let i = 0; i < 300; i++) sgdStep(s, vec({ metin: 1, populerlik: 0.2 }), 0, 1)
    expect(s.weights.metin).toBeGreaterThanOrEqual(WEIGHT_BOUNDS.metin[0])
    for (const o of others) {
      let prev = -1
      for (const m of [0, 0.25, 0.56, 0.62, 0.85, 1]) {
        const p = predict(s, { ...o, metin: m })
        expect(p).toBeGreaterThan(prev)
        prev = p
      }
    }
  })
  it('modelVersion güncelleme sayısını taşır', () => {
    expect(modelVersionOf({ updates: 42 })).toBe('lr-1 · 42 güncelleme')
  })
})

/* ───────────── Öğrenme ───────────── */

describe('çevrimiçi öğrenme', () => {
  it('L2 ön değere çeker; kırpma ağırlıkları sınırda tutar', () => {
    const s = initialModelState()
    s.weights.begeni = 3.5
    s.bias = -2
    // x = 0: yalnız L2 ve bias gradyanı → begeni ön değere yaklaşır
    for (let i = 0; i < 50; i++) sgdStep(s, vec({ tiklanma: 0 }), 0, 1)
    expect(s.weights.begeni).toBeLessThan(3.5)
    expect(s.weights.begeni).toBeGreaterThan(PRIOR_WEIGHTS.begeni)
    // Aşırı eğitim: binlerce olumlu adım bile sınırları aşamaz
    const t = initialModelState()
    const ones = vec({ metin: 1, begeni: 1, populerlik: 1, tiklanma: 1, yenilik: 1, devam: 1 })
    for (let i = 0; i < 5000; i++) sgdStep(t, ones, 1, 1.5)
    for (const f of FEATURE_NAMES) {
      expect(t.weights[f]).toBeGreaterThanOrEqual(WEIGHT_BOUNDS[f][0])
      expect(t.weights[f]).toBeLessThanOrEqual(WEIGHT_BOUNDS[f][1])
    }
    expect(t.bias).toBeLessThanOrEqual(BIAS_BOUNDS[1])
    for (let i = 0; i < 5000; i++) sgdStep(t, ones, 0, 1)
    for (const f of FEATURE_NAMES) expect(t.weights[f]).toBeGreaterThanOrEqual(WEIGHT_BOUNDS[f][0])
    expect(t.bias).toBeGreaterThanOrEqual(BIAS_BOUNDS[0])
  })

  it('bir avuç tıklama: başlığın bu sorgu ve önekleri için puanı artar, sıra döner', () => {
    const s = makeServices()
    // "dram": Şahsiyet, Bir Başkadır, Kara Sevda tür alanından eşit metin puanıyla eşleşir; popülerlik sıralar.
    const before = search(s, 'dram')
    const gallery = names(sectionById(before, 'galeri'))
    expect(gallery[0]).toBe('Şahsiyet')
    const target = sectionById(before, 'galeri')?.entities.find((e) => e.displayString === 'Kara Sevda')
    if (!target) throw new Error('Kara Sevda yok')
    const p0 = target.modelScore ?? 0
    const pos0 = target.track.pos
    expect(pos0).toBeGreaterThan(0)

    for (let i = 0; i < 6; i++) {
      const page = search(s, 'dram')
      const g = sectionById(page, 'galeri')
      const pos = g?.entities.findIndex((e) => e.unifiedEntityId === target.unifiedEntityId) ?? -1
      feedback(s, {
        requestId: page.requestId,
        searchTerm: 'dram',
        unifiedEntityId: target.unifiedEntityId,
        position: pos,
      })
    }
    const after = search(s, 'dram')
    expect(after.modelVersion).toBe('lr-1 · 6 güncelleme')
    const t2 = sectionById(after, 'galeri')?.entities.find((e) => e.unifiedEntityId === target.unifiedEntityId)
    expect(t2?.track.pos).toBe(0)
    expect(t2?.modelScore ?? 0).toBeGreaterThan(p0)
    expect(t2?.explain?.find((f) => f.name === 'tiklanma')?.value).toBeGreaterThan(0.5)
    // Öneklerde de: "dr" ile tamamlamada ve "dra" sorgusunun galerisinde öne geçer
    const tik = (page: SearchPageResult) =>
      sectionById(page, 'galeri')
        ?.entities.find((e) => e.unifiedEntityId === target.unifiedEntityId)
        ?.explain?.find((f) => f.name === 'tiklanma')?.value ?? 0
    expect(tik(search(s, 'dra'))).toBeGreaterThan(CTR_PRIOR_MEAN)
    // Başka bir profil için de (sayaçlar küresel) — ve sorguyla ilgisiz bir sorguda nötr
    expect(tik(search(s, 'dram', PREDICTED_CAPS, MEHMET))).toBeGreaterThan(0.5)
    expect(tik(search(s, 'kara'))).toBeCloseTo(CTR_PRIOR_MEAN, 5)
  })

  it('zayıf olumsuzlar: aynı bölümde tıklananın üstünde gösterilenler; DISMISS olumsuz', () => {
    const s = makeServices()
    const page = search(s, 'dram')
    const g = sectionById(page, 'galeri')
    const third = g?.entities[2]
    if (!third) throw new Error('üçüncü yok')
    feedback(s, { requestId: page.requestId, searchTerm: 'dram', unifiedEntityId: third.unifiedEntityId, position: 2 })
    const pairs = searchModel(s).store.get().pairs
    const above = g?.entities.slice(0, 2).map((e) => e.unifiedEntityId) ?? []
    for (const id of above) expect(pairs.dram?.[id]).toEqual([0, 0.3])
    expect(pairs.dram?.[third.unifiedEntityId]).toEqual([1, 0])
    expect(pairs['']?.[third.unifiedEntityId]?.[0]).toBe(1) // genel sayaç
    expect(pairs.dr?.[third.unifiedEntityId]?.[0]).toBe(1) // önek sayacı
    // Aşağıdakiler etkilenmez
    for (const e of g?.entities.slice(3) ?? []) expect(pairs.dram?.[e.unifiedEntityId]).toBeUndefined()
    const again = search(s, 'dram')
    const dismissed = above[0] ?? ''
    feedback(s, { requestId: again.requestId, searchTerm: 'dram', unifiedEntityId: dismissed, action: 'DISMISS' })
    expect(pairs.dram?.[dismissed]).toEqual([0, 1.3])
    // DISMISS zayıf olumsuz üretmez: diğerleri değişmez
    expect(pairs.dram?.[third.unifiedEntityId]).toEqual([1, 0])
    // DISMISS sorguyu tamamlamalara eklemez; olumlu tepki ekler
    expect(Object.keys(searchModel(s).store.get().queries)).toEqual(['dram'])
  })

  it('bilinmeyen requestId: olumlu tepki yine kaydedilir, öznitelikler yeniden hesaplanır', () => {
    const s = makeServices()
    const w0 = { ...searchModel(s).store.get().weights }
    expect(
      feedback(s, { requestId: 'hic-yok', searchTerm: 'sahil', unifiedEntityId: 'Video:80030003', action: 'PLAY' }),
    ).toBe(true)
    const st = searchModel(s).store.get()
    expect(st.updates).toBe(1)
    expect(st.pairs.sahil?.['Video:80030003']).toEqual([1.5, 0])
    expect(st.weights).not.toEqual(w0) // SGD adımı atıldı
    expect(st.queries.sahil?.text).toBe('sahil')
  })

  it('yanıt belleği: en çok 200 yanıt, 30 dakika', () => {
    const rt = searchModel(makeServices())
    for (let i = 0; i < RESPONSE_MEMO_SIZE + 20; i++)
      rememberResponse(rt, `r${i}`, { term: 'x', at: NOW.getTime(), entities: [] })
    expect(rt.responses.size).toBe(RESPONSE_MEMO_SIZE)
    expect(recallResponse(rt, 'r0', NOW.getTime())).toBeNull()
    expect(recallResponse(rt, `r${RESPONSE_MEMO_SIZE + 19}`, NOW.getTime())).not.toBeNull()
    expect(recallResponse(rt, `r${RESPONSE_MEMO_SIZE + 19}`, NOW.getTime() + 31 * 60_000)).toBeNull()
  })
})

/* ───────────── Kalıcılık ───────────── */

describe('kalıcılık (createStore search-model)', () => {
  it('ağırlıklar, sayaçlar, sorgular ve güncelleme sayısı diske yazılır ve geri okunur', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-model-'))
    const config = loadConfig({ dataDir, secret: 'test-secret', isTest: false, offline: true })
    const a = makeServices()
    const rt = searchModel(a, config)
    const page = search(a, 'dram')
    const id = sectionById(page, 'galeri')?.entities[1]?.unifiedEntityId ?? ''
    for (let i = 0; i < 3; i++)
      recordSearchFeedback(
        a,
        passportOf(AYSE),
        { requestId: page.requestId, searchTerm: 'dram', unifiedEntityId: id, position: 1, action: 'CLICK' },
        NOW,
        config,
      )
    rt.store.flush()
    const saved = rt.store.get()
    const b = makeServices()
    const loaded = searchModel(b, config).store.get()
    expect(loaded).toEqual(JSON.parse(JSON.stringify(saved)))
    expect(loaded.updates).toBe(3)
    expect(search(b, 'dram').modelVersion).toBe('lr-1 · 3 güncelleme')
    expect(names(sectionById(search(b, 'dram'), 'galeri'))).toEqual(names(sectionById(search(a, 'dram'), 'galeri')))
  })
  it('bozuk dosya: ön değerlere döner, sınır dışı ağırlıklar kırpılır', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-model-'))
    writeFileSync(
      join(dataDir, 'search-model.json'),
      JSON.stringify({ weights: { metin: 999, begeni: 'x' }, bias: null, pairs: 5 }),
    )
    const config = loadConfig({ dataDir, secret: 'test-secret', isTest: true, offline: true })
    const st = searchModel(makeServices(), config).store.get()
    expect(st.weights.metin).toBe(WEIGHT_BOUNDS.metin[1])
    expect(st.weights.begeni).toBe(PRIOR_WEIGHTS.begeni)
    expect(st.bias).toBe(PRIOR_BIAS)
    expect(st.pairs).toEqual({})
    expect(sanitizeModelState(null)).toEqual(initialModelState())
  })
})

/* ───────────── Tamamlamalar ───────────── */

describe('tamamlamalar (searchPredictions)', () => {
  const texts = (r: { text: string }[]) => r.map((x) => x.text)
  it('önek eşleşme ölçeği: tam 100 · önek 85 · kelime başı 60', () => {
    expect(prefixMatch('Şahsiyet', 'sahsiyet')).toBe(100)
    expect(prefixMatch('Şahsiyet', 'sah')).toBe(85)
    expect(prefixMatch('Bir Başkadır', 'bask')).toBe(60)
    expect(prefixMatch('Bir Başkadır', 'ask')).toBe(0)
  })
  it('önek, kelime başı ve Türkçe düzleştirme; tür, koleksiyon, kanal, kişi adayları; en iyi önce', () => {
    const s = makeServices()
    for (const q of ['şah', 'SAH', 'Şah']) {
      const r = predictSearches(s, passportOf(AYSE), q, 8, NOW)
      expect(r[0]).toMatchObject({ text: 'Şahsiyet', kind: 'TITLE', unifiedEntityId: 'Video:80030001' })
    }
    expect(texts(predictSearches(s, passportOf(AYSE), 'baska', 8, NOW))).toContain('Bir Başkadır')
    const k = predictSearches(s, passportOf(AYSE), 'k', 20, NOW)
    expect(k.map((x) => x.kind)).toEqual(expect.arrayContaining(['TITLE', 'CHANNEL']))
    expect(texts(predictSearches(s, passportOf(AYSE), 'yerli', 8, NOW))).toEqual(
      expect.arrayContaining(['Yerli Yapımlar', 'Yerli Diziler Seçkisi']),
    )
    expect(predictSearches(s, passportOf(AYSE), 'hal', 8, NOW)[0]).toMatchObject({
      kind: 'PERSON',
      text: 'Haluk Bilginer',
    })
    const r = predictSearches(s, passportOf(AYSE), 'k', 20, NOW)
    for (let i = 1; i < r.length; i++) expect(r[i - 1]?.score ?? 0).toBeGreaterThanOrEqual(r[i]?.score ?? 0)
    expect(predictSearches(s, passportOf(AYSE), 'k', 2, NOW)).toHaveLength(2)
    expect(predictSearches(s, passportOf(AYSE), 'qwxz', 8, NOW)).toEqual([])
  })
  it('tıklamadan sonra öğrenilen sorgu ve başlık öneğe göre öne çıkar', () => {
    const s = makeServices()
    const before = predictSearches(s, passportOf(AYSE), 'ka', 8, NOW)
    expect(texts(before)[0]).toBe('Kara Sevda') // başlık popülerliği (75) kanalınkinden yüksek
    const kanal0 = before.find((x) => x.text === 'Kanal D')?.score ?? 0
    for (let i = 0; i < 6; i++) feedback(s, { searchTerm: 'kanal d', unifiedEntityId: 'Channel:1' })
    const after = predictSearches(s, passportOf(AYSE), 'ka', 8, NOW)
    expect(texts(after)[0]).toBe('Kanal D')
    expect(after[0]?.score).toBeGreaterThan(kanal0)
    expect(after[0]?.kind).toBe('CHANNEL') // aynı metinli öğrenilmiş sorgu ile tekilleşti, varlıklı sürüm kaldı
    expect(texts(after).filter((t) => t.toLowerCase() === 'kanal d')).toHaveLength(1)
    // Varlıktan farklı metinli sorgu QUERY olarak gelir
    for (let i = 0; i < 4; i++) feedback(s, { searchTerm: 'kurtlar vadisi pusu', unifiedEntityId: 'Video:80030004' })
    expect(predictSearches(s, passportOf(AYSE), 'kurtlar', 8, NOW)).toContainEqual(
      expect.objectContaining({ text: 'kurtlar vadisi pusu', kind: 'QUERY', unifiedEntityId: null }),
    )
  })
  it('çocuk profili: yalnız görebildikleri; yetişkin başlığına giden öğrenilmiş sorgu da gizli', () => {
    const s = makeServices()
    for (let i = 0; i < 3; i++) feedback(s, { searchTerm: 'pepee sahsiyet', unifiedEntityId: 'Video:80030001' })
    const kid = passportOf(KID)
    expect(predictSearches(s, kid, 'şah', 8, NOW)).toEqual([])
    expect(predictSearches(s, kid, 'pe', 8, NOW).map((x) => x.text)).toEqual(['Pepee'])
    expect(predictSearches(s, kid, 'trt', 8, NOW).map((x) => x.text)).toEqual(['TRT Çocuk'])
    expect(predictSearches(s, passportOf(AYSE), 'pep', 8, NOW).map((x) => x.text)).toContain('pepee sahsiyet')
  })
  it('boş önek: son aramalar, yarım kalanlar, sonra en olasılar', () => {
    const s = makeServices({ [AYSE.guid]: { searches: ['kanal d', 'sintel'], inProgress: [80030003] } })
    const r = predictSearches(s, passportOf(AYSE), '', 5, NOW)
    expect(r.slice(0, 2).map((x) => [x.text, x.kind])).toEqual([
      ['kanal d', 'QUERY'],
      ['Sintel', 'TITLE'], // aynı metinli başlıkla tekilleşti
    ])
    expect(r[2]?.text).toBe('Sahil') // yarım kalan
    expect(r).toHaveLength(5)
  })
  it('arama sayfası da tamamlamaları taşır', () => {
    const p = search(makeServices(), 'masterc')
    expect(p.predictions[0]).toMatchObject({ text: 'MasterChef Türkiye', kind: 'TITLE' })
  })
})

/* ───────────── Tahmini bölüm ───────────── */

describe('tahmini bölüm (SearchPredictedSection)', () => {
  it('yetenek bildirilmemişse bölüm yok; eski istemci eski bölümleri alır', () => {
    const s = makeServices()
    for (const term of ['sintel', 'istanbul', 'qwxzk', '']) {
      const full = search(s, term, FULL_CAPS)
      expect(
        full.sections.some((x) => x.sectionType === 'SearchPredictedSection'),
        term,
      ).toBe(false)
      expect(full.sections.flatMap((x) => x.entities).every((e) => !e.predicted)).toBe(true)
    }
    const old = search(s, 'sahsiyet', OLD_CAPS)
    expect(old.sections.map((x) => x.sectionType)).toEqual(['SearchGallerySection'])
    expect(search(s, 'qwxzk', OLD_CAPS).sections.map((x) => x.id)).toEqual(['populer'])
  })
  it('çizim biçimi pazarlığı: yalnız standardSuggestion bildiren istemciye o biçim; hiçbiri yoksa bölüm yok', () => {
    const s = makeServices()
    const suggestionOnly = {
      capabilitiesBySection: {
        ...FULL_CAPS.capabilitiesBySection,
        searchPredicted: {
          capabilitiesBySectionTreatment: {
            standard: { capabilitiesByEntityTreatment: { standardSuggestion: kinds('VIDEO') } },
          },
        },
      },
    }
    const p = search(s, 'istanbul', suggestionOnly)
    const sec = p.sections.find((x) => x.sectionType === 'SearchPredictedSection')
    expect(sec?.entities.every((e) => e.treatment === 'standardSuggestion' && e.artworkType === 'STORY_ART')).toBe(true)
    const wrongKind = {
      capabilitiesBySection: {
        ...FULL_CAPS.capabilitiesBySection,
        searchPredicted: {
          capabilitiesBySectionTreatment: {
            standard: { capabilitiesByEntityTreatment: { standardBoxshot: kinds('CHANNEL') } },
          },
        },
      },
    }
    expect(search(s, 'istanbul', wrongKind).sections.some((x) => x.sectionType === 'SearchPredictedSection')).toBe(
      false,
    )
  })
  it('açık başlık: "Sintel ile ilgili" — benzer başlıklar, gerekçe, puan, açıklama; doğrudan eşleşme tekrar edilmez', () => {
    const p = search(makeServices(), 'sintel')
    const g = sectionById(p, 'galeri')
    expect(names(g)).toEqual(['Sintel'])
    expect(g?.entities[0]?.predicted).toBe(false)
    expect(g?.entities[0]?.explain?.map((f) => f.name)).toEqual([...FEATURE_NAMES])
    const rel = sectionById(p, 'ilgili')
    expect(rel?.sectionType).toBe('SearchPredictedSection')
    expect(rel?.displayString).toBe('Sintel ile ilgili')
    expect(names(rel).slice(0, 2).sort()).toEqual(['Elephants Dream', 'Spring'])
    expect(names(rel)).not.toContain('Sintel')
    for (const e of rel?.entities ?? []) {
      expect(e.predicted).toBe(true)
      expect(e.reason).toBe('Sintel ile ilgili')
      expect(e.modelScore).toBeGreaterThan(0)
      expect(e.explain?.find((f) => f.name === 'metin')?.value).toBe(0)
      for (const f of e.explain ?? []) expect(f.contribution).toBeCloseTo(f.weight * f.value, 3)
    }
    // Bölüm sırası: galeriden sonra; izler (tctx) son sıraya göre
    expect(p.sections.at(-1)?.id).toBe('ilgili')
    expect(rel?.entities[0]?.track.row).toBe(p.sections.length - 1)
  })
  it('az sonuç (açık konu yok): "Bunlar ilgini çekebilir", doğrudan eşleşmeler hariç', () => {
    const p = search(makeServices(), 'istanbul') // yalnız anahtar kelimeyle Bir Başkadır
    expect(names(sectionById(p, 'galeri'))).toEqual(['Bir Başkadır'])
    const pred = sectionById(p, 'tahmin')
    expect(pred?.displayString).toBe('Bunlar ilgini çekebilir')
    expect(names(pred)).not.toContain('Bir Başkadır')
    expect(names(pred).length).toBeGreaterThan(3)
    for (const e of pred?.entities ?? [])
      expect(['Sana özel', 'Çok arananlar', 'Bu aramadan sonra izlenenler']).toContain(e.reason)
    // Çok sonuçlu sorguda tahmini bölüm yok
    const many = search(makeServices(), 'a')
    expect((sectionById(many, 'galeri')?.totalCount ?? 0) >= 6).toBe(true)
    expect(many.sections.some((x) => x.sectionType === 'SearchPredictedSection')).toBe(false)
  })
  it('eşleşme yok: yedek sayfada "Popüler" yerine modelin tahminleri; boş kutuda "Sana özel öneriler"', () => {
    const s = makeServices({ [AYSE.guid]: { liked: [80030004] } })
    const p = search(s, 'qwxzk')
    expect(p.isFallback).toBe(true)
    expect(p.sections.map((x) => x.id)).toEqual(['canli', 'tahmin'])
    const empty = search(s, '')
    expect(empty.sections.map((x) => x.id)).toEqual(['canli', 'sana-ozel'])
    expect(sectionById(empty, 'sana-ozel')?.displayString).toBe('Sana özel öneriler')
    // Beğenilen Kurtlar Vadisi'ne benzeyen (aksiyon, yerli) öne çıkar; gerekçe "Sana özel"
    const top = sectionById(empty, 'sana-ozel')?.entities[0]
    expect(top?.reason).toBe('Sana özel')
  })
  it('çocuk profili: tahminlerde yalnız görebildikleri', () => {
    const p = search(makeServices(), 'qwxzk', PREDICTED_CAPS, KID)
    expect(names(sectionById(p, 'tahmin'))).toEqual(['Pepee'])
  })
  it('beğenilmeyen başlık tahmin edilmez', () => {
    const s = makeServices({ [AYSE.guid]: { disliked: [80030005] } })
    expect(names(sectionById(search(s, 'istanbul'), 'tahmin'))).not.toContain('Bir Başkadır')
    expect(names(sectionById(search(s, ''), 'sana-ozel'))).not.toContain('Bir Başkadır')
  })
})

/* ───────────── Galeri ───────────── */

describe('galeri sıralaması', () => {
  it('"Sana özel" gerekçesi yalnız begeni en büyük katkıyı verdiğinde', () => {
    const s = makeServices({ [AYSE.guid]: { liked: [80030008], recent: [80030008] } })
    const g = sectionById(search(s, 'dram'), 'galeri')
    const kara = g?.entities.find((e) => e.displayString === 'Kara Sevda')
    expect(kara?.reason).toBe('Sana özel')
    expect(g?.entities[0]?.displayString).toBe('Kara Sevda') // zevk sıralamayı değiştirdi
    const plain = sectionById(search(makeServices(), 'dram'), 'galeri')
    expect(plain?.entities.every((e) => e.reason === null)).toBe(true)
  })
  it('metin hâlâ en çok sayar: tam ad eşleşmesi, kişiselleştirilmiş tür eşleşmesinin önünde', () => {
    const s = makeServices({ [AYSE.guid]: { liked: [80030008, 80030005], inProgress: [80030005] } })
    expect(names(sectionById(search(s, 'sahsiyet'), 'galeri'))[0]).toBe('Şahsiyet')
  })
  it('sıralama süzgeci (yeni/a-z) açıkça seçilmişse model sırayı değiştirmez ama puanı taşır', () => {
    const s = makeServices({ [AYSE.guid]: { liked: [80030008] } })
    const p = runSearch(s, passportOf(AYSE), 'dram', { pageCapabilities: PREDICTED_CAPS, filters: { sort: 'az' } }, NOW)
    const g = sectionById(p, 'galeri')
    const az = names(g)
    expect(az).toEqual([...az].sort((a, b) => a.localeCompare(b, 'tr')))
    expect(az.length).toBeGreaterThan(2)
    expect(g?.entities.every((e) => e.modelScore !== null)).toBe(true)
  })
})

/* ───────────── popularSearches ───────────── */

describe('popularSearches (Sana özel öneriler)', () => {
  it('farklı geçmişli iki profil farklı sıra alır; çocuk profili süzülür; beğenilmeyen yok', () => {
    const s = makeServices({
      [AYSE.guid]: { recent: [80030004], liked: [80030004] }, // aksiyon/yerli
      [MEHMET.guid]: { recent: [80010001], inProgress: [80010002] }, // animasyon/fantastik
    })
    const a = popularSearchTitles(s, passportOf(AYSE), 5, NOW)
    const m = popularSearchTitles(s, passportOf(MEHMET), 5, NOW)
    expect(a).not.toEqual(m)
    expect(m[0]).toBe(80010002) // yarım kalan
    expect(m.slice(0, 3)).toEqual(expect.arrayContaining([80010003]))
    expect(a.indexOf(80030004)).toBeLessThan(a.indexOf(80010003) === -1 ? 99 : a.indexOf(80010003))
    expect(popularSearchTitles(s, passportOf(KID), 10, NOW)).toEqual([80030007])
    const d = makeServices({ [AYSE.guid]: { disliked: [80030001] } })
    expect(popularSearchTitles(d, passportOf(AYSE), 50, NOW)).not.toContain(80030001)
    expect(popularSearchTitles(d, passportOf(AYSE), 3, NOW)).toHaveLength(3)
  })
  it('son 24 saat oynatmaları popülerliği yükseltir', () => {
    const quiet = popularSearchTitles(makeServices(), passportOf(AYSE), 20, NOW)
    const busy = popularSearchTitles(makeServices({}, new Map([[80030003, 50]])), passportOf(AYSE), 20, NOW)
    expect(busy.indexOf(80030003)).toBeLessThan(quiet.indexOf(80030003))
  })
})

/* ───────────── Gerçek GraphQL motoru ───────────── */

const DOC_PAGE = `query T($searchTerm: String!, $options: SearchOptionsInput!) {
  searchPage(searchTerm: $searchTerm, options: $options) {
    requestId modelVersion isFallback
    predictions { text kind unifiedEntityId score }
    sections {
      __typename id displayString
      entities {
        unifiedEntityId kind displayString treatment fuzzy predicted score reason
        explain { name value weight contribution }
        video { videoId }
        track { pos }
      }
    }
  }
}`
const DOC_OLD = `query O($searchTerm: String!, $options: SearchOptionsInput!) {
  searchPage(searchTerm: $searchTerm, options: $options) {
    sections { __typename id entities { unifiedEntityId kind treatment fuzzy video { videoId } } }
  }
}`
const DOC_PRED = `query P($prefix: String!, $first: Int) { searchPredictions(prefix: $prefix, first: $first) { text kind unifiedEntityId score } }`
const DOC_POP = `query Q($first: Int) { popularSearches(first: $first) { videoId } }`
const DOC_FEEDBACK = `mutation F($requestId: ID!, $searchTerm: String!, $unifiedEntityId: ID!, $position: Int!, $action: SearchFeedbackAction!) {
  recordSearchFeedback(requestId: $requestId, searchTerm: $searchTerm, unifiedEntityId: $unifiedEntityId, position: $position, action: $action)
}`

interface GEntity {
  unifiedEntityId: string
  displayString: string
  predicted: boolean
  score: number | null
  reason: string | null
  explain: { name: string; value: number; weight: number; contribution: number }[] | null
  video: { videoId: number } | null
  track: { pos: number }
}
interface GSection {
  __typename: string
  id: string
  displayString: string
  entities: GEntity[]
}
interface GPage {
  requestId: string
  modelVersion: string
  isFallback: boolean
  predictions: { text: string; kind: string; unifiedEntityId: string | null; score: number }[]
  sections: GSection[]
}

describe('GraphQL motoru (ad hoc belgeler, gerçek şema)', () => {
  const registry: PersistedRegistry = {
    version: 1,
    operations: {
      page: { name: 'T', type: 'query', document: DOC_PAGE },
      old: { name: 'O', type: 'query', document: DOC_OLD },
      pred: { name: 'P', type: 'query', document: DOC_PRED },
      pop: { name: 'Q', type: 'query', document: DOC_POP },
      fb: { name: 'F', type: 'mutation', document: DOC_FEEDBACK },
    },
  }
  const showIds = new Set(ALL.filter((t) => t.type === 'SHOW').map((t) => t.videoId))
  const engine = createGraphQLEngine({
    typeDefs: SCHEMA,
    resolvers: {
      ...searchResolvers,
      Video: { __resolveType: (p) => (showIds.has((p as { videoId: number }).videoId) ? 'Show' : 'Movie') },
    },
    persisted: registry,
  })
  const config = loadConfig({
    dataDir: mkdtempSync(join(tmpdir(), 'tvplus-arama-model-')),
    secret: 'test-secret',
    isTest: true,
    offline: true,
  })
  const services = makeServices({ [AYSE.guid]: { liked: [80010002] } })

  async function exec(id: string, name: string, variables: unknown, p: ProfileRecord | null = AYSE, authURL = true) {
    const passport = { ...passportOf(p), authURLVerified: authURL }
    return engine.handle({
      body: { operationName: name, variables, extensions: { persistedQuery: { id, version: 1 } } },
      passport,
      makeContext: () => ({
        req: {} as never,
        passport,
        trace: { traceId: 't', spanId: 's', parentSpanId: null },
        services,
        config,
        cache: new Map(),
      }),
    })
  }
  const page = async (term: string, caps = PREDICTED_CAPS) => {
    const r = await exec('page', 'T', { searchTerm: term, options: { pageCapabilities: caps } })
    expect(r.body.errors).toBeUndefined()
    return (r.body.data as { searchPage: GPage }).searchPage
  }

  it('SearchPredictedSection __resolveType; predicted/score/reason/explain; predictions; modelVersion', async () => {
    const p = await page('sintel')
    expect(p.modelVersion).toBe('lr-1 · 0 güncelleme')
    expect(p.predictions[0]).toMatchObject({ text: 'Sintel', kind: 'TITLE', unifiedEntityId: 'Video:80010001' })
    const rel = p.sections.find((s) => s.__typename === 'SearchPredictedSection')
    expect(rel?.displayString).toBe('Sintel ile ilgili')
    const e = rel?.entities[0]
    expect(e?.predicted).toBe(true)
    expect(e?.reason).toBe('Sintel ile ilgili')
    expect([80010002, 80010003]).toContain(e?.video?.videoId) // beğenilenle aynı tür, Sintel'e en benzer
    expect(e?.score).toBeGreaterThan(0)
    expect(e?.explain?.map((f) => f.name)).toEqual([...FEATURE_NAMES])
    const g = p.sections.find((s) => s.__typename === 'SearchGallerySection')?.entities[0]
    expect(g?.predicted).toBe(false)
    expect(g?.score).toBeGreaterThan(0.5)
  })

  it('eski istemci: aynı yanıt biçimi (yalnız galeri), yeni alanlar zararsız', async () => {
    const r = await exec('old', 'O', { searchTerm: 'sahsiyet', options: { pageCapabilities: OLD_CAPS } })
    expect(r.body.errors).toBeUndefined()
    const sp = (r.body.data as { searchPage: { sections: GSection[] } }).searchPage
    expect(sp.sections.map((s) => [s.__typename, s.id])).toEqual([['SearchGallerySection', 'galeri']])
    const withNew = await page('sahsiyet', OLD_CAPS)
    expect(withNew.sections.map((s) => s.__typename)).toEqual(['SearchGallerySection'])
    expect(withNew.sections[0]?.entities.every((e) => e.predicted === false)).toBe(true)
  })

  it('searchPredictions ve popularSearches', async () => {
    const r = await exec('pred', 'P', { prefix: 'kara', first: 3 })
    expect(r.body.errors).toBeUndefined()
    const list = (r.body.data as { searchPredictions: { text: string }[] }).searchPredictions
    expect(list[0]?.text).toBe('Kara Sevda')
    expect(list.length).toBeLessThanOrEqual(3)
    const pop = await exec('pop', 'Q', { first: 4 })
    const vids = (pop.body.data as { popularSearches: { videoId: number }[] }).popularSearches
    expect(vids).toHaveLength(4)
    expect([80010002, 80010003]).toContain(vids[0]?.videoId) // beğenilen animasyon/fantastik zevki
    const kid = await exec('pop', 'Q', { first: 4 }, KID)
    expect((kid.body.data as { popularSearches: { videoId: number }[] }).popularSearches).toEqual([
      { videoId: 80030007 },
    ])
  })

  it('recordSearchFeedback: true döner, modeli günceller; profil ve authURL ister', async () => {
    const before = await page('dram')
    const gallery = before.sections.find((s) => s.id === 'galeri')
    const target = gallery?.entities.at(-1)
    if (!target) throw new Error('hedef yok')
    for (let i = 0; i < 6; i++) {
      const p = await page('dram')
      const pos = p.sections
        .find((s) => s.id === 'galeri')
        ?.entities.findIndex((e) => e.unifiedEntityId === target.unifiedEntityId)
      const r = await exec('fb', 'F', {
        requestId: p.requestId,
        searchTerm: 'dram',
        unifiedEntityId: target.unifiedEntityId,
        position: pos,
        action: 'CLICK',
      })
      expect(r.body.errors).toBeUndefined()
      expect(r.body.data).toEqual({ recordSearchFeedback: true })
    }
    const after = await page('dram')
    expect(after.modelVersion).toBe('lr-1 · 6 güncelleme')
    expect(after.sections.find((s) => s.id === 'galeri')?.entities[0]?.unifiedEntityId).toBe(target.unifiedEntityId)
    // Bilinmeyen requestId de kabul edilir
    const unknown = await exec('fb', 'F', {
      requestId: 'eskimis',
      searchTerm: 'dram',
      unifiedEntityId: target.unifiedEntityId,
      position: 0,
      action: 'PLAY',
    })
    expect(unknown.body.data).toEqual({ recordSearchFeedback: true })
    const noProfile = await exec(
      'fb',
      'F',
      { requestId: 'x', searchTerm: 'a', unifiedEntityId: 'Video:1', position: 0, action: 'CLICK' },
      null,
    )
    expect(noProfile.body.errors?.[0]?.extensions.code).toBe('PROFILE_REQUIRED')
    const csrf = await exec(
      'fb',
      'F',
      { requestId: 'x', searchTerm: 'a', unifiedEntityId: 'Video:1', position: 0, action: 'CLICK' },
      AYSE,
      false,
    )
    expect(csrf.body.errors?.[0]?.extensions.code).toBe('CSRF_FAILED')
    const bad = await exec('fb', 'F', {
      requestId: 'x',
      searchTerm: 'a',
      unifiedEntityId: 'Video:1',
      position: 0,
      action: 'LIKE',
    })
    expect(bad.statusCode).not.toBe(200)
  })
})
