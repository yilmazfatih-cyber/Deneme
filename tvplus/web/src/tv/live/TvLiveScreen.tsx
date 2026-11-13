/**
 * Canlı TV (/tv/canli) — UX_SPEC §4 "Canlı TV".
 *
 *   üstte   süzgeç satırı: Tümü · Kanallarım · kategoriler (OK seçer; ↓ listeye iner)
 *   solda   dikey kanal listesi: numara, logo, ad, şimdiki program + ince ilerleme çizgisi
 *   sağda   odaktaki kanalın sahnesi: kısa beklemeden sonra (bu cihazda oynatılabiliyorsa) sessiz canlı önizleme,
 *           değilse program görseli; başlık, saat aralığı, özet, sıradaki iki program; → ile eylem listesi
 *           (Canlı İzle · Baştan Başlat · Kanallarıma Ekle / Çıkar · Rehber)
 *
 * OK → tam ekran (watchPath('Channel:<id>')). Rakam tuşları listede o numaralı kanala gider (2 sn bekleme).
 * Girişte profilin son kanalı (bu oturumda tam ekranda zap yapıldıysa o kanal) odaklanır; süzgeç ve konum
 * ekrana dönüşte korunur. YouTube kaynaklı kanallarda önizleme açılmaz (UX_SPEC §7 kural 10: üstüne arayüz
 * çizilemez; bu ortamda zaten yüklenemez) — program görseli gösterilir.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { devbus } from '../../lib/devbus'
import { prefetchManifest, PreviewPlayer } from '../../player'
import { logEvent } from '../../telemetry/logger'
import { digitOf, FocusScope, useFocusable, useFocusEngine, useKeyInterceptor, type Direction } from '../focus'
import { TV_PATHS, watchPath } from '../shell/routes'
import {
  formatClock,
  formatRemaining,
  formatTimeRange,
  TvActionList,
  TvButton,
  TvIcon,
  TvLiveTag,
  TvProgress,
  TvScreen,
  TvSkeletonText,
  useScrollFocusedIntoView,
  type TvAction,
} from '../ui'
import { lastTunedChannel, requestGuideChannel, useServerNow, useTvLive, type TvAiring, type TvChannel } from './data'
import {
  airingProgress,
  applyFilter,
  expireEntry,
  liveFilters,
  nowNext,
  typeDigit,
  type LiveFilterId,
  type NumberEntry,
} from './model'
import './live.css'

const SCREEN = 'canli'
const LIST_SCOPE = 'canli-liste'
const FILTER_SCOPE = 'canli-suzgec'
const ACTIONS_SCOPE = 'canli-eylemler'
/** Önizlemeden önce odakta bekleme (hızlı gezinmede oynatıcı kurulmaz) */
const PREVIEW_DWELL_MS = 900
/** PreviewPlayer 30 sn sonra durur; donmuş kare yerine görsele dönülür */
const PREVIEW_MAX_MS = 29_000

export const channelFocusId = (id: number): string => `${SCREEN}:kanal:${id}`
const filterFocusId = (id: LiveFilterId): string => `${SCREEN}:suzgec:${id}`

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

/** Ekrana dönüşte süzgeç korunur. */
let rememberedFilter: LiveFilterId = 'tumu'

/** Bu cihazda uygulamanın kendi hattıyla oynatılabilen (önizlenebilen) kanal. */
const previewable = (c: TvChannel): boolean => c.sourceKind !== 'YOUTUBE' && c.access.state === 'PLAYABLE'

function upcomingOf(c: TvChannel, now: number): { now: TvAiring | null; next: TvAiring[] } {
  const list = [...(c.upcoming ?? [])]
  if (c.now) list.push(c.now)
  if (c.next) list.push(c.next)
  const r = nowNext(list, now, 2)
  // Şimdiki yayının görsel ve özeti `now` alanında gelir.
  const live = r.now && c.now && r.now.airingId === c.now.airingId ? { ...r.now, ...c.now } : r.now
  return { now: live, next: r.next }
}

/* ───────────── Süzgeç ───────────── */

function FilterChip({
  id,
  label,
  active,
  onSelect,
  onDown,
}: {
  id: LiveFilterId
  label: string
  active: boolean
  onSelect: () => void
  onDown: () => boolean
}): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({
    id: filterFocusId(id),
    onEnter: onSelect,
    onArrow: (dir: Direction) => (dir === 'down' ? onDown() : false),
  })
  return (
    <div
      ref={ref}
      role="tab"
      aria-selected={active}
      className={cx('tvl-chip', active && 'is-active', focused && 'is-focused')}
    >
      {label}
    </div>
  )
}

/* ───────────── Kanal satırı ───────────── */

function ChannelRow({
  channel,
  now,
  favorite,
  selected,
  autoFocus,
  onFocus,
  onOpen,
  onRight,
}: {
  channel: TvChannel
  now: number
  favorite: boolean
  selected: boolean
  autoFocus: boolean
  onFocus: () => void
  onOpen: () => void
  onRight: () => boolean
}): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({
    id: channelFocusId(channel.channelId),
    onEnter: onOpen,
    onFocus,
    autoFocus,
    // → her zaman sahnenin eylem listesine (uzamsal seçim üstteki süzgeç satırını yeğleyebilirdi)
    onArrow: (dir) => (dir === 'right' ? onRight() : false),
  })
  const air = channel.now
  const locked = channel.access.state !== 'PLAYABLE'
  const label = [
    `${channel.number} ${channel.name}`,
    air ? `şimdi ${air.title}, ${formatTimeRange(air.startAt, air.endAt)}` : null,
    favorite ? 'Kanallarımda' : null,
    locked ? 'kilitli' : null,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <div
      ref={ref}
      role="listitem"
      aria-label={label}
      className={cx('tvl-row', focused && 'is-focused', selected && !focused && 'is-selected')}
    >
      <span className="tvl-row__num">{channel.number}</span>
      <span className="tvl-row__logo">
        <img src={channel.logo.url} alt="" decoding="async" />
      </span>
      <span className="tvl-row__text">
        <span className="tvl-row__name">
          {channel.name}
          {favorite && <TvIcon name="check" size={1.1} className="tvl-row__fav" />}
          {locked && <TvIcon name="lock" size={1.1} className="tvl-row__fav" />}
        </span>
        <span className="tvl-row__title">{air?.title ?? 'Yayın bilgisi yok'}</span>
        {air && <TvProgress value={airingProgress(air, now)} className="tvl-row__progress" label="Yayın ilerlemesi" />}
      </span>
    </div>
  )
}

/* ───────────── Sahne ───────────── */

type PreviewState = 'off' | 'trying' | 'playing'

function StageMedia({ channel }: { channel: TvChannel }): ReactElement {
  const [preview, setPreview] = useState<PreviewState>('off')
  const art = channel.now?.art?.url ?? null
  const canPreview = previewable(channel)

  useEffect(() => {
    setPreview('off')
    if (!canPreview) return
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setTimeout(() => setPreview('trying'), PREVIEW_DWELL_MS)
    return () => window.clearTimeout(t)
  }, [channel.channelId, canPreview])

  useEffect(() => {
    if (preview !== 'playing') return
    const t = window.setTimeout(() => setPreview('off'), PREVIEW_MAX_MS)
    return () => window.clearTimeout(t)
  }, [preview])

  return (
    <div className="tvl-media" data-preview={preview}>
      {art ? (
        <img key={art} className="tvl-media__art" src={art} alt="" decoding="async" />
      ) : (
        <div className="tvl-media__art tvl-media__art--empty">
          <img src={channel.logo.url} alt="" />
        </div>
      )}
      {preview !== 'off' && (
        <div className={cx('tvl-media__preview', preview === 'playing' && 'is-on')} aria-hidden="true">
          <PreviewPlayer
            key={channel.channelId}
            viewableId={`Channel:${channel.channelId}`}
            offsetSec={0}
            muted
            onPlaying={() => setPreview('playing')}
            onError={() => setPreview('off')}
          />
        </div>
      )}
      <div className="tvl-media__scrim" aria-hidden="true" />
      <div className="tvl-media__badges">
        <TvLiveTag />
        <span className="tvl-media__logo">
          <img src={channel.logo.url} alt="" />
        </span>
      </div>
    </div>
  )
}

function Stage({
  channel,
  now,
  favorite,
  onWatch,
  onStartOver,
  onToggleFavorite,
  onGuide,
  onLeft,
}: {
  channel: TvChannel
  now: number
  favorite: boolean
  onWatch: () => void
  onStartOver: () => void
  onToggleFavorite: () => void
  onGuide: () => void
  onLeft: () => boolean
}): ReactElement {
  const { now: air, next } = upcomingOf(channel, now)
  const remainingSec = air ? Math.max(0, (Date.parse(air.endAt) - now) / 1000) : 0
  const lock =
    channel.access.state !== 'PLAYABLE'
      ? (channel.access.reasonText ??
        (channel.access.requiredProductName ? `${channel.access.requiredProductName} paketiyle` : 'Paketinde yok'))
      : null
  const actions: TvAction[] = [
    { id: `${SCREEN}:eylem:izle`, label: 'Canlı İzle', icon: 'play', onPress: onWatch },
    ...(air?.startOver && !lock
      ? [{ id: `${SCREEN}:eylem:bastan`, label: 'Baştan Başlat', icon: 'restart' as const, onPress: onStartOver }]
      : []),
    {
      id: `${SCREEN}:eylem:kanallarim`,
      label: favorite ? 'Kanallarımdan Çıkar' : 'Kanallarıma Ekle',
      icon: favorite ? 'check' : 'plus',
      onPress: onToggleFavorite,
    },
    { id: `${SCREEN}:eylem:rehber`, label: 'Rehber', icon: 'guide', onPress: onGuide },
  ]
  return (
    <section className="tvl-stage" aria-label={`${channel.name} kanalı`} aria-live="polite">
      <StageMedia channel={channel} />
      <div className="tvl-stage__body">
        <div className="tvl-info">
          <p className="tvl-info__channel">
            {channel.number} · {channel.name}
            {channel.isHd && <span className="tvl-hd">HD</span>}
          </p>
          <h2 className="tvl-info__title">{air?.title ?? channel.name}</h2>
          {air ? (
            <>
              <p className="tvl-info__time">
                {formatTimeRange(air.startAt, air.endAt)} · {formatRemaining(remainingSec)}
              </p>
              <TvProgress value={airingProgress(air, now)} className="tvl-info__progress" label="Yayın ilerlemesi" />
            </>
          ) : (
            <p className="tvl-info__time">Yayın bilgisi yok</p>
          )}
          {lock && (
            <p className="tvl-info__lock">
              <TvIcon name="lock" size={1.3} /> {lock}
            </p>
          )}
          <p className="tvl-info__synopsis">{air?.synopsis || channel.description || ''}</p>
          {next.length > 0 && (
            <ul className="tvl-next" aria-label="Sonra">
              {next.map((a) => (
                <li key={a.airingId}>
                  <span className="tvl-next__time">{formatClock(a.startAt)}</span>
                  <span className="tvl-next__title">{a.title}</span>
                </li>
              ))}
            </ul>
          )}
          {channel.isSampleSchedule && <p className="tvl-sample">Örnek yayın akışı</p>}
        </div>
        {/* ← kanal listesine döner (uzamsal seçim üstteki süzgeç satırını yeğleyebilirdi) */}
        <FocusScope onEdge={(dir) => (dir === 'left' ? onLeft() : false)}>
          <TvActionList id={ACTIONS_SCOPE} actions={actions} className="tvl-actions" />
        </FocusScope>
      </div>
    </section>
  )
}

/* ───────────── Kanal numarası ───────────── */

function NumberOverlay({ text, missing }: { text: string; missing: boolean }): ReactElement {
  return (
    <div className={cx('tvl-number', missing && 'is-missing')} role="status" aria-live="assertive">
      {missing ? (
        <span className="tvl-number__msg">{text}</span>
      ) : (
        <>
          <span className="tvl-number__label">Kanal</span>
          <span className="tvl-number__digits">{text}</span>
        </>
      )}
    </div>
  )
}

/* ───────────── Ekran ───────────── */

export function TvLive(): ReactElement {
  const navigate = useNavigate()
  const engine = useFocusEngine()
  const live = useTvLive()
  const now = useServerNow(15_000)
  const { channels, heroId, isFavorite } = live
  const [filter, setFilterState] = useState<LiveFilterId>(rememberedFilter)
  const setFilter = useCallback((f: LiveFilterId) => {
    rememberedFilter = f
    setFilterState(f)
  }, [])
  const filters = useMemo(() => liveFilters(channels), [channels])
  const visible = useMemo(() => applyFilter(channels, filter, isFavorite), [channels, filter, isFavorite])
  const entryId = lastTunedChannel() ?? heroId ?? channels[0]?.channelId ?? null
  const [selectedId, setSelectedId] = useState<number | null>(entryId)
  const selected =
    channels.find((c) => c.channelId === selectedId) ??
    channels.find((c) => c.channelId === entryId) ??
    visible[0] ??
    null

  /* Açılış: son kanal odaklanır (zap yapıldıysa o kanal). Süzgeçte yoksa Tümü'ne dönülür. */
  const placed = useRef(false)
  const [pendingFocus, setPendingFocus] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (placed.current || !channels.length || entryId === null) return
    placed.current = true
    if (!visible.some((c) => c.channelId === entryId) && channels.some((c) => c.channelId === entryId)) {
      setFilter('tumu')
    }
    setSelectedId(entryId)
    setPendingFocus(entryId)
  }, [channels, entryId, visible, setFilter])
  useLayoutEffect(() => {
    if (pendingFocus === null) return
    if (engine.focus(channelFocusId(pendingFocus), 'auto')) setPendingFocus(null)
  }, [pendingFocus, visible, engine])

  /* Komşu manifest ön hazırlığı: seçili kanal (OK → tam ekran hemen başlasın). */
  useEffect(() => {
    if (!selected || !previewable(selected)) return
    const t = window.setTimeout(() => {
      devbus.emit('prefetch', 'canlı kanal (TV)', { viewableId: `Channel:${selected.channelId}` })
      void prefetchManifest(`Channel:${selected.channelId}`)
    }, 400)
    return () => window.clearTimeout(t)
  }, [selected?.channelId])

  const open = useCallback(
    (c: TvChannel, startOver = false) => {
      const tctx = live.tctxOf(c.channelId)
      logEvent(
        'click',
        { surface: 'tv-canli', action: startOver ? 'bastan' : 'canli-izle', entityId: c.unifiedEntityId },
        tctx,
      )
      navigate(watchPath(`Channel:${c.channelId}`, { tctx, startOver }))
    },
    [live, navigate],
  )

  const openGuide = useCallback(
    (c: TvChannel) => {
      requestGuideChannel(c.channelId)
      navigate(TV_PATHS.guide)
    },
    [navigate],
  )

  /* Rakam tuşları: kanal numarası. */
  const [entry, setEntry] = useState<NumberEntry | null>(null)
  const [missing, setMissing] = useState<string | null>(null)
  const numbers = useMemo(() => channels.map((c) => c.number), [channels])
  const tune = useCallback(
    (n: number) => {
      const target = channels.find((c) => c.number === n)
      if (!target) {
        setMissing(`${n} numaralı kanal yok`)
        return
      }
      devbus.emit('device', 'kanal numarası (Canlı TV)', { number: n, channelId: target.channelId })
      if (!visible.some((c) => c.channelId === target.channelId)) setFilter('tumu')
      setSelectedId(target.channelId)
      setPendingFocus(target.channelId)
    },
    [channels, visible, setFilter],
  )
  useKeyInterceptor(
    (key) => {
      const d = digitOf(key)
      if (d === null) {
        if (key !== 'CHANNEL_UP' && key !== 'CHANNEL_DOWN') return false
        // Kanal +/−: listede önceki / sonraki kanal
        const i = visible.findIndex((c) => c.channelId === selected?.channelId)
        const next = visible[i + (key === 'CHANNEL_UP' ? -1 : 1)]
        if (next) {
          setSelectedId(next.channelId)
          setPendingFocus(next.channelId)
        }
        return true
      }
      setMissing(null)
      const r = typeDigit(entry, d, numbers, Date.now())
      setEntry(r.entry)
      if (r.commit !== null) tune(r.commit)
      return true
    },
    20,
    channels.length > 0,
  )
  useEffect(() => {
    if (!entry) return
    const t = window.setTimeout(() => {
      const r = expireEntry(entry, Date.now())
      setEntry(r.entry)
      if (r.commit !== null) tune(r.commit)
    }, 2000)
    return () => window.clearTimeout(t)
  }, [entry, tune])
  useEffect(() => {
    if (!missing) return
    const t = window.setTimeout(() => setMissing(null), 2000)
    return () => window.clearTimeout(t)
  }, [missing])

  const listRef = useRef<HTMLDivElement | null>(null)
  useScrollFocusedIntoView(listRef, 96)

  const toList = (): boolean => engine.focusScope(LIST_SCOPE)
  const defaultFocus = entryId !== null ? channelFocusId(entryId) : filterFocusId('tumu')

  return (
    <TvScreen id={SCREEN} title="Canlı TV" defaultFocus={defaultFocus} className="tvl">
      <header className="tvl-head">
        <h1 className="tvl-head__title">Canlı TV</h1>
        <FocusScope id={FILTER_SCOPE} orientation="horizontal">
          <div className="tvl-chips" role="tablist" aria-label="Kanal süzgeci">
            {filters.map((f) => (
              <FilterChip
                key={f.id}
                id={f.id}
                label={f.label}
                active={f.id === filter}
                onSelect={() => setFilter(f.id)}
                onDown={toList}
              />
            ))}
          </div>
        </FocusScope>
      </header>

      <div className="tvl-body">
        <div className="tvl-list" ref={listRef}>
          {live.error && !channels.length ? (
            <div className="tvl-empty">
              <p>Kanallar yüklenemedi.</p>
              <TvButton id={`${SCREEN}:tekrar`} label="Tekrar dene" onPress={live.refetch} />
            </div>
          ) : !channels.length ? (
            <div className="tvl-skeleton" role="status" aria-label="Yükleniyor">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="tv-skel tvl-skeleton__row" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="tvl-empty">
              {filter === 'kanallarim'
                ? 'Kanallarım boş. Bir kanalda → ile Kanallarıma Ekle’yi seç.'
                : 'Bu kategoride kanal yok.'}
            </p>
          ) : (
            <FocusScope id={LIST_SCOPE} orientation="vertical">
              <div className="tvl-list__rows" role="list" aria-label="Kanallar">
                {visible.map((c) => (
                  <ChannelRow
                    key={c.channelId}
                    channel={c}
                    now={now}
                    favorite={isFavorite(c)}
                    selected={c.channelId === selected?.channelId}
                    autoFocus={c.channelId === entryId}
                    onFocus={() => setSelectedId(c.channelId)}
                    onOpen={() => open(c)}
                    onRight={() => engine.focusScope(ACTIONS_SCOPE)}
                  />
                ))}
              </div>
            </FocusScope>
          )}
        </div>

        {selected ? (
          <Stage
            channel={selected}
            now={now}
            favorite={isFavorite(selected)}
            onWatch={() => open(selected)}
            onStartOver={() => open(selected, true)}
            onToggleFavorite={() => live.toggleFavorite(selected)}
            onGuide={() => openGuide(selected)}
            onLeft={() =>
              engine.focus(channelFocusId(selected.channelId)) ||
              engine.focusScope(LIST_SCOPE) ||
              engine.focusScope(FILTER_SCOPE)
            }
          />
        ) : (
          <div className="tvl-stage tvl-stage--loading">
            <div className="tv-skel tvl-media" />
            <TvSkeletonText lines={4} width={40} />
          </div>
        )}
      </div>

      {(entry || missing) && <NumberOverlay text={missing ?? `${entry?.digits ?? ''}_`} missing={!!missing} />}
    </TvScreen>
  )
}
