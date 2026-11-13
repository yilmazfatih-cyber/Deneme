/**
 * Pencerelenmiş yatay satır (TvRow'un göz atma ekranları için yerel eşi). TvRow'dan farkları:
 *   - `initialIndex`: ekrana dönüşte satır kaldığı karttan çizilir (odak hafızası; bkz. memory.ts)
 *   - `length` toplam öğe sayısıdır; henüz gelmemiş öğeler iskelet olarak durur (odaklanamaz)
 *   - `onFocusIndex` her odak değişiminde çağrılır (yükleme planı, üst alan, hafıza)
 * Odaktaki kart sol güvenli kenarda sabit kalır, iz kayar; yalnız odak çevresindeki pencere çizilir — satır
 * yüzlerce öğeyle de aynı hızda çalışır. Satır kendi kapsamıdır: ↑/↓ ile dönülünce son karta iner.
 */
import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { FocusScope } from '../focus'
import { TvSkeletonCard, useFocusedIndexWithin } from '../ui'
import { windowRange } from './model'

const SCREEN_REM = 120

export interface LaneProps<T> {
  id: string
  title?: string
  /** Başlığın yanında sönük ikincil yazı (ör. becauseYouWatched gerekçesi) */
  aside?: string | null
  length: number
  getItem: (index: number) => T | null
  itemKey: (item: T, index: number) => string
  renderItem: (item: T, index: number, focusId: string) => ReactElement
  /** rem */
  itemWidth?: number
  gap?: number
  /** Kart yüksekliği / genişlik oranı için en-boy (genişlik / yükseklik) */
  aspect?: number
  /** Kartın altındaki yazı payı (rem; iz yüksekliğine eklenir) */
  captionSpace?: number
  initialIndex?: number
  onFocusIndex?: (index: number) => void
  overscan?: number
  /** İskelet en-boy oranı (CSS) */
  skeletonRatio?: string
  className?: string
  children?: ReactNode
}

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

export function Lane<T>({
  id,
  title,
  aside,
  length,
  getItem,
  itemKey,
  renderItem,
  itemWidth = 19.5,
  gap = 0.75,
  aspect = 16 / 9,
  captionSpace = 0,
  initialIndex = 0,
  onFocusIndex,
  overscan = 2,
  skeletonRatio = '16 / 9',
  className,
}: LaneProps<T>): ReactElement {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const focusedIndex = useFocusedIndexWithin(trackRef, 'data-row-index')
  const [anchor, setAnchor] = useState(initialIndex)
  const step = itemWidth + gap
  const visible = Math.ceil(SCREEN_REM / step) + 1
  const index = Math.min(Math.max(0, focusedIndex ?? anchor), Math.max(0, length - 1))

  useLayoutEffect(() => {
    if (focusedIndex !== null && focusedIndex !== anchor) setAnchor(focusedIndex)
  }, [focusedIndex, anchor])

  const reported = useRef<number | null>(null)
  const onFocusRef = useRef(onFocusIndex)
  onFocusRef.current = onFocusIndex
  useLayoutEffect(() => {
    if (focusedIndex === null) {
      reported.current = null
      return
    }
    if (reported.current === focusedIndex) return
    reported.current = focusedIndex
    onFocusRef.current?.(focusedIndex)
  }, [focusedIndex])

  const { from, to } = windowRange(index, length, visible, overscan)
  const cells: ReactElement[] = []
  for (let i = from; i < to; i++) {
    const item = getItem(i)
    const key = item ? itemKey(item, i) : `iskelet-${i}`
    cells.push(
      <div
        key={key}
        className="tv-row__cell"
        role="listitem"
        data-row-index={i}
        style={{ left: `${i * step}rem`, width: `${itemWidth}rem` }}
      >
        {item ? (
          renderItem(item, i, `${id}:${key}`)
        ) : (
          <TvSkeletonCard width={itemWidth} ratio={skeletonRatio} />
        )}
      </div>,
    )
  }
  const titleId = `${id}-baslik`
  return (
    <FocusScope id={id} orientation="horizontal">
      <section
        className={cx('tv-row', 'tvb-lane', focusedIndex !== null && 'is-focused', className)}
        aria-labelledby={title ? titleId : undefined}
      >
        {title && (
          <h2 className="tv-row__title tvb-lane__title" id={titleId}>
            {title}
            {aside && <span className="tvb-lane__aside">{aside}</span>}
          </h2>
        )}
        <div className="tv-row__viewport">
          <div
            ref={trackRef}
            className="tv-row__track"
            role="list"
            data-focus-track=""
            data-track-x={`${-index * step}rem`}
            style={{
              width: `${Math.max(1, length) * step}rem`,
              height: `calc(${itemWidth}rem / ${aspect} + ${captionSpace}rem)`,
              transform: `translate3d(${-index * step}rem, 0, 0)`,
            }}
          >
            {cells}
          </div>
        </div>
      </section>
    </FocusScope>
  )
}
