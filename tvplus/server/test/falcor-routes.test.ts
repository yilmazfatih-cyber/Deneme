import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { FalcorPath, JsonGraph, JsonGraphLeaf } from '../../shared/types'
import { evaluatePaths } from '../src/falcor/engine'
import { routes } from '../src/falcor/routes/index'
import type { FalcorMatch, FalcorRouteContext, Passport } from '../src/kernel/context'
import { buildLolomo } from '../src/services/discovery/lolomo'
import { installEmptyIntelligence } from './fixtures/intelligence'
import { ACCOUNT_SINEMA, ADULT, createAlanApp, fakeRequest, ID, KID, passport, TEEN, TEST_NOW } from './fixtures/alan'

const FLAGS = { webp: 'true', isTop10Supported: 'true', materialize: 'true', falcor_server: '0.1.0' }

describe('Falcor rotaları', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await createAlanApp()
    installEmptyIntelligence(app)
  })
  afterAll(async () => {
    await app.close()
  })

  const ctxFor = (pp: Passport = passport(ADULT), flags: Record<string, string> = FLAGS): FalcorRouteContext => ({
    req: fakeRequest(),
    passport: pp,
    services: app.services,
    config: app.config,
    flags,
  })
  const routeOf = (...pattern: string[]) => {
    const r = routes.find((x) => x.route.join('.') === pattern.join('.'))
    if (!r) throw new Error(`rota yok: ${pattern.join('.')}`)
    return r
  }
  const get = (ctx: FalcorRouteContext, pattern: string[], match: FalcorMatch) => routeOf(...pattern).get(ctx, match)
  /** Yanıt grafiğinde yolu izler (ref'leri takip etmeden) */
  const at = (g: JsonGraph, ...path: (string | number)[]): unknown =>
    path.reduce<unknown>(
      (n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[String(k)] : undefined),
      g,
    )

  it('MIMARI §6 + §9.4 yol aileleri tanımlı', () => {
    expect(routes.map((r) => r.route.join('.'))).toEqual([
      'lolomo',
      'lolomoByCategory.KEYS',
      'lolomos.KEYS.summary',
      'lolomos.KEYS.INTEGERS',
      'lists.KEYS.summary',
      'lists.KEYS.INTEGERS',
      'lists.KEYS.itemTctx.INTEGERS',
      'videos.INTEGERS.KEYS',
      'usp.features.KEYS',
    ])
  })

  it('doğrudan rota çağrıları: ref zinciri ve atom biçimleri', async () => {
    const ctx = ctxFor()
    const lolomo = buildLolomo(app.services, ADULT, { top10Supported: true, now: TEST_NOW })
    expect(await get(ctx, ['lolomo'], [['lolomo']])).toEqual([
      { path: ['lolomo'], value: { $type: 'ref', value: ['lolomos', ADULT.guid] } },
    ])
    const [summary] = await get(ctx, ['lolomos', 'KEYS', 'summary'], [['lolomos'], [ADULT.guid], ['summary']])
    expect(summary!.value).toEqual({
      $type: 'atom',
      value: { length: lolomo.lists.length, trackId: lolomo.trackId, expires: lolomo.expires },
    })
    const rows = await get(ctx, ['lolomos', 'KEYS', 'INTEGERS'], [['lolomos'], [ADULT.guid], [0, 1, 99]])
    expect(rows.map((r) => r.value)).toEqual([
      { $type: 'ref', value: ['lists', lolomo.lists[0]!.listId] },
      { $type: 'ref', value: ['lists', lolomo.lists[1]!.listId] },
      undefined,
    ])
    // başka profilin lolomosu istenemez
    const [foreign] = await get(ctx, ['lolomos', 'KEYS', 'summary'], [['lolomos'], [TEEN.guid], ['summary']])
    expect((foreign!.value as JsonGraphLeaf).$type).toBe('error')
    // profilsiz
    const [none] = await get(ctxFor(passport(null)), ['lolomo'], [['lolomo']])
    expect(none!.value).toMatchObject({ $type: 'error', value: { code: 'PROFILE_REQUIRED' } })

    const genre = lolomo.lists.find((l) => l.context === 'genre')!
    const [ls] = await get(ctx, ['lists', 'KEYS', 'summary'], [['lists'], [genre.listId], ['summary']])
    expect(ls!.value).toEqual({
      $type: 'atom',
      value: {
        id: genre.listId,
        context: 'genre',
        displayName: 'Animasyon',
        length: genre.videoIds.length,
        trackId: genre.trackId,
        genreId: 7424,
      },
    })
    const items = await get(ctx, ['lists', 'KEYS', 'INTEGERS'], [['lists'], [genre.listId], [0, 1]])
    expect(items.map((i) => i.value)).toEqual(
      genre.videoIds.slice(0, 2).map((v) => ({ $type: 'ref', value: ['videos', v] })),
    )
    const row = lolomo.lists.indexOf(genre)
    const tctx = await get(
      ctx,
      ['lists', 'KEYS', 'itemTctx', 'INTEGERS'],
      [['lists'], [genre.listId], ['itemTctx'], [1]],
    )
    expect(tctx[0]!.value).toEqual({
      $type: 'atom',
      value: `${row},1,${genre.listId},${genre.trackId},,,,,,,Video:${genre.videoIds[1]},`,
    })
  })

  it('videos[id] alanları', async () => {
    const ctx = ctxFor()
    const fields = [
      'summary',
      'title',
      'shortSynopsis',
      'synopsis',
      'releaseYear',
      'displayRuntime',
      'runtime',
      'seasonCount',
      'boxart',
      'storyArt',
      'billboardArt',
      'titleLogo',
      'badge',
      'maturity',
      'access',
      'bookmark',
      'watchStatus',
      'queue',
      'userRating',
      'top10Rank',
      'sourceKinds',
      'promoVideo',
      'current',
    ]
    app.services.progress.setBookmark(ADULT.guid, ID.sintel, 444)
    const out = await get(ctx, ['videos', 'INTEGERS', 'KEYS'], [['videos'], [ID.sintel], fields])
    const v = Object.fromEntries(out.map((pv) => [pv.path[2], pv.value as JsonGraphLeaf | undefined]))
    const val = (k: string) => (v[k] as { value?: unknown } | undefined)?.value
    expect(val('summary')).toEqual({
      id: ID.sintel,
      type: 'movie',
      isPlayable: true,
      isKids: false,
      unifiedEntityId: `Video:${ID.sintel}`,
    })
    expect(val('title')).toBe('Sintel')
    expect(val('releaseYear')).toBe(2010)
    expect(val('displayRuntime')).toBe('15 dk')
    expect(val('runtime')).toBe(888)
    expect(v.seasonCount).toBeUndefined()
    expect(v.current).toBeUndefined()
    expect(val('boxart')).toMatchObject({ width: 368, height: 552, key: `BOXART|Video:${ID.sintel}|368x552` })
    expect(val('storyArt')).toMatchObject({ width: 608 })
    expect(val('billboardArt')).toMatchObject({ width: 1280, height: 720 })
    expect(val('titleLogo')).toMatchObject({ width: 400, height: 160 })
    expect((val('boxart') as { url: string }).url).toMatch(/\.webp\?r=/)
    expect(val('maturity')).toEqual({ certificationValue: '13+', maturityLevel: 80, reasons: ['Şiddet ve Korku'] })
    expect(val('access')).toEqual({
      state: 'PLAYABLE',
      reasonText: null,
      requiredProduct: null,
      requiredProductName: null,
      cta: null,
    })
    expect(v.bookmark).toMatchObject({ $type: 'atom', value: { positionSec: 444, runtimeSec: 888, progress: 0.5 } })
    expect((v.bookmark as { $expires?: number }).$expires).toBeLessThan(0)
    expect(v.watchStatus).toMatchObject({ $type: 'atom', value: 'STARTED' })
    expect((v.watchStatus as { $expires?: number }).$expires).toBeLessThan(0)
    expect(val('queue')).toBe(false)
    expect(val('userRating')).toBe('THUMBS_UNRATED')
    expect(val('top10Rank')).toBe(1)
    expect(val('sourceKinds')).toEqual(['OWN_CDN'])
    expect(val('promoVideo')).toMatchObject({ viewableId: `Video:${ID.sintel}`, offset: 120, sourceKind: 'OWN_CDN' })
    expect(v.badge).toEqual({ $type: 'atom' })

    // dizi: current ref, sezon sayısı; webp=false → jpg
    const show = await get(
      ctxFor(passport(ADULT), { ...FLAGS, webp: 'false' }),
      ['videos', 'INTEGERS', 'KEYS'],
      [['videos'], [ID.caminandes], ['summary', 'current', 'seasonCount', 'boxart', 'badge']],
    )
    const s = Object.fromEntries(show.map((pv) => [pv.path[2], pv.value as { value?: unknown }]))
    expect(s.summary!.value).toMatchObject({ type: 'show', isKids: true })
    expect(s.current).toEqual({ $type: 'ref', value: ['videos', ID.cam_s1e1] })
    expect(s.seasonCount!.value).toBe(2)
    expect((s.boxart!.value as { url: string }).url).toMatch(/\.jpg\?r=/)
    expect(s.badge!.value).toEqual({ kind: 'EXCLUSIVE', text: "Sadece TV+'ta" })
    // dizi kendi kimliğiyle oynatılmaz: önizleme de bölüme gider
    const promo = await get(ctx, ['videos', 'INTEGERS', 'KEYS'], [['videos'], [ID.caminandes], ['promoVideo']])
    expect((promo[0]!.value as { value: { viewableId: string } }).value.viewableId).toBe(`Video:${ID.cam_s1e1}`)

    // paket dışı / görünmez / bilinmeyen
    const tears = await get(
      ctx,
      ['videos', 'INTEGERS', 'KEYS'],
      [['videos'], [ID.tears], ['access', 'badge', 'promoVideo']],
    )
    expect(tears.map((x) => (x.value as { value?: unknown }).value)).toEqual([
      {
        state: 'UPSELL',
        reasonText: 'Sinema Paketi ile izlenir',
        requiredProduct: 'sinema-paketi',
        requiredProductName: 'Sinema Paketi',
        cta: 'Paketi incele',
      },
      { kind: 'LOCKED', text: 'Sinema Paketi' },
      undefined,
    ])
    const hidden = await get(
      ctxFor(passport(KID)),
      ['videos', 'INTEGERS', 'KEYS'],
      [['videos'], [ID.sintel, 1], ['title']],
    )
    expect(hidden.map((x) => x.value)).toEqual([undefined, undefined])
  })

  it('usp.features', async () => {
    const out = await get(
      ctxFor(passport(KID), { ...FLAGS, isTop10Supported: 'false' }),
      ['usp', 'features', 'KEYS'],
      [['usp'], ['features'], ['liveTv', 'kidsMode', 'top10', 'bilinmeyen']],
    )
    expect(out.map((x) => [x.path[2], (x.value as { value: unknown }).value])).toEqual([
      ['liveTv', true],
      ['kidsMode', true],
      ['top10', false],
      ['bilinmeyen', false],
    ])
  })

  it('uçtan uca: çekirdek motor (evaluatePaths) ref zincirini izler', async () => {
    const ctx = ctxFor(passport(ADULT, ACCOUNT_SINEMA))
    const paths: FalcorPath[] = [
      ['lolomo', 'summary'],
      ['lolomo', { from: 0, to: 2 }, 'summary'],
      ['lolomo', 1, { from: 0, to: 1 }, ['title', 'boxart', 'summary']],
      ['lolomo', 1, 'itemTctx', 0],
      ['videos', ID.caminandes, 'current', ['title', 'displayRuntime']],
      ['usp', 'features', 'liveTv'],
    ]
    const res = await evaluatePaths(ctx, paths)
    const g = res.jsonGraph
    expect(at(g, 'lolomo')).toEqual({ $type: 'ref', value: ['lolomos', ADULT.guid] })
    expect(at(g, 'lolomos', ADULT.guid, 'summary')).toMatchObject({
      $type: 'atom',
      value: { length: expect.any(Number) },
    })
    const ref1 = at(g, 'lolomos', ADULT.guid, 1) as { value: string[] }
    expect(ref1.value[0]).toBe('lists')
    const listId = ref1.value[1]!
    // önceki testte Sintel'e yer imi kondu → 2. satır "İzlemeye Devam Et"
    expect(at(g, 'lists', listId, 'summary')).toMatchObject({
      $type: 'atom',
      value: { context: 'continueWatching', displayName: 'İzlemeye Devam Et', length: 1 },
    })
    const v0 = (at(g, 'lists', listId, 0) as { value: (string | number)[] }).value
    expect(v0).toEqual(['videos', ID.sintel])
    expect(at(g, 'lists', listId, 1)).toEqual({ $type: 'atom' }) // materialize: olmayan öğe boş atom
    expect(at(g, 'videos', v0[1]!, 'title')).toMatchObject({ $type: 'atom' })
    expect(at(g, 'videos', v0[1]!, 'boxart')).toMatchObject({ $type: 'atom', value: { width: 368 } })
    expect(String((at(g, 'lists', listId, 'itemTctx', 0) as { value: string }).value)).toMatch(
      new RegExp(`^1,0,${listId},\\d+,,,,,,,Video:\\d+,$`),
    )
    expect(at(g, 'videos', ID.caminandes, 'current')).toEqual({ $type: 'ref', value: ['videos', ID.cam_s1e1] })
    expect(at(g, 'videos', ID.cam_s1e1, 'title')).toEqual({ $type: 'atom', value: 'Llama Drama' })
    expect(at(g, 'videos', ID.cam_s1e1, 'displayRuntime')).toEqual({ $type: 'atom', value: 'S1 B1 · 2 dk' })
    expect(at(g, 'usp', 'features', 'liveTv')).toEqual({ $type: 'atom', value: true })

    // Top 10 kapalı: aynı istekte top10 bağlamlı liste yok
    const off = await evaluatePaths(ctxFor(passport(ADULT), { ...FLAGS, isTop10Supported: 'false' }), [
      ['lolomo', { from: 0, to: 9 }, 'summary'],
    ])
    const contexts = Object.values(
      (off.jsonGraph.lists ?? {}) as Record<string, { summary?: { value?: { context: string } } }>,
    ).map((l) => l.summary?.value?.context)
    expect(contexts).not.toContain('top10')
    expect(contexts.length).toBeGreaterThan(3)
  })
})
