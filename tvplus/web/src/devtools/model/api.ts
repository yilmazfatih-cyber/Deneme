/**
 * "API" sekmesinin görünüm modeli: yan yana çalışan iki API sistemi.
 *   GraphQL (yeni) — kalıcı sorgu: yalnızca işlem adı + kimlik + sürüm gider, sorgu metni asla.
 *   Falcor (eski)  — pathEvaluator: istemci JSON Graph yolları ister; bir kısmı istemci önbelleğinden döner.
 */
import type { DevEvent } from '../../lib/devbus'
import { arr, bool, field, num, obj, str } from './read'

export interface GqlCall {
  id: number
  at: number
  op: string
  pqId: string | null
  version: number | null
  variables: unknown
  ms: number | null
  traceId: string | null
  bytes: number | null
  status: number | null
  ok: boolean
  error: string | null
}
export interface FalcorCall {
  id: number
  at: number
  label: string
  paths: unknown[]
  fromCache: boolean
  ms: number | null
  traceId: string | null
  status: number | null
  missing: number | null
  ok: boolean
  error: string | null
}
export interface ApiStats {
  count: number
  errors: number
  /** ağdan giden istekler (Falcor'da önbellek isabetleri hariç) */
  network: number
  cacheHits: number
  totalMs: number
  timed: number
}
export interface ApiState {
  graphql: GqlCall[] // en yeni başta
  falcor: FalcorCall[]
  gqlStats: ApiStats
  falcorStats: ApiStats
}

export const API_LIST_MAX = 100

function emptyStats(): ApiStats {
  return { count: 0, errors: 0, network: 0, cacheHits: 0, totalMs: 0, timed: 0 }
}
export function initialApi(): ApiState {
  return { graphql: [], falcor: [], gqlStats: emptyStats(), falcorStats: emptyStats() }
}

export function averageMs(s: ApiStats): number | null {
  return s.timed ? s.totalMs / s.timed : null
}

function errorText(d: Record<string, unknown> | undefined): string | null {
  const first = obj(arr(field(d, 'errors'))[0])
  if (first) {
    const code = str(obj(first.extensions)?.code)
    return code ?? str(first.message)
  }
  return str(field(d, 'error'))
}

function bump(s: ApiStats, ok: boolean, ms: number | null, cache: boolean): ApiStats {
  const timed = ms !== null && !cache
  return {
    count: s.count + 1,
    errors: s.errors + (ok ? 0 : 1),
    network: s.network + (cache ? 0 : 1),
    cacheHits: s.cacheHits + (cache ? 1 : 0),
    totalMs: s.totalMs + (timed ? ms : 0),
    timed: s.timed + (timed ? 1 : 0),
  }
}

export function reduceApi(s: ApiState, e: DevEvent): ApiState {
  const d = e.detail
  const ms = e.ms ?? null
  if (e.cat === 'graphql') {
    const call: GqlCall = {
      id: e.id,
      at: e.at,
      op: e.label,
      pqId: str(field(d, 'id')),
      version: num(field(d, 'version')),
      variables: field(d, 'variables') ?? {},
      ms,
      traceId: str(field(d, 'traceId')),
      bytes: num(field(d, 'bytes')),
      status: num(field(d, 'status')),
      ok: e.ok,
      error: e.ok ? null : (errorText(d) ?? 'hata'),
    }
    return { ...s, graphql: [call, ...s.graphql].slice(0, API_LIST_MAX), gqlStats: bump(s.gqlStats, e.ok, ms, false) }
  }
  if (e.cat === 'falcor') {
    const fromCache = bool(field(d, 'fromCache')) ?? false
    const missingRaw = field(d, 'missing')
    const call: FalcorCall = {
      id: e.id,
      at: e.at,
      label: e.label,
      paths: arr(field(d, 'paths')),
      fromCache,
      ms,
      traceId: str(field(d, 'traceId')),
      status: num(field(d, 'status')),
      missing: Array.isArray(missingRaw) ? missingRaw.length : num(missingRaw),
      ok: e.ok,
      error: e.ok ? null : (errorText(d) ?? 'hata'),
    }
    return {
      ...s,
      falcor: [call, ...s.falcor].slice(0, API_LIST_MAX),
      falcorStats: bump(s.falcorStats, e.ok, ms, fromCache),
    }
  }
  return s
}

/* ───────────── Falcor yol biçimleyici ───────────── */

function keyText(k: unknown): string {
  if (typeof k === 'number') return String(k)
  if (typeof k === 'string') return JSON.stringify(k)
  const o = obj(k)
  if (o) {
    const from = num(o.from) ?? 0
    const to = num(o.to) ?? (num(o.length) !== null ? from + (num(o.length) ?? 1) - 1 : from)
    return `${from}..${to}`
  }
  return String(k)
}

const IDENT = /^[A-Za-z_$][\w$]*$/

/**
 * Falcor yolunu okunur hale getirir: ["lolomo", 0, {from:0,to:9}, "title"] → lolomo[0][0..9].title
 * Anahtar kümeleri: ["videos", [1,2], ["title","boxart"]] → videos[1,2]["title","boxart"]
 */
export function formatFalcorPath(path: unknown): string {
  if (!Array.isArray(path)) return String(path)
  let out = ''
  path.forEach((seg, i) => {
    if (typeof seg === 'string' && IDENT.test(seg)) {
      out += i === 0 ? seg : `.${seg}`
    } else if (Array.isArray(seg)) {
      out += `[${seg.map(keyText).join(',')}]`
    } else {
      out += `[${keyText(seg)}]`
    }
  })
  return out
}
