/** TV+ logosu (/brand/logo.png, 136×88). Netflix logosu hiçbir yerde kullanılmaz (UX_SPEC kural 1). */
import type { ReactElement } from 'react'
import { cx } from './cx'

export function Logo({
  height = 26,
  className,
  decorative = false,
}: {
  /** px; masaüstü üst menüde 26 */
  height?: number
  className?: string
  /** Yanında "TV+" yazılı bir bağlantının içindeyse true (alt metin boş) */
  decorative?: boolean
}): ReactElement {
  return (
    <img
      className={cx('ui-logo', className)}
      src="/brand/logo.png"
      alt={decorative ? '' : 'TV+'}
      height={height}
      style={{ height, width: 'auto' }}
      draggable={false}
    />
  )
}
