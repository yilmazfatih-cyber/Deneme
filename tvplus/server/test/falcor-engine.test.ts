import type { Response as InjectResponse } from 'light-my-request'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BootContext, FalcorPath, JsonGraph } from '../../shared/types'
import { createFalcorEngine } from '../src/falcor/engine-core'
import { FalcorPathError, expandPathSets, normalizePathSet } from '../src/falcor/paths'
import {
  atom,
  falcorError,
  ref,
  type FalcorMatch,
  type FalcorRoute,
  type FalcorRouteContext,
} from '../src/kernel/context'
import { createTestApp } from './helpers'

const ctx = (flags: Record<string, string> = {}) => ({ flags }) as unknown as FalcorRouteContext

/** Sahte rotalar: lolomo → lolomos → lists → videos zinciri. */
function fakeRoutes() {
  const calls: { route: string; match: FalcorMatch }[] = []
  const log = (r: FalcorRoute, match: FalcorMatch) => calls.push({ route: r.route.join('.'), match })
  const routes: FalcorRoute[] = [
    {
      route: ['lolomo'],
      get(_c, m) {
        log(this, m)
        return [{ path: ['lolomo'], value: ref(['lolomos', 'G']) }]
      },
    },
    {
      route: ['lolomos', 'KEYS', 'summary'],
      get(_c, m) {
        log(this, m)
        return m[1]!.map((g) => ({ path: ['lolomos', g, 'summary'], value: atom({ length: 2 }) }))
      },
    },
    {
      route: ['lolomos', 'KEYS', 'INTEGERS'],
      get(_c, m) {
        log(this, m)
        return m[1]!.flatMap((g) =>
          (m[2] as number[]).map((i) => ({ path: ['lolomos', g, i], value: ref(['lists', `L${i}`]) })),
        )
      },
    },
    {
      route: ['lists', 'KEYS', 'INTEGERS'],
      get(_c, m) {
        log(this, m)
        return m[1]!.flatMap((l) =>
          (m[2] as number[]).map((i) => ({
            path: ['lists', l, i],
            value: ref(['videos', 100 + Number(String(l).slice(1)) * 10 + i]),
          })),
        )
      },
    },
    {
      route: ['videos', 'INTEGERS', 'KEYS'],
      get(_c, m) {
        log(this, m)
        const out = []
        for (const id of m[1] as number[]) {
          for (const k of m[2]!) {
            if (k === 'title') out.push({ path: ['videos', id, k], value: `Video ${id}` })
            else if (k === 'boxart') out.push({ path: ['videos', id, k], value: { url: `/b/${id}.webp`, width: 368 } })
            else if (k === 'tags') out.push({ path: ['videos', id, k], value: ['a', 'b'] })
            else if (k === 'nothing') out.push({ path: ['videos', id, k], value: undefined })
            else if (k === 'isKids') out.push({ path: ['videos', id, k], value: false })
          }
        }
        return out
      },
    },
    {
      route: ['broken', 'KEYS'],
      get() {
        throw new Error('gizli iç ayrıntı')
      },
    },
    {
      route: ['coded'],
      async get() {
        throw Object.assign(new Error('Pakette yok'), { code: 'UPSELL' })
      },
    },
    { route: ['x', 'KEYS'], get: (_c, m) => m[1]!.map((k) => ({ path: ['x', k], value: 'genel' })) },
    { route: ['x', 'ozel'], get: () => [{ path: ['x', 'ozel'], value: 'özel' }] },
    { route: ['loop', 'a'], get: () => [{ path: ['loop', 'a'], value: ref(['loop', 'b']) }] },
    { route: ['loop', 'b'], get: () => [{ path: ['loop', 'b'], value: ref(['loop', 'a']) }] },
    { route: ['err'], get: () => [{ path: ['err'], value: falcorError('bilerek', 'TEST') }] },
  ]
  return { routes, calls }
}

const at = (g: JsonGraph, ...keys: (string | number)[]): unknown =>
  keys.reduce<unknown>(
    (n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[String(k)] : undefined),
    g,
  )

describe('yol kümeleri', () => {
  it('aralıkları ve anahtar dizilerini açar', () => {
    const p = normalizePathSet(['videos', [1, { from: 5, length: 2 }], ['title', 'boxart']])
    expect(p).toEqual(['videos', [1, { from: 5, to: 6 }], ['title', 'boxart']])
    expect(expandPathSets([p], 100)).toHaveLength(6)
    expect(() => expandPathSets([normalizePathSet(['v', { from: 0, to: 3000 }])], 3000)).toThrow(FalcorPathError)
    expect(() => normalizePathSet([])).toThrow(FalcorPathError)
    expect(() => normalizePathSet(['a', [['iç']]])).toThrow(FalcorPathError)
    expect(() => normalizePathSet(['a', { from: 'x' }])).toThrow(FalcorPathError)
  })
})

describe('Falcor motoru', () => {
  it('aralıklar: tek rota çağrısında toplanır, ilkel değerler ham', async () => {
    const { routes, calls } = fakeRoutes()
    const engine = createFalcorEngine({ routes })
    const res = await engine.evaluate(ctx(), [['videos', { from: 1, to: 3 }, 'title']])
    expect(res.paths).toEqual([['videos', { from: 1, to: 3 }, 'title']])
    expect(at(res.jsonGraph, 'videos', 2, 'title')).toBe('Video 2')
    expect(calls).toEqual([{ route: 'videos.INTEGERS.KEYS', match: [['videos'], [1, 2, 3], ['title']] }])
  })

  it('anahtar kümeleri ve {from,length}; nesneler atom olur, sayı dizgesi tamsayıya çevrilir', async () => {
    const { routes, calls } = fakeRoutes()
    const engine = createFalcorEngine({ routes })
    const res = await engine.evaluate(ctx(), [
      ['videos', [{ from: 5, length: 1 }, '7'], ['title', 'boxart', 'tags', 'isKids']] as unknown as FalcorPath,
    ])
    expect(at(res.jsonGraph, 'videos', 7, 'title')).toBe('Video 7')
    expect(at(res.jsonGraph, 'videos', 5, 'boxart')).toEqual({ $type: 'atom', value: { url: '/b/5.webp', width: 368 } })
    expect(at(res.jsonGraph, 'videos', 5, 'tags')).toEqual({ $type: 'atom', value: ['a', 'b'] })
    expect(at(res.jsonGraph, 'videos', 5, 'isKids')).toBe(false)
    expect(calls[0]!.match[1]).toEqual([5, 7])
  })

  it('ref izler: lolomo[0][3].title zinciri ve ara ref’ler grafikte', async () => {
    const { routes } = fakeRoutes()
    const engine = createFalcorEngine({ routes })
    const res = await engine.evaluate(ctx(), [
      ['lolomo', { from: 0, to: 1 }, 3, 'title'],
      ['lolomo', 'summary'],
    ])
    const g = res.jsonGraph
    expect(at(g, 'lolomo')).toEqual({ $type: 'ref', value: ['lolomos', 'G'] })
    expect(at(g, 'lolomos', 'G', 0)).toEqual({ $type: 'ref', value: ['lists', 'L0'] })
    expect(at(g, 'lists', 'L1', 3)).toEqual({ $type: 'ref', value: ['videos', 113] })
    expect(at(g, 'videos', 103, 'title')).toBe('Video 103')
    expect(at(g, 'videos', 113, 'title')).toBe('Video 113')
    expect(at(g, 'lolomos', 'G', 'summary')).toEqual({ $type: 'atom', value: { length: 2 } })
  })

  it('yol sonundaki ref izlenmez; ön ekteki atom yanıttır', async () => {
    const { routes, calls } = fakeRoutes()
    const engine = createFalcorEngine({ routes })
    const res = await engine.evaluate(ctx(), [['lolomo'], ['videos', 1, 'boxart', 'url']])
    expect(at(res.jsonGraph, 'lolomo')).toEqual({ $type: 'ref', value: ['lolomos', 'G'] })
    expect(at(res.jsonGraph, 'lolomos')).toBeUndefined()
    expect(at(res.jsonGraph, 'videos', 1, 'boxart')).toEqual({ $type: 'atom', value: { url: '/b/1.webp', width: 368 } })
    expect(calls.map((c) => c.route).sort()).toEqual(['lolomo', 'videos.INTEGERS.KEYS'])
  })

  it('en özgül ve en uzun rota seçilir', async () => {
    const { routes } = fakeRoutes()
    const engine = createFalcorEngine({ routes })
    const res = await engine.evaluate(ctx(), [['x', ['ozel', 'baska']]])
    expect(at(res.jsonGraph, 'x', 'ozel')).toBe('özel')
    expect(at(res.jsonGraph, 'x', 'baska')).toBe('genel')
  })

  it('materialize: eksik değer ve rotası olmayan yol boş atom olur', async () => {
    const { routes } = fakeRoutes()
    const engine = createFalcorEngine({ routes })
    const off = await engine.evaluate(ctx(), [
      ['videos', 1, 'nothing'],
      ['yok', 'hiç'],
    ])
    expect(at(off.jsonGraph, 'videos', 1, 'nothing')).toBeUndefined()
    expect(at(off.jsonGraph, 'yok')).toBeUndefined()
    const on = await engine.evaluate(ctx({ materialize: 'true' }), [
      ['videos', 1, 'nothing'],
      ['yok', 'hiç'],
      ['videos', 1, 'unknownKey'],
    ])
    expect(at(on.jsonGraph, 'videos', 1, 'nothing')).toEqual({ $type: 'atom' })
    expect(at(on.jsonGraph, 'yok', 'hiç')).toEqual({ $type: 'atom' })
    expect(at(on.jsonGraph, 'videos', 1, 'unknownKey')).toEqual({ $type: 'atom' })
  })

  it('withSize: atomlara ve ref’lere $size eklenir', async () => {
    const { routes } = fakeRoutes()
    const engine = createFalcorEngine({ routes })
    const res = await engine.evaluate(ctx({ withSize: 'true' }), [['lolomo', 0, 0, 'title']])
    const title = at(res.jsonGraph, 'videos', 100, 'title') as { $type: string; value: string; $size: number }
    expect(title.$type).toBe('atom')
    expect(title.value).toBe('Video 100')
    expect(title.$size).toBeGreaterThan(50)
    expect((at(res.jsonGraph, 'lolomo') as { $size?: number }).$size).toBeGreaterThan(50)
  })

  it('hatalar: fırlatan rota hata yaprağı olur, iç ayrıntı sızmaz; kodlu hata korunur', async () => {
    const { routes } = fakeRoutes()
    const seen: unknown[] = []
    const engine = createFalcorEngine({ routes, onRouteError: (e) => seen.push(e) })
    const res = await engine.evaluate(ctx({ materialize: 'true' }), [
      ['broken', ['a', 'b']],
      ['coded', 'derin'],
      ['err'],
      ['videos', 1, 'title'],
    ])
    expect(at(res.jsonGraph, 'broken', 'a')).toEqual({
      $type: 'error',
      value: { message: 'Bu değer şu anda alınamadı.', code: 'INTERNAL' },
    })
    expect(JSON.stringify(res.jsonGraph)).not.toContain('gizli')
    expect(at(res.jsonGraph, 'coded')).toEqual({ $type: 'error', value: { message: 'Pakette yok', code: 'UPSELL' } })
    expect(at(res.jsonGraph, 'err')).toEqual({ $type: 'error', value: { message: 'bilerek', code: 'TEST' } })
    expect(at(res.jsonGraph, 'videos', 1, 'title')).toBe('Video 1')
    expect(seen).toHaveLength(2)
  })

  it('genişleme üst sınırı ve döngüsel ref', async () => {
    const { routes } = fakeRoutes()
    const engine = createFalcorEngine({ routes, maxPaths: 10 })
    await expect(engine.evaluate(ctx(), [['videos', { from: 0, to: 10 }, 'title']])).rejects.toMatchObject({
      code: 'PATH_EXPANSION_LIMIT',
    })
    const res = await engine.evaluate(ctx(), [['loop', 'a', 'x']])
    expect(at(res.jsonGraph, 'loop', 'a')).toEqual({ $type: 'ref', value: ['loop', 'b'] })
  })

  it('rota çağrıları istenenden fazlasını kapsamaz (yaprak kümesine göre bölünür)', async () => {
    const { routes, calls } = fakeRoutes()
    const engine = createFalcorEngine({ routes })
    const res = await engine.evaluate(ctx(), [
      ['videos', [1, 2], ['title', 'isKids']],
      ['videos', 3, 'boxart'],
    ])
    expect(at(res.jsonGraph, 'videos', 3, 'title')).toBeUndefined()
    expect(at(res.jsonGraph, 'videos', 1, 'boxart')).toBeUndefined()
    expect(calls.map((c) => c.match).sort((a, b) => a[1]!.length - b[1]!.length)).toEqual([
      [['videos'], [3], ['boxart']],
      [['videos'], [1, 2], ['title', 'isKids']],
    ])
  })

  it('rota yoksa boş grafik', async () => {
    const engine = createFalcorEngine({ routes: [] })
    const res = await engine.evaluate(ctx(), [['lolomo', 'summary']])
    expect(res.jsonGraph).toEqual({})
  })
})

describe('POST /api/member/pathEvaluator', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>
  let cookies: Record<string, string>
  let boot: BootContext
  const take = (res: InjectResponse, into: Record<string, string>) => {
    for (const c of res.cookies) if (c.value) into[c.name] = c.value
  }
  beforeAll(async () => {
    app = await createTestApp()
    cookies = {}
    const login = await app.inject({ method: 'POST', url: '/api/login' })
    take(login, cookies)
    const sw = await app.inject({
      method: 'POST',
      url: '/api/profiles/switch',
      cookies,
      payload: { guid: login.json<BootContext>().profiles[0]!.guid },
    })
    take(sw, cookies)
    boot = sw.json<BootContext>()
  })
  afterAll(async () => {
    await app.close()
  })

  const form = (paths: FalcorPath[], authURL?: string) =>
    [
      ...paths.map((p) => `path=${encodeURIComponent(JSON.stringify(p))}`),
      ...(authURL ? [`authURL=${encodeURIComponent(authURL)}`] : []),
    ].join('&')

  it('anonim 401, profilsiz 403, authURL’siz 403', async () => {
    const anon = await app.inject({
      method: 'POST',
      url: '/api/member/pathEvaluator',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: form([['lolomo']]),
    })
    expect(anon.statusCode).toBe(401)
    expect(anon.json().error.code).toBe('UNAUTHENTICATED')

    const noProfile: Record<string, string> = {}
    take(await app.inject({ method: 'POST', url: '/api/login' }), noProfile)
    const np = await app.inject({
      method: 'POST',
      url: '/api/member/pathEvaluator',
      cookies: noProfile,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: form([['lolomo']]),
    })
    expect(np.statusCode).toBe(403)
    expect(np.json().error.code).toBe('PROFILE_REQUIRED')

    const csrf = await app.inject({
      method: 'POST',
      url: '/api/member/pathEvaluator',
      cookies,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: form([['lolomo']], 'c1.1.yanlis'),
    })
    expect(csrf.statusCode).toBe(403)
    expect(csrf.json().error.code).toBe('CSRF_FAILED')
  })

  it('form gövdesi (yinelenen path + authURL) ve JSON gövde kabul edilir', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/member/pathEvaluator?materialize=true&withSize=true',
      cookies,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: form(
        [
          ['usp', 'features', 'liveTv'],
          ['lolomo', 'summary'],
        ],
        boot.authURL!,
      ),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ paths: FalcorPath[]; jsonGraph: JsonGraph }>()
    expect(body.paths).toEqual([
      ['usp', 'features', 'liveTv'],
      ['lolomo', 'summary'],
    ])
    expect(body.jsonGraph).toBeTypeOf('object')
    expect(res.headers['x-b3-traceid']).toMatch(/^[0-9a-f]{32}$/)

    const json = await app.inject({
      method: 'POST',
      url: '/api/member/pathEvaluator',
      cookies,
      headers: { 'x-tvplus-authurl': boot.authURL! },
      payload: { paths: [['lolomo', { from: 0, to: 1 }, 'summary']] },
    })
    expect(json.statusCode).toBe(200)
    expect(json.json().paths).toEqual([['lolomo', { from: 0, to: 1 }, 'summary']])
  })

  it('bozuk yol ve aşırı genişleme 400', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/member/pathEvaluator',
      cookies,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `path=${encodeURIComponent('[bozuk')}&authURL=${encodeURIComponent(boot.authURL!)}`,
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.code).toBe('INVALID_PATH')
    const big = await app.inject({
      method: 'POST',
      url: '/api/member/pathEvaluator',
      cookies,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: form([['videos', { from: 0, to: 2999 }, ['title', 'boxart']]], boot.authURL!),
    })
    expect(big.statusCode).toBe(400)
    expect(big.json().error.code).toBe('PATH_EXPANSION_LIMIT')
  })
})
