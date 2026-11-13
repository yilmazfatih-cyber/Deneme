/**
 * Slider — Netflix satırı (UX_SPEC §2 "Satır", §3 "Satırlar").
 *
 * Masaüstü (≥ 900): başlık (üzerine gelince "Tümünü Gör ›"), sağ üstte sayfa göstergesi (12×2 çizgiler), kenarlarda
 * %4 genişliğinde tutamaçlar (satırın üzerine gelince ok görünür), tıklayınca SAYFA SAYFA kayar (750 ms).
 * Sayfadaki kart sayısı 6/5/4/3 (useBreakpointItems); sonraki sayfanın ilk kartı sağ kenardan, ilk sayfa dışında
 * önceki sayfanın son kartı sol kenardan görünür. Klavye: ←/→ kart (gerekirse sayfa değişir), Tab satırdan çıkar
 * (satırda yalnız etkin kart sekme sırasındadır — `ctx.tabIndex`'i kartın köküne verin).
 * Mobil (< 900): tutamaçsız, göstergesiz serbest yatay kaydırma; kart genişliği `mobileItemWidth` (afiş 110 px).
 *
 * Önizleme kartı portal ile çizildiği için satır yalnız YATAYDA kırpar (overflow-x: clip): büyüyen kart kırpılmaz.
 * Kartın konumu: `ref` (SliderHandle.getItemElement / getItemRect) ya da kartın kendi ref'i; `ctx.edge` kenar
 * kartlarını bildirir (önizleme içe doğru büyür), `ctx.sliding` kayma sürerken true (önizleme açılmasın).
 *
 *   <Slider title="İzlemeye Devam Et" items={videos} getKey={(v) => v.id}
 *     onVisibleRangeChange={({ to }) => loadMore(to)}
 *     renderItem={(v, ctx) => <TitleCard title={v.title} image={v.art} to={titleHref(v.id)} tabIndex={ctx.tabIndex} />} />
 */
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { Link } from 'react-router-dom'
import { useFormFactor } from '../lib/formFactor'
import { cx } from './cx'
import { useBreakpointItems, usePrefersReducedMotion } from './hooks'
import { Icon } from './Icon'
import {
  clampPage,
  edgeOf,
  firstIndexOfPage,
  pageCount,
  pageOfIndex,
  pageToReveal,
  visibleRange,
  type IndexRange,
} from './sliderMath'
import './slider.css'

export interface SliderItemContext {
  index: number
  /** Kart ekranda (kenardan görünenler dahil) */
  visible: boolean
  /** Kenardan görünen (tam görünmeyen) kart */
  peek: boolean
  /** Sayfanın ilk / son tam görünen kartı — önizleme kartı içe doğru büyür */
  edge: 'left' | 'right' | null
  /** Satırda yalnız etkin kart 0; kartın odaklanabilir köküne verin */
  tabIndex: 0 | -1
  /** Mobil serbest kaydırma düzeni (afiş kartı çizin) */
  mobile: boolean
  /** Sayfa kayması sürüyor (önizleme açmayın) */
  sliding: boolean
}

export interface SliderHandle {
  readonly root: HTMLElement | null
  /** Kartın sarmalayıcı öğesi (konum ölçümü için) */
  getItemElement(index: number): HTMLElement | null
  getItemRect(index: number): DOMRect | null
  getPage(): number
  goToPage(page: number): void
  next(): void
  prev(): void
}

export interface SliderProps<T> {
  /** Satır başlığı */
  title: ReactNode
  /** "Tümünü Gör ›" hedefi (verilirse başlık bağlantı olur) */
  moreHref?: string
  /** Varsayılan "Tümünü Gör" */
  moreLabel?: string
  items: readonly T[]
  getKey: (item: T, index: number) => string | number
  renderItem: (item: T, ctx: SliderItemContext) => ReactNode
  /** Görünen aralık değişince (kenardan görünenler dahil) — sona yaklaşınca sonraki öğeleri yüklemek için */
  onVisibleRangeChange?: (range: IndexRange) => void
  onPageChange?: (page: number) => void
  /** Sayfadaki kart sayısını zorla (varsayılan: pencere genişliğine göre 6/5/4/3) */
  itemsPerPage?: number
  /** Mobil kart genişliği px (varsayılan 110: 2:3 afiş; Top 10 için ~170, 16:9 için ~240) */
  mobileItemWidth?: number
  /** Başlık satırının sağına ek öğe (mobilde de görünür) */
  headerExtra?: ReactNode
  className?: string
  id?: string
  ref?: Ref<SliderHandle>
}

const MOBILE_GAP = 8

export function Slider<T>(props: SliderProps<T>): ReactElement {
  const mobile = useFormFactor() === 'mobile'
  return mobile ? <FreeSlider {...props} /> : <PagedSlider {...props} />
}

/* ───────────── Başlık ───────────── */

function SliderTitle({
  id,
  title,
  moreHref,
  moreLabel,
}: {
  id: string
  title: ReactNode
  moreHref?: string
  moreLabel: string
}): ReactElement {
  return (
    <h2 className="ui-row-title ui-slider__title" id={id}>
      {moreHref ? (
        <Link to={moreHref} className="ui-slider__title-link">
          <span className="ui-slider__title-text">{title}</span>
          <span className="ui-slider__more">
            <span className="ui-slider__more-label">{moreLabel}</span>
            <Icon name="chevronRight" size={14} strokeWidth={3} className="ui-slider__more-icon" />
          </span>
        </Link>
      ) : (
        <span className="ui-slider__title-text">{title}</span>
      )}
    </h2>
  )
}

/** Kart sarmalayıcısındaki odaklanabilir kök (yoksa sarmalayıcı). */
function focusTarget(el: HTMLElement | null | undefined): HTMLElement | null {
  if (!el) return null
  return el.querySelector<HTMLElement>('a[href], button, [tabindex]') ?? el
}

/* ───────────── Masaüstü: sayfalı ───────────── */

function PagedSlider<T>({
  title,
  moreHref,
  moreLabel = 'Tümünü Gör',
  items,
  getKey,
  renderItem,
  onVisibleRangeChange,
  onPageChange,
  itemsPerPage,
  headerExtra,
  className,
  id,
  ref,
}: SliderProps<T>): ReactElement {
  const titleId = useId()
  const auto = useBreakpointItems()
  const perPage = Math.max(1, itemsPerPage ?? auto)
  const total = items.length
  const pages = pageCount(total, perPage)
  const reduced = usePrefersReducedMotion()

  const [page, setPageState] = useState(0)
  const [active, setActive] = useState(0)
  const [sliding, setSliding] = useState(false)
  /** Netflix gibi: sol tutamaç satır ilk kez kaydırılana dek görünmez. */
  const [moved, setMoved] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const itemEls = useRef(new Map<number, HTMLElement>())
  const pendingFocus = useRef<number | null>(null)
  const firstRef = useRef(0)

  const safePage = clampPage(page, total, perPage)
  const first = firstIndexOfPage(safePage, total, perPage)

  // Kırılım değişince (pencere boyutu) ilk görünen kart görünür kalsın.
  useLayoutEffect(() => {
    const keep = firstRef.current
    setPageState((p) => {
      const next = pageOfIndex(keep, total, perPage)
      return p === next ? p : next
    })
  }, [perPage, total])
  firstRef.current = first

  const setPage = useCallback(
    (next: number, focusIndex?: number) => {
      const target = clampPage(next, total, perPage)
      setPageState((p) => {
        if (p === target) return p
        if (!reduced) setSliding(true)
        setMoved(true)
        return target
      })
      setActive(focusIndex ?? firstIndexOfPage(target, total, perPage))
    },
    [total, perPage, reduced],
  )

  useEffect(() => {
    onPageChange?.(safePage)
  }, [safePage]) // yalnız sayfa değişince

  // Görünen aralık bildirimi (aynı aralık iki kez bildirilmez).
  const lastRange = useRef('')
  const range = useMemo(() => visibleRange(safePage, total, perPage), [safePage, total, perPage])
  useEffect(() => {
    const key = `${range.from}-${range.to}`
    if (key === lastRange.current) return
    lastRange.current = key
    onVisibleRangeChange?.(range)
  }, [range]) // geri çağırma kimliği değişse de yeniden bildirme

  // Klavyeyle geçilen kartı sayfa çizildikten sonra odakla.
  useEffect(() => {
    const i = pendingFocus.current
    if (i === null) return
    pendingFocus.current = null
    focusTarget(itemEls.current.get(i))?.focus({ preventScroll: true })
  }, [active, safePage])

  useImperativeHandle(
    ref,
    (): SliderHandle => ({
      get root() {
        return rootRef.current
      },
      getItemElement: (i) => itemEls.current.get(i) ?? null,
      getItemRect: (i) => itemEls.current.get(i)?.getBoundingClientRect() ?? null,
      getPage: () => safePage,
      goToPage: (p) => setPage(p),
      next: () => setPage(safePage + 1),
      prev: () => setPage(safePage - 1),
    }),
    [safePage, setPage],
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const from = Number((e.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset.index ?? active)
    const to = Math.min(total - 1, Math.max(0, from + (e.key === 'ArrowRight' ? 1 : -1)))
    e.preventDefault()
    if (to === from) return
    pendingFocus.current = to
    const p = pageToReveal(to, safePage, total, perPage)
    if (p !== safePage) setPage(p, to)
    else setActive(to)
  }

  // Sekmeyle (ya da fareyle) bir karta odak gelirse etkin kart o olur; görünmüyorsa sayfa ona gider.
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-index]')
    if (!el) return
    const i = Number(el.dataset.index)
    if (i !== active) setActive(i)
    const p = pageToReveal(i, safePage, total, perPage)
    if (p !== safePage) setPage(p, i)
  }

  const activeIndex = Math.min(Math.max(active, 0), Math.max(0, total - 1))

  return (
    <section
      ref={rootRef}
      id={id}
      className={cx('ui-slider ui-slider--paged', moved && 'has-moved', sliding && 'is-sliding', className)}
      aria-labelledby={titleId}
      data-page={safePage}
    >
      <div className="ui-slider__header">
        <SliderTitle id={titleId} title={title} moreHref={moreHref} moreLabel={moreLabel} />
        {headerExtra}
        {pages > 1 && (
          <ol className="ui-slider__pager" aria-hidden="true">
            {Array.from({ length: pages }, (_, i) => (
              <li key={i} className={i === safePage ? 'is-active' : undefined} />
            ))}
          </ol>
        )}
      </div>
      <div className="ui-slider__body">
        {pages > 1 && (moved || safePage > 0) && (
          <button
            type="button"
            className="ui-slider__handle ui-slider__handle--prev"
            onClick={() => setPage(safePage - 1)}
            disabled={safePage === 0}
            tabIndex={-1}
            aria-label="Önceki sayfa"
          >
            <Icon name="chevronLeft" size={32} strokeWidth={2.5} className="ui-slider__chevron" />
          </button>
        )}
        <div className="ui-slider__mask">
          <div
            className="ui-slider__track"
            style={{ '--per-page': perPage, '--first': first } as CSSProperties}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onTransitionEnd={(e) => {
              if (e.target === e.currentTarget) setSliding(false)
            }}
          >
            {items.map((item, index) => {
              const visible = index >= range.from && index <= range.to
              const ctx: SliderItemContext = {
                index,
                visible,
                peek: visible && (index < first || index >= first + perPage),
                edge: edgeOf(index, safePage, total, perPage),
                tabIndex: index === activeIndex ? 0 : -1,
                mobile: false,
                sliding,
              }
              return (
                <div
                  key={getKey(item, index)}
                  className="ui-slider__item"
                  data-index={index}
                  ref={(el) => {
                    if (el) itemEls.current.set(index, el)
                    else itemEls.current.delete(index)
                  }}
                >
                  {renderItem(item, ctx)}
                </div>
              )
            })}
          </div>
        </div>
        {pages > 1 && safePage < pages - 1 && (
          <button
            type="button"
            className="ui-slider__handle ui-slider__handle--next"
            onClick={() => setPage(safePage + 1)}
            tabIndex={-1}
            aria-label="Sonraki sayfa"
          >
            <Icon name="chevronRight" size={32} strokeWidth={2.5} className="ui-slider__chevron" />
          </button>
        )}
      </div>
    </section>
  )
}

/* ───────────── Mobil: serbest kaydırma ───────────── */

function FreeSlider<T>({
  title,
  moreHref,
  moreLabel = 'Tümünü Gör',
  items,
  getKey,
  renderItem,
  onVisibleRangeChange,
  mobileItemWidth = 110,
  headerExtra,
  className,
  id,
  ref,
}: SliderProps<T>): ReactElement {
  const titleId = useId()
  const total = items.length
  const rootRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const itemEls = useRef(new Map<number, HTMLElement>())
  const [active, setActive] = useState(0)
  const [range, setRange] = useState<IndexRange>({ from: 0, to: -1 })

  const measure = useCallback(() => {
    const track = trackRef.current
    if (!track || !total) {
      setRange({ from: 0, to: -1 })
      return
    }
    const step = mobileItemWidth + MOBILE_GAP
    const from = Math.max(0, Math.floor(track.scrollLeft / step))
    const to = Math.min(total - 1, Math.ceil((track.scrollLeft + track.clientWidth) / step) - 1)
    setRange((r) => (r.from === from && r.to === to ? r : { from, to }))
  }, [total, mobileItemWidth])

  useLayoutEffect(measure, [measure])
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    track.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      track.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [measure])

  const lastRange = useRef('')
  useEffect(() => {
    if (range.to < range.from) return
    const key = `${range.from}-${range.to}`
    if (key === lastRange.current) return
    lastRange.current = key
    onVisibleRangeChange?.(range)
  }, [range]) // geri çağırma kimliği değişse de yeniden bildirme

  const scrollToIndex = (i: number) => {
    const track = trackRef.current
    if (track) track.scrollTo({ left: i * (mobileItemWidth + MOBILE_GAP), behavior: 'smooth' })
  }

  useImperativeHandle(
    ref,
    (): SliderHandle => ({
      get root() {
        return rootRef.current
      },
      getItemElement: (i) => itemEls.current.get(i) ?? null,
      getItemRect: (i) => itemEls.current.get(i)?.getBoundingClientRect() ?? null,
      getPage: () => 0,
      goToPage: (p) => scrollToIndex(p * Math.max(1, range.to - range.from)),
      next: () => scrollToIndex(range.to),
      prev: () => scrollToIndex(Math.max(0, range.from - (range.to - range.from))),
    }),
    [range], // scrollToIndex kararlı ölçülere bağlı
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const from = Number((e.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset.index ?? active)
    const to = Math.min(total - 1, Math.max(0, from + (e.key === 'ArrowRight' ? 1 : -1)))
    e.preventDefault()
    setActive(to)
    const el = focusTarget(itemEls.current.get(to))
    el?.focus({ preventScroll: true })
    itemEls.current.get(to)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }

  return (
    <section
      ref={rootRef}
      id={id}
      className={cx('ui-slider ui-slider--free', className)}
      aria-labelledby={titleId}
      style={{ '--item-w': `${mobileItemWidth}px` } as CSSProperties}
    >
      <div className="ui-slider__header">
        <SliderTitle id={titleId} title={title} moreHref={moreHref} moreLabel={moreLabel} />
        {headerExtra}
      </div>
      <div
        ref={trackRef}
        className="ui-slider__scroller"
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>('[data-index]')
          if (el) setActive(Number(el.dataset.index))
        }}
      >
        {items.map((item, index) => {
          const visible = index >= range.from && index <= range.to
          return (
            <div
              key={getKey(item, index)}
              className="ui-slider__item"
              data-index={index}
              ref={(el) => {
                if (el) itemEls.current.set(index, el)
                else itemEls.current.delete(index)
              }}
            >
              {renderItem(item, {
                index,
                visible,
                peek: false,
                edge: index === range.from ? 'left' : index === range.to ? 'right' : null,
                tabIndex: index === Math.min(active, total - 1) ? 0 : -1,
                mobile: true,
                sliding: false,
              })}
            </div>
          )
        })}
      </div>
    </section>
  )
}
