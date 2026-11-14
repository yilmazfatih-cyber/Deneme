/**
 * Küçük gösterge bileşenleri: Badge, LiveTag, ProgressBar, AdvisoryBadge (RTÜK), Avatar, Spinner,
 * iskeletler (Skeleton, SkeletonBillboard, SkeletonSlider, SkeletonGrid) ve durumlar (EmptyState, ErrorState).
 * Hata hiçbir zaman tam ekran kırmızı değildir: sakin metin + "Tekrar Dene".
 */
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { Button } from './Button'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import './feedback.css'

/* ───────────── Rozet ───────────── */

export type BadgeTone = 'accent' | 'neutral' | 'top10' | 'lock'

export interface BadgeProps {
  /** "Yeni", "Yeni Bölüm", "Son 3 Gün" … ('top10' ve 'lock' metinsiz de olur) */
  children?: ReactNode
  /** 'accent' sarı (varsayılan) · 'neutral' koyu · 'top10' sarı kare "TOP 10" · 'lock' kilit */
  tone?: BadgeTone
  className?: string
}

/** Kart başına en çok bir rozet (UX_SPEC §7 kural 4). En küçük yazı 11 px. */
export function Badge({ children, tone = 'accent', className }: BadgeProps): ReactElement {
  if (tone === 'top10') {
    return (
      <span className={cx('ui-badge ui-badge--top10', className)} aria-label="Top 10">
        <span aria-hidden="true">TOP</span>
        <span aria-hidden="true">10</span>
      </span>
    )
  }
  if (tone === 'lock') {
    return (
      <span className={cx('ui-badge ui-badge--lock', className)}>
        <Icon name="lock" size={12} strokeWidth={2.4} />
        {children ? <span>{children}</span> : <span className="ui-sr-only">Kilitli</span>}
      </span>
    )
  }
  return <span className={cx('ui-badge', `ui-badge--${tone}`, className)}>{children}</span>
}

/** "CANLI" — kırmızı nokta + metin (yalnız canlı yayında). */
export function LiveTag({ className, label = 'CANLI' }: { className?: string; label?: string }): ReactElement {
  return (
    <span className={cx('ui-live', className)}>
      <span className="ui-live__dot" aria-hidden="true" />
      {label}
    </span>
  )
}

/* ───────────── İlerleme ───────────── */

export interface ProgressBarProps {
  /** 0–1 */
  value: number
  /** 'accent' sarı (varsayılan) · 'live' kırmızı (yalnız rehberdeki "şimdi") */
  tone?: 'accent' | 'live'
  /** Kalınlık px; varsayılan 3 */
  height?: number
  /** Ekran okuyucu adı; varsayılan "İzleme ilerlemesi" */
  label?: string
  className?: string
}

export function ProgressBar({
  value,
  tone = 'accent',
  height = 3,
  label = 'İzleme ilerlemesi',
  className,
}: ProgressBarProps): ReactElement {
  const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 100)
  return (
    <div
      className={cx('ui-progress', `ui-progress--${tone}`, className)}
      style={{ height } as CSSProperties}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <span className="ui-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ───────────── RTÜK yaş işareti ───────────── */

export type Certification = 'Genel İzleyici' | '7+' | '13+' | '18+'

export interface AdvisoryBadgeProps {
  /** certificationValue: "Genel İzleyici" | "7+" | "13+" | "18+" */
  certification: Certification | (string & {})
  /** Akıllı işaret nedenleri: "Şiddet ve Korku", "Cinsellik", "Olumsuz Örnek Oluşturabilecek Davranışlar" */
  reasons?: readonly string[]
  /** Nedenleri yanında yaz (detay penceresi); varsayılan false (kart bilgi satırı) */
  showReasons?: boolean
  className?: string
}

/** Netflix yaş işareti: ince çerçeveli kutu "13+", isteğe bağlı nedenler. */
export function AdvisoryBadge({
  certification,
  reasons = [],
  showReasons = false,
  className,
}: AdvisoryBadgeProps): ReactElement {
  const general = certification === 'Genel İzleyici'
  const label = ['Yaş sınırı: ' + certification, ...reasons].join(', ')
  return (
    <span className={cx('ui-advisory', className)} role="img" aria-label={label}>
      <span className={cx('ui-advisory__cert', general && 'ui-advisory__cert--general')} aria-hidden="true">
        {general ? 'Genel' : certification}
      </span>
      {showReasons && reasons.length > 0 && (
        <span className="ui-advisory__reasons" aria-hidden="true">
          {reasons.join(', ')}
        </span>
      )}
    </span>
  )
}

/* ───────────── Avatar ───────────── */

export interface AvatarProps {
  src?: string | null
  /** Görsel yoksa baş harfi gösterilir; alt metin değildir (avatar her zaman bir adın yanında durur) */
  name: string
  /** px; varsayılan 32 */
  size?: number
  className?: string
}

const AVATAR_TINTS = ['#2b6cb0', '#c05621', '#2f855a', '#6b46c1', '#b83280', '#2c7a7b']

export function Avatar({ src, name, size = 32, className }: AvatarProps): ReactElement {
  const style = { width: size, height: size } as CSSProperties
  if (src) return <img className={cx('ui-avatar', className)} src={src} alt="" style={style} draggable={false} />
  const tint = AVATAR_TINTS[(name.codePointAt(0) ?? 0) % AVATAR_TINTS.length]
  return (
    <span
      className={cx('ui-avatar ui-avatar--initial', className)}
      style={{ ...style, background: tint, fontSize: Math.round(size * 0.45) }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toLocaleUpperCase('tr-TR')}
    </span>
  )
}

/* ───────────── Yükleniyor ───────────── */

export function Spinner({
  size = 40,
  label = 'Yükleniyor',
  className,
}: {
  size?: number
  label?: string
  className?: string
}): ReactElement {
  return (
    <span className={cx('ui-spinner', className)} role="status" style={{ width: size, height: size }}>
      <span className="ui-sr-only">{label}</span>
    </span>
  )
}

export type SkeletonVariant = 'text' | 'title' | 'card' | 'poster' | 'block' | 'circle'

export interface SkeletonProps {
  variant?: SkeletonVariant
  width?: number | string
  height?: number | string
  className?: string
}

/** Gri yer tutucu kutu (nabız gibi yanıp söner). 'card' 16:9 · 'poster' 2:3. */
export function Skeleton({ variant = 'block', width, height, className }: SkeletonProps): ReactElement {
  return (
    <span
      className={cx('ui-skel', `ui-skel--${variant}`, className)}
      style={{ width, height } as CSSProperties}
      aria-hidden="true"
    />
  )
}

/** Vitrin iskeleti: tam genişlik alan + sol altta başlık, iki satır metin, iki düğme. */
export function SkeletonBillboard({ className }: { className?: string }): ReactElement {
  return (
    <div className={cx('ui-skel-billboard', className)} aria-hidden="true">
      <div className="ui-skel-billboard__info">
        <Skeleton variant="title" width="70%" height="3.2vw" />
        <Skeleton variant="text" width="90%" />
        <Skeleton variant="text" width="60%" />
        <div className="ui-skel-billboard__actions">
          <Skeleton variant="block" width="9vw" height="2.8vw" />
          <Skeleton variant="block" width="13vw" height="2.8vw" />
        </div>
      </div>
    </div>
  )
}

/**
 * Satır iskeleti: başlık + kartlar. Masaüstünde 16:9 (sayfa başına kart sayısı kadar + kenardan görünen),
 * mobilde 2:3 afiş. `poster` masaüstünde de afiş çizer.
 */
export function SkeletonSlider({ poster = false, className }: { poster?: boolean; className?: string }): ReactElement {
  return (
    <div className={cx('ui-skel-slider', poster && 'ui-skel-slider--poster', className)} aria-hidden="true">
      <Skeleton variant="title" width={180} height={18} className="ui-skel-slider__title" />
      <div className="ui-skel-slider__items">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} variant="card" className="ui-skel-slider__item" />
        ))}
      </div>
    </div>
  )
}

/** Izgara iskeleti (Listem, arama sonuçları): 16:9 kartlar, satır kuralındaki sütun sayısı. */
export function SkeletonGrid({ count = 12, className }: { count?: number; className?: string }): ReactElement {
  return (
    <div className={cx('ui-skel-grid', className)} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} variant="card" />
      ))}
    </div>
  )
}

/** Metin paragrafı iskeleti. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }): ReactElement {
  return (
    <div className={cx('ui-skel-text', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} variant="text" width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  )
}

/* ───────────── Durumlar ───────────── */

export interface EmptyStateProps {
  icon?: IconName
  title: string
  message?: ReactNode
  /** Tek eylem (ör. "Göz At" bağlantı düğmesi) */
  action?: ReactNode
  className?: string
}

/** Boş liste: ortada ikon, kısa başlık, bir cümle, en çok bir eylem. */
export function EmptyState({ icon, title, message, action, className }: EmptyStateProps): ReactElement {
  return (
    <div className={cx('ui-state', className)}>
      {icon && <Icon name={icon} size={48} strokeWidth={1.5} className="ui-state__icon" />}
      <h2 className="ui-state__title">{title}</h2>
      {message && <p className="ui-state__message">{message}</p>}
      {action && <div className="ui-state__action">{action}</div>}
    </div>
  )
}

export interface ErrorStateProps {
  /** Varsayılan "Bir şeyler ters gitti" */
  title?: string
  message?: ReactNode
  /** Verilirse "Tekrar Dene" düğmesi çıkar */
  onRetry?: () => void
  /** 'inline' satır içi (varsayılan) · 'page' sayfa ortası */
  size?: 'inline' | 'page'
  className?: string
}

export function ErrorState({
  title = 'Bir şeyler ters gitti',
  message,
  onRetry,
  size = 'inline',
  className,
}: ErrorStateProps): ReactElement {
  return (
    <div className={cx('ui-state', `ui-state--${size}`, 'ui-state--error', className)} role="alert">
      <h2 className="ui-state__title">{title}</h2>
      {message && <p className="ui-state__message">{message}</p>}
      {onRetry && (
        <div className="ui-state__action">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Tekrar Dene
          </Button>
        </div>
      )}
    </div>
  )
}
