/**
 * Kartlar (DESIGN_SPEC §2): afiş (2:3), yatay kart (16:9), kanal karosu, canlı kanal kartı.
 * Kurallar: kart başına EN FAZLA bir rozet (öncelik CANLI > pakette yok > rozet);
 * canlı öğe her zaman ilerleme + bitiş/kalan süre taşır (bu yüzden canlı biçim başlangıç/bitiş ister).
 */
import type { DOMAttributes, MouseEventHandler, ReactElement, ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { AccessLock, Badge, LiveTag, ProgressBar } from './Feedback'
import { Icon } from './Icon'
import { formatLiveLine, liveProgress, type DateInput } from './time'
import { useNow } from './useNow'
import './cards.css'

/**
 * Kök öğeye aynen iletilen olaylar (önizleme / MiniModal, uzun basış, bağlam menüsü).
 * Özellikler sarmalayıcı öğe kullanmadan doğrudan karta bağlanır.
 */
export type CardEventProps = Pick<
  DOMAttributes<HTMLElement>,
  | 'onMouseEnter'
  | 'onMouseLeave'
  | 'onFocus'
  | 'onBlur'
  | 'onPointerEnter'
  | 'onPointerLeave'
  | 'onPointerMove'
  | 'onPointerDown'
  | 'onPointerUp'
  | 'onPointerCancel'
  | 'onContextMenu'
  | 'onClickCapture'
  | 'onKeyDown'
>

interface CardLinkProps extends CardEventProps {
  /** Uygulama içi hedef (ör. "/detay/80010001?tctx=…") */
  to?: string
  onClick?: MouseEventHandler<HTMLElement>
  /** Etkileşimli kartın ekran okuyucu adı (varsayılan: başlık) */
  ariaLabel?: string
  /** Kök öğe (a / button / span) */
  ref?: Ref<HTMLElement>
}

/** Kartın dış kabı: bağlantı, buton ya da düz öğe. Olaylar ve ref köke gider. */
function CardShell({ to, onClick, ariaLabel, className, children, ref, ...events }: CardLinkProps & { className: string; children: ReactNode }): ReactElement {
  if (to) {
    return (
      <Link ref={ref as Ref<HTMLAnchorElement>} to={to} className={className} onClick={onClick} aria-label={ariaLabel} {...events}>
        {children}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button ref={ref as Ref<HTMLButtonElement>} type="button" className={className} onClick={onClick} aria-label={ariaLabel} {...events}>
        {children}
      </button>
    )
  }
  return (
    <span ref={ref as Ref<HTMLSpanElement>} className={className} {...events}>
      {children}
    </span>
  )
}

function Img({ src, alt, fallback }: { src?: string | null; alt: string; fallback: string }): ReactElement {
  if (!src) {
    return (
      <span className="cn-card__img cn-card__img--empty" role="img" aria-label={alt}>
        <span>{fallback}</span>
      </span>
    )
  }
  return <img className="cn-card__img" src={src} alt={alt} loading="lazy" decoding="async" />
}

/* ───────────── Afiş kartı ───────────── */

export interface PosterCardProps extends CardLinkProps {
  title: string
  imageUrl?: string | null
  /** Sarı rozet ("Yeni bölüm", "Yeni", "Sadece TV+'ta", "Son 3 gün"); kilit varsa gösterilmez. */
  badge?: string | null
  /** Pakette yoksa kısa yetki metni ("Sinema Paketi ile"): sol üstte kilit, altta tek satır. */
  lockedText?: string | null
  /** Top 10 sırası (1–10): afişin SOLUNDA büyük rakam; afiş rakamın sağ kenarına biner, kart genişler. */
  rank?: number | null
  /** Afiş altında başlık + meta (arama ızgarası, "Benzerleri"). Ana satırlarda yazılmaz. */
  showTitle?: boolean
  meta?: string | null
  /** row: sabit afiş genişliği (112 / 184) · fill: ızgara hücresini doldurur */
  size?: 'row' | 'fill'
  className?: string
}

export function PosterCard({ title, imageUrl, badge, lockedText, rank, showTitle, meta, size = 'row', className, ariaLabel, ...link }: PosterCardProps): ReactElement {
  const label = ariaLabel ?? [rank ? `${rank}. sıra` : null, title, lockedText].filter(Boolean).join(', ')
  const media = (
    <span className="cn-card__media cn-poster__media">
        <Img src={imageUrl} alt={`${title} afişi`} fallback={title} />
        {lockedText ? (
          <span className="cn-card__badge cn-card__lockchip" aria-hidden="true">
            <Icon name="lock" size={14} />
          </span>
        ) : badge ? (
          <Badge className="cn-card__badge">{badge}</Badge>
        ) : null}
    </span>
  )
  return (
    <CardShell
      {...link}
      ariaLabel={link.to || link.onClick ? label : undefined}
      className={cx('cn-card', 'cn-poster', size === 'fill' && 'cn-card--fill', rank ? (rank >= 10 ? 'cn-poster--ranked cn-poster--ranked2' : 'cn-poster--ranked') : null, className)}
    >
      {rank ? (
        <span className="cn-poster__frame">
          <span className="cn-poster__rank" aria-hidden="true">
            {rank}
          </span>
          {media}
        </span>
      ) : (
        media
      )}
      {showTitle && (
        <span className="cn-card__text">
          <span className="cn-card-title">{title}</span>
          {lockedText ? <AccessLock text={lockedText} /> : meta ? <span className="cn-meta">{meta}</span> : null}
        </span>
      )}
    </CardShell>
  )
}

/* ───────────── Yatay kart (16:9) ───────────── */

export interface LiveWindow {
  start: DateInput
  end: DateInput
}

export interface LandscapeCardProps extends CardLinkProps {
  title: string
  imageUrl?: string | null
  /** 0–1: izleme ilerlemesi (devam et). Görselin alt kenarına yapışık 3 px sarı çubuk. */
  progress?: number | null
  /** "S1 B4 · 23 dk kaldı" */
  meta?: string | null
  badge?: string | null
  lockedText?: string | null
  /** Canlı yayın: CANLI etiketi + ilerleme + "20:00–23:15 · 42 dk kaldı" otomatik (meta yerine). */
  live?: LiveWindow | null
  /** Görselin sağ üstünde küçük kanal logosu karosu (canlı yayın / kanal içeriği) */
  channelLogoUrl?: string | null
  /** Logonun erişilebilir adı (ör. "TRT Haber") */
  channelName?: string
  size?: 'row' | 'fill'
  className?: string
}

export function LandscapeCard({ title, imageUrl, progress, meta, badge, lockedText, live, channelLogoUrl, channelName, size = 'row', className, ariaLabel, ...link }: LandscapeCardProps): ReactElement {
  const now = useNow()
  const p = live ? liveProgress(live.start, live.end, now) : progress
  const line = live ? formatLiveLine(live.start, live.end, now) : meta
  const label = ariaLabel ?? [live ? 'Canlı' : null, channelName, title, line, lockedText].filter(Boolean).join(', ')
  return (
    <CardShell {...link} ariaLabel={link.to || link.onClick ? label : undefined} className={cx('cn-card', 'cn-land', size === 'fill' && 'cn-card--fill', className)}>
      <span className="cn-card__media cn-land__media">
        <Img src={imageUrl} alt="" fallback={title} />
        {live ? (
          <LiveTag overlay className="cn-card__badge" />
        ) : lockedText ? (
          <span className="cn-card__badge cn-card__lockchip" aria-hidden="true">
            <Icon name="lock" size={14} />
          </span>
        ) : badge ? (
          <Badge className="cn-card__badge">{badge}</Badge>
        ) : null}
        {channelLogoUrl && (
          <span className="cn-land__logo">
            <img src={channelLogoUrl} alt={channelName ?? ''} loading="lazy" decoding="async" />
          </span>
        )}
        {p != null && <ProgressBar value={p} label={live ? 'Yayın ilerlemesi' : 'İzleme ilerlemesi'} className="cn-card__progress" />}
      </span>
      <span className="cn-card__text">
        <span className="cn-card-title">{title}</span>
        {lockedText ? <AccessLock text={lockedText} /> : line ? <span className="cn-meta">{line}</span> : null}
      </span>
    </CardShell>
  )
}

/* ───────────── Kanal karosu ───────────── */

export interface ChannelTileProps extends CardLinkProps {
  name: string
  logoUrl?: string | null
  /** px; varsayılan mobil 56 / web 64 (CSS) */
  size?: number
  selected?: boolean
  className?: string
}

/** Kare kanal karosu: surface-2 zemin, köşe 14, logo `contain`. */
export function ChannelTile({ name, logoUrl, size, selected, className, ariaLabel, ...link }: ChannelTileProps): ReactElement {
  const interactive = !!(link.to || link.onClick)
  return (
    <CardShell {...link} ariaLabel={interactive ? (ariaLabel ?? name) : undefined} className={cx('cn-tile', selected && 'cn-tile--selected', className)}>
      <span className="cn-tile__box" style={size ? { width: size, height: size } : undefined}>
        {logoUrl ? <img src={logoUrl} alt={interactive ? '' : name} loading="lazy" decoding="async" /> : <span className="cn-tile__name">{name}</span>}
      </span>
    </CardShell>
  )
}

/* ───────────── Canlı kanal kartı ───────────── */

export interface LiveChannelCardProps extends CardLinkProps {
  channelName: string
  channelLogoUrl?: string | null
  programmeTitle: string
  /** Zorunlu: canlı öğe bitiş/kalan süre ve ilerleme olmadan çizilmez. */
  start: DateInput
  end: DateInput
  lockedText?: string | null
  size?: 'row' | 'fill'
  className?: string
}

/** Kanal karosu + program adı + "20:00–23:15 · 42 dk kaldı" + ilerleme çubuğu. */
export function LiveChannelCard({ channelName, channelLogoUrl, programmeTitle, start, end, lockedText, size = 'row', className, ariaLabel, ...link }: LiveChannelCardProps): ReactElement {
  const now = useNow()
  const line = formatLiveLine(start, end, now)
  const label = ariaLabel ?? `${channelName}, şimdi: ${programmeTitle}, ${line}${lockedText ? `, ${lockedText}` : ''}`
  return (
    <CardShell {...link} ariaLabel={link.to || link.onClick ? label : undefined} className={cx('cn-card', 'cn-livecard', size === 'fill' && 'cn-card--fill', className)}>
      <span className="cn-livecard__top">
        <ChannelTile name={channelName} logoUrl={channelLogoUrl} />
        <span className="cn-livecard__text">
          <span className="cn-card-title">{programmeTitle}</span>
          <span className="cn-meta">{line}</span>
          {lockedText && <AccessLock text={lockedText} />}
        </span>
      </span>
      <ProgressBar value={liveProgress(start, end, now)} label="Yayın ilerlemesi" className="cn-livecard__progress" />
    </CardShell>
  )
}
