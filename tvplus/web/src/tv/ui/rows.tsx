/**
 * Satırlar (Netflix TV'nin "lolomo"su):
 *   TvRow           yatay kart listesi. Odaktaki kart sol güvenli kenarda sabit kalır, iz (track) kayar; uzun
 *                   satırlarda yalnız odak çevresindeki pencere çizilir. Satır kendi kapsamıdır: son odaklanan kartı
 *                   hatırlar, ↑/↓ ile dönülünce oraya iner.
 *   TvRowsViewport  satırların dikey yığını: odaktaki satır hep aynı yükseklikte durur, sonraki satır alttan görünür,
 *                   öncekiler yukarı kayıp söner (UX_SPEC §4 Ana Sayfa).
 *
 * Kaydırmayı motor değil, listeyi sahiplenen bileşen yapar: odaktaki eleman bu bileşenin içindeyse sırasını bulur.
 */
import {
  Children,
  isValidElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { FocusScope, useFocusEngine } from '../focus'

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

/**
 * Odaktaki eleman `container` içindeyse, onu taşıyan en yakın `[data-attr]` atasının değerini (sayı) döndürür;
 * değilse null. Odak değiştikçe yeniden çizer.
 */
export function useFocusedIndexWithin(container: RefObject<HTMLElement | null>, attr: string): number | null {
  const engine = useFocusEngine()
  const read = useCallback((): number | null => {
    const el = engine.currentElement()
    const root = container.current
    if (!el || !root || !root.contains(el)) return null
    const holder = el.closest(`[${attr}]`)
    if (!holder || !root.contains(holder)) return null
    const v = Number(holder.getAttribute(attr))
    return Number.isFinite(v) ? v : null
  }, [engine, container, attr])
  return useSyncExternalStore(
    (fn) => engine.subscribe(fn),
    read,
    () => null,
  )
}

/* ───────────── TvRow ───────────── */

export interface TvRowProps<T> {
  /** Satırın sabit kimliği (kapsam kimliği; hafıza için) */
  id: string
  title?: string
  items: readonly T[]
  itemKey: (item: T, index: number) => string
  /**
   * Kartı çizer. `focusId` karta odak kimliği olarak verilmelidir (`<TvCard id={focusId} …/>`): satır hafızası
   * ve pencereleme bu kimliğe dayanır.
   */
  renderItem: (item: T, index: number, focusId: string) => ReactElement
  /** Kart genişliği (rem); varsayılan 19.5 */
  itemWidth?: number
  /** Kartlar arası (rem); varsayılan 0.75 */
  gap?: number
  /** Odaktaki kartın sırası değişince */
  onFocusIndex?: (index: number, item: T) => void
  /** Pencere: odaktan önce/sonra fazladan çizilecek kart sayısı (varsayılan 2) */
  overscan?: number
  /** Aynı anda görünen en çok kart (pencere genişliği); varsayılan ekran genişliğinden hesaplanır */
  visibleCount?: number
  /** Kartların yüksekliği farklıysa (afiş) iz yüksekliği için en-boy oranı (genişlik / yükseklik); varsayılan 16/9 */
  aspect?: number
  className?: string
}

/** TV ekranı 120 rem genişliğindedir. */
const SCREEN_REM = 120

export function TvRow<T>({
  id,
  title,
  items,
  itemKey,
  renderItem,
  itemWidth = 19.5,
  gap = 0.75,
  onFocusIndex,
  overscan = 2,
  visibleCount,
  aspect = 16 / 9,
  className,
}: TvRowProps<T>): ReactElement {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const focusedIndex = useFocusedIndexWithin(trackRef, 'data-row-index')
  const [anchor, setAnchor] = useState(0)
  const step = itemWidth + gap
  const visible = visibleCount ?? Math.ceil(SCREEN_REM / step) + 1

  // Odak bu satırdaysa çapa odaktaki kart olur; satırdan çıkınca son konumunda kalır (Netflix gibi).
  const index = Math.min(Math.max(0, focusedIndex ?? anchor), Math.max(0, items.length - 1))
  useLayoutEffect(() => {
    if (focusedIndex === null || focusedIndex === anchor) return
    setAnchor(focusedIndex)
  }, [focusedIndex, anchor])
  const reported = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (focusedIndex === null || reported.current === focusedIndex) return
    reported.current = focusedIndex
    const item = items[focusedIndex]
    if (item !== undefined) onFocusIndex?.(focusedIndex, item)
  }, [focusedIndex, items, onFocusIndex])

  const from = Math.max(0, index - overscan)
  const to = Math.min(items.length, index + visible + overscan)
  const cells: ReactElement[] = []
  for (let i = from; i < to; i++) {
    const item = items[i]!
    const key = itemKey(item, i)
    cells.push(
      <div
        key={key}
        className="tv-row__cell"
        data-row-index={i}
        style={{ left: `${i * step}rem`, width: `${itemWidth}rem` }}
      >
        {renderItem(item, i, `${id}:${key}`)}
      </div>,
    )
  }
  const titleId = `${id}-baslik`
  return (
    <FocusScope id={id} orientation="horizontal">
      <section
        className={cx('tv-row', focusedIndex !== null && 'is-focused', className)}
        aria-labelledby={title ? titleId : undefined}
      >
        {title && (
          <h2 className="tv-row__title" id={titleId}>
            {title}
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
              width: `${items.length * step}rem`,
              height: `calc(${itemWidth}rem / ${aspect})`,
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

/* ───────────── TvRowsViewport ───────────── */

export interface TvRowsViewportProps {
  /** Kapsam kimliği */
  id: string
  /** Satırlar (TvRow); her çocuğun key'i olmalı */
  children: ReactNode
  /** Odaktaki satırın üst kenarının ekrandaki yeri (CSS uzunluğu); varsayılan '0px' (görünüm alanının üstü) */
  anchor?: string
  /** Odaktaki satırın sırası değişince */
  onFocusRow?: (index: number) => void
  className?: string
}

export function TvRowsViewport({
  id,
  children,
  anchor = '0px',
  onFocusRow,
  className,
}: TvRowsViewportProps): ReactElement {
  const stackRef = useRef<HTMLDivElement | null>(null)
  const focusedRow = useFocusedIndexWithin(stackRef, 'data-rows-index')
  const [current, setCurrent] = useState(0)
  const [offset, setOffset] = useState(0)
  const rows = Children.toArray(children).filter(isValidElement)
  const index = Math.min(focusedRow ?? current, Math.max(0, rows.length - 1))

  useLayoutEffect(() => {
    if (focusedRow !== null && focusedRow !== current) {
      setCurrent(focusedRow)
      onFocusRow?.(focusedRow)
    }
  }, [focusedRow, current, onFocusRow])

  // Satır yükseklikleri farklı olabilir (afiş satırı): kayma, satırın düzen konumundan (offsetTop) ölçülür.
  useLayoutEffect(() => {
    const el = stackRef.current?.querySelector<HTMLElement>(`[data-rows-index="${index}"]`)
    setOffset(el ? el.offsetTop : 0)
  }, [index, rows.length])

  return (
    // Yönsüz kapsam: ↑ ilk satırdan üstteki öğelere (vitrin düğmeleri) çıkabilir; satırlar kendi ekseninde mühürlüdür.
    <FocusScope id={id}>
      <div className={cx('tv-rows', className)} style={{ top: anchor }}>
        <div
          ref={stackRef}
          className="tv-rows__stack"
          data-focus-track=""
          data-track-y={`${-offset}px`}
          style={{ transform: `translate3d(0, ${-offset}px, 0)` }}
        >
          {rows.map((row, i) => (
            <div
              key={row.key ?? i}
              className={cx('tv-rows__row', i < index && 'is-above', i === index && 'is-current')}
              data-rows-index={i}
            >
              {row}
            </div>
          ))}
        </div>
      </div>
    </FocusScope>
  )
}
