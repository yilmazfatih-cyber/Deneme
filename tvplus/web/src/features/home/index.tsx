/**
 * Film & Dizi ana sayfası (#/film-dizi) — lolomo, ESKİ sistemden (Falcor pathEvaluator) yol yol okunur.
 *   - İlk boyama açılış bağlamının tohumladığı önbellekten (boot.falcorCache: ilk 6 satır × 10 öğe; kabuk eker).
 *   - Satırlar görünüme yaklaştıkça (IntersectionObserver) 3'lü gruplar halinde: özet + afiş yaprakları + itemTctx tek POST.
 *   - Satır içinde ilk 10 öğe, yatay kaydırma sona yaklaşınca sonraki 10'luk aralık (onVisibleRangeChange).
 *   - Bir satırın hatası yalnız o satırı etkiler ("Tekrar dene"); bilinmeyen bağlamlar sessizce atlanır.
 * Dışa aktarım adı SABİT: HomePage.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { FalcorPath } from '../../../../shared/types'
import { useBoot } from '../../app'
import { falcor } from '../../api/falcor'
import { ErrorState, SkeletonRow } from '../../design'
import { PreviewScope, useFreshAfterPlayback } from '../preview'
import { Billboard } from './Billboard'
import { BridgeStrip, InterstitialBanner } from './Extras'
import {
  ImpressionTracker,
  initialItemCount,
  LOLOMO_SUMMARY_PATH,
  planRowBatch,
  planRowItems,
  rowBatchOf,
  rowKindOf,
  type ListNode,
  type ListSummary,
  type LolomoSummary,
} from './lolomo'
import { LolomoRow } from './LolomoRow'
import { useFalcorView } from './useFalcorView'
import './home.css'

type BatchState = 'loading' | 'settled'

export function HomePage(): ReactElement {
  useFreshAfterPlayback()
  const guid = useBoot()?.activeProfile?.guid ?? null
  const top = useFalcorView<{ lolomo?: { summary?: LolomoSummary } }>([LOLOMO_SUMMARY_PATH])
  const summary = top.json.lolomo?.summary
  const rowCount = summary?.length ?? 0
  const [batches, setBatches] = useState<Record<number, BatchState>>({})
  const requested = useRef(new Set<number>())
  const tracker = useRef(new ImpressionTracker())

  // Lolomo'nun kendi ömrü (summary.expires) dolmuşsa açılışta yeniden sor.
  useEffect(() => {
    const exp = summary ? Date.parse(summary.expires) : NaN
    if (guid && Number.isFinite(exp) && exp < Date.now()) falcor.invalidate(['lolomos', guid])
  }, []) // yalnız açılışta

  /**
   * Bir grup satırın verisini TEK istekte ister. Özeti önbellekte olan satırlar için bağlamına özel yollar
   * (vitrin, devam et ek yaprakları dahil), olmayanlar için ortak afiş yaprakları + özet.
   */
  const requestBatches = useCallback(
    (indices: number[]) => {
      if (!rowCount) return
      const paths: FalcorPath[] = []
      const started: number[] = []
      for (const index of indices) {
        const b = rowBatchOf(index, rowCount)
        if (requested.current.has(b.from)) continue
        requested.current.add(b.from)
        started.push(b.from)
        for (let i = b.from; i <= b.to; i++) {
          const s = falcor.peek<{ lolomo?: Record<string, { summary?: ListSummary }> }>(['lolomo', i, 'summary']).json
            .lolomo?.[String(i)]?.summary
          const kind = s ? rowKindOf(s.context) : null
          if (s && kind) paths.push(...planRowItems(s.id, kind, 0, initialItemCount(kind, s.length) - 1))
          else if (!s) paths.push(...planRowBatch(i, i))
        }
      }
      if (!started.length) return
      setBatches((st) => ({ ...st, ...Object.fromEntries(started.map((f) => [f, 'loading' as const])) }))
      const done = () =>
        setBatches((st) => ({ ...st, ...Object.fromEntries(started.map((f) => [f, 'settled' as const])) }))
      // Hata olursa satırlar kendi yollarını tek tek ister (biri bozuksa diğerleri etkilenmez).
      const missing = paths.length ? falcor.peek(...paths).missing : []
      if (!missing.length) done()
      else falcor.get(...missing).then(done, done)
    },
    [rowCount],
  )

  // Tek gözlemci: aynı anda görünüme yaklaşan tüm satırlar tek geri çağırmada → tek POST.
  const observer = useRef<IntersectionObserver | null>(null)
  const pending = useRef(new Map<Element, number>())
  const reqRef = useRef(requestBatches)
  reqRef.current = requestBatches
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const near: number[] = []
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const i = pending.current.get(e.target)
          if (i === undefined) continue
          near.push(i)
          pending.current.delete(e.target)
          io.unobserve(e.target)
        }
        if (near.length) reqRef.current(near)
      },
      { rootMargin: '600px 0px' },
    )
    observer.current = io
    for (const el of pending.current.keys()) io.observe(el)
    return () => io.disconnect()
  }, [])
  const observe = useCallback((el: Element | null, index: number) => {
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      reqRef.current([index])
      return
    }
    pending.current.set(el, index)
    observer.current?.observe(el)
  }, [])

  if (!summary) {
    if (top.error) {
      return (
        <div className="cn-page">
          <ErrorState
            size="page"
            title="Film ve diziler yüklenemedi"
            message="Bağlantını kontrol et ve tekrar dene."
            onRetry={top.retry}
          />
        </div>
      )
    }
    return (
      <div className="cn-page" aria-busy="true">
        <div className="hm-hero-skel" />
        <SkeletonRow variant="landscape" count={6} />
        <SkeletonRow variant="poster" count={10} />
      </div>
    )
  }

  const slots: ReactElement[] = []
  for (let i = 0; i < rowCount; i++) {
    const b = rowBatchOf(i, rowCount)
    slots.push(
      <RowSlot key={i} index={i} settled={batches[b.from] === 'settled'} observe={observe} tracker={tracker.current} />,
    )
  }

  return (
    <PreviewScope>
      <div className="cn-page hm-page">
        <h1 className="cn-sr-only">Film &amp; Dizi</h1>
        {slots[0]}
        <InterstitialBanner />
        {slots.slice(1)}
      </div>
    </PreviewScope>
  )
}

/* ───────────── Satır yuvası: görünüme yaklaşınca etkinleşir ───────────── */

interface SlotProps {
  index: number
  settled: boolean
  observe: (el: Element | null, index: number) => void
  tracker: ImpressionTracker
}

function RowSlot({ index, settled, observe, tracker }: SlotProps): ReactElement | null {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    observe(ref.current, index)
  }, [index, observe])

  const fetchOk = settled
  const view = useFalcorView<{ lolomo?: Record<string, { summary?: ListSummary }> }>([['lolomo', index, 'summary']], {
    fetch: fetchOk,
  })
  const summary = view.json.lolomo?.[String(index)]?.summary

  let body: ReactElement | null
  if (summary) {
    body = rowKindOf(summary.context) ? (
      <RowContent key={summary.id} summary={summary} rowIndex={index} fetchOk={fetchOk} tracker={tracker} />
    ) : null
  } else if (view.error) {
    body = <ErrorState title="Bu satır yüklenemedi" onRetry={view.retry} />
  } else {
    body = <SkeletonRow variant="poster" count={10} />
  }
  return (
    <div ref={ref} className="hm-slot" data-row={index}>
      {body}
    </div>
  )
}

/* ───────────── Satır içeriği (bağlama göre) ───────────── */

interface RowContentProps {
  summary: ListSummary
  rowIndex: number
  fetchOk: boolean
  tracker: ImpressionTracker
}

function RowContent({ summary, rowIndex, fetchOk, tracker }: RowContentProps): ReactElement | null {
  const kind = rowKindOf(summary.context)!
  const [loaded, setLoaded] = useState(() => initialItemCount(kind, summary.length))
  const count = Math.min(loaded, summary.length)
  const view = useFalcorView<{ lists?: Record<string, ListNode> }>(planRowItems(summary.id, kind, 0, count - 1), {
    fetch: fetchOk,
  })
  const list: ListNode = { ...(view.json.lists?.[summary.id] ?? {}), summary }

  if (kind === 'bridge') return <BridgeStrip summary={summary} rowIndex={rowIndex} />
  if (kind === 'hero')
    return (
      <Billboard
        list={list}
        rowIndex={rowIndex}
        loading={view.loading}
        error={view.error}
        onRetry={view.retry}
        tracker={tracker}
      />
    )
  return (
    <LolomoRow
      list={list}
      rowIndex={rowIndex}
      loaded={count}
      onNeedMore={(n) => setLoaded((cur) => Math.max(cur, n))}
      loading={view.loading}
      error={view.error}
      onRetry={view.retry}
      tracker={tracker}
    />
  )
}
