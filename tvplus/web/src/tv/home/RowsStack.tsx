/**
 * Satırların dikey yığını (TvRowsViewport'un yerel eşi; `initialIndex` ile ekrana dönüşte kayma animasyonu olmadan
 * kaldığı satırdan başlar). Odaktaki satır hep aynı yükseklikte durur, sonraki satır alttan görünür, öncekiler yukarı
 * kayıp söner. Yön içermeyen kapsamdır: satırlar kendi eksenlerinde mühürlüdür, ↑/↓ satır değiştirir.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { FocusScope } from '../focus'
import { useFocusedIndexWithin } from '../ui'

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

export interface RowsStackProps {
  id: string
  rows: readonly { key: string; node: ReactElement }[]
  /** Odaktaki satırın üst kenarı (CSS uzunluğu) */
  anchor: string
  initialIndex?: number
  onFocusRow?: (index: number) => void
  className?: string
}

export function RowsStack({ id, rows, anchor, initialIndex = 0, onFocusRow, className }: RowsStackProps): ReactElement {
  const stackRef = useRef<HTMLDivElement | null>(null)
  const focusedRow = useFocusedIndexWithin(stackRef, 'data-rows-index')
  const [current, setCurrent] = useState(initialIndex)
  const [offset, setOffset] = useState(0)
  // İlk ölçümde (dönüşte kaldığı satıra) kayma animasyonsuz; sonraki karelerde animasyonlu.
  const [animate, setAnimate] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)))
    return () => cancelAnimationFrame(raf)
  }, [])
  const index = Math.min(focusedRow ?? current, Math.max(0, rows.length - 1))
  const onFocusRef = useRef(onFocusRow)
  onFocusRef.current = onFocusRow

  useLayoutEffect(() => {
    if (focusedRow !== null && focusedRow !== current) {
      setCurrent(focusedRow)
      onFocusRef.current?.(focusedRow)
    }
  }, [focusedRow, current])

  // Satır yükseklikleri farklı (afiş satırı): kayma, satırın düzen konumundan ölçülür.
  useLayoutEffect(() => {
    const el = stackRef.current?.querySelector<HTMLElement>(`[data-rows-index="${index}"]`)
    setOffset(el ? el.offsetTop : 0)
  }, [index, rows.length])

  const y = offset
  return (
    <FocusScope id={id}>
      <div className={cx('tv-rows', className)} style={{ top: anchor }}>
        <div
          ref={stackRef}
          className={cx('tv-rows__stack', !animate && 'tvb-no-anim')}
          data-focus-track=""
          data-track-y={`${-y}px`}
          style={{ transform: `translate3d(0, ${-y}px, 0)` }}
        >
          {rows.map((row, i) => (
            <div
              key={row.key}
              className={cx('tv-rows__row', i < index && 'is-above', i === index && 'is-current')}
              data-rows-index={i}
            >
              {row.node}
            </div>
          ))}
        </div>
      </div>
    </FocusScope>
  )
}
