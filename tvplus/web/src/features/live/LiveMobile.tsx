/**
 * Canlı TV — mobil (< 900 px). Netflix mobil dili:
 *   Haplar     üst çubuğun altında: Rehber · Kanallarım · kategoriler (seçilince başında ✕, yalnız seçili hap kalır)
 *   Vitrin     seçili kanalın kartı (köşe 12, ince açık çerçeve, arkada renk parıltısı): 16:9 program görseli, logo,
 *              CANLI, program adı, "20:00–23:15 · 42 dk kaldı", ilerleme, ▶ Canlı İzle (beyaz) · TV'de İzle / Baştan Başlat
 *   Liste      Netflix liste satırı: logo · kanal · şimdiki program + ilerleme · "Sonra 22:00 · …" · ⋯
 *              Satıra dokununca izle (1 adım); ⋯ eylem sayfasını açar.
 */
import { useState, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShellPills } from '../../app'
import { logEvent } from '../../telemetry/logger'
import {
  Badge,
  Button,
  ButtonLink,
  cx,
  formatClock,
  formatLiveLine,
  Icon,
  type IconName,
  LiveTag,
  liveProgress,
  Pill,
  PillClear,
  ProgressBar,
  Sheet,
} from '../../ui'
import {
  castChannel,
  rememberChannel,
  setReminder,
  toggleFavorite,
  useCastAvailable,
  useFavorite,
  useReminder,
} from './actions'
import { liveWatchPath, lockText } from './airing'
import { currentAiring, upcomingAiring, type ChannelEntry } from './liveRows'
import { ChannelLogo, LockLine, SampleNote, StarIcon } from './parts'
import type { LiveHandlers } from './LiveDesktop'
import type { LiveModel } from './useLiveModel'

const FAVORITES = 'kanallarim'

/* ───────────── Vitrin kartı ───────────── */

function LiveMobileHero({
  entry,
  now,
  onLocked,
}: {
  entry: ChannelEntry
  now: number
  onLocked: (title: string, reason: string) => void
}): ReactElement {
  const ch = entry.channel
  const tctx = entry.track.tctx
  const air = currentAiring(ch, now)
  const lock = lockText(ch.access)
  const castable = useCastAvailable()
  const [imgFailed, setImgFailed] = useState(false)
  const art = air?.art?.url ?? air?.card?.url
  const watch = liveWatchPath(ch.channelId, tctx)
  const click = (action: string) =>
    logEvent('click', { surface: 'canli', rowType: 'LIVE_HERO', action, entityId: entry.track.entityId }, tctx)
  const second =
    !lock && castable ? (
      <Button
        icon="cast"
        block
        onClick={() => castChannel({ channelId: ch.channelId, name: ch.name, programme: air?.title }, 'canli', tctx)}
      >
        TV'de İzle
      </Button>
    ) : !lock && air?.startOver ? (
      <ButtonLink
        icon="startOver"
        block
        to={liveWatchPath(ch.channelId, tctx, true)}
        onClick={() => {
          click('bastan')
          rememberChannel(ch.channelId)
        }}
      >
        Baştan Başlat
      </ButtonLink>
    ) : (
      <ButtonLink icon="guide" block to={`/rehber?kanal=${ch.channelId}`} onClick={() => click('rehber')}>
        Rehber
      </ButtonLink>
    )
  return (
    <section className="ui-mhero lv-mhero" aria-label={`Şimdi ${ch.name} kanalında`}>
      <div className="ui-mhero__glow" aria-hidden="true" />
      <div className="lv-mhero__card">
        <Link
          to={lock ? '#' : watch}
          className="lv-mhero__art"
          aria-label={`${ch.name}, ${air?.title ?? ''}, Canlı İzle`}
          onClick={(e) => {
            click(lock ? 'kilit' : 'canli')
            if (lock) {
              e.preventDefault()
              onLocked(ch.name, lock)
            } else rememberChannel(ch.channelId)
          }}
        >
          {art && !imgFailed ? (
            <img className="lv-mhero__img" src={art} alt="" onError={() => setImgFailed(true)} />
          ) : (
            <span className="lv-mhero__img ui-art-fallback" />
          )}
          <span className="lv-mhero__badges">
            <ChannelLogo url={ch.logo.url} name={ch.name} size={40} />
            {air && <LiveTag />}
          </span>
        </Link>
        <div className="lv-mhero__info">
          <p className="lv-mhero__channel">
            {ch.number} · {ch.name}
          </p>
          <h2 className="lv-mhero__title">{air?.title ?? ch.name}</h2>
          {air && (
            <>
              <p className="lv-mhero__time">{formatLiveLine(air.startAt, air.endAt, now)}</p>
              <ProgressBar value={liveProgress(air.startAt, air.endAt, now)} label="Yayın ilerlemesi" />
            </>
          )}
          {lock && <LockLine text={lock} />}
          <div className="lv-mhero__actions">
            {lock ? (
              <Button icon="lock" block onClick={() => onLocked(ch.name, lock)}>
                Neden izleyemiyorum
              </Button>
            ) : (
              <ButtonLink
                variant="play"
                icon="play"
                block
                to={watch}
                onClick={() => {
                  click('canli')
                  rememberChannel(ch.channelId)
                }}
              >
                Canlı İzle
              </ButtonLink>
            )}
            {second}
          </div>
          {ch.isSampleSchedule && <SampleNote className="lv-mhero__sample" />}
        </div>
      </div>
    </section>
  )
}

/* ───────────── Liste satırı ───────────── */

function ChannelListRow({
  entry,
  now,
  onMore,
  onLocked,
}: {
  entry: ChannelEntry
  now: number
  onMore: (e: ChannelEntry) => void
  onLocked: (title: string, reason: string) => void
}): ReactElement {
  const ch = entry.channel
  const { tctx, entityId } = entry.track
  const air = currentAiring(ch, now)
  const next = upcomingAiring(ch, now)
  const lock = lockText(ch.access)
  const fav = useFavorite(ch.channelId, ch.isFavorite)
  const reminder = useReminder(next?.airingId ?? '', next?.hasReminder)
  const label = [
    `${ch.number}, ${ch.name}`,
    air ? `${air.title}, ${formatLiveLine(air.startAt, air.endAt, now)}` : 'Yayın bilgisi yok',
    next ? `Sonra ${formatClock(next.startAt)} ${next.title}` : null,
    lock ?? 'Canlı İzle',
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <li className="lv-mrow">
      <Link
        to={lock ? '#' : liveWatchPath(ch.channelId, tctx)}
        className="lv-mrow__main"
        aria-label={label}
        onClick={(e) => {
          logEvent('click', { surface: 'canli', rowType: 'CHANNEL_ROW', action: lock ? 'kilit' : 'canli', entityId }, tctx)
          if (lock) {
            e.preventDefault()
            onLocked(ch.name, lock)
          } else rememberChannel(ch.channelId)
        }}
      >
        <ChannelLogo url={ch.logo.url} name={ch.name} size={56} className="lv-mrow__logo" />
        <span className="lv-mrow__text">
          <span className="lv-mrow__ch">
            <span>
              {ch.number} · {ch.name}
            </span>
            {fav.on && (
              <span className="lv-mrow__fav" aria-hidden="true">
                <StarIcon filled size={12} />
              </span>
            )}
            {lock && <Badge tone="lock" />}
          </span>
          <span className="lv-mrow__title">{air?.title ?? 'Yayın bilgisi yok'}</span>
          {air && (
            <ProgressBar
              value={liveProgress(air.startAt, air.endAt, now)}
              height={2}
              label="Yayın ilerlemesi"
              className="lv-mrow__progress"
            />
          )}
          {next && (
            <span className="lv-mrow__next">
              {reminder.on && <Icon name="bell" size={12} className="lv-mrow__bell" />}
              Sonra {formatClock(next.startAt)} · {next.title}
            </span>
          )}
        </span>
      </Link>
      <button type="button" className="lv-mrow__more" aria-label={`${ch.name}: diğer eylemler`} onClick={() => onMore(entry)}>
        <Icon name="more" size={22} />
      </button>
    </li>
  )
}

/* ───────────── Kanal eylem sayfası ───────────── */

function SheetAction({
  icon,
  children,
  onClick,
  to,
  pressed,
  custom,
}: {
  icon?: IconName
  children: ReactElement | string
  onClick?: () => void
  to?: string
  pressed?: boolean
  custom?: ReactElement
}): ReactElement {
  const inner = (
    <>
      <span className="lv-sheetact__icon" aria-hidden="true">
        {custom ?? (icon ? <Icon name={icon} size={22} /> : null)}
      </span>
      <span className="lv-sheetact__label">{children}</span>
    </>
  )
  return (
    <li>
      {to ? (
        <Link to={to} className="lv-sheetact" onClick={onClick}>
          {inner}
        </Link>
      ) : (
        <button type="button" className="lv-sheetact" aria-pressed={pressed} onClick={onClick}>
          {inner}
        </button>
      )}
    </li>
  )
}

function ChannelSheet({
  entry,
  now,
  onClose,
}: {
  entry: ChannelEntry | null
  now: number
  onClose: () => void
}): ReactElement | null {
  const [last, setLast] = useState<ChannelEntry | null>(entry)
  if (entry && entry !== last) setLast(entry)
  const shown = entry ?? last
  if (!shown) return null
  return (
    <Sheet open={!!entry} onClose={onClose} title={shown.channel.name} className="lv-chsheet">
      <ChannelSheetBody entry={shown} now={now} onClose={onClose} />
    </Sheet>
  )
}

function ChannelSheetBody({ entry, now, onClose }: { entry: ChannelEntry; now: number; onClose: () => void }): ReactElement {
  const navigate = useNavigate()
  const ch = entry.channel
  const tctx = entry.track.tctx
  const air = currentAiring(ch, now)
  const next = upcomingAiring(ch, now)
  const lock = lockText(ch.access)
  const castable = useCastAvailable()
  const fav = useFavorite(ch.channelId, ch.isFavorite)
  const reminder = useReminder(next?.airingId ?? '', next?.hasReminder)
  const go = (to: string, action: string) => {
    logEvent('click', { surface: 'canli', action, entityId: entry.track.entityId, via: 'kanal-sayfasi' }, tctx)
    if (action === 'canli' || action === 'bastan') rememberChannel(ch.channelId)
    onClose()
    navigate(to)
  }
  return (
    <div className="lv-chsheet__body">
      <div className="lv-chsheet__now">
        <ChannelLogo url={ch.logo.url} name={ch.name} size={48} />
        <span className="lv-chsheet__nowtext">
          <span className="lv-chsheet__meta">
            Kanal {ch.number} · {ch.categoryName}
            {air && <LiveTag />}
          </span>
          <span className="lv-chsheet__title">{air?.title ?? 'Yayın bilgisi yok'}</span>
          {air && <span className="lv-chsheet__meta">{formatLiveLine(air.startAt, air.endAt, now)}</span>}
        </span>
      </div>
      {air && <ProgressBar value={liveProgress(air.startAt, air.endAt, now)} label="Yayın ilerlemesi" />}
      {lock && <LockLine text={lock} />}
      <ul className="lv-sheetacts">
        {!lock && (
          <SheetAction icon="play" onClick={() => go(liveWatchPath(ch.channelId, tctx), 'canli')}>
            Canlı İzle
          </SheetAction>
        )}
        {!lock && air?.startOver && (
          <SheetAction icon="startOver" onClick={() => go(liveWatchPath(ch.channelId, tctx, true), 'bastan')}>
            Baştan Başlat
          </SheetAction>
        )}
        {!lock && castable && (
          <SheetAction
            icon="cast"
            onClick={() => {
              castChannel({ channelId: ch.channelId, name: ch.name, programme: air?.title }, 'canli', tctx)
              onClose()
            }}
          >
            TV'de İzle
          </SheetAction>
        )}
        <SheetAction
          custom={<StarIcon filled={fav.on} size={22} />}
          pressed={fav.on}
          onClick={() => toggleFavorite({ ...ch }, 'canli', tctx)}
        >
          {fav.on ? 'Kanallarımdan Çıkar' : "Kanallarım'a Ekle"}
        </SheetAction>
        {next && (
          <SheetAction
            icon={reminder.on ? 'check' : 'bell'}
            pressed={reminder.on}
            onClick={() => setReminder({ ...next, hasReminder: next.hasReminder }, 'canli', tctx)}
          >
            <span className="lv-sheetact__two">
              <span>{reminder.on ? 'Hatırlatmayı Kaldır' : 'Hatırlat'}</span>
              <span className="lv-sheetact__sub">
                {formatClock(next.startAt)} · {next.title}
              </span>
            </span>
          </SheetAction>
        )}
        <SheetAction icon="guide" onClick={() => go(`/rehber?kanal=${ch.channelId}`, 'rehber')}>
          Rehberde Gör
        </SheetAction>
      </ul>
      {ch.isSampleSchedule && (
        <p className="lv-chsheet__sample">
          <SampleNote /> Program bilgisi örnek veridir.
        </p>
      )}
    </div>
  )
}

/* ───────────── Sayfa ───────────── */

export function LiveMobile({ model, handlers }: { model: LiveModel; handlers: LiveHandlers }): ReactElement {
  const now = model.now
  const [filter, setFilter] = useState<string | null>(null)
  const [sheet, setSheet] = useState<ChannelEntry | null>(null)
  const pills: { key: string; label: string }[] = [
    ...(model.favorites.length ? [{ key: FAVORITES, label: 'Kanallarım' }] : []),
    ...model.categories.map((g) => ({ key: g.key, label: g.name })),
  ]
  const list =
    filter === null
      ? model.entries
      : filter === FAVORITES
        ? model.favorites
        : (model.categories.find((g) => g.key === filter)?.entries ?? [])
  const featured = filter === null ? model.featured : (list[0] ?? model.featured)
  const heading = filter === null ? 'Şu An Yayında' : (pills.find((p) => p.key === filter)?.label ?? 'Kanallar')
  const choose = (key: string | null) => {
    setFilter(key)
    logEvent('click', { surface: 'canli', action: 'kategori', category: key ?? 'tumu' }, null)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="lv-page lv-page--mobile">
      <ShellPills>
        {filter !== null && <PillClear onClick={() => choose(null)} label="Tüm kanallar" />}
        {filter === null && <Pill to="/rehber">Rehber</Pill>}
        {pills
          .filter((p) => filter === null || p.key === filter)
          .map((p) => (
            <Pill key={p.key} selected={filter === p.key} onClick={() => choose(p.key)}>
              {p.label}
            </Pill>
          ))}
      </ShellPills>
      {featured && <LiveMobileHero entry={featured} now={now} onLocked={handlers.openLocked} />}
      <section className="lv-mlist" aria-labelledby="lv-mlist-title">
        <div className="lv-mlist__head ui-gutter">
          <h2 className="ui-row-title" id="lv-mlist-title">
            {heading}
          </h2>
          <Link to="/rehber" className="lv-mlist__guide">
            Rehber
            <Icon name="chevronRight" size={16} />
          </Link>
        </div>
        <ul className={cx('lv-mrows')}>
          {list.map((e) => (
            <ChannelListRow key={e.channel.channelId} entry={e} now={now} onMore={setSheet} onLocked={handlers.openLocked} />
          ))}
        </ul>
        {list.some((e) => e.channel.isSampleSchedule) && (
          <p className="lv-footnote ui-gutter">
            <SampleNote /> İşaretli kanallarda program bilgisi örnek veridir.
          </p>
        )}
      </section>
      <ChannelSheet entry={sheet} now={now} onClose={() => setSheet(null)} />
    </div>
  )
}
