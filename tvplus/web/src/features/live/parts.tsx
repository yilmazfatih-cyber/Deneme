/**
 * Canlı TV ve Rehber'in küçük görsel parçaları (yalnız ui bileşenleri ve tokenlar):
 *   ChannelLogo    kare kanal logosu (köşe 4), yüklenemezse kanal adının baş harfleri
 *   StarIcon       favori yıldızı (ui ikon setinde yıldız yok — bkz. rapordaki SÖZLEŞME)
 *   FavoriteToggle kartın sağ üstündeki sakin yıldız (üzerine gelince / odakta / favoriyse görünür)
 *   ReminderToggle kartın sağ üstündeki zil (yalnız başlamamış yayında)
 *   LockLine       kilit rozeti + gerekçe (tam ekran hata yok)
 *   SampleNote     "Örnek yayın akışı" etiketi — örnek veri her zaman böyle işaretlenir
 */
import { useState, type MouseEvent, type ReactElement } from 'react'
import { Badge, cx, Icon } from '../../ui'
import { setReminder, toggleFavorite, useFavorite, useReminder, type ReminderTarget } from './actions'

export const SAMPLE_LABEL = 'Örnek yayın akışı'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase('tr-TR'))
    .join('')

export function ChannelLogo({
  url,
  name,
  size = 40,
  className,
}: {
  url: string | null | undefined
  name: string
  size?: number
  className?: string
}): ReactElement {
  const [failed, setFailed] = useState(false)
  return (
    <span className={cx('lv-logo', className)} style={{ width: size, height: size }}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <span className="lv-logo__text" aria-hidden="true">
          {initials(name)}
        </span>
      )}
    </span>
  )
}

export function StarIcon({ filled, size = 20 }: { filled: boolean; size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="lv-star">
      <path
        d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  )
}

const stop = (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
}

export function FavoriteToggle({
  channelId,
  name,
  server,
  surface,
  tctx,
  tabIndex,
  className,
}: {
  channelId: number
  name: string
  server: boolean
  surface: string
  tctx?: string | null
  tabIndex?: number
  className?: string
}): ReactElement {
  const fav = useFavorite(channelId, server)
  return (
    <button
      type="button"
      className={cx('lv-cardtoggle', fav.on && 'is-on', className)}
      aria-pressed={fav.on}
      aria-label={fav.on ? `${name}: Kanallarımdan çıkar` : `${name}: Kanallarıma ekle`}
      title={fav.on ? 'Kanallarımdan çıkar' : 'Kanallarıma ekle'}
      tabIndex={tabIndex}
      onClick={(e) => {
        stop(e)
        toggleFavorite({ channelId, name, isFavorite: server }, surface, tctx)
      }}
    >
      <StarIcon filled={fav.on} size={18} />
    </button>
  )
}

export function ReminderToggle({
  airing,
  surface,
  tctx,
  tabIndex,
  className,
}: {
  airing: ReminderTarget
  surface: string
  tctx?: string | null
  tabIndex?: number
  className?: string
}): ReactElement {
  const r = useReminder(airing.airingId, airing.hasReminder)
  return (
    <button
      type="button"
      className={cx('lv-cardtoggle', r.on && 'is-on', className)}
      aria-pressed={r.on}
      aria-label={r.on ? `${airing.title}: Hatırlatmayı Kaldır` : `${airing.title}: Hatırlat`}
      title={r.on ? 'Hatırlatmayı Kaldır' : 'Hatırlat'}
      tabIndex={tabIndex}
      onClick={(e) => {
        stop(e)
        setReminder(airing, surface, tctx)
      }}
    >
      <Icon name={r.on ? 'check' : 'bell'} size={18} strokeWidth={2.2} />
    </button>
  )
}

export function LockLine({ text, className }: { text: string; className?: string }): ReactElement {
  return (
    <p className={cx('lv-lock', className)}>
      <Badge tone="lock" />
      <span>{text}</span>
    </p>
  )
}

export function SampleNote({ className }: { className?: string }): ReactElement {
  return <span className={cx('lv-sample', className)}>{SAMPLE_LABEL}</span>
}
