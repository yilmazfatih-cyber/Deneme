/**
 * Keşif × deney bayrakları (shared/experiments.ts): beş ana sayfa bayrağının her biri için varsayılanla birebir aynılık
 * ve varyantın beklenen etkisi. Kişisel sayfa sıralaması sahte `predictions` servisinin puanlarıyla sınanır.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_FLAGS, FLAG_KEYS, FLAGS, type Flags } from '../../shared/experiments'
import { blendedSimilars } from '../src/services/discovery/blend'
import {
  buildLolomo,
  LOLOMO_CATEGORIES,
  MAX_ROW_ITEMS,
  MIN_ROW_ITEMS,
  MODEL_ORDERED,
  PAGE_FIXED,
  rankRowsPersonal,
  rowScore,
  type Lolomo,
  type LolomoCategory,
  type LolomoList,
} from '../src/services/discovery/lolomo'
import { ADULT, createAlanApp, ID, TEST_NOW } from './fixtures/alan'
import { installEmptyIntelligence, installIntelligence, type FakePredictions } from './fixtures/intelligence'
import { createTestApp } from './helpers'

const SCORES: Record<number, number> = {
  [ID.spring]: 0.91,
  [ID.cosmos]: 0.8,
  [ID.bbb]: 0.7,
  [ID.tears]: 0.6,
  [ID.anadolu]: 0.5,
  [ID.metropolis]: 0.4,
  [ID.caminandes]: 0.3,
}
const scoreMap = new Map(Object.entries(SCORES).map(([k, v]) => [Number(k), v]))

const contexts = (l: Lolomo) => l.lists.map((x) => x.context)
const ids = (l: Lolomo) => l.lists.map((x) => x.listId)
const isTop10 = (x: LolomoList) => x.context === 'top10' || x.context === 'top10Shows' || x.context === 'top10Movies'
const without = (l: Lolomo, pred: (x: LolomoList) => boolean) => l.lists.filter((x) => !pred(x))

describe('keşif × deney bayrakları', () => {
  let app: FastifyInstance
  let pred: FakePredictions
  beforeEach(async () => {
    app = await createAlanApp()
    pred = installIntelligence(app).predictions
    pred.setScores(ADULT.guid, SCORES)
    app.services.progress.setBookmark(ADULT.guid, ID.metropolis, 300)
    app.services.progress.setBookmark(ADULT.guid, ID.sintel, 300)
    app.services.progress.setBookmark(ADULT.guid, ID.cosmos, 300)
    app.services.progress.addToMyList(ADULT.guid, ID.tears)
  })
  afterEach(async () => {
    await app.close()
  })
  const build = (flags?: Partial<Flags>, category: LolomoCategory = 'home') =>
    buildLolomo(app.services, ADULT, { top10Supported: true, now: TEST_NOW, category, flags })
  const modelOn = () => {
    pred.setReady(true)
    pred.bump()
  }

  it('bayrak yok, boş, tüm varsayılanlar ya da tek tek varsayılan: her kategoride birebir aynı (model kapalı ve açık)', () => {
    for (const ready of [false, true]) {
      if (ready) modelOn()
      for (const category of LOLOMO_CATEGORIES) {
        const base = build(undefined, category)
        expect(build({}, category), `${category} {}`).toEqual(base)
        expect(build({ ...DEFAULT_FLAGS }, category), `${category} varsayılanlar`).toEqual(base)
        for (const k of FLAG_KEYS)
          expect(build({ [k]: FLAGS[k].values[0] }, category), `${category} ${k}`).toEqual(base)
        // istemci bayrakları sunucu çıktısını değiştirmez
        expect(build({ 'preview.autoplay': 'off', 'player.autoplayNext': 'on' }, category)).toEqual(base)
      }
    }
  })

  it("home.rowRanker='popularity': model sıralı satırlar satırın kendi sırasında; diğer satırlar aynı", () => {
    const rules = build() // model hazır değil → satırın kendi sırası
    modelOn()
    const model = build()
    const pop = build({ 'home.rowRanker': 'popularity' })
    const genre = (l: Lolomo) => l.lists.find((x) => x.context === 'genre')!
    expect(genre(model).videoIds).not.toEqual(genre(rules).videoIds)
    expect(genre(pop).videoIds).toEqual(genre(rules).videoIds)
    expect(ids(pop)).toEqual(ids(model))
    for (const [i, row] of pop.lists.entries()) {
      if (MODEL_ORDERED.includes(row.context))
        expect(row.videoIds, row.listId).toEqual(rules.lists.find((x) => x.listId === row.listId)!.videoIds)
      else expect(row.videoIds, row.listId).toEqual(model.lists[i]!.videoIds)
    }
    // tüm kategorilerde geçerli
    for (const category of ['shows', 'movies', 'newPopular'] as const) {
      pred.setReady(false)
      pred.bump()
      const plain = build(undefined, category)
      modelOn()
      expect(build({ 'home.rowRanker': 'popularity' }, category), category).toEqual(plain)
    }
  })

  it("home.top10: 'off' satır yok; 'low' Canlı TV köprüsünden hemen önce; diğer satırlar aynı sırada", () => {
    const base = build()
    expect(base.lists.some(isTop10)).toBe(true)
    const off = build({ 'home.top10': 'off' })
    expect(off.lists.some(isTop10)).toBe(false)
    expect(off.lists).toEqual(without(base, isTop10))

    const low = build({ 'home.top10': 'low' })
    const bridge = contexts(low).indexOf('bridge')
    const top = low.lists.filter(isTop10)
    expect(top).toEqual(base.lists.filter(isTop10)) // aynı içerik, aynı kimlikler
    expect(low.lists.slice(bridge - top.length, bridge)).toEqual(top)
    expect(without(low, isTop10)).toEqual(without(base, isTop10))
    // yer değişse de kimlikler aynı
    expect([...ids(low)].sort()).toEqual([...ids(base)].sort())
  })

  it("home.becauseRows='3': ilk satır bugünküyle aynı; tekrar eden başlık yok; 3'ten az öğeye düşen satır düşer", () => {
    const base = build()
    const three = build({ 'home.becauseRows': '3' })
    const because = (l: Lolomo) => l.lists.filter((x) => x.context === 'becauseYouWatched')
    expect(because(base)).toHaveLength(1)
    expect(because(three)[0]).toEqual(because(base)[0])
    expect(because(three).length).toBeLessThanOrEqual(3)
    const seen = new Set<number>()
    for (const row of because(three)) {
      expect(row.videoIds.length).toBeGreaterThanOrEqual(MIN_ROW_ITEMS)
      for (const v of row.videoIds) {
        expect(seen.has(v), `${v} iki satırda`).toBe(false)
        seen.add(v)
      }
    }
    // satırlar art arda, bugünkü yerde
    const first = contexts(three).indexOf('becauseYouWatched')
    expect(first).toBe(contexts(base).indexOf('becauseYouWatched'))
    expect(
      contexts(three)
        .slice(first, first + because(three).length)
        .every((c) => c === 'becauseYouWatched'),
    ).toBe(true)
    // diğer satırlar aynı
    const notBecause = (x: LolomoList) => x.context === 'becauseYouWatched'
    expect(without(three, notBecause)).toEqual(without(base, notBecause))
  })

  it("home.picksPosition='top': En İyi Seçimler İzlemeye Devam Et'in hemen ardından, Top 10'dan önce", () => {
    const base = build()
    const top = build({ 'home.picksPosition': 'top' })
    const gems = (l: Lolomo) => l.lists.find((x) => x.context === 'gems')!
    expect(contexts(top).indexOf('gems')).toBe(contexts(top).indexOf('continueWatching') + 1)
    expect(contexts(top).indexOf('gems')).toBeLessThan(top.lists.findIndex(isTop10))
    expect(contexts(base).indexOf('gems')).toBeGreaterThan(base.lists.findIndex(isTop10))
    expect(gems(top)).toEqual(gems(base))
    const isGems = (x: LolomoList) => x.context === 'gems'
    expect(without(top, isGems)).toEqual(without(base, isGems))
  })

  it("home.pageRanker='personal': sabitler yerinde, diğerleri satır puanına göre; model kapalıyken değişmez", () => {
    // model hazır değil → editoryal sıra
    expect(build({ 'home.pageRanker': 'personal' })).toEqual(build())
    modelOn()
    const base = build()
    const calls = pred.calls.scores
    const personal = build({ 'home.pageRanker': 'personal' })
    expect(pred.calls.scores - calls).toBe(1) // lolomo başına tek scores çağrısı
    // sabit satırlar aynı konumda
    base.lists.forEach((row, i) => {
      if (PAGE_FIXED.includes(row.context)) expect(personal.lists[i], row.context).toEqual(row)
    })
    // aynı satırlar (kimlik ve içerik değişmez), yalnız yerleri
    expect([...personal.lists].sort((a, b) => a.listId.localeCompare(b.listId))).toEqual(
      [...base.lists].sort((a, b) => a.listId.localeCompare(b.listId)),
    )
    // hareketli satırlar puana göre azalan; puansızlar eski göreli sırayla sonda
    const movable = personal.lists.filter((x) => !PAGE_FIXED.includes(x.context))
    const scores = movable.map((x) => rowScore(x.videoIds, scoreMap))
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    const unscored = movable.filter((x) => rowScore(x.videoIds, scoreMap) === Number.NEGATIVE_INFINITY)
    const baseUnscored = base.lists.filter(
      (x) => !PAGE_FIXED.includes(x.context) && rowScore(x.videoIds, scoreMap) === Number.NEGATIVE_INFINITY,
    )
    expect(unscored.map((x) => x.listId)).toEqual(baseUnscored.map((x) => x.listId))
    // somut: Canlı TV köprüsünden sonraki "Editörün seçimi" (Nosferatu 0.99, Spring, Cosmos, Anadolu → ort. 0.80)
    // köprünün önüne çıkar; köprü yerinde kalır
    pred.setScores(ADULT.guid, { ...SCORES, [ID.nosferatu]: 0.99 })
    pred.bump()
    const plain = build()
    const boosted = build({ 'home.pageRanker': 'personal' })
    const curated = (l: Lolomo) => contexts(l).indexOf('curated')
    expect(curated(plain)).toBeGreaterThan(contexts(plain).indexOf('bridge'))
    expect(curated(boosted)).toBeLessThan(contexts(boosted).indexOf('bridge'))
    expect(contexts(boosted).indexOf('bridge')).toBe(contexts(plain).indexOf('bridge'))
    // puan haritası boşsa sıra değişmez
    pred.setScores(ADULT.guid, {})
    pred.bump()
    expect(build({ 'home.pageRanker': 'personal' })).toEqual(build())
  })

  it('rankRowsPersonal / rowScore: ilk 10 öğenin en iyi 5 puanının ortalaması, eşitlikte eski sıra, −∞ sonda', () => {
    const row = (listId: string, context: LolomoList['context'], videoIds: number[]): LolomoList => ({
      listId,
      context,
      displayName: listId,
      trackId: 1,
      videoIds,
    })
    const s = new Map([
      [1, 0.9],
      [2, 0.8],
      [3, 0.1],
      [4, 0.5],
      [5, 0.5],
      [6, 0.5],
      [7, 0.5],
      [8, 0.5],
      [11, 1],
    ])
    // ilk 10'un dışındaki (11. öğe) sayılmaz; en iyi 5: 0.9, 0.8, 0.5, 0.5, 0.5
    expect(rowScore([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], s)).toBeCloseTo(0.64)
    expect(rowScore([9, 10], s)).toBe(Number.NEGATIVE_INFINITY)
    const lists = [
      row('b', 'billboard', [9]),
      row('x', 'genre', [3]),
      row('n1', 'curated', [9]),
      row('t', 'top10', [3]),
      row('y', 'genre', [1]),
      row('z', 'collection', [4]),
      row('w', 'collection', [5]),
      row('n2', 'curated', [10]),
      row('br', 'bridge', []),
      row('v', 'leaving', [2]),
    ]
    expect(rankRowsPersonal(lists, s).map((x) => x.listId)).toEqual([
      'b',
      'y',
      'v',
      't',
      'z',
      'w',
      'x',
      'n1',
      'br',
      'n2',
    ])
    expect(rankRowsPersonal(lists, null)).toBe(lists)
    expect(rankRowsPersonal(lists, new Map())).toBe(lists)
  })
})

describe("keşif × home.becauseRows='3' (geniş katalog)", () => {
  let app: FastifyInstance
  afterEach(async () => {
    await app.close()
  })

  it('son 3 farklı başlık için art arda üç satır; başlık yalnız ilk girdiği satırda', async () => {
    // Örnek içerik (9 başlık) üç ayrı satıra yetmez: depodaki içerikle, satırları ayrışan üç kaynak aranır
    app = await createTestApp()
    installEmptyIntelligence(app)
    const catalog = app.services.catalog
    const visible = (id: number) => !!catalog.getTitle(id) && catalog.isVisibleTo(ADULT, id)
    const movies = catalog
      .allTitles()
      .filter((t) => t.type === 'MOVIE' && visible(t.videoId))
      .map((t) => t.videoId)
    const sims = new Map(
      movies.map((id) => [
        id,
        blendedSimilars(app.services, id, visible)
          .slice(0, MAX_ROW_ITEMS)
          .map((x) => x.titleId),
      ]),
    )
    const rest = (id: number, used: Set<number>) => sims.get(id)!.filter((x) => !used.has(x))
    let triple: number[] | null = null
    search: for (const a of movies) {
      const ua = new Set(sims.get(a))
      if (ua.size < MIN_ROW_ITEMS) continue
      for (const b of movies) {
        if (b === a || rest(b, ua).length < MIN_ROW_ITEMS) continue
        const ub = new Set([...ua, ...rest(b, ua)])
        for (const c of movies)
          if (c !== a && c !== b && rest(c, ub).length >= MIN_ROW_ITEMS) {
            triple = [a, b, c]
            break search
          }
      }
    }
    expect(triple, 'içerikte satırları ayrışan üç film bulunamadı').not.toBeNull()
    const [a, b, c] = triple!
    // en son izlenen önce: a, b, c
    for (const id of [c!, b!, a!]) app.services.progress.setBookmark(ADULT.guid, id, 60)
    expect(app.services.progress.recentTitles(ADULT.guid).slice(0, 3)).toEqual([a, b, c])

    const build = (flags?: Partial<Flags>) =>
      buildLolomo(app.services, ADULT, { top10Supported: true, now: TEST_NOW, flags })
    const base = build()
    const three = build({ 'home.becauseRows': '3' })
    const because = (l: Lolomo) => l.lists.filter((x) => x.context === 'becauseYouWatched')
    expect(because(base)).toHaveLength(1)
    const rows = because(three)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.displayName)).toEqual(
      [a, b, c].map((id) => `${catalog.getTitle(id!)!.title} adlı içeriği izlediğin için`),
    )
    expect(rows[0]).toEqual(because(base)[0])
    const all = rows.flatMap((r) => r.videoIds)
    expect(new Set(all).size).toBe(all.length)
    const first = contexts(three).indexOf('becauseYouWatched')
    expect(contexts(three).slice(first, first + 3)).toEqual(Array(3).fill('becauseYouWatched'))
    expect(new Set(rows.map((r) => r.listId)).size).toBe(3)
  })
})
