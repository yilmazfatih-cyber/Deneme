/**
 * Küçük gösterim bileşenleri: rozet, CANLI etiketi, ilerleme çubuğu, iskeletler, yetki kilidi,
 * RTÜK akıllı işaretleri, avatar, boş durum ve hata durumu.
 */
import type { ReactElement, ReactNode } from 'react'
import { upperTr } from '../../../shared/text'
import { Button } from './Button'
import { cx } from './cx'
import { Icon } from './Icon'
import './feedback.css'

/* ───────────── Rozet ───────────── */

/** Rozet sözlüğü (DESIGN_SPEC §2 — yalnız bunlar). Sunucudan gelen metin de kabul edilir. */
export type BadgeText = 'Yeni bölüm' | 'Yeni' | "Sadece TV+'ta" | 'Son 3 gün'

/** Sarı rozet. Kart başına EN FAZLA bir tane (kartlar bunu tek `badge` alanıyla zorlar). */
export function Badge({ children, className }: { children: BadgeText | (string & {}); className?: string }): ReactElement {
  return <span className={cx('cn-badge', className)}>{children}</span>
}

/** "CANLI" etiketi — üründeki tek kırmızı. `overlay`: görsel üstünde koyu zeminli. */
export function LiveTag({ overlay, className }: { overlay?: boolean; className?: string }): ReactElement {
  return (
    <span className={cx('cn-live', overlay && 'cn-live--overlay', className)}>
      <span className="cn-live__dot" aria-hidden="true" />
      CANLI
    </span>
  )
}

/* ───────────── İlerleme çubuğu ───────────── */

export interface ProgressBarProps {
  /** 0–1 */
  value: number
  /** Ekran okuyucu etiketi; ör. "İzleme ilerlemesi" */
  label?: string
  className?: string
}

/** 3 px ray + sarı dolgu. Kartlarda görselin alt kenarına yapışık kullanılır. */
export function ProgressBar({ value, label = 'İlerleme', className }: ProgressBarProps): ReactElement {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <span className={cx('cn-progress', className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span className="cn-progress__fill" style={{ width: `${pct}%` }} />
    </span>
  )
}

/* ───────────── İskeletler ───────────── */

export type SkeletonVariant = 'poster' | 'landscape' | 'tile' | 'text' | 'title'

/** Tek iskelet parçası. `text` için `width` (ör. "60%") verilebilir. */
export function Skeleton({ variant = 'text', width, className }: { variant?: SkeletonVariant; width?: string | number; className?: string }): ReactElement {
  return <span className={cx('cn-skel', `cn-skel--${variant}`, className)} style={width !== undefined ? { width } : undefined} aria-hidden="true" />
}

/** Yükleniyor satırı: başlık + yatay kart dizisi. */
export function SkeletonRow({ variant = 'poster', count = 8, className }: { variant?: 'poster' | 'landscape' | 'tile'; count?: number; className?: string }): ReactElement {
  return (
    <div className={cx('cn-skelrow', className)} role="status" aria-label="Yükleniyor">
      <span className="cn-skel cn-skel--title cn-gutter-x" aria-hidden="true" />
      <div className="cn-skelrow__items">
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} variant={variant} />
        ))}
      </div>
    </div>
  )
}

/* ───────────── Yetki kilidi ───────────── */

/** Küçük kilit + tek satır: "Sinema Paketi ile". Tam ekran hata YOK (netflix_patterns §3 ilke 7). */
export function AccessLock({ text, className }: { text: string; className?: string }): ReactElement {
  return (
    <span className={cx('cn-lock', className)}>
      <Icon name="lock" size={14} />
      {text}
    </span>
  )
}

/* ───────────── RTÜK akıllı işaretleri ───────────── */

export type Certification = 'Genel İzleyici' | '7+' | '13+' | '18+'

export interface AdvisoryBadgeProps {
  /** certificationValue: "Genel İzleyici" | "7+" | "13+" | "18+" */
  certification: Certification | (string & {})
  /** Neden etiketleri: "Şiddet ve Korku", "Cinsellik", "Olumsuz Örnek Oluşturabilecek Davranışlar" */
  reasons?: string[]
  className?: string
}

export function AdvisoryBadge({ certification, reasons = [], className }: AdvisoryBadgeProps): ReactElement {
  const general = certification === 'Genel İzleyici'
  return (
    <span className={cx('cn-advisory', className)} aria-label={['Yaş sınırı: ' + certification, ...reasons].join(', ')}>
      <span className={cx('cn-advisory__cert', general && 'cn-advisory__cert--general')} aria-hidden="true">
        {general ? 'Genel' : certification}
      </span>
      <span className="cn-advisory__reasons" aria-hidden="true">
        {general ? 'Genel İzleyici' : reasons.join(' · ')}
      </span>
    </span>
  )
}

/* ───────────── Avatar ───────────── */

export interface AvatarProps {
  /** Görsel yoksa adın ilk harfi gösterilir. */
  src?: string | null
  name: string
  /** px; üst çubuk: mobil 36, web 40 */
  size?: number
  className?: string
}

export function Avatar({ src, name, size = 40, className }: AvatarProps): ReactElement {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }
  if (src) return <img className={cx('cn-avatar', className)} src={src} alt="" width={size} height={size} style={style} />
  return (
    <span className={cx('cn-avatar', 'cn-avatar--letter', className)} style={style} aria-hidden="true">
      {upperTr(name.trim().charAt(0) || '?')}
    </span>
  )
}

/* ───────────── Boş durum / hata ───────────── */

/** Tek satır yardım metni (yalnız Kitaplığım gibi kişisel alanlarda; ana sayfada boş kart YOK). */
export function EmptyHint({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }): ReactElement {
  return (
    <div className={cx('cn-empty', className)}>
      <p className="cn-empty__text">{children}</p>
      {action}
    </div>
  )
}

export interface ErrorStateProps {
  /** Varsayılan: "Bu bölüm yüklenemedi" */
  title?: string
  /** Kısa açıklama; suçlayıcı değil, ne yapılacağını söyler. */
  message?: string
  /** Her zaman "Tekrar dene" sunulur. */
  onRetry: () => void
  /** Satır içi (küçük) ya da sayfa (ortalanmış) */
  size?: 'inline' | 'page'
  className?: string
}

/** Hata durumu: sayfanın geri kalanını kilitlemez, her zaman "Tekrar dene" içerir. */
export function ErrorState({ title = 'Bu bölüm yüklenemedi', message = 'Bağlantını kontrol et ve tekrar dene.', onRetry, size = 'inline', className }: ErrorStateProps): ReactElement {
  return (
    <div className={cx('cn-error', `cn-error--${size}`, className)} role="alert">
      <Icon name="info" size={size === 'page' ? 32 : 24} className="cn-error__icon" />
      <div className="cn-error__body">
        <p className="cn-error__title">{title}</p>
        {message && <p className="cn-error__msg">{message}</p>}
      </div>
      <Button variant="secondary" size={size === 'page' ? 'lg' : 'md'} icon="restart" onClick={onRetry}>
        Tekrar dene
      </Button>
    </div>
  )
}
