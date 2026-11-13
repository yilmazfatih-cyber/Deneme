/**
 * Kartlar ve küçük göstergeler. Odaktaki kart 1.08× büyür ve 0.25 rem beyaz çerçeve alır (UX_SPEC §4).
 * Kart başına en çok bir rozet (kural 4); canlı öğe ilerleme taşır.
 */
import { useState, type ReactElement, type ReactNode } from 'react'
import { useFocusable } from '../focus'
import { TvIcon } from './icons'

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

/* ───────────── Göstergeler ───────────── */

/** İlerleme çubuğu (0–1), TV+ sarısı. */
export function TvProgress({
  value,
  className,
  label,
}: {
  value: number
  className?: string
  label?: string
}): ReactElement {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      className={cx('tv-progress', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label ?? 'İlerleme'}
    >
      <div className="tv-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** CANLI etiketi (yalnız canlı yayın). */
export function TvLiveTag({ className }: { className?: string }): ReactElement {
  return (
    <span className={cx('tv-live', className)}>
      <span className="tv-live__dot" aria-hidden="true" />
      CANLI
    </span>
  )
}

/** Kare avatar (köşe 8 px ≈ 0.5 rem). Görsel yoksa adın baş harfi. */
export function TvAvatar({
  url,
  name,
  size = 3,
  className,
}: {
  url: string | null
  name: string
  size?: number
  className?: string
}): ReactElement {
  const [broken, setBroken] = useState(false)
  return (
    <span className={cx('tv-avatar', className)} style={{ width: `${size}rem`, height: `${size}rem` }}>
      {url && !broken ? (
        <img src={url} alt="" onError={() => setBroken(true)} />
      ) : (
        <span className="tv-avatar__initial" style={{ fontSize: `${size * 0.45}rem` }}>
          {name.slice(0, 1).toLocaleUpperCase('tr-TR')}
        </span>
      )}
    </span>
  )
}

/* ───────────── Görsel ───────────── */

function Art({ url, title }: { url: string | null | undefined; title: string }): ReactElement {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(url ? 'loading' : 'error')
  return (
    <>
      {url && state !== 'error' && (
        <img
          className={cx('tv-art', state === 'ok' && 'is-loaded')}
          src={url}
          alt=""
          decoding="async"
          onLoad={() => setState('ok')}
          onError={() => setState('error')}
        />
      )}
      {state !== 'ok' && <span className="tv-art__fallback">{state === 'error' ? title : ''}</span>}
    </>
  )
}

/* ───────────── Kartlar ───────────── */

export interface TvCardProps {
  /** Sabit odak kimliği (satır hafızası için önerilir) */
  id?: string
  imageUrl: string | null | undefined
  /** Ekran okuyucu adı ve görsel yoksa kartın üstündeki yazı */
  title: string
  /** Sol üstte tek rozet ("Yeni Bölüm", "Son 3 Gün") */
  badge?: string | null
  /** 0–1; verilirse altta sarı çubuk */
  progress?: number | null
  /** Kartın altında küçük satır ("S1:B3 · 23 dk kaldı") */
  caption?: string | null
  /** Sol üstte CANLI etiketi (rozet yerine) */
  live?: boolean
  /** Kilitli içerik: sağ üstte kilit */
  locked?: boolean
  /** Görselin üstüne ek katman (kanal logosu gibi) */
  overlay?: ReactNode
  /** rem (sayı) ya da CSS uzunluğu ('100%' ızgarada); varsayılan 19.5 rem (UX_SPEC Ana Sayfa) */
  width?: number | string
  onPress?: () => void
  onFocus?: () => void
  autoFocus?: boolean
  disabled?: boolean
  className?: string
}

/** 16:9 başlık kartı. */
export function TvCard({
  id,
  imageUrl,
  title,
  badge,
  progress,
  caption,
  live,
  locked,
  overlay,
  width = 19.5,
  onPress,
  onFocus,
  autoFocus,
  disabled,
  className,
}: TvCardProps): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({ id, onEnter: onPress, onFocus, autoFocus, disabled })
  const label = [title, live ? 'canlı' : null, badge, caption].filter(Boolean).join(', ')
  return (
    <div
      ref={ref}
      role="button"
      aria-label={label}
      className={cx('tv-card', focused && 'is-focused', className)}
      style={{ width: typeof width === 'number' ? `${width}rem` : width }}
    >
      <div className="tv-card__frame">
        <Art key={imageUrl ?? ''} url={imageUrl} title={title} />
        {overlay}
        {live ? (
          <TvLiveTag className="tv-card__badge" />
        ) : badge ? (
          <span className="tv-badge tv-card__badge">{badge}</span>
        ) : null}
        {locked && (
          <span className="tv-card__lock" aria-hidden="true">
            <TvIcon name="lock" size={1.4} />
          </span>
        )}
        {progress !== null && progress !== undefined && <TvProgress value={progress} className="tv-card__progress" />}
      </div>
      {caption && <div className="tv-card__caption">{caption}</div>}
    </div>
  )
}

export interface TvPosterCardProps {
  id?: string
  imageUrl: string | null | undefined
  title: string
  /** Top 10 sırası: kartın solunda dış hatlı büyük rakam */
  rank?: number | null
  badge?: string | null
  /** rem; afiş genişliği (varsayılan 12) */
  width?: number
  onPress?: () => void
  onFocus?: () => void
  autoFocus?: boolean
  className?: string
}

/** 2:3 dikey afiş (Top 10 satırı). */
export function TvPosterCard({
  id,
  imageUrl,
  title,
  rank,
  badge,
  width = 12,
  onPress,
  onFocus,
  autoFocus,
  className,
}: TvPosterCardProps): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({ id, onEnter: onPress, onFocus, autoFocus })
  const ranked = rank !== null && rank !== undefined
  return (
    <div
      ref={ref}
      role="button"
      aria-label={ranked ? `${rank}. ${title}` : title}
      className={cx('tv-poster', ranked && 'tv-poster--ranked', focused && 'is-focused', className)}
      style={{ width: `${ranked ? width * 1.6 : width}rem` }}
    >
      {ranked && (
        <span className="tv-poster__rank" aria-hidden="true">
          {rank}
        </span>
      )}
      <div className="tv-poster__frame" style={{ width: `${width}rem` }}>
        <Art key={imageUrl ?? ''} url={imageUrl} title={title} />
        {badge && <span className="tv-badge tv-card__badge">{badge}</span>}
      </div>
    </div>
  )
}

/* ───────────── İskeletler ───────────── */

export function TvSkeletonCard({ width = 19.5, ratio = '16 / 9' }: { width?: number; ratio?: string }): ReactElement {
  return <div className="tv-skel" style={{ width: `${width}rem`, aspectRatio: ratio }} aria-hidden="true" />
}

export function TvSkeletonText({ lines = 3, width = 30 }: { lines?: number; width?: number }): ReactElement {
  return (
    <div className="tv-skel-text" style={{ width: `${width}rem` }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="tv-skel tv-skel-text__line" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  )
}

export function TvSkeletonRow({
  cards = 5,
  width = 19.5,
  title = true,
}: {
  cards?: number
  width?: number
  title?: boolean
}): ReactElement {
  return (
    <div className="tv-skel-row" role="status" aria-label="Yükleniyor">
      {title && <div className="tv-skel tv-skel-row__title" />}
      <div className="tv-skel-row__cards">
        {Array.from({ length: cards }, (_, i) => (
          <TvSkeletonCard key={i} width={width} />
        ))}
      </div>
    </div>
  )
}
