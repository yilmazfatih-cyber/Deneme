/**
 * Satır yapı taşları: satır başlığı ("Tümü" bağlantısıyla), yatay kayan dizi (HScroll) ve ikisini birleştiren Row.
 * HScroll: 12 px aralık, son kart kenardan taşar; web'de önceki/sonraki okları; klavyeyle gezilir;
 * kaydırma konumunu korur (scrollKey ile yeniden bağlanmada da); görünür kart aralığını bildirir (gösterim izleme).
 */
import {
  Children,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { TextButton } from './Button'
import { cx } from './cx'
import { Icon } from './Icon'
import './row.css'

export interface RowHeaderProps {
  title: string
  /** "Tümü" bağlantısı (uygulama içi yol) */
  to?: string
  onAction?: () => void
  /** Varsayılan "Tümü" */
  actionLabel?: string
  /** Başlık öğesinin kimliği (bölüm aria-labelledby için) */
  id?: string
  className?: string
}

export function RowHeader({ title, to, onAction, actionLabel = 'Tümü', id, className }: RowHeaderProps): ReactElement {
  return (
    <div className={cx('cn-rowhead', className)}>
      <h2 className="cn-row-title" id={id}>
        {title}
      </h2>
      {(to || onAction) && (
        <TextButton to={to} onClick={onAction} aria-label={`${title}: ${actionLabel}`}>
          {actionLabel}
        </TextButton>
      )}
    </div>
  )
}

/** Görünür kart aralığı (dahil). Hiç kart yoksa first = last = -1. */
export interface VisibleRange {
  first: number
  last: number
}

export interface HScrollProps {
  children: ReactNode
  /** Liste için ekran okuyucu etiketi (genelde satır başlığı) */
  label?: string
  /** Etiket yerine başlık öğesinin kimliği */
  labelledBy?: string
  /** Verilirse kaydırma konumu bu anahtarla saklanır; sayfaya geri dönüldüğünde aynı yerden açılır. */
  scrollKey?: string
  /** Görünür aralık değiştikçe çağrılır (bir kartın en az yarısı görünürse görünür sayılır). */
  onVisibleRangeChange?: (range: VisibleRange) => void
  className?: string
}

const savedScroll = new Map<string, number>()

export function HScroll({ children, label, labelledBy, scrollKey, onVisibleRangeChange, className }: HScrollProps): ReactElement {
  const listRef = useRef<HTMLUListElement>(null)
  const rangeRef = useRef<VisibleRange>({ first: -1, last: -1 })
  const cbRef = useRef(onVisibleRangeChange)
  cbRef.current = onVisibleRangeChange
  const [edges, setEdges] = useState({ prev: false, next: false })
  const items = Children.toArray(children)

  const measure = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    let first = -1
    let last = -1
    const lis = el.children
    for (let i = 0; i < lis.length; i++) {
      const r = lis[i]!.getBoundingClientRect()
      if (r.width === 0) continue
      const overlap = Math.min(r.right, box.right) - Math.max(r.left, box.left)
      if (overlap >= r.width / 2) {
        if (first < 0) first = i
        last = i
      }
    }
    const prev = rangeRef.current
    if (prev.first !== first || prev.last !== last) {
      rangeRef.current = { first, last }
      cbRef.current?.({ first, last })
    }
    const max = el.scrollWidth - el.clientWidth
    const next = { prev: el.scrollLeft > 2, next: el.scrollLeft < max - 2 }
    setEdges((e) => (e.prev === next.prev && e.next === next.next ? e : next))
  }, [])

  // Saklı konuma dön (ilk boyamadan önce).
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && scrollKey && savedScroll.has(scrollKey)) el.scrollLeft = savedScroll.get(scrollKey) ?? 0
  }, [scrollKey])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    let frame = 0
    const onScroll = () => {
      if (scrollKey) savedScroll.set(scrollKey, el.scrollLeft)
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          measure()
        })
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null
    ro?.observe(el)
    measure()
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [measure, scrollKey])

  // Kart sayısı değişince aralığı yeniden ölç (kaydırma konumu DOM'da kalır).
  useEffect(() => {
    measure()
  }, [items.length, measure])

  const page = (dir: 1 | -1) => {
    const el = listRef.current
    if (!el) return
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth - pad * 2), behavior: 'smooth' })
  }

  // Ok tuşlarıyla kartlar arasında odak gezdirme.
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const el = listRef.current
    if (!el) return
    const lis = Array.from(el.children)
    const idx = lis.findIndex((li) => li.contains(document.activeElement))
    if (idx < 0) return
    const target = lis[idx + (e.key === 'ArrowRight' ? 1 : -1)]
    const focusable = target?.querySelector<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    if (focusable) {
      e.preventDefault()
      focusable.focus()
    }
  }

  return (
    <div className={cx('cn-hscroll', className)}>
      <ul ref={listRef} className="cn-hscroll__list" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} onKeyDown={onKeyDown}>
        {items.map((child, i) => (
          <li key={(child as { key?: string | null }).key ?? i} className="cn-hscroll__item">
            {child}
          </li>
        ))}
      </ul>
      <button type="button" className="cn-hscroll__arrow cn-hscroll__arrow--prev" aria-label="Önceki" hidden={!edges.prev} onClick={() => page(-1)}>
        <Icon name="chevronLeft" />
      </button>
      <button type="button" className="cn-hscroll__arrow cn-hscroll__arrow--next" aria-label="Sonraki" hidden={!edges.next} onClick={() => page(1)}>
        <Icon name="chevronRight" />
      </button>
    </div>
  )
}

export interface RowProps extends Omit<HScrollProps, 'label' | 'labelledBy'> {
  title: string
  /** "Tümü" hedefi */
  to?: string
  className?: string
}

/** Başlık + yatay dizi: sayfaların temel satırı. */
export function Row({ title, to, className, children, ...scroll }: RowProps): ReactElement {
  const id = useId()
  return (
    <section className={cx('cn-row', className)} aria-labelledby={id}>
      <RowHeader title={title} to={to} id={id} />
      <HScroll labelledBy={id} {...scroll}>
        {children}
      </HScroll>
    </section>
  )
}

/** Sayfa kabı: dikey satır ritmi + isteğe bağlı ekran başlığı. */
export function Page({ title, children, className }: { title?: string; children: ReactNode; className?: string }): ReactElement {
  return (
    <div className={cx('cn-page', className)}>
      {title && <h1 className="cn-screen-title cn-gutter-x">{title}</h1>}
      {children}
    </div>
  )
}
