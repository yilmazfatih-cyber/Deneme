/**
 * TV+'ım (`/tvplusim`) — Netflix mobil "Netflix'im" sekmesinin karşılığı; masaüstünde ortalanmış tek sütun.
 * Yukarıdan aşağı: profil başlığı (avatar, ad, Profil Değiştir) · Bildirimler (son birkaçı, tümü) ·
 * İzlemeye Devam Et · Listem · Beğendiklerin (küçük yatay şeritler) · Hatırlatmalar (yaklaşan yayınlar, kaldır) ·
 * bağlantılar: Cihazlar, Kumanda, Profilleri Yönet, Kaputun altı, Çıkış.
 * Dışa aktarım adı SABİT: AccountHubPage.
 */
import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toggleDevtoolsPanel, useActiveProfile, useDocumentTitle, useSession, useTitleHref } from '../../app'
import { useGql } from '../../api/hooks'
import { logEvent } from '../../telemetry/logger'
import {
  Avatar,
  Badge,
  ButtonLink,
  cx,
  formatDayTime,
  Icon,
  PosterCard,
  RoundButton,
  Skeleton,
  toast,
  type IconName,
} from '../../ui'
import { localTctx, playPath } from '../detail/links'
import { isInProgress, lockedTextOf, remainingOf } from '../detail/model'
import { notePlaybackIntent, useFreshAfterPlayback } from '../detail/sync'
import { applyReminder } from '../live/actions'
import type { ArtworkData, CardVideoData, ContinueVideoData, LibraryData } from '../detail/types'
import { relativeTime } from '../notifications/time'
import './account.css'

interface NotificationItem {
  id: string
  kind: string
  title: string
  body: string
  href: string | null
  createdAt: string
  read: boolean
}

interface ReminderItem {
  airingId: string
  title: string
  startAt: string
  endAt: string
  liveState: string
  hasReminder: boolean
  artwork: ArtworkData | null
  channel: { channelId: number; name: string; number: number; logo: ArtworkData | null }
}

const NOTIFICATIONS_SHOWN = 3

export function AccountHubPage(): ReactElement {
  useFreshAfterPlayback()
  useDocumentTitle("TV+'ım")
  const profile = useActiveProfile()
  const lib = useGql<LibraryData>('Library', {}, { ttlMs: 15_000 })
  const library = lib.data?.library

  return (
    <div className="ah-page">
      <header className="ah-profile">
        <Avatar src={profile?.avatarUrl} name={profile?.name ?? 'Profil'} size={72} className="ah-profile__avatar" />
        <h1 className="ah-profile__name">{profile?.name ?? 'Profil'}</h1>
        <ButtonLink to="/profiller" variant="secondary" size="sm" icon="users">
          Profil Değiştir
        </ButtonLink>
      </header>

      <Notifications />

      <Shelf
        title="İzlemeye Devam Et"
        loading={!library}
        items={library?.continueWatching ?? []}
        empty="Yarım bıraktığın içerikler burada görünür."
        rowId="tvplusim_devam"
        mode="play"
      />
      <Shelf
        title="Listem"
        loading={!library}
        items={library?.myList ?? []}
        empty="Listene eklediklerin burada durur."
        rowId="tvplusim_listem"
        mode="detail"
        allTo="/listem"
      />
      <Shelf
        title="Beğendiklerin"
        loading={!library}
        items={library?.liked ?? []}
        empty="Beğendiğin dizi ve filmler burada toplanır."
        rowId="tvplusim_begendiklerin"
        mode="detail"
      />

      <Reminders />

      <Links />
    </div>
  )
}

/* ───────────── Bölüm başlığı ───────────── */

function SectionHead({
  icon,
  title,
  id,
  aside,
}: {
  icon?: IconName
  title: string
  id: string
  aside?: ReactNode
}): ReactElement {
  return (
    <div className="ah-head">
      {icon && (
        <span className="ah-head__icon" aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
      )}
      <h2 className="ah-head__title" id={id}>
        {title}
      </h2>
      {aside}
    </div>
  )
}

/* ───────────── Bildirimler ───────────── */

function appPathOf(href: string | null): string | null {
  if (!href) return null
  if (href.startsWith('#/')) return href.slice(1)
  if (href.startsWith('/')) return href
  return null
}

function Notifications(): ReactElement {
  const { data, loading } = useGql<{ notifications: NotificationItem[] }>('Notifications', {}, { ttlMs: 30_000 })
  const [all, setAll] = useState(false)
  const list = useMemo(
    () => [...(data?.notifications ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [data],
  )
  const shown = all ? list : list.slice(0, NOTIFICATIONS_SHOWN)
  const now = Date.now()
  return (
    <section className="ah-section" aria-labelledby="ah-notif">
      <SectionHead
        icon="bell"
        title="Bildirimler"
        id="ah-notif"
        aside={
          list.length > NOTIFICATIONS_SHOWN ? (
            <button type="button" className="ah-all" aria-expanded={all} onClick={() => setAll((v) => !v)}>
              {all ? 'Daha Az' : 'Tümünü Gör'}
              <Icon name={all ? 'chevronUp' : 'chevronRight'} size={16} />
            </button>
          ) : null
        }
      />
      {!data && loading ? (
        <div className="ah-notifs">
          <Skeleton variant="text" width="80%" />
          <Skeleton variant="text" width="60%" />
        </div>
      ) : list.length === 0 ? (
        <p className="ah-empty">Yeni bildirimin yok.</p>
      ) : (
        <ul className="ah-notifs">
          {shown.map((n) => {
            const to = appPathOf(n.href)
            const body = (
              <>
                <span className={cx('ah-notif__dot', !n.read && 'is-unread')} aria-hidden="true" />
                <span className="ah-notif__text">
                  <span className="ah-notif__title">{n.title}</span>
                  {n.body && <span className="ah-notif__body">{n.body}</span>}
                  <span className="ah-notif__time">{relativeTime(Date.parse(n.createdAt), now)}</span>
                </span>
                {to && <Icon name="chevronRight" size={18} className="ah-notif__go" />}
              </>
            )
            return (
              <li key={n.id}>
                {to ? (
                  <Link className="ah-notif" to={to}>
                    {body}
                  </Link>
                ) : (
                  <div className="ah-notif">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ───────────── Küçük yatay şeritler ───────────── */

function Shelf({
  title,
  items,
  loading,
  empty,
  rowId,
  mode,
  allTo,
}: {
  title: string
  items: (CardVideoData | ContinueVideoData)[]
  loading: boolean
  empty: string
  rowId: string
  /** 'play': tek dokunuşla oynat (İzlemeye Devam Et) · 'detail': detayı aç */
  mode: 'play' | 'detail'
  allTo?: string
}): ReactElement {
  const href = useTitleHref()
  const id = `ah-${rowId}`
  return (
    <section className="ah-section" aria-labelledby={id}>
      <SectionHead
        title={title}
        id={id}
        aside={
          allTo && items.length > 0 ? (
            <Link className="ah-all" to={allTo}>
              Tümünü Gör
              <Icon name="chevronRight" size={16} />
            </Link>
          ) : null
        }
      />
      {loading ? (
        <div className="ah-shelf" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} variant="poster" className="ah-shelf__skel" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="ah-empty">{empty}</p>
      ) : (
        <ul className="ah-shelf">
          {items.map((v, i) => {
            const tctx = localTctx(rowId, i, v.videoId)
            const ep = 'currentEpisode' in v ? v.currentEpisode : undefined
            const bm = ep?.bookmark ?? v.bookmark
            const progress = bm && bm.positionSec > 0 ? bm.progress : null
            const locked = lockedTextOf(v.access)
            const playId = ep?.videoId ?? v.videoId
            const canPlay = mode === 'play' && v.access.state === 'PLAYABLE'
            const left = isInProgress(bm) ? remainingOf(bm, ep?.runtimeSec ?? null) : null
            const label = [v.title, ep?.numberLabel, left, locked].filter(Boolean).join(', ')
            return (
              <li key={v.videoId} className="ah-shelf__item">
                <PosterCard
                  title={v.title}
                  image={v.boxart?.url}
                  badge={locked ? <Badge tone="lock" /> : undefined}
                  progress={mode === 'play' ? progress : undefined}
                  to={canPlay ? playPath(playId, tctx) : href(v.videoId, tctx)}
                  aria-label={canPlay ? `${label}, oynat` : label}
                  onClick={() => {
                    if (canPlay) notePlaybackIntent(playId, v.videoId)
                    logEvent(
                      'click',
                      {
                        videoId: v.videoId,
                        playVideoId: canPlay ? playId : undefined,
                        action: canPlay ? 'play' : 'detail',
                        from: 'tvplusim',
                      },
                      tctx,
                    )
                  }}
                />
                {mode === 'play' && (ep?.numberLabel || left) && (
                  <span className="ah-shelf__caption">{[ep?.numberLabel, left].filter(Boolean).join(' · ')}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ───────────── Hatırlatmalar ───────────── */

function Reminders(): ReactElement {
  const { data, error, loading } = useGql<{ reminders: ReminderItem[] }>('Reminders', {}, { ttlMs: 15_000 })
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const items = (data?.reminders ?? []).filter((r) => !hidden.has(r.airingId))

  const setHiddenFor = (id: string, hide: boolean) =>
    setHidden((s) => {
      const next = new Set(s)
      if (hide) next.add(id)
      else next.delete(id)
      return next
    })

  const remove = (r: ReminderItem) => {
    setHiddenFor(r.airingId, true)
    // Rehber ve Canlı TV ile aynı depo: kaldırılan hatırlatma orada da hemen kalkar
    applyReminder(r.airingId, false).then(
      () => {
        logEvent('click', { airingId: r.airingId, action: 'reminder-off', from: 'tvplusim' })
        const upcoming = Date.parse(r.startAt) > Date.now()
        toast('Hatırlatma kaldırıldı', {
          action: upcoming
            ? {
                label: 'Geri al',
                onClick: () => {
                  applyReminder(r.airingId, true).then(
                    () => setHiddenFor(r.airingId, false),
                    () => toast('Hatırlatma yeniden kurulamadı'),
                  )
                },
              }
            : undefined,
        })
      },
      () => {
        setHiddenFor(r.airingId, false)
        toast('Hatırlatma kaldırılamadı. Tekrar dene.')
      },
    )
  }

  const now = Date.now()
  return (
    <section className="ah-section" aria-labelledby="ah-rem">
      <SectionHead icon="clock" title="Hatırlatmalar" id="ah-rem" />
      {!data && loading ? (
        <Skeleton variant="text" width="70%" />
      ) : error && !data ? (
        <p className="ah-empty">Hatırlatmalar şu an gösterilemiyor.</p>
      ) : items.length === 0 ? (
        <p className="ah-empty">
          Yaklaşan bir yayın için{' '}
          <Link className="ah-inline" to="/rehber">
            Rehber
          </Link>
          'den hatırlatma kurabilirsin.
        </p>
      ) : (
        <ul className="ah-reminders">
          {items.map((r) => {
            const live = r.liveState === 'LIVE' || Date.parse(r.startAt) <= now
            return (
              <li key={r.airingId} className="ah-reminder">
                <span className="ah-reminder__art">
                  {r.artwork?.url ? (
                    <img src={r.artwork.url} alt="" loading="lazy" />
                  ) : r.channel.logo?.url ? (
                    <img src={r.channel.logo.url} alt="" loading="lazy" className="is-logo" />
                  ) : null}
                </span>
                <span className="ah-reminder__text">
                  <span className="ah-reminder__title">{r.title}</span>
                  <span className="ah-reminder__when">
                    {r.channel.name} · {live ? 'Şimdi yayında' : formatDayTime(r.startAt, now)}
                  </span>
                </span>
                <RoundButton
                  icon="close"
                  size="sm"
                  label={`${r.title} hatırlatmasını kaldır`}
                  onClick={() => remove(r)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ───────────── Bağlantılar ───────────── */

function Links(): ReactElement {
  const logout = useSession((s) => s.logout)
  const busy = useSession((s) => s.busy)
  const row = (icon: IconName, label: string, hint?: string) => (
    <>
      <Icon name={icon} size={22} className="ah-link__icon" />
      <span className="ah-link__text">
        <span className="ah-link__label">{label}</span>
        {hint && <span className="ah-link__hint">{hint}</span>}
      </span>
      <Icon name="chevronRight" size={18} className="ah-link__go" />
    </>
  )
  return (
    <nav className="ah-section ah-links" aria-label="Hesap ve cihazlar">
      <ul>
        <li>
          <Link className="ah-link" to="/cihazlar">
            {row('tv', 'Cihazlar', 'Bağlı TV, telefon ve tarayıcılar')}
          </Link>
        </li>
        <li>
          <Link className="ah-link" to="/kumanda">
            {row('remote', 'Kumanda', "TV'yi telefonundan yönet")}
          </Link>
        </li>
        <li>
          <Link className="ah-link" to="/profiller/yonet">
            {row('edit', 'Profilleri Yönet')}
          </Link>
        </li>
        <li>
          <button type="button" className="ah-link" onClick={toggleDevtoolsPanel}>
            {row('settings', 'Kaputun altı', 'Ağ, önbellek ve oynatıcı olaylarını göster ya da gizle')}
          </button>
        </li>
        <li>
          <button type="button" className="ah-link" disabled={busy} onClick={() => void logout()}>
            {row('logout', 'Çıkış Yap')}
          </button>
        </li>
      </ul>
    </nav>
  )
}
