/**
 * Falcor JSON Graph yol değerlendiricisi (Netflix Shakti `pathEvaluator` karşılığı).
 *
 * İşleyiş:
 *  1. İstenen yol kümeleri basit yollara açılır (aralıklar, anahtar dizileri); üst sınır aşılırsa hata.
 *  2. Grafikte bulunmayan her yol için en uzun / en özgül yol kalıbı seçilir; aynı kalıba düşen yollar
 *     tek `get` çağrısında toplanır (her kalıp parçası için istenen anahtarların birleşimi).
 *  3. Dönen değerler grafiğe yazılır. Bir yolun ön ekinde `ref` varsa yolun kalanı ref hedefine eklenip
 *     yeniden değerlendirilir (en çok 8 derinlik) — `lolomo[0][3].title` → lolomos → lists → videos.
 *     Ara ref'ler yanıt grafiğinde kalır; istemci önbelleği aynı yolu izler.
 *  4. Hâlâ bulunamayan yollar `materialize=true` ise boş atom olur.
 *
 * Yönlendiriciden bağımsızdır: rotalar dışarıdan verilir (birim testi sahte rotalarla yapılır).
 */
import type { FalcorKey, FalcorPath, JsonGraph, JsonGraphLeaf, PathEvaluatorResponse } from '../../../shared/types'
import type { FalcorMatch, FalcorRoute, FalcorRouteContext, PathValue } from '../kernel/context'
import { asInteger, expandPathSets, normalizePathSet } from './paths'

type Primitive = string | number | boolean | null
interface Branch {
  [key: string]: GNode
}
type GNode = Branch | JsonGraphLeaf | Primitive

export interface FalcorEngineOptions {
  /** Rotalar; her değerlendirmede yeniden okunur (sonradan eklenen rotalar da görülür). */
  routes: readonly FalcorRoute[] | (() => readonly FalcorRoute[])
  /** Açılmış yaprak yol üst sınırı (varsayılan 3000). */
  maxPaths?: number
  /** Ref izleme derinliği (varsayılan 8). */
  maxRefDepth?: number
  /** Rota hata fırlattığında (günlük için). */
  onRouteError?: (err: unknown, route: FalcorRoute, ctx: FalcorRouteContext) => void
}

export interface FalcorEngine {
  evaluate(ctx: FalcorRouteContext, paths: FalcorPath[]): Promise<PathEvaluatorResponse>
}

const LEAF_TYPES = new Set(['atom', 'ref', 'error'])

const isLeaf = (n: unknown): n is JsonGraphLeaf =>
  n !== null && typeof n === 'object' && !Array.isArray(n) && LEAF_TYPES.has((n as { $type?: unknown }).$type as string)
const isBranch = (n: GNode | undefined): n is Branch => n !== null && typeof n === 'object' && !isLeaf(n)

const newBranch = (): Branch => Object.create(null) as Branch
const keyOf = (path: FalcorKey[]) => path.map(String).join('\u0000')

type Walk = { kind: 'found' } | { kind: 'ref'; target: FalcorKey[] } | { kind: 'missing' }

/** Grafikte yolu izler: değer bulundu mu, ön ekte ref mi var, yoksa eksik mi. */
function walk(root: Branch, path: FalcorKey[]): Walk {
  let node: GNode = root
  for (let i = 0; i < path.length; i++) {
    if (!isBranch(node)) {
      if (isLeaf(node) && node.$type === 'ref') return { kind: 'ref', target: [...node.value, ...path.slice(i)] }
      return { kind: 'found' } // atom / hata / ilkel değer ön ekte: yanıt odur
    }
    const branch: Branch = node
    const key = String(path[i])
    if (!(key in branch)) return { kind: 'missing' }
    node = branch[key]!
  }
  return { kind: 'found' }
}

/** Değeri yola yazar; mevcut bir yaprağın altına dal açmaz, dalı yaprakla ezmez. */
function write(root: Branch, path: FalcorKey[], value: GNode): void {
  if (path.length === 0) return
  let node: Branch = root
  for (let i = 0; i < path.length - 1; i++) {
    const key = String(path[i])
    const child: GNode | undefined = node[key]
    if (child === undefined) {
      const b = newBranch()
      node[key] = b
      node = b
    } else if (isBranch(child)) {
      node = child
    } else return
  }
  const last = String(path[path.length - 1])
  if (isBranch(node[last]) && Object.keys(node[last] as Branch).length > 0) return
  node[last] = value
}

const sizeOf = (v: unknown) => 50 + (JSON.stringify(v ?? null)?.length ?? 4)

/** Rota değerini grafik düğümüne çevirir. undefined dönerse yazılmaz. */
function toNode(value: PathValue['value'], materialize: boolean, withSize: boolean): GNode | undefined {
  if (value === undefined) return materialize ? emptyAtom(withSize) : undefined
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return withSize ? { $type: 'atom', value, $size: sizeOf(value) } : value
  }
  if (isLeaf(value)) {
    const leaf = { ...value } as JsonGraphLeaf
    if (withSize && leaf.$type !== 'error') (leaf as { $size?: number }).$size = sizeOf(leaf.value)
    return leaf
  }
  return withSize ? { $type: 'atom', value, $size: sizeOf(value) } : { $type: 'atom', value }
}

const emptyAtom = (withSize: boolean): JsonGraphLeaf => (withSize ? { $type: 'atom', $size: 50 } : { $type: 'atom' })

type Score = number[]
/** Kalıp yolun ön ekiyle eşleşiyor mu; eşleşiyorsa parça başına özgüllük puanı (sabit 3, INTEGERS 2, KEYS 1). */
function score(pattern: FalcorRoute['route'], path: FalcorKey[]): Score | null {
  if (pattern.length === 0 || pattern.length > path.length) return null
  const out: Score = []
  for (let i = 0; i < pattern.length; i++) {
    const seg = pattern[i]!
    const key = path[i]!
    if (seg === 'KEYS') out.push(1)
    else if (seg === 'INTEGERS') {
      if (asInteger(key) === null) return null
      out.push(2)
    } else if (String(key) === seg) out.push(3)
    else return null
  }
  return out
}

function better(a: Score, b: Score): boolean {
  if (a.length !== b.length) return a.length > b.length
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]!
  return false
}

function bestRoute(routes: readonly FalcorRoute[], path: FalcorKey[]): FalcorRoute | null {
  let best: FalcorRoute | null = null
  let bestScore: Score | null = null
  for (const r of routes) {
    const s = score(r.route, path)
    if (s && (!bestScore || better(s, bestScore))) {
      best = r
      bestScore = s
    }
  }
  return best
}

/** Aynı rotaya düşen yollardan kalıp parçası başına anahtar birleşimi. */
function buildMatch(route: FalcorRoute, paths: FalcorKey[][]): FalcorMatch {
  return route.route.map((seg, i) => {
    if (seg !== 'KEYS' && seg !== 'INTEGERS') return [seg]
    const seen = new Set<string>()
    const keys: FalcorKey[] = []
    for (const p of paths) {
      const raw = p[i]!
      const k = seg === 'INTEGERS' ? (asInteger(raw) as number) : raw
      const id = `${typeof k}:${k}`
      if (!seen.has(id)) {
        seen.add(id)
        keys.push(k)
      }
    }
    if (seg === 'INTEGERS') (keys as number[]).sort((a, b) => a - b)
    return keys
  })
}

/**
 * Bir rotanın yollarını, kartezyen çarpımı istenenden fazlasını kapsamayacak alt gruplara böler: son kalıp parçasında
 * aynı anahtar kümesini isteyen ön ekler birlikte gider. Ör. videos[1,2].[title,boxart] + videos[3].[billboardArt]
 * iki çağrı olur; tek çağrıda video 1-3 × üç yaprak (fazladan değerlendirme ve şişkin yanıt) üretilmez.
 */
function partition(route: FalcorRoute, paths: FalcorKey[][]): FalcorKey[][][] {
  const n = route.route.length
  if (n < 2 || paths.length < 2) return [paths]
  const byPrefix = new Map<string, { paths: FalcorKey[][]; last: Set<string> }>()
  for (const p of paths) {
    const k = keyOf(p.slice(0, n - 1))
    let e = byPrefix.get(k)
    if (!e) byPrefix.set(k, (e = { paths: [], last: new Set() }))
    e.paths.push(p)
    e.last.add(String(p[n - 1]))
  }
  const bySignature = new Map<string, FalcorKey[][]>()
  for (const e of byPrefix.values()) {
    const sig = [...e.last].sort().join('\u0000')
    const list = bySignature.get(sig)
    if (list) list.push(...e.paths)
    else bySignature.set(sig, [...e.paths])
  }
  return [...bySignature.values()]
}

interface Item {
  path: FalcorKey[]
  depth: number
}

export function createFalcorEngine(options: FalcorEngineOptions): FalcorEngine {
  const maxPaths = options.maxPaths ?? 3000
  const maxRefDepth = options.maxRefDepth ?? 8
  const getRoutes = () => (typeof options.routes === 'function' ? options.routes() : options.routes)

  async function evaluate(ctx: FalcorRouteContext, rawPaths: FalcorPath[]): Promise<PathEvaluatorResponse> {
    const paths = rawPaths.map(normalizePathSet)
    const materialize = ctx.flags.materialize === 'true'
    const withSize = ctx.flags.withSize === 'true'
    const routes = getRoutes()
    const graph = newBranch()
    const tried = new Set<string>()

    let pending: Item[] = expandPathSets(paths, maxPaths).map((path) => ({ path, depth: 0 }))
    for (let round = 0; pending.length > 0 && round < 4 * (maxRefDepth + 2); round++) {
      const toFetch = new Map<string, Item>()
      for (const start of pending) {
        let cur = start
        for (;;) {
          const w = walk(graph, cur.path)
          if (w.kind === 'found') break
          if (w.kind === 'ref') {
            if (cur.depth >= maxRefDepth) break // ref zinciri çok uzun: ref'in kendisi yanıt olarak kalır
            cur = { path: w.target, depth: cur.depth + 1 }
            continue
          }
          const k = keyOf(cur.path)
          if (tried.has(k)) {
            if (materialize) write(graph, cur.path, emptyAtom(withSize))
          } else if (!toFetch.has(k)) toFetch.set(k, cur)
          break
        }
      }
      if (toFetch.size === 0) break

      // Rotalara göre topla
      const groups = new Map<FalcorRoute, FalcorKey[][]>()
      for (const [k, item] of toFetch) {
        tried.add(k)
        const route = bestRoute(routes, item.path)
        if (!route) continue
        const list = groups.get(route)
        if (list) list.push(item.path)
        else groups.set(route, [item.path])
      }

      const calls = [...groups].flatMap(([route, list]) => partition(route, list).map((ps) => [route, ps] as const))
      await Promise.all(
        calls.map(async ([route, groupPaths]) => {
          try {
            const values = await route.get(ctx, buildMatch(route, groupPaths))
            for (const pv of values ?? []) {
              if (!pv || !Array.isArray(pv.path)) continue
              const node = toNode(pv.value, materialize, withSize)
              if (node !== undefined) write(graph, pv.path, node)
            }
          } catch (err) {
            options.onRouteError?.(err, route, ctx)
            const e = err as { code?: unknown; message?: unknown }
            const hasCode = typeof e?.code === 'string'
            const leaf: JsonGraphLeaf = {
              $type: 'error',
              value: hasCode
                ? { message: String(e.message ?? 'Hata'), code: e.code as string }
                : { message: 'Bu değer şu anda alınamadı.', code: 'INTERNAL' },
            }
            for (const p of groupPaths) {
              const prefix = p.slice(0, route.route.length)
              if (walk(graph, prefix).kind === 'missing') write(graph, prefix, leaf)
            }
          }
        }),
      )
      pending = [...toFetch.values()]
    }

    return { paths, jsonGraph: graph as unknown as JsonGraph }
  }

  return { evaluate }
}
