/**
 * Rehber (#/rehber): GraphQL `Guide` — kanallar + seçilen gün penceresindeki yayınlar.
 * Web (≥ 900 px): zaman ızgarası — yapışkan kanal sütunu, 30 dk çentikli yatay zaman çizelgesi, süresiyle orantılı
 * program blokları, zamanla kayan kırmızı "şimdi" çizgisi; açılışta şimdiye kaydırılır.
 * Mobil: ızgara yok — üstte kanal seçici, altta seçili kanalın listesi ("Şimdi", "Sıradaki", …).
 * Bloğa / satıra dokununca yayın alt sayfası açılır (durumuna göre tek birincil eylem).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useGql } from '../../api/hooks'
import { useDocumentTitle } from '../../app'
import {
  Chip,
  ChannelTile,
  ErrorState,
  formatClock,
  formatLiveLine,
  formatTimeRange,
  HScroll,
  Icon,
  LiveTag,
  Page,
  ProgressBar,
  Skeleton,
  SkeletonRow,
  liveProgress,
  useNow,
  cx,
} from '../../design'
import { logEvent } from '../../telemetry/logger'
import { catchupOpen, packageLock, timeStateOf } from '../live/airing'
import { AiringSheet, useWide, type AiringSheetTarget } from '../live/shared'
import type { AiringBriefData, ChannelData } from '../live/types'
import { dayWindow, groupForList, initialScrollLeft, layoutBlocks, nowPx, ticks, windowWidth, type DayOffset, type GuideWindow } from './guideMath'
import './guide.css'

type GuideAiring = AiringBriefData & { synopsis: string; video: { videoId: number } | null }
type GuideChannel = ChannelData & { airings: GuideAiring[] }
interface GuideData {
  channels: GuideChannel[]
}

const DAYS: { day: DayOffset; label: string }[] = [
  { day: -1, label: 'Dün' },
  { day: 0, label: 'Bugün' },
  { day: 1, label: 'Yarın' },
]

const channelRef = (c: GuideChannel) => ({ channelId: c.channelId, name: c.name, number: c.number, logo: c.logo, isSampleSchedule: c.isSampleSchedule, sourceKind: c.sourceKind })

/* ───────────── Web ızgarası ───────────── */

function GuideGrid({ channels, win, onOpen }: { channels: GuideChannel[]; win: GuideWindow; onOpen: (c: GuideChannel, a: GuideAiring) => void }): ReactElement {
  const now = useNow()
  const scrollRef = useRef<HTMLDivElement>(null)
  const width = windowWidth(win)
  const marks = useMemo(() => ticks(win), [win])
  const linePx = nowPx(now, win)

  // Açılışta (ve gün değişince) şimdiye kaydır.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = initialScrollLeft(Date.now(), win)
  }, [win.from, win.to])

  return (
    <div className="gd-grid" ref={scrollRef} role="region" aria-label="Yayın akışı ızgarası" tabIndex={0}>
      <div className="gd-canvas" style={{ width: `calc(var(--gd-col) + ${width}px)` }}>
        <div className="gd-head">
          <div className="gd-corner">
            <span className="cn-meta">Kanal</span>
          </div>
          <div className="gd-ticks" style={{ width }} aria-hidden="true">
            {marks.map((t) => (
              <span key={t.t} className={cx('gd-tick', t.major && 'gd-tick--major')} style={{ left: t.px }}>
                {t.label}
              </span>
            ))}
          </div>
        </div>
        {channels.map((c) => (
          <div key={c.channelId} className="gd-row">
            <div className="gd-chcell">
              <span className="gd-chnum">{c.number}</span>
              <ChannelTile name={c.name} logoUrl={c.logo.url} />
              <span className="gd-chtext">
                <span className="cn-card-title">{c.name}</span>
                {c.isSampleSchedule && <span className="cn-meta">Örnek yayın akışı</span>}
              </span>
            </div>
            <div className="gd-track" style={{ width }}>
              {layoutBlocks(c.airings, win).map((b) => {
                const a = b.item
                const state = timeStateOf(a.startAt, a.endAt, now)
                const lock = packageLock(a.access)
                const replay = state === 'ENDED' && catchupOpen(a, now)
                const label = `${c.name}, ${a.title}, ${formatTimeRange(a.startAt, a.endAt)}${state === 'LIVE' ? ', şu an canlı' : replay ? ', tekrar izlenebilir' : ''}`
                return (
                  <button
                    key={a.airingId}
                    type="button"
                    className={cx(
                      'gd-block',
                      state === 'LIVE' && 'gd-block--live',
                      state === 'ENDED' && 'gd-block--ended',
                      b.clippedStart && 'gd-block--clipstart',
                      b.clippedEnd && 'gd-block--clipend',
                    )}
                    style={{ left: b.left + 2, width: Math.max(0, b.width - 4) }}
                    aria-label={label}
                    onClick={() => onOpen(c, a)}
                  >
                    <span className="gd-block__inner">
                      <span className="gd-block__title">
                        {lock && <Icon name="lock" size={14} />}
                        {a.title}
                      </span>
                      <span className="gd-block__meta">{formatClock(a.startAt)}</span>
                    </span>
                    {state === 'LIVE' && <ProgressBar value={liveProgress(a.startAt, a.endAt, now)} label="Yayın ilerlemesi" className="gd-block__progress" />}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {linePx !== null && <span className="gd-now" style={{ left: `calc(var(--gd-col) + ${linePx}px)` }} aria-hidden="true" />}
      </div>
    </div>
  )
}

/* ───────────── Mobil liste ───────────── */

function ListRow({ channel, airing, onOpen }: { channel: GuideChannel; airing: GuideAiring; onOpen: () => void }): ReactElement {
  const now = useNow()
  const state = timeStateOf(airing.startAt, airing.endAt, now)
  const replay = state === 'ENDED' && catchupOpen(airing, now)
  const lock = packageLock(airing.access)
  const meta = state === 'LIVE' ? formatLiveLine(airing.startAt, airing.endAt, now) : replay ? `${formatTimeRange(airing.startAt, airing.endAt)} · Tekrar izle` : formatTimeRange(airing.startAt, airing.endAt)
  return (
    <li>
      <button type="button" className={cx('gd-item', state === 'ENDED' && !replay && 'gd-item--ended')} onClick={onOpen} aria-label={`${channel.name}, ${airing.title}, ${meta}`}>
        <span className="gd-item__time">{formatClock(airing.startAt)}</span>
        <span className="gd-item__text">
          <span className="cn-card-title">{airing.title}</span>
          <span className="cn-meta">{meta}</span>
          {state === 'LIVE' && <ProgressBar value={liveProgress(airing.startAt, airing.endAt, now)} label="Yayın ilerlemesi" className="gd-item__progress" />}
        </span>
        {state === 'LIVE' ? <LiveTag /> : lock ? <Icon name="lock" size={16} /> : <Icon name="chevronRight" size={20} />}
      </button>
    </li>
  )
}

function ListGroup({ title, channel, items, onOpen }: { title: string; channel: GuideChannel; items: GuideAiring[]; onOpen: (a: GuideAiring) => void }): ReactElement | null {
  if (!items.length) return null
  return (
    <section className="gd-group" aria-label={title}>
      <h3 className="gd-group__title">{title}</h3>
      <ul className="gd-list">
        {items.map((a) => (
          <ListRow key={a.airingId} channel={channel} airing={a} onOpen={() => onOpen(a)} />
        ))}
      </ul>
    </section>
  )
}

function GuideList({ channels, day, onOpen }: { channels: GuideChannel[]; day: DayOffset; onOpen: (c: GuideChannel, a: GuideAiring) => void }): ReactElement {
  const now = useNow()
  const [selected, setSelected] = useState<number | null>(null)
  const channel = channels.find((c) => c.channelId === selected) ?? channels[0]
  if (!channel) return <p className="cn-body cn-gutter-x">Bu kategoride kanal yok.</p>
  const g = groupForList(channel.airings, now)
  const open = (a: GuideAiring) => onOpen(channel, a)
  const sorted = [...channel.airings].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
  return (
    <div className="gd-mobile">
      <HScroll label="Kanallar" scrollKey="rehber:kanallar" className="gd-picker">
        {channels.map((c) => {
          const on = c.channelId === channel.channelId
          return (
            <button key={c.channelId} type="button" className={cx('gd-pick', on && 'gd-pick--on')} aria-pressed={on} onClick={() => setSelected(c.channelId)}>
              <ChannelTile name={c.name} logoUrl={c.logo.url} selected={on} />
              <span className="gd-pick__name">{c.name}</span>
            </button>
          )
        })}
      </HScroll>
      <div className="gd-chhead cn-gutter-x">
        <h2 className="cn-row-title">{channel.name}</h2>
        <span className="cn-meta">
          Kanal {channel.number} · {channel.categoryName}
          {channel.isSampleSchedule ? ' · Örnek yayın akışı' : ''}
        </span>
      </div>
      <div className="cn-gutter-x gd-groups">
        {day === 0 ? (
          <>
            <ListGroup title="Şimdi" channel={channel} items={g.now ? [g.now] : []} onOpen={open} />
            <ListGroup title="Sıradaki" channel={channel} items={g.next ? [g.next] : []} onOpen={open} />
            <ListGroup title="Daha sonra" channel={channel} items={g.later} onOpen={open} />
            <ListGroup title="Daha önce" channel={channel} items={g.earlier} onOpen={open} />
          </>
        ) : (
          <ListGroup title={day < 0 ? 'Dünün yayın akışı' : 'Yarının yayın akışı'} channel={channel} items={sorted} onOpen={open} />
        )}
        {channel.airings.length === 0 && <p className="cn-body">Bu gün için yayın bilgisi yok.</p>}
      </div>
    </div>
  )
}

/* ───────────── Sayfa ───────────── */

function GuideSkeleton({ wide }: { wide: boolean }): ReactElement {
  if (!wide) return <SkeletonRow variant="tile" count={6} />
  return (
    <div className="cn-gutter-x gd-skel" role="status" aria-label="Yükleniyor">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} variant="text" width="100%" className="gd-skel__row" />
      ))}
    </div>
  )
}

export function GuidePage(): ReactElement {
  useDocumentTitle('Rehber')
  const wide = useWide()
  const now = useNow()
  const [day, setDay] = useState<DayOffset>(0)
  const [category, setCategory] = useState<string | null>(null)
  const [sheet, setSheet] = useState<AiringSheetTarget | null>(null)
  const [categories, setCategories] = useState<Map<string, string>>(new Map())
  // Pencere açılış anına göre sabitlenir (önbellek anahtarı her tikte değişmesin); gün dönünce yenilenir.
  const [base, setBase] = useState(() => Date.now())
  const win = useMemo(() => dayWindow(day, base), [day, base])
  useEffect(() => {
    if (day === 0 && now > dayWindow(0, base).to) setBase(Date.now())
  }, [now, day, base])

  const vars = useMemo(() => ({ from: new Date(win.from).toISOString(), to: new Date(win.to).toISOString(), category }), [win, category])
  const { data, error, loading, refetch } = useGql<GuideData, typeof vars>('Guide', vars, { ttlMs: 120_000 })

  // Kategori çipleri: görülen kanalların kategorileri (süzgeç seçilince liste daralmasın diye birikir).
  useEffect(() => {
    if (!data) return
    setCategories((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const c of data.channels)
        if (!next.has(c.category)) {
          next.set(c.category, c.categoryName)
          changed = true
        }
      return changed ? next : prev
    })
  }, [data])

  const open = (c: GuideChannel, a: GuideAiring) => {
    logEvent('click', { surface: 'rehber', action: 'yayin', entityId: a.unifiedEntityId, channelId: c.channelId }, null)
    setSheet({ airing: a, channel: channelRef(c), surface: 'rehber' })
  }

  return (
    <Page title="Rehber" className="gd-page">
      <div className="gd-controls cn-gutter-x">
        <div className="gd-chips" role="group" aria-label="Gün">
          {DAYS.map((d) => (
            <Chip key={d.day} selected={d.day === day} onClick={() => setDay(d.day)}>
              {d.label}
            </Chip>
          ))}
        </div>
        {categories.size > 1 && (
          <div className="gd-chips gd-chips--cats" role="group" aria-label="Kategori">
            <Chip selected={category === null} onClick={() => setCategory(null)}>
              Tümü
            </Chip>
            {[...categories].map(([key, name]) => (
              <Chip key={key} selected={category === key} onClick={() => setCategory(key)}>
                {name}
              </Chip>
            ))}
          </div>
        )}
      </div>
      {!data && error ? (
        <ErrorState size="page" title="Rehber yüklenemedi" onRetry={refetch} />
      ) : !data ? (
        <GuideSkeleton wide={wide} />
      ) : (
        <div className={cx('gd-body', loading && 'gd-body--loading')} aria-busy={loading || undefined}>
          {wide ? <GuideGrid channels={data.channels} win={win} onOpen={open} /> : <GuideList channels={data.channels} day={day} onOpen={open} />}
        </div>
      )}
      <AiringSheet target={sheet} onClose={() => setSheet(null)} />
    </Page>
  )
}
