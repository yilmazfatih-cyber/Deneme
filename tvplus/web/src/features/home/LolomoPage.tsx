/**
 * Lolomo sayfası (Ana Sayfa, Diziler, Filmler, Yeni ve Popüler) — satırlar ESKİ sistemden (Falcor pathEvaluator)
 * yol yol okunur (docs/MIMARI.md §6, §9.4):
 *   - Ana sayfanın ilk boyaması açılış bağlamının tohumladığı önbellekten (boot.falcorCache: ilk 6 satır × 10 öğe).
 *   - Satırlar görünüme yaklaştıkça (IntersectionObserver, 600 px) 3'lü gruplar halinde: özet + kart yaprakları +
 *     itemTctx tek POST; aynı anda yaklaşan gruplar tek istekte.
 *   - Satır içinde ilk 10 öğe, yatay kaydırma sona yaklaşınca sonraki 10'luk aralık (Slider onVisibleRangeChange).
 *   - Bir satırın hatası yalnız o satırı etkiler ("Tekrar Dene"); sayfa hiçbir zaman boş kalmaz.
 * Düzen (UX_SPEC §2): vitrin üst menünün altına uzanır, satırlar vitrinin alt kenarına biner; mobilde haplar +
 * çerçeveli vitrin kartı + afiş satırları.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { FalcorPath } from '../../../../shared/types'
import { useBoot } from '../../app'
import { falcor } from '../../api/falcor'
import { useFormFactor } from '../../lib/formFactor'
import { ErrorState, SkeletonBillboard, SkeletonSlider, cx } from '../../ui'
import { PreviewScope, useFreshAfterPlayback } from '../preview'
import { HomeBillboard } from './Billboard'
import { InterstitialBanner } from './Extras'
import { LiveRow } from './LiveRow'
import {
  ImpressionTracker,
  initialItemCount,
  lolomoRoot,
  planRowBatch,
  planRowItems,
  rowBatchOf,
  rowKindOf,
  summaryPath,
  type ListNode,
  type ListSummary,
  type LolomoCategory,
  type LolomoSummary,
  type Screen,
} from './lolomo'
import { LolomoRow } from './Row'
import { useFalcorView } from './useFalcorView'
import './home.css'

type BatchState = 'loading' | 'settled'
type Json = Record<string, unknown>

/** Kök yolun altındaki düğümü okur: ['lolomo'] → json.lolomo, ['lolomoByCategory','shows'] → json.lolomoByCategory.shows */
function atRoot(json: unknown, root: FalcorPath): Json | undefined {
  let node: unknown = json
  for (const k of root) {
    if (!node || typeof node !== 'object') return undefined
    node = (node as Json)[String(k)]
  }
  return node && typeof node === 'object' ? (node as Json) : undefined
}

function rowSummaryOf(json: unknown, root: FalcorPath, index: number): ListSummary | undefined {
  const row = atRoot(json, root)?.[String(index)]
  return row && typeof row === 'object' ? (row as { summary?: ListSummary }).summary : undefined
}

export interface LolomoPageProps {
  category: LolomoCategory
  /** Ekran okuyucu başlığı (görünür başlık `header` ile gelir) */
  title: string
  /** Vitrinin üstündeki sayfa başlığı (Diziler / Filmler: "Türler ▾") */
  header?: ReactNode
}

export function LolomoPage({ category, title, header }: LolomoPageProps): ReactElement {
  useFreshAfterPlayback()
  const screen: Screen = useFormFactor() === 'mobile' ? 'mobile' : 'desktop'
  const root = lolomoRoot(category)
  const guid = useBoot()?.activeProfile?.guid ?? null
  const top = useFalcorView<Json>([summaryPath(root)])
  const summary = atRoot(top.json, root)?.summary as LolomoSummary | undefined
  const rowCount = summary?.length ?? 0
  const [batches, setBatches] = useState<Record<number, BatchState>>({})
  const requested = useRef(new Set<number>())
  const tracker = useRef(new ImpressionTracker())
  const expectsBillboard = category !== 'newPopular'

  // Lolomo'nun kendi ömrü (summary.expires) dolmuşsa açılışta yeniden sor.
  useEffect(() => {
    const exp = summary ? Date.parse(summary.expires) : NaN
    if (guid && Number.isFinite(exp) && exp < Date.now())
      falcor.invalidate(['lolomos', category === 'home' ? guid : `${guid}:${category}`])
  }, []) // yalnız açılışta

  /**
   * Bir grup satırın verisini TEK istekte ister. Özeti önbellekte olan satırlar için bağlamına özel yollar
   * (vitrin, devam et ek yaprakları dahil), olmayanlar için ortak kart yaprakları + özet.
   * Açılış tohumu tamsa hiçbir istek çıkmaz.
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
          const s = rowSummaryOf(falcor.peek([...root, i, 'summary']).json, root, i)
          const kind = s ? rowKindOf(s.context) : null
          if (s && kind) paths.push(...planRowItems(s.id, kind, screen, 0, initialItemCount(kind, s.length) - 1))
          else if (!s) paths.push(...planRowBatch(root, i, i, screen))
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
    // root kategoriden türer
    [rowCount, screen, category],
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

  // Vitrinin varlığı (satırların ona binmesi için): 0. satırın özeti.
  const first = useFalcorView<Json>(rowCount ? [[...root, 0, 'summary']] : [], { fetch: false })
  const hasBillboard = rowSummaryOf(first.json, root, 0)?.context === 'billboard'

  if (!summary) {
    if (top.error) {
      return (
        <div className="gz-page gz-page--plain">
          <ErrorState
            size="page"
            title={`${title} yüklenemedi`}
            message="Bağlantını kontrol et ve tekrar dene."
            onRetry={top.retry}
          />
        </div>
      )
    }
    return (
      <div className={cx('gz-page', !expectsBillboard && 'gz-page--plain')} aria-busy="true">
        <h1 className="ui-sr-only">{title}</h1>
        {header}
        {expectsBillboard && <SkeletonBillboard className={screen === 'mobile' ? 'gz-mhero-skel' : undefined} />}
        <div className={cx('gz-rows', expectsBillboard && 'ui-billboard-rows')}>
          <SkeletonSlider poster={screen === 'mobile'} />
          <SkeletonSlider poster={screen === 'mobile'} />
          <SkeletonSlider poster={screen === 'mobile'} />
        </div>
      </div>
    )
  }

  const slots: ReactElement[] = []
  for (let i = 0; i < rowCount; i++) {
    const b = rowBatchOf(i, rowCount)
    slots.push(
      <RowSlot
        key={i}
        root={root}
        category={category}
        index={i}
        screen={screen}
        settled={batches[b.from] === 'settled'}
        observe={observe}
        tracker={tracker.current}
        billboardSlot={i === 0 && expectsBillboard}
      />,
    )
  }
  const lead = expectsBillboard ? slots[0] : null
  const rest = expectsBillboard ? slots.slice(1) : slots
  const bannerAt = 2

  return (
    <PreviewScope>
      <div className={cx('gz-page', `gz-page--${category}`, !expectsBillboard && 'gz-page--plain')}>
        <h1 className="ui-sr-only">{title}</h1>
        {header}
        {lead}
        <div className={cx('gz-rows', hasBillboard && 'ui-billboard-rows')}>
          {rest.slice(0, bannerAt)}
          {category === 'home' && <InterstitialBanner />}
          {rest.slice(bannerAt)}
        </div>
      </div>
    </PreviewScope>
  )
}

/* ───────────── Satır yuvası: görünüme yaklaşınca etkinleşir ───────────── */

interface SlotProps {
  root: FalcorPath
  category: LolomoCategory
  index: number
  screen: Screen
  settled: boolean
  observe: (el: Element | null, index: number) => void
  tracker: ImpressionTracker
  /** Vitrin yuvası (yüklenirken vitrin iskeleti) */
  billboardSlot: boolean
}

function RowSlot({
  root,
  category,
  index,
  screen,
  settled,
  observe,
  tracker,
  billboardSlot,
}: SlotProps): ReactElement | null {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    observe(ref.current, index)
  }, [index, observe])

  const view = useFalcorView<Json>([[...root, index, 'summary']], { fetch: settled })
  const summary = rowSummaryOf(view.json, root, index)

  let body: ReactElement | null
  if (summary) {
    body = rowKindOf(summary.context) ? (
      <RowContent
        key={summary.id}
        summary={summary}
        rowIndex={index}
        category={category}
        screen={screen}
        fetchOk={settled}
        tracker={tracker}
      />
    ) : null
  } else if (view.error) {
    body = (
      <div className="ui-gutter gz-slot-error">
        <ErrorState title="Bu satır yüklenemedi" onRetry={view.retry} />
      </div>
    )
  } else if (billboardSlot) {
    body = <SkeletonBillboard className={screen === 'mobile' ? 'gz-mhero-skel' : undefined} />
  } else {
    body = <SkeletonSlider poster={screen === 'mobile'} className="gz-row-skel" />
  }
  return (
    <div ref={ref} className="gz-slot" data-row={index}>
      {body}
    </div>
  )
}

/* ───────────── Satır içeriği (bağlama göre) ───────────── */

interface RowContentProps {
  summary: ListSummary
  rowIndex: number
  category: LolomoCategory
  screen: Screen
  fetchOk: boolean
  tracker: ImpressionTracker
}

function RowContent({ summary, rowIndex, category, screen, fetchOk, tracker }: RowContentProps): ReactElement | null {
  const kind = rowKindOf(summary.context)!
  const [loaded, setLoaded] = useState(() => initialItemCount(kind, summary.length))
  const count = Math.min(loaded, summary.length)
  const view = useFalcorView<{ lists?: Record<string, ListNode> }>(
    planRowItems(summary.id, kind, screen, 0, count - 1),
    { fetch: fetchOk },
  )
  const list: ListNode = { ...(view.json.lists?.[summary.id] ?? {}), summary }
  const onNeedMore = useCallback((n: number) => setLoaded((cur) => Math.max(cur, n)), [])

  if (kind === 'bridge') return <LiveRow summary={summary} rowIndex={rowIndex} enabled={fetchOk} />
  if (kind === 'hero')
    return (
      <HomeBillboard
        list={list}
        rowIndex={rowIndex}
        deferUntilInteraction={category === 'home'}
        error={view.error}
        onRetry={view.retry}
        tracker={tracker}
      />
    )
  return (
    <LolomoRow
      list={list}
      rowIndex={rowIndex}
      category={category}
      loaded={count}
      onNeedMore={onNeedMore}
      loading={view.loading}
      settled={fetchOk}
      error={view.error}
      onRetry={view.retry}
      tracker={tracker}
    />
  )
}
