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
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { FocusScope, useFocusEngine } from '../focus'
import { TvSkeletonCard } from './cards'

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

/**
 * Satırın pencere aralığı: odak (ya da çapa) kartından önce `overscan`, sonra görünür alan + `overscan` kart.
 * `to` hariç. Saf işlev (rows.test.ts).
 */
export function rowWindow(
  index: number,
  length: number,
  visible: number,
  overscan: number,
): { from: number; to: number } {
  if (length <= 0) return { from: 0, to: 0 }
  const i = clampIndex(index, length)
  return { from: Math.max(0, i - overscan), to: Math.min(length, i + visible + overscan) }
}

/** Sırayı [0, length-1] aralığına sıkıştırır (boş satırda 0). */
export const clampIndex = (index: number, length: number): number =>
  Math.min(Math.max(0, Math.floor(index) || 0), Math.max(0, length - 1))

interface TvRowBaseProps<T> {
  /** Satırın sabit kimliği (kapsam kimliği; hafıza için) */
  id: string
  title?: string
  /** Başlığın yanında sönük ikincil yazı (ör. "Kuzgun izlediğin için") */
  aside?: string | null
  itemKey: (item: T, index: number) => string
  /**
   * Kartı çizer. `focusId` karta odak kimliği olarak verilmelidir (`<TvCard id={focusId} …/>`): satır hafızası
   * ve pencereleme bu kimliğe dayanır.
   */
  renderItem: (item: T, index: number, focusId: string) => ReactElement
  /**
   * Satır bu karttan başlayarak çizilir (ekrana dönüşte hatırlanan kart görünür ve odaklanabilir olsun diye).
   * Yalnız ilk bağlanışta okunur; sonra çapa odakla yürür.
   */
  initialIndex?: number
  /** Kart genişliği (rem); varsayılan 19.5 */
  itemWidth?: number
  /** Kartlar arası (rem); varsayılan 0.75 */
  gap?: number
  /** Odaktaki kartın sırası değişince (her odak değişiminde; yükleme planı, üst alan, hafıza) */
  onFocusIndex?: (index: number, item: T) => void
  /** Pencere: odaktan önce/sonra fazladan çizilecek kart sayısı (varsayılan 2) */
  overscan?: number
  /** Aynı anda görünen en çok kart (pencere genişliği); varsayılan ekran genişliğinden hesaplanır */
  visibleCount?: number
  /** Kartların yüksekliği farklıysa (afiş) iz yüksekliği için en-boy oranı (genişlik / yükseklik); varsayılan 16/9 */
  aspect?: number
  /** Kartın altındaki yazı payı (rem; iz yüksekliğine eklenir); varsayılan 0 */
  captionSpace?: number
  /** Henüz yüklenmemiş öğenin iskelet en-boy oranı (CSS); varsayılan '16 / 9' */
  skeletonRatio?: string
  className?: string
}

/**
 * Öğeler ya dizi olarak (`items`) ya da bilinen toplam uzunluk + erişimci olarak (`length` + `getItem`) verilir.
 * İkinci biçimde `getItem(i)` null/undefined dönerse o yerde odaklanamayan iskelet durur (aralıklarla yükleme).
 */
export type TvRowProps<T> = TvRowBaseProps<T> &
  (
    | { items: readonly T[]; length?: undefined; getItem?: undefined }
    | { items?: undefined; length: number; getItem: (index: number) => T | null | undefined }
  )

/** TV ekranı 120 rem genişliğindedir. */
const SCREEN_REM = 120

export function TvRow<T>(props: TvRowProps<T>): ReactElement {
  const {
    id,
    title,
    aside,
    itemKey,
    renderItem,
    initialIndex = 0,
    itemWidth = 19.5,
    gap = 0.75,
    onFocusIndex,
    overscan = 2,
    visibleCount,
    aspect = 16 / 9,
    captionSpace = 0,
    skeletonRatio = '16 / 9',
    className,
  } = props
  const length = props.items ? props.items.length : Math.max(0, props.length)
  const itemsArr = props.items
  const getter = props.getItem
  const itemAt = (i: number): T | null => (itemsArr ? (itemsArr[i] ?? null) : (getter?.(i) ?? null))

  const trackRef = useRef<HTMLDivElement | null>(null)
  const focusedIndex = useFocusedIndexWithin(trackRef, 'data-row-index')
  const [anchor, setAnchor] = useState(() => clampIndex(initialIndex, length))
  const step = itemWidth + gap
  const visible = visibleCount ?? Math.ceil(SCREEN_REM / step) + 1

  // Odak bu satırdaysa çapa odaktaki kart olur; satırdan çıkınca son konumunda kalır (Netflix gibi).
  const index = clampIndex(focusedIndex ?? anchor, length)
  useLayoutEffect(() => {
    if (focusedIndex === null || focusedIndex === anchor) return
    setAnchor(focusedIndex)
  }, [focusedIndex, anchor])
  const reported = useRef<number | null>(null)
  const onFocusRef = useRef(onFocusIndex)
  onFocusRef.current = onFocusIndex
  const itemAtRef = useRef(itemAt)
  itemAtRef.current = itemAt
  useLayoutEffect(() => {
    if (focusedIndex === null) {
      reported.current = null
      return
    }
    if (reported.current === focusedIndex) return
    reported.current = focusedIndex
    const item = itemAtRef.current(focusedIndex)
    if (item !== null) onFocusRef.current?.(focusedIndex, item)
  }, [focusedIndex])

  const { from, to } = rowWindow(index, length, visible, overscan)
  const cells: ReactElement[] = []
  for (let i = from; i < to; i++) {
    const item = itemAt(i)
    const key = item !== null ? itemKey(item, i) : `iskelet-${i}`
    cells.push(
      <div
        key={key}
        className="tv-row__cell"
        role="listitem"
        data-row-index={i}
        style={{ left: `${i * step}rem`, width: `${itemWidth}rem` }}
      >
        {item !== null ? (
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
        className={cx('tv-row', focusedIndex !== null && 'is-focused', className)}
        aria-labelledby={title ? titleId : undefined}
      >
        {title && (
          <h2 className="tv-row__title" id={titleId}>
            {title}
            {aside && <span className="tv-row__aside">{aside}</span>}
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
  /** Yığın bu satırda başlar (ekrana dönüşte; ilk konuma kayma animasyonu olmadan). Yalnız ilk bağlanışta okunur. */
  initialIndex?: number
  className?: string
}

export function TvRowsViewport({
  id,
  children,
  anchor = '0px',
  onFocusRow,
  initialIndex = 0,
  className,
}: TvRowsViewportProps): ReactElement {
  const stackRef = useRef<HTMLDivElement | null>(null)
  const focusedRow = useFocusedIndexWithin(stackRef, 'data-rows-index')
  const [current, setCurrent] = useState(() => Math.max(0, Math.floor(initialIndex) || 0))
  const [offset, setOffset] = useState(0)
  // İlk ölçüm (dönüşte kaldığı satır) animasyonsuz; sonraki kaymalar animasyonlu.
  const [animate, setAnimate] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)))
    return () => cancelAnimationFrame(raf)
  }, [])
  const rows = Children.toArray(children).filter(isValidElement)
  const index = clampIndex(focusedRow ?? current, rows.length)
  const onFocusRef = useRef(onFocusRow)
  onFocusRef.current = onFocusRow

  useLayoutEffect(() => {
    if (focusedRow !== null && focusedRow !== current) {
      setCurrent(focusedRow)
      onFocusRef.current?.(focusedRow)
    }
  }, [focusedRow, current])

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
          className={cx('tv-rows__stack', !animate && 'tv-no-anim')}
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
