/**
 * Canlı TV — masaüstü (≥ 900 px). Netflix göz atma sayfasının diliyle:
 *   Vitrin    seçili kanalın ŞU AN yayındaki programı: oynatılabiliyorsa sessiz canlı görüntü arkada (Netflix
 *             vitrin tanıtımı gibi 28 sn sonra durağan görsele döner, "Yeniden oynat"), kanal logosu + CANLI,
 *             program adı, "20:00–23:15 · 42 dk kaldı", ince ilerleme çizgisi, ▶ Canlı İzle (beyaz) · Baştan Başlat ·
 *             TV'de İzle; sağda ses düğmesi. Üstte sayfa başlığı ve "Rehber" bağlantısı (Netflix tür sayfası başlığı).
 *   Satırlar  aynı `Slider`: Şu An Yayında · Kanallarım · Az Sonra · Hatırlatmaların · kategori satırları ·
 *             Bu Akşam · Kaçırdıkların. Kanal kartı 16:9: program görseli, sol üstte kanal logosu, CANLI, ilerleme,
 *             "HH:MM–HH:MM"; sağ üstte sakin yıldız. Kanal kartının üzerinde beklenince önizleme kartı açılır.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { logEvent } from '../../telemetry/logger'
import {
  Badge,
  Billboard,
  BillboardImage,
  BillboardSide,
  Button,
  ButtonLink,
  cx,
  formatClock,
  formatDayTime,
  formatLiveLine,
  formatTimeRange,
  Icon,
  LiveTag,
  liveProgress,
  ProgressBar,
  Slider,
  TitleCard,
  usePrefersReducedMotion,
  type SliderItemContext,
} from '../../ui'
import { PreviewPlayer } from '../../player'
import { castChannel, rememberChannel, useCastAvailable } from './actions'
import { catchupOpen, liveWatchPath, lockText, timeStateOf } from './airing'
import { ChannelHoverCard, type HoverTarget } from './ChannelHoverCard'
import { asAiring, catchupMeta, type RenderableRow } from './liveLogic'
import { currentAiring, previewable, upcomingAiring, type ChannelEntry } from './liveRows'
import { FavoriteToggle, ReminderToggle, SampleNote } from './parts'
import type { AiringSheetTarget } from './shared'
import type { AiringBriefData, AiringChannelData, ArtworkData } from './types'
import type { LiveModel, ReminderAiring } from './useLiveModel'

const HOVER_DELAY_MS = 500
const HERO_PREVIEW_DELAY_MS = 1200
/** PreviewPlayer 30 sn'de durur; donmuş kare görünmesin diye vitrin biraz önce görsele döner. */
const HERO_PREVIEW_MAX_MS = 28_000

export interface LiveHandlers {
  openAiring: (t: AiringSheetTarget) => void
  openLocked: (title: string, reason: string) => void
}

/* ───────────── Vitrin ───────────── */

type PreviewState = 'idle' | 'trying' | 'playing' | 'ended' | 'failed'

function LiveBillboard({
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
  const next = upcomingAiring(ch, now)
  const lock = lockText(ch.access)
  const castable = useCastAvailable()
  const reduced = usePrefersReducedMotion()
  const canPreview = previewable(ch) && !reduced
  const [preview, setPreview] = useState<PreviewState>('idle')
  const [muted, setMuted] = useState(true)
  const [inView, setInView] = useState(true)
  const [round, setRound] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  // Vitrin görünür değilken (aşağı kaydırınca) canlı görüntü durur; geri gelince yeniden başlar.
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setInView((e?.intersectionRatio ?? 0) > 0.4), {
      threshold: [0, 0.4, 1],
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    setPreview('idle')
  }, [ch.channelId])

  useEffect(() => {
    if (!canPreview || !inView) {
      setPreview((p) => (p === 'trying' || p === 'playing' ? 'idle' : p))
      return
    }
    if (preview !== 'idle') return
    const t = window.setTimeout(() => setPreview('trying'), HERO_PREVIEW_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [canPreview, inView, preview, round])

  useEffect(() => {
    if (preview !== 'playing') return
    const t = window.setTimeout(() => setPreview('ended'), HERO_PREVIEW_MAX_MS)
    return () => window.clearTimeout(t)
  }, [preview])

  const click = (action: string) =>
    logEvent('click', { surface: 'canli', rowType: 'LIVE_HERO', action, entityId: entry.track.entityId }, tctx)
  const art = air?.art?.url ?? air?.card?.url ?? null
  const playing = preview === 'playing'

  return (
    <div ref={rootRef} className="lv-bb-wrap">
      <Billboard
        label={`Şimdi ${ch.name} kanalında`}
        className={cx('lv-bb', ch.isSampleSchedule && 'lv-bb--cover', playing && 'is-playing')}
        media={
          <>
            <BillboardImage src={art} />
            {(preview === 'trying' || playing) && (
              <div className={cx('lv-bb__video', playing && 'is-on')} aria-hidden="true">
                <PreviewPlayer
                  key={round}
                  viewableId={`Channel:${ch.channelId}`}
                  offsetSec={0}
                  muted={muted}
                  onPlaying={() => setPreview('playing')}
                  onError={() => setPreview('failed')}
                />
              </div>
            )}
          </>
        }
        side={
          canPreview ? (
            <BillboardSide
              muted={playing ? muted : undefined}
              onToggleMute={playing ? () => setMuted((m) => !m) : undefined}
              ended={preview === 'ended'}
              onReplay={() => {
                setRound((r) => r + 1)
                setPreview('trying')
              }}
            />
          ) : undefined
        }
      >
        <div className={cx('lv-bb-info', playing && 'is-compact')}>
          <div className="lv-bb-info__channel">
            <img className="lv-bb-info__logo" src={ch.logo.url} alt="" />
            <span className="lv-bb-info__chname">
              {ch.number} · {ch.name}
            </span>
            {air && <LiveTag />}
          </div>
          <h2 className="lv-bb-info__title">{air?.title ?? ch.name}</h2>
          {air && (
            <div className="lv-bb-info__time">
              <span>{formatLiveLine(air.startAt, air.endAt, now)}</span>
              <ProgressBar
                value={liveProgress(air.startAt, air.endAt, now)}
                height={2}
                label="Yayın ilerlemesi"
                className="lv-bb-info__progress"
              />
            </div>
          )}
          {(air?.synopsis || ch.description) && (
            <p className="lv-bb-info__synopsis">{air?.synopsis || ch.description}</p>
          )}
          <div className="lv-bb-info__actions">
            {lock ? (
              <Button size="lg" icon="lock" onClick={() => onLocked(ch.name, lock)}>
                Neden izleyemiyorum
              </Button>
            ) : (
              <ButtonLink
                variant="play"
                size="lg"
                icon="play"
                to={liveWatchPath(ch.channelId, tctx)}
                onClick={() => {
                  click('canli')
                  rememberChannel(ch.channelId)
                }}
              >
                Canlı İzle
              </ButtonLink>
            )}
            {!lock && air?.startOver && (
              <ButtonLink
                size="lg"
                icon="startOver"
                to={liveWatchPath(ch.channelId, tctx, true)}
                onClick={() => {
                  click('bastan')
                  rememberChannel(ch.channelId)
                }}
              >
                Baştan Başlat
              </ButtonLink>
            )}
            {!lock && castable && (
              <Button
                size="lg"
                icon="cast"
                onClick={() => castChannel({ channelId: ch.channelId, name: ch.name, programme: air?.title }, 'canli', tctx)}
              >
                TV'de İzle
              </Button>
            )}
          </div>
          {next && (
            <p className="lv-bb-info__next">
              Sırada {formatClock(next.startAt)} · {next.title}
            </p>
          )}
          {ch.isSampleSchedule && <SampleNote className="lv-bb-info__sample" />}
        </div>
      </Billboard>
    </div>
  )
}

/* ───────────── Kartlar ───────────── */

interface HoverApi {
  enter: (entry: ChannelEntry, el: HTMLElement, edge: 'left' | 'right' | null, sliding: boolean) => void
  leave: () => void
}

function ChannelCard({
  entry,
  ctx,
  now,
  rowType,
  hover,
  onLocked,
}: {
  entry: ChannelEntry
  ctx: SliderItemContext
  now: number
  rowType: string
  hover: HoverApi
  onLocked: (title: string, reason: string) => void
}): ReactElement {
  const ch = entry.channel
  const { tctx, entityId } = entry.track
  const air = currentAiring(ch, now)
  const lock = lockText(ch.access)
  const wrapRef = useRef<HTMLDivElement>(null)
  const time = air ? formatTimeRange(air.startAt, air.endAt) : 'Yayın bilgisi yok'
  const label = air
    ? `${ch.name}, ${air.title}, ${formatLiveLine(air.startAt, air.endAt, now)}${lock ? `, ${lock}` : ', Canlı İzle'}`
    : ch.name
  return (
    <div
      ref={wrapRef}
      className="lv-card"
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return
        const media = wrapRef.current?.querySelector<HTMLElement>('.ui-card__media')
        if (media) hover.enter(entry, media, ctx.edge, ctx.sliding)
      }}
      onPointerLeave={hover.leave}
    >
      <TitleCard
        title={air?.title ?? ch.name}
        image={air?.card?.url ?? air?.art?.url}
        channelLogo={ch.logo.url}
        channelName={ch.name}
        progress={air ? liveProgress(air.startAt, air.endAt, now) : null}
        caption={
          <>
            <span className="lv-card__time">{time}</span>
            {air && <span className="lv-card__prog">{air.title}</span>}
          </>
        }
        tabIndex={ctx.tabIndex}
        aria-label={label}
        to={lock ? undefined : liveWatchPath(ch.channelId, tctx)}
        onClick={(e) => {
          logEvent('click', { surface: 'canli', rowType, action: lock ? 'kilit' : 'canli', entityId }, tctx)
          if (lock) {
            e.preventDefault()
            onLocked(ch.name, lock)
          } else rememberChannel(ch.channelId)
        }}
      />
      <span className="lv-card__over">
        {lock ? <Badge tone="lock" className="lv-card__tag" /> : air && <LiveTag className="lv-card__tag" />}
        <FavoriteToggle
          channelId={ch.channelId}
          name={ch.name}
          server={ch.isFavorite}
          surface="canli"
          tctx={tctx}
          tabIndex={ctx.tabIndex}
          className="lv-card__toggle"
        />
      </span>
    </div>
  )
}

interface AiringItem {
  airing: AiringBriefData
  channel: AiringChannelData
  image: string | null | undefined
  tctx: string | null
  entityId: string
}

/** Yayın kartı (Az Sonra, Hatırlatmaların, Bu Akşam, Kaçırdıkların): dokununca yayın penceresi açılır. */
function AiringCard({
  item,
  ctx,
  now,
  rowType,
  caption,
  onOpen,
}: {
  item: AiringItem
  ctx: SliderItemContext
  now: number
  rowType: string
  caption: string
  onOpen: (t: AiringSheetTarget) => void
}): ReactElement {
  const { airing, channel, tctx } = item
  const state = timeStateOf(airing.startAt, airing.endAt, now)
  const live = state === 'LIVE'
  const lock = lockText(airing.access)
  const playable = live && !lock
  return (
    <div className="lv-card">
      <TitleCard
        title={airing.title}
        image={item.image}
        channelLogo={channel.logo.url}
        channelName={channel.name}
        progress={live ? liveProgress(airing.startAt, airing.endAt, now) : undefined}
        caption={
          <>
            <span className="lv-card__time">{caption}</span>
            <span className="lv-card__prog">{airing.title}</span>
          </>
        }
        tabIndex={ctx.tabIndex}
        aria-label={`${channel.name}, ${airing.title}, ${caption}`}
        to={playable ? liveWatchPath(channel.channelId, tctx) : undefined}
        onClick={(e) => {
          logEvent(
            'click',
            { surface: 'canli', rowType, action: playable ? 'canli' : 'ayrinti', entityId: item.entityId },
            tctx,
          )
          if (playable) {
            rememberChannel(channel.channelId)
            return
          }
          e.preventDefault()
          onOpen({ airing, channel, tctx, surface: 'canli' })
        }}
      />
      <span className="lv-card__over">
        {live && <LiveTag className="lv-card__tag" />}
        {state === 'UPCOMING' && !lock && (
          <ReminderToggle
            airing={airing}
            surface="canli"
            tctx={tctx}
            tabIndex={ctx.tabIndex}
            className="lv-card__toggle lv-card__toggle--always"
          />
        )}
      </span>
    </div>
  )
}

/* ───────────── Satır ───────────── */

function LiveSlider<T>({
  rowId,
  rowType,
  title,
  items,
  getKey,
  track,
  renderItem,
  sample,
  moreHref,
  model,
}: {
  rowId: string
  rowType: string
  title: string
  items: readonly T[]
  getKey: (item: T) => string | number
  track: (item: T) => { entityId: string; tctx: string } | null
  renderItem: (item: T, ctx: SliderItemContext) => ReactNode
  sample?: boolean
  moreHref?: string
  model: LiveModel
}): ReactElement | null {
  if (!items.length) return null
  return (
    <Slider
      title={title}
      moreHref={moreHref}
      moreLabel="Rehber"
      items={items}
      getKey={getKey}
      className="lv-row"
      headerExtra={sample ? <SampleNote className="lv-row__sample" /> : undefined}
      onVisibleRangeChange={({ from, to }) =>
        model.onVisible(
          rowId,
          rowType,
          items.slice(from, to + 1).flatMap((it) => {
            const t = track(it)
            return t ? [t] : []
          }),
        )
      }
      renderItem={renderItem}
    />
  )
}

const channelTrack = (e: ChannelEntry) => ({ entityId: e.track.entityId, tctx: e.track.tctx })

function airingItemFromRow(row: RenderableRow): AiringItem[] {
  return row.items.flatMap((it) => {
    const a = asAiring(it)
    return a
      ? [{ airing: a, channel: a.channel, image: a.art?.url, tctx: it.track.tctx, entityId: it.track.entityId }]
      : []
  })
}

function reminderItem(a: ReminderAiring): AiringItem {
  return {
    airing: a,
    channel: a.channel,
    image: (a.artwork as ArtworkData | null)?.url,
    tctx: null,
    entityId: a.unifiedEntityId,
  }
}

/* ───────────── Sayfa ───────────── */

export function LiveDesktop({ model, handlers }: { model: LiveModel; handlers: LiveHandlers }): ReactElement {
  const now = model.now
  const [hover, setHover] = useState<HoverTarget | null>(null)
  const timer = useRef<number | null>(null)
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])

  const hoverApi: HoverApi = {
    enter: (entry, el, edge, sliding) => {
      clear()
      if (sliding) return
      timer.current = window.setTimeout(
        () => setHover({ entry, anchor: el, edge }),
        hover ? 120 : HOVER_DELAY_MS, // önizleme açıkken komşu karta geçiş hızlı
      )
    },
    leave: () => {
      clear()
      timer.current = window.setTimeout(() => setHover(null), 120)
    },
  }
  const closeHover = useCallback(() => {
    clear()
    setHover(null)
  }, [])

  // "Örnek yayın akışı" etiketi örnek veri taşıyan İLK satırın başlığında (ve sayfa altındaki notta) durur.
  let sampleShown = false
  const sampleOnce = (has: boolean) => {
    if (!has || sampleShown) return false
    sampleShown = true
    return true
  }

  const channelRow = (rowId: string, title: string, entries: ChannelEntry[], moreHref?: string) => (
    <LiveSlider
      key={rowId}
      rowId={rowId}
      rowType="CHANNEL_ROW"
      title={title}
      items={entries}
      getKey={(e) => e.channel.channelId}
      track={channelTrack}
      sample={sampleOnce(entries.some((e) => e.channel.isSampleSchedule))}
      moreHref={moreHref}
      model={model}
      renderItem={(e, ctx) => (
        <ChannelCard
          entry={e}
          ctx={ctx}
          now={now}
          rowType="CHANNEL_ROW"
          hover={hoverApi}
          onLocked={handlers.openLocked}
        />
      )}
    />
  )

  const airingRow = (rowId: string, rowType: string, title: string, items: AiringItem[], caption: (a: AiringItem) => string) => (
    <LiveSlider
      key={rowId}
      rowId={rowId}
      rowType={rowType}
      title={title}
      items={items}
      getKey={(it) => it.airing.airingId}
      track={(it) => (it.tctx ? { entityId: it.entityId, tctx: it.tctx } : null)}
      sample={sampleOnce(items.some((it) => it.channel.isSampleSchedule))}
      model={model}
      renderItem={(it, ctx) => (
        <AiringCard
          item={it}
          ctx={ctx}
          now={now}
          rowType={rowType}
          caption={caption(it)}
          onOpen={handlers.openAiring}
        />
      )}
    />
  )

  const upNextItems: AiringItem[] = model.upNext.map(({ entry, airing }) => ({
    airing,
    channel: entry.channel,
    image: airing.card?.url,
    tctx: entry.track.tctx,
    entityId: airing.unifiedEntityId,
  }))
  const liveCaption = (it: AiringItem) =>
    timeStateOf(it.airing.startAt, it.airing.endAt, now) === 'LIVE'
      ? formatLiveLine(it.airing.startAt, it.airing.endAt, now)
      : formatDayTime(it.airing.startAt, now)

  return (
    <div className="lv-page lv-page--desktop">
      <h1 className="ui-sr-only">Canlı TV</h1>
      <div className="lv-subnav">
        <span className="lv-subnav__title" aria-hidden="true">
          Canlı TV
        </span>
        <Link to="/rehber" className="lv-subnav__link">
          <Icon name="guide" size={18} />
          Rehber
        </Link>
      </div>
      {model.featured && <LiveBillboard entry={model.featured} now={now} onLocked={handlers.openLocked} />}
      <div className="ui-billboard-rows lv-rows">
        {channelRow('live-all', 'Şu An Yayında', model.entries, '/rehber')}
        {channelRow('live-favorites', 'Kanallarım', model.favorites)}
        {airingRow('live-upnext', 'TONIGHT_ROW', 'Az Sonra', upNextItems, (it) => `${formatClock(it.airing.startAt)} · ${it.channel.name}`)}
        {airingRow('live-reminders', 'TONIGHT_ROW', 'Hatırlatmaların', model.reminders.map(reminderItem), liveCaption)}
        {model.categories.map((g) => channelRow(`live-cat-${g.key}`, g.name, g.entries))}
        {model.tonight &&
          airingRow(model.tonight.rowId, 'TONIGHT_ROW', 'Bu Akşam', airingItemFromRow(model.tonight), liveCaption)}
        {model.catchup &&
          airingRow(model.catchup.rowId, 'CATCHUP_ROW', 'Kaçırdıkların', airingItemFromRow(model.catchup), (it) =>
            catchupOpen(it.airing, now) ? catchupMeta(it.airing, now) : 'Tekrar izlenemiyor',
          )}
        {model.entries.some((e) => e.channel.isSampleSchedule) && (
          <p className="lv-footnote ui-gutter">
            <SampleNote /> İşaretli kanallarda program bilgisi örnek veridir, kanalın gerçek yayın akışı değildir.
          </p>
        )}
      </div>
      {hover && (
        <ChannelHoverCard
          key={hover.entry.channel.channelId}
          target={hover}
          now={now}
          onPointerEnter={clear}
          onPointerLeave={hoverApi.leave}
          onClose={closeHover}
        />
      )}
    </div>
  )
}
