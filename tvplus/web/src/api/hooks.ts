/**
 * Veri kancaları (harici veri kütüphanesi yok):
 *   useFalcor(yolKümeleri, deps)   — eski sistem (lolomo satırları); önbellek Falcor modelinin kendisi.
 *   useGql(işlemAdı, değişkenler, { ttlMs, enabled }) — yeni sistem (kalıcı sorgular); bellek içi önbellek + TTL,
 *     yoldaki aynı isteği tekilleştirme, profil değişince yeniden çekme.
 * İkisi de { data, error, loading, refetch } döndürür; veri varken yeniden çekmede eski veri ekranda kalır.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DependencyList } from 'react'
import type { FalcorPath } from '../../../shared/types'
import { devbus } from '../lib/devbus'
import { falcor, type FalcorJson } from './falcor'
import { gql } from './graphql'
import { onBootChange, peekBoot } from './session'

export interface QueryResult<T> {
  data: T | undefined
  error: Error | null
  /** İlk yükleme ya da yeniden çekme sürüyor */
  loading: boolean
  /** Önbelleği atlayarak yeniden çeker ("Tekrar dene") */
  refetch: () => void
}

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)))

/* ───────────── useFalcor ───────────── */

interface FalcorState<T> {
  data: T | undefined
  error: Error | null
  loading: boolean
}

/**
 * Falcor yollarını okur. Önbellekte tamsa ilk boyamada veri hazırdır (boot.falcorCache tohumu sayesinde).
 * Önbellek değişince (invalidate / clear / başka isteklerin birleşmesi) kendi yollarını yeniden okur;
 * yolları eksik kaldıysa yeniden ister. `deps` değişince yol kümeleri yeniden değerlendirilir.
 *
 *   const { data } = useFalcor<{ lolomo: Record<string, { summary: ListSummary }> }>(
 *     [['lolomo', { from: 0, to: 6 }, 'summary']], [])
 */
export function useFalcor<T = FalcorJson>(pathSets: FalcorPath[], deps: DependencyList): QueryResult<T> {
  const paths = useMemo(() => pathSets, deps) // yol kümeleri çağıranın deps'ine bağlı
  const key = JSON.stringify(paths)
  const [state, setState] = useState<FalcorState<T>>(() => {
    const p = falcor.peek<T>(...paths)
    return p.missing.length ? { data: undefined, error: null, loading: true } : { data: p.json, error: null, loading: false }
  })
  const [nonce, setNonce] = useState(0)
  const busy = useRef(false)
  const pathsRef = useRef(paths)
  pathsRef.current = paths

  useEffect(() => {
    let alive = true
    busy.current = true
    if (falcor.peek(...paths).missing.length) setState((s) => (s.loading && !s.error ? s : { ...s, loading: true, error: null }))
    falcor.get<T>(...paths).then(
      (data) => {
        if (!alive) return
        busy.current = false
        setState({ data, error: null, loading: false })
      },
      (err: unknown) => {
        if (!alive) return
        busy.current = false
        setState((s) => ({ data: s.data, error: toError(err), loading: false }))
      },
    )
    return () => {
      alive = false
      busy.current = false
    }
  }, [key, nonce]) // key, paths'in içeriğidir

  useEffect(
    () =>
      falcor.subscribe(() => {
        if (busy.current) return
        const p = falcor.peek<T>(...pathsRef.current)
        if (p.missing.length) {
          setNonce((n) => n + 1)
          return
        }
        setState((s) => (s.error === null && JSON.stringify(s.data) === JSON.stringify(p.json) ? s : { data: p.json, error: null, loading: false }))
      }),
    [key],
  )

  const refetch = useCallback(() => {
    falcor.invalidate(...pathsRef.current)
    setNonce((n) => n + 1)
  }, [])

  return { ...state, refetch }
}

/* ───────────── useGql + queryCache ───────────── */

interface Entry {
  data?: unknown
  error?: Error
  /** son yanıt anı (epoch ms) */
  at: number
  /** yoldaki istek (tekilleştirme) */
  promise?: Promise<void>
}

const entries = new Map<string, Entry>()
const cacheListeners = new Set<() => void>()
const notifyCache = () => cacheListeners.forEach((l) => l())
const subscribeCache = (fn: () => void) => {
  cacheListeners.add(fn)
  return () => {
    cacheListeners.delete(fn)
  }
}

/** Anahtar sırası bağımsız JSON (değişken nesneleri için). */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`
}

const opOf = (key: string) => key.slice(0, key.indexOf('|'))
/** Hatalı girdiler bu süreden sonra yeniden bağlanan kancada kendiliğinden tekrar denenir. */
const ERROR_RETRY_MS = 5000

function runQuery(key: string, operationName: string, variables: object): Promise<void> {
  const cur = entries.get(key)
  if (cur?.promise) return cur.promise
  const promise = gql<unknown, object>(operationName, variables).then(
    (data) => {
      if (entries.get(key)?.promise !== promise) return // arada geçersiz kılındı
      entries.set(key, { data, at: Date.now() })
      notifyCache()
    },
    (err: unknown) => {
      if (entries.get(key)?.promise !== promise) return
      entries.set(key, { data: cur?.data, error: toError(err), at: Date.now() })
      notifyCache()
    },
  )
  entries.set(key, { ...(cur ?? { at: 0 }), promise })
  notifyCache()
  return promise
}

/** GraphQL sorgu önbelleği. Profil değişince ve çıkışta oturum deposu tamamen boşaltır. */
export const queryCache = {
  /** İşlem adı verilirse yalnız onun girdileri, verilmezse hepsi silinir; bağlı kancalar yeniden çeker. */
  invalidate(operationName?: string): void {
    for (const key of [...entries.keys()]) if (!operationName || opOf(key) === operationName) entries.delete(key)
    notifyCache()
  },
  /** Tanılama: önbellekteki anahtarlar */
  keys(): string[] {
    return [...entries.keys()]
  },
}

const subscribeBoot = (fn: () => void) => onBootChange(fn)
const activeProfileGuid = () => peekBoot()?.activeProfile?.guid ?? ''

export interface GqlOptions {
  /** Önbellek ömrü (ms); varsayılan 60 sn. 0 = her bağlanmada yeniden çek. */
  ttlMs?: number
  /** false iken istek atılmaz (ör. değişken henüz yok) */
  enabled?: boolean
}

/**
 *   const { data, loading, error, refetch } = useGql<DetailModalData, { videoId: number }>('DetailModal', { videoId })
 * Önbellek anahtarı: işlem adı + değişkenler + etkin profil (profil değişince kendiliğinden yeniden çekilir).
 */
export function useGql<TData, TVars extends object = Record<string, never>>(operationName: string, variables?: TVars, opts: GqlOptions = {}): QueryResult<TData> {
  const ttl = opts.ttlMs ?? 60_000
  const enabled = opts.enabled ?? true
  const profile = useSyncExternalStore(subscribeBoot, activeProfileGuid, activeProfileGuid)
  const varsKey = stableStringify(variables ?? {})
  const key = `${operationName}|${varsKey}|${profile}`
  const entry = useSyncExternalStore(
    subscribeCache,
    () => entries.get(key),
    () => entries.get(key),
  )
  const varsRef = useRef<object>(variables ?? {})
  varsRef.current = variables ?? {}
  const fetchedKey = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (entry?.promise) return
    const age = entry ? Date.now() - entry.at : Infinity
    if (entry && entry.error === undefined && entry.data !== undefined && age < ttl) {
      // Önbellekten sunuldu (bu kancanın kendi isteğinin hemen dönüşü sayılmaz).
      if (fetchedKey.current !== key) devbus.emit('cache', `${operationName}: isabet`, { key, expires: entry.at + ttl, ageMs: age })
      fetchedKey.current = key
      return
    }
    if (entry?.error && age < ERROR_RETRY_MS) return
    fetchedKey.current = key
    void runQuery(key, operationName, varsRef.current)
  }, [key, enabled, ttl, entry])

  const refetch = useCallback(() => {
    const cur = entries.get(key)
    if (cur?.promise) return
    void runQuery(key, operationName, varsRef.current)
  }, [key, operationName])

  return {
    data: entry?.data as TData | undefined,
    error: entry?.error ?? null,
    loading: enabled && (entry === undefined || entry.promise !== undefined),
    refetch,
  }
}
