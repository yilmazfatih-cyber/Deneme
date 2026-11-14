/**
 * Arama sorguları.
 *   useSearch       — sayfa: 250 ms gecikmeli, AbortController ile iptal edilir, eski yanıt düşürülür
 *                     (queryState.ts); yanıt sunucunun `expires` anına kadar önbellekten verilir (isabet ağa HİÇ
 *                     çıkmaz). Her isabet/ıska "Kaputun altı" paneline `cache`, her yanıt `predict · sıralama` yollar.
 *   usePredictions  — açılır liste: `searchPredictions` (hafif uç), 100 ms gecikme, kısa ömürlü bellek;
 *                     her yanıt `predict · tamamlama` yollar.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useActiveProfile } from '../../app'
import { gql } from '../../api/graphql'
import { devbus } from '../../lib/devbus'
import { logEvent } from '../../telemetry/logger'
import {
  buildDeclaration,
  declarationSignature,
  type CapabilityChoice,
  type SearchPageCapabilities,
} from './capabilities'
import { ledger, onFeedback } from './feedback'
import { debounceFor, initialQueryState, queryReducer, type QueryState } from './queryState'
import {
  rankingSummary,
  sectionCounts,
  type SearchPageData,
  type SearchPrediction,
  type SearchResponse,
} from './searchModel'
import { searchCache } from './searchStore'
import { normalizeTerm, searchCacheKey } from './ttlCache'

export const DEBOUNCE_MS = 250
export const PREDICT_DEBOUNCE_MS = 100
export const PAGE_SIZE = 48

export interface SearchState extends QueryState<SearchPageData> {
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
      modelVersion: page.modelVersion,
    },
    null,
  )
}

/** Gösterilen yanıt: geri bildirim defterine yazılır, modelin sıralaması panele gider. */
function shown(page: SearchPageData, fromCache: boolean): void {
  ledger.registerPage(page.requestId, page.searchTerm, page.sections)
  logSearch(page, fromCache)
  devbus.emit('predict', 'sıralama', { ...rankingSummary(page), fromCache, requestId: page.requestId })
}

export function useSearch(term: string, choice: CapabilityChoice, exactTerm = false, explain = false): SearchState {
  const profile = useActiveProfile()?.guid ?? ''
  const choiceKey = `${[...choice.kinds].sort().join(',')}|${choice.predicted}`
  const declaration = useMemo(() => buildDeclaration(choice), [choiceKey])
  const signature = declarationSignature(declaration)
  const key = searchCacheKey({ profile, term, filters: null, capabilities: signature, exact: exactTerm, explain })

  const [state, dispatch] = useReducer(queryReducer<SearchPageData>, undefined, initialQueryState<SearchPageData>)
  const [nonce, setNonce] = useState(0)
  const seqRef = useRef(0)
  const hasData = state.data !== undefined
  const live = useRef({ term, declaration, exactTerm, explain, hasData })
  live.current = { term, declaration, exactTerm, explain, hasData }

  useEffect(() => {
    const seq = ++seqRef.current
    const hit = searchCache.get(key, Date.now())
    if (hit) {
      devbus.emit('cache', 'arama: isabet', { key, expires: hit.expires, ageMs: hit.ageMs })
      dispatch({ type: 'cache', key, seq, data: hit.value.searchPage })
      shown(hit.value.searchPage, true)
      return
    }
    dispatch({ type: 'request', key, seq })
    const ctrl = new AbortController()
    const { term: t, declaration: d, exactTerm: x, explain: ex, hasData: had } = live.current
    const timer = window.setTimeout(
      () => {
        devbus.emit('cache', 'arama: ıska', { key, expires: null, ageMs: null })
        const t0 = Date.now()
        gql<SearchResponse, object>(
          'SearchPageQueryResults',
          {
            searchTerm: t.trim(),
            options: { pageCapabilities: d, pageSize: PAGE_SIZE, ...(x ? { exactTerm: true } : {}) },
            withExplain: ex,
          },
          { signal: ctrl.signal },
        ).then(
          (res) => {
            // Eski yanıt: iptal edildi ya da yerine yenisi istendi → düşür (önbelleğe de yazma).
            if (ctrl.signal.aborted || seq !== seqRef.current) return
            searchCache.set(key, res, Date.parse(res.searchPage.expires), Date.now())
            dispatch({ type: 'response', key, seq, data: res.searchPage })
            shown(res.searchPage, false)
            devbus.emit('cache', 'arama: saklandı', {
              key,
              expires: Date.parse(res.searchPage.expires),
              ageMs: 0,
              ms: Date.now() - t0,
            })
          },
          (err: unknown) => {
            if (ctrl.signal.aborted || seq !== seqRef.current) return
            dispatch({ type: 'error', seq, error: err instanceof Error ? err : new Error(String(err)) })
          },
        )
      },
      debounceFor(had, t, DEBOUNCE_MS),
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

/* ───────────── Tamamlama tahminleri ───────────── */

const PREDICT_TTL_MS = 30_000
const predictMemo = new Map<string, { at: number; value: SearchPrediction[] }>()

// Geri bildirim tıklanma sayaçlarını değiştirir: tamamlamalar yeniden sorulmalı.
onFeedback(() => predictMemo.clear())

export interface PredictionsState {
  /** Gösterilen tahminlerin öneki (eski liste gösteriliyorsa yazılandan farklıdır) */
  prefix: string | null
  items: SearchPrediction[]
  loading: boolean
}

export function usePredictions(prefix: string, enabled: boolean, first = 8): PredictionsState {
  const profile = useActiveProfile()?.guid ?? ''
  const norm = normalizeTerm(prefix)
  const key = `${profile}|${norm}|${first}`
  const [state, dispatch] = useReducer(
    queryReducer<SearchPrediction[]>,
    undefined,
    initialQueryState<SearchPrediction[]>,
  )
  const seqRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const seq = ++seqRef.current
    const hit = predictMemo.get(key)
    if (hit && Date.now() - hit.at < PREDICT_TTL_MS) {
      dispatch({ type: 'cache', key, seq, data: hit.value })
      return
    }
    dispatch({ type: 'request', key, seq })
    const ctrl = new AbortController()
    const timer = window.setTimeout(
      () => {
        const t0 = performance.now()
        gql<{ searchPredictions: SearchPrediction[] }, { prefix: string; first: number }>(
          'SearchPredictions',
          { prefix: norm, first },
          { signal: ctrl.signal },
        ).then(
          (res) => {
            if (ctrl.signal.aborted || seq !== seqRef.current) return
            predictMemo.set(key, { at: Date.now(), value: res.searchPredictions })
            if (predictMemo.size > 80) predictMemo.delete(predictMemo.keys().next().value as string)
            dispatch({ type: 'response', key, seq, data: res.searchPredictions })
            devbus.emit(
              'predict',
              'tamamlama',
              { prefix: norm, predictions: res.searchPredictions },
              { ms: performance.now() - t0 },
            )
          },
          (err: unknown) => {
            if (ctrl.signal.aborted || seq !== seqRef.current) return
            dispatch({ type: 'error', seq, error: err instanceof Error ? err : new Error(String(err)) })
          },
        )
      },
      state.data === undefined ? 0 : PREDICT_DEBOUNCE_MS,
    )
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
  }, [key, enabled])

  const shownPrefix = state.dataKey === null ? null : (state.dataKey.split('|')[1] ?? null)
  return { prefix: shownPrefix, items: state.data ?? [], loading: state.loading }
}
