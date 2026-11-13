/**
 * Arama sorgusu: 250 ms gecikmeli, AbortController ile iptal edilir; yanıt sunucunun `expires` anına kadar
 * önbellekten verilir (isabet ağa HİÇ çıkmaz). Her isabet/ıska "Kaputun altı" paneline `cache` olayı yollar.
 * Yeni sorgu sürerken eski sonuç ekranda kalır.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useActiveProfile } from '../../app'
import { gql } from '../../api/graphql'
import { devbus } from '../../lib/devbus'
import { logEvent } from '../../telemetry/logger'
import {
  buildDeclaration,
  declarationSignature,
  type EntityKindName,
  type SearchPageCapabilities,
} from './capabilities'
import { filtersInput, sectionCounts, type Filters, type SearchPageData, type SearchResponse } from './searchModel'
import { searchCache } from './searchStore'
import { searchCacheKey } from './ttlCache'

export const DEBOUNCE_MS = 250
export const PAGE_SIZE = 48

export interface SearchState {
  data?: SearchPageData
  /** Ekrandaki verinin terimi (eski veri gösteriliyorsa yeni terimden farklıdır) */
  dataKey: string | null
  loading: boolean
  error: Error | null
  fromCache: boolean
  declaration: SearchPageCapabilities
  retry: () => void
  /** Önbelleği atlayarak bu sorguyu yeniden çeker (ör. son aramalar silinince) */
  reload: () => void
}

function logSearch(page: SearchPageData, fromCache: boolean): void {
  logEvent(
    'search',
    {
      termLength: page.searchTerm.trim().length,
      counts: sectionCounts(page),
      correction: page.correction?.mode ?? null,
      isFallback: page.isFallback,
      fromCache,
      requestId: page.requestId,
    },
    null,
  )
}

export function useSearch(
  term: string,
  filters: Filters,
  enabledKinds: ReadonlySet<EntityKindName>,
  exactTerm = false,
): SearchState {
  const profile = useActiveProfile()?.guid ?? ''
  const kindsKey = [...enabledKinds].sort().join(',')
  const declaration = useMemo(() => buildDeclaration(enabledKinds), [kindsKey])
  const signature = declarationSignature(declaration)
  const fInput = filtersInput(filters)
  const key = searchCacheKey({ profile, term, filters: fInput ?? null, capabilities: signature, exact: exactTerm })

  const [state, setState] = useState<{
    data?: SearchPageData
    dataKey: string | null
    loading: boolean
    error: Error | null
    fromCache: boolean
  }>({
    dataKey: null,
    loading: true,
    error: null,
    fromCache: false,
  })
  const [nonce, setNonce] = useState(0)
  const hasData = useRef(false)
  const live = useRef({ term, declaration, fInput, exactTerm })
  live.current = { term, declaration, fInput, exactTerm }

  useEffect(() => {
    const hit = searchCache.get(key, Date.now())
    if (hit) {
      devbus.emit('cache', 'arama: isabet', { key, expires: hit.expires, ageMs: hit.ageMs })
      setState({ data: hit.value.searchPage, dataKey: key, loading: false, error: null, fromCache: true })
      hasData.current = true
      logSearch(hit.value.searchPage, true)
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    const ctrl = new AbortController()
    const { term: t, declaration: d, fInput: f, exactTerm: x } = live.current
    const timer = window.setTimeout(
      () => {
        devbus.emit('cache', 'arama: ıska', { key, expires: null, ageMs: null })
        const t0 = Date.now()
        gql<SearchResponse, object>(
          'SearchPageQueryResults',
          {
            searchTerm: t.trim(),
            options: { pageCapabilities: d, filters: f, pageSize: PAGE_SIZE, ...(x ? { exactTerm: true } : {}) },
          },
          { signal: ctrl.signal },
        ).then(
          (res) => {
            if (ctrl.signal.aborted) return
            searchCache.set(key, res, Date.parse(res.searchPage.expires), Date.now())
            setState({ data: res.searchPage, dataKey: key, loading: false, error: null, fromCache: false })
            hasData.current = true
            logSearch(res.searchPage, false)
            devbus.emit('cache', 'arama: saklandı', {
              key,
              expires: Date.parse(res.searchPage.expires),
              ageMs: 0,
              ms: Date.now() - t0,
            })
          },
          (err: unknown) => {
            if (ctrl.signal.aborted) return
            setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err : new Error(String(err)) }))
          },
        )
      },
      hasData.current ? DEBOUNCE_MS : 0,
    )
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
  }, [key, nonce])

  return {
    ...state,
    declaration,
    retry: () => setNonce((n) => n + 1),
    reload: () => {
      searchCache.deleteWhere((k) => k === key)
      setNonce((n) => n + 1)
    },
  }
}
