/**
 * Rehber (/tv/rehber) — kumandayla gezilen zaman ızgarası.
 *
 *   üstte    "Rehber" · gün seçici (Bugün / Yarın) · tuş ipuçları
 *   şerit    odaktaki yayının ayrıntısı: görsel, kanal, başlık, saat, özet, örnek akış etiketi
 *   ızgara   kanallar aşağı, zaman sağa (30 dk sütunlar, süreyle orantılı bloklar, kırmızı "şimdi" çizgisi);
 *            kanal sütunu ve saat başlığı sabit kalır, ızgara odaktaki bloğu görünür tutacak şekilde kayar
 *
 * Tuşlar: ←/→ aynı kanalda önceki / sonraki yayın (bugünün sonunda → yarına geçer) · ↑/↓ komşu kanalda aynı ana
 * denk gelen yayın (guideModel.verticalStep) · Kanal +/− beş kanal · OK pencere: yayında → Canlı İzle, ilerde →
 * Hatırlat / Hatırlatmayı Kaldır, bitmiş ve tekrar izlenebilir → İzle · ilk satırda ↑ gün seçici · ilk yayında ←
 * yan menü. Açılışta profilin son kanalında "şimdi" odaklanır.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { devbus } from '../../lib/devbus'
import { logEvent } from '../../telemetry/logger'
import { FocusScope, useFocusable, useFocusEngine, useKeyInterceptor, type Direction } from '../focus'
import { watchPath } from '../shell/routes'
import {
  formatClock,
  formatRemaining,
  formatTimeRange,
  openRail,
  TvButton,
  TvDialog,
  TvIcon,
  TvLiveTag,
  TvScreen,
  TvSkeletonText,
} from '../ui'
import {
  lastTunedChannel,
  serverNow,
  takeGuideChannel,
  useServerNow,
  useTvGuide,
  useTvLive,
  type TvAiring,
  type TvChannel,
} from './data'
import {
  anchorFor,
  blockAt,
  firstRowFor,
  guideWindow,
  horizontalStep,
  placeRow,
  REM_PER_SLOT,
  scrollXFor,
  slotTicks,
  timeToRem,
  verticalStep,
  windowRem,
  type GuideDay,
  type GuideWindow,
  type PlacedBlock,
} from './guideModel'
import './live.css'

const SCREEN = 'rehber'
const DAY_SCOPE = 'rehber-gun'
const GRID_SCOPE = 'rehber-izgara'
/** Satır yüksekliği + aralık (rem) */
const ROW_REM = 6.4
const PAGE_ROWS = 5

const blockFocusId = (airingId: string): string => `${SCREEN}:blok:${airingId}`
const dayFocusId = (d: GuideDay): string => `${SCREEN}:gun:${d}`

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

type GuideAiring = TvAiring & { id: string }
type Block = PlacedBlock<GuideAiring>

interface Row {
  channel: TvChannel
  blocks: Block[]
}

interface Focus {
  row: number
  airingId: string
  /** odak anı (epoch ms) — ↑/↓ bu ana denk gelen yayını seçer */
  anchor: number
}

type TimeState = 'past' | 'live' | 'future'
const timeStateOf = (a: Pick<TvAiring, 'startAt' | 'endAt'>, now: number): TimeState =>
  now < Date.parse(a.startAt) ? 'future' : now < Date.parse(a.endAt) ? 'live' : 'past'

const catchupOpen = (a: TvAiring, now: number): boolean =>
  !!a.catchup.until && now >= Date.parse(a.endAt) && now <= Date.parse(a.catchup.until)

const DAY_LABEL: Record<GuideDay, string> = { 0: 'Bugün', 1: 'Yarın' }

/** 1 rem kaç piksel (TV kabuğu html yazı boyunu ekran genişliğine bağlar). */
function remPx(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(v) && v > 0 ? v : 16
}

/* ───────────── Bloklar ───────────── */

function GuideBlock({
  block,
  now,
  reminder,
  focusedHere,
  autoFocus,
  scrollX,
  onArrow,
  onFocus,
  onOpen,
}: {
  block: Block
  now: number
  reminder: boolean
  focusedHere: boolean
  autoFocus: boolean
  /** ızgaranın yatay kayması (rem): görünür alanın solundan başlayan bloğun başlığı görünür kenarda kalır */
  scrollX: number
  onArrow: (dir: Direction) => boolean
  onFocus: () => void
  onOpen: () => void
}): ReactElement {
  const a = block.item
  const { ref, focused } = useFocusable<HTMLDivElement>({
    id: blockFocusId(a.airingId),
    onArrow,
    onFocus,
    onEnter: onOpen,
    autoFocus,
  })
  const state = timeStateOf(a, now)
  const stick = Math.max(0, Math.min(scrollX - block.left, block.width - 7))
  const roomy = block.width - stick >= 7
  return (
    <div
      ref={ref}
      role="gridcell"
      aria-label={`${a.title}, ${formatTimeRange(a.startAt, a.endAt)}${state === 'live' ? ', şimdi yayında' : ''}${reminder ? ', hatırlatma kurulu' : ''}`}
      aria-selected={focused || focusedHere}
      className={cx(
        'tvg-block',
        `tvg-block--${state}`,
        reminder && 'has-reminder',
        focused && 'is-focused',
        block.clippedStart && 'is-clipped-start',
      )}
      style={{ left: `${block.left}rem`, width: `${block.width}rem` }}
    >
      <span className="tvg-block__inner" style={stick > 0 ? { paddingLeft: `${0.9 + stick}rem` } : undefined}>
        <span className="tvg-block__title">{a.title}</span>
        {roomy && (
          <span className="tvg-block__time">
            {formatTimeRange(a.startAt, a.endAt)}
            {reminder && <TvIcon name="check" size={1} className="tvg-block__bell" />}
          </span>
        )}
      </span>
    </div>
  )
}

function DayChip({
  day,
  active,
  onSelect,
  onDown,
}: {
  day: GuideDay
  active: boolean
  onSelect: () => void
  onDown: () => boolean
}): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({
    id: dayFocusId(day),
    onEnter: onSelect,
    onArrow: (dir) => (dir === 'down' ? onDown() : false),
  })
  return (
    <div
      ref={ref}
      role="tab"
      aria-selected={active}
      className={cx('tvl-chip', active && 'is-active', focused && 'is-focused')}
    >
      {DAY_LABEL[day]}
    </div>
  )
}

/* ───────────── Ayrıntı şeridi ───────────── */

function DetailStrip({
  airing,
  channel,
  now,
  reminder,
}: {
  airing: GuideAiring | null
  channel: TvChannel | null
  now: number
  reminder: boolean
}): ReactElement {
  if (!airing || !channel)
    return (
      <div className="tvg-strip">
        <div className="tvg-strip__art tv-skel" />
        <TvSkeletonText lines={3} width={50} />
      </div>
    )
  const state = timeStateOf(airing, now)
  const when =
    state === 'live'
      ? `${formatTimeRange(airing.startAt, airing.endAt)} · ${formatRemaining((Date.parse(airing.endAt) - now) / 1000)}`
      : `${dayWord(Date.parse(airing.startAt), now)} ${formatTimeRange(airing.startAt, airing.endAt)}`
  return (
    <div className="tvg-strip" aria-live="polite">
      <div className="tvg-strip__art">
        {airing.art?.url ? (
          <img key={airing.art.url} src={airing.art.url} alt="" decoding="async" />
        ) : (
          <img className="tvg-strip__logo" src={channel.logo.url} alt="" />
        )}
      </div>
      <div className="tvg-strip__text">
        <p className="tvg-strip__channel">
          {channel.number} · {channel.name}
          {state === 'live' && <TvLiveTag />}
          {reminder && (
            <span className="tvg-strip__reminder">
              <TvIcon name="check" size={1.1} /> Hatırlatma kurulu
            </span>
          )}
        </p>
        <h2 className="tvg-strip__title">{airing.title}</h2>
        <p className="tvg-strip__time">{when}</p>
        <p className="tvg-strip__synopsis">{airing.synopsis ?? ''}</p>
        {channel.isSampleSchedule && <p className="tvl-sample">Örnek yayın akışı</p>}
      </div>
    </div>
  )
}

/** "Bugün" · "Yarın" · "Dün" (İstanbul günü). */
function dayWord(t: number, now: number): string {
  const key = (x: number): string => new Date(x).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })
  if (key(t) === key(now)) return 'Bugün'
  if (key(t) === key(now + 86_400_000)) return 'Yarın'
  if (key(t) === key(now - 86_400_000)) return 'Dün'
  return new Date(t).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long' })
}

/* ───────────── Pencere ───────────── */

interface DialogTarget {
  airing: GuideAiring
  channel: TvChannel
}

function AiringDialog({
  target,
  now,
  reminder,
  onClose,
  onWatch,
  onReminder,
}: {
  target: DialogTarget
  now: number
  reminder: boolean
  onClose: () => void
  onWatch: (startOver: boolean) => void
  onReminder: (on: boolean) => void
}): ReactElement {
  const { airing, channel } = target
  const state = timeStateOf(airing, now)
  const locked = airing.access.state !== 'PLAYABLE' && airing.access.state !== 'OUT_OF_WINDOW'
  const lockText =
    airing.access.reasonText ??
    (airing.access.requiredProductName ? `${airing.access.requiredProductName} paketiyle` : 'Paketinde yok')
  const id = 'rehber-pencere'
  let actions: ReactElement
  let message: string = airing.synopsis ?? ''
  if (state === 'live' && !locked) {
    actions = (
      <>
        <TvButton id={`${id}:izle`} label="Canlı İzle" icon="play" onPress={() => onWatch(false)} />
        {airing.startOver && (
          <TvButton id={`${id}:bastan`} label="Baştan Başlat" icon="restart" onPress={() => onWatch(true)} />
        )}
        <TvButton id={`${id}:vazgec`} label="Vazgeç" onPress={onClose} />
      </>
    )
  } else if (state === 'future') {
    actions = (
      <>
        <TvButton
          id={`${id}:hatirlat`}
          label={reminder ? 'Hatırlatmayı Kaldır' : 'Hatırlat'}
          icon={reminder ? 'close' : 'check'}
          onPress={() => onReminder(!reminder)}
        />
        <TvButton id={`${id}:vazgec`} label="Vazgeç" onPress={onClose} />
      </>
    )
  } else if (state === 'past' && catchupOpen(airing, now) && !locked) {
    actions = (
      <>
        <TvButton id={`${id}:izle`} label="İzle" icon="play" onPress={() => onWatch(false)} />
        <TvButton id={`${id}:vazgec`} label="Vazgeç" onPress={onClose} />
      </>
    )
  } else {
    message = locked ? lockText : 'Bu yayın tekrar izlenemiyor.'
    actions = <TvButton id={`${id}:tamam`} label="Tamam" onPress={onClose} />
  }
  const timeLine =
    state === 'live'
      ? `Şimdi · ${formatTimeRange(airing.startAt, airing.endAt)}`
      : `${dayWord(Date.parse(airing.startAt), now)} ${formatTimeRange(airing.startAt, airing.endAt)}`
  return (
    <TvDialog
      id={id}
      title={airing.title}
      onClose={onClose}
      className="tvg-dialog"
      message={
        <>
          <span className="tvg-dialog__meta">
            {channel.number} · {channel.name} · {timeLine}
          </span>
          {message && <span className="tvg-dialog__text">{message}</span>}
          {state === 'future' && reminder && (
            <span className="tvg-dialog__meta">Yayın başlayınca haber vereceğiz.</span>
          )}
          {channel.isSampleSchedule && <span className="tvl-sample">Örnek yayın akışı</span>}
        </>
      }
    >
      <div className="tv-dialog__actions">{actions}</div>
    </TvDialog>
  )
}

/* ───────────── Ekran ───────────── */

export function TvGuide(): ReactElement {
  const navigate = useNavigate()
  const engine = useFocusEngine()
  const live = useTvLive()
  const now = useServerNow(30_000)
  const [day, setDay] = useState<GuideDay>(0)
  // Pencere günün başında bir kez hesaplanır (değişkenler — önbellek anahtarı — sabit kalsın).
  const [windows] = useState<Record<GuideDay, GuideWindow>>(() => ({
    0: guideWindow(0, serverNow()),
    1: guideWindow(1, serverNow()),
  }))
  const win = windows[day]
  const guide = useTvGuide(win)
  const [requested] = useState(() => takeGuideChannel())

  const rows: Row[] = useMemo(
    () =>
      guide.channels.map((channel) => ({
        channel,
        blocks: placeRow(
          (channel.airings ?? []).map((a) => ({ ...a, id: a.airingId })),
          win,
        ),
      })),
    [guide.channels, win],
  )
  const total = windowRem(win)
  const ticks = useMemo(() => slotTicks(win), [win])

  /* Görünüm ölçüsü (rem) */
  const viewRef = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState({ w: 80, rows: 6 })
  useLayoutEffect(() => {
    const el = viewRef.current
    if (!el) return
    const measure = (): void => {
      const px = remPx()
      const r = el.getBoundingClientRect()
      setView({ w: r.width / px, rows: Math.max(1, Math.floor(r.height / px / ROW_REM)) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows.length > 0])

  /* Odak ve kaydırma */
  const [focus, setFocus] = useState<Focus | null>(null)
  const focusRef = useRef<Focus | null>(null)
  focusRef.current = focus
  const [scroll, setScroll] = useState({ x: 0, first: 0 })
  const [pending, setPending] = useState<{ channelId: number | null; anchor: number } | null>(() => ({
    channelId: requested ?? lastTunedChannel(),
    anchor: serverNow(),
  }))

  // Profilin son kanalı (LIVE_HERO) gelince, istek yoksa onu kullan.
  useEffect(() => {
    if (pending && pending.channelId === null && live.heroId !== null)
      setPending({ channelId: live.heroId, anchor: pending.anchor })
  }, [live.heroId, pending])

  const blockOf = (f: Focus | null): Block | null =>
    f ? (rows[f.row]?.blocks.find((b) => b.id === f.airingId) ?? null) : null

  /** Odağı (row, index) bloğuna taşır, kaydırmayı ayarlar. */
  const place = useCallback(
    (row: number, index: number, anchor: number, reason: 'user' | 'auto' = 'user'): boolean => {
      const b = rows[row]?.blocks[index]
      if (!b) return false
      const next: Focus = { row, airingId: b.id, anchor }
      focusRef.current = next
      setFocus(next)
      setScroll((s) => ({
        x: scrollXFor(s.x, view.w, b, total, timeToRem(anchor, win)),
        first: firstRowFor(s.first, view.rows, row, rows.length),
      }))
      return engine.focus(blockFocusId(b.id), reason)
    },
    [rows, view, total, win, engine],
  )

  // Açılış / gün değişimi: istenen kanalda istenen ana denk gelen yayın.
  useLayoutEffect(() => {
    if (!pending || !rows.length) return
    if (pending.channelId === null && live.heroId === null && live.loading) return
    let r = rows.findIndex((x) => x.channel.channelId === pending.channelId)
    if (r < 0) r = rows.findIndex((x) => x.blocks.length > 0)
    if (r < 0) return
    let i = blockAt(rows[r]!.blocks, pending.anchor)
    if (i === null) {
      const v = verticalStep(
        rows.map((x) => x.blocks),
        r,
        pending.anchor,
        1,
      )
      if (!v) return
      r = v.row
      i = v.index
    }
    const b = rows[r]!.blocks[i]!
    // İlk kaydırma: şimdi (ya da odak anı) görünür olsun, solunda yarım saat geçmiş kalsın.
    const anchorRem = timeToRem(Math.max(pending.anchor, b.start), win)
    setScroll({
      x: Math.min(Math.max(0, total - view.w), Math.max(0, anchorRem - REM_PER_SLOT)),
      first: firstRowFor(0, view.rows, r, rows.length),
    })
    const next: Focus = { row: r, airingId: b.id, anchor: pending.anchor }
    focusRef.current = next
    setFocus(next)
    engine.focus(blockFocusId(b.id), 'auto')
    setPending(null)
  }, [pending, rows, live.heroId, live.loading, win, total, view, engine])

  const switchDay = useCallback(
    (d: GuideDay, anchor?: number) => {
      const cur = focusRef.current
      const channelId = cur ? (rows[cur.row]?.channel.channelId ?? null) : null
      devbus.emit('cache', 'Rehber (TV): gün', { day: DAY_LABEL[d], channelId })
      if (d === day) {
        if (anchor !== undefined) setPending({ channelId, anchor })
        return
      }
      setDay(d)
      setPending({ channelId, anchor: anchor ?? (d === 0 ? serverNow() : windows[1].from) })
    },
    [day, rows, windows],
  )

  /** Bloğun yön tuşu: true → işlendi. */
  const arrow = useCallback(
    (dir: Direction): boolean => {
      const f = focusRef.current
      if (!f) return false
      const row = rows[f.row]
      const index = row ? row.blocks.findIndex((b) => b.id === f.airingId) : -1
      if (!row || index < 0) return false
      if (dir === 'left' || dir === 'right') {
        const step = dir === 'left' ? -1 : 1
        const i = horizontalStep(row.blocks, index, step)
        if (i === null) {
          if (dir === 'right' && day === 0) switchDay(1, windows[1].from)
          else if (dir === 'left' && day === 1) switchDay(0, windows[0].to - 60_000)
          else if (dir === 'left') return openRail(engine, 'canli')
          return true
        }
        const b = row.blocks[i]!
        const viewFrom = win.from + (scroll.x / REM_PER_SLOT) * 30 * 60_000
        return place(f.row, i, anchorFor(b, viewFrom))
      }
      const v = verticalStep(
        rows.map((x) => x.blocks),
        f.row,
        f.anchor,
        dir === 'up' ? -1 : 1,
      )
      if (!v) {
        if (dir === 'up') return engine.focus(dayFocusId(day))
        return true
      }
      return place(v.row, v.index, f.anchor)
    },
    [rows, day, switchDay, windows, engine, place, win, scroll.x],
  )

  // Kanal +/−: beş kanal; ⏩/⏪: gün.
  useKeyInterceptor(
    (key) => {
      if (key === 'FORWARD' || key === 'REWIND') {
        switchDay(key === 'FORWARD' ? 1 : 0)
        return true
      }
      if (key !== 'CHANNEL_UP' && key !== 'CHANNEL_DOWN') return false
      const f = focusRef.current
      if (!f) return true
      const target = Math.min(rows.length - 1, Math.max(0, f.row + (key === 'CHANNEL_UP' ? -PAGE_ROWS : PAGE_ROWS)))
      const i = blockAt(rows[target]?.blocks ?? [], f.anchor)
      if (i !== null) place(target, i, f.anchor)
      return true
    },
    10,
    rows.length > 0,
  )

  /* Pencere */
  const [dialog, setDialog] = useState<DialogTarget | null>(null)
  const watch = (t: DialogTarget, startOver: boolean): void => {
    setDialog(null)
    const past = timeStateOf(t.airing, serverNow()) === 'past'
    logEvent(
      'click',
      {
        surface: 'tv-rehber',
        action: past ? 'izle' : startOver ? 'bastan' : 'canli-izle',
        entityId: t.airing.unifiedEntityId,
      },
      live.tctxOf(t.channel.channelId),
    )
    navigate(
      past
        ? watchPath(`Airing:${t.airing.airingId}`)
        : watchPath(`Channel:${t.channel.channelId}`, { startOver, tctx: live.tctxOf(t.channel.channelId) }),
    )
  }

  const focusedBlock = blockOf(focus)
  const focusedChannel = focus ? (rows[focus.row]?.channel ?? null) : null
  const nowLeft = now >= win.from && now <= win.to ? timeToRem(now, win) : null
  const toGrid = (): boolean => {
    const f = focusRef.current
    if (f) {
      const i = rows[f.row]?.blocks.findIndex((b) => b.id === f.airingId) ?? -1
      if (i >= 0) return place(f.row, i, f.anchor)
    }
    return engine.focusScope(GRID_SCOPE)
  }
  const firstPx = scroll.first * ROW_REM

  return (
    <TvScreen
      id={SCREEN}
      title="Rehber"
      defaultFocus={focus ? blockFocusId(focus.airingId) : dayFocusId(0)}
      className="tvg"
    >
      <header className="tvl-head tvg-head">
        <h1 className="tvl-head__title">Rehber</h1>
        <FocusScope id={DAY_SCOPE} orientation="horizontal">
          <div className="tvl-chips" role="tablist" aria-label="Gün">
            {([0, 1] as const).map((d) => (
              <DayChip key={d} day={d} active={d === day} onSelect={() => switchDay(d)} onDown={toGrid} />
            ))}
          </div>
        </FocusScope>
        <p className="tvg-hint" aria-hidden="true">
          <TvIcon name="chevronUp" size={1.2} />
          <TvIcon name="chevronDown" size={1.2} /> Kanal
          <span className="tvg-hint__sep" />
          <TvIcon name="chevronLeft" size={1.2} />
          <TvIcon name="chevronRight" size={1.2} /> Saat
          <span className="tvg-hint__sep" />
          <span className="tvg-hint__key">OK</span> Ayrıntı
          <span className="tvg-hint__sep" />
          <span className="tvg-hint__key">Yukarı</span> Gün
        </p>
      </header>

      <DetailStrip
        airing={focusedBlock?.item ?? null}
        channel={focusedChannel}
        now={now}
        reminder={focusedBlock ? guide.hasReminder(focusedBlock.item) : false}
      />

      <div className="tvg-grid" role="grid" aria-label={`Yayın akışı, ${DAY_LABEL[day]}`}>
        <div className="tvg-corner">{DAY_LABEL[day]}</div>
        <div className="tvg-times" aria-hidden="true">
          <div className="tvg-times__track" style={{ transform: `translateX(${-scroll.x}rem)`, width: `${total}rem` }}>
            {ticks.map((t) => (
              <span key={t.t} className={cx('tvg-tick', t.major && 'is-major')} style={{ left: `${t.left}rem` }}>
                {/* "şimdi" etiketiyle çakışan saat yazısı gizlenir (çizgi kalır) */}
                {nowLeft !== null && Math.abs(t.left - nowLeft) < 3.2 ? '' : t.label}
              </span>
            ))}
            {nowLeft !== null && (
              <span className="tvg-now-head" style={{ left: `${nowLeft}rem` }}>
                {formatClock(now)}
              </span>
            )}
          </div>
        </div>
        <div className="tvg-channels">
          <div className="tvg-channels__track" style={{ transform: `translateY(${-firstPx}rem)` }}>
            {rows.map((r, i) => (
              <div
                key={r.channel.channelId}
                className={cx('tvg-ch', focus?.row === i && 'is-current')}
                style={{ top: `${i * ROW_REM}rem` }}
              >
                <span className="tvg-ch__num">{r.channel.number}</span>
                <span className="tvg-ch__logo">
                  <img src={r.channel.logo.url} alt="" />
                </span>
                <span className="tvg-ch__name">{r.channel.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="tvg-view" ref={viewRef}>
          {guide.error && !rows.length ? (
            <div className="tvl-empty">
              <p>Rehber yüklenemedi.</p>
              <TvButton id={`${SCREEN}:tekrar`} label="Tekrar dene" onPress={guide.refetch} />
            </div>
          ) : !rows.length ? (
            <div className="tvl-skeleton" role="status" aria-label="Yükleniyor">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="tv-skel tvg-skel-row" />
              ))}
            </div>
          ) : (
            <FocusScope id={GRID_SCOPE}>
              <div
                className="tvg-canvas"
                data-focus-track=""
                data-track-x={`${-scroll.x}rem`}
                data-track-y={`${-firstPx}rem`}
                style={{
                  width: `${total}rem`,
                  height: `${rows.length * ROW_REM}rem`,
                  transform: `translate(${-scroll.x}rem, ${-firstPx}rem)`,
                }}
              >
                {ticks.map((t) => (
                  <span key={t.t} className={cx('tvg-col', t.major && 'is-major')} style={{ left: `${t.left}rem` }} />
                ))}
                {rows.map((r, i) => (
                  <div
                    key={r.channel.channelId}
                    className="tvg-row"
                    role="row"
                    aria-label={`${r.channel.number} ${r.channel.name}`}
                    style={{ top: `${i * ROW_REM}rem` }}
                  >
                    {r.blocks.length === 0 && <span className="tvg-row__empty">Yayın bilgisi yok</span>}
                    {r.blocks.map((b) => (
                      <GuideBlock
                        key={b.id}
                        block={b}
                        now={now}
                        reminder={guide.hasReminder(b.item)}
                        focusedHere={focus?.airingId === b.id}
                        autoFocus={false}
                        scrollX={scroll.x}
                        onArrow={arrow}
                        onFocus={() => {
                          const f = focusRef.current
                          if (f?.airingId === b.id) return
                          // Motor odağı başka yoldan getirdiyse (pencere kapanışı, hafıza) durumu eşitle.
                          const keep = f && f.anchor >= b.start && f.anchor < b.end
                          const next: Focus = { row: i, airingId: b.id, anchor: keep ? f.anchor : b.start }
                          focusRef.current = next
                          setFocus(next)
                          setScroll((s) => ({
                            x: scrollXFor(s.x, view.w, b, total),
                            first: firstRowFor(s.first, view.rows, i, rows.length),
                          }))
                        }}
                        onOpen={() => setDialog({ airing: b.item, channel: r.channel })}
                      />
                    ))}
                  </div>
                ))}
                {nowLeft !== null && <span className="tvg-now" style={{ left: `${nowLeft}rem` }} />}
              </div>
            </FocusScope>
          )}
        </div>
      </div>

      {dialog && (
        <AiringDialog
          target={dialog}
          now={now}
          reminder={guide.hasReminder(dialog.airing)}
          onClose={() => setDialog(null)}
          onWatch={(startOver) => watch(dialog, startOver)}
          onReminder={(on) => {
            guide.setReminder(dialog.airing, dialog.channel, on)
            setDialog(null)
          }}
        />
      )}
    </TvScreen>
  )
}
