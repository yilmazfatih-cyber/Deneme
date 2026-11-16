/**
 * Bekleme göstergeleri.
 *   <Spinner />                     küçük dönen simge (düğme içinde)
 *   <Spinner label="Yükleniyor" />  tek başına: ekran okuyucuya duyurulur
 *   <Skeleton lines={3} />          içerik yüklenirken yer tutucu (ekran okuyucudan gizli)
 * Hareket azaltılmışsa dönme durur (styles/index.css).
 * Genişletme: yeni bir yer tutucu biçimi → Skeleton'a seçenek ekleyin.
 */
import { LoaderCircle } from 'lucide-react'
import { cx } from './cx.ts'

export function Spinner({ size = 20, label, className }: { size?: number; label?: string; className?: string }) {
  const icon = <LoaderCircle aria-hidden size={size} className={cx('animate-spin motion-safe-spin', className)} />
  if (!label) return icon
  return (
    <span role="status" className="inline-flex items-center gap-2 text-muted">
      {icon}
      <span>{label}</span>
    </span>
  )
}

export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cx('flex flex-col gap-3', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="h-14 animate-pulse rounded-2xl bg-surface-2"
          style={{ opacity: 1 - index * (0.6 / Math.max(1, lines)) }}
        />
      ))}
    </div>
  )
}
