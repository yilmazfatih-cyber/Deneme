/**
 * Kartlar:
 *   TitleCard   16:9 (STORY_ART), köşe 4 — masaüstü satırları, arama ızgarası, canlı kanal kartı (sol üstte kanal logosu).
 *               En çok bir rozet (sol üst), isteğe bağlı ilerleme çubuğu + altyazı satırı ("S1:B3 · 23 dk kaldı").
 *   PosterCard  2:3 afiş (BOXART), köşe 4 / mobil 6 — mobil satırlar ve Top 10 (`rank` → solunda dış hat rakam).
 *   RankedCard  Top 10: büyük rakam + 16:9 görsel + altında ad (görsel ve ad her zaman tam görünür).
 *   RankNumber  Top 10 rakamı (koyu dolgu, açık gri dış hat).
 *
 * Önizleme kartı (başka ekip) kartın üzerinde portal ile açılır: kartlar `ref`'i ve fare / işaretçi / odak
 * işleyicilerini kök öğeye iletir; kart kendisi üzerine gelince büyümez.
 * Kök öğe: `to` → react-router Link · `href` → <a> · `onClick` → <button> · hiçbiri → <div>.
 */
import { useState, type HTMLAttributes, type MouseEvent, type ReactElement, type ReactNode, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { ProgressBar } from './Feedback'
import './cards.css'

type RootAttrs = Omit<HTMLAttributes<HTMLElement>, 'title' | 'children' | 'onClick'>

interface CardBaseProps extends RootAttrs {
  /** Başlık: erişilebilir ad ve görsel yokken yer tutucu metni */
  title: string
  /** Uygulama içi yol (masaüstünde detay için `titleHref()` → `?jbv=`) */
  to?: string
  href?: string
  onClick?: (e: MouseEvent<HTMLElement>) => void
  /** Sol üst rozet (en çok bir tane): <Badge>Yeni Bölüm</Badge> */
  badge?: ReactNode
  /** 0–1; verilirse görselin altında 3 px ilerleme çubuğu */
  progress?: number | null
  ref?: Ref<HTMLElement>
  /** Satır içinde gezinme: yalnız etkin kart 0, diğerleri -1 (Slider renderItem bağlamından) */
  tabIndex?: number
  /** Ekran okuyucu adı başlıktan farklı olacaksa ("Sintel, 23 dk kaldı") */
  'aria-label'?: string
}

/** Kök öğe seçimi (Link / a / button / div) — ref ve olay işleyicileri aynen iletilir. */
function CardRoot({
  to,
  href,
  onClick,
  className,
  ref,
  children,
  label,
  ...rest
}: Omit<CardBaseProps, 'title' | 'badge' | 'progress'> & { children: ReactNode; label: string }): ReactElement {
  const common = { className, 'aria-label': label, ...rest }
  if (to !== undefined)
    return (
      <Link to={to} onClick={onClick} ref={ref as Ref<HTMLAnchorElement>} {...common}>
        {children}
      </Link>
    )
  if (href !== undefined)
    return (
      <a href={href} onClick={onClick} ref={ref as Ref<HTMLAnchorElement>} {...common}>
        {children}
      </a>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} ref={ref as Ref<HTMLButtonElement>} {...common}>
        {children}
      </button>
    )
  return (
    <div ref={ref as Ref<HTMLDivElement>} {...common}>
      {children}
    </div>
  )
}

/** Görsel + yüklenemezse başlıklı yer tutucu. */
function Art({ src, title, className }: { src?: string | null; title: string; className: string }): ReactElement {
  const [failed, setFailed] = useState(false)
  if (!src || failed)
    return (
      <span className={cx(className, 'ui-art-fallback')} aria-hidden="true">
        <span>{title}</span>
      </span>
    )
  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}

/* ───────────── 16:9 başlık kartı ───────────── */

export interface TitleCardProps extends CardBaseProps {
  /** 16:9 görsel (STORY_ART) */
  image?: string | null
  /** Görselin altında tek satır: "S1:B3 · 23 dk kaldı" ya da canlı program adı */
  caption?: ReactNode
  /** Canlı kart: sol üstte kanal logosu (rozet yerine) */
  channelLogo?: string | null
  /** Kanal adı (logo alt metni) */
  channelName?: string
  /** Başlığı görselin üzerine yaz (görsel başlık içermiyorsa; varsayılan false) */
  showTitle?: boolean
}

export function TitleCard({
  title,
  image,
  badge,
  progress,
  caption,
  channelLogo,
  channelName,
  showTitle = false,
  className,
  'aria-label': ariaLabel,
  ...rest
}: TitleCardProps): ReactElement {
  return (
    <CardRoot className={cx('ui-card', className)} label={ariaLabel ?? title} {...rest}>
      <span className="ui-card__media">
        <Art src={image} title={title} className="ui-card__img" />
        {channelLogo ? (
          <img className="ui-card__channel" src={channelLogo} alt={channelName ?? ''} loading="lazy" />
        ) : (
          badge && <span className="ui-card__badge">{badge}</span>
        )}
        {showTitle && image && <span className="ui-card__title">{title}</span>}
      </span>
      {progress !== undefined && progress !== null && <ProgressBar value={progress} className="ui-card__progress" />}
      {caption && <span className="ui-card__caption">{caption}</span>}
    </CardRoot>
  )
}

/* ───────────── Top 10 rakamı ───────────── */

/** Dış hatlı büyük rakam (1–10). Kapsayıcısının yüksekliğini doldurur. */
export function RankNumber({ value, className }: { value: number; className?: string }): ReactElement {
  const text = String(value)
  return (
    <svg
      className={cx('ui-rank', className)}
      viewBox="0 0 100 150"
      preserveAspectRatio="xMaxYMax meet"
      aria-hidden="true"
    >
      <text
        x="100"
        y="146"
        textAnchor="end"
        fontSize="170"
        fontWeight="900"
        {...(text.length > 1 ? { textLength: 100, lengthAdjust: 'spacingAndGlyphs' } : {})}
      >
        {text}
      </text>
    </svg>
  )
}

/* ───────────── Top 10 kartı ───────────── */

export interface RankedCardProps extends CardBaseProps {
  /** 16:9 görsel (STORY_ART): kırpılmadan, tam görünür */
  image?: string | null
  /** Sıra (1–10) */
  rank: number
  /** Adın altındaki küçük satır (ör. "Dizi") */
  meta?: ReactNode
}

/**
 * Top 10 kartı: solda büyük dış hatlı rakam, yanında 16:9 görsel, altında ad.
 * Görseller yatay olduğu için dikey afiş yerine yatay kart kullanılır: görsel tam görünür, ad her zaman yazıyla okunur.
 */
export function RankedCard({
  title,
  image,
  rank,
  badge,
  meta,
  className,
  'aria-label': ariaLabel,
  ...rest
}: RankedCardProps): ReactElement {
  return (
    <CardRoot className={cx('ui-ranked', className)} label={ariaLabel ?? `${rank}. ${title}`} {...rest}>
      <RankNumber value={rank} className="ui-ranked__rank" />
      <span className="ui-ranked__body">
        <span className="ui-ranked__media">
          <Art src={image} title={title} className="ui-card__img" />
          {badge && <span className="ui-card__badge">{badge}</span>}
        </span>
        <span className="ui-ranked__title">{title}</span>
        {meta && <span className="ui-ranked__meta">{meta}</span>}
      </span>
    </CardRoot>
  )
}

/* ───────────── 2:3 afiş kartı ───────────── */

export interface PosterCardProps extends CardBaseProps {
  /** 2:3 görsel (BOXART) */
  image?: string | null
  /** Top 10 sırası: solunda dış hatlı rakam; masaüstünde kart 16:9 kutuyu doldurur */
  rank?: number
  /** Afişin altındaki küçük eylem şeridi (mobil İzlemeye Devam Et: ⓘ / ⋮) — kartın bağlantısının DIŞINDA çizilir */
  actions?: ReactNode
}

export function PosterCard({
  title,
  image,
  badge,
  progress,
  rank,
  actions,
  className,
  'aria-label': ariaLabel,
  ...rest
}: PosterCardProps): ReactElement {
  const label = ariaLabel ?? (rank ? `${rank}. ${title}` : title)
  const card = (
    <CardRoot
      className={cx('ui-poster', rank !== undefined && 'ui-poster--ranked', !actions && className)}
      label={label}
      {...rest}
    >
      {rank !== undefined && <RankNumber value={rank} className="ui-poster__rank" />}
      <span className="ui-poster__media">
        <Art src={image} title={title} className="ui-poster__img" />
        {badge && <span className="ui-card__badge">{badge}</span>}
        {progress !== undefined && progress !== null && (
          <ProgressBar value={progress} className="ui-poster__progress" />
        )}
      </span>
    </CardRoot>
  )
  if (!actions) return card
  return (
    <div className={cx('ui-poster-wrap', className)}>
      {card}
      <div className="ui-poster__actions">{actions}</div>
    </div>
  )
}
