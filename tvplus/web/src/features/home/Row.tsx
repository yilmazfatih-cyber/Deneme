/**
 * Lolomo satırı — `Slider` üzerinde, kart türü satırın bağlamına göre (UX_SPEC §2 "Satır", "Başlık kartı", §3):
 *   top10     dikey afiş + dış hat rakam (her ekranda)
 *   continue  masaüstü: 16:9 kart + ilerleme + "S1:B3 · 23 dk kaldı" · mobil: afiş + ilerleme + ⓘ / ⋮; tek dokunuş oynatır
 *   standard  masaüstü: 16:9 kart, en çok bir rozet · mobil: 2:3 afiş
 * Masaüstünde her kart önizleme hedefidir (satır kayarken önizleme açılmaz). Yatay kaydırma sona yaklaşınca sonraki
 * aralık yüklenir; satır en az yarısı görünürken gösterim olayı (satır başına toplu, tekrarsız).
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { useTitleHref } from '../../app'
import { useFormFactor } from '../../lib/formFactor'
import { logEvent } from '../../telemetry/logger'
import {
  Badge,
  ButtonLink,
  ErrorState,
  IconButton,
  PosterCard,
  Sheet,
  Skeleton,
  SkeletonSlider,
  Slider,
  TitleCard,
  type IndexRange,
  type SliderItemContext,
} from '../../ui'
import { notePlaybackIntent, playPath, PreviewTarget, type PreviewTargetInfo } from '../preview'
import { prefetchOnce } from './Billboard'
import {
  mapRow,
  nextItemCount,
  rangeLabel,
  type CardVM,
  type ImpressionTracker,
  type ListNode,
  type LolomoCategory,
  type RowKind,
} from './lolomo'

export interface LolomoRowProps {
  list: ListNode
  rowIndex: number
  category: LolomoCategory
  loaded: number
  onNeedMore: (count: number) => void
  loading: boolean
  /** Satır görünüme yaklaştı ve verisi istendi (boş satır ancak o zaman gizlenir) */
  settled: boolean
  error: Error | null
  onRetry: () => void
  tracker: ImpressionTracker
}

/** Mobil kart genişliği: afiş 110, Top 10 (rakam + afiş) 150 */
const mobileWidthOf = (kind: RowKind) => (kind === 'top10' ? 150 : 110)

export function LolomoRow({
  list,
  rowIndex,
  category,
  loaded,
  onNeedMore,
  loading,
  settled,
  error,
  onRetry,
  tracker,
}: LolomoRowProps): ReactElement | null {
  const mobile = useFormFactor() === 'mobile'
  const href = useTitleHref()
  const row = mapRow(list, rowIndex, loaded, category)
  const sectionRef = useRef<HTMLElement>(null)
  const rangeRef = useRef<IndexRange>({ from: -1, to: -1 })
  const visibleRef = useRef(false)
  const rowRef = useRef(row)
  rowRef.current = row
  const [menu, setMenu] = useState<CardVM | null>(null)

  const logImpressions = useCallback(() => {
    const r = rowRef.current
    const { from, to } = rangeRef.current
    if (!r || !visibleRef.current || from < 0) return
    const ready = r.items.slice(from, to + 1).filter((c): c is CardVM => !!c)
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

  // Satırın dikey görünürlüğü (en az yarısı); bölüm ancak kartlar gelince çizilir.
  const readyCount = row?.items.filter(Boolean).length ?? 0
  const shown = readyCount > 0
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
  }, [logImpressions, shown])

  // Veri gelince (iskelet → kart) görünür aralığın gösterimini kaydet.
  useEffect(() => {
    logImpressions()
  }, [readyCount, logImpressions])

  // Devam et'in ilk öğesi: manifest ön hazırlığı.
  const firstPlay = row?.kind === 'continue' ? (row.items[0]?.playVideoId ?? null) : null
  useEffect(() => {
    if (firstPlay !== null) prefetchOnce(`Video:${firstPlay}`)
  }, [firstPlay])

  const onRange = useCallback(
    (r: IndexRange) => {
      rangeRef.current = r
      logImpressions()
      const cur = rowRef.current
      if (!cur) return
      const next = nextItemCount(cur.items.length, cur.length, r.to)
      if (next !== null) onNeedMore(next)
    },
    [logImpressions, onNeedMore],
  )

  if (!row) return null
  if (!readyCount && error) {
    return (
      <section className="gz-row gz-row--error" aria-label={row.title}>
        <h2 className="ui-row-title ui-gutter gz-row__title">{row.title}</h2>
        <div className="ui-gutter">
          <ErrorState title="Bu satır yüklenemedi" message="Bağlantını kontrol et." onRetry={onRetry} />
        </div>
      </section>
    )
  }
  // Boş satır yok: veri geldi ama gösterilecek öğe kalmadıysa satır çizilmez.
  if (!readyCount && settled && !loading) return null
  if (!readyCount) return <SkeletonSlider poster={mobile || row.kind === 'top10'} className="gz-row-skel" />

  const kind = row.kind
  const getRowVideoIds = () => (rowRef.current?.items ?? []).filter((c): c is CardVM => !!c).map((c) => c.videoId)
  const previewInfo = (c: CardVM, ctx: SliderItemContext): PreviewTargetInfo | null =>
    ctx.sliding || !ctx.visible
      ? null
      : {
          rowId: row.listId,
          videoId: c.videoId,
          getRowVideoIds,
          tctx: c.tctx,
          title: c.title,
          imageUrl: c.landscapeUrl ?? c.posterUrl,
          edge: ctx.edge,
        }

  const clickLog = (c: CardVM, action: string) => () => {
    if (action === 'resume' && c.playVideoId !== null) notePlaybackIntent(c.playVideoId, c.videoId)
    logEvent('click', { videoId: c.videoId, action, from: 'lolomo', listId: row.listId }, c.tctx)
  }

  const renderItem = (c: CardVM | null, ctx: SliderItemContext): ReactElement => {
    if (!c) return <Skeleton variant={ctx.mobile || kind === 'top10' ? 'poster' : 'card'} />
    const label = c.lockedText ? `${c.title}, ${c.lockedText}` : undefined
    const badge = c.badge ? (
      <Badge tone={c.badge.tone}>{c.badge.tone === 'lock' ? undefined : c.badge.text}</Badge>
    ) : null
    const detail = href(c.videoId, c.tctx)

    if (kind === 'top10') {
      const card = (
        <PosterCard
          title={c.title}
          image={c.posterUrl}
          rank={c.rank ?? ctx.index + 1}
          badge={c.badge?.tone === 'lock' ? badge : undefined}
          to={detail}
          tabIndex={ctx.tabIndex}
          aria-label={`${c.rank ?? ctx.index + 1}. ${c.title}${c.lockedText ? `, ${c.lockedText}` : ''}`}
          onClick={clickLog(c, 'detail')}
        />
      )
      return ctx.mobile ? card : <PreviewTarget info={previewInfo(c, ctx)}>{card}</PreviewTarget>
    }

    if (kind === 'continue') {
      const to = c.playTo ?? detail
      const action = c.playTo ? 'resume' : 'detail'
      const aria = c.playTo ? `${c.title}: Devam Et${c.caption ? `, ${c.caption}` : ''}` : label
      if (ctx.mobile) {
        return (
          <PosterCard
            title={c.title}
            image={c.posterUrl}
            progress={c.progress}
            to={to}
            tabIndex={ctx.tabIndex}
            aria-label={aria}
            onClick={clickLog(c, action)}
            actions={
              <>
                <IconButton
                  icon="info"
                  iconSize={20}
                  label={`${c.title}: Daha Fazla Bilgi`}
                  to={detail}
                  className="gz-cw__act"
                />
                <IconButton
                  icon="more"
                  iconSize={20}
                  label={`${c.title}: Diğer seçenekler`}
                  className="gz-cw__act"
                  onClick={() => setMenu(c)}
                />
              </>
            }
          />
        )
      }
      return (
        <PreviewTarget info={previewInfo(c, ctx)}>
          <TitleCard
            title={c.title}
            image={c.landscapeUrl}
            badge={c.badge?.tone === 'lock' ? badge : undefined}
            progress={c.progress}
            caption={c.caption}
            to={to}
            tabIndex={ctx.tabIndex}
            aria-label={aria}
            onClick={clickLog(c, action)}
          />
        </PreviewTarget>
      )
    }

    if (ctx.mobile)
      return (
        <PosterCard
          title={c.title}
          image={c.posterUrl}
          badge={badge}
          to={detail}
          tabIndex={ctx.tabIndex}
          aria-label={label}
          onClick={clickLog(c, 'detail')}
        />
      )
    return (
      <PreviewTarget info={previewInfo(c, ctx)}>
        <TitleCard
          title={c.title}
          image={c.landscapeUrl}
          badge={badge}
          to={detail}
          tabIndex={ctx.tabIndex}
          aria-label={label}
          onClick={clickLog(c, 'detail')}
        />
      </PreviewTarget>
    )
  }

  return (
    <section ref={sectionRef} className={`gz-row gz-row--${kind}`} data-context={row.context} data-row={rowIndex}>
      <Slider
        title={row.title}
        moreHref={row.seeAllTo ?? undefined}
        items={kind === 'top10' ? row.items.slice(0, 10) : row.items}
        getKey={(c, i) => (c ? c.videoId : `s${i}`)}
        renderItem={renderItem}
        onVisibleRangeChange={onRange}
        mobileItemWidth={mobileWidthOf(kind)}
      />
      {menu && (
        <Sheet open onClose={() => setMenu(null)} title={menu.title}>
          <div className="gz-sheet-actions">
            {menu.playVideoId !== null && (
              <ButtonLink
                variant="ghost"
                icon="startOver"
                block
                to={playPath(menu.playVideoId, menu.tctx, { fromStart: true })}
                onClick={() => {
                  notePlaybackIntent(menu.playVideoId ?? 0, menu.videoId)
                  logEvent('click', { videoId: menu.videoId, action: 'startOver', from: 'lolomo' }, menu.tctx)
                }}
              >
                Baştan Başlat
              </ButtonLink>
            )}
            <ButtonLink variant="ghost" icon="info" block to={href(menu.videoId, menu.tctx)}>
              Daha Fazla Bilgi
            </ButtonLink>
          </div>
        </Sheet>
      )}
    </section>
  )
}
