/**
 * Falcor istemcisi (eski üye API'si, Netflix Shakti karşılığı) — falcor paketi olmadan, sıfırdan.
 *
 * Model bir JSON Graph önbelleği tutar. `get(...yolKümeleri)`:
 *   1. önbellekte yolları yürür: ref'leri izler (zincirleme), aralık ve anahtar kümelerini açar;
 *   2. eksik ya da süresi dolmuş yolları toplar; aynı tikteki TÜM `get` çağrılarının eksikleri TEK POST'ta gider;
 *   3. yanıt grafiğini önbelleğe birleştirir ve istenen yolların biçiminde düz JSON döndürür.
 * Hiçbir yol eksik değilse ağa çıkılmaz (devbus'a `fromCache: true` yazılır).
 *
 * İstek (docs/MIMARI.md §6):
 *   POST /api/member/pathEvaluator?webp=true&isTop10Supported=true&...&materialize=true
 *   gövde (form kodlu): path=<JSON>&path=<JSON>&authURL=<boot.authURL>
 *
 * Süre: `$expires` < 0 → alındığı andan itibaren göreli ms; > 1 → mutlak epoch ms; 0 → hemen bayat
 * (yalnız o isteğe döner, sonra yeniden istenir); 1 → hiç bayatlamaz (Falcor geleneği).
 * Hata atomu (`$type: 'error'`) yalnız o yolu isteyen `get` çağrısını FalcorPathError ile düşürür;
 * aynı toplu istekteki diğer çağrılar etkilenmez ve hata önbellekten sunulmaz (sonraki istekte yeniden sorulur).
 */
import { HEADERS, ROUTES } from '../../../shared/constants'
import type { FalcorKey, FalcorKeySet, FalcorPath, FalcorRange, JsonGraph, JsonGraphLeaf, PathEvaluatorResponse } from '../../../shared/types'
import { devbus } from '../lib/devbus'
import { peekBoot, sessionHeaders } from './session'

/** Sorgu dizgesindeki yetenek bayrakları (eski usul yetenek pazarlığı). */
export const FALCOR_FLAGS: Readonly<Record<string, string>> = {
  webp: 'true',
  isTop10Supported: 'true',
  hasVideoMerchInBob: 'true',
  falcor_server: '0.1.0',
  withSize: 'true',
  materialize: 'true',
}

/** `get` sonucu: istenen yolların biçiminde düz JSON (sayısal anahtarlar dizge olur: json.lolomo["0"]). */
export type FalcorJson = { [key: string]: unknown }

export interface FalcorErrorItem {
  /** Grafikteki (ref'ler izlendikten sonraki) yol */
  path: FalcorKey[]
  message: string
  code?: string
}

/** Bir ya da daha çok yol sunucudan hata atomu döndü. `json` diğer yolların değerlerini taşır. */
export class FalcorPathError extends Error {
  readonly errors: FalcorErrorItem[]
  readonly json: FalcorJson
  constructor(errors: FalcorErrorItem[], json: FalcorJson) {
    super(errors[0]?.message ?? 'Falcor yol hatası')
    this.name = 'FalcorPathError'
    this.errors = errors
    this.json = json
  }
}

/** pathEvaluator isteği başarısız (ağ ya da HTTP durumu). */
export class FalcorRequestError extends Error {
  readonly status: number
  readonly traceId: string | null
  constructor(message: string, status: number, traceId: string | null) {
    super(message)
    this.name = 'FalcorRequestError'
    this.status = status
    this.traceId = traceId
  }
}

export interface FalcorModelOptions {
  /** Test için enjekte edilebilir fetch */
  fetch?: (input: string, init: RequestInit) => Promise<Response>
  /** Uç adresi (varsayılan ROUTES.PATH_EVALUATOR) */
  url?: string
  /** Saat (varsayılan Date.now) */
  now?: () => number
  /** İstek başlıkları (varsayılan sessionHeaders()) */
  getHeaders?: () => Record<string, string>
  /** Gövdedeki authURL (varsayılan boot.authURL) */
  getAuthURL?: () => string | null
  /** Toplama zamanlayıcısı (varsayılan queueMicrotask: aynı tikteki çağrılar tek istekte) */
  schedule?: (fn: () => void) => void
}

type CacheNode = JsonGraph | JsonGraphLeaf
const MAX_HOPS = 32
const MAX_ROUNDS = 3

const isLeaf = (n: unknown): n is JsonGraphLeaf => typeof n === 'object' && n !== null && '$type' in n
const isRange = (k: unknown): k is FalcorRange => typeof k === 'object' && k !== null && 'from' in k && 'to' in k
const pathKey = (p: FalcorPath): string => JSON.stringify(p)

/** Anahtar kümesini somut anahtarlara açar: 3 → [3], {from:0,to:2} → [0,1,2], ['a',{from:1,to:2}] → ['a',1,2]. */
export function expandKeySet(ks: FalcorKeySet): FalcorKey[] {
  const out: FalcorKey[] = []
  const add = (k: FalcorKey | FalcorRange) => {
    if (isRange(k)) {
      for (let i = k.from; i <= k.to; i++) out.push(i)
    } else out.push(k)
  }
  if (Array.isArray(ks)) ks.forEach(add)
  else add(ks)
  return out
}

/** Somut anahtarları en kısa anahtar kümesine sıkıştırır: [0,1,2,'x'] → [{from:0,to:2},'x']. */
function compactKeys(keys: FalcorKey[]): FalcorKeySet {
  const nums = [...new Set(keys.filter((k): k is number => typeof k === 'number'))].sort((a, b) => a - b)
  const strs = [...new Set(keys.filter((k): k is string => typeof k === 'string'))]
  const parts: (FalcorKey | FalcorRange)[] = []
  for (let i = 0; i < nums.length; ) {
    let j = i
    while (j + 1 < nums.length && nums[j + 1] === nums[j]! + 1) j++
    parts.push(j > i ? { from: nums[i]!, to: nums[j]! } : nums[i]!)
    i = j + 1
  }
  parts.push(...strs)
  return parts.length === 1 ? parts[0]! : parts
}

/**
 * Yol kümelerini birleştirir: yalnız tek bir konumda farklılaşan yollar o konumda tek anahtar kümesine toplanır.
 *   [lists,L,0,title] + [lists,L,1,title] → [lists,L,{from:0,to:1},title]
 */
export function collapsePaths(paths: FalcorPath[]): FalcorPath[] {
  const seen = new Set<string>()
  let cur = paths.filter((p) => {
    const k = pathKey(p)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  let changed = true
  while (changed && cur.length > 1) {
    changed = false
    const maxLen = Math.max(...cur.map((p) => p.length))
    for (let i = 0; i < maxLen; i++) {
      const groups = new Map<string, { base: FalcorPath; keys: FalcorKey[] }>()
      for (const p of cur) {
        const sig = i < p.length ? `${p.length}|${JSON.stringify(p.map((k, j) => (j === i ? null : k)))}` : `=${pathKey(p)}`
        let g = groups.get(sig)
        if (!g) {
          g = { base: p, keys: [] }
          groups.set(sig, g)
        }
        if (i < p.length) g.keys.push(...expandKeySet(p[i]!))
      }
      if (groups.size < cur.length) changed = true
      cur = [...groups.values()].map((g) => {
        if (!g.keys.length) return g.base
        const p = g.base.slice()
        p[i] = compactKeys(g.keys)
        return p
      })
    }
  }
  return cur
}

/** Derin birleştirme (çıktı JSON'u için). */
function mergeJson(into: FalcorJson, from: FalcorJson): void {
  for (const [k, v] of Object.entries(from)) {
    const cur = into[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      mergeJson(cur as FalcorJson, v as FalcorJson)
    } else into[k] = v
  }
}

interface WalkResult {
  json: FalcorJson
  missing: FalcorPath[]
  errors: FalcorErrorItem[]
}

interface Pending {
  paths: FalcorPath[]
  resolve: () => void
  reject: (err: unknown) => void
}

export class FalcorModel {
  private root: JsonGraph = {}
  private generation = 0
  private queue: Pending[] = []
  private scheduled = false
  private readonly inflight = new Map<string, Promise<void>>()
  private readonly listeners = new Set<() => void>()
  private readonly fetchImpl: (input: string, init: RequestInit) => Promise<Response>
  private readonly url: string
  private readonly now: () => number
  private readonly getHeaders: () => Record<string, string>
  private readonly getAuthURL: () => string | null
  private readonly schedule: (fn: () => void) => void

  constructor(opts: FalcorModelOptions = {}) {
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init))
    this.url = opts.url ?? ROUTES.PATH_EVALUATOR
    this.now = opts.now ?? (() => Date.now())
    this.getHeaders = opts.getHeaders ?? sessionHeaders
    this.getAuthURL = opts.getAuthURL ?? (() => peekBoot()?.authURL ?? null)
    this.schedule = opts.schedule ?? ((fn) => queueMicrotask(fn))
  }

  /* ───────────── Okuma ───────────── */

  /**
   * Yolları önbellekten, eksikleri ağdan alır. Aynı tikteki tüm çağrılar tek POST'ta toplanır.
   * Örnek: `get(['lolomo', {from:0,to:4}, 'summary'], ['lolomo', 0, {from:0,to:9}, ['title','boxart']])`
   */
  get<T = FalcorJson>(...pathSets: FalcorPath[]): Promise<T> {
    const t0 = performance.now()
    const first = this.walk(pathSets, true)
    if (!first.missing.length) {
      devbus.emit('falcor', `${pathSets.length} yol (önbellek)`, { paths: pathSets, fromCache: true, missing: 0 }, { ms: performance.now() - t0 })
      return Promise.resolve(first.json as T)
    }
    return this.resolveMissing(pathSets, first.missing) as Promise<T>
  }

  /** Ağa çıkmadan önbellekten okur; `missing` boşsa veri tamdır. */
  peek<T = FalcorJson>(...pathSets: FalcorPath[]): { json: T; missing: FalcorPath[] } {
    const r = this.walk(pathSets, true)
    return { json: r.json as T, missing: r.missing }
  }

  /** Ham önbellek (Kaputun altı paneli için; salt okunur kabul edin). */
  getCache(): JsonGraph {
    return this.root
  }

  /* ───────────── Yazma / yaşam döngüsü ───────────── */

  /** Önbelleği JSON Graph ile tohumlar (boot.falcorCache). Var olanla birleşir. */
  setCache(graph: JsonGraph): void {
    this.merge(graph)
    this.notify()
  }

  /** Yolları önbellekten siler (ara ref'ler izlenir); dinleyicilere haber verir. */
  invalidate(...pathSets: FalcorPath[]): void {
    for (const p of pathSets) if (p.length) this.remove(this.root, p, 0)
    this.notify()
  }

  /** Önbelleği tamamen boşaltır (profil değişimi, çıkış). Yoldaki yanıtlar artık önbelleğe yazılmaz. */
  clear(): void {
    this.root = {}
    this.generation++
    this.notify()
  }

  /** Önbellek her değiştiğinde çağrılır (birleştirme, silme, temizleme). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /* ───────────── İç işleyiş ───────────── */

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l()
      } catch {
        /* dinleyici hatası modeli bozmaz */
      }
    }
  }

  private async resolveMissing(pathSets: FalcorPath[], missing: FalcorPath[]): Promise<FalcorJson> {
    const asked = new Set<string>()
    for (let round = 0; round < MAX_ROUNDS && missing.length; round++) {
      const toFetch = missing.filter((p) => !asked.has(pathKey(p)))
      if (!toFetch.length) break
      toFetch.forEach((p) => asked.add(pathKey(p)))
      await this.fetchPaths(toFetch)
      // Yanıt geldi: bayat/hata yaprakları artık "cevaplanmış" sayılır; yalnız hiç gelmeyen düğümler yeniden sorulur.
      missing = this.walk(pathSets, false).missing
    }
    // Son okuma: bu istek için gelen bayat/hata yaprakları da okunur.
    const final = this.walk(pathSets, false)
    if (final.errors.length) throw new FalcorPathError(final.errors, final.json)
    return final.json
  }

  /** Eksik yolları bu tikin toplu isteğine ekler; zaten yolda olanları bekler. */
  private fetchPaths(paths: FalcorPath[]): Promise<void> {
    const waits: Promise<void>[] = []
    const fresh: FalcorPath[] = []
    for (const p of paths) {
      const running = this.inflight.get(pathKey(p))
      if (running) waits.push(running)
      else fresh.push(p)
    }
    if (fresh.length) {
      const promise = new Promise<void>((resolve, reject) => this.queue.push({ paths: fresh, resolve, reject }))
      for (const p of fresh) this.inflight.set(pathKey(p), promise)
      if (!this.scheduled) {
        this.scheduled = true
        this.schedule(() => this.flush())
      }
      waits.push(promise)
    }
    return Promise.all(waits).then(() => undefined)
  }

  private flush(): void {
    this.scheduled = false
    const batch = this.queue
    this.queue = []
    if (!batch.length) return
    const paths = collapsePaths(batch.flatMap((b) => b.paths))
    this.send(paths)
      .then(
        () => batch.forEach((b) => b.resolve()),
        (err: unknown) => batch.forEach((b) => b.reject(err)),
      )
      .finally(() => {
        for (const b of batch) for (const p of b.paths) this.inflight.delete(pathKey(p))
      })
  }

  private async send(paths: FalcorPath[]): Promise<void> {
    const gen = this.generation
    const url = `${this.url}?${new URLSearchParams(FALCOR_FLAGS).toString()}`
    const body = new URLSearchParams()
    for (const p of paths) body.append('path', JSON.stringify(p))
    const auth = this.getAuthURL()
    if (auth) body.append('authURL', auth)
    const label = `${paths.length} yol`
    const t0 = performance.now()
    let res: Response
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { ...this.getHeaders(), 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: body.toString(),
      })
    } catch (err) {
      devbus.emit('falcor', label, { paths, flags: FALCOR_FLAGS, status: 0, traceId: null, fromCache: false, missing: paths.length, error: String(err) }, { ms: performance.now() - t0, ok: false })
      throw new FalcorRequestError('Sunucuya ulaşılamadı', 0, null)
    }
    const traceId = res.headers.get(HEADERS.TRACE_ID)
    const text = await res.text()
    const ms = performance.now() - t0
    const detail = { paths, flags: FALCOR_FLAGS, status: res.status, traceId, fromCache: false, missing: paths.length, bytes: text.length }
    if (!res.ok) {
      devbus.emit('falcor', label, detail, { ms, ok: false })
      throw new FalcorRequestError(`pathEvaluator yanıtı ${res.status}`, res.status, traceId)
    }
    let data: PathEvaluatorResponse
    try {
      data = JSON.parse(text) as PathEvaluatorResponse
    } catch {
      devbus.emit('falcor', label, { ...detail, error: 'JSON değil' }, { ms, ok: false })
      throw new FalcorRequestError('pathEvaluator yanıtı okunamadı', res.status, traceId)
    }
    devbus.emit('falcor', label, detail, { ms, ok: true })
    if (gen !== this.generation) return // arada önbellek temizlendi (profil değişti): eski yanıtı yazma
    this.merge(data.jsonGraph ?? {})
    this.notify()
  }

  /** Bayat mı? (`$expires` birleştirmede mutlak zamana çevrilir.) */
  private expired(leaf: JsonGraphLeaf): boolean {
    const e = (leaf as { $expires?: number }).$expires
    if (e === undefined || e === 1) return false
    if (e === 0) return true
    return e <= this.now()
  }

  private merge(graph: JsonGraph): void {
    const now = this.now()
    const into = (target: JsonGraph, src: JsonGraph) => {
      for (const [key, value] of Object.entries(src)) {
        if (value === null || typeof value !== 'object') continue
        if (isLeaf(value)) {
          const leaf = { ...value } as JsonGraphLeaf & { $expires?: number }
          if (typeof leaf.$expires === 'number' && leaf.$expires < 0) leaf.$expires = now - leaf.$expires
          target[key] = leaf
        } else {
          const cur = target[key]
          const branch: JsonGraph = cur && !isLeaf(cur) ? cur : {}
          target[key] = branch
          into(branch, value)
        }
      }
    }
    into(this.root, graph)
  }

  /**
   * Yolları yürür. `strict` (ilk okuma): bayat ve hata yaprakları eksik sayılır, ağdan istenir.
   * Değilse (yanıt geldikten sonra) okunur ve hatalar toplanır; yalnız hiç olmayan düğümler eksiktir.
   */
  private walk(pathSets: FalcorPath[], strict: boolean): WalkResult {
    const missing: FalcorPath[] = []
    const errors: FalcorErrorItem[] = []
    const stale = (leaf: JsonGraphLeaf) => strict && (leaf.$type === 'error' || this.expired(leaf))

    /** Ref hedefini kökten çözer (zincirleme ref'ler dahil). Hedef yoksa node undefined, `at` eksik yolu taşır. */
    const follow = (target: FalcorKey[], hops: number): { node: CacheNode | undefined; at: FalcorKey[] } | null => {
      if (hops > MAX_HOPS) return null
      let node: CacheNode | undefined = this.root
      let at: FalcorKey[] = []
      for (const k of target) {
        if (node !== undefined && isLeaf(node)) {
          if (node.$type !== 'ref') return null
          if (stale(node)) node = undefined
          else {
            const r = follow(node.value, hops + 1)
            if (!r) return null
            node = r.node
            at = r.at.slice()
          }
        }
        node = node === undefined || isLeaf(node) ? undefined : node[String(k)]
        at.push(k)
      }
      if (node !== undefined && isLeaf(node) && node.$type === 'ref' && !stale(node)) return follow(node.value, hops + 1)
      return { node, at }
    }

    const visit = (node: CacheNode | undefined, at: FalcorKey[], rest: FalcorKeySet[], hops: number): unknown => {
      if (node === undefined) {
        missing.push([...at, ...rest])
        return undefined
      }
      if (isLeaf(node)) {
        if (stale(node)) {
          missing.push([...at, ...rest])
          return undefined
        }
        if (node.$type === 'error') {
          errors.push({ path: at, message: node.value?.message ?? 'Bilinmeyen hata', code: node.value?.code })
          return undefined
        }
        if (node.$type === 'ref') {
          if (!rest.length) return node.value.slice()
          // Ref'in hedefinden devam; çıktı istenen yolun biçiminde kalır, eksik yol hedef (optimize) yola yazılır.
          const r = follow(node.value, hops + 1)
          if (!r) {
            errors.push({ path: at, message: 'Ref çözülemedi (döngü ya da atom üzerinden yol)' })
            return undefined
          }
          return visit(r.node, r.at, rest, hops + 1)
        }
        return rest.length ? undefined : node.value
      }
      if (!rest.length) return undefined // dal istendi: Falcor'da olduğu gibi değer yok
      const [head, ...tail] = rest
      let out: FalcorJson | undefined
      for (const k of expandKeySet(head!)) {
        const v = visit(node[String(k)], [...at, k], tail, hops)
        if (v !== undefined) (out ??= {})[String(k)] = v
      }
      return out
    }

    const json: FalcorJson = {}
    for (const p of pathSets) {
      if (!p.length) continue
      const v = visit(this.root, [], p, 0)
      if (v && typeof v === 'object' && !Array.isArray(v)) mergeJson(json, v as FalcorJson)
    }
    return { json, missing: collapsePaths(missing), errors }
  }

  private remove(node: JsonGraph, path: FalcorKeySet[], hops: number): void {
    const [head, ...rest] = path
    for (const k of expandKeySet(head!)) {
      const key = String(k)
      if (!rest.length) {
        delete node[key]
        continue
      }
      const child = node[key]
      if (child === undefined) continue
      if (isLeaf(child)) {
        if (child.$type === 'ref' && hops < MAX_HOPS) this.remove(this.root, [...child.value, ...rest], hops + 1)
        continue
      }
      this.remove(child, rest, hops)
    }
  }
}

/** Uygulamanın tek Falcor modeli (oturum başlıkları ve boot.authURL ile). */
export const falcor = new FalcorModel()
