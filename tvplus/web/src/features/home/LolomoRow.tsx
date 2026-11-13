/**
 * Ana sayfa satırı: devam et (yatay kartlar, tek dokunuşla sürdürür) ya da afiş satırı (Top 10'da sıra rakamı).
 * Yatay kaydırma sona yaklaşınca sonraki aralık; satır en az yarısı görünürken gösterim olayı (satır başına toplu).
 */
import { useCallback, useEffect, useRef, type ReactElement } from 'react'
import { ErrorState, HScroll, LandscapeCard, PosterCard, RowHeader, Skeleton, type VisibleRange } from '../../design'
import { prefetchManifest } from '../../player'
import { logEvent } from '../../telemetry/logger'
import { notePlaybackIntent, PreviewTarget, type PreviewTargetInfo } from '../preview'
import { mapRow, nextItemCount, rangeLabel, type CardVM, type ImpressionTracker, type ListNode } from './lolomo'

export interface LolomoRowProps {
  list: ListNode
  rowIndex: number
  loaded: number
  onNeedMore: (count: number) => void
  loading: boolean
  error: Error | null
  onRetry: () => void
  tracker: ImpressionTracker
}

const prefetched = new Set<string>()
/** Manifest ön hazırlığı (vitrin ve devam et'in ilk öğesi); aynı kimlik için bir kez. */
export function prefetchOnce(viewableId: string | null): void {
  if (!viewableId || prefetched.has(viewableId)) return
  prefetched.add(viewableId)
  void prefetchManifest(viewableId)
}

export function LolomoRow({ list, rowIndex, loaded, onNeedMore, loading, error, onRetry, tracker }: LolomoRowProps): ReactElement | null {
  const row = mapRow(list, rowIndex, loaded)
  const sectionRef = useRef<HTMLElement>(null)
  const rangeRef = useRef<{ first: number; last: number }>({ first: -1, last: -1 })
  const visibleRef = useRef(false)
  const rowRef = useRef(row)
  rowRef.current = row

  const logImpressions = useCallback(() => {
    const r = rowRef.current
    const { first, last } = rangeRef.current
    if (!r || !visibleRef.current || first < 0) return
    const ready = r.items.slice(first, last + 1).filter((c): c is CardVM => !!c)
    if (!ready.length) return
    const fresh = tracker.record(r.listId, ready[0]!.index, ready[ready.length - 1]!.index)
    if (!fresh.length) return
    const cards = fresh.map((i) => r.items[i]).filter((c): c is CardVM => !!c)
    logEvent('impression', {
      listId: r.listId,
      context: r.context,
      row: r.rowIndex,
      trackId: r.trackId,
      ranks: rangeLabel(fresh),
      entityIds: cards.map((c) => c.entityId),
    })
  }, [tracker])

  // Satırın dikey görünürlüğü (en az yarısı)
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        visibleRef.current = entries.some((e) => e.isIntersecting)
        logImpressions()
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [logImpressions])

  // Veri gelince (iskelet → kart) görünür aralığın gösterimini kaydet.
  const readyCount = row?.items.filter(Boolean).length ?? 0
  useEffect(() => {
    logImpressions()
  }, [readyCount, logImpressions])

  // Devam et'in ilk öğesi: manifest ön hazırlığı.
  const firstPlay = row?.context === 'continueWatching' ? (row.items[0]?.playVideoId ?? null) : null
  useEffect(() => {
    if (firstPlay !== null) prefetchOnce(`Video:${firstPlay}`)
  }, [firstPlay])

  const onRange = useCallback(
    (r: VisibleRange) => {
      rangeRef.current = r
      logImpressions()
      const cur = rowRef.current
      if (!cur) return
      const next = nextItemCount(cur.items.length, cur.length, r.last)
      if (next !== null) onNeedMore(next)
    },
    [logImpressions, onNeedMore],
  )

  if (!row) return null
  const anyItem = readyCount > 0
  if (!anyItem && error) {
    return (
      <section className="cn-row" aria-label={row.title}>
        <RowHeader title={row.title} />
        <ErrorState title="Bu satır yüklenemedi" onRetry={onRetry} />
      </section>
    )
  }
  // Ana sayfada boş satır yok: veri geldi ama gösterilecek öğe kalmadıysa satır çizilmez.
  if (!anyItem && !loading) return null

  const landscape = row.kind === 'landscape'
  const getRowVideoIds = () => (rowRef.current?.items ?? []).filter((c): c is CardVM => !!c).map((c) => c.videoId)

  return (
    <section ref={sectionRef} className="cn-row hm-row" aria-labelledby={`hm-row-${row.listId}`} data-context={row.context}>
      <RowHeader title={row.title} to={row.seeAllTo ?? undefined} id={`hm-row-${row.listId}`} />
      <HScroll labelledBy={`hm-row-${row.listId}`} scrollKey={`lolomo:${row.listId}`} onVisibleRangeChange={onRange}>
        {row.items.map((c, i) =>
          c ? (
            <PreviewTarget key={c.videoId} info={previewInfo(row.listId, c, getRowVideoIds)}>
              {landscape ? <ContinueCard card={c} /> : <PosterItem card={c} />}
            </PreviewTarget>
          ) : (
            <Skeleton key={`s${i}`} variant={landscape ? 'landscape' : 'poster'} />
          ),
        )}
      </HScroll>
    </section>
  )
}

function previewInfo(rowId: string, c: CardVM, getRowVideoIds: () => number[]): PreviewTargetInfo {
  return { rowId, videoId: c.videoId, getRowVideoIds, tctx: c.tctx, title: c.title, imageUrl: c.landscapeUrl ?? c.posterUrl }
}

function PosterItem({ card }: { card: CardVM }): ReactElement {
  return (
    <PosterCard
      title={card.title}
      imageUrl={card.posterUrl}
      badge={card.badge}
      lockedText={card.lockedText}
      rank={card.rank}
      to={card.detailTo}
      onClick={() => logEvent('click', { videoId: card.videoId, action: 'detail', from: 'lolomo' }, card.tctx)}
    />
  )
}

/** Devam et: tek dokunuş kaldığı yerden oynatır (oynatılamıyorsa detaya gider). */
function ContinueCard({ card }: { card: CardVM }): ReactElement {
  return (
    <LandscapeCard
      title={card.title}
      imageUrl={card.landscapeUrl}
      progress={card.progress}
      meta={card.meta}
      lockedText={card.lockedText}
      to={card.playTo ?? card.detailTo}
      ariaLabel={card.playTo ? `${card.title}: Devam et${card.meta ? `, ${card.meta}` : ''}` : undefined}
      onClick={() => {
        if (card.playVideoId !== null) notePlaybackIntent(card.playVideoId, card.videoId)
        logEvent('click', { videoId: card.videoId, action: card.playTo ? 'resume' : 'detail', from: 'lolomo' }, card.tctx)
      }}
    />
  )
}
