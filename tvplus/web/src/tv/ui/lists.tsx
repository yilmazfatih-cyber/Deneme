/**
 * Kaydırılan listeler: TvList (dikey) ve TvGrid (ızgara). Çocuklar odaklanabilir öğelerdir (TvCard, TvButton…).
 * Odak içerideki bir öğeye geçince liste, öğe görünür alanda kalacak şekilde kendini kaydırır (motor kaydırmaz).
 */
import { useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode, type RefObject } from 'react'
import { FocusScope, useFocusEngine } from '../focus'

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

/** Odaktaki öğe kabın içindeyse kabı dikey kaydırarak görünür tutar (üst/alt pay `marginPx`). */
export function useScrollFocusedIntoView(container: RefObject<HTMLElement | null>, marginPx = 48): void {
  const engine = useFocusEngine()
  useEffect(() => {
    const sync = (): void => {
      const box = container.current
      const el = engine.currentElement()
      if (!box || !el || !box.contains(el)) return
      const b = box.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      let delta = 0
      if (r.top < b.top + marginPx) delta = r.top - b.top - marginPx
      else if (r.bottom > b.bottom - marginPx) delta = r.bottom - b.bottom + marginPx
      if (delta) box.scrollTo({ top: box.scrollTop + delta, behavior: reducedMotion() ? 'auto' : 'smooth' })
    }
    sync()
    return engine.subscribe(sync)
  }, [engine, container, marginPx])
}

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export interface TvListProps {
  id?: string
  children: ReactNode
  /** rem; varsayılan 1 */
  gap?: number
  /** Liste adı (ekran okuyucu) */
  label?: string
  className?: string
  style?: CSSProperties
}

/** Dikey liste; kendi yüksekliğini aşınca odaktaki öğeyi görünür tutar. */
export function TvList({ id, children, gap = 1, label, className, style }: TvListProps): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null)
  useScrollFocusedIntoView(ref)
  return (
    <FocusScope id={id} orientation="vertical">
      <div
        ref={ref}
        className={cx('tv-list', className)}
        role="list"
        aria-label={label}
        style={{ gap: `${gap}rem`, ...style }}
      >
        {children}
      </div>
    </FocusScope>
  )
}

export interface TvGridProps extends TvListProps {
  /** Sütun sayısı */
  columns: number
}

/** Izgara (Listem, arama sonuçları: 16:9 kartlar). */
export function TvGrid({ id, children, columns, gap = 1.25, label, className, style }: TvGridProps): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null)
  useScrollFocusedIntoView(ref)
  return (
    <FocusScope id={id} orientation="grid">
      <div
        ref={ref}
        className={cx('tv-grid', className)}
        role="list"
        aria-label={label}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: `${gap}rem`, ...style }}
      >
        {children}
      </div>
    </FocusScope>
  )
}
