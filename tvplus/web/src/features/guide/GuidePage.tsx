/**
 * Rehber (#/rehber). Dışa aktarım adı SABİT. GraphQL `Guide` — kanallar + gün penceresindeki yayınlar
 * (gün penceresi Türkiye saatiyle 06:00 → ertesi gün 02:00; bkz. guideMath.ts).
 *
 * Masaüstü: zaman ızgarası — solda yapışkan kanal sütunu (numara, logo, ad), üstte yapışkan 30 dakikalık zaman
 * başlığı, süresiyle orantılı program blokları, kırmızı "şimdi" çizgisi; ızgara kendi kabında iki yönde kayar,
 * açılışta şimdiye kaydırılır. Klavye: ←/→ aynı kanalda, ↑/↓ komşu kanalda aynı ana denk gelen program,
 * Home/End, PageUp/PageDown; Enter pencereyi açar. Bloğa tıklayınca küçük pencere (Modal): yayındaysa Canlı İzle /
 * TV'de İzle, başlamamışsa Hatırlat / Hatırlatmayı Kaldır, geçmişse yalnız sunucu izin verirse izle.
 * Mobil: üstte gün sekmeleri, yatay kanal seçici (logolar), seçili kanalın akışı dikey liste (yayındaki vurgulu),
 * aynı eylemler alt sayfada. `?kanal=<id>` seçili kanalla açar.
 * Örnek yayın akışı her yerde işaretlidir.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useGql } from '../../api/hooks'
import { useDocumentTitle, useShellOptions } from '../../app'
import { useFormFactor } from '../../lib/formFactor'
import { logEvent } from '../../telemetry/logger'
import {
  Button,
  cx,
  ErrorState,
  formatClock,
  formatLiveLine,
  formatTimeRange,
  Icon,
  LiveTag,
  liveProgress,
  ProgressBar,
  Skeleton,
  Tabs,
  useNow,
} from '../../ui'
import { useReminderResolver } from '../live/actions'
import { catchupOpen, packageLock, timeStateOf } from '../live/airing'
import { ChannelLogo, SampleNote } from '../live/parts'
import { AiringSheet, type AiringSheetTarget } from '../live/shared'
import type { AiringBriefData, ChannelData } from '../live/types'
import {
  dayLabel,
  dayWindow,
  GRID_KEYS,
  groupForList,
  initialScrollLeft,
  layoutBlocks,
  moveInGrid,
  nowPx,
  ticks,
  windowHasAirings,
  windowWidth,
  type BlockLayout,
  type DayOffset,
  type GridKey,
  type GridPos,
  type GuideWindow,
} from './guideMath'
import '../live/shared.css'
import './guide.css'

type GuideAiring = AiringBriefData & { synopsis: string; video: { videoId: number } | null }
type GuideChannel = ChannelData & { airings: GuideAiring[] }
interface GuideData {
  channels: GuideChannel[]
}

const DAYS: readonly DayOffset[] = [0, 1, 2]
/** Kanal sütunu genişliği ve satır yüksekliği (guide.css ile aynı) */
const COL_W = 232
const HEAD_H = 44

const channelRef = (c: GuideChannel) => ({
  channelId: c.channelId,
  name: c.name,
  number: c.number,
  logo: c.logo,
  isSampleSchedule: c.isSampleSchedule,
  sourceKind: c.sourceKind,
})

/** Gün penceresinin değişkenleri (pencere açılış anına sabitlenir: önbellek anahtarı her tikte değişmesin). */
function varsFor(day: DayOffset, base: number) {
  const w = dayWindow(day, base)
  return { from: new Date(w.from).toISOString(), to: new Date(w.to).toISOString() }
}

/* ───────────── Masaüstü ızgarası ───────────── */

function GuideGrid({
  channels,
  win,
  focusChannel,
  onOpen,
  scrollToNowSignal,
}: {
  channels: GuideChannel[]
  win: GuideWindow
  focusChannel: number | null
  onOpen: (c: GuideChannel, a: GuideAiring) => void
  scrollToNowSignal: number
}): ReactElement {
  const now = useNow()
  const reminderOf = useReminderResolver()
  const scrollRef = useRef<HTMLDivElement>(null)
  const width = windowWidth(win)
  const marks = useMemo(() => ticks(win), [win])
  const linePx = nowPx(now, win)
  const layout = useMemo(() => channels.map((c) => layoutBlocks(c.airings, win)), [channels, win])
  const spans = useMemo(() => layout.map((row) => row.map((b) => b.item)), [layout])
  const [focus, setFocus] = useState<GridPos | null>(null)
  const pendingFocus = useRef(false)

  // Sekme sırasındaki tek blok: odak yoksa ilk kanalın (ya da ?kanal=) yayındaki / ilk bloğu.
  const rovingPos = useMemo<GridPos | null>(() => {
    if (focus && layout[focus.row]?.[focus.index]) return focus
    const startRow = Math.max(
      0,
      layout.findIndex((r, i) => r.length > 0 && (focusChannel === null || channels[i]?.channelId === focusChannel)),
    )
    const row = layout[startRow] ?? []
    if (!row.length) return null
    const t = Date.now()
    const live = row.findIndex((b) => Date.parse(b.item.startAt) <= t && t < Date.parse(b.item.endAt))
    return { row: startRow, index: live >= 0 ? live : 0 }
  }, [focus, layout, focusChannel, channels])

  const scrollToNow = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = initialScrollLeft(Date.now(), win)
  }, [win])

  // Açılışta (ve gün değişince) şimdiye kaydır; ?kanal= varsa o kanalın satırına in.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = initialScrollLeft(Date.now(), win)
    if (focusChannel !== null) {
      const i = channels.findIndex((c) => c.channelId === focusChannel)
      if (i >= 0) el.scrollTop = Math.max(0, i * rowHeight() - 2 * rowHeight())
    } else el.scrollTop = 0
  }, [win.from, win.to]) // yalnız pencere değişince

  useEffect(() => {
    if (scrollToNowSignal) scrollToNow()
  }, [scrollToNowSignal, scrollToNow])

  // Yatay kaydırma CSS değişkenine yazılır: sola kayan programın adı kanal sütununun sağında okunur kalır.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let frame = 0
    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => el.style.setProperty('--sx', `${el.scrollLeft}px`))
    }
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', sync)
    }
  }, [])

  // Klavyeyle geçilen bloğa odak (çizildikten sonra).
  useEffect(() => {
    if (!pendingFocus.current || !focus) return
    pendingFocus.current = false
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-pos="${focus.row}:${focus.index}"]`)
    el?.focus({ preventScroll: true })
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [focus])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!GRID_KEYS.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return
    const pos = (e.target as HTMLElement).closest<HTMLElement>('[data-pos]')?.dataset.pos
    if (!pos) return
    const [r, i] = pos.split(':').map(Number)
    e.preventDefault()
    const next = moveInGrid(spans, { row: r ?? 0, index: i ?? 0 }, e.key as GridKey, win)
    pendingFocus.current = true
    setFocus(next)
  }

  return (
    <div
      className="gd-grid"
      ref={scrollRef}
      role="region"
      aria-label="Yayın akışı. Programlar arasında ok tuşlarıyla gezin."
      onKeyDown={onKeyDown}
    >
      <div className="gd-canvas" style={{ width: COL_W + width }}>
        <div className="gd-timehead" style={{ height: HEAD_H }}>
          <div className="gd-corner">
            <span>Kanal</span>
          </div>
          <div className="gd-ticks" style={{ width }} aria-hidden="true">
            {marks.map((t) => (
              <span key={t.t} className={cx('gd-tick', t.major && 'is-major')} style={{ left: t.px }}>
                {t.label}
              </span>
            ))}
            {linePx !== null && (
              <span className="gd-nowtag" style={{ left: linePx }}>
                {formatClock(now)}
              </span>
            )}
          </div>
        </div>
        {channels.map((c, ri) => (
          <div
            key={c.channelId}
            className={cx('gd-row', focusChannel === c.channelId && 'is-target')}
            role="group"
            aria-label={`${c.number} ${c.name}`}
          >
            <div className="gd-chcell">
              <span className="gd-chnum">{c.number}</span>
              <ChannelLogo url={c.logo.url} name={c.name} size={44} />
              <span className="gd-chtext">
                <span className="gd-chname">{c.name}</span>
                {c.isSampleSchedule && <span className="gd-chsample">Örnek akış</span>}
              </span>
            </div>
            <div className="gd-track" style={{ width }}>
              {layout[ri]!.map((b, bi) => (
                <GuideBlock
                  key={b.item.airingId}
                  block={b}
                  channel={c}
                  now={now}
                  reminder={reminderOf(b.item.airingId, b.item.hasReminder)}
                  pos={`${ri}:${bi}`}
                  tabbable={rovingPos?.row === ri && rovingPos.index === bi}
                  onFocus={() => setFocus({ row: ri, index: bi })}
                  onOpen={() => onOpen(c, b.item)}
                />
              ))}
              {layout[ri]!.length === 0 && <span className="gd-empty">Yayın bilgisi yok</span>}
            </div>
          </div>
        ))}
        {linePx !== null && (
          <span className="gd-now" style={{ left: COL_W + linePx, top: HEAD_H }} aria-hidden="true" />
        )}
      </div>
    </div>
  )
}

/** CSS'teki satır yüksekliği (değişkenden okunur; yoksa 76). */
function rowHeight(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gd-row-h'))
  return Number.isFinite(v) && v > 0 ? v : 76
}

function GuideBlock({
  block,
  channel,
  now,
  reminder,
  pos,
  tabbable,
  onFocus,
  onOpen,
}: {
  block: BlockLayout<GuideAiring>
  channel: GuideChannel
  now: number
  reminder: boolean
  pos: string
  tabbable: boolean
  onFocus: () => void
  onOpen: () => void
}): ReactElement {
  const a = block.item
  const state = timeStateOf(a.startAt, a.endAt, now)
  const lock = packageLock(a.access)
  const replay = state === 'ENDED' && catchupOpen(a, now)
  const narrow = block.width < 90
  const label = [
    `${channel.name}, ${a.title}, ${formatTimeRange(a.startAt, a.endAt)}`,
    state === 'LIVE' ? 'şu an yayında' : null,
    replay ? 'tekrar izlenebilir' : null,
    reminder ? 'hatırlatma kurulu' : null,
    lock,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <button
      type="button"
      className={cx(
        'gd-block',
        state === 'LIVE' && 'is-live',
        state === 'ENDED' && !replay && 'is-past',
        reminder && 'has-reminder',
        block.clippedStart && 'is-clipstart',
        narrow && 'is-narrow',
      )}
      style={{ left: block.left, width: block.width, ['--bl' as string]: `${block.left}px` }}
      data-pos={pos}
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      onFocus={onFocus}
      onClick={onOpen}
    >
      <span className="gd-block__inner">
        <span className="gd-block__title">
          {lock && <Icon name="lock" size={13} className="gd-block__icon" />}
          {reminder && <Icon name="bell" size={13} className="gd-block__icon gd-block__bell" />}
          <span className="gd-block__text">{a.title}</span>
        </span>
        {!narrow && <span className="gd-block__time">{formatTimeRange(a.startAt, a.endAt)}</span>}
      </span>
      {state === 'LIVE' && (
        <span className="gd-block__progress" style={{ width: `${liveProgress(a.startAt, a.endAt, now) * 100}%` }} />
      )}
    </button>
  )
}

function GridSkeleton(): ReactElement {
  return (
    <div className="gd-skel ui-gutter" role="status" aria-label="Yükleniyor">
      {Array.from({ length: 7 }, (_, i) => (
        <Skeleton key={i} className="gd-skel__row" />
      ))}
    </div>
  )
}

/* ───────────── Mobil ───────────── */

function GuideMobile({
  channels,
  day,
  dayTabs,
  selected,
  onSelect,
  onOpen,
}: {
  channels: GuideChannel[]
  day: DayOffset
  dayTabs: ReactElement
  selected: number | null
  onSelect: (id: number) => void
  onOpen: (c: GuideChannel, a: GuideAiring) => void
}): ReactElement {
  const now = useNow()
  const reminderOf = useReminderResolver()
  const listRef = useRef<HTMLOListElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef<HTMLDivElement>(null)
  const channel = channels.find((c) => c.channelId === selected) ?? channels[0]
  const sorted = useMemo(
    () => [...(channel?.airings ?? [])].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
    [channel],
  )
  const liveId = groupForList(sorted, now).now?.airingId ?? null

  // Kanal ya da gün değişince yayındaki programa (yoksa başa) kaydır; seçili logo görünür kalsın.
  // Bir kare sonra: kabuğun yol değişiminde yaptığı başa kaydırmadan sonra çalışsın.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const item = liveId ? listRef.current?.querySelector<HTMLElement>(`[data-airing="${CSS.escape(liveId)}"]`) : null
      if (item) {
        const sticky = stickyRef.current?.getBoundingClientRect().bottom ?? 0
        window.scrollTo({ top: Math.max(0, item.getBoundingClientRect().top + window.scrollY - sticky - 56) })
      } else window.scrollTo({ top: 0 })
      const picker = pickerRef.current
      const on = picker?.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (picker && on) picker.scrollLeft = on.offsetLeft - picker.clientWidth / 2 + on.offsetWidth / 2
    })
    return () => cancelAnimationFrame(frame)
  }, [channel?.channelId, day]) // yalnız seçim değişince

  if (!channel) return <p className="ui-body ui-gutter">Yayın bilgisi yok.</p>
  return (
    <div className="gd-m">
      <div className="gd-mtop" ref={stickyRef}>
        <div className="ui-gutter">{dayTabs}</div>
        <div className="gd-picker" ref={pickerRef} role="group" aria-label="Kanallar">
          {channels.map((c) => {
            const on = c.channelId === channel.channelId
            return (
              <button
                key={c.channelId}
                type="button"
                className={cx('gd-pick', on && 'is-on')}
                aria-pressed={on}
                aria-label={`${c.number} ${c.name}`}
                onClick={() => onSelect(c.channelId)}
              >
                <ChannelLogo url={c.logo.url} name={c.name} size={56} className="gd-pick__logo" />
                <span className="gd-pick__num" aria-hidden="true">
                  {c.number}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="gd-mhead ui-gutter">
        <h2 className="gd-mhead__name">{channel.name}</h2>
        <span className="gd-mhead__meta">
          Kanal {channel.number} · {channel.categoryName}
        </span>
        {channel.isSampleSchedule && <SampleNote />}
      </div>
      {sorted.length === 0 ? (
        <p className="ui-body ui-gutter">Bu gün için yayın bilgisi yok.</p>
      ) : (
        <ol className="gd-mlist" ref={listRef}>
          {sorted.map((a) => {
            const state = timeStateOf(a.startAt, a.endAt, now)
            const replay = state === 'ENDED' && catchupOpen(a, now)
            const reminder = reminderOf(a.airingId, a.hasReminder)
            const lock = packageLock(a.access)
            const live = state === 'LIVE'
            const meta = live ? formatLiveLine(a.startAt, a.endAt, now) : formatTimeRange(a.startAt, a.endAt)
            return (
              <li key={a.airingId} data-airing={a.airingId}>
                <button
                  type="button"
                  className={cx('gd-mitem', live && 'is-live', state === 'ENDED' && !replay && 'is-past')}
                  aria-label={[
                    a.title,
                    meta,
                    live ? 'şu an yayında' : null,
                    replay ? 'tekrar izlenebilir' : null,
                    reminder ? 'hatırlatma kurulu' : null,
                    lock,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  onClick={() => onOpen(channel, a)}
                >
                  <span className="gd-mitem__time">{formatClock(a.startAt)}</span>
                  <span className="gd-mitem__text">
                    <span className="gd-mitem__title">{a.title}</span>
                    <span className="gd-mitem__meta">
                      {meta}
                      {replay ? ' · Tekrar izle' : ''}
                    </span>
                    {live && (
                      <ProgressBar
                        value={liveProgress(a.startAt, a.endAt, now)}
                        label="Yayın ilerlemesi"
                        className="gd-mitem__progress"
                      />
                    )}
                  </span>
                  <span className="gd-mitem__end">
                    {live ? (
                      <LiveTag />
                    ) : lock ? (
                      <Icon name="lock" size={16} />
                    ) : reminder ? (
                      <Icon name="bell" size={18} className="gd-mitem__bell" />
                    ) : (
                      <Icon name="chevronRight" size={18} />
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

/* ───────────── Sayfa ───────────── */

export function GuidePage(): ReactElement {
  useDocumentTitle('Rehber')
  useShellOptions({ mobileTitle: 'Rehber' })
  const mobile = useFormFactor() === 'mobile'
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const kanal = Number(params.get('kanal'))
  const focusChannel = Number.isFinite(kanal) && kanal > 0 ? kanal : null
  const [day, setDay] = useState<DayOffset>(0)
  const [sheet, setSheet] = useState<AiringSheetTarget | null>(null)
  const [nowSignal, setNowSignal] = useState(0)
  // Pencereler açılış anına göre sabitlenir; gün dönünce yenilenir.
  const [base, setBase] = useState(() => Date.now())
  useEffect(() => {
    if (now > dayWindow(0, base).to) setBase(Date.now())
  }, [now, base])

  const v0 = useMemo(() => varsFor(0, base), [base])
  const v1 = useMemo(() => varsFor(1, base), [base])
  const v2 = useMemo(() => varsFor(2, base), [base])
  // Üç gün birlikte istenir: sekme değişimi beklemesiz; örnek akışın gittiği son gün sekmeyi belirler.
  const q0 = useGql<GuideData, typeof v0>('Guide', v0, { ttlMs: 120_000 })
  const q1 = useGql<GuideData, typeof v1>('Guide', v1, { ttlMs: 120_000 })
  const q2 = useGql<GuideData, typeof v2>('Guide', v2, { ttlMs: 120_000 })
  const queries = [q0, q1, q2] as const
  const q = queries[day as 0 | 1 | 2]
  const win = useMemo(() => dayWindow(day, base), [day, base])

  const available = DAYS.filter((d) => {
    if (d === 0) return true
    const data = queries[d as 0 | 1 | 2].data
    return !!data && windowHasAirings(data.channels, dayWindow(d, base))
  })
  const tabs = available.map((d) => ({ id: String(d), label: dayLabel(d, base) }))
  const channels = q.data?.channels ?? []
  const sample = channels.some((c) => c.isSampleSchedule)

  const open = (c: GuideChannel, a: GuideAiring) => {
    logEvent('click', { surface: 'rehber', action: 'yayin', entityId: a.unifiedEntityId, channelId: c.channelId }, null)
    setSheet({ airing: a, channel: channelRef(c), surface: 'rehber' })
  }
  const selectChannel = (id: number) => {
    const next = new URLSearchParams(params)
    next.set('kanal', String(id))
    setParams(next, { replace: true })
  }
  const chooseDay = (id: string) => {
    const d = Number(id) as DayOffset
    setDay(d)
    logEvent('click', { surface: 'rehber', action: 'gun', day: d }, null)
  }

  const dayTabs = <Tabs items={tabs} value={String(day)} onChange={chooseDay} label="Gün" className="gd-days" />

  return (
    <div className={cx('gd-page', mobile ? 'gd-page--mobile' : 'gd-page--desktop')}>
      {mobile ? null : (
        <div className="gd-top ui-gutter">
          <div className="gd-titlebar">
            <h1 className="gd-title">Rehber</h1>
            <Link to="/canli" className="gd-backlink">
              <Icon name="live" size={18} />
              Canlı TV
            </Link>
          </div>
          <div className="gd-toolbar">
            {dayTabs}
            <span className="gd-toolbar__spacer" />
            {sample && (
              <span className="gd-samplenote">
                <SampleNote /> Program bilgisi örnek veridir
              </span>
            )}
            {day === 0 && (
              <Button size="sm" icon="clock" onClick={() => setNowSignal((n) => n + 1)}>
                Şimdi
              </Button>
            )}
          </div>
        </div>
      )}
      {!q.data && q.error ? (
        <ErrorState size="page" title="Rehber yüklenemedi" onRetry={q.refetch} />
      ) : !q.data ? (
        <GridSkeleton />
      ) : mobile ? (
        <GuideMobile
          channels={channels}
          day={day}
          dayTabs={dayTabs}
          selected={focusChannel}
          onSelect={selectChannel}
          onOpen={open}
        />
      ) : (
        <GuideGrid
          channels={channels}
          win={win}
          focusChannel={focusChannel}
          onOpen={open}
          scrollToNowSignal={nowSignal}
        />
      )}
      <AiringSheet target={sheet} onClose={() => setSheet(null)} />
    </div>
  )
}
