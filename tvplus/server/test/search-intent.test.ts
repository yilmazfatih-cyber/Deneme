/**
 * Niyet araması: sayfa düzeyi (VE kuralı, gevşetme, çocuk profili, gerekçeler, başlık araması → null, CANLI),
 * servis köprüsü (etiketleme servisi var / yok / fırlatıyor, geri bildirim) ve kalıcı SearchPageQueryResults belgesiyle
 * gerçek katalog üzerinden GraphQL.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { zSeason, type ContentTitle } from '../../shared/content-schema'
import type { EffectiveTags } from '../../shared/intelligence'
import { GENRES } from '../../shared/taxonomy'
import { zVocabulary } from '../../shared/tagging-schema'
import { createGraphQLEngine, type GraphQLEngine, type PersistedRegistry } from '../src/graphql/engine'
import { resolvers } from '../src/graphql/resolvers/index'
import type { Passport, ProfileRecord } from '../src/kernel/context'
import type { AccessDecision, Services } from '../src/kernel/services'
import { recordSearchFeedback, runSearch } from '../src/services/search/engine'
import { MIN_INTENT_RESULTS, RELAX_ORDER } from '../src/services/search/intent/facts'
import { searchModel } from '../src/services/search/model/runtime'
import { buildSearchPage, INTENT_SCORE, type SearchRequestContext } from '../src/services/search/page'
import { buildSearchIndex, type SearchIndex } from '../src/services/search/searchIndex'
import type { SearchPageResult, SearchSectionResult } from '../src/services/search/types'
import { ADULT as ALAN_ADULT, createAlanApp, gqlContext, passport as alanPassport } from './fixtures/alan'
import { AIRINGS, CHANNELS, FULL_CAPS, NOW, OLD_CAPS, peopleOf, PREDICTED_CAPS, title } from './search-fixtures'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const VOCABULARY = zVocabulary.parse(
  JSON.parse(readFileSync(join(ROOT, 'content', 'tagging', 'vocabulary.json'), 'utf8')),
)

/* ───────────── Örnek katalog ───────────── */

const min = (m: number) => m * 60
const TITLES: ContentTitle[] = [
  title({
    videoId: 1,
    title: 'Uzay Notları',
    year: 2021,
    runtimeSec: min(20),
    genres: ['bilim-kurgu'],
    moods: ['dusundurucu'],
    popularity: 70,
    origin: { countries: ['TR'], languages: ['tr'] },
  }),
  title({
    videoId: 2,
    title: 'Yıldız Tozu',
    year: 2019,
    runtimeSec: min(25),
    genres: ['bilim-kurgu', 'kisa-film'],
    moods: ['dusundurucu'],
    popularity: 60,
    origin: { countries: ['NL'], languages: ['en'] },
  }),
  title({
    videoId: 3,
    title: 'Zaman Kapısı',
    year: 2015,
    runtimeSec: min(110),
    genres: ['bilim-kurgu'],
    moods: ['dusundurucu'],
    popularity: 90,
    origin: { countries: ['US'], languages: ['en'] },
  }),
  title({
    videoId: 4,
    title: 'Robot Şakaları',
    year: 2022,
    runtimeSec: min(15),
    genres: ['bilim-kurgu'],
    popularity: 50,
  }),
  title({
    videoId: 5,
    title: 'Gülen Yüzler',
    year: 1985,
    runtimeSec: min(85),
    genres: ['komedi'],
    moods: ['eglenceli'],
    popularity: 65,
    cast: ['Kemal Sunal'],
  }),
  title({ videoId: 6, title: 'Kahkaha Gecesi', year: 2018, runtimeSec: min(95), genres: ['komedi'], popularity: 55 }),
  title({
    videoId: 7,
    title: 'Minik Ayı',
    type: 'SHOW',
    year: 2020,
    genres: ['animasyon'],
    moods: ['eglenceli'],
    kids: true,
    maturity: { rating: 'GENEL', reasons: [] },
    popularity: 40,
  }),
  title({
    videoId: 8,
    title: 'Orman Dostları',
    year: 2017,
    runtimeSec: min(70),
    genres: ['animasyon', 'cocuk-aile'],
    kids: true,
    maturity: { rating: 'GENEL', reasons: [] },
    popularity: 45,
  }),
  title({ videoId: 9, title: 'Gece Yarısı', year: 1984, runtimeSec: min(88), genres: ['korku'], popularity: 30 }),
  title({ videoId: 10, title: 'Sessiz Ev', year: 2020, runtimeSec: min(100), genres: ['korku'], popularity: 35 }),
  title({ videoId: 11, title: 'Çizgi Dünya', year: 2021, runtimeSec: min(80), genres: ['animasyon'], popularity: 20 }),
]
const byId = new Map(TITLES.map((t) => [t.videoId, t]))

function indexWith(extra: Partial<Parameters<typeof buildSearchIndex>[0]> = {}): SearchIndex {
  return buildSearchIndex(
    { titles: TITLES, collections: [], people: peopleOf(TITLES), channels: CHANNELS, airings: AIRINGS, ...extra },
    NOW,
  )
}
const INDEX = indexWith()

let seq = 0
function run(term: string, o: { kids?: boolean; index?: SearchIndex; caps?: typeof FULL_CAPS } = {}): SearchPageResult {
  const kids = o.kids ?? false
  const ctx: SearchRequestContext = {
    term,
    options: { pageCapabilities: o.caps ?? FULL_CAPS },
    now: NOW,
    requestId: `niyet-${++seq}`,
    kids,
    isTitleVisible: (id) => (kids ? (byId.get(id)?.kids ?? false) : true),
    isEntitled: () => true,
    recentSearches: [],
  }
  return buildSearchPage(o.index ?? INDEX, ctx)
}
const gallery = (p: SearchPageResult) => p.sections.find((s) => s.sectionType === 'SearchGallerySection')
const names = (s: SearchSectionResult | undefined) => (s ? s.entities.map((e) => e.displayString) : [])

/* ───────────── Sayfa ───────────── */

describe('niyet araması: sonuçlar', () => {
  it('tüm niyetleri karşılayanlar (VE), sıra popülerlikle; anlaşılma çipleri', () => {
    const p = run('düşündürücü bilim kurgu')
    expect(names(gallery(p))).toEqual(['Zaman Kapısı', 'Uzay Notları', 'Yıldız Tozu'])
    expect(p.understanding).toEqual({
      intents: [
        { kind: 'MOOD', matched: 'düşündürücü', label: 'Ton: Düşündürücü', without: 'bilim kurgu' },
        { kind: 'GENRE', matched: 'bilim kurgu', label: 'Tür: Bilim Kurgu', without: 'düşündürücü' },
      ],
      remainder: '',
      relaxed: [],
    })
    expect(p.isFallback).toBe(false)
    expect(p.correction).toBeNull()
    expect(gallery(p)?.entities.every((e) => e.score === INTENT_SCORE)).toBe(true)
    // Tür niyetinin tür sayfası öneriler satırında (bugünkü tür sözcüğü davranışı)
    const list = p.sections.find((s) => s.sectionType === 'SearchListSection')
    expect(list?.entities.find((e) => e.treatment === 'standardDestination')?.ref).toEqual({
      type: 'genre',
      genreId: GENRES['bilim-kurgu'].genreId,
    })
  })
  it('gerekçe: başlığın karşıladığı niyetler, sorgu sırasıyla', () => {
    const p = run('kısa düşündürücü bilim kurgu')
    const reasons = Object.fromEntries((gallery(p)?.entities ?? []).map((e) => [e.displayString, e.reason]))
    expect(reasons['Uzay Notları']).toBe('Kısa · Düşündürücü · Bilim Kurgu')
    expect(reasons['Zaman Kapısı']).toBe('Düşündürücü · Bilim Kurgu')
  })
  it('gevşetme: 3 sonuçtan azsa sabit sırayla bırakılır, bırakılanlar `relaxed`', () => {
    expect(MIN_INTENT_RESULTS).toBe(3)
    expect(RELAX_ORDER[RELAX_ORDER.length - 1]).toBe('GENRE')
    // Kısa + düşündürücü + bilim kurgu: 2 başlık → süre bırakılır → 3
    const p = run('kısa düşündürücü bilim kurgu')
    expect(p.understanding?.relaxed).toEqual(['Süre: 40 dakikadan kısa'])
    expect(names(gallery(p))).toEqual(['Zaman Kapısı', 'Uzay Notları', 'Yıldız Tozu'])
    // 80'ler + korku: 1 → dönem bırakılır → 2; tek niyet (tür) kalınca durur
    const k = run('80lerden korku')
    expect(k.understanding?.relaxed).toEqual(["Dönem: 1980'ler"])
    expect(names(gallery(k)).sort()).toEqual(['Gece Yarısı', 'Sessiz Ev'])
    // Dönem önce, ton sonra, tür en son: eski + eğlenceli + animasyon → 0
    const a = run('eski eğlenceli animasyon')
    expect(a.understanding?.relaxed).toEqual(['Dönem: 2000 öncesi', 'Ton: Eğlenceli'])
    expect(names(gallery(a))).toEqual(['Orman Dostları', 'Minik Ayı', 'Çizgi Dünya'])
  })
  it('süre: sayılı biçim, dizi bölüm süresi, süresi bilinmeyen kısa film', () => {
    // Yalnız biri 90 dakikadan kısa → süre gevşer; gerekçe hangisinin karşıladığını söyler
    const d = run('90 dakikadan kısa komedi')
    expect(d.understanding?.relaxed).toEqual(['Süre: 90 dakikadan kısa'])
    expect(gallery(d)?.entities.map((e) => [e.displayString, e.reason])).toEqual([
      ['Gülen Yüzler', '90 dakikadan kısa · Komedi'],
      ['Kahkaha Gecesi', 'Komedi'],
    ])
    expect(names(gallery(run('2 saatten kısa komedi')))).toEqual(['Gülen Yüzler', 'Kahkaha Gecesi'])
    expect(run('2 saatten kısa komedi').understanding?.relaxed).toEqual([])
    // Dizi: bölüm sürelerinin ortancası
    const show = title({
      videoId: 13,
      title: 'Kısa Bölümler',
      type: 'SHOW',
      genres: ['komedi'],
      seasons: [
        zSeason.parse({
          number: 1,
          episodes: [12, 14, 40].map((m, i) => ({
            videoId: 1300 + i,
            number: i + 1,
            title: `Bölüm ${i + 1}`,
            synopsis: 'Bölüm',
            runtimeSec: min(m),
            sources: [{ type: 'YOUTUBE', videoId: 'abcdefghijk' }],
          })),
        }),
      ],
    })
    const withShow = indexWith({ titles: [...TITLES, show] })
    expect(names(gallery(run('kısa komedi', { index: withShow })))).toContain('Kısa Bölümler')
    const kd = run('kısa komedi dizisi', { index: withShow })
    expect(kd.understanding?.relaxed).toEqual(['Biçim: Dizi', 'Süre: 40 dakikadan kısa'])
    expect(gallery(kd)?.entities.find((e) => e.displayString === 'Kısa Bölümler')?.reason).toBe('Kısa · Komedi · Dizi')
    // Süresi bilinmeyen başlık "kısa"yı yalnız türü kısa film ise karşılar
    const idx = indexWith({
      titles: [
        ...TITLES,
        title({ videoId: 12, title: 'Bilinmez', genres: ['bilim-kurgu', 'kisa-film'], moods: ['dusundurucu'] }),
      ],
    })
    expect(names(gallery(run('kısa düşündürücü bilim kurgu', { index: idx }))).sort()).toEqual([
      'Bilinmez',
      'Uzay Notları',
      'Yıldız Tozu',
    ])
    expect(run('kısa düşündürücü bilim kurgu', { index: idx }).understanding?.relaxed).toEqual([])
  })
  it('köken, dönem, biçim, izleyici', () => {
    expect(names(gallery(run('yerli bilim kurgu')))).toContain('Uzay Notları')
    expect(run('yerli bilim kurgu').understanding?.relaxed).toEqual(['Köken: Yerli'])
    expect(names(gallery(run('2010 sonrası film'))).sort()).toEqual(
      TITLES.filter((t) => t.year >= 2010 && t.type === 'MOVIE')
        .map((t) => t.title)
        .sort(),
    )
    // "korku filmi": biçim önce bırakılırdı ama sonucu değiştirmediği için gevşetilmiş sayılmaz
    const k = run('80lerden korku filmi')
    expect(k.understanding?.relaxed).toEqual(["Dönem: 1980'ler"])
    expect(names(gallery(k)).sort()).toEqual(['Gece Yarısı', 'Sessiz Ev'])
    const ad = run('animasyon dizisi')
    expect(names(gallery(ad))).toEqual(['Orman Dostları', 'Minik Ayı', 'Çizgi Dünya'])
    expect(ad.understanding?.relaxed).toEqual(['Biçim: Dizi'])
    // Ailece: yalnız iki animasyon → izleyici gevşer; gerekçe hangilerinin aile için olduğunu söyler
    const aa = run('ailece animasyon')
    expect(aa.understanding?.relaxed).toEqual(['İzleyici: Aile'])
    expect(gallery(aa)?.entities.map((e) => [e.displayString, e.reason])).toEqual([
      ['Orman Dostları', 'Ailece · Animasyon'],
      ['Minik Ayı', 'Ailece · Animasyon'],
      ['Çizgi Dünya', 'Animasyon'],
    ])
  })
  it('kalan metin metin eşleşmesinden geçer ve süzer', () => {
    const p = run('kemal sunal komedi')
    expect(p.understanding?.remainder).toBe('kemal sunal')
    expect(names(gallery(p))).toEqual(['Gülen Yüzler'])
    expect(gallery(p)?.entities[0]?.score).toBeLessThan(INTENT_SCORE + 50)
    // Kişi de öneriler satırına gelir
    expect(p.sections.flatMap((s) => s.entities).some((e) => e.kind === 'PERSON')).toBe(true)
  })
  it('çocuk profili yalnız görünür başlıkları görür; görünür başlık yoksa yorum yok', () => {
    const p = run('eğlenceli animasyon dizi', { kids: true })
    expect(names(gallery(p))).toEqual(['Orman Dostları', 'Minik Ayı'])
    expect(p.understanding?.relaxed).toEqual(['Biçim: Dizi', 'Ton: Eğlenceli'])
    expect(gallery(p)?.entities[1]?.reason).toBe('Eğlenceli · Animasyon · Dizi')
    expect(run('çocuk').understanding?.intents[0]?.label).toBe('İzleyici: Çocuklar')
    expect(names(gallery(run('çocuk', { kids: true })))).toEqual(['Orman Dostları', 'Minik Ayı'])
    const korku = run('korku', { kids: true })
    expect(korku.understanding).toBeNull()
    expect(korku.isFallback).toBe(true)
  })
  it('eski istemci (yalnız galeri) aynı başlıkları alır', () => {
    const p = run('düşündürücü bilim kurgu', { caps: OLD_CAPS })
    expect(p.sections.map((s) => s.sectionType)).toEqual(['SearchGallerySection'])
    expect(names(gallery(p))).toHaveLength(3)
  })
})

describe('niyet araması: ne zaman yorumlanmaz', () => {
  it('başlık, kişi ve kanal araması → understanding null, eski davranış', () => {
    for (const q of ['Uzay Notları', 'uzay notlari', 'kemal sunal', 'trt cocuk']) {
      const p = run(q)
      expect(p.understanding, q).toBeNull()
    }
    expect(gallery(run('Uzay Notları'))?.entities[0]?.score).toBe(100)
  })
  it('hiçbir şey çözülmezse null', () => {
    expect(run('zaman').understanding).toBeNull()
    expect(run('').understanding).toBeNull()
    expect(run('qqqzzz').understanding).toBeNull()
  })
  it('hiçbir başlık karşılamıyorsa (CANLI yoksa) düz arama', () => {
    expect(run('belgesel').understanding).toBeNull()
  })
  it('tek tür sözcüğü: tür sayfası öneride, gerekçe modelin (çip tek)', () => {
    const p = run('komedi')
    expect(p.understanding?.intents.map((i) => i.label)).toEqual(['Tür: Komedi'])
    expect(names(gallery(p))).toEqual(['Gülen Yüzler', 'Kahkaha Gecesi'])
    expect(gallery(p)?.entities.every((e) => e.reason === null)).toBe(true)
    const list = p.sections.find((s) => s.sectionType === 'SearchListSection')
    expect(list?.entities.map((e) => e.unifiedEntityId)).toContain(`Genre:${GENRES.komedi.genreId}`)
  })
})

describe('niyet araması: canlı', () => {
  it('"canlı": canlı bölüm ilk sırada, başlık listesi yok', () => {
    const p = run('canlı')
    expect(p.understanding?.intents.map((i) => i.kind)).toEqual(['LIVE'])
    expect(p.sections[0]?.sectionType).toBe('SearchLiveSection')
    expect(p.sections[0]?.entities.map((e) => e.unifiedEntityId)).toEqual(
      expect.arrayContaining(['Airing:a1', 'Channel:1']),
    )
    expect(gallery(p)).toBeUndefined()
  })
  it('"canlı haber": CANLI çıkarılınca kalan, kanal ve yayınlarla eşleşir', () => {
    const p = run('canlı haber')
    expect(p.sections[0]?.sectionType).toBe('SearchLiveSection')
    expect(names(p.sections[0])).toContain('Haber Global')
    expect(names(p.sections[0])).not.toContain('Kanal D')
  })
  it('"canlı komedi": canlı bölüm önce, sonra niyete uyan başlıklar; canlı süzmez', () => {
    const p = run('canlı komedi')
    expect(p.sections.map((s) => s.sectionType)).toEqual([
      'SearchLiveSection',
      'SearchListSection',
      'SearchGallerySection',
    ])
    expect(names(gallery(p))).toEqual(['Gülen Yüzler', 'Kahkaha Gecesi'])
  })
})

/* ───────────── Servis köprüsü ───────────── */

const ADULT: ProfileRecord = {
  guid: 'P-NIYET',
  accountId: 'A1',
  name: 'Ayşe',
  avatar: 'a.png',
  isKids: false,
  maturityLevel: 110,
  language: 'tr',
}
const passportOf = (profile: ProfileRecord | null): Passport => ({
  membershipStatus: 'CURRENT_MEMBER',
  account: { accountId: 'A1', planName: 'TV+ Temel', products: ['tvplus-temel'] },
  profile,
  esn: 'TVPWCH-MC-TEST',
  deviceId: 'cihaz',
  authURLVerified: true,
  isAdmin: false,
})
const playable: AccessDecision = {
  state: 'PLAYABLE',
  reasonText: null,
  requiredProduct: null,
  requiredProductName: null,
  cta: null,
}

const effective = (titleId: number, descriptors: string[]): EffectiveTags => ({
  titleId,
  rubricVersion: VOCABULARY.version,
  basis: 'SAMPLE',
  sheetCount: 0,
  agreement: null,
  scales: {},
  facets: {},
  descriptors,
})

function makeServices(tagging: unknown = undefined): Services {
  const services = {
    catalog: {
      allTitles: () => TITLES,
      allCollections: () => [],
      people: () => peopleOf(TITLES),
      listChannels: () => CHANNELS,
      isVisibleTo: (p: ProfileRecord | null, id: number) => (p?.isKids ? (byId.get(id)?.kids ?? false) : true),
      getTitle: (id: number) => byId.get(id) ?? null,
      titleOf: (id: number) => byId.get(id) ?? null,
    },
    epg: { airings: () => [] },
    entitlement: { accessForVideo: () => playable },
    progress: { recentSearches: () => [] },
    tagging,
  }
  // Sahte: yalnız aramanın kullandığı yöntemler var.
  return services as unknown as Services
}
const search = (s: Services, term: string) =>
  runSearch(s, passportOf(ADULT), term, { pageCapabilities: PREDICTED_CAPS }, NOW)

describe('niyet araması: servis köprüsü', () => {
  it('etiketleme servisi: sözlüğün niteleyicileri ve başlığın geçerli etiketleri kullanılır', () => {
    const s = makeServices({
      vocabulary: () => VOCABULARY,
      revision: () => 1,
      effective: (id: number) => effective(id, id === 6 || id === 4 ? ['komik'] : []),
    })
    const p = search(s, 'komik film')
    expect(p.understanding?.intents.map((i) => i.label)).toEqual(['Ton: Komik', 'Biçim: Film'])
    // İki komik film: biçim gevşer ama sonucu değiştirmez → yine iki başlık, gevşetilen yok
    expect(names(gallery(p)).sort()).toEqual(['Kahkaha Gecesi', 'Robot Şakaları'].sort())
    expect(p.understanding?.relaxed).toEqual([])
    expect(gallery(p)?.entities[0]?.reason).toBe('Komik · Film')
  })
  it('etiketleme servisi yoksa ya da fırlatırsa yalnız taksonomi; arama yine çalışır', () => {
    const none = search(makeServices(), 'komik film')
    expect(none.understanding?.intents.map((i) => i.kind)).toEqual(['TYPE'])
    const broken = makeServices({
      vocabulary: () => {
        throw new Error('hazır değil')
      },
      revision: () => {
        throw new Error('hazır değil')
      },
      effective: () => {
        throw new Error('hazır değil')
      },
    })
    expect(names(gallery(search(broken, 'düşündürücü bilim kurgu')))).toHaveLength(3)
  })
  it('geri bildirim niyet sonuçlarında da modeli günceller (tıklanan + üstündekiler zayıf olumsuz)', () => {
    const s = makeServices()
    const page = search(s, 'düşündürücü bilim kurgu')
    const g = gallery(page)
    const third = g?.entities[2]
    if (!g || !third) throw new Error('galeri yok')
    expect(third.explain?.find((f) => f.name === 'metin')?.value).toBe(INTENT_SCORE / 100)
    const ok = recordSearchFeedback(
      s,
      passportOf(ADULT),
      {
        requestId: page.requestId,
        searchTerm: 'düşündürücü bilim kurgu',
        unifiedEntityId: third.unifiedEntityId,
        position: 2,
        action: 'CLICK',
      },
      NOW,
    )
    expect(ok).toBe(true)
    const st = searchModel(s).store.get()
    expect(st.updates).toBe(1)
    const pairs = st.pairs['dusundurucu bilim kurgu']
    expect(pairs?.[third.unifiedEntityId]).toEqual([1, 0])
    for (const e of g.entities.slice(0, 2)) expect(pairs?.[e.unifiedEntityId]).toEqual([0, 0.3])
    // Hatırlanmayan yanıtta öznitelikler aynı kuralla (niyet puanı) yeniden hesaplanır
    expect(
      recordSearchFeedback(
        s,
        passportOf(ADULT),
        {
          requestId: 'hic-yok',
          searchTerm: 'kısa bilim kurgu',
          unifiedEntityId: 'Video:4',
          position: 0,
          action: 'PLAY',
        },
        NOW,
      ),
    ).toBe(true)
    expect(searchModel(s).store.get().updates).toBe(2)
  })
})

/* ───────────── GraphQL (kalıcı belge, gerçek katalog) ───────────── */

describe('niyet araması: GraphQL SearchPageQueryResults', () => {
  const root = join(ROOT, 'shared', 'graphql')
  const registry = JSON.parse(readFileSync(join(root, 'persisted.server.json'), 'utf8')) as PersistedRegistry
  const id = Object.entries(registry.operations).find(([, op]) => op.name === 'SearchPageQueryResults')?.[0] ?? ''
  let app: FastifyInstance
  let engine: GraphQLEngine

  beforeAll(async () => {
    app = await createAlanApp({ contentDir: join(ROOT, 'content') })
    engine = createGraphQLEngine({
      typeDefs: readFileSync(join(root, 'schema.graphql'), 'utf8'),
      resolvers,
      persisted: registry,
    })
  })
  afterAll(async () => {
    await app.close()
  })

  async function query(searchTerm: string) {
    const pp = alanPassport(ALAN_ADULT)
    const r = await engine.handle({
      body: {
        operationName: 'SearchPageQueryResults',
        variables: { searchTerm, options: { pageCapabilities: PREDICTED_CAPS } },
        extensions: { persistedQuery: { id, version: registry.version } },
      },
      passport: pp,
      makeContext: () => gqlContext(app, pp),
    })
    expect(r.body.errors, JSON.stringify(r.body.errors)).toBeUndefined()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test gövdesinde derin JSON erişimi
    return (r.body.data as any).searchPage
  }

  it('understanding kalıcı belgeyle döner; galeri gerekçeleri niyetleri sayar', async () => {
    const page = await query('90 dakikadan kısa komedi')
    expect(page.understanding).toEqual({
      remainder: '',
      relaxed: [],
      intents: [
        { kind: 'DURATION', matched: '90 dakikadan kısa', label: 'Süre: 90 dakikadan kısa', without: 'komedi' },
        { kind: 'GENRE', matched: 'komedi', label: 'Tür: Komedi', without: '90 dakikadan kısa' },
      ],
    })
    const g = page.sections.find((s: { __typename: string }) => s.__typename === 'SearchGallerySection')
    expect(g.entities.length).toBeGreaterThanOrEqual(3)
    for (const e of g.entities) expect(e.reason).toBe('90 dakikadan kısa · Komedi')
  })
  it('başlık araması: understanding null', async () => {
    const page = await query('sintel')
    expect(page.understanding).toBeNull()
    expect(page.sections.length).toBeGreaterThan(0)
  })
})
