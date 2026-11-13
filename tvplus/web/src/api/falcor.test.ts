import { describe, expect, it } from 'vitest'
import type { FalcorKey, FalcorPath, JsonGraph, JsonGraphLeaf } from '../../../shared/types'
import { devbus, type DevEvent } from '../lib/devbus'
import { collapsePaths, expandKeySet, FalcorModel, FalcorPathError, FalcorRequestError } from './falcor'

/* ───────────── Sahte sunucu: pathEvaluator'ı küçük ölçekte taklit eder ───────────── */

const isLeaf = (n: unknown): n is JsonGraphLeaf => typeof n === 'object' && n !== null && '$type' in n

/** Sunucu tarafı yürütme: ref'leri izler, ara ref'leri ve hedefleri yanıt grafiğine yazar; eksikse boş atom (materialize). */
function evaluate(graph: JsonGraph, paths: FalcorPath[]): JsonGraph {
  const out: JsonGraph = {}
  const write = (at: FalcorKey[], leaf: JsonGraphLeaf) => {
    let n = out
    at.slice(0, -1).forEach((k) => {
      const key = String(k)
      n = (n[key] && !isLeaf(n[key]) ? n[key] : (n[key] = {})) as JsonGraph
    })
    n[String(at[at.length - 1])] = leaf
  }
  const visit = (node: JsonGraph | JsonGraphLeaf | undefined, at: FalcorKey[], rest: FalcorPath) => {
    if (node === undefined) return write(at, { $type: 'atom' })
    if (isLeaf(node)) {
      write(at, node)
      if (node.$type === 'ref' && rest.length) visit(graph, [], [...node.value, ...rest])
      return
    }
    if (!rest.length) return
    const [head, ...tail] = rest
    for (const k of expandKeySet(head!)) visit(node[String(k)], [...at, k], tail)
  }
  for (const p of paths) visit(graph, [], p)
  return out
}

interface Call {
  url: string
  headers: Record<string, string>
  paths: FalcorPath[]
  authURL: string | null
}

function setup(graph: JsonGraph, opts: { status?: number; clock?: { t: number } } = {}) {
  const calls: Call[] = []
  const clock = opts.clock ?? { t: 1_000_000 }
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const form = new URLSearchParams(String(init.body))
    const paths = form.getAll('path').map((p) => JSON.parse(p) as FalcorPath)
    calls.push({ url, headers: init.headers as Record<string, string>, paths, authURL: form.get('authURL') })
    if (opts.status && opts.status !== 200) return new Response('{"error":{"code":"X","message":"x"}}', { status: opts.status, headers: { 'x-b3-traceid': 'abc' } })
    return new Response(JSON.stringify({ paths, jsonGraph: evaluate(graph, paths) }), { status: 200, headers: { 'x-b3-traceid': 'trace-1' } })
  }
  const model = new FalcorModel({ fetch: fetchImpl, now: () => clock.t, getHeaders: () => ({ 'x-tvplus-esn': 'TVPWCH-TEST' }), getAuthURL: () => 'auth-123' })
  return { model, calls, clock }
}

const ref = (...value: FalcorKey[]): JsonGraphLeaf => ({ $type: 'ref', value })
const atom = (value: unknown, extra: Partial<{ $expires: number }> = {}): JsonGraphLeaf => ({ $type: 'atom', value, ...extra })

function catalog(): JsonGraph {
  return {
    lolomo: ref('lolomos', 'G1'),
    lolomos: { G1: { 0: ref('lists', 'L1'), 1: ref('lists', 'L2'), summary: atom({ length: 2 }) } },
    lists: {
      L1: { 0: ref('videos', 10), 1: ref('videos', 11), 2: ref('videos', 12), summary: atom({ displayName: 'İzlemeye devam et' }) },
      L2: { 0: ref('videos', 12), summary: atom({ displayName: 'Yeni gelenler' }) },
    },
    videos: {
      10: { title: atom('Kuzgun'), releaseYear: atom(2019) },
      11: { title: atom('Bozkır'), releaseYear: atom(2021) },
      12: { title: atom('Sahil'), releaseYear: atom(2024) },
    },
  }
}

function capture(): { events: DevEvent[]; stop: () => void } {
  const events: DevEvent[] = []
  const stop = devbus.subscribe((e) => {
    if (e.cat === 'falcor') events.push(e)
  })
  return { events, stop }
}

describe('yardımcılar', () => {
  it('anahtar kümelerini açar', () => {
    expect(expandKeySet(3)).toEqual([3])
    expect(expandKeySet({ from: 1, to: 3 })).toEqual([1, 2, 3])
    expect(expandKeySet(['a', { from: 0, to: 1 }, 'b'])).toEqual(['a', 0, 1, 'b'])
  })

  it('tek konumda ayrışan yolları birleştirir', () => {
    const out = collapsePaths([
      ['lists', 'L', 0, 'title'],
      ['lists', 'L', 1, 'title'],
      ['lists', 'L', 2, 'title'],
      ['lists', 'L', 0, 'title'],
      ['videos', 5, 'title'],
      ['videos', 5, 'boxart'],
    ])
    expect(out).toEqual([
      ['lists', 'L', { from: 0, to: 2 }, 'title'],
      ['videos', 5, ['title', 'boxart']],
    ])
  })
})

describe('FalcorModel', () => {
  it('istek biçimi: bayraklar, form gövdesi, authURL, oturum başlıkları', async () => {
    const { model, calls } = setup(catalog())
    await model.get(['videos', 10, 'title'])
    expect(calls).toHaveLength(1)
    const c = calls[0]!
    expect(c.url).toBe('/api/member/pathEvaluator?webp=true&isTop10Supported=true&hasVideoMerchInBob=true&falcor_server=0.1.0&withSize=true&materialize=true')
    expect(c.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(c.headers['x-tvplus-esn']).toBe('TVPWCH-TEST')
    expect(c.authURL).toBe('auth-123')
    expect(c.paths).toEqual([['videos', 10, 'title']])
  })

  it('zincirleme ref izler ve yol biçiminde JSON döndürür; ara ref hedefleri önbelleğe girer', async () => {
    const { model, calls } = setup(catalog())
    const json = await model.get(['lolomo', { from: 0, to: 1 }, 0, 'title'], ['lolomo', 'summary'])
    expect(json).toEqual({
      lolomo: { 0: { 0: { title: 'Kuzgun' } }, 1: { 0: { title: 'Sahil' } }, summary: { length: 2 } },
    })
    expect(calls).toHaveLength(1)
    // Ara düğümler önbellekte: aynı veriye başka yoldan ağa çıkmadan ulaşılır.
    const again = await model.get(['lists', 'L1', 0, 'title'], ['videos', 12, 'title'])
    expect(again).toEqual({ lists: { L1: { 0: { title: 'Kuzgun' } } }, videos: { 12: { title: 'Sahil' } } })
    expect(calls).toHaveLength(1)
    // Ref'i gösteren ref (doğrudan zincir): yalnız eksik ref ağdan istenir.
    model.setCache({ kisayol: ref('lolomo') })
    expect(await model.get(['kisayol', 1, 0, 'title'])).toEqual({ kisayol: { 1: { 0: { title: 'Sahil' } } } })
    expect(calls).toHaveLength(1)
    // Yol sonunda ref istenirse hedef yolu döner.
    expect(await model.get(['lolomo'])).toEqual({ lolomo: ['lolomos', 'G1'] })
  })

  it('aralık ve anahtar kümelerini açar', async () => {
    const { model } = setup(catalog())
    const json = await model.get(['videos', { from: 10, to: 12 }, ['title', 'releaseYear']])
    expect(json).toEqual({
      videos: {
        10: { title: 'Kuzgun', releaseYear: 2019 },
        11: { title: 'Bozkır', releaseYear: 2021 },
        12: { title: 'Sahil', releaseYear: 2024 },
      },
    })
  })

  it('aynı tikteki get çağrıları TEK POST olur', async () => {
    const { model, calls } = setup(catalog())
    const [a, b, c] = await Promise.all([
      model.get(['videos', 10, 'title']),
      model.get(['videos', 11, 'title']),
      model.get(['lists', 'L2', 'summary']),
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.paths).toEqual([
      ['videos', { from: 10, to: 11 }, 'title'],
      ['lists', 'L2', 'summary'],
    ])
    expect(a).toEqual({ videos: { 10: { title: 'Kuzgun' } } })
    expect(b).toEqual({ videos: { 11: { title: 'Bozkır' } } })
    expect(c).toEqual({ lists: { L2: { summary: { displayName: 'Yeni gelenler' } } } })
  })

  it('yalnız eksik yollar ağa gider; tam önbellek isabeti ağa çıkmaz ve devbus fromCache yazar', async () => {
    const { model, calls } = setup(catalog())
    model.setCache({ videos: { 10: { title: atom('Kuzgun') } } })
    const cap = capture()
    try {
      expect(await model.get(['videos', 10, 'title'])).toEqual({ videos: { 10: { title: 'Kuzgun' } } })
      expect(calls).toHaveLength(0)
      await model.get(['videos', [10, 11], 'title'])
      expect(calls).toHaveLength(1)
      expect(calls[0]!.paths).toEqual([['videos', 11, 'title']])
      expect(cap.events[0]!.detail).toMatchObject({ fromCache: true })
      expect(cap.events[1]!.detail).toMatchObject({ fromCache: false, status: 200, traceId: 'trace-1', paths: [['videos', 11, 'title']] })
    } finally {
      cap.stop()
    }
  })

  it('boot önbelleğiyle tohumlanır (ref dahil)', async () => {
    const { model, calls } = setup({})
    model.setCache({ lolomo: ref('lolomos', 'G1'), lolomos: { G1: { summary: atom({ length: 7 }) } } })
    expect(await model.get(['lolomo', 'summary'])).toEqual({ lolomo: { summary: { length: 7 } } })
    expect(calls).toHaveLength(0)
  })

  it('$expires: negatif göreli, pozitif mutlak; bayat yaprak yeniden istenir', async () => {
    const clock = { t: 1_000_000 }
    const graph: JsonGraph = { videos: { 1: { bookmark: atom({ positionSec: 5 }, { $expires: -1000 }) }, 2: { bookmark: atom({ positionSec: 9 }, { $expires: 1_002_000 }) } } }
    const { model, calls } = setup(graph, { clock })
    await model.get(['videos', [1, 2], 'bookmark'])
    expect(calls).toHaveLength(1)
    clock.t += 500
    await model.get(['videos', [1, 2], 'bookmark'])
    expect(calls).toHaveLength(1)
    clock.t += 600 // göreli süre (1000 ms) doldu, mutlak (1 002 000) dolmadı
    await model.get(['videos', [1, 2], 'bookmark'])
    expect(calls).toHaveLength(2)
    expect(calls[1]!.paths).toEqual([['videos', 1, 'bookmark']])
    clock.t = 1_002_001
    await model.get(['videos', 2, 'bookmark'])
    expect(calls).toHaveLength(3)
  })

  it('$expires 0 olan değer o isteğe döner ama önbellekten sunulmaz', async () => {
    const { model, calls } = setup({ usp: { features: { liveTv: atom(true, { $expires: 0 }) } } })
    expect(await model.get(['usp', 'features', 'liveTv'])).toEqual({ usp: { features: { liveTv: true } } })
    await model.get(['usp', 'features', 'liveTv'])
    expect(calls).toHaveLength(2)
  })

  it('invalidate yolu siler (ref üzerinden de), dinleyiciye haber verir', async () => {
    const { model, calls } = setup(catalog())
    await model.get(['lolomo', 0, { from: 0, to: 1 }, 'title'])
    let notified = 0
    const off = model.subscribe(() => notified++)
    model.invalidate(['lolomo', 0, 1, 'title']) // → videos[11].title
    expect(notified).toBe(1)
    expect(model.peek(['videos', 11, 'title']).missing).toEqual([['videos', 11, 'title']])
    expect(model.peek(['videos', 10, 'title']).missing).toEqual([])
    await model.get(['lolomo', 0, { from: 0, to: 1 }, 'title'])
    expect(calls).toHaveLength(2)
    expect(calls[1]!.paths).toEqual([['videos', 11, 'title']])
    off()
  })

  it('hata atomu yalnız o yolu isteyen çağrıyı düşürür', async () => {
    const graph = catalog()
    ;(graph.videos as JsonGraph)['13'] = { title: { $type: 'error', value: { message: 'Bu başlık yok', code: 'NOT_FOUND' } } }
    const { model, calls } = setup(graph)
    const good = model.get(['videos', 10, 'title'])
    const bad = model.get(['videos', [12, 13], 'title'])
    await expect(good).resolves.toEqual({ videos: { 10: { title: 'Kuzgun' } } })
    const err = await bad.catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FalcorPathError)
    expect((err as FalcorPathError).errors).toEqual([{ path: ['videos', 13, 'title'], message: 'Bu başlık yok', code: 'NOT_FOUND' }])
    expect((err as FalcorPathError).json).toEqual({ videos: { 12: { title: 'Sahil' } } })
    expect(calls).toHaveLength(1)
    // Hata önbellekten sunulmaz: yeniden sorulur.
    await expect(model.get(['videos', 13, 'title'])).rejects.toBeInstanceOf(FalcorPathError)
    expect(calls).toHaveLength(2)
  })

  it('HTTP hatası FalcorRequestError olur, sonraki istek yeniden dener', async () => {
    const { model, calls } = setup(catalog(), { status: 500 })
    const err = await model.get(['videos', 10, 'title']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FalcorRequestError)
    expect((err as FalcorRequestError).status).toBe(500)
    expect((err as FalcorRequestError).traceId).toBe('abc')
    await model.get(['videos', 10, 'title']).catch(() => undefined)
    expect(calls).toHaveLength(2)
  })

  it('yoldaki istek aynı yolu tekrar istemez; clear sonrası gelen yanıt önbelleğe yazılmaz', async () => {
    const { model, calls } = setup(catalog())
    const first = model.get(['videos', 10, 'title'])
    await Promise.resolve() // toplu istek yola çıksın
    const second = model.get(['videos', 10, 'title'])
    await Promise.all([first, second])
    expect(calls).toHaveLength(1)

    const pending = model.get(['videos', 11, 'title'])
    await Promise.resolve() // istek yolda
    model.clear()
    await pending
    expect(model.peek(['videos', 11, 'title']).missing).toHaveLength(1)
  })

  it('eksik değer (materialize boş atom) undefined olarak gelir ve tekrar sorulmaz', async () => {
    const { model, calls } = setup(catalog())
    expect(await model.get(['videos', 99, 'title'])).toEqual({})
    expect(await model.get(['videos', 99, 'title'])).toEqual({})
    expect(calls).toHaveLength(1)
  })
})
